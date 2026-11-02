//! Offline artwork library for every Scryfall printing imported by Arcana.
//!
//! The JSONL import is kept in SQLite. Image URLs are collected from its rows
//! in a worker thread, then the CDN bytes are downloaded to the existing pinned
//! Scryfall image cache. No image paths or databases are sent through JS IPC.
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use manabrew_art_cache::{key_from_url, PrintingArtProgress};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager};

static ART_RUNNING: AtomicBool = AtomicBool::new(false);
static ART_CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtLibraryStatus {
    pub running: bool,
    pub phase: String,
    pub variants: Vec<String>,
    pub total: u64,
    pub done: u64,
    pub downloaded: u64,
    pub already_cached: u64,
    pub failed: u64,
    pub bytes: u64,
    pub cancelled: bool,
    pub error: Option<String>,
}

static CURRENT_STATUS: OnceLock<Mutex<ArtLibraryStatus>> = OnceLock::new();

fn state() -> &'static Mutex<ArtLibraryStatus> {
    CURRENT_STATUS.get_or_init(|| Mutex::new(ArtLibraryStatus::default()))
}

fn snapshot() -> ArtLibraryStatus {
    state()
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default()
}

fn publish(app: &tauri::AppHandle, update: impl FnOnce(&mut ArtLibraryStatus)) {
    let latest = {
        let Ok(mut current) = state().lock() else {
            return;
        };
        update(&mut current);
        current.clone()
    };
    let _ = app.emit("arcana:art-progress", latest);
}

fn read_art_keys(database: &Connection, variants: &[String]) -> Result<Vec<String>, String> {
    let mut keys = HashSet::new();
    let mut query = database
        .prepare("SELECT record_json FROM printings")
        .map_err(|error| error.to_string())?;
    let records = query
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    for record in records {
        let text = record.map_err(|error| error.to_string())?;
        let card: Value = serde_json::from_str(&text)
            .map_err(|error| format!("Un registro de Scryfall no es válido: {error}"))?;
        let mut faces_found = false;
        if let Some(faces) = card.get("card_faces").and_then(Value::as_array) {
            for face in faces {
                if let Some(uris) = face.get("image_uris") {
                    faces_found = true;
                    include_uris(uris, variants, &mut keys);
                }
            }
        }
        if !faces_found {
            if let Some(uris) = card.get("image_uris") {
                include_uris(uris, variants, &mut keys);
            }
        }
    }

    let mut ordered: Vec<String> = keys.into_iter().collect();
    // Get usable card pictures first. If stopped, normal images will already
    // be available, even before special battlefield crops and large previews.
    ordered.sort_unstable_by(|a, b| {
        let priority = |key: &str| {
            if key.starts_with("normal/") {
                0
            } else if key.starts_with("border_crop/") {
                1
            } else if key.starts_with("art_crop/") {
                2
            } else if key.starts_with("large/") {
                3
            } else {
                4
            }
        };
        priority(a).cmp(&priority(b)).then_with(|| a.cmp(b))
    });
    Ok(ordered)
}

fn include_uris(uris: &Value, variants: &[String], keys: &mut HashSet<String>) {
    for variant in variants {
        if let Some(url) = uris.get(variant).and_then(Value::as_str) {
            if let Some(key) = key_from_url(url) {
                // Reject malformed keys at this boundary as well. The image
                // cache independently rejects traversal and invalid NTFS paths.
                if !key
                    .split('/')
                    .any(|part| part.is_empty() || part == "." || part == "..")
                {
                    keys.insert(key);
                }
            }
        }
    }
}

struct ArtJobGuard;
impl Drop for ArtJobGuard {
    fn drop(&mut self) {
        ART_RUNNING.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub fn arcana_art_status() -> ArtLibraryStatus {
    snapshot()
}

#[tauri::command]
pub fn arcana_art_cancel() {
    ART_CANCEL.store(true, Ordering::Release);
}

#[tauri::command]
pub async fn arcana_art_download(
    app: tauri::AppHandle,
    variants: Vec<String>,
) -> Result<ArtLibraryStatus, String> {
    let allowed = ["normal", "border_crop", "art_crop", "large"];
    let mut unique = HashSet::new();
    let variants: Vec<String> = variants
        .into_iter()
        .filter(|name| allowed.contains(&name.as_str()) && unique.insert(name.clone()))
        .collect();
    if !variants.iter().any(|value| value == "normal") {
        return Err("Selecciona al menos la imagen normal de cada carta.".to_string());
    }
    if ART_RUNNING.swap(true, Ordering::AcqRel) {
        return Err("Ya se están descargando ilustraciones.".to_owned());
    }
    let _guard = ArtJobGuard;
    ART_CANCEL.store(false, Ordering::Release);
    publish(&app, |state| {
        *state = ArtLibraryStatus {
            running: true,
            phase: "Leyendo las ediciones del catálogo…".to_string(),
            variants: variants.clone(),
            ..Default::default()
        };
    });

    let result: Result<PrintingArtProgress, String> = async {
        let scan_app = app.clone();
        let scan_variants = variants.clone();
        let keys = tauri::async_runtime::spawn_blocking(move || {
            let path = scan_app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?
                .join("arcana-scryfall.sqlite3");
            if !path.is_file() {
                return Err("Primero importa tu archivo Scryfall en «Colección».".to_string());
            }
            let database =
                Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(|error| error.to_string())?;
            read_art_keys(&database, &scan_variants)
        })
        .await
        .map_err(|error| error.to_string())??;

        if keys.is_empty() {
            return Err(
                "El catálogo importado no contiene enlaces de imágenes válidos.".to_owned(),
            );
        }
        publish(&app, |state| {
            state.total = keys.len() as u64;
            state.phase = "Descargando ilustraciones de Scryfall…".to_string();
        });
        let cache = crate::image_cache::cache()
            .ok_or_else(|| "No se pudo abrir la biblioteca de imágenes.".to_string())?;
        cache
            .download_printing_art(
                keys,
                || ART_CANCEL.load(Ordering::Acquire),
                |progress| {
                    publish(&app, |state| {
                        state.total = progress.total;
                        state.done = progress.done;
                        state.downloaded = progress.downloaded;
                        state.already_cached = progress.already_cached;
                        state.failed = progress.failed;
                        state.bytes = progress.bytes;
                        state.cancelled = progress.cancelled;
                    });
                },
            )
            .await
    }
    .await;

    match result {
        Ok(progress) => {
            publish(&app, |state| {
                state.running = false;
                state.cancelled = progress.cancelled;
                state.phase = if progress.cancelled {
                    "Descarga detenida; puedes continuar otro día.".to_string()
                } else if progress.failed > 0 {
                    "Descarga parcial; vuelve a pulsar para reintentar las imágenes pendientes."
                        .to_string()
                } else {
                    "Biblioteca completa para las calidades seleccionadas.".to_string()
                };
            });
            Ok(snapshot())
        }
        Err(error) => {
            publish(&app, |state| {
                state.running = false;
                state.error = Some(error.clone());
                state.phase =
                    "Descarga interrumpida. Las imágenes terminadas están guardadas.".into();
            });
            Err(error)
        }
    }
}

/// The cache folder is portable: copy its contents to another Arcana Arena
/// installation. This command opens only the application's own cache path.
#[tauri::command]
pub fn arcana_art_open_folder() -> Result<(), String> {
    let cache = crate::image_cache::cache()
        .ok_or_else(|| "La carpeta de imágenes no está disponible.".to_string())?;
    std::fs::create_dir_all(cache.root()).map_err(|error| error.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(cache.root())
            .spawn()
            .map_err(|error| format!("No se pudo abrir la carpeta: {error}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Esta versión es solo para Windows.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_each_printing_and_both_faces_without_duplicate_downloads() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE printings (record_json TEXT NOT NULL)")
            .unwrap();
        let cards = [
            serde_json::json!({
                "name": "Forest", "image_uris": {
                    "normal": "https://cards.scryfall.io/normal/front/a/forest1.jpg",
                    "large": "https://cards.scryfall.io/large/front/a/forest1.jpg"
                }
            }),
            serde_json::json!({
                "name": "Forest", "image_uris": {
                    "normal": "https://cards.scryfall.io/normal/front/b/forest2.jpg"
                }
            }),
            serde_json::json!({
                "name": "Double faced",
                "card_faces": [
                    {"image_uris": {"normal": "https://cards.scryfall.io/normal/front/c/front.jpg"}},
                    {"image_uris": {"normal": "https://cards.scryfall.io/normal/back/c/back.jpg"}}
                ]
            }),
        ];
        for record in cards.iter().chain(cards.iter()) {
            db.execute("INSERT INTO printings VALUES (?1)", [record.to_string()])
                .unwrap();
        }
        let keys = read_art_keys(&db, &["normal".to_string()]).unwrap();
        assert_eq!(keys.len(), 4);
        assert!(keys.iter().any(|key| key.ends_with("forest1.jpg")));
        assert!(keys.iter().any(|key| key.ends_with("forest2.jpg")));
        assert!(keys.iter().any(|key| key.ends_with("back.jpg")));
        assert!(!keys.iter().any(|key| key.starts_with("large/")));
    }

    #[test]
    fn rejects_non_scryfall_image_urls() {
        let mut keys = HashSet::new();
        include_uris(
            &serde_json::json!({
                "normal": "https://bad.example/images/card.jpg",
                "large": "https://cards.scryfall.io/large/front/a/card.jpg"
            }),
            &["normal".into(), "large".into()],
            &mut keys,
        );
        assert_eq!(keys.len(), 1);
        assert!(keys.contains("large/front/a/card.jpg"));
    }
}

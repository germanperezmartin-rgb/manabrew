//! Arcana Arena's personal, offline Scryfall printing catalog.
//!
//! The user selects a local .jsonl.gz (or .jsonl) export. Each line is parsed
//! and stored in an indexed SQLite database. No upload, network call or giant
//! JS-to-Rust IPC payload is involved. A failed import keeps the previous DB.
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use flate2::read::GzDecoder;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager};

const DATABASE_NAME: &str = "arcana-scryfall.sqlite3";
const IMPORT_NAME: &str = "arcana-scryfall-import.sqlite3";
static IMPORTING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub processed: u64,
    pub imported: u64,
    pub ignored: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogStats {
    pub printings: u64,
    pub unique_cards: u64,
    pub source: String,
    pub imported_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPage {
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub cards: Vec<Value>,
}

struct ImportGuard;
impl Drop for ImportGuard {
    fn drop(&mut self) {
        IMPORTING.store(false, Ordering::Release);
    }
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|err| err.to_string())
}

fn sqlite_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(root(app)?.join(DATABASE_NAME))
}

fn open_readonly(path: &Path) -> Result<Option<Connection>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map(Some)
        .map_err(|err| format!("No se pudo abrir el catálogo local: {err}"))
}

fn read_stats(db: &Connection) -> Result<CatalogStats, String> {
    let printings: u64 = db
        .query_row("SELECT COUNT(*) FROM printings", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let unique_cards: u64 = db
        .query_row(
            "SELECT COUNT(DISTINCT CASE WHEN oracle_id = '' THEN name ELSE oracle_id END) FROM printings",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let meta = |key: &str| -> String {
        db.query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default()
    };
    Ok(CatalogStats {
        printings,
        unique_cards,
        source: meta("source"),
        imported_at: meta("imported_at"),
    })
}

#[tauri::command]
pub fn arcana_catalog_stats(app: tauri::AppHandle) -> Result<CatalogStats, String> {
    let path = sqlite_path(&app)?;
    match open_readonly(&path)? {
        Some(db) => read_stats(&db),
        None => Ok(CatalogStats {
            printings: 0,
            unique_cards: 0,
            source: String::new(),
            imported_at: String::new(),
        }),
    }
}

fn open_source(path: &Path) -> Result<Box<dyn BufRead>, String> {
    let mut file = File::open(path).map_err(|err| err.to_string())?;
    let mut magic = [0_u8; 2];
    file.read_exact(&mut magic)
        .map_err(|_| "El archivo está vacío o incompleto".to_string())?;
    file.seek(SeekFrom::Start(0))
        .map_err(|err| err.to_string())?;
    if magic == [0x1f, 0x8b] {
        Ok(Box::new(BufReader::new(GzDecoder::new(file))))
    } else {
        Ok(Box::new(BufReader::new(file)))
    }
}

fn field<'a>(item: &'a Value, key: &str) -> &'a str {
    item.get(key).and_then(Value::as_str).unwrap_or("")
}

fn create_tables(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "PRAGMA journal_mode=DELETE;
         PRAGMA synchronous=NORMAL;
         CREATE TABLE printings (
           scryfall_id TEXT PRIMARY KEY NOT NULL,
           oracle_id TEXT NOT NULL,
           name TEXT COLLATE NOCASE NOT NULL,
           printed_name TEXT,
           set_code TEXT COLLATE NOCASE NOT NULL,
           collector_number TEXT COLLATE NOCASE NOT NULL,
           lang TEXT NOT NULL,
           released_at TEXT NOT NULL,
           record_json TEXT NOT NULL
         );
         CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )
    .map_err(|err| err.to_string())
}

fn import_database(
    source: &Path,
    destination: &Path,
    mut progress: impl FnMut(ImportProgress),
) -> Result<CatalogStats, String> {
    let input = open_source(source)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    if destination.exists() {
        fs::remove_file(destination).map_err(|err| err.to_string())?;
    }
    let mut db = Connection::open(destination).map_err(|err| err.to_string())?;
    create_tables(&db)?;
    let mut processed = 0_u64;
    let mut imported = 0_u64;
    let mut ignored = 0_u64;
    {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        {
            let mut statement = tx
                .prepare_cached(
                    "INSERT OR REPLACE INTO printings
                     (scryfall_id, oracle_id, name, printed_name, set_code,
                      collector_number, lang, released_at, record_json)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                )
                .map_err(|err| err.to_string())?;
            for line in input.lines() {
                let line = line.map_err(|err| format!("Error al leer Scryfall: {err}"))?;
                if line.trim().is_empty() {
                    continue;
                }
                processed += 1;
                let card: Value = serde_json::from_str(&line)
                    .map_err(|err| format!("JSON incorrecto en la línea {processed}: {err}"))?;
                let id = field(&card, "id");
                let name = field(&card, "name");
                let set = field(&card, "set");
                let number = field(&card, "collector_number");
                if id.is_empty() || name.is_empty() || set.is_empty() || number.is_empty() {
                    ignored += 1;
                    continue;
                }
                statement
                    .execute(params![
                        id,
                        field(&card, "oracle_id"),
                        name,
                        field(&card, "printed_name"),
                        set,
                        number,
                        field(&card, "lang"),
                        field(&card, "released_at"),
                        line,
                    ])
                    .map_err(|err| format!("No se pudo guardar la línea {processed}: {err}"))?;
                imported += 1;
                if processed % 1_500 == 0 {
                    progress(ImportProgress {
                        processed,
                        imported,
                        ignored,
                    });
                }
            }
        }
        if imported == 0 {
            return Err("El archivo no contiene impresiones válidas de Scryfall".to_owned());
        }
        let source_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Scryfall");
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('source', ?1)",
            [source_name],
        )
        .map_err(|err| err.to_string())?;
        let imported_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('imported_at', ?1)",
            [imported_at],
        )
        .map_err(|err| err.to_string())?;
        tx.commit().map_err(|err| err.to_string())?;
    }
    db.execute_batch(
        "CREATE INDEX printings_name ON printings(name);
         CREATE INDEX printings_oracle ON printings(oracle_id);
         CREATE INDEX printings_set_number ON printings(set_code, collector_number);
         ANALYZE;",
    )
    .map_err(|err| err.to_string())?;
    progress(ImportProgress {
        processed,
        imported,
        ignored,
    });
    read_stats(&db)
}

fn install_import(staging: &Path, destination: &Path) -> Result<(), String> {
    // Keep the working catalog until the replacement has been fully built.
    let backup = destination.with_extension("previous.sqlite3");
    if backup.exists() {
        fs::remove_file(&backup).map_err(|err| err.to_string())?;
    }
    let had_previous = destination.exists();
    if had_previous {
        fs::rename(destination, &backup).map_err(|err| err.to_string())?;
    }
    if let Err(err) = fs::rename(staging, destination) {
        if had_previous {
            let _ = fs::rename(&backup, destination);
        }
        return Err(format!("No se pudo activar el catálogo: {err}"));
    }
    if had_previous {
        let _ = fs::remove_file(&backup);
    }
    Ok(())
}

/// Opens the OS-native file picker. Accepts the user's original .jsonl.gz; it
/// does not require decompressing it or uploading it anywhere.
#[tauri::command]
pub async fn arcana_import_scryfall(app: tauri::AppHandle) -> Result<Option<CatalogStats>, String> {
    if IMPORTING.swap(true, Ordering::AcqRel) {
        return Err("Ya hay una importación en marcha".to_string());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = ImportGuard;
        let chosen = rfd::FileDialog::new()
            .set_title("Arcana Arena · importar catálogo Scryfall")
            .add_filter("Catálogo comprimido o JSONL", &["gz", "jsonl"])
            .pick_file();
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let dir = root(&app)?;
        fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
        let staging = dir.join(IMPORT_NAME);
        let destination = dir.join(DATABASE_NAME);
        let imported = import_database(&chosen, &staging, |value| {
            let _ = app.emit("arcana:import-progress", value);
        });
        if imported.is_err() {
            let _ = fs::remove_file(&staging);
        }
        let stats = imported?;
        install_import(&staging, &destination)?;
        Ok(Some(stats))
    })
    .await
    .map_err(|err| format!("No se pudo completar la importación: {err}"))?;
    result
}

fn collect_cards(
    db: &Connection,
    sql: &str,
    values: &[&dyn rusqlite::ToSql],
) -> Result<Vec<Value>, String> {
    let mut query = db.prepare(sql).map_err(|err| err.to_string())?;
    let iter = query
        .query_map(values, |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    iter.map(|record| {
        let text = record.map_err(|err| err.to_string())?;
        serde_json::from_str(&text).map_err(|err| err.to_string())
    })
    .collect()
}

fn like_pattern(search: &str) -> String {
    let escaped = search
        .trim()
        .replace('!', "!!")
        .replace('%', "!%")
        .replace('_', "!_");
    format!("%{escaped}%")
}

#[tauri::command]
pub async fn arcana_catalog_search(
    app: tauri::AppHandle,
    query: String,
    page: Option<u32>,
) -> Result<CatalogPage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let page = page.unwrap_or(1).clamp(1, 10_000);
        let page_size = 36_u32;
        let Some(db) = open_readonly(&sqlite_path(&app)?)? else {
            return Ok(CatalogPage {
                total: 0,
                page,
                page_size,
                cards: Vec::new(),
            });
        };
        let pattern = like_pattern(&query);
        let filter = "(name LIKE ?1 ESCAPE '!' COLLATE NOCASE
                        OR printed_name LIKE ?1 ESCAPE '!' COLLATE NOCASE
                        OR set_code LIKE ?1 ESCAPE '!' COLLATE NOCASE)";
        let total: u64 = db
            .query_row(
                &format!("SELECT COUNT(*) FROM printings WHERE {filter}"),
                [&pattern],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        let offset = i64::from(page - 1) * i64::from(page_size);
        let cards = collect_cards(
            &db,
            &format!(
                "SELECT record_json FROM printings WHERE {filter}
                 ORDER BY name COLLATE NOCASE, released_at DESC, scryfall_id
                 LIMIT ?2 OFFSET ?3"
            ),
            &[&pattern, &i64::from(page_size), &offset],
        )?;
        Ok(CatalogPage {
            total,
            page,
            page_size,
            cards,
        })
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn arcana_catalog_lookup(
    app: tauri::AppHandle,
    name: Option<String>,
    set_code: Option<String>,
    collector_number: Option<String>,
    id: Option<String>,
) -> Result<Option<Value>, String> {
    let Some(db) = open_readonly(&sqlite_path(&app)?)? else {
        return Ok(None);
    };
    let raw: Option<String> = if let Some(id) = id {
        db.query_row(
            "SELECT record_json FROM printings WHERE scryfall_id = ?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
    } else if let (Some(set), Some(number)) = (&set_code, &collector_number) {
        db.query_row(
            "SELECT record_json FROM printings
             WHERE set_code = ?1 COLLATE NOCASE AND collector_number = ?2 COLLATE NOCASE
             ORDER BY released_at DESC LIMIT 1",
            params![set, number],
            |r| r.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
    } else if let Some(name) = name {
        if let Some(set) = set_code {
            db.query_row(
                "SELECT record_json FROM printings
                 WHERE name = ?1 COLLATE NOCASE AND set_code = ?2 COLLATE NOCASE
                 ORDER BY released_at DESC LIMIT 1",
                params![name, set],
                |r| r.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?
        } else {
            db.query_row(
                "SELECT record_json FROM printings WHERE name = ?1 COLLATE NOCASE
                 ORDER BY released_at DESC LIMIT 1",
                [name],
                |r| r.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?
        }
    } else {
        None
    };
    raw.map(|raw| serde_json::from_str(&raw).map_err(|err| err.to_string()))
        .transpose()
}

#[tauri::command]
pub fn arcana_catalog_printings(
    app: tauri::AppHandle,
    oracle_id: String,
    page: Option<u32>,
) -> Result<CatalogPage, String> {
    let page = page.unwrap_or(1).clamp(1, 10_000);
    let page_size = 30_u32;
    let Some(db) = open_readonly(&sqlite_path(&app)?)? else {
        return Ok(CatalogPage {
            total: 0,
            page,
            page_size,
            cards: Vec::new(),
        });
    };
    let total: u64 = db
        .query_row(
            "SELECT COUNT(*) FROM printings WHERE oracle_id = ?1",
            [&oracle_id],
            |r| r.get(0),
        )
        .map_err(|err| err.to_string())?;
    let offset = i64::from(page - 1) * i64::from(page_size);
    let cards = collect_cards(
        &db,
        "SELECT record_json FROM printings WHERE oracle_id = ?1
         ORDER BY released_at DESC, set_code, collector_number LIMIT ?2 OFFSET ?3",
        &[&oracle_id, &i64::from(page_size), &offset],
    )?;
    Ok(CatalogPage {
        total,
        page,
        page_size,
        cards,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    #[test]
    fn imports_gzipped_multiple_printings_and_keeps_exact_editions() {
        let root = tempfile::tempdir().expect("tempdir");
        let input = root.path().join("default-cards.jsonl.gz");
        let output = root.path().join("catalog.sqlite3");
        {
            let file = File::create(&input).expect("create input");
            let mut compressed = GzEncoder::new(file, Compression::default());
            for line in [
                r#"{"object":"card","id":"first","oracle_id":"forest-id","name":"Forest","set":"m11","collector_number":"250","lang":"en","released_at":"2010-01-01"}"#,
                r#"{"object":"card","id":"second","oracle_id":"forest-id","name":"Forest","set":"blb","collector_number":"280","lang":"en","released_at":"2024-01-01"}"#,
                r#"{"object":"card","id":"third","oracle_id":"bolt-id","name":"Lightning Bolt","set":"m11","collector_number":"149","lang":"en","released_at":"2010-01-01"}"#,
            ] {
                writeln!(compressed, "{line}").expect("write record");
            }
            compressed.finish().expect("finish gzip");
        }
        let stats = import_database(&input, &output, |_| {}).expect("import");
        assert_eq!(stats.printings, 3);
        assert_eq!(stats.unique_cards, 2);
        let db = open_readonly(&output).expect("read db").expect("catalog");
        let number: String = db
            .query_row(
                "SELECT collector_number FROM printings WHERE set_code = 'blb'",
                [],
                |row| row.get(0),
            )
            .expect("exact edition");
        assert_eq!(number, "280");
        let forest: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM printings WHERE oracle_id = 'forest-id'",
                [],
                |row| row.get(0),
            )
            .expect("multiple printings");
        assert_eq!(forest, 2);
    }

    #[test]
    fn search_literal_escapes_wildcards() {
        assert_eq!(like_pattern("a%b_c!"), "%a!%b!_c!!%");
    }
}

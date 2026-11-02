import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Database, Download, FolderOpen, LoaderCircle, PauseCircle } from "lucide-react";
import {
  arcanaArtCancel,
  arcanaArtDownload,
  arcanaArtEstimateGiB,
  arcanaArtOpenFolder,
  arcanaArtStatus,
  type ArcanaArtLibraryStatus,
  type ArcanaArtQuality,
} from "@/lib/arcanaArt";

export function ArcanaArtLibrary({ printings }: { printings: number }) {
  const [status, setStatus] = useState<ArcanaArtLibraryStatus | null>(null);
  const [quality, setQuality] = useState<ArcanaArtQuality>("play");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let off: (() => void) | undefined;
    void arcanaArtStatus()
      .then((current) => {
        if (active) setStatus(current);
      })
      .catch(() => undefined);
    void listen<ArcanaArtLibraryStatus>("arcana:art-progress", (event) => {
      if (active) setStatus(event.payload);
    }).then((unlisten) => {
      if (active) off = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      off?.();
    };
  }, []);

  async function download() {
    if (starting || status?.running) return;
    setError("");
    setStarting(true);
    try {
      const finished = await arcanaArtDownload(quality);
      setStatus(finished);
    } catch (cause) {
      setError(String(cause));
      try {
        setStatus(await arcanaArtStatus());
      } catch {
        // Keep the last progress displayed when the app loses the job.
      }
    } finally {
      setStarting(false);
      setStopping(false);
    }
  }

  async function stop() {
    if (!status?.running) return;
    setStopping(true);
    try {
      await arcanaArtCancel();
    } catch (cause) {
      setStopping(false);
      setError(String(cause));
    }
  }

  async function openFolder() {
    try {
      await arcanaArtOpenFolder();
    } catch (cause) {
      setError(String(cause));
    }
  }

  const running = starting || Boolean(status?.running);
  const done = status?.done ?? 0;
  const total = status?.total ?? 0;
  const percent = total ? Math.min(100, Math.floor((done / total) * 100)) : 0;
  const count = (value: number) => value.toLocaleString("es-ES");
  const estimate = arcanaArtEstimateGiB(printings, quality);

  return (
    <section
      className="space-y-4 rounded-2xl border border-[#9e804a]/70 bg-[#17283c] p-5 sm:p-6"
      aria-label="Biblioteca de imágenes para jugar sin conexión"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Database className="h-7 w-7 text-[#e3b66c]" aria-hidden />
        <div className="flex-1">
          <h2 className="font-serif text-2xl font-semibold text-amber-50">
            Biblioteca de imágenes sin Internet
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            Descarga las ilustraciones de las {count(printings)} impresiones que ya importaste.
            Arcana las guarda en el ordenador. Puedes detener la descarga y continuar otro día.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="space-y-1.5 text-sm text-slate-200" htmlFor="arcana-art-quality">
          <span className="block font-semibold">¿Qué imágenes quieres guardar?</span>
          <select
            id="arcana-art-quality"
            value={quality}
            disabled={running}
            onChange={(event) => setQuality(event.target.value as ArcanaArtQuality)}
            className="min-h-11 w-full rounded-lg border border-slate-500 bg-[#0a1827] px-3 py-2 text-slate-100"
          >
            <option value="normal">Todas las cartas (menos espacio)</option>
            <option value="play">Todas las cartas y el tablero (recomendado)</option>
            <option value="complete">Todo, incluidas las imágenes ampliadas</option>
          </select>
        </label>
        <button
          type="button"
          disabled={running}
          onClick={() => void download()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#e3b66c] px-5 py-3 font-bold text-[#172232] disabled:opacity-50"
        >
          {running ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {running ? "Descargando…" : "Descargar o continuar"}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        Necesitas conexión durante la primera descarga y espacio libre en el disco. Tamaño
        orientativo: unos {estimate} GB o más, según las ediciones y las caras dobles. No necesitas
        importar de nuevo el archivo Scryfall.
      </p>

      {(total > 0 || running) && (
        <div
          className="space-y-2 rounded-lg border border-slate-600 bg-[#0b1827] p-4"
          role="status"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{status?.phase || "Preparando la descarga…"}</span>
            <strong className="tabular-nums text-amber-200">
              {total ? percent + "%" : "Preparando"}
            </strong>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-[#e3b66c] transition-all"
              style={{ width: percent + "%" }}
            />
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            {count(done)} de {count(total)} imágenes examinadas ·
            {count((status?.downloaded ?? 0) + (status?.alreadyCached ?? 0))} guardadas ·
            {count(status?.failed ?? 0)} pendientes por error
          </p>
          {running && (
            <button
              type="button"
              onClick={() => void stop()}
              disabled={stopping}
              className="inline-flex items-center gap-2 rounded-md border border-slate-500 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
            >
              <PauseCircle className="h-4 w-4" />
              {stopping ? "Deteniendo…" : "Detener y guardar lo descargado"}
            </button>
          )}
        </div>
      )}

      {(status?.error || error) && (
        <p
          role="alert"
          className="rounded-md border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200"
        >
          {error || status?.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-3">
        <p className="max-w-[620px] text-xs text-slate-400">
          Si cierras Arcana, las imágenes ya descargadas siguen en tu disco. Al volver a pulsar
          «Descargar o continuar», no se repiten.
        </p>
        <button
          type="button"
          onClick={() => void openFolder()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-md border border-slate-500 px-3 py-2 text-sm text-amber-100 disabled:opacity-50"
        >
          <FolderOpen className="h-4 w-4" /> Abrir carpeta de imágenes
        </button>
      </div>
    </section>
  );
}

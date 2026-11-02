import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileArchive,
  Layers3,
  LoaderCircle,
  Search,
  Sparkles,
  Swords,
} from "lucide-react";
import { ScryfallImg } from "@/components/ScryfallImg";
import { ArcanaArtLibrary } from "@/components/arcana/ArcanaArtLibrary";
import {
  arcanaCatalogPrintings,
  arcanaCatalogSearch,
  arcanaCatalogStats,
  arcanaImportScryfall,
  type ArcanaCatalogPage,
  type ArcanaCatalogStats,
  type ArcanaImportProgress,
} from "@/lib/arcanaCatalog";
import { ROUTES } from "@/lib/constants";
import type { ScryfallCard } from "@/types/scryfall";
import { scryfallToDeckCard } from "@/lib/scryfall.utils";
import { useDeckStore } from "@/stores/useDeckStore";
import { usePreferredPrintsStore } from "@/stores/usePreferredPrintsStore";

const NAVY = "#0c1626";
const GOLD = "#e3b66c";
const PANEL = "#111f30";

function artwork(card: ScryfallCard): string | undefined {
  return (
    card.image_uris?.normal ?? card.card_faces?.find((face) => face.image_uris)?.image_uris?.normal
  );
}

function shorten(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function SmallCard({
  card,
  active,
  onClick,
}: {
  card: ScryfallCard;
  active: boolean;
  onClick: () => void;
}) {
  const image = artwork(card);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      aria-label={`Ver ${card.name}, edición ${card.set_name}`}
      aria-pressed={active}
    >
      <div
        className="relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-lg border transition-transform group-hover:-translate-y-1"
        style={{
          borderColor: active ? GOLD : "#354358",
          background: card.colors?.includes("G")
            ? "linear-gradient(145deg,#254b40,#101b27)"
            : "linear-gradient(145deg,#2b3b51,#101925)",
        }}
      >
        {image && !imageFailed ? (
          <ScryfallImg
            src={image}
            alt={card.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <span className="mb-2 font-serif text-4xl" style={{ color: GOLD }}>
              ✧
            </span>
            <span className="absolute bottom-3 left-2 right-2 text-center text-xs font-semibold text-slate-200">
              {shorten(card.printed_name || card.name, 36)}
            </span>
          </>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100">{card.name}</p>
        <p className="truncate text-xs text-slate-400">
          {card.set?.toUpperCase()} · #{card.collector_number} · {card.lang?.toUpperCase()}
        </p>
      </div>
    </button>
  );
}

export default function ArcanaCatalogView() {
  const navigate = useNavigate();
  const savedDecks = useDeckStore((state) => state.savedDecks);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [stats, setStats] = useState<ArcanaCatalogStats | null>(null);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<ArcanaCatalogPage | null>(null);
  const [selected, setSelected] = useState<ScryfallCard | null>(null);
  const [printings, setPrintings] = useState<ArcanaCatalogPage | null>(null);
  const [printingPage, setPrintingPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ArcanaImportProgress | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStats(await arcanaCatalogStats());
    } catch (cause) {
      setError(`No se puede leer la biblioteca local: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim());
      setPage(1);
    }, 240);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!stats?.printings) {
      setResults(null);
      return;
    }
    let active = true;
    arcanaCatalogSearch(query, page)
      .then((next) => {
        if (active) setResults(next);
      })
      .catch((cause) => {
        if (active) setError(`No se pudieron buscar las cartas: ${String(cause)}`);
      });
    return () => {
      active = false;
    };
  }, [query, page, stats?.printings]);

  useEffect(() => {
    if (!selected?.oracle_id) {
      setPrintings(null);
      return;
    }
    let active = true;
    arcanaCatalogPrintings(selected.oracle_id, printingPage)
      .then((next) => {
        if (active) setPrintings(next);
      })
      .catch((cause) => {
        if (active) setError(`No se pudieron consultar las ediciones: ${String(cause)}`);
      });
    return () => {
      active = false;
    };
  }, [selected?.oracle_id, printingPage, stats?.printings]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen<ArcanaImportProgress>("arcana:import-progress", (event) => {
      setProgress(event.payload);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  async function startImport() {
    if (importing) return;
    setError("");
    setMessage("");
    setProgress(null);
    setImporting(true);
    try {
      const updated = await arcanaImportScryfall();
      if (updated) {
        setStats(updated);
        setResults(null);
        setSelected(null);
        setPrintings(null);
        setPage(1);
        setSearchText("");
        setQuery("");
        setMessage(
          `Importación completada: ${updated.printings.toLocaleString("es-ES")} impresiones en tu ordenador.`,
        );
      }
    } catch (cause) {
      setError(
        `No se ha importado el archivo: ${String(cause)}. El catálogo anterior permanece intacto.`,
      );
    } finally {
      setImporting(false);
      await refresh();
    }
  }

  async function copyForDeck() {
    if (!selected) return;
    const text = `1 ${selected.name} (${selected.set?.toUpperCase()}) ${selected.collector_number}`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copiada: ${text}. Puedes pegarla en Mis mazos → Importar desde texto.`);
    } catch {
      setMessage(`Copia esta línea para añadirla a tu mazo: ${text}`);
    }
  }

  function addSelectedToDeck() {
    if (!selected || !selectedDeckId) return;
    const saved = savedDecks.find((deck) => deck.id === selectedDeckId);
    if (!saved) {
      setError("Selecciona un mazo válido antes de añadir la carta.");
      return;
    }
    useDeckStore.getState().addCardToSavedDeck(saved.id, scryfallToDeckCard(selected));
    if (selected.oracle_id) {
      usePreferredPrintsStore.getState().setPreferredPrint(selected.oracle_id, {
        set: selected.set,
        collectorNumber: selected.collector_number,
        imageUrl: artwork(selected),
      });
    }
    setMessage(
      `Añadida una copia de ${selected.name} (${selected.set.toUpperCase()} #${selected.collector_number}) a «${saved.deck.name}».`,
    );
  }

  const totalPages = results ? Math.max(1, Math.ceil(results.total / results.pageSize)) : 1;
  const printPages = printings ? Math.max(1, Math.ceil(printings.total / printings.pageSize)) : 1;
  const selectedImage = selected ? artwork(selected) : undefined;
  const printCards = useMemo(() => printings?.cards ?? [], [printings]);

  return (
    <main
      className="h-full overflow-y-auto px-4 py-6 text-slate-100 sm:px-8 lg:px-10"
      style={{ background: "radial-gradient(circle at 80% 0%,#182738 0%,#09121d 60%)" }}
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
              El archivo de los planos
            </p>
            <h1 className="mt-1 font-serif text-4xl font-semibold text-amber-50">La colección</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Tus cartas y todas sus ediciones, guardadas en el ordenador. Busca sin conexión,
              consulta cada impresión y prepara tus mazos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void startImport()}
            disabled={importing}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-2.5 font-bold text-slate-950 disabled:opacity-60"
            style={{ background: GOLD }}
          >
            {importing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileArchive className="h-4 w-4" />
            )}
            {importing
              ? "Importando cartas…"
              : stats?.printings
                ? "Actualizar mi catálogo"
                : "Importar Scryfall .jsonl.gz"}
          </button>
        </header>

        {importing && (
          <div
            role="status"
            className="rounded-lg border border-amber-400/50 bg-amber-300/10 p-4 text-sm text-amber-100"
          >
            Leyendo y guardando tus ediciones en el disco.
            {progress && (
              <strong className="ml-2">
                {progress.imported.toLocaleString("es-ES")} cartas importadas
              </strong>
            )}
            <p className="mt-1 text-xs text-amber-200/80">
              No cierres el programa hasta que finalice. El archivo anterior se conserva si ocurre
              algún error.
            </p>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {message && (
          <div
            role="status"
            className="rounded-lg border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100"
          >
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span className="rounded-full border border-slate-600 px-3 py-2">
            <Database className="mr-2 inline h-3.5 w-3.5" />
            {(stats?.printings ?? 0).toLocaleString("es-ES")} impresiones locales
          </span>
          <span className="rounded-full border border-slate-600 px-3 py-2">
            {(stats?.uniqueCards ?? 0).toLocaleString("es-ES")} identidades distintas
          </span>
          {stats?.source && <span className="truncate text-slate-400">Origen: {stats.source}</span>}
          <span className="ml-auto flex items-center gap-1 text-emerald-300">
            <Check className="h-4 w-4" /> Base de datos local
          </span>
        </div>

        {stats && stats.printings > 0 && <ArcanaArtLibrary printings={stats.printings} />}

        {!stats?.printings ? (
          <div
            className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl border border-slate-700 px-6 py-14 text-center"
            style={{ background: PANEL }}
          >
            <span className="font-serif text-7xl" style={{ color: GOLD }}>
              ✧
            </span>
            <h2 className="font-serif text-3xl text-amber-50">Tus cartas, en un solo lugar</h2>
            <p className="max-w-xl text-slate-300">
              Pulsa «Importar Scryfall», elige tu archivo <code>default-cards-*.jsonl.gz</code> y
              Arcana lo organizará por nombre, colección y número, sin subirlo a Internet.
            </p>
            <button
              type="button"
              onClick={() => void startImport()}
              disabled={importing}
              className="rounded-lg px-6 py-3 font-bold text-slate-950"
              style={{ background: GOLD }}
            >
              Elegir mi archivo de cartas
            </button>
            <p className="text-xs text-slate-400">
              El archivo de datos no incluye las fotografías: las imágenes que no hayas descargado
              necesitarán conexión.
            </p>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(285px,340px)]">
            <section
              className="min-w-0 space-y-4 rounded-2xl border border-slate-700/70 p-4"
              style={{ background: NAVY }}
            >
              <label className="relative block">
                <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  aria-label="Buscar por nombre o edición"
                  placeholder="Busca una carta, una edición o un código de colección…"
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/60 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none focus:border-amber-300"
                />
              </label>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{results?.total.toLocaleString("es-ES") ?? "…"} impresiones encontradas</span>
                <span>
                  Página {page} de {totalPages}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
                {results?.cards.map((card) => (
                  <SmallCard
                    key={card.id}
                    card={card}
                    active={selected?.id === card.id}
                    onClick={() => {
                      setSelected(card);
                      setPrintingPage(1);
                    }}
                  />
                ))}
              </div>
              {results?.cards.length === 0 && (
                <p className="py-10 text-center text-slate-400">
                  No hay cartas que coincidan con la búsqueda.
                </p>
              )}
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  className="flex items-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </button>
                <span className="text-sm text-slate-400">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className="flex items-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm disabled:opacity-30"
                >
                  Siguiente <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </section>

            <aside
              className="min-w-0 space-y-3 rounded-xl border border-slate-700 p-4 lg:sticky lg:top-3"
              style={{ background: PANEL }}
            >
              {!selected ? (
                <div className="space-y-3 py-10 text-center">
                  <span className="font-serif text-6xl" style={{ color: GOLD }}>
                    ◇
                  </span>
                  <h2 className="font-serif text-xl text-amber-50">Explora tus impresiones</h2>
                  <p className="text-sm text-slate-400">
                    Selecciona una carta de la cuadrícula para consultar sus detalles y todas las
                    ediciones que hayas importado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mx-auto flex aspect-[5/6] max-h-60 items-center justify-center overflow-hidden rounded-lg bg-slate-800/60">
                    {selectedImage ? (
                      <ScryfallImg
                        key={selectedImage}
                        src={selectedImage}
                        alt={selected.name}
                        className="h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="font-serif text-7xl" style={{ color: GOLD }}>
                        ✧
                      </span>
                    )}
                  </div>
                  <h2 className="font-serif text-2xl font-semibold text-amber-50">
                    {selected.name}
                  </h2>
                  <p className="text-sm text-slate-400">{selected.type_line}</p>
                  <p className="text-sm font-semibold" style={{ color: GOLD }}>
                    {selected.mana_cost || ""}
                  </p>
                  <p className="whitespace-pre-line rounded-md border border-slate-700 bg-slate-950/40 p-3 text-sm leading-relaxed text-slate-200">
                    {selected.printed_text ||
                      selected.oracle_text ||
                      selected.card_faces
                        ?.map((face) => face.oracle_text)
                        .filter(Boolean)
                        .join("\n") ||
                      "Sin texto adicional."}
                  </p>
                  <p className="text-xs text-slate-400">
                    {selected.set_name} · {selected.set?.toUpperCase()} #{selected.collector_number}{" "}
                    · {selected.lang?.toUpperCase()}
                  </p>
                  <div className="space-y-2 rounded-lg border border-[#50647c] bg-[#0b1726] p-3">
                    <label
                      htmlFor="arcana-target-deck"
                      className="block text-xs font-semibold text-amber-100"
                    >
                      Añadir esta edición a un mazo
                    </label>
                    <select
                      id="arcana-target-deck"
                      value={selectedDeckId}
                      onChange={(event) => setSelectedDeckId(event.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-[#15283b] px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="">Selecciona tu mazo…</option>
                      {savedDecks.map((saved) => (
                        <option key={saved.id} value={saved.id}>
                          {saved.deck.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addSelectedToDeck}
                      disabled={!selectedDeckId}
                      className="w-full rounded-md bg-[#e3b66c] px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
                    >
                      Añadir 1 copia al mazo
                    </button>
                    {savedDecks.length === 0 && (
                      <p className="text-xs text-slate-400">Primero crea un mazo en «Mis mazos».</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyForDeck()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/60 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-400/10"
                  >
                    <Copy className="h-4 w-4" /> Copiar para mi mazo
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.DECK_EDITOR)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-500 px-4 py-2.5 text-sm text-slate-100"
                  >
                    <Layers3 className="h-4 w-4" /> Ir a mis mazos
                  </button>
                  <div className="border-t border-slate-700 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-100">Otras ediciones</h3>
                      <span className="text-xs text-slate-400">
                        {printings?.total ?? 0} registradas
                      </span>
                    </div>
                    {printCards.length > 0 && (
                      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                        {printCards.map((card) => (
                          <button
                            type="button"
                            key={card.id}
                            onClick={() => setSelected(card)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-700/60 p-2 text-left text-xs hover:border-amber-500/70"
                            style={card.id === selected.id ? { borderColor: GOLD } : undefined}
                          >
                            <span className="min-w-0 truncate">
                              {card.set_name} · {card.lang?.toUpperCase()}
                            </span>
                            <span className="shrink-0 text-slate-400">
                              #{card.collector_number}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {printPages > 1 && (
                      <div className="mt-2 flex justify-between">
                        <button
                          type="button"
                          disabled={printingPage <= 1}
                          onClick={() => setPrintingPage((p) => p - 1)}
                          className="text-xs text-amber-200 disabled:opacity-30"
                        >
                          ← Anterior
                        </button>
                        <span className="text-xs text-slate-400">
                          {printingPage} / {printPages}
                        </span>
                        <button
                          type="button"
                          disabled={printingPage >= printPages}
                          onClick={() => setPrintingPage((p) => p + 1)}
                          className="text-xs text-amber-200 disabled:opacity-30"
                        >
                          Siguiente →
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-4 border-t border-slate-700/70 pt-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> Reglas automáticas: motor Forge
          </span>
          <span>Impresiones de Scryfall: catálogo informativo, no cambia las reglas de Forge.</span>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PLAY_OFFLINE_CONSTRUCTED)}
            className="ml-auto inline-flex items-center gap-1 text-amber-200"
          >
            <Swords className="h-3.5 w-3.5" /> Jugar contra la IA
          </button>
          <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden />
        </footer>
      </div>
    </main>
  );
}

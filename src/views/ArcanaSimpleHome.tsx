import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, LoaderCircle } from "lucide-react";
import { useOwnedDecks } from "@/hooks/useOwnedDecks";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { deckArtUrls, preseedCardArt, variantsForStyles } from "@/api/cardArtCache";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, BookOpen, Database, Layers3, Swords, Users } from "lucide-react";
import { arcanaCatalogStats, type ArcanaCatalogStats } from "@/lib/arcanaCatalog";
import { ROUTES } from "@/lib/constants";

const GOLD = "#e5ba74";

function Feature({
  title,
  description,
  onClick,
  icon: Icon,
}: {
  title: string;
  description: string;
  onClick: () => void;
  icon: typeof Swords;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 rounded-xl border border-[#33455e] bg-[#142237] p-6 text-left transition-colors hover:border-[#dcb16d] hover:bg-[#1a2b40]"
    >
      <div className="flex items-start justify-between">
        <Icon className="h-6 w-6 text-[#e5ba74]" />
        <ArrowUpRight className="h-4 w-4 text-[#e5ba74] transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-[#f6f1e8]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
    </button>
  );
}

export default function ArcanaSimpleHome() {
  const navigate = useNavigate();
  const decks = useOwnedDecks();
  const style = usePreferencesStore((store) => store.battlefieldCardStyle);
  const [downloadingArt, setDownloadingArt] = useState(false);
  const [artStatus, setArtStatus] = useState("");
  async function downloadArt() {
    if (downloadingArt) return;
    const urls = [...new Set(decks.flatMap((saved) => deckArtUrls(saved.deck, variantsForStyles([style]))))];
    if (!urls.length) {
      toast.info("Guarda al menos un mazo para descargar sus imágenes.");
      return;
    }
    setDownloadingArt(true);
    setArtStatus(`Descargando ${urls.length} imágenes de tus mazos…`);
    try {
      const result = await preseedCardArt(urls);
      setArtStatus(`${result.fetched + result.alreadyCached} imágenes disponibles · ${result.failed} fallidas.`);
      toast.success("Descarga terminada. Desconecta Internet y comprueba las cartas.");
    } catch (error) {
      setArtStatus(`Error al descargar: ${String(error)}`);
    } finally {
      setDownloadingArt(false);
    }
  }
  const [catalog, setCatalog] = useState<ArcanaCatalogStats | null>(null);
  useEffect(() => {
    let mounted = true;
    void arcanaCatalogStats()
      .then((result) => {
        if (mounted) setCatalog(result);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  const hasCatalog = Boolean(catalog?.printings);

  return (
    <main
      className="h-full overflow-y-auto px-4 py-7 sm:px-8 lg:px-10"
      style={{ background: "linear-gradient(140deg,#0e1828 0%,#080f19 60%,#101d2b 100%)" }}
    >
      <div className="mx-auto max-w-[1450px] space-y-8">
        <section className="grid min-h-[410px] items-center overflow-hidden rounded-[20px] border border-[#324762] bg-[#101d30] lg:grid-cols-[1fr_0.75fr]">
          <div className="p-7 sm:p-10 lg:p-14">
            <p className="text-xs font-bold uppercase tracking-[0.32em]" style={{ color: GOLD }}>
              Arcana Arena · Tu juego de cartas
            </p>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.12] text-[#faf1df] sm:text-5xl lg:text-6xl">
              Más clara.
              <br />
              Más pausada.
              <br />
              Más estratégica.
            </h1>
            <p className="mt-6 max-w-[620px] text-base leading-relaxed text-slate-300">
              Juega Magic con las reglas automáticas de Forge, prepara tus propios mazos y explora
              todas las ediciones de tus cartas desde el ordenador.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate(ROUTES.PLAY_OFFLINE_CONSTRUCTED)}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg px-6 py-3 font-bold text-[#101a27] shadow-lg"
                style={{ background: GOLD }}
              >
                <Swords className="h-5 w-5" /> Jugar contra la IA
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.ARCANA_CATALOG)}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-[#51627c] px-6 py-3 font-semibold text-slate-100 hover:bg-slate-700/40"
              >
                <Database className="h-5 w-5" />{" "}
                {hasCatalog ? "Ver mi colección" : "Importar mis cartas"}
              </button>
            </div>
          </div>
          <div
            className="relative hidden min-h-[430px] items-center justify-center lg:flex"
            style={{ background: "radial-gradient(circle,#263a41 0%,#101e2d 45%,#0e1a2a 75%)" }}
          >
            <div className="absolute h-80 w-80 rounded-full border border-[#b9955b]/70" />
            <div className="absolute h-64 w-64 rotate-[-31deg] rounded-3xl border border-[#71939b]/60" />
            <div className="absolute h-[23rem] w-[23rem] rounded-full border border-dashed border-[#af935d]/40" />
            <span
              className="relative z-10 font-serif text-[110px]"
              style={{ color: GOLD }}
              aria-hidden
            >
              ✧
            </span>
          </div>
        </section>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-[#f8f0e1]">
              Explora Arcana Arena
            </h2>
            <p className="mt-1 text-sm text-slate-400">Cuatro destinos, sin menús innecesarios.</p>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.26em]" style={{ color: GOLD }}>
            DUELO A TU RITMO
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Feature
            icon={Swords}
            title="Duelo contra la IA"
            description="Elige dos mazos y juega con el motor auténtico de Forge."
            onClick={() => navigate(ROUTES.PLAY_OFFLINE_CONSTRUCTED)}
          />
          <Feature
            icon={Layers3}
            title="Mis mazos"
            description="Crea mazos, importa listas y prepara la siguiente partida."
            onClick={() => navigate(ROUTES.DECK_EDITOR)}
          />
          <Feature
            icon={Database}
            title="Mi colección"
            description={
              hasCatalog
                ? `${catalog?.printings.toLocaleString("es-ES")} impresiones descargadas en este equipo.`
                : "Importa tu archivo Scryfall con todas las ediciones."
            }
            onClick={() => navigate(ROUTES.ARCANA_CATALOG)}
          />
          <Feature
            icon={Users}
            title="Dos jugadores"
            description="Abre las opciones de mesa para jugar con otra persona."
            onClick={() => navigate(ROUTES.LOBBY)}
          />
        </div>

        <div className="rounded-xl border border-amber-500/50 bg-[#1e2b3d] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-serif text-xl text-[#f8f0e1]">Imágenes para jugar sin Internet</h3>
              <p className="mt-1 text-sm text-slate-300">Con Internet, descarga las ilustraciones de tus mazos una sola vez.</p>
              {artStatus && <p role="status" className="mt-2 text-sm text-amber-200">{artStatus}</p>}
            </div>
            <button type="button" onClick={() => void downloadArt()} disabled={downloadingArt}
              className="flex items-center gap-2 rounded-lg bg-[#e5ba74] px-5 py-3 font-bold text-slate-950 disabled:opacity-60">
              {downloadingArt ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloadingArt ? "Descargando…" : "Descargar imágenes de mis mazos"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-[#4a6d6a] bg-[#132d34] p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em]" style={{ color: GOLD }}>
              Motor real · Cartas locales
            </p>
            <h3 className="mt-2 font-serif text-xl text-slate-100">
              Forge para las reglas. Scryfall para las ediciones.
            </h3>
            <p className="mt-2 max-w-[800px] text-sm leading-relaxed text-slate-300">
              Importar las cartas permite buscarlas y preparar mazos sin Internet. Las imágenes se
              descargan por separado cuando quieras guardarlas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.ARCANA_CATALOG)}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-bold text-[#12202b]"
            style={{ background: GOLD }}
          >
            <BookOpen className="h-4 w-4" /> Abrir la colección
          </button>
        </div>

        <footer className="flex justify-between gap-3 border-t border-slate-700/50 py-4 text-xs text-slate-500">
          <span>Arcana Arena · Edición de escritorio</span>
          <span>
            {catalog?.printings
              ? `${catalog.printings.toLocaleString("es-ES")} impresiones de Scryfall en tu equipo`
              : "Importa un catálogo para comenzar"}
          </span>
        </footer>
      </div>
    </main>
  );
}

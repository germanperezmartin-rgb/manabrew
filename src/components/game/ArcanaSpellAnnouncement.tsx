import type { FlashItem } from "@/components/game/game.types";
import { GeneratedCardImage } from "@/components/game/GeneratedCardImage";
import { ManaSymbols } from "@/components/game/ManaSymbols";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { useEffect, useState } from "react";

const HISTORY_LIMIT = 12;
type HistoryEntry = { id: string; name: string; kind: string; text: string };
let recentCards: HistoryEntry[] = [];

export function ArcanaSpellAnnouncement({
  flash,
  onContinue,
}: {
  flash: Extract<FlashItem, { kind: "card" }>;
  onContinue: () => void;
}) {
  const { card } = flash;
  const duration = usePreferencesStore((state) => state.flashDurationMs);
  const [history, setHistory] = useState<HistoryEntry[]>(() => recentCards);
  const [showHistory, setShowHistory] = useState(false);
  const text = flash.effectText || card.text || "Consulta la pila para ver el efecto y sus objetivos.";
  const kind = flash.category === "ability" ? "Habilidad activada o disparada" : flash.category === "land" ? "Tierra jugada" : "Hechizo lanzado";

  useEffect(() => {
    if (card.isFaceDown || !card.identity.name) return;
    const entry = { id: card.id + ":" + Date.now(), name: card.identity.name, kind, text };
    recentCards = [entry, ...recentCards].slice(0, HISTORY_LIMIT);
    setHistory(recentCards);
  }, [card.id, card.identity.name, card.isFaceDown, kind, text]);

  if (card.isFaceDown || !card.identity.name) return null;
  return (
    <section
      role="dialog"
      aria-label="Presentación de carta jugada"
      className="absolute left-1/2 top-[calc(2rem+var(--safe-area-inset-top))] z-[9000] flex max-h-[min(85vh,43rem)] w-[min(94vw,38rem)] -translate-x-1/2 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-2xl backdrop-blur-md"
    >
      <p className="text-ui-meta font-bold uppercase tracking-wider text-primary">{kind}</p>
      <div className="flex min-h-0 items-start gap-4">
        <div className="aspect-[5/7] w-[min(38vw,15rem)] shrink-0 overflow-hidden rounded-lg bg-muted">
          <GeneratedCardImage card={card} className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="text-lg font-bold leading-tight sm:text-2xl">{card.identity.name}</h2>
          {card.manaCost && <ManaSymbols cost={card.manaCost} size="sm" />}
          <p className="text-ui-meta text-muted-foreground">{card.types?.join(" · ")}</p>
          <p className="whitespace-pre-line break-words text-sm leading-relaxed sm:text-base">{text}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-ui-meta text-muted-foreground">
          {duration < 0 ? "Pausa hasta continuar" : `Presentación: ${duration / 1000} segundos`}
        </span>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Ocultar historial" : "Historial"}
          </button>
          <button type="button" className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground" onClick={onContinue}>
            Continuar
          </button>
        </div>
      </div>
      {showHistory && (
        <ol className="max-h-40 space-y-2 overflow-y-auto border-t border-border pt-2 text-sm">
          {history.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.kind}: {entry.name}</strong>
              <p className="line-clamp-2 text-muted-foreground">{entry.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

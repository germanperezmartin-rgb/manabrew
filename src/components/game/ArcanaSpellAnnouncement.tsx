import type { CardDto } from "@/protocol/game";
import { GeneratedCardImage } from "@/components/game/GeneratedCardImage";
import { ManaSymbols } from "@/components/game/ManaSymbols";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

export function ArcanaSpellAnnouncement({ card }: { card: CardDto }) {
  const duration = usePreferencesStore((state) => state.flashDurationMs);
  if (card.isFaceDown || !card.identity.name) return null;
  return (
    <aside
      aria-live="polite"
      aria-label="Carta jugada"
      className="pointer-events-none absolute left-1/2 top-[calc(3rem+var(--safe-area-inset-top))] z-[9000] flex max-h-[min(72vh,38rem)] w-[min(92vw,31rem)] -translate-x-1/2 gap-3 overflow-hidden rounded-2xl border border-border bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur-md sm:gap-4 sm:p-4"
    >
      <div className="aspect-[5/7] w-[min(34vw,12rem)] shrink-0 overflow-hidden rounded-lg bg-muted">
        <GeneratedCardImage card={card} className="h-full w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
        <p className="text-ui-meta font-bold uppercase tracking-wider text-primary">Carta jugada</p>
        <h2 className="text-lg font-bold leading-tight sm:text-2xl">{card.identity.name}</h2>
        {card.manaCost && <ManaSymbols cost={card.manaCost} size="sm" />}
        <p className="text-ui-meta text-muted-foreground">{card.types?.join(" · ")}</p>
        <p className="min-h-0 overflow-y-auto whitespace-pre-line text-sm leading-relaxed sm:text-base">
          {card.text || "Consulta la pila para ver el efecto y sus objetivos."}
        </p>
        <p className="mt-auto text-ui-meta text-muted-foreground">
          Se muestra durante {Math.round(duration / 100) / 10} segundos.
          Puedes modificarlo en los ajustes de partida.
        </p>
      </div>
    </aside>
  );
}

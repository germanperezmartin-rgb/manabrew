import { DeckGridCard } from "@/components/deck/DeckGridCard";
import { CollapsibleDeckShelf } from "@/components/play/CollapsibleDeckShelf";
import { DECK_SHELF_CARD_CLASS, DeckShelfRow } from "@/components/play/DeckShelfRow";
import type { PresetDeck } from "@/lib/presetDecks";
import { useArcanaSpanish } from "@/hooks/useArcanaSpanish";
interface PresetDeckShelfProps {
  decks: PresetDeck[];
  loaded: boolean;
  open: boolean;
  pendingDeckId: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenDeck: (deck: PresetDeck) => void;
  onPlayDeck: (deck: PresetDeck) => void;
}
export function PresetDeckShelf({
  decks,
  loaded,
  open,
  pendingDeckId,
  onOpenChange,
  onOpenDeck,
  onPlayDeck,
}: PresetDeckShelfProps) {
  const spanish = useArcanaSpanish();
  return (
    <CollapsibleDeckShelf
      title={spanish ? "Mazos iniciales" : "Preset decks"}
      count={loaded ? decks.length : spanish ? "Cargando…" : "Loading…"}
      open={open}
      onOpenChange={onOpenChange}
    >
      {decks.length > 0 ? (
        <DeckShelfRow label={spanish ? "Mazos iniciales" : "Preset decks"}>
          {decks.map((preset) => {
            const presetId = preset.id ?? preset.name;
            return (
              <div key={`preset:${presetId}`} className={DECK_SHELF_CARD_CLASS}>
                <DeckGridCard
                  deck={{ id: presetId, deck: preset, savedAt: 0 }}
                  onOpen={() => onOpenDeck(preset)}
                  onPlay={() => onPlayDeck(preset)}
                  badge={spanish ? "Mazo oficial" : "Official preset"}
                  engines={preset.engines}
                  playing={pendingDeckId === presetId}
                  playDisabled={pendingDeckId !== null}
                  readOnly
                />
              </div>
            );
          })}
        </DeckShelfRow>
      ) : (
        <p className="px-2 text-ui-meta italic text-muted-foreground">
          {loaded ? (spanish ? "No hay mazos iniciales disponibles." : "No preset decks are available.") : (spanish ? "Cargando mazos iniciales…" : "Loading preset decks…")}
        </p>
      )}
    </CollapsibleDeckShelf>
  );
}

import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getTopBarNav, isNavDestinationActive } from "./navDestinations";
import { useAuthStore } from "@/stores/useAuthStore";
import { useArcanaSpanish } from "@/hooks/useArcanaSpanish";

interface TopBarNavProps {
  disabled?: boolean;
}

export function TopBarNav({ disabled = false }: TopBarNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const signedIn = useAuthStore((state) => state.status === "signedIn");
  const spanish = useArcanaSpanish();
  const translations: Record<string, string> = {
    Singleplayer: "Un jugador",
    Multiplayer: "Multijugador",
    "My Decks": "Mis mazos",
    Community: "Comunidad",
    "My Collection": "Mi colección",
    "Card Search": "Buscar cartas",
    "Life Tracker": "Contador de vidas",
  };
  const direct = getTopBarNav(signedIn).map((entry) => ({
    ...entry,
    label: spanish ? (translations[entry.label] ?? entry.label) : entry.label,
  }));

  function isActive(to: string) {
    return isNavDestinationActive(to, location.pathname);
  }

  return (
    <nav aria-label={spanish ? "Navegación principal" : "Primary"} className="hidden items-center gap-0.5 md:pointer-fine:flex">
      {direct.map(({ to, label, icon: Icon }) => (
        <Button
          key={to}
          size="sm"
          variant={isActive(to) ? "selected" : "ghost"}
          aria-current={isActive(to) ? "page" : undefined}
          aria-label={label}
          title={label}
          className="min-h-10 gap-2 px-3 text-ui-label touch:min-h-11 touch:min-w-11"
          disabled={disabled}
          onClick={() => navigate(to)}
        >
          <Icon className="h-5 w-5" />
          <span className="hidden xl:inline">{label}</span>
        </Button>
      ))}
    </nav>
  );
}

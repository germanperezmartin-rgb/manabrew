import { resolveLanguagePreference } from "@/i18n/locales";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

export function useArcanaSpanish(): boolean {
  return usePreferencesStore((state) => resolveLanguagePreference(state.appLanguage) === "es");
}

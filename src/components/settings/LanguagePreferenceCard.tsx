import { PreferenceCard } from "@/components/settings/PreferenceCard";
import { AppSelect, AppSelectOption } from "@/components/ui/AppSelect";
import { APP_LOCALES, resolveLanguagePreference, type AppLanguagePreference } from "@/i18n/locales";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { useArcanaSpanish } from "@/hooks/useArcanaSpanish";

export function LanguagePreferenceCard() {
  const spanish = useArcanaSpanish();
  const appLanguage = usePreferencesStore((state) => state.appLanguage);
  const setAppLanguage = usePreferencesStore((state) => state.setAppLanguage);
  const activeLocale = resolveLanguagePreference(appLanguage);

  return (
    <PreferenceCard
      title={spanish ? "Idioma" : "Language"}
      description={spanish ? "Cambia los menús y las ediciones cuando hay traducciones disponibles." : "Changes menus and card printings when a translation is available."}
      value={APP_LOCALES[activeLocale].label}
    >
      <AppSelect
        value={appLanguage}
        onValueChange={(value) => setAppLanguage(value as AppLanguagePreference)}
        aria-label={spanish ? "Idioma de la aplicación" : "Application language"}
        className="min-h-9 w-full rounded-md border border-input bg-background px-2 text-ui-label touch:min-h-11"
      >
        <AppSelectOption value="system">{spanish ? "Idioma del sistema" : "Use system language"}</AppSelectOption>
        {Object.entries(APP_LOCALES).map(([locale, { label }]) => (
          <AppSelectOption key={locale} value={locale}>
            {label}
          </AppSelectOption>
        ))}
      </AppSelect>
      {appLanguage === "system" && (
        <p className="text-ui-meta text-muted-foreground">
          {spanish ? "Idioma actual:" : "Currently using"} {APP_LOCALES[activeLocale].label}
        </p>
      )}
    </PreferenceCard>
  );
}

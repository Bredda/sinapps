import { Label } from "@sinapps/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sinapps/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@sinapps/ui/components/toggle-group";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages.js";
import { getLocale, type Locale, locales, setLocale } from "@/paraglide/runtime.js";
import { getSettings, savePreferences } from "@/server/preferences.functions";

export const Route = createFileRoute("/_app/settings")({
  loader: () => getSettings(),
  component: Settings,
});

const LOCALE_LABELS: Record<Locale, string> = { en: "English", fr: "Français" };
const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function Settings() {
  const { preferences, models } = Route.useLoaderData();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // next-themes only knows the theme after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const changeLocale = async (locale: Locale) => {
    await savePreferences({ data: { locale } });
    setLocale(locale); // reloads the page in the new locale
  };

  const changeTheme = async (value: Theme) => {
    // Save and refresh the route context first: applying the theme earlier would make
    // PreferencesSync briefly restore the previous (still stored) theme.
    await savePreferences({ data: { theme: value } });
    await router.invalidate();
    setTheme(value);
  };

  const changeModel = async (defaultModel: string) => {
    await savePreferences({ data: { defaultModel } });
    await router.invalidate();
  };

  const tierLabel: Record<(typeof models)[number]["tier"], string> = {
    premium: m.model_tier_premium(),
    balanced: m.model_tier_balanced(),
    fast: m.model_tier_fast(),
    budget: m.model_tier_budget(),
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 p-6">
      <h1 className="font-semibold text-xl">{m.settings_title()}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="locale">{m.settings_language()}</Label>
        <Select name="locale" value={getLocale()} onValueChange={(value) => changeLocale(value as Locale)}>
          <SelectTrigger id="locale" className="w-48">
            <SelectValue>{LOCALE_LABELS[getLocale()]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {locales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {LOCALE_LABELS[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label id="theme-label">{m.settings_theme()}</Label>
        <ToggleGroup
          type="single"
          aria-labelledby="theme-label"
          variant="outline"
          value={mounted ? (theme ?? preferences.theme) : ""}
          onValueChange={(value) => value && changeTheme(value as Theme)}
        >
          <ToggleGroupItem value="light">
            <SunIcon /> {m.theme_light()}
          </ToggleGroupItem>
          <ToggleGroupItem value="dark">
            <MoonIcon /> {m.theme_dark()}
          </ToggleGroupItem>
          <ToggleGroupItem value="system">
            <MonitorIcon /> {m.theme_system()}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="default-model">{m.settings_default_model()}</Label>
        <Select name="default-model" value={preferences.defaultModel} onValueChange={changeModel}>
          <SelectTrigger id="default-model" className="w-72">
            <SelectValue>{models.find((model) => model.id === preferences.defaultModel)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
                <span className="text-muted-foreground text-xs">{tierLabel[model.tier]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{m.settings_default_model_hint()}</p>
      </div>
    </div>
  );
}

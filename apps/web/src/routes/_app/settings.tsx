import { Label } from "@sinapps/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sinapps/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@sinapps/ui/components/toggle-group";
import { createFileRoute } from "@tanstack/react-router";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages.js";
import { getLocale, type Locale, locales, setLocale } from "@/paraglide/runtime.js";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

const LOCALE_LABELS: Record<Locale, string> = { en: "English", fr: "Français" };

// Persisting these preferences in user_preference lands in T9; for now they
// live in the locale cookie (Paraglide) and localStorage (next-themes).
function Settings() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the theme after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 p-6">
      <h1 className="font-semibold text-xl">{m.settings_title()}</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="locale">{m.settings_language()}</Label>
        <Select name="locale" value={getLocale()} onValueChange={(value) => setLocale(value as Locale)}>
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
          value={mounted ? (theme ?? "system") : ""}
          onValueChange={(value) => value && setTheme(value)}
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
    </div>
  );
}

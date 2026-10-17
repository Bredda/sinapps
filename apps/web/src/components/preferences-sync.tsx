import { useRouteContext } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

/**
 * Aligns the browser with the preferences stored server-side, so a new device or
 * a cleared cookie/localStorage picks up the user's language and theme.
 * The settings page saves first and refreshes the route context before applying
 * a change locally, so this never fights a pending edit.
 */
export function PreferencesSync() {
  const { preferences } = useRouteContext({ from: "/_app" });
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // next-themes only knows the theme after hydration.
    if (theme !== undefined && theme !== preferences.theme) setTheme(preferences.theme);
  }, [preferences.theme, theme, setTheme]);

  useEffect(() => {
    // setLocale writes the cookie and reloads once; the server then renders in that locale.
    if (preferences.locale && preferences.locale !== getLocale()) setLocale(preferences.locale);
  }, [preferences.locale]);

  return null;
}

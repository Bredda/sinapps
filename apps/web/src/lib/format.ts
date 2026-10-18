import { getLocale } from "@/paraglide/runtime.js";

/** "0.4s", "8s", "2 min 4s" (localized units). */
export function formatDuration(ms: number, locale: string = getLocale()): string {
  const seconds = ms / 1000;
  const unit = (value: number, name: "second" | "minute", digits = 0) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "narrow",
      maximumFractionDigits: digits,
    }).format(value);
  if (seconds < 60) return unit(seconds, "second", seconds < 10 ? 1 : 0);
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${unit(minutes, "minute")} ${unit(rest, "second")}` : unit(minutes, "minute");
}

/** LLM costs are fractions of a cent: keep a few significant digits. */
export function formatCost(usd: number, locale: string = getLocale()): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumSignificantDigits: usd < 1 ? 2 : 4,
  }).format(usd);
}

export function formatCount(value: number, locale: string = getLocale()): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** "example.com" from a URL, for compact link labels. */
export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

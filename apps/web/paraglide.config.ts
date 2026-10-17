import type { CompilerOptions } from "@inlang/paraglide-js";

/** Single source of truth for Paraglide: used by the Vite plugin and scripts/i18n-compile.ts. */
export const paraglideOptions = {
  project: "./project.inlang",
  outdir: "./src/paraglide",
  outputStructure: "message-modules",
  cookieName: "SINAPPS_LOCALE",
  // No locale in URLs: the app sits behind auth, there is nothing to index.
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
} satisfies CompilerOptions;

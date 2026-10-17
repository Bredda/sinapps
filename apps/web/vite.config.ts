import { existsSync } from "node:fs";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local dev reads the repo-root .env into process.env (server code reads it there).
// In production the variables are injected by the environment.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      cookieName: "SINAPPS_LOCALE",
      // No locale in URLs: the app sits behind auth, there is nothing to index.
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

import { existsSync } from "node:fs";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { paraglideOptions } from "./paraglide.config";

// Local dev reads the repo-root .env into process.env (server code reads it there).
// In production the variables are injected by the environment.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [paraglideVitePlugin(paraglideOptions), tailwindcss(), tanstackStart(), viteReact()],
});

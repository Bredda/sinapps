import { defineConfig } from "vitest/config";

// Unit tests only: no TanStack Start / Paraglide plugins needed.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["src/**/*.test.ts"] },
});

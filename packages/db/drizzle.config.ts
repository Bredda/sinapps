import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local dev reads the repo-root .env; CI and Kubernetes inject DATABASE_URL directly.
if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://sinapps:sinapps@localhost:5433/sinapps" },
  strict: true,
  verbose: true,
});

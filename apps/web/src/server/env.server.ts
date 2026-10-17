import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

// Defaults match infra/docker-compose.yml and the dev realm, so `pnpm dev` works
// with an empty .env. Production must provide every value explicitly.
const devDefaults = {
  DATABASE_URL: "postgres://sinapps:sinapps@localhost:5433/sinapps",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "dev-only-insecure-secret-do-not-use-in-prod",
  KEYCLOAK_ISSUER: "http://localhost:8180/realms/sinapps",
  KEYCLOAK_CLIENT_ID: "sinapps-web",
  KEYCLOAK_CLIENT_SECRET: "sinapps-web-dev-secret",
  AUTH_REQUIRED_ROLE: "sinapps-user",
};

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  /** Realm role required to use the app; empty means any authenticated user. */
  AUTH_REQUIRED_ROLE: z.string().optional(),
});

const provided = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ""),
);

export const env = envSchema.parse({ ...(isProduction ? {} : devDefaults), ...provided });

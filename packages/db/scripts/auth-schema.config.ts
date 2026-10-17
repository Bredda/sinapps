/**
 * Minimal better-auth config used only to generate `src/schema/auth.ts` with
 * `pnpm auth:schema`. Keep its plugins in sync with the runtime config in
 * apps/web so the generated tables match what better-auth expects.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: drizzleAdapter({}, { provider: "pg" }),
  emailAndPassword: { enabled: false },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "keycloak",
          clientId: "schema-only",
          discoveryUrl: "http://localhost:8180/realms/sinapps/.well-known/openid-configuration",
        },
      ],
    }),
  ],
});

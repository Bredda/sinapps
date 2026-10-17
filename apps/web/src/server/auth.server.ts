import { createDb, schema } from "@sinapps/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, eq } from "drizzle-orm";
import { env } from "./env.server";

export const db = createDb(env.DATABASE_URL);

const PROVIDER_ID = "keycloak";

// Plugins must stay in sync with packages/db/scripts/auth-schema.config.ts.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  // Encrypts access/refresh tokens at rest. The id token stays readable: it is
  // only an identity assertion, used for roles and RP-initiated logout.
  account: { encryptOAuthTokens: true },
  plugins: [
    genericOAuth({
      config: [
        keycloak({
          issuer: env.KEYCLOAK_ISSUER,
          clientId: env.KEYCLOAK_CLIENT_ID,
          clientSecret: env.KEYCLOAK_CLIENT_SECRET,
          // signOut() also ends the Keycloak session, then comes back here.
          postLogoutRedirectURI: "/login",
          // Refresh name and email from Keycloak on every sign-in.
          overrideUserInfo: true,
        }),
      ],
    }),
    // Must stay last: lets auth calls set cookies through TanStack Start.
    tanstackStartCookies(),
  ],
});

/**
 * Realm roles from the `roles` claim of the user's Keycloak id token.
 *
 * Roles are deliberately not copied into a user column: better-auth only maps
 * provider fields that users may also edit themselves (`input: true`), which
 * would let anyone grant themselves a role. The id token is verified against
 * the realm JWKS at sign-in, refreshed on every sign-in, and only lives server-side.
 */
async function getRealmRoles(userId: string): Promise<string[]> {
  const [row] = await db
    .select({ idToken: schema.account.idToken })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, PROVIDER_ID)))
    .limit(1);
  const payload = row?.idToken?.split(".")[1];
  if (!payload) return [];
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { roles?: unknown };
  return Array.isArray(claims.roles) ? claims.roles.filter((role): role is string => typeof role === "string") : [];
}

export async function hasRequiredRole(userId: string): Promise<boolean> {
  if (!env.AUTH_REQUIRED_ROLE) return true;
  return (await getRealmRoles(userId)).includes(env.AUTH_REQUIRED_ROLE);
}

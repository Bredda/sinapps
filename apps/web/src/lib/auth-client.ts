import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Ends the app session and, through RP-initiated logout, the Keycloak session. */
export async function signOut() {
  await authClient.signOut();
}

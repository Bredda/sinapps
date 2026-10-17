import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, hasRequiredRole } from "./auth.server";
import { getPreferences } from "./preferences.server";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/**
 * Current session, or null. `authorized` is false when the required realm role is missing.
 * Preferences ride along so the app shell can sync theme and locale across devices.
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  const user: SessionUser = { id, name, email, image: image ?? null };
  const authorized = await hasRequiredRole(id);
  return { user, authorized, preferences: authorized ? await getPreferences(id) : null };
});

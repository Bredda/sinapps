import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, hasRequiredRole } from "./auth.server";

/** Id of the signed-in, authorized user; throws otherwise. Call first in every protected server function. */
export async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session || !(await hasRequiredRole(session.user.id))) throw new Error("Unauthorized");
  return session.user.id;
}

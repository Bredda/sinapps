import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

// Resolves the request locale (cookie → Accept-Language → base) before SSR runs.
export default createServerEntry({
  fetch(request) {
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
});

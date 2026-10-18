# Backlog

Items to revisit later: things found along the way that are unrelated to the current task and not worth handling right away.

## Fixes

- **Settings: unlabeled hidden `<select>`** — Chrome reports "No label associated with a form field" on `/settings`: it's the native `<select>` Radix Select renders for forms. Check whether `name`/`aria-*` on `SelectTrigger` or a Radix option silences it.
- **Untranslated shadcn screen-reader labels** — `Dialog`/`Sheet` render a hard-coded sr-only "Close" (the sidebar trigger is already overridden with `aria-label`). Pass translated labels or patch the components in `packages/ui`.
- **Rename reorders the list** — renaming bumps `conversation.updated_at`, so the conversation jumps to the top. Decide whether only new messages should count as activity (separate `last_message_at`).
- **Stopped runs record no usage** — tokens and cost arrive with the last model call, so an interrupted answer is stored with 0 tokens / $0 although the provider bills the partial generation. Sum usage per step (`onUsage` already fires per call) and persist it on interruption, or fetch the generation cost from OpenRouter.
- **No root `errorComponent`** — a failed loader (e.g. network error during a dev reload) shows TanStack's bare "Something went wrong!". Add a translated error component with a retry.
- **Dev realm not re-imported** — Keycloak skips importing an existing realm, so edits to `infra/keycloak/realm/sinapps-realm.json` (e.g. English role description, `defaultLocale: en`) don't reach an existing volume. Document the reset (`infra:down` + drop `sinapps_postgres-data`) or add a `infra:reset` script.

## Features

- **Server-side conversation search and pagination** — the sidebar loads the latest 200 conversations and filters titles client-side. Move to a paginated list + `ILIKE`/full-text search when users accumulate more.

## Improvements

- **Paraglide compile needs network** — `project.inlang/settings.json` loads `plugin-message-format` from jsDelivr at compile time (typecheck, build, CI). Consider a local module path to make builds hermetic.
- **Session check on every navigation** — `_app` `beforeLoad` calls the `getSession` server function (plus an `account` query for roles) on each client-side navigation. Cache it in router context or with TanStack Query if it shows up in latency.
- **Locale on a new device costs one reload** — `PreferencesSync` calls `setLocale` after the first render when the stored locale differs from the cookie. A better-auth `hooks.after` on `/callback/:id` could set the `SINAPPS_LOCALE` cookie at sign-in instead.
- **MCP discovery on every turn** — each run connects to every active MCP server and lists its tools. Cache tool lists (or keep a pool) if it adds visible latency.
- **Reasoning not replayed across turns** — encrypted reasoning values are stored in `providerMetadata` but not sent back with the history. Needed only if a provider starts requiring it.
- **Delete `spikes/agent-sdk/`** once T11 has applied its findings (provider routing, usage summing, `mcp` option).

- **Production start must preload instrumentation** — traces only work if the server starts with `node --import ./instrumentation.ts` (Node runs the TS file directly). Wire it into the Docker entrypoint and check the HTTP spans against the production server (M4).
- **Dev dashboard** — ship a small Grafana dashboard (runs, cost, tokens, tool errors) provisioned in the `lgtm` compose service; the Helm ConfigMap version comes with M4.

## Ideas

- **Keycloak login page in the app locale** — pass `ui_locales` (current Paraglide locale) on sign-in; today Keycloak uses its own cookie/Accept-Language.

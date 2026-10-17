# Backlog

Items to revisit later: things found along the way that are unrelated to the current task and not worth handling right away.

## Fixes

- **Settings: unlabeled hidden `<select>`** — Chrome reports "No label associated with a form field" on `/settings`: it's the native `<select>` Radix Select renders for forms. Check whether `name`/`aria-*` on `SelectTrigger` or a Radix option silences it.
- **Dev realm not re-imported** — Keycloak skips importing an existing realm, so edits to `infra/keycloak/realm/sinapps-realm.json` (e.g. English role description, `defaultLocale: en`) don't reach an existing volume. Document the reset (`infra:down` + drop `sinapps_postgres-data`) or add a `infra:reset` script.

## Features

## Improvements

- **Paraglide compile needs network** — `project.inlang/settings.json` loads `plugin-message-format` from jsDelivr at compile time (typecheck, build, CI). Consider a local module path to make builds hermetic.
- **Session check on every navigation** — `_app` `beforeLoad` calls the `getSession` server function (plus an `account` query for roles) on each client-side navigation. Cache it in router context or with TanStack Query if it shows up in latency.
- **Delete `spikes/agent-sdk/`** once T11 has applied its findings (provider routing, usage summing, `mcp` option).

## Ideas

- **Keycloak login page in the app locale** — pass `ui_locales` (current Paraglide locale) on sign-in; today Keycloak uses its own cookie/Accept-Language.

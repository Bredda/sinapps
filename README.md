# Sinapps

Multi-user conversational assistant that answers with interactive interfaces generated on the fly (MCP Apps, AG-UI).

- Spec: [docs/architecture-proposal.md](docs/architecture-proposal.md)
- Current plan: [docs/plan/m0.md](docs/plan/m0.md)

## Prerequisites

- Node 24 (`.nvmrc`), pnpm 12 (`corepack enable`)
- Docker (local Postgres + Keycloak)
- Optional: [gitleaks](https://github.com/gitleaks/gitleaks) installed locally (otherwise the pre-commit hook skips it; CI enforces it)

## Getting started

```bash
cp .env.example .env        # fill in OPENROUTER_API_KEY, TAVILY_API_KEY
pnpm install                # also installs the git hooks (lefthook)
pnpm infra:up               # Postgres :5433, Keycloak :8180 (admin/admin)
pnpm dev
```

Dev accounts (realm `sinapps`): `alice` / `alice` (FR) and `bob` / `bob` (EN), both with the `sinapps-user` role. `carol` / `carol` lacks that role (access-denied testing).

End-to-end tests (Playwright, needs `pnpm infra:up` and port 3000 free, so stop `pnpm dev`): `pnpm e2e`. They run the real
app, PostgreSQL (a throwaway `sinapps_e2e` database) and Keycloak, with a scripted model and a mock MCP server. First time:
`pnpm --filter @sinapps/web exec playwright install chromium`.

Local observability: `pnpm infra:obs` starts Grafana (:3300) with an OTLP endpoint (:4317/:4318). Set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env` and restart `pnpm dev`: traces (Tempo) and metrics
(Prometheus) show up in Grafana → Explore. JSON logs go to stdout with the matching `trace_id`.

## Conventions

- Lint and format: Biome (`pnpm check`, `pnpm check:fix`)
- Commits: Conventional Commits (commitlint)
- Hooks: pre-commit (Biome on staged files + gitleaks), commit-msg (commitlint), pre-push (affected typecheck + test)
- Language: everything in the repo (docs, code, comments, commits) is written in English

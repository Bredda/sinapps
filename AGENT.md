# AGENT.md

`sinapps` is a multi-user conversational assistant that answers with interactive interfaces generated on the fly (MCP Apps, AG-UI). It is a **functional showcase** of generative UI on a clean reference stack, not a product. It is also the first app deployed on the `platform` k3s server (<https://github.com/Bredda/platform>).

Guiding principle: keep it small, legible and reproducible. Follow the decisions already taken; propose a change instead of drifting from them.

## Read first

1. [README.md](README.md): prerequisites, how to run, conventions.
2. [docs/architecture-proposal.md](docs/architecture-proposal.md): the spec. Section 0 (key decisions) and section 7 (decisions made) are binding; section 6 lists what was rejected and why. Do not reintroduce a rejected option.
3. The current plan in [docs/plan/](docs/plan/): `m0.md` is done, **`m4.md` (deployment on the platform) is current**. Its work packages (WP0 to WP8) and findings (P1 to P14) are the unit of work. Do not start a work package the owner has not pointed to.
4. [backlog.md](backlog.md): things found along the way that are unrelated to the task at hand. Add them there instead of fixing them on the side.
5. For anything about the platform (server, Keycloak, Postgres, TLS, Flux): the platform guide, [docs/platform.md](docs/platform.md). It is a verbatim copy of `docs/app-repo-guide.md` of the `platform` repository: never edit it or let a formatter touch it, replace it by copying the newer file. **Do not invent a fact about the platform.** Each statement in the guide is *verified*, *designed* or *not decided*; do not build on the last two without saying so in `deploy/PLATFORM.md`. When a fact is missing, write it down as a question for the owner with your recommendation.

## Commands

Node 24, pnpm 12 (`corepack enable`), Docker. Full detail in the README.

```bash
pnpm install          # also installs the git hooks (lefthook)
pnpm infra:up         # Postgres :5433, Keycloak :8180
pnpm dev
pnpm check            # Biome (pnpm check:fix to write)
pnpm typecheck && pnpm test
pnpm e2e              # Playwright; needs infra:up and port 3000 free
pnpm db:generate && pnpm db:migrate
```

## Conventions

- **Everything is written in English**: docs, code, comments, commit messages.
- Conventional Commits (commitlint). Biome for lint and format. Strict TypeScript with `noUncheckedIndexedAccess`. Vitest per package, Playwright for `apps/web`.
- Hooks: pre-commit (Biome on staged files, gitleaks), commit-msg, pre-push (affected typecheck and test). **Never bypass them** (`--no-verify`); fix the cause.
- Pin versions (dependencies, GitHub Actions by commit SHA or exact version, base images). TanStack AI is pre-1.0: keep the agent code confined and its version pinned.
- Match the surrounding code. Do not add a dependency, a second style or a new tool without a reason recorded in the plan.
- Commit or push only when the owner asks. Do not push to `main`: use a branch and a pull request.

## Boundaries with the platform

- You have **no access to the cluster** and no credentials, and must not look for any. CI never gets cluster credentials either: the platform pulls (Flux), CI only builds and pushes images.
- **Never commit a secret**, including in the history of a branch. The app names the Secrets it needs (in `deploy/PLATFORM.md`); the owner creates them. Production guards in the env schema (no dev defaults, required keys) must stay.
- Keycloak: the app owns its realm definition as code (`deploy/keycloak/sinapps-realm.json`: no user, no secret, brute-force protection on, variables as `$(env:NAME)`); the owner has the platform apply it. The dev realm in `infra/keycloak/realm/` is dev only.
- Do not edit the `platform` repository from here. What the platform must do or decide goes in `deploy/PLATFORM.md` and in the plan's questions, and in your final message.
- Anything that deletes data (a migration that drops, a realm reset) or changes the public hostname is destructive: write down the impact and wait for the owner's confirmation.

## Working on a task

- State which work package or finding you are on. Keep to its scope; list anything else in `backlog.md`.
- Update the plan file when a work package or finding changes status, and say what was verified (tests, `helm lint`, a real run) versus only written.
- Finish with: what you did and which checks you ran with their result; what the platform side must know or do; what waits for the owner.

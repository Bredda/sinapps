# Spike — Agent SDK (go/no-go)

Validates TanStack AI + OpenRouter + MCP for Sinapps (see `docs/architecture-proposal.md` §3.3).
Throwaway: this folder will be deleted once the decision is fully applied.

## Run

```bash
pnpm install
pnpm mcp                                   # terminal 1: test MCP server (:3299)
pnpm run:spike                             # terminal 2: the 4 models × 2 scenarios
pnpm run:spike google/gemini-3.8-flash     # a single model
```

The key is read from `OPENROUTER_API_KEY` (environment) or from the `.env` file at the repo root (git-ignored).

Scenarios:

- `react`: `get_mobile_offers` → `show_table` → text (multi-tool ReAct loop).
- `canvas`: `render_canvas` with a long HTML payload (argument streaming).

Per-run details are written to `report.json`.

`probe-deltas.ts`: quick probe of tool-argument chunking per model and per upstream host (`PROVIDER=fireworks npx tsx --env-file-if-exists=../../.env probe-deltas.ts <model>`).

## Versions tested

`@tanstack/ai` 0.69.0 · `@tanstack/ai-openrouter` 0.22.0 · `@tanstack/ai-mcp` 0.9.0 · `@tanstack/ai-persistence` 0.9.0 · `@modelcontextprotocol/server` 2.3.1 · `@modelcontextprotocol/ext-apps` 2.0.3 · `@ag-ui/core` 1.0.3

## Verdict (2026-10-17): ✅ GO TanStack AI

All 5 criteria pass. The only limitation (C1) comes from the upstream hosts behind OpenRouter, not from the SDK: AI SDK would hit it the same way.

| # | Criterion | Status | Finding |
|---|---|---|---|
| C1 | Incremental `TOOL_CALL_ARGS` through OpenRouter | ✅ conditional | **Anthropic**: fine-grained streaming (canvas: 230–300 deltas over 10–12 s). **Gemini 3.8 Flash**: a single delta on every Google endpoint (the only host) → structural. **DeepSeek V4.1 Flash**: depends on the host OpenRouter picks. Relace and DeepInfra send everything in one block; Fireworks (640 chunks), Novita (361) and Together (127) stream. With `modelOptions.provider.order: ['fireworks']`, the TanStack adapter emits 629 deltas. The adapter does not buffer (checked in its code) |
| C2 | MCP tools over stateless Streamable HTTP (SDK v2) | ✅ | Discovery and execution work. `metadata.mcp.uiResourceUri` and `title` exposed per tool |
| C3 | OpenRouter usage and cost in a middleware | ✅ | `onUsage` fires **on every model call** (once per ReAct iteration, with one `RUN_FINISHED` per iteration): it must be summed. `cost` and `costDetails` are present |
| C4 | PG persistence through middleware | ✅ (inspection) | `MessageStore` / `RunStore` contracts, Drizzle recipe and conformance kit. ⚠ The store persists `ModelMessage`s: a projection to our `MessagePart`s is needed (M0 decision) |
| C5 | AG-UI events usable by the AppBridge host | ✅ | `uiResourceUri` known from `TOOL_CALL_START`. `partial-json` succeeds on 100% of deltas. `CUSTOM ui-resource` is emitted **only when the client is passed through `chat({ mcp: { clients } })`** (not through `tools`). `REASONING_*` emitted for all 4 models. ⚠ The AG-UI 1.0 field is named `toolCallName` |

### Measurements (1 run per cell, indicative)

| Model | ReAct: duration · cost | Canvas: duration · cost · HTML | Streamed args |
|---|---|---|---|
| `anthropic/claude-opus-5.5` | 9.8 s · $0.021 | 17.4 s · $0.046 · 3.4 KB | yes |
| `anthropic/claude-sonnet-5.5` | 5.7 s · $0.010 | 13.2 s · $0.028 · 4.5 KB | yes |
| `google/gemini-3.8-flash` | 10.6 s · $0.004 | 26.6 s · $0.021 · 13.2 KB | no (structural) |
| `deepseek/deepseek-v4.1-flash` | 3.7 s · $0.0006 | 97.5 s · $0.009 · 16 KB (13.7k tokens, long reasoning) | depends on host |

### Consequences for the implementation

1. Richer model configuration: `provider` (OpenRouter order and fallbacks) and `reasoning` per model. DeepSeek → `fireworks`, `novita`, `together`.
2. Graceful degradation when arguments arrive in one block: skeleton + activity indicator (visible reasoning, timer), render on the complete input.
3. Usage: sum `onUsage` per run and persist it per message.
4. MCP: always pass clients through the `mcp` option of `chat()`.
5. Duration guard for long-reasoning models (DeepSeek canvas: 97 s).

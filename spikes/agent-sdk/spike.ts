/**
 * Agent SDK spike (go/no-go, see docs/architecture-proposal.md §3.3).
 *
 * For each model, runs one ReAct turn (get_mobile_offers → show_table → text)
 * and one canvas turn (render_canvas), and measures:
 *  C1  incremental TOOL_CALL_ARGS streaming via OpenRouter
 *  C2  MCP tools over stateless Streamable HTTP (SDK v2) through @tanstack/ai-mcp
 *  C3  usage + cost reported by OpenRouter (middleware onUsage / onFinish)
 *  C5  AG-UI events usable by our AppBridge host: tool → ui:// mapping known at
 *      TOOL_CALL_START, partial args healable into objects, ui-resource event
 *
 * Usage: OPENROUTER_API_KEY=... pnpm run:spike [model ...]
 */
import { writeFileSync } from "node:fs";
import { chat, type StreamChunk } from "@tanstack/ai";
import { createMCPClient } from "@tanstack/ai-mcp";
import { openRouterText } from "@tanstack/ai-openrouter";
import { parse as parsePartial } from "partial-json";

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3299/mcp";
const DEFAULT_MODELS = [
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5",
  "google/gemini-3.8-flash",
  "deepseek/deepseek-v4.1-flash",
] as const;

const SYSTEM = [
  "You are a helpful assistant that answers with interactive UI when useful.",
  "Use show_table for tabular comparisons and render_canvas for free-form interactive widgets.",
  "Answer in the user's language.",
].join(" ");

const SCENARIOS = {
  react:
    "Compare the current mobile plans in France, show them in a table highlighting the best GB/price ratio, then explain your choice in two sentences.",
  canvas:
    "Build me a small bill-splitting tool: total, tip in %, number of people, with live calculation.",
} as const;

interface ToolCallStats {
  toolName: string;
  uiResourceUri?: string;
  startAt: number;
  argDeltas: number;
  firstDeltaAt?: number;
  lastDeltaAt?: number;
  argBytes: number;
  partialParsesOk: number;
  partialParsesKo: number;
}

interface ScenarioReport {
  model: string;
  scenario: string;
  ok: boolean;
  error?: string;
  durationMs: number;
  eventCounts: Record<string, number>;
  reasoningEvents: number;
  textChars: number;
  toolCalls: ToolCallStats[];
  uiResourceEvents: number;
  usage?: { promptTokens: number; completionTokens: number; cost: number };
  usageCalls?: number;
  finishUsage?: unknown;
}

async function runScenario(model: string, scenario: keyof typeof SCENARIOS): Promise<ScenarioReport> {
  const mcp = await createMCPClient({ transport: { type: "http", url: MCP_URL } });
  const tools = await mcp.tools();
  const uiByTool = new Map(tools.map((t) => [t.name, t.metadata.mcp.uiResourceUri] as const));

  const report: ScenarioReport = {
    model,
    scenario,
    ok: false,
    durationMs: 0,
    eventCounts: {},
    reasoningEvents: 0,
    textChars: 0,
    toolCalls: [],
    uiResourceEvents: 0,
  };
  const calls = new Map<string, ToolCallStats & { args: string }>();
  const t0 = Date.now();

  try {
    const stream = chat({
      // biome-ignore lint/suspicious/noExplicitAny: model ids come from argv
      adapter: openRouterText(model as any),
      systemPrompts: [SYSTEM],
      messages: [{ role: "user", content: SCENARIOS[scenario] }],
      // Passing the client (not just its tools) lets chat() read ui:// resources
      // and emit the CUSTOM `ui-resource` event; chat() also closes it at the end.
      mcp: { clients: [mcp] },
      middleware: [
        {
          // onUsage fires once per model call (one per ReAct iteration): sum them.
          onUsage: (_ctx, usage) => {
            report.usageCalls = (report.usageCalls ?? 0) + 1;
            report.usage = {
              promptTokens: (report.usage?.promptTokens ?? 0) + (usage.promptTokens ?? 0),
              completionTokens: (report.usage?.completionTokens ?? 0) + (usage.completionTokens ?? 0),
              cost: (report.usage?.cost ?? 0) + (usage.cost ?? 0),
            };
          },
          onFinish: (_ctx, info) => {
            report.finishUsage = info.usage;
          },
        },
      ],
    });

    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      const now = Date.now() - t0;
      report.eventCounts[chunk.type] = (report.eventCounts[chunk.type] ?? 0) + 1;
      switch (chunk.type) {
        case "TEXT_MESSAGE_CONTENT":
          report.textChars += chunk.delta.length;
          break;
        case "TOOL_CALL_START":
          calls.set(chunk.toolCallId, {
            toolName: chunk.toolCallName,
            uiResourceUri: uiByTool.get(chunk.toolCallName),
            startAt: now,
            argDeltas: 0,
            argBytes: 0,
            partialParsesOk: 0,
            partialParsesKo: 0,
            args: "",
          });
          break;
        case "TOOL_CALL_ARGS": {
          const c = calls.get(chunk.toolCallId);
          if (!c) break;
          c.argDeltas++;
          c.firstDeltaAt ??= now;
          c.lastDeltaAt = now;
          c.args += chunk.delta;
          c.argBytes = c.args.length;
          try {
            parsePartial(c.args);
            c.partialParsesOk++;
          } catch {
            c.partialParsesKo++;
          }
          break;
        }
        case "CUSTOM":
          if (chunk.name === "ui-resource") report.uiResourceEvents++;
          break;
        default:
          if (chunk.type.startsWith("REASONING_")) report.reasoningEvents++;
          if (chunk.type === "RUN_ERROR") report.error = JSON.stringify(chunk);
      }
    }
    report.ok = !report.error;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  report.durationMs = Date.now() - t0;
  report.toolCalls = [...calls.values()].map(({ args: _args, ...stats }) => stats);
  return report;
}

function summarize(r: ScenarioReport): string {
  const tools = r.toolCalls
    .map((c) => {
      const window = c.firstDeltaAt !== undefined ? `${c.lastDeltaAt! - c.firstDeltaAt}ms` : "-";
      return `${c.toolName}${c.uiResourceUri ? "[ui]" : ""} deltas=${c.argDeltas} bytes=${c.argBytes} window=${window} partialOk=${c.partialParsesOk}/${c.argDeltas}`;
    })
    .join(" | ");
  const usage = r.usage;
  return [
    `${r.ok ? "OK " : "KO "} ${r.model} [${r.scenario}] ${r.durationMs}ms`,
    `   reasoning=${r.reasoningEvents} text=${r.textChars}c uiResource=${r.uiResourceEvents}`,
    `   tools: ${tools || "(none)"}`,
    `   usage (sum of ${r.usageCalls ?? 0} calls): ${JSON.stringify(usage)}`,
    r.error ? `   error: ${r.error}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const models = process.argv.slice(2).length ? process.argv.slice(2) : [...DEFAULT_MODELS];
const reports: ScenarioReport[] = [];
for (const model of models) {
  for (const scenario of Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>) {
    const r = await runScenario(model, scenario);
    reports.push(r);
    console.log(summarize(r));
  }
}
writeFileSync("report.json", JSON.stringify(reports, null, 2));
console.log("\nFull report: report.json");

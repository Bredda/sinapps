/**
 * Application telemetry (docs/architecture-proposal.md §3.11). The SDK itself starts in
 * apps/web/instrumentation.ts; without it, every call here is a no-op.
 *
 * Tokens and latency come from the standard `gen_ai.client.*` metrics recorded by
 * TanStack AI's OpenTelemetry middleware. This module adds what the conventions lack:
 * cost, tool calls and agent runs. No metric carries a user id (cardinality): per-user
 * cost is read from the `usage_by_user_day` view.
 */
import { type Context, context, metrics, trace } from "@opentelemetry/api";
import type { ChatMiddleware } from "@tanstack/ai";
import { otelMiddleware } from "@tanstack/ai/middlewares/otel";

const SCOPE = "sinapps-web";

export const tracer = trace.getTracer(SCOPE);
const meter = metrics.getMeter(SCOPE);

const llmCost = meter.createCounter("sinapps.llm.cost", {
  description: "LLM spend reported by the provider",
  unit: "USD",
});
const toolCalls = meter.createCounter("sinapps.tool.calls", { description: "Tool calls by outcome" });
const agentRuns = meter.createCounter("sinapps.agent.runs", { description: "Agent runs by outcome" });
const agentRunDuration = meter.createHistogram("sinapps.agent.run.duration", {
  description: "Wall-clock time of an agent run",
  unit: "s",
});

/** Prompts and completions are PII: only attached to spans when explicitly enabled. */
const captureContent = process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT === "true";

/** Spans (chat / iteration / tool, `gen_ai.*`), token and latency metrics, cost metric. */
export function llmMiddleware(): [ChatMiddleware, ChatMiddleware] {
  return [
    otelMiddleware({ tracer, meter, captureContent }),
    {
      name: "sinapps-cost",
      onUsage: (ctx, usage) => {
        if (usage.cost) llmCost.add(usage.cost, { "gen_ai.request.model": ctx.model });
      },
    },
  ];
}

export function recordToolCall(attributes: { server: string; tool: string; status: string }) {
  toolCalls.add(1, attributes);
}

export function recordAgentRun(attributes: { model: string; outcome: string }, durationMs: number) {
  agentRuns.add(1, attributes);
  agentRunDuration.record(durationMs / 1000, attributes);
}

/**
 * Runs every step of an async generator inside `ctx`. A generator body executes in the
 * context of whoever calls `next()` (here the SSE stream's pull), not where it was
 * created: without this, its spans and logs would detach from the request's trace.
 */
export async function* withContext<T>(ctx: Context, generator: AsyncGenerator<T>): AsyncGenerator<T> {
  try {
    while (true) {
      const step = await context.with(ctx, () => generator.next());
      if (step.done) return;
      yield step.value;
    }
  } finally {
    // The consumer left early (client gone): let the generator run its own cleanup.
    await context.with(ctx, () => generator.return(undefined));
  }
}

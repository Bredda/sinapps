import { type AGUIEvent, EventType } from "@ag-ui/core";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { schema } from "@sinapps/db";
import type { MessagePart } from "@sinapps/db/parts";
import { type ChatMiddleware, chat, type ModelMessage } from "@tanstack/ai";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { initialRunState, interruptRun, type RunState, reduceRunEvent, type ToolCallMetadata } from "@/lib/agent-run";
import { db } from "../auth.server";
import { config, getModel, type ModelConfig } from "../config.server";
import { textAdapter } from "../llm.server";
import { logger } from "../logger.server";
import { llmMiddleware, recordAgentRun, recordToolCall, tracer, withContext } from "../telemetry.server";
import { toModelMessages } from "./history.server";
import { type McpSession, openMcpSession } from "./mcp.server";
import { createNormalizer, type RunTotals } from "./normalize";
import { systemPrompt } from "./prompt.server";

const { conversation, message } = schema;

export class RunRejected extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface RunRequest {
  userId: string;
  conversationId: string;
  runId: string;
  locale: string;
  /**
   * New user (or widget) message; omitted to answer the trailing user message.
   * `id`: the client's id, so the optimistic copy and the stored row match.
   */
  newMessage?: { id?: string; text: string; source: "user" | "app" };
  /** Drop the trailing assistant answer and answer again. */
  regenerate?: boolean;
  /** Replace the last user message (and what follows) with `newMessage`. */
  edit?: boolean;
}

export interface PreparedRun {
  request: RunRequest;
  model: ModelConfig;
  assistantMessageId: string;
  enabledServers: string[];
  history: ModelMessage[];
}

/** A streaming row older than any run can last was left behind by a crashed process. */
const STALE_RUN_MS = Math.max(...config.models.allowlist.map((model) => model.timeoutMs)) + 60_000;

type PgError = { code?: string; constraint?: string };

/** The run lock is taken: another streaming row exists (a client-chosen id clash is a plain 400). */
const lockConflict = (error: unknown): "locked" | "duplicate" | null => {
  const pg = ((error as { cause?: PgError }).cause ?? error) as PgError;
  if (pg.code !== "23505") return null;
  return pg.constraint === "message_one_streaming_per_conversation" ? "locked" : "duplicate";
};

/**
 * Validates and records the turn, then takes the conversation's run lock by inserting
 * the streaming assistant row (unique per conversation). Throws RunRejected.
 */
export async function prepareRun(request: RunRequest): Promise<PreparedRun> {
  const [owned] = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.id, request.conversationId),
        eq(conversation.userId, request.userId),
        isNull(conversation.deletedAt),
      ),
    );
  if (!owned) throw new RunRejected(404, "Conversation not found");
  const model = getModel(owned.modelId) ?? (getModel(config.models.default) as ModelConfig);

  const assistantMessageId = await db
    .transaction(async (tx) => {
      // Release a lock left by a crashed run.
      await tx
        .update(message)
        .set({ status: "interrupted" })
        .where(
          and(
            eq(message.conversationId, owned.id),
            eq(message.status, "streaming"),
            lt(message.createdAt, sql`now() - ${`${STALE_RUN_MS} milliseconds`}::interval`),
          ),
        );

      const rows = await tx
        .select({ id: message.id, role: message.role })
        .from(message)
        .where(eq(message.conversationId, owned.id))
        .orderBy(asc(message.createdAt), asc(message.id));

      // Rows are in creation order: the answers are whatever follows the last user message.
      const lastUser = rows.findLastIndex((row) => row.role === "user");
      const dropFrom = request.edit ? lastUser : request.regenerate ? lastUser + 1 : -1;
      if (request.edit && (lastUser === -1 || !request.newMessage)) {
        throw new RunRejected(400, "Nothing to edit: send the new text of the last user message");
      }
      const dropped = dropFrom === -1 ? [] : rows.slice(dropFrom);
      if (dropped.length > 0) {
        await tx.delete(message).where(
          inArray(
            message.id,
            dropped.map((row) => row.id),
          ),
        );
      }

      if (request.newMessage && !request.regenerate) {
        const parts: MessagePart[] = [{ type: "text", id: crypto.randomUUID(), text: request.newMessage.text }];
        await tx.insert(message).values({
          ...(request.newMessage.id && { id: request.newMessage.id }),
          conversationId: owned.id,
          role: "user",
          parts,
          source: request.newMessage.source,
        });
      } else if (!request.regenerate && rows.at(-1)?.role !== "user") {
        throw new RunRejected(400, "Nothing to answer: the conversation doesn't end with a user message");
      }

      const [assistant] = await tx
        .insert(message)
        .values({ conversationId: owned.id, role: "assistant", parts: [], status: "streaming", modelId: model.id })
        .returning({ id: message.id });
      await tx.update(conversation).set({ updatedAt: new Date() }).where(eq(conversation.id, owned.id));
      return assistant?.id;
    })
    .catch((error: unknown) => {
      const conflict = lockConflict(error);
      if (conflict === "locked") throw new RunRejected(409, "A run is already in progress for this conversation");
      if (conflict === "duplicate") throw new RunRejected(400, "Message id already used");
      throw error;
    });
  if (!assistantMessageId) throw new Error("Assistant message insert returned no row");

  const stored = await db
    .select({ role: message.role, parts: message.parts })
    .from(message)
    .where(eq(message.conversationId, owned.id))
    .orderBy(asc(message.createdAt), asc(message.id));

  return {
    request,
    model,
    assistantMessageId,
    enabledServers: owned.enabledServers,
    // The streaming row is still empty: it adds nothing to the transcript.
    history: toModelMessages(stored),
  };
}

async function persist(run: PreparedRun, state: RunState, totals: RunTotals, startedAt: number) {
  await db
    .update(message)
    .set({
      parts: state.parts,
      status: state.status,
      tokensIn: totals.inputTokens,
      tokensOut: totals.outputTokens,
      costUsd: totals.costUsd,
      durationMs: Date.now() - startedAt,
    })
    .where(eq(message.id, run.assistantMessageId));
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Runs the agent loop and yields a strict AG-UI event stream. The assistant row is
 * updated at every step and finalized whatever happens (done, error, or interrupted
 * when the client goes away). The whole run is one `agent.run` span, a child of the
 * HTTP request's span.
 */
export function runAgent(run: PreparedRun, clientSignal: AbortSignal): AsyncGenerator<AGUIEvent> {
  const span = tracer.startSpan("agent.run", {
    attributes: {
      "gen_ai.request.model": run.model.id,
      "enduser.id": run.request.userId,
      "sinapps.conversation.id": run.request.conversationId,
      "sinapps.run.id": run.request.runId,
      "sinapps.message.id": run.assistantMessageId,
    },
  });
  return withContext(trace.setSpan(context.active(), span), executeRun(run, clientSignal, span));
}

async function* executeRun(
  run: PreparedRun,
  clientSignal: AbortSignal,
  span: ReturnType<typeof tracer.startSpan>,
): AsyncGenerator<AGUIEvent> {
  const { request, model } = run;
  // Filled once MCP servers are connected; RUN_STARTED goes out before that.
  const toolMeta = new Map<string, ToolCallMetadata>();
  const normalizer = createNormalizer({
    threadId: request.conversationId,
    runId: request.runId,
    messageId: run.assistantMessageId,
    toolMeta,
  });
  const startedAt = Date.now();
  const totals: RunTotals = { model: model.id, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let state = initialRunState();
  let mcp: McpSession | undefined;
  let timedOut = false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), model.timeoutMs);
  const onClientGone = () => controller.abort("client");
  clientSignal.addEventListener("abort", onClientGone, { once: true });

  const apply = (events: AGUIEvent[]) => {
    for (const event of events) state = reduceRunEvent(state, event);
    return events;
  };

  try {
    yield* apply(normalizer.start());
    mcp = await openMcpSession(run.enabledServers);
    for (const [name, meta] of mcp.toolMeta) toolMeta.set(name, meta);

    const usage: ChatMiddleware = {
      name: "sinapps-usage",
      // Fires once per model call, i.e. once per ReAct step.
      onUsage: (_ctx, info) => {
        totals.inputTokens += info.promptTokens ?? 0;
        totals.outputTokens += info.completionTokens ?? 0;
        totals.costUsd += info.cost ?? 0;
      },
    };
    const stream = chat({
      adapter: textAdapter(model.id),
      systemPrompts: [systemPrompt(request.locale)],
      messages: run.history,
      mcp: { clients: mcp.clients, connection: "keep-alive" },
      abortController: controller,
      // Narrowed per model by TanStack's static catalog; ours come from configuration.
      ...(model.reasoning && { reasoning: model.reasoning as never }),
      ...(model.provider && { modelOptions: { provider: model.provider } as never }),
      middleware: [...llmMiddleware(), usage],
    });

    for await (const chunk of stream) {
      if (chunk.type === "RUN_ERROR") throw new ProviderError(chunk.message, chunk.code ?? "provider_error");
      for (const event of apply(normalizer.push(chunk))) {
        yield event;
        if (event.type === EventType.STEP_FINISHED) await persist(run, state, totals, startedAt);
      }
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    yield* apply(normalizer.finish(totals));
  } catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : undefined;
    if (reason === "client") {
      state = interruptRun(state);
    } else if (reason === "timeout") {
      timedOut = true;
      yield* apply(normalizer.fail("The model took too long to answer.", "timeout"));
    } else {
      logger.error({ err: error, conversationId: request.conversationId }, "agent run failed");
      span.recordException(error as Error);
      const code = error instanceof ProviderError ? error.code : "agent_error";
      yield* apply(normalizer.fail("The model provider returned an error. Please try again.", code));
    }
  } finally {
    clearTimeout(timer);
    clientSignal.removeEventListener("abort", onClientGone);
    // The consumer stopped reading (client gone) before the run ended.
    if (state.status === "streaming") state = interruptRun(state);
    try {
      await persist(run, state, totals, startedAt);
      await mcp?.close();
    } finally {
      finishTelemetry(run, state, totals, Date.now() - startedAt, span, timedOut);
    }
  }
}

function finishTelemetry(
  run: PreparedRun,
  state: RunState,
  totals: RunTotals,
  durationMs: number,
  span: ReturnType<typeof tracer.startSpan>,
  timedOut: boolean,
) {
  const outcome = timedOut ? "timeout" : state.status;
  for (const part of state.parts) {
    if (part.type === "tool-call") {
      const server = part.serverId ?? "unknown";
      // Model-visible names are `${serverId}_${tool}`: the label is the tool's own name.
      const tool = part.toolName.startsWith(`${server}_`) ? part.toolName.slice(server.length + 1) : part.toolName;
      recordToolCall({ server, tool, status: part.status });
    }
  }
  recordAgentRun({ model: run.model.id, outcome }, durationMs);
  span.setAttributes({
    "sinapps.run.outcome": outcome,
    "gen_ai.usage.input_tokens": totals.inputTokens,
    "gen_ai.usage.output_tokens": totals.outputTokens,
    "sinapps.run.cost_usd": totals.costUsd,
  });
  if (state.status === "error") span.setStatus({ code: SpanStatusCode.ERROR, message: outcome });
  span.end();
  logger.info(
    {
      conversationId: run.request.conversationId,
      model: run.model.id,
      outcome,
      durationMs,
      tokensIn: totals.inputTokens,
      tokensOut: totals.outputTokens,
      costUsd: totals.costUsd,
    },
    "agent run finished",
  );
}

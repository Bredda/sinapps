/**
 * Projection of a normalized AG-UI event stream into SDK-independent message parts
 * (docs/architecture-proposal.md §3.4).
 *
 * Pure and isomorphic: the server folds the stream it emits to persist the assistant
 * message, the browser folds the stream it receives to render it live. Both sides
 * therefore always agree on what a turn looks like.
 */
import { type AGUIEvent, EventType } from "@ag-ui/core";
import type { MessagePart } from "@sinapps/db/parts";
import { parse as parsePartialJson } from "partial-json";

/** App conventions carried in standard AG-UI `metadata` fields. */
export interface ToolCallMetadata {
  title?: string;
  serverId?: string;
  uiResourceUri?: string;
}

export interface RunFinishedMetadata {
  costUsd?: number;
}

export type RunStatus = "streaming" | "done" | "error" | "interrupted";

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RunState {
  parts: MessagePart[];
  status: RunStatus;
  /** Index of the current ReAct step (one model call). */
  step: number;
  usage?: RunUsage;
  /** Raw tool-call argument text and start times, by toolCallId (transient, not persisted). */
  pending: Record<string, { args: string; startedAt?: number }>;
}

export const initialRunState = (): RunState => ({ parts: [], status: "streaming", step: 0, pending: {} });

type Part<T extends MessagePart["type"]> = Extract<MessagePart, { type: T }>;

function updatePart<T extends MessagePart["type"]>(
  state: RunState,
  type: T,
  id: string,
  update: (part: Part<T>) => Part<T>,
): RunState {
  const index = state.parts.findIndex((part) => part.type === type && part.id === id);
  if (index === -1) return state;
  const parts = state.parts.slice();
  parts[index] = update(parts[index] as Part<T>);
  return { ...state, parts };
}

const append = (state: RunState, part: MessagePart): RunState => ({ ...state, parts: [...state.parts, part] });

/** Tool payloads are JSON in practice; keep the raw text when they aren't. */
function parseJson(text: string): Part<"tool-call">["args"] {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Best-effort parse of streaming tool arguments (MCP Apps `tool-input-partial`, live previews). */
export function parsePartialArgs(text: string): Part<"tool-call">["args"] {
  try {
    return parsePartialJson(text);
  } catch {
    return undefined;
  }
}

function stepFromName(stepName: string, fallback: number): number {
  const match = /^step-(\d+)$/.exec(stepName);
  return match ? Number(match[1]) : fallback;
}

export function reduceRunEvent(state: RunState, event: AGUIEvent): RunState {
  const at = event.timestamp;
  switch (event.type) {
    case EventType.STEP_STARTED:
      return { ...state, step: stepFromName(event.stepName, state.step) };

    case EventType.TEXT_MESSAGE_START:
      return append(state, { type: "text", id: event.messageId, step: state.step, text: "" });
    case EventType.TEXT_MESSAGE_CONTENT:
      return updatePart(state, "text", event.messageId, (part) => ({ ...part, text: part.text + event.delta }));

    case EventType.REASONING_MESSAGE_START:
      return {
        ...append(state, { type: "reasoning", id: event.messageId, step: state.step, text: "" }),
        pending: { ...state.pending, [event.messageId]: { args: "", startedAt: at } },
      };
    case EventType.REASONING_MESSAGE_CONTENT:
      return updatePart(state, "reasoning", event.messageId, (part) => ({ ...part, text: part.text + event.delta }));
    case EventType.REASONING_MESSAGE_END: {
      const startedAt = state.pending[event.messageId]?.startedAt;
      return updatePart(state, "reasoning", event.messageId, (part) =>
        startedAt !== undefined && at !== undefined ? { ...part, durationMs: Math.max(0, at - startedAt) } : part,
      );
    }
    case EventType.REASONING_ENCRYPTED_VALUE:
      return updatePart(state, "reasoning", event.entityId, (part) => ({
        ...part,
        encrypted: part.text.length === 0,
        providerMetadata: { ...part.providerMetadata, encryptedValue: event.encryptedValue },
      }));

    case EventType.TOOL_CALL_START: {
      const meta = (event.metadata ?? {}) as ToolCallMetadata;
      return {
        ...append(state, {
          type: "tool-call",
          id: event.toolCallId,
          step: state.step,
          toolCallId: event.toolCallId,
          toolName: event.toolCallName,
          title: meta.title,
          serverId: meta.serverId,
          uiResourceUri: meta.uiResourceUri,
          status: "streaming-args",
        }),
        pending: { ...state.pending, [event.toolCallId]: { args: "", startedAt: at } },
      };
    }
    case EventType.TOOL_CALL_ARGS: {
      const pending = state.pending[event.toolCallId];
      if (!pending) return state;
      const args = pending.args + event.delta;
      return {
        ...updatePart(state, "tool-call", event.toolCallId, (part) => ({ ...part, args: parsePartialArgs(args) })),
        pending: { ...state.pending, [event.toolCallId]: { ...pending, args } },
      };
    }
    case EventType.TOOL_CALL_END: {
      const args = state.pending[event.toolCallId]?.args ?? "";
      return updatePart(state, "tool-call", event.toolCallId, (part) => ({
        ...part,
        status: "running",
        args: args ? parseJson(args) : {},
      }));
    }
    case EventType.TOOL_CALL_RESULT: {
      const startedAt = state.pending[event.toolCallId]?.startedAt;
      return updatePart(state, "tool-call", event.toolCallId, (part) => ({
        ...part,
        status: "success",
        // AG-UI 1.0 tool results are text or multimodal content parts (already JSON).
        result:
          typeof event.content === "string" ? parseJson(event.content) : (event.content as Part<"tool-call">["result"]),
        durationMs: startedAt !== undefined && at !== undefined ? Math.max(0, at - startedAt) : part.durationMs,
      }));
    }

    case EventType.CUSTOM:
      if (event.name === "ui-resource") {
        const value = event.value as { toolCallId: string; resource: { uri: string } };
        return append(state, {
          type: "widget",
          id: `widget-${value.toolCallId}`,
          toolCallId: value.toolCallId,
          resourceUri: value.resource.uri,
        });
      }
      return state;

    case EventType.RUN_ERROR:
      return {
        ...settleTools(
          append(state, {
            type: "error",
            id: `error-${state.parts.length}`,
            code: event.code,
            message: event.message,
            retryable: true,
          }),
          "cancelled",
        ),
        status: "error",
      };

    case EventType.RUN_FINISHED: {
      let usage = state.usage;
      if (event.usage) {
        usage = { inputTokens: 0, outputTokens: 0, costUsd: (event.metadata as RunFinishedMetadata)?.costUsd ?? 0 };
        for (const entry of event.usage) {
          usage.inputTokens += entry.inputTokens ?? 0;
          usage.outputTokens += entry.outputTokens ?? 0;
        }
      }
      return { ...settleTools(state, "cancelled"), status: "done", usage };
    }

    default:
      return state;
  }
}

/** Tool calls still in flight when a run ends never got a result. */
function settleTools(state: RunState, status: "cancelled" | "error"): RunState {
  if (
    !state.parts.some(
      (part) => part.type === "tool-call" && (part.status === "running" || part.status === "streaming-args"),
    )
  ) {
    return state;
  }
  return {
    ...state,
    parts: state.parts.map((part) =>
      part.type === "tool-call" && (part.status === "running" || part.status === "streaming-args")
        ? { ...part, status }
        : part,
    ),
  };
}

/** Run stopped by the user (or a lost connection): freeze what we have and mark it. */
export function interruptRun(state: RunState): RunState {
  return {
    ...settleTools(
      append(state, { type: "marker", id: `marker-${state.parts.length}`, kind: "interrupted" }),
      "cancelled",
    ),
    status: "interrupted",
  };
}

export const foldRunEvents = (events: Iterable<AGUIEvent>, state = initialRunState()): RunState => {
  let current = state;
  for (const event of events) current = reduceRunEvent(current, event);
  return current;
};

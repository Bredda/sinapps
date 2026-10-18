import { type AGUIEvent, EventType } from "@ag-ui/core";
import type { StreamChunk } from "@tanstack/ai";
import type { RunFinishedMetadata, RunStartedMetadata, ToolCallMetadata, ToolResultMetadata } from "@/lib/agent-run";

export interface RunTotals {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Turns TanStack AI's chunk stream into a strict AG-UI run.
 *
 * TanStack emits one RUN_FINISHED per model call (with a new runId each time) and
 * ties STEP events to reasoning. Strict AG-UI clients expect a single run, so this
 * keeps one RUN_STARTED/RUN_FINISHED pair with our ids, maps each model call to a
 * `step-N` STEP_STARTED/STEP_FINISHED pair (tool results stay in their step), and
 * strips provider-specific fields. Tool display metadata rides on TOOL_CALL_START.
 */
export function createNormalizer(opts: {
  threadId: string;
  runId: string;
  /** Persisted assistant message the run fills (lets the browser swap live parts for stored ones). */
  messageId?: string;
  toolMeta: Map<string, ToolCallMetadata>;
}) {
  let step = 0;
  let stepOpen = false;
  let modelCallDone = false;
  const now = () => Date.now();

  const openStep = (): AGUIEvent[] => {
    const events: AGUIEvent[] = [];
    if (stepOpen && modelCallDone) {
      events.push({ type: EventType.STEP_FINISHED, stepName: `step-${step}`, timestamp: now() });
      step += 1;
      stepOpen = false;
    }
    if (!stepOpen) {
      events.push({ type: EventType.STEP_STARTED, stepName: `step-${step}`, timestamp: now() });
      stepOpen = true;
      modelCallDone = false;
    }
    return events;
  };

  const closeStep = (): AGUIEvent[] => {
    if (!stepOpen) return [];
    stepOpen = false;
    return [{ type: EventType.STEP_FINISHED, stepName: `step-${step}`, timestamp: now() }];
  };

  return {
    start(): AGUIEvent[] {
      const metadata: RunStartedMetadata = { messageId: opts.messageId };
      return [{ type: EventType.RUN_STARTED, threadId: opts.threadId, runId: opts.runId, metadata, timestamp: now() }];
    },

    push(chunk: StreamChunk): AGUIEvent[] {
      const timestamp = chunk.timestamp ?? now();
      switch (chunk.type) {
        case "TEXT_MESSAGE_START":
          return [
            ...openStep(),
            { type: EventType.TEXT_MESSAGE_START, messageId: chunk.messageId, role: "assistant", timestamp },
          ];
        case "TEXT_MESSAGE_CONTENT":
          return [
            ...openStep(),
            { type: EventType.TEXT_MESSAGE_CONTENT, messageId: chunk.messageId, delta: chunk.delta, timestamp },
          ];
        case "TEXT_MESSAGE_END":
          return [{ type: EventType.TEXT_MESSAGE_END, messageId: chunk.messageId, timestamp }];

        case "REASONING_START":
          return [...openStep(), { type: EventType.REASONING_START, messageId: chunk.messageId, timestamp }];
        case "REASONING_MESSAGE_START":
          return [
            ...openStep(),
            { type: EventType.REASONING_MESSAGE_START, messageId: chunk.messageId, role: "reasoning", timestamp },
          ];
        case "REASONING_MESSAGE_CONTENT":
          return [
            { type: EventType.REASONING_MESSAGE_CONTENT, messageId: chunk.messageId, delta: chunk.delta, timestamp },
          ];
        case "REASONING_MESSAGE_END":
          return [{ type: EventType.REASONING_MESSAGE_END, messageId: chunk.messageId, timestamp }];
        case "REASONING_END":
          return [{ type: EventType.REASONING_END, messageId: chunk.messageId, timestamp }];
        case "REASONING_ENCRYPTED_VALUE":
          return [
            {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: chunk.subtype,
              entityId: chunk.entityId,
              encryptedValue: chunk.encryptedValue,
              timestamp,
            },
          ];

        case "TOOL_CALL_START":
          return [
            ...openStep(),
            {
              type: EventType.TOOL_CALL_START,
              toolCallId: chunk.toolCallId,
              toolCallName: chunk.toolCallName,
              metadata: opts.toolMeta.get(chunk.toolCallName) ?? {},
              timestamp,
            },
          ];
        case "TOOL_CALL_ARGS":
          return [{ type: EventType.TOOL_CALL_ARGS, toolCallId: chunk.toolCallId, delta: chunk.delta, timestamp }];
        case "TOOL_CALL_END":
          return [{ type: EventType.TOOL_CALL_END, toolCallId: chunk.toolCallId, timestamp }];
        case "TOOL_CALL_RESULT": {
          // TanStack flags failed tool executions in its own metadata namespace.
          const failed = (chunk.metadata as { tanstack?: { state?: string } } | undefined)?.tanstack?.state;
          const metadata: ToolResultMetadata | undefined = failed === "output-error" ? { isError: true } : undefined;
          return [
            {
              type: EventType.TOOL_CALL_RESULT,
              messageId: chunk.messageId,
              toolCallId: chunk.toolCallId,
              content: chunk.content,
              role: "tool",
              ...(metadata && { metadata }),
              timestamp,
            },
          ];
        }

        case "CUSTOM":
          return chunk.name === "ui-resource"
            ? [{ type: EventType.CUSTOM, name: chunk.name, value: chunk.value, timestamp }]
            : [];

        case "RUN_FINISHED":
          // End of one model call; tool results still belong to this step.
          modelCallDone = true;
          return [];

        default:
          // RUN_STARTED (ours replaces it), reasoning-bound STEP_* events, state events…
          return [];
      }
    },

    finish(totals: RunTotals): AGUIEvent[] {
      const metadata: RunFinishedMetadata = { costUsd: totals.costUsd };
      return [
        ...closeStep(),
        {
          type: EventType.RUN_FINISHED,
          threadId: opts.threadId,
          runId: opts.runId,
          usage: [
            {
              provider: "openrouter",
              model: totals.model,
              inputTokens: totals.inputTokens,
              outputTokens: totals.outputTokens,
              totalTokens: totals.inputTokens + totals.outputTokens,
            },
          ],
          metadata,
          timestamp: now(),
        },
      ];
    },

    fail(message: string, code: string): AGUIEvent[] {
      return [...closeStep(), { type: EventType.RUN_ERROR, message, code, timestamp: now() }];
    },
  };
}

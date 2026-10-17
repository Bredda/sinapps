/**
 * SDK-independent message parts (docs/architecture-proposal.md §2.3, §3.4).
 *
 * This is the format persisted in `message.parts` and rendered by the chat UI.
 * A single adapter in apps/web maps agent SDK messages to and from it, so the
 * rest of the app never depends on TanStack AI types.
 */
import { z } from "zod";

/** Index of the ReAct step (model call) that produced an internal part. */
const step = z.number().int().nonnegative().optional();

export const textPart = z.object({
  type: z.literal("text"),
  id: z.string(),
  text: z.string(),
});

export const reasoningPart = z.object({
  type: z.literal("reasoning"),
  id: z.string(),
  step,
  text: z.string(),
  /** True when the provider only returned an encrypted/redacted payload. */
  encrypted: z.boolean().optional(),
  durationMs: z.number().nonnegative().optional(),
  /** Opaque provider data needed to replay the reasoning to the model (signatures…). */
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const toolCallStatus = z.enum(["streaming-args", "running", "success", "error", "cancelled"]);

export const toolCallPart = z.object({
  type: z.literal("tool-call"),
  id: z.string(),
  step,
  toolCallId: z.string(),
  toolName: z.string(),
  /** Human-readable name resolved from the MCP tool definition. */
  title: z.string().optional(),
  /** MCP server (pool key) that owns the tool. */
  serverId: z.string().optional(),
  /** MCP Apps link, known from TOOL_CALL_START: the widget frame can render early. */
  uiResourceUri: z.string().optional(),
  status: toolCallStatus,
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export const widgetPart = z.object({
  type: z.literal("widget"),
  id: z.string(),
  toolCallId: z.string(),
  serverId: z.string().optional(),
  resourceUri: z.string(),
  widgetId: z.string().optional(),
  version: z.number().int().positive().optional(),
});

export const sourcePart = z.object({
  type: z.literal("source"),
  id: z.string(),
  /** Citation number used as `[n]` in the text. */
  index: z.number().int().positive(),
  url: z.url(),
  title: z.string().optional(),
});

export const imagePart = z.object({
  type: z.literal("image"),
  id: z.string(),
  url: z.url(),
  alt: z.string().optional(),
  credit: z
    .object({
      author: z.string().optional(),
      license: z.string().optional(),
      sourceUrl: z.url().optional(),
    })
    .optional(),
});

export const questionPart = z.object({
  type: z.literal("question"),
  id: z.string(),
  toolCallId: z.string(),
  prompt: z.string(),
  /** Questionnaire definition; its shape is owned by the UI component. */
  form: z.unknown(),
  answer: z.unknown().optional(),
});

export const errorPart = z.object({
  type: z.literal("error"),
  id: z.string(),
  code: z.string().optional(),
  message: z.string(),
  retryable: z.boolean().default(true),
});

export const markerPart = z.object({
  type: z.literal("marker"),
  id: z.string(),
  kind: z.enum(["model-change", "interrupted", "auto-fix"]),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const messagePart = z.discriminatedUnion("type", [
  textPart,
  reasoningPart,
  toolCallPart,
  widgetPart,
  sourcePart,
  imagePart,
  questionPart,
  errorPart,
  markerPart,
]);

export const messageParts = z.array(messagePart);

export type MessagePart = z.infer<typeof messagePart>;
export type MessagePartType = MessagePart["type"];
export type ToolCallStatus = z.infer<typeof toolCallStatus>;

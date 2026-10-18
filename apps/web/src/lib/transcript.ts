/**
 * What the chat renders: stored messages merged with the run streaming in this tab,
 * and assistant parts grouped into display blocks (docs/architecture-proposal.md §2.3).
 * Pure, so the rules are unit-tested and shared by the conversation and /dev/parts pages.
 */
import type { MessagePart } from "@sinapps/db/parts";
import type { RunState } from "./agent-run";

export type MessageStatus = "streaming" | "done" | "interrupted" | "error";

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  status: MessageStatus;
  source: "user" | "app" | "auto_fix" | null;
  modelId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

/** A run started from this tab, rendered from its events until the stored row is final. */
export interface LiveRun {
  /** Optimistic copy of the message being sent (send, edit). */
  userMessage?: { id: string; text: string };
  /** Stored messages the run replaces (regenerate, edit). */
  replaces: string[];
  modelId: string;
  startedAt: number;
  state: RunState;
}

const LIVE_ID = "live-assistant";

function liveAssistant(live: LiveRun): TranscriptMessage {
  const { state } = live;
  return {
    id: state.messageId ?? LIVE_ID,
    role: "assistant",
    parts: state.parts,
    status: state.status,
    source: null,
    modelId: live.modelId,
    tokensIn: state.usage?.inputTokens ?? null,
    tokensOut: state.usage?.outputTokens ?? null,
    costUsd: state.usage?.costUsd ?? null,
    durationMs: null,
  };
}

/** True once the database holds the final version of the live run's answer. */
export function isLiveRunSettled(stored: TranscriptMessage[], live: LiveRun): boolean {
  const id = live.state.messageId;
  return id !== undefined && stored.some((message) => message.id === id && message.status !== "streaming");
}

export function mergeTranscript(stored: TranscriptMessage[], live: LiveRun | null): TranscriptMessage[] {
  if (!live || isLiveRunSettled(stored, live)) return stored;
  // Stored rows may already include the run's own rows (any loader refresh mid-run): drop them, the live copy wins.
  const hidden = new Set([...live.replaces, live.userMessage?.id, live.state.messageId]);
  const merged = stored.filter((message) => !hidden.has(message.id));
  if (live.userMessage) {
    merged.push({
      id: live.userMessage.id,
      role: "user",
      parts: [{ type: "text", id: `${live.userMessage.id}-text`, text: live.userMessage.text }],
      status: "done",
      source: "user",
      modelId: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      durationMs: null,
    });
  }
  merged.push(liveAssistant(live));
  return merged;
}

/** Ids of the messages a regenerate (or an edit) of the last turn drops. */
export function lastTurn(messages: TranscriptMessage[]): { lastUser?: TranscriptMessage; answers: string[] } {
  const index = messages.findLastIndex((message) => message.role === "user");
  return {
    lastUser: messages[index],
    answers: messages.slice(index + 1).map((message) => message.id),
  };
}

export type TracePart = Extract<MessagePart, { type: "reasoning" | "tool-call" }>;
export type FlowPart = Exclude<MessagePart, TracePart | { type: "source" }>;
export type SourcePart = Extract<MessagePart, { type: "source" }>;

export type Block =
  | { kind: "trace"; key: string; parts: TracePart[] }
  | { kind: "sources"; key: string; parts: SourcePart[] }
  | { kind: "part"; key: string; part: FlowPart };

const isTracePart = (part: MessagePart): part is TracePart => part.type === "reasoning" || part.type === "tool-call";

/**
 * Strict order, with consecutive internal parts (reasoning, tool calls) folded into
 * one Trace and consecutive sources into one list. Blank text between two steps
 * doesn't split a Trace.
 */
export function groupParts(parts: MessagePart[]): Block[] {
  const blocks: Block[] = [];
  for (const part of parts) {
    const last = blocks.at(-1);
    if (part.type === "text" && !part.text.trim()) continue;
    if (isTracePart(part)) {
      if (last?.kind === "trace") last.parts.push(part);
      else blocks.push({ kind: "trace", key: part.id, parts: [part] });
    } else if (part.type === "source") {
      if (last?.kind === "sources") last.parts.push(part);
      else blocks.push({ kind: "sources", key: part.id, parts: [part] });
    } else {
      blocks.push({ kind: "part", key: part.id, part });
    }
  }
  return blocks;
}

/** Markdown of an assistant answer, for the copy action. */
export function messageMarkdown(message: TranscriptMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text.trim()] : []))
    .join("\n\n");
}

/** A tool call or reasoning that has not reached a final state. */
export function isTracePartActive(part: TracePart, messageStreaming: boolean, isLastPart: boolean): boolean {
  if (part.type === "tool-call") return part.status === "streaming-args" || part.status === "running";
  return messageStreaming && isLastPart && part.durationMs === undefined;
}

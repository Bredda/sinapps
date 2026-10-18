import type { MessagePart } from "@sinapps/db/parts";
import type { ModelMessage } from "@tanstack/ai";

interface StoredMessage {
  role: "user" | "assistant";
  parts: MessagePart[];
}

const asText = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value ?? null));

/**
 * Rebuilds the model transcript from persisted parts: one assistant message per
 * ReAct step (its text and tool calls), followed by the matching tool results.
 * Tool calls that never got a result (stopped run) are dropped: providers reject
 * a tool call without its result.
 */
export function toModelMessages(messages: StoredMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
      if (text) out.push({ role: "user", content: text });
      continue;
    }

    const steps = new Map<number, MessagePart[]>();
    for (const part of message.parts) {
      if (part.type !== "text" && part.type !== "tool-call") continue;
      const step = part.step ?? 0;
      steps.set(step, [...(steps.get(step) ?? []), part]);
    }
    for (const step of [...steps.keys()].sort((a, b) => a - b)) {
      const parts = steps.get(step) ?? [];
      const text = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
      const calls = parts.filter(
        (part): part is Extract<MessagePart, { type: "tool-call" }> =>
          part.type === "tool-call" && (part.status === "success" || part.status === "error"),
      );
      if (!text && calls.length === 0) continue;
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length > 0 && {
          toolCalls: calls.map((call) => ({
            id: call.toolCallId,
            type: "function" as const,
            function: { name: call.toolName, arguments: asText(call.args ?? {}) },
          })),
        }),
      });
      for (const call of calls) {
        out.push({ role: "tool", toolCallId: call.toolCallId, content: asText(call.error ?? call.result) });
      }
    }
  }
  return out;
}

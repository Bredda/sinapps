import type { MessagePart } from "@sinapps/db/parts";
import { describe, expect, it } from "vitest";
import { initialRunState } from "./agent-run";
import {
  groupParts,
  type LiveRun,
  lastTurn,
  mergeTranscript,
  messageMarkdown,
  type TranscriptMessage,
} from "./transcript";

const message = (
  id: string,
  role: "user" | "assistant",
  overrides: Partial<TranscriptMessage> = {},
): TranscriptMessage => ({
  id,
  role,
  parts: [{ type: "text", id: `${id}-t`, text: id }],
  status: "done",
  source: role === "user" ? "user" : null,
  modelId: role === "assistant" ? "model-a" : null,
  tokensIn: null,
  tokensOut: null,
  costUsd: null,
  durationMs: null,
  ...overrides,
});

const live = (overrides: Partial<LiveRun> = {}, messageId?: string): LiveRun => ({
  replaces: [],
  modelId: "model-a",
  startedAt: 0,
  state: { ...initialRunState(), messageId },
  ...overrides,
});

const ids = (messages: TranscriptMessage[]) => messages.map((m) => m.id);

describe("mergeTranscript", () => {
  const stored = [message("u1", "user"), message("a1", "assistant")];

  it("appends the optimistic user message and the live answer", () => {
    const merged = mergeTranscript(stored, live({ userMessage: { id: "u2", text: "Hi" } }));
    expect(ids(merged)).toEqual(["u1", "a1", "u2", "live-assistant"]);
    expect(merged.at(-1)).toMatchObject({ role: "assistant", status: "streaming" });
  });

  it("hides the messages a regenerate replaces", () => {
    expect(ids(mergeTranscript(stored, live({ replaces: ["a1"] })))).toEqual(["u1", "live-assistant"]);
  });

  it("keeps a single copy when a refresh brings the run's own rows mid-run", () => {
    const refreshed = [...stored, message("u2", "user"), message("a2", "assistant", { status: "streaming" })];
    const merged = mergeTranscript(refreshed, live({ userMessage: { id: "u2", text: "Hi" } }, "a2"));
    expect(ids(merged)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(merged.at(-1)?.status).toBe("streaming");
  });

  it("switches to the stored rows once the answer is final", () => {
    const final = [...stored, message("u2", "user"), message("a2", "assistant")];
    expect(mergeTranscript(final, live({ userMessage: { id: "u2", text: "Hi" } }, "a2"))).toBe(final);
  });
});

describe("lastTurn", () => {
  it("finds the last user message and the answers after it", () => {
    const messages = [
      message("u1", "user"),
      message("a1", "assistant"),
      message("u2", "user"),
      message("a2", "assistant"),
    ];
    expect(lastTurn(messages)).toMatchObject({ lastUser: { id: "u2" }, answers: ["a2"] });
  });
});

describe("groupParts", () => {
  const parts: MessagePart[] = [
    { type: "reasoning", id: "r1", text: "Hmm" },
    { type: "text", id: "blank", text: "\n" },
    { type: "tool-call", id: "c1", toolCallId: "c1", toolName: "search", status: "success" },
    { type: "text", id: "t1", text: "Answer" },
    { type: "source", id: "s1", index: 1, url: "https://a.example" },
    { type: "source", id: "s2", index: 2, url: "https://b.example" },
    { type: "reasoning", id: "r2", text: "More" },
  ];

  it("folds consecutive internal parts into one Trace and keeps the order", () => {
    expect(
      groupParts(parts).map((block) => `${block.kind}:${block.kind === "part" ? block.part.id : block.parts.length}`),
    ).toEqual(["trace:2", "part:t1", "sources:2", "trace:1"]);
  });

  it("copies the answer's text as Markdown", () => {
    expect(messageMarkdown(message("a", "assistant", { parts }))).toBe("Answer");
  });
});

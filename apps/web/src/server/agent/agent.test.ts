import { type AGUIEvent, EventType } from "@ag-ui/core";
import { EventSchemas } from "@ag-ui/core/schemas";
import type { MessagePart } from "@sinapps/db/parts";
import type { StreamChunk } from "@tanstack/ai";
import { describe, expect, it } from "vitest";
import { foldRunEvents, interruptRun, reduceRunEvent } from "@/lib/agent-run";
import { toModelMessages } from "./history.server";
import { createNormalizer } from "./normalize";

// A two-step ReAct turn as TanStack AI streams it (shapes captured from real runs):
// one RUN_FINISHED per model call, reasoning-bound STEP events, provider metadata.
const tanstackTurn = [
  { type: "RUN_STARTED", runId: "openrouter-1", threadId: "thread-x", timestamp: 1000 },
  { type: "REASONING_START", messageId: "r1", timestamp: 1001 },
  { type: "REASONING_MESSAGE_START", messageId: "r1", role: "reasoning", timestamp: 1001 },
  { type: "STEP_STARTED", stepName: "openrouter-step", timestamp: 1001 },
  { type: "REASONING_MESSAGE_CONTENT", messageId: "r1", delta: "Need offers", timestamp: 1002 },
  { type: "REASONING_MESSAGE_END", messageId: "r1", timestamp: 1500 },
  { type: "REASONING_END", messageId: "r1", timestamp: 1500 },
  { type: "STEP_FINISHED", stepName: "openrouter-step", timestamp: 1500 },
  {
    type: "TOOL_CALL_START",
    toolCallId: "call_1",
    toolCallName: "demo_get_offers",
    toolName: "demo_get_offers",
    parentMessageId: "m1",
    metadata: { tanstack: { model: "x" } },
    timestamp: 1600,
  },
  { type: "TOOL_CALL_ARGS", toolCallId: "call_1", delta: '{"country":', timestamp: 1601 },
  { type: "TOOL_CALL_ARGS", toolCallId: "call_1", delta: '"FR"}', timestamp: 1602 },
  { type: "TOOL_CALL_END", toolCallId: "call_1", input: { country: "FR" }, timestamp: 1603 },
  { type: "RUN_FINISHED", runId: "openrouter-1", threadId: "thread-x", finishReason: "tool_calls", timestamp: 1700 },
  {
    type: "TOOL_CALL_RESULT",
    messageId: "m1",
    toolCallId: "call_1",
    content: '{"offers":3}',
    role: "tool",
    timestamp: 1900,
  },
  { type: "TEXT_MESSAGE_START", messageId: "t1", role: "assistant", timestamp: 2000 },
  { type: "TEXT_MESSAGE_CONTENT", messageId: "t1", delta: "Plan B ", timestamp: 2001 },
  { type: "TEXT_MESSAGE_CONTENT", messageId: "t1", delta: "wins.", timestamp: 2002 },
  { type: "TEXT_MESSAGE_END", messageId: "t1", timestamp: 2003 },
  { type: "RUN_FINISHED", runId: "openrouter-2", threadId: "thread-x", finishReason: "stop", timestamp: 2100 },
] as unknown as StreamChunk[];

function normalize(chunks: StreamChunk[]): AGUIEvent[] {
  const normalizer = createNormalizer({
    threadId: "conv-1",
    runId: "run-1",
    messageId: "msg-1",
    toolMeta: new Map([["demo_get_offers", { title: "Offers", serverId: "demo" }]]),
  });
  return [
    ...normalizer.start(),
    ...chunks.flatMap((chunk) => normalizer.push(chunk)),
    ...normalizer.finish({ model: "m", inputTokens: 100, outputTokens: 20, costUsd: 0.01 }),
  ];
}

describe("normalizer", () => {
  const events = normalize(tanstackTurn);
  const types = events.map((event) => event.type);

  it("emits a single strict AG-UI run", () => {
    expect(types.filter((type) => type === "RUN_STARTED")).toHaveLength(1);
    expect(types.filter((type) => type === "RUN_FINISHED")).toHaveLength(1);
    expect(types[0]).toBe("RUN_STARTED");
    expect(types.at(-1)).toBe("RUN_FINISHED");
    expect(events[0]).toMatchObject({ threadId: "conv-1", runId: "run-1" });
    for (const event of events) expect(() => EventSchemas.parse(event)).not.toThrow();
  });

  it("maps model calls to steps and keeps tool results in their step", () => {
    const steps = events.filter((e) => e.type === "STEP_STARTED" || e.type === "STEP_FINISHED");
    expect(steps.map((e) => `${e.type}:${"stepName" in e ? e.stepName : ""}`)).toEqual([
      "STEP_STARTED:step-0",
      "STEP_FINISHED:step-0",
      "STEP_STARTED:step-1",
      "STEP_FINISHED:step-1",
    ]);
    expect(types.indexOf(EventType.TOOL_CALL_RESULT)).toBeLessThan(types.indexOf(EventType.STEP_FINISHED));
  });

  it("puts display metadata on TOOL_CALL_START and drops provider fields", () => {
    const start = events.find((e) => e.type === "TOOL_CALL_START");
    expect(start).toMatchObject({ metadata: { title: "Offers", serverId: "demo" } });
    expect(start).not.toHaveProperty("toolName");
    expect(JSON.stringify(events)).not.toContain("tanstack");
  });
});

describe("run reducer", () => {
  const state = foldRunEvents(normalize(tanstackTurn));

  it("projects the turn into ordered parts", () => {
    expect(state.status).toBe("done");
    expect(state.parts.map((part) => `${part.type}@${"step" in part ? part.step : "-"}`)).toEqual([
      "reasoning@0",
      "tool-call@0",
      "text@1",
    ]);
    expect(state.parts[0]).toMatchObject({ text: "Need offers", durationMs: 499 });
    expect(state.parts[1]).toMatchObject({
      status: "success",
      title: "Offers",
      args: { country: "FR" },
      result: { offers: 3 },
      durationMs: 300,
    });
    expect(state.parts[2]).toMatchObject({ text: "Plan B wins." });
    expect(state.usage).toEqual({ inputTokens: 100, outputTokens: 20, costUsd: 0.01 });
  });

  it("parses streaming tool arguments as they arrive", () => {
    const partial = foldRunEvents(normalize(tanstackTurn.slice(0, 10)).filter((e) => e.type !== "RUN_FINISHED"));
    expect(partial.parts.find((part) => part.type === "tool-call")).toMatchObject({ status: "streaming-args" });
  });

  it("cancels in-flight tools and marks an interrupted run", () => {
    const running = foldRunEvents(normalize(tanstackTurn.slice(0, 12)).filter((e) => e.type !== "RUN_FINISHED"));
    const stopped = interruptRun(running);
    expect(stopped.status).toBe("interrupted");
    expect(stopped.parts.find((part) => part.type === "tool-call")).toMatchObject({ status: "cancelled" });
    expect(stopped.parts.at(-1)).toMatchObject({ type: "marker", kind: "interrupted" });
  });

  it("records the persisted message announced by RUN_STARTED", () => {
    expect(state.messageId).toBe("msg-1");
  });

  it("marks failed tool executions as errors", () => {
    // TanStack AI flags them in its own metadata namespace, with `{ error }` content.
    const failedTurn = tanstackTurn.map((chunk) =>
      chunk.type === "TOOL_CALL_RESULT"
        ? { ...chunk, content: '{"error":"rate limited"}', metadata: { tanstack: { state: "output-error" } } }
        : chunk,
    ) as StreamChunk[];
    const events = normalize(failedTurn);
    expect(events.find((e) => e.type === "TOOL_CALL_RESULT")).toMatchObject({ metadata: { isError: true } });
    expect(foldRunEvents(events).parts[1]).toMatchObject({ status: "error", error: "rate limited" });
  });

  it("turns RUN_ERROR into a retryable error part", () => {
    const failed = reduceRunEvent(foldRunEvents([]), {
      type: "RUN_ERROR",
      message: "boom",
      code: "timeout",
    } as AGUIEvent);
    expect(failed.status).toBe("error");
    expect(failed.parts[0]).toMatchObject({ type: "error", message: "boom", code: "timeout", retryable: true });
  });
});

describe("toModelMessages", () => {
  const parts = foldRunEvents(normalize(tanstackTurn)).parts;
  const user: MessagePart[] = [{ type: "text", id: "u1", text: "Best plan?" }];

  it("rebuilds one assistant message per step with its tool results", () => {
    expect(
      toModelMessages([
        { role: "user", parts: user },
        { role: "assistant", parts },
      ]),
    ).toEqual([
      { role: "user", content: "Best plan?" },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          { id: "call_1", type: "function", function: { name: "demo_get_offers", arguments: '{"country":"FR"}' } },
        ],
      },
      { role: "tool", toolCallId: "call_1", content: '{"offers":3}' },
      { role: "assistant", content: "Plan B wins." },
    ]);
  });

  it("drops tool calls that never got a result", () => {
    const stopped = interruptRun(
      foldRunEvents(normalize(tanstackTurn.slice(0, 12)).filter((e) => e.type !== "RUN_FINISHED")),
    );
    expect(toModelMessages([{ role: "assistant", parts: stopped.parts }])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { messageParts } from "./parts";

describe("messageParts", () => {
  it("accepts a full ReAct turn", () => {
    const parts = [
      { type: "reasoning", id: "r1", step: 0, text: "I need prices", durationMs: 2100 },
      {
        type: "tool-call",
        id: "t1",
        step: 0,
        toolCallId: "call_1",
        toolName: "tavily-search",
        serverId: "tavily",
        status: "success",
        args: { query: "plan prices" },
        result: { results: [] },
        durationMs: 1200,
      },
      { type: "text", id: "x1", text: "Plan B is the best value [1]" },
      { type: "source", id: "s1", index: 1, url: "https://example.com/plans", title: "Plans" },
      { type: "marker", id: "m1", kind: "interrupted" },
    ];
    expect(messageParts.parse(parts)).toHaveLength(5);
  });

  it("defaults error parts to retryable", () => {
    const [part] = messageParts.parse([{ type: "error", id: "e1", message: "Provider timeout" }]);
    expect(part).toMatchObject({ type: "error", retryable: true });
  });

  it("rejects unknown part types and invalid tool statuses", () => {
    expect(messageParts.safeParse([{ type: "video", id: "v1" }]).success).toBe(false);
    expect(
      messageParts.safeParse([{ type: "tool-call", id: "t1", toolCallId: "c", toolName: "x", status: "done" }]).success,
    ).toBe(false);
  });
});

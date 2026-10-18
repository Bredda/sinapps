/**
 * Scripted model for end-to-end tests (SINAPPS_E2E_MOCK_LLM=true, never in production):
 * no network, no API key, deterministic answers chosen from the user's prompt.
 *
 *  - "search …"  → a web search tool call, then a Markdown summary
 *  - "slow …"    → answers after a delay (time to press Stop)
 *  - "boom …"    → provider error
 *  - otherwise   → echoes the prompt
 */
import type { ContentPart, ModelMessage, TextOptions } from "@tanstack/ai";
import { type FakeResponse, fakeText } from "@tanstack/ai/testing";

const textOf = (content: ModelMessage["content"]): string =>
  typeof content === "string"
    ? content
    : (content ?? []).map((part: ContentPart) => (part.type === "text" ? part.content : "")).join("");

const SLOW_MS = 4000;
const TITLE_PROMPT = "You name chat conversations";

async function answer({ request }: { request: TextOptions }): Promise<FakeResponse> {
  const isTitle = (request.systemPrompts ?? []).some((prompt) =>
    (typeof prompt === "string" ? prompt : prompt.content).includes(TITLE_PROMPT),
  );
  if (isTitle) return { text: "Mock conversation" };

  const last = request.messages.at(-1);
  const prompt = textOf(request.messages.findLast((message) => message.role === "user")?.content ?? "");

  if (last?.role === "tool") {
    return {
      text: [
        "Here is what I found [1]:",
        "",
        "| Source | Verdict |",
        "| --- | --- |",
        "| Example | Sunny |",
        "",
        "```ts",
        "const answer = 42;",
        "```",
      ].join("\n"),
    };
  }
  if (/\bboom\b/i.test(prompt)) return { error: "Mock provider failure" };
  if (/\bslow\b/i.test(prompt)) {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return { text: "Finally, a slow answer." };
  }
  if (/\bsearch\b/i.test(prompt)) {
    return {
      thinking: "I should search the web for this.",
      toolCalls: [{ name: "tavily_tavily_search", input: { query: prompt } }],
    };
  }
  return { text: `Mock answer to: ${prompt}` };
}

/** A fresh fake per call site; each model call of a run consumes one scripted step. */
export function mockTextAdapter(model: string) {
  const fake = fakeText({ model, tokensPerSecond: 400 });
  fake.setResponses(Array.from({ length: 12 }, () => answer));
  return fake;
}

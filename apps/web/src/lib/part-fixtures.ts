/**
 * Every part type in each of its states, for the /dev/parts catalog (and the
 * Playwright screenshots built on it). Not product data: content is fixed English.
 */
import type { MessagePart } from "@sinapps/db/parts";
import type { TranscriptMessage } from "./transcript";

const MARKDOWN = `Plan **B** is the best value: it costs less per GB and includes 5G [1][2].

| Plan | Data | Price |
| --- | ---: | ---: |
| A | 20 GB | €9.99 |
| B | 100 GB | €14.99 |

\`\`\`ts
const pricePerGb = (price: number, gb: number) => price / gb;
\`\`\`

The monthly cost per GB is $$\\frac{14.99}{100} \\approx 0.15$$ €.`;

const IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="160" cy="120" r="36" fill="#fde047"/></svg>',
)}`;

const searchResult = {
  query: "mobile plans 100GB price",
  results: [
    { title: "Best mobile plans in 2026", url: "https://www.example.com/plans" },
    { title: "Compare 5G offers", url: "https://compare.example.org/5g" },
  ],
};

const message = (id: string, parts: MessagePart[], overrides: Partial<TranscriptMessage> = {}): TranscriptMessage => ({
  id,
  role: "assistant",
  parts,
  status: "done",
  source: null,
  modelId: "anthropic/claude-sonnet-5.5",
  tokensIn: 1834,
  tokensOut: 412,
  costUsd: 0.01168,
  durationMs: 8400,
  ...overrides,
});

type Part<T extends MessagePart["type"]> = Extract<MessagePart, { type: T }>;

const reasoning = (id: string, text: string, durationMs?: number): Part<"reasoning"> => ({
  type: "reasoning",
  id,
  step: 0,
  text,
  durationMs,
});

const search = (id: string, status: Part<"tool-call">["status"]): Part<"tool-call"> => ({
  type: "tool-call",
  id,
  step: 0,
  toolCallId: id,
  toolName: "tavily_tavily_search",
  serverId: "tavily",
  title: "Tavily Search",
  status,
  args: { query: "mobile plans 100GB price", max_results: 5 },
  ...(status === "success" && { result: searchResult, durationMs: 1200 }),
  ...(status === "error" && { error: 'MCP tool "tavily_search" returned an error: rate limited', durationMs: 300 }),
});

export interface Fixture {
  title: string;
  messages: TranscriptMessage[];
}

export const fixtures: Fixture[] = [
  {
    title: "Text: Markdown (GFM table, code, math)",
    messages: [
      {
        ...message("u1", [{ type: "text", id: "u1t", text: "Which plan is the best deal?" }]),
        role: "user",
        source: "user",
      },
      message("a1", [
        { type: "text", id: "a1t", text: MARKDOWN },
        {
          type: "source",
          id: "s1",
          index: 1,
          url: "https://www.example.com/plans",
          title: "Best mobile plans in 2026",
        },
        { type: "source", id: "s2", index: 2, url: "https://compare.example.org/5g" },
      ]),
    ],
  },
  {
    title: "Text: streaming",
    messages: [
      message("a2", [{ type: "text", id: "a2t", text: "Plan **B** is the best value: it costs less per GB and" }], {
        status: "streaming",
      }),
    ],
  },
  {
    title: "Pending: waiting for the first token",
    messages: [message("a3", [], { status: "streaming" })],
  },
  {
    title: "Reasoning: streaming, done, encrypted",
    messages: [
      message("a4", [reasoning("r1", "The user wants up-to-date prices, so I should search the web first…")], {
        status: "streaming",
      }),
      message("a5", [
        reasoning("r2", "Plan B has the best cost per GB.", 2100),
        { type: "text", id: "a5t", text: "Plan B." },
      ]),
      message("a6", [
        { type: "reasoning", id: "r3", step: 0, text: "", encrypted: true, durationMs: 3400 },
        { type: "text", id: "a6t", text: "Plan B." },
      ]),
    ],
  },
  {
    title: "Tool calls: streaming arguments, running, success, error, cancelled",
    messages: [
      message("a7", [{ ...search("t1", "streaming-args"), args: { query: "mobile pl" } }], { status: "streaming" }),
      message("a8", [search("t2", "running")], { status: "streaming" }),
      message("a9", [search("t3", "success"), { type: "text", id: "a9t", text: "Two sources found." }]),
      message("a10", [search("t4", "error"), { type: "text", id: "a10t", text: "The search failed." }]),
      message("a11", [search("t5", "cancelled"), { type: "marker", id: "m1", kind: "interrupted" }], {
        status: "interrupted",
      }),
    ],
  },
  {
    title: "Generic tool (no dedicated renderer)",
    messages: [
      message("a12", [
        {
          type: "tool-call",
          id: "t6",
          step: 0,
          toolCallId: "t6",
          toolName: "spike_get_mobile_offers",
          serverId: "spike",
          status: "success",
          args: { operator: "all" },
          result: [{ name: "Plan A", gb: 20, price: 9.99 }],
          durationMs: 450,
        },
        { type: "text", id: "a12t", text: "Here are the offers." },
      ]),
    ],
  },
  {
    title: "Trace: a multi-step ReAct turn, running then done",
    messages: [
      message(
        "a13",
        [
          reasoning("r4", "I need up-to-date prices.", 2100),
          search("t7", "success"),
          { ...reasoning("r5", "Plan B has the best cost per GB…"), step: 1 },
        ],
        { status: "streaming" },
      ),
      message("a14", [
        reasoning("r6", "I need up-to-date prices.", 2100),
        search("t8", "success"),
        { ...search("t9", "error"), step: 1 },
        { ...reasoning("r7", "One search failed; the first one is enough.", 1500), step: 1 },
        { type: "text", id: "a14t", step: 1, text: "Plan B is the best value." },
      ]),
    ],
  },
  {
    title: "Errors: timeout, provider error (retry)",
    messages: [
      message(
        "a15",
        [{ type: "error", id: "e1", code: "timeout", message: "The model took too long to answer.", retryable: true }],
        {
          status: "error",
        },
      ),
      message(
        "a16",
        [
          { type: "text", id: "a16t", text: "Let me check…" },
          { type: "error", id: "e2", code: "provider_error", message: "Upstream 502", retryable: true },
        ],
        { status: "error" },
      ),
    ],
  },
  {
    title: "Markers, widget placeholder, image, question",
    messages: [
      message("a17", [
        { type: "marker", id: "m2", kind: "auto-fix" },
        { type: "widget", id: "w1", toolCallId: "t10", resourceUri: "ui://genui/table" },
        {
          type: "image",
          id: "i1",
          // Inline, so the catalog renders offline.
          url: IMAGE,
          alt: "A sunset over the sea",
          credit: { author: "Jane Doe", license: "CC BY 4.0", sourceUrl: "https://example.com/photos/sunset" },
        },
        { type: "question", id: "q1", toolCallId: "t11", prompt: "Which city do you leave from?", form: {} },
      ]),
    ],
  },
  {
    title: "User message from a widget",
    messages: [
      {
        ...message("u2", [{ type: "text", id: "u2t", text: "Visualize these gaps" }]),
        role: "user",
        source: "app",
      },
    ],
  },
];

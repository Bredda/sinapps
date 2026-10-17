import { chat, toolDefinition, type StreamChunk } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const renderCanvas = toolDefinition({
  name: "render_canvas",
  description: "Render HTML",
  inputSchema: z.object({ html: z.string() }),
}).server(async () => ({ ok: true }));

for (const model of process.argv.slice(2)) {
  let deltas = 0;
  let bytes = 0;
  const stream = chat({
    // biome-ignore lint/suspicious/noExplicitAny: argv model ids
    adapter: openRouterText(model as any),
    messages: [{ role: "user", content: "Call render_canvas with a ~40 line HTML page showing a styled counter button." }],
    tools: [renderCanvas],
    agentLoopStrategy: () => false,
    modelOptions: process.env.PROVIDER ? { provider: { order: [process.env.PROVIDER], allowFallbacks: false } } : undefined,
  } as never);
  for await (const c of stream as AsyncIterable<StreamChunk>) {
    if (c.type === "TOOL_CALL_ARGS") {
      deltas++;
      bytes += c.delta.length;
    }
  }
  console.log(`${model.padEnd(32)} tanstack TOOL_CALL_ARGS=${deltas} bytes=${bytes}`);
}

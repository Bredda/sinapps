import { context, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withContext } from "./telemetry.server";

const manager = new AsyncLocalStorageContextManager();
beforeAll(() => context.setGlobalContextManager(manager.enable()));
afterAll(() => context.disable());

const spanId = "00f067aa0ba902b7";
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const runContext = trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext({ traceId, spanId, traceFlags: 1 }));

/** Records the active span at every step, as the agent loop's spans and logs would see it. */
async function* steps() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve();
    yield trace.getActiveSpan()?.spanContext().spanId;
  }
}

describe("withContext", () => {
  it("runs every generator step in the given context, whoever pulls it", async () => {
    // Created outside the context (as the HTTP handler) and pulled from an unrelated one (the stream's pull).
    const generator = withContext(runContext, steps());
    const seen: (string | undefined)[] = [];
    for await (const step of generator) seen.push(step);
    expect(seen).toEqual([spanId, spanId, spanId]);
  });

  it("is a no-op for the caller's own context", async () => {
    for await (const _ of withContext(runContext, steps())) {
      expect(trace.getActiveSpan()).toBeUndefined();
    }
  });

  it("lets the generator clean up when the consumer leaves early", async () => {
    let cleaned = false;
    async function* withCleanup() {
      try {
        yield 1;
        yield 2;
      } finally {
        cleaned = trace.getActiveSpan()?.spanContext().spanId === spanId;
      }
    }
    for await (const _ of withContext(runContext, withCleanup())) break;
    expect(cleaned).toBe(true);
  });
});

import type { AGUIEvent } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import { EventEncoder } from "@ag-ui/encoder";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getLocale } from "@/paraglide/runtime.js";
import { prepareRun, RunRejected, runAgent } from "@/server/agent/run.server";
import { auth, hasRequiredRole } from "@/server/auth.server";

/** App-specific options, carried in AG-UI `forwardedProps`. */
const forwardedPropsSchema = z
  .object({
    regenerate: z.boolean().optional(),
    /** Replace the last user message with the one sent. */
    edit: z.boolean().optional(),
    /** "app": the message was sent by a widget (MCP Apps ui/message). */
    source: z.enum(["user", "app"]).optional(),
  })
  .default({});

const json = (status: number, error: string) => Response.json({ error }, { status });

/** Pull-based SSE body: the run only advances as fast as the client reads. */
function sseResponse(events: AsyncGenerator<AGUIEvent>, accept: string | null): Response {
  const encoder = new EventEncoder({ accept: accept ?? undefined });
  const bytes = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(bytes.encode(encoder.encodeSSE(value)));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      // Reverse proxies (nginx, Traefik buffering middleware) must not batch events.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * AG-UI endpoint: one POST = one agent run on a conversation (threadId).
 * `messages` carries at most the new user message; the history comes from the database.
 */
export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session || !(await hasRequiredRole(session.user.id))) return json(401, "Unauthorized");

        const input = RunAgentInputSchema.safeParse(await request.json().catch(() => null));
        if (!input.success) return json(400, "Invalid RunAgentInput");
        const forwarded = forwardedPropsSchema.safeParse(input.data.forwardedProps ?? {});
        if (!forwarded.success) return json(400, "Invalid forwardedProps");
        const conversationId = z.uuid().safeParse(input.data.threadId);
        if (!conversationId.success) return json(400, "threadId must be a conversation id");

        const last = input.data.messages.at(-1);
        if (last && (last.role !== "user" || typeof last.content !== "string" || !last.content.trim())) {
          return json(400, "Only a plain-text user message can be sent");
        }

        try {
          const run = await prepareRun({
            userId: session.user.id,
            conversationId: conversationId.data,
            runId: input.data.runId,
            locale: getLocale(),
            regenerate: forwarded.data.regenerate,
            edit: forwarded.data.edit,
            newMessage:
              last && typeof last.content === "string"
                ? {
                    // Kept when it is a valid row id: the browser's optimistic copy then matches the stored one.
                    id: z.uuid().safeParse(last.id).data,
                    text: last.content.trim(),
                    source: forwarded.data.source ?? "user",
                  }
                : undefined,
          });
          return sseResponse(runAgent(run, request.signal), request.headers.get("accept"));
        } catch (error) {
          if (error instanceof RunRejected) return json(error.status, error.message);
          throw error;
        }
      },
    },
  },
});

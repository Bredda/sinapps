/**
 * Browser side of `/api/agent`: one AG-UI run per call, through the reference
 * `@ag-ui/client` HttpAgent (SSE parsing, event verification, abort).
 */
import { HttpAgent } from "@ag-ui/client";
import type { AGUIEvent } from "@ag-ui/core";

export interface RunRequest {
  conversationId: string;
  /** New user message. Omitted to answer the trailing user message (or to regenerate). */
  message?: { id: string; text: string };
  regenerate?: boolean;
  /** Replace the last user message with `message`. */
  edit?: boolean;
  onEvent: (event: AGUIEvent) => void;
}

export interface RunHandle {
  /** Settles when the stream ends; rejects with a RunFailure when the run could not start. */
  done: Promise<void>;
  abort(): void;
}

export class RunFailure extends Error {
  constructor(
    message: string,
    /** HTTP status when the server refused the run (409: another run is in progress). */
    readonly status?: number,
  ) {
    super(message);
  }
}

export function startRun({ conversationId, message, regenerate, edit, onEvent }: RunRequest): RunHandle {
  const agent = new HttpAgent({ url: "/api/agent", threadId: conversationId });
  // The server owns the history: only the new message travels.
  agent.setMessages(message ? [{ id: message.id, role: "user", content: message.text }] : []);
  let aborted = false;

  const done = agent
    .runAgent(
      { runId: crypto.randomUUID(), forwardedProps: { regenerate, edit } },
      {
        onEvent: ({ event }) => {
          // On abort the client synthesizes a RUN_ERROR ("abort"): the caller already knows.
          if (!aborted) onEvent(event as AGUIEvent);
        },
      },
    )
    .then(
      () => undefined,
      (error: unknown) => {
        if (aborted) return;
        const status = (error as { status?: number }).status;
        throw new RunFailure(error instanceof Error ? error.message : String(error), status);
      },
    );

  return {
    done,
    abort() {
      aborted = true;
      agent.abortRun();
    },
  };
}

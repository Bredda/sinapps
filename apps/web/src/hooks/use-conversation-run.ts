import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RunFailure, type RunHandle, startRun } from "@/lib/agent-client";
import { initialRunState, interruptRun, reduceRunEvent } from "@/lib/agent-run";
import { isLiveRunSettled, type LiveRun, lastTurn, mergeTranscript, type TranscriptMessage } from "@/lib/transcript";
import { m } from "@/paraglide/messages.js";

interface Conversation {
  id: string;
  modelId: string;
  messages: TranscriptMessage[];
}

/** Server-side persistence of a stopped run lands shortly after the abort. */
const AFTER_STOP_REFRESH_MS = [400, 1500];
/** Refresh cadence while an answer streams elsewhere (another tab, a run left behind by navigation). */
const REMOTE_RUN_POLL_MS = 2000;

/**
 * Runs agent turns for one conversation (mount it with `key={conversation.id}`) and
 * returns the transcript to render: stored messages plus the live run.
 */
export function useConversationRun(conversation: Conversation, options: { onDraftRestore(text: string): void }) {
  const router = useRouter();
  const [live, setLive] = useState<LiveRun | null>(null);
  const handle = useRef<RunHandle | null>(null);
  const restoreDraft = useRef(options.onDraftRestore);
  restoreDraft.current = options.onDraftRestore;

  const messages = mergeTranscript(conversation.messages, live);
  const running = live !== null && live.state.status === "streaming";
  const remoteRun = !live && conversation.messages.some((message) => message.status === "streaming");

  const start = useCallback(
    (request: {
      message?: { id: string; text: string };
      regenerate?: boolean;
      edit?: boolean;
      replaces?: string[];
    }) => {
      if (handle.current) return;
      setLive({
        userMessage: request.message,
        replaces: request.replaces ?? [],
        modelId: conversation.modelId,
        startedAt: Date.now(),
        state: initialRunState(),
      });
      const run = startRun({
        conversationId: conversation.id,
        message: request.message,
        regenerate: request.regenerate,
        edit: request.edit,
        onEvent: (event) =>
          setLive((current) => current && { ...current, state: reduceRunEvent(current.state, event) }),
      });
      handle.current = run;
      run.done
        .catch((error: unknown) => {
          toast.error(error instanceof RunFailure && error.status === 409 ? m.run_conflict() : m.run_failed());
          if (request.message) restoreDraft.current(request.message.text);
          // Nothing was stored for a refused run: fall back to the database view.
          setLive((current) => (current?.state.messageId ? current : null));
        })
        .finally(async () => {
          if (handle.current === run) handle.current = null;
          await router.invalidate();
        });
    },
    [conversation.id, conversation.modelId, router],
  );

  // Swap the live copy for the stored row once it is final.
  useEffect(() => {
    if (live && !handle.current && isLiveRunSettled(conversation.messages, live)) setLive(null);
  }, [conversation.messages, live]);

  // A fresh conversation (created on the home page) ends with an unanswered user message.
  const answered = useRef(new Set<string>());
  const last = conversation.messages.at(-1);
  useEffect(() => {
    if (last?.role !== "user" || handle.current || answered.current.has(last.id)) return;
    answered.current.add(last.id);
    start({});
  }, [last, start]);

  useEffect(() => {
    if (!remoteRun) return;
    const timer = setInterval(() => void router.invalidate(), REMOTE_RUN_POLL_MS);
    return () => clearInterval(timer);
  }, [remoteRun, router]);

  const send = useCallback((text: string) => start({ message: { id: crypto.randomUUID(), text } }), [start]);

  const regenerate = useCallback(() => {
    start({ regenerate: true, replaces: lastTurn(conversation.messages).answers });
  }, [conversation.messages, start]);

  const editLast = useCallback(
    (text: string) => {
      const { lastUser, answers } = lastTurn(conversation.messages);
      if (!lastUser) return;
      start({ message: { id: crypto.randomUUID(), text }, edit: true, replaces: [lastUser.id, ...answers] });
    },
    [conversation.messages, start],
  );

  const stop = useCallback(() => {
    const run = handle.current;
    if (!run) return;
    run.abort();
    handle.current = null;
    setLive((current) => current && { ...current, state: interruptRun(current.state) });
    for (const delay of AFTER_STOP_REFRESH_MS) setTimeout(() => void router.invalidate(), delay);
  }, [router]);

  return { messages, running, busy: running || remoteRun, remoteRun, send, regenerate, editLast, stop };
}

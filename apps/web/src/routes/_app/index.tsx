import { Button } from "@sinapps/ui/components/button";
import { createFileRoute, useLoaderData, useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Composer } from "@/components/chat/composer";
import { m } from "@/paraglide/messages.js";
import { startConversation, titleConversation } from "@/server/conversations.functions";

export const Route = createFileRoute("/_app/")({ component: ChatHome });

/** Prompt ideas from the demo use cases (spec §2.6). */
const SUGGESTIONS = [
  m.suggestion_timekeeping,
  m.suggestion_dice,
  m.suggestion_compare,
  m.suggestion_bill,
  m.suggestion_itinerary,
  m.suggestion_plane,
];

function ChatHome() {
  const navigate = useNavigate();
  const router = useRouter();
  const { preferences } = useRouteContext({ from: "/_app" });
  const { models, connectors } = useLoaderData({ from: "/_app" });
  const [draft, setDraft] = useState("");
  const [modelId, setModelId] = useState(preferences.defaultModel);
  const [enabled, setEnabled] = useState(() => connectors.filter((c) => c.enabledByDefault).map((c) => c.id));
  const [pending, setPending] = useState(false);

  const send = async (text: string) => {
    if (pending) return;
    setPending(true);
    try {
      const { id } = await startConversation({ data: { text, modelId, enabledServers: enabled } });
      // The conversation page answers the trailing user message.
      await navigate({ to: "/c/$conversationId", params: { conversationId: id } });
      // Navigating doesn't re-run the /_app loader: refresh it so the sidebar lists the new conversation.
      await router.invalidate();
      // The placeholder title is already visible; swap in the generated one when it lands.
      void titleConversation({ data: { id } })
        .then(() => router.invalidate())
        .catch(() => {});
    } catch {
      setDraft(text);
      toast.error(m.conversation_start_failed());
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-semibold text-2xl">{m.chat_empty_title()}</h1>
        <p className="max-w-md text-muted-foreground text-sm">{m.chat_empty_subtitle()}</p>
      </div>
      <div className="w-full max-w-2xl">
        <Composer
          draft={draft}
          onDraftChange={setDraft}
          onSend={send}
          disabled={pending}
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          connectors={connectors}
          enabledConnectors={enabled}
          onConnectorsChange={setEnabled}
        />
      </div>
      <ul className="flex max-w-2xl flex-wrap justify-center gap-2" aria-label={m.suggestions_label()}>
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion()}>
            <Button
              variant="outline"
              size="sm"
              className="h-auto py-1.5 whitespace-normal"
              disabled={pending}
              onClick={() => send(suggestion())}
            >
              {suggestion()}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

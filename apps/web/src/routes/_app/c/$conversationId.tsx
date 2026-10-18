import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Composer } from "@/components/chat/composer";
import { Transcript } from "@/components/chat/transcript";
import { useConversationRun } from "@/hooks/use-conversation-run";
import { m } from "@/paraglide/messages.js";
import { fetchConversation, updateConversationFn } from "@/server/conversations.functions";

export const Route = createFileRoute("/_app/c/$conversationId")({
  loader: ({ params }) => fetchConversation({ data: { id: params.conversationId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title || m.app_name() }] }),
  notFoundComponent: () => <p className="p-6 text-muted-foreground text-sm">{m.conversation_not_found()}</p>,
  component: ConversationPage,
});

function ConversationPage() {
  const conversation = Route.useLoaderData();
  // Run state belongs to one conversation: remount when switching.
  return <ConversationView key={conversation.id} conversation={conversation} />;
}

function ConversationView({ conversation }: { conversation: ReturnType<typeof Route.useLoaderData> }) {
  const { models, connectors } = useLoaderData({ from: "/_app" });
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const run = useConversationRun(conversation, { onDraftRestore: setDraft });

  const update = async (settings: { modelId?: string; enabledServers?: string[] }) => {
    try {
      await updateConversationFn({ data: { id: conversation.id, ...settings } });
      await router.invalidate();
    } catch {
      toast.error(m.conversation_update_failed());
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <Transcript
          messages={run.messages}
          models={models}
          idle={!run.busy}
          liveRun={run.running}
          onRegenerate={run.regenerate}
          onEditLast={run.editLast}
        />
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Composer
          draft={draft}
          onDraftChange={setDraft}
          onSend={run.send}
          onStop={run.stop}
          running={run.running}
          disabled={run.busy}
          models={models}
          modelId={conversation.modelId}
          onModelChange={(modelId) => void update({ modelId })}
          connectors={connectors}
          enabledConnectors={conversation.enabledServers}
          onConnectorsChange={(enabledServers) => void update({ enabledServers })}
        />
      </div>
    </div>
  );
}

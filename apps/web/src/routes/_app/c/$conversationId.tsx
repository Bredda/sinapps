import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/paraglide/messages.js";
import { fetchConversation } from "@/server/conversations.functions";

export const Route = createFileRoute("/_app/c/$conversationId")({
  loader: ({ params }) => fetchConversation({ data: { id: params.conversationId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title || m.app_name() }] }),
  notFoundComponent: () => <p className="p-6 text-muted-foreground text-sm">{m.conversation_not_found()}</p>,
  component: ConversationPage,
});

// Placeholder transcript: the agent loop (T11) and the chat UI (T12) replace it.
function ConversationPage() {
  const conversation = Route.useLoaderData();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="font-semibold text-lg">{conversation.title || m.conversation_untitled()}</h1>
      {conversation.messages.map((message) => (
        <div key={message.id} className="self-end rounded-xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap">
          {message.parts.map((part) => (part.type === "text" ? part.text : null))}
        </div>
      ))}
    </div>
  );
}

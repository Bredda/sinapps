import { Button } from "@sinapps/ui/components/button";
import { Textarea } from "@sinapps/ui/components/textarea";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowUpIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { m } from "@/paraglide/messages.js";
import { startConversation, titleConversation } from "@/server/conversations.functions";

export const Route = createFileRoute("/_app/")({ component: ChatHome });

// Minimal composer: the full prompt input (attachments, model picker, stop) comes with the chat UI (T12).
function ChatHome() {
  const navigate = useNavigate();
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || pending) return;
    setPending(true);
    try {
      const { id } = await startConversation({ data: { text } });
      await navigate({ to: "/c/$conversationId", params: { conversationId: id } });
      // Navigating doesn't re-run the /_app loader: refresh it so the sidebar lists the new conversation.
      await router.invalidate();
      // The placeholder title is already visible; swap in the generated one when it lands.
      void titleConversation({ data: { id } })
        .then(() => router.invalidate())
        .catch(() => {});
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) void send(event);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-semibold text-2xl">{m.chat_empty_title()}</h1>
        <p className="max-w-md text-muted-foreground text-sm">{m.chat_empty_subtitle()}</p>
      </div>
      <form onSubmit={send} className="relative w-full max-w-2xl">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.composer_placeholder()}
          aria-label={m.composer_placeholder()}
          className="min-h-24 resize-none pr-12"
          autoFocus
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-2 bottom-2"
          disabled={!text.trim() || pending}
          aria-label={m.composer_send()}
        >
          <ArrowUpIcon />
        </Button>
      </form>
    </div>
  );
}

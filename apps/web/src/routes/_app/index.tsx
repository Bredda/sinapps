import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/_app/")({ component: ChatHome });

function ChatHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-semibold text-2xl">{m.chat_empty_title()}</h1>
      <p className="max-w-md text-muted-foreground text-sm">{m.chat_empty_subtitle()}</p>
    </div>
  );
}

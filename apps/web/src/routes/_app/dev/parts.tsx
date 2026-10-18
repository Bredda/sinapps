import { createFileRoute, notFound } from "@tanstack/react-router";
import { AssistantMessage, UserMessage } from "@/components/chat/chat-message";
import { fixtures } from "@/lib/part-fixtures";

/** Visual catalog of every message part in each state (development only). */
export const Route = createFileRoute("/_app/dev/parts")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: "Parts · Sinapps" }] }),
  component: PartsCatalog,
});

function PartsCatalog() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6">
      <h1 className="font-semibold text-xl">Message parts</h1>
      {fixtures.map((fixture) => (
        <section key={fixture.title} className="flex flex-col gap-4" data-testid="fixture">
          <h2 className="border-b pb-1 font-medium text-muted-foreground text-sm">{fixture.title}</h2>
          {fixture.messages.map((message) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} onEdit={() => {}} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                modelLabel="Claude Sonnet 5.5"
                onRegenerate={() => {}}
              />
            ),
          )}
        </section>
      ))}
    </div>
  );
}

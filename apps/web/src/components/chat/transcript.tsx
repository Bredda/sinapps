import { Marker, MarkerContent } from "@sinapps/ui/components/marker";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@sinapps/ui/components/message-scroller";
import type { TranscriptMessage } from "@/lib/transcript";
import { m } from "@/paraglide/messages.js";
import { AssistantMessage, UserMessage } from "./chat-message";
import type { ModelOption } from "./composer";

/**
 * Scrolling transcript: follows the stream until the user scrolls up, then offers a
 * "back to bottom" button. Answers from a different model than the previous one get
 * a model-change marker.
 */
export function Transcript({
  messages,
  models,
  idle,
  liveRun,
  onRegenerate,
  onEditLast,
}: {
  messages: TranscriptMessage[];
  models: ModelOption[];
  /** No run streams: the last turn can be regenerated or edited. */
  idle: boolean;
  /** The streaming message (if any) is fed by this tab's run, not by polling. */
  liveRun: boolean;
  onRegenerate: () => void;
  onEditLast: (text: string) => void;
}) {
  const label = (id: string | null) => models.find((model) => model.id === id)?.label ?? id ?? undefined;
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const lastAssistant = messages.findLastIndex((message) => message.role === "assistant");
  let previousModel: string | null = null;

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label={m.transcript_label()}>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((message, index) => {
              if (message.role === "user") {
                return (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                    <UserMessage message={message} onEdit={idle && index === lastUser ? onEditLast : undefined} />
                  </MessageScrollerItem>
                );
              }
              const switched = previousModel !== null && message.modelId !== null && message.modelId !== previousModel;
              previousModel = message.modelId ?? previousModel;
              return (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <div className="flex flex-col gap-4">
                    {switched && (
                      <Marker variant="separator" role="status">
                        <MarkerContent>{m.marker_model_change({ model: label(message.modelId) ?? "" })}</MarkerContent>
                      </Marker>
                    )}
                    <AssistantMessage
                      message={message}
                      modelLabel={label(message.modelId)}
                      remote={message.status === "streaming" && !liveRun}
                      onRegenerate={idle && index === lastAssistant && index > lastUser ? onRegenerate : undefined}
                    />
                  </div>
                </MessageScrollerItem>
              );
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label={m.transcript_scroll_end()} />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

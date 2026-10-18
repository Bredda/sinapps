import { Badge } from "@sinapps/ui/components/badge";
import { Bubble, BubbleContent } from "@sinapps/ui/components/bubble";
import { Button } from "@sinapps/ui/components/button";
import { Message, MessageContent, MessageFooter } from "@sinapps/ui/components/message";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@sinapps/ui/components/popover";
import { Textarea } from "@sinapps/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@sinapps/ui/components/tooltip";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@sinapps/ui/components/trace";
import { CheckIcon, CopyIcon, InfoIcon, LoaderIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { formatCost, formatCount, formatDuration } from "@/lib/format";
import { groupParts, messageMarkdown, type TranscriptMessage } from "@/lib/transcript";
import { m } from "@/paraglide/messages.js";
import { PartRenderer, SourceList } from "./part-renderers";
import { TraceGroup } from "./trace-group";

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <ActionButton
      label={copied ? m.action_copied() : m.action_copy()}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => {})
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </ActionButton>
  );
}

const userText = (message: TranscriptMessage) =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

export function UserMessage({
  message,
  onEdit,
}: {
  message: TranscriptMessage;
  /** Present on the last user message when no run is in progress. */
  onEdit?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const text = userText(message);

  if (editing && onEdit) {
    const submit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = String(new FormData(event.currentTarget).get("text") ?? "").trim();
      if (!value) return;
      setEditing(false);
      if (value !== text.trim()) onEdit(value);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") setEditing(false);
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    };
    return (
      <form onSubmit={submit} className="ml-auto flex w-full max-w-[80%] flex-col gap-2">
        <Textarea name="text" defaultValue={text} autoFocus onKeyDown={onKeyDown} aria-label={m.message_edit()} />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            {m.action_cancel()}
          </Button>
          <Button type="submit" size="sm">
            {m.message_edit_submit()}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Message align="end">
      <MessageContent>
        {message.source === "app" && (
          <Badge variant="secondary" className="self-end">
            {m.message_from_widget()}
          </Badge>
        )}
        <Bubble align="end" variant="muted">
          <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
        </Bubble>
        <MessageFooter className="opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100 pointer-coarse:opacity-100">
          <CopyAction text={text} />
          {onEdit && (
            <ActionButton label={m.message_edit()} onClick={() => setEditing(true)}>
              <PencilIcon />
            </ActionButton>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function DetailsPopover({ message, modelLabel }: { message: TranscriptMessage; modelLabel?: string }) {
  const rows: [string, string][] = [];
  if (modelLabel ?? message.modelId) rows.push([m.details_model(), modelLabel ?? message.modelId ?? ""]);
  if (message.tokensIn !== null) rows.push([m.details_tokens_in(), formatCount(message.tokensIn)]);
  if (message.tokensOut !== null) rows.push([m.details_tokens_out(), formatCount(message.tokensOut)]);
  if (message.costUsd !== null) rows.push([m.details_cost(), formatCost(message.costUsd)]);
  if (message.durationMs !== null) rows.push([m.details_duration(), formatDuration(message.durationMs)]);
  if (rows.length === 0) return null;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={m.details_title()}>
              <InfoIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{m.details_title()}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{m.details_title()}</PopoverTitle>
        </PopoverHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate text-right tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export function AssistantMessage({
  message,
  modelLabel,
  remote = false,
  onRegenerate,
}: {
  message: TranscriptMessage;
  modelLabel?: string;
  /** Streaming in another tab or session: refreshed by polling, not live. */
  remote?: boolean;
  /** Present on the last answer when no run is in progress. */
  onRegenerate?: () => void;
}) {
  const streaming = message.status === "streaming";
  const blocks = groupParts(message.parts);
  const markdown = messageMarkdown(message);

  return (
    <Message align="start">
      <MessageContent className="gap-3" aria-busy={streaming}>
        {blocks.map((block, index) => {
          const last = index === blocks.length - 1;
          if (block.kind === "trace") {
            return <TraceGroup key={block.key} parts={block.parts} streaming={streaming} last={last} />;
          }
          if (block.kind === "sources") return <SourceList key={block.key} parts={block.parts} />;
          return (
            <div key={block.key} aria-live={streaming && block.part.type === "text" ? "polite" : undefined}>
              <PartRenderer
                part={block.part}
                context={{ streaming: streaming && last, onRetry: last ? onRegenerate : undefined }}
              />
            </div>
          );
        })}
        {streaming && (blocks.length === 0 || remote) && (
          <Trace>
            <TraceLine status="running">
              <TraceIcon>
                <LoaderIcon className="animate-spin motion-reduce:animate-none" />
              </TraceIcon>
              <TraceTitle>{remote ? m.run_remote() : m.run_pending()}</TraceTitle>
            </TraceLine>
          </Trace>
        )}
        {!streaming && (
          <MessageFooter className="gap-0.5 px-0">
            {markdown && <CopyAction text={markdown} />}
            {onRegenerate && (
              <ActionButton label={m.message_regenerate()} onClick={onRegenerate}>
                <RefreshCwIcon />
              </ActionButton>
            )}
            <DetailsPopover message={message} modelLabel={modelLabel} />
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

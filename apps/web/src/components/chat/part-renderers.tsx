/**
 * In-flow part rendering (docs/architecture-proposal.md §2.3): the registry maps a
 * part type to its component. Trace parts (reasoning, tool calls) go through
 * TraceGroup instead. Adding a part type means adding an entry here.
 */
import { Bubble, BubbleContent } from "@sinapps/ui/components/bubble";
import { Button } from "@sinapps/ui/components/button";
import { Marker, MarkerContent, MarkerIcon } from "@sinapps/ui/components/marker";
import {
  AppWindowIcon,
  CircleAlertIcon,
  MessageCircleQuestionIcon,
  RotateCcwIcon,
  SquareIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { hostname } from "@/lib/format";
import type { FlowPart, SourcePart } from "@/lib/transcript";
import { m } from "@/paraglide/messages.js";
import { Markdown } from "./markdown";

export interface PartContext {
  /** The message is still streaming. */
  streaming: boolean;
  /** Answer the last turn again (error parts); absent when it is not the last turn. */
  onRetry?: () => void;
}

type Renderers = {
  [T in FlowPart["type"]]: ComponentType<{ part: Extract<FlowPart, { type: T }>; context: PartContext }>;
};

const errorMessage = (code: string | undefined) => {
  if (code === "timeout") return m.run_error_timeout();
  return m.run_error_generic();
};

export const partRenderers: Renderers = {
  text: ({ part, context }) => <Markdown streaming={context.streaming}>{part.text}</Markdown>,

  error: ({ part, context }) => (
    <Bubble variant="destructive" className="max-w-full">
      <BubbleContent className="flex flex-col gap-2">
        <div className="flex items-start gap-2" title={part.message}>
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage(part.code)}</span>
        </div>
        {part.retryable && context.onRetry && (
          <Button size="sm" variant="outline" className="self-start" onClick={context.onRetry}>
            <RotateCcwIcon /> {m.action_retry()}
          </Button>
        )}
      </BubbleContent>
    </Bubble>
  ),

  marker: ({ part }) => {
    const [Icon, label] =
      part.kind === "interrupted"
        ? [SquareIcon, m.marker_interrupted()]
        : part.kind === "auto-fix"
          ? [WrenchIcon, m.marker_auto_fix()]
          : [AppWindowIcon, m.marker_model_change({ model: String(part.data?.model ?? "") })];
    return (
      <Marker role="status">
        <MarkerIcon>
          <Icon />
        </MarkerIcon>
        <MarkerContent>{label}</MarkerContent>
      </Marker>
    );
  },

  // MCP Apps widgets arrive with M1: until then the frame is a labelled placeholder.
  widget: ({ part }) => (
    <div className="flex h-32 items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground text-sm">
      <AppWindowIcon className="size-4" /> {m.widget_placeholder({ uri: part.resourceUri })}
    </div>
  ),

  image: ({ part }) => (
    <figure className="flex max-w-md flex-col gap-1">
      <img src={part.url} alt={part.alt ?? ""} className="rounded-lg border" loading="lazy" />
      {part.credit && (
        <figcaption className="text-muted-foreground text-xs">
          {[part.credit.author, part.credit.license].filter(Boolean).join(" · ")}
          {part.credit.sourceUrl && (
            <>
              {" · "}
              <a href={part.credit.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                {hostname(part.credit.sourceUrl)}
              </a>
            </>
          )}
        </figcaption>
      )}
    </figure>
  ),

  // Structured questions come with M3.
  question: ({ part }) => (
    <Marker>
      <MarkerIcon>
        <MessageCircleQuestionIcon />
      </MarkerIcon>
      <MarkerContent>{part.prompt}</MarkerContent>
    </Marker>
  ),
};

export function PartRenderer({ part, context }: { part: FlowPart; context: PartContext }) {
  const Renderer = partRenderers[part.type] as ComponentType<{ part: FlowPart; context: PartContext }>;
  return <Renderer part={part} context={context} />;
}

/** Numbered sources, matching `[n]` citations in the text. */
export function SourceList({ parts }: { parts: SourcePart[] }) {
  return (
    <ol className="flex flex-wrap gap-2 text-xs" aria-label={m.sources_label()}>
      {parts.map((source) => (
        <li key={source.id}>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            title={source.title ?? source.url}
            className="flex max-w-60 items-center gap-1.5 rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="font-medium tabular-nums">{source.index}</span>
            <span className="truncate">{source.title ?? hostname(source.url)}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@sinapps/ui/components/trace";
import { BrainIcon, ListChecksIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { formatDuration } from "@/lib/format";
import { isTracePartActive, type TracePart } from "@/lib/transcript";
import { m } from "@/paraglide/messages.js";
import { GenericToolDetail, humanizeToolName, rendererFor, type ToolCallPart } from "./tool-renderers";

type LineStatus = "running" | "error" | "pending";

/**
 * Expanded while active and collapsed once done; a manual toggle wins
 * (the spec's "preference remembered", per line).
 */
function useAutoOpen(active: boolean) {
  const [manual, setManual] = useState<boolean>();
  return { open: manual ?? active, onOpenChange: setManual };
}

function Line({
  status,
  icon,
  title,
  description,
  children,
  active = false,
}: {
  status?: LineStatus;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  active?: boolean;
}) {
  const collapsible = useAutoOpen(active);
  const line = (
    <TraceLine status={status}>
      <TraceIcon>{icon}</TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {description && <TraceDescription>{description}</TraceDescription>}
    </TraceLine>
  );
  if (!children) return line;
  return (
    <TraceCollapsible {...collapsible}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function ReasoningLine({ part, active }: { part: Extract<TracePart, { type: "reasoning" }>; active: boolean }) {
  const text = part.text.trim();
  if (!text) {
    return (
      <Line
        status={active ? "running" : undefined}
        icon={<BrainIcon />}
        title={active ? m.reasoning_active() : part.encrypted ? m.reasoning_hidden() : m.reasoning_done()}
      />
    );
  }
  return (
    <Line
      active={active}
      status={active ? "running" : undefined}
      icon={<BrainIcon />}
      title={
        active
          ? m.reasoning_active()
          : part.durationMs
            ? m.reasoning_done_for({ duration: formatDuration(part.durationMs) })
            : m.reasoning_done()
      }
    >
      <div className="whitespace-pre-wrap">{text}</div>
    </Line>
  );
}

function ToolLine({ part }: { part: ToolCallPart }) {
  const renderer = rendererFor(part);
  const Icon = renderer.icon;
  const phase = part.status === "error" ? "failed" : part.status === "success" ? "done" : "running";
  const name = part.title ?? humanizeToolName(part);
  const title =
    renderer.title?.(part, phase) ??
    (phase === "failed" ? m.tool_failed({ name }) : phase === "running" ? m.tool_running({ name }) : name);
  const status: LineStatus | undefined =
    part.status === "error"
      ? "error"
      : part.status === "streaming-args" || part.status === "running"
        ? "running"
        : undefined;
  const description =
    part.status === "cancelled" ? m.tool_cancelled() : part.durationMs ? formatDuration(part.durationMs) : undefined;
  const detail =
    part.status === "success" && renderer.Result ? <renderer.Result part={part} /> : <GenericToolDetail part={part} />;
  return (
    <Line status={status} icon={<Icon />} title={title} description={description}>
      {detail}
    </Line>
  );
}

function TraceItem({ part, active }: { part: TracePart; active: boolean }) {
  return part.type === "reasoning" ? <ReasoningLine part={part} active={active} /> : <ToolLine part={part} />;
}

/**
 * Consecutive reasoning and tool calls of a turn. Several lines fold under one
 * summary ("3 steps · 8 s") that is open while the agent works.
 */
export function TraceGroup({ parts, streaming, last }: { parts: TracePart[]; streaming: boolean; last: boolean }) {
  const activeAt = (index: number) =>
    isTracePartActive(parts[index] as TracePart, streaming, last && index === parts.length - 1);
  const working = streaming && last;
  const collapsible = useAutoOpen(working);

  const items = parts.map((part, index) => <TraceItem key={part.id} part={part} active={activeAt(index)} />);
  if (parts.length === 1) return <Trace>{items}</Trace>;

  const failed = parts.filter((part) => part.type === "tool-call" && part.status === "error").length;
  const durationMs = parts.reduce((sum, part) => sum + (part.durationMs ?? 0), 0);
  const summary = working
    ? m.trace_working()
    : [
        m.trace_steps({ count: parts.length }),
        durationMs > 0 ? formatDuration(durationMs) : undefined,
        failed > 0 ? m.trace_failed({ count: failed }) : undefined,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <TraceCollapsible {...collapsible}>
      <TraceCollapsibleTrigger>
        <TraceLine status={working ? "running" : failed > 0 ? "error" : undefined}>
          <TraceIcon>
            <ListChecksIcon />
          </TraceIcon>
          <TraceTitle>{summary}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>{items}</Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

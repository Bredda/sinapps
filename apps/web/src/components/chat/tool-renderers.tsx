/**
 * Per-tool rendering of Trace lines (docs/architecture-proposal.md §3.4). A tool
 * without an entry gets the generic line: readable name, arguments and result as JSON.
 * Adding a tool renderer never touches the chat core.
 */
import { CodeBlock, CodeBlockContent, CodeBlockHeader, CodeBlockTitle } from "@sinapps/ui/components/code-block";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@sinapps/ui/components/trace";
import { GlobeIcon, type LucideIcon, WrenchIcon } from "lucide-react";
import type { ComponentType } from "react";
import { hostname } from "@/lib/format";
import type { TracePart } from "@/lib/transcript";
import { m } from "@/paraglide/messages.js";

export type ToolCallPart = Extract<TracePart, { type: "tool-call" }>;
type Phase = "running" | "done" | "failed";

export interface ToolRenderer {
  icon?: LucideIcon;
  /** Line title for each phase; the generic title is used when omitted. */
  title?: (part: ToolCallPart, phase: Phase) => string | undefined;
  /** What the line expands to once the call succeeded; the generic JSON view otherwise. */
  Result?: ComponentType<{ part: ToolCallPart }>;
}

const SERVER_ICONS: Record<string, LucideIcon> = { tavily: GlobeIcon };

/** Model-visible names are `${serverId}_${tool}`: registry keys are `${serverId}/${tool}`. */
export function toolKey(part: ToolCallPart): string {
  const { serverId, toolName } = part;
  return serverId && toolName.startsWith(`${serverId}_`)
    ? `${serverId}/${toolName.slice(serverId.length + 1)}`
    : toolName;
}

export function humanizeToolName(part: ToolCallPart): string {
  const base = toolKey(part).split("/").at(-1) ?? part.toolName;
  const words = base.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const argsOf = (part: ToolCallPart): Record<string, unknown> =>
  part.args && typeof part.args === "object" && !Array.isArray(part.args) ? (part.args as Record<string, unknown>) : {};

const stringArg = (part: ToolCallPart, name: string) => {
  const value = argsOf(part)[name];
  return typeof value === "string" && value ? value : undefined;
};

interface SearchResult {
  title?: string;
  url: string;
  favicon?: string;
}

function searchResults(part: ToolCallPart): SearchResult[] {
  const result = part.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const results = (result as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.filter(
    (entry): entry is SearchResult =>
      typeof entry === "object" && entry !== null && typeof (entry as SearchResult).url === "string",
  );
}

function SearchResultList({ part }: { part: ToolCallPart }) {
  const results = searchResults(part);
  if (results.length === 0) return <p>{m.tool_search_no_results()}</p>;
  return (
    <Trace>
      {results.map((result) => (
        <a key={result.url} href={result.url} target="_blank" rel="noreferrer noopener">
          <TraceLine>
            <TraceIcon>
              {result.favicon ? (
                <img src={result.favicon} alt="" className="size-4 rounded-sm" referrerPolicy="no-referrer" />
              ) : (
                <GlobeIcon />
              )}
            </TraceIcon>
            <TraceTitle>{result.title || hostname(result.url)}</TraceTitle>
            <span className="shrink-0 text-muted-foreground/70 text-xs">{hostname(result.url)}</span>
          </TraceLine>
        </a>
      ))}
    </Trace>
  );
}

export const toolRenderers: Record<string, ToolRenderer> = {
  "tavily/tavily_search": {
    icon: GlobeIcon,
    title: (part, phase) => {
      const query = stringArg(part, "query");
      if (!query) return undefined;
      return { running: m.tool_search_running, done: m.tool_search_done, failed: m.tool_search_failed }[phase]({
        query,
      });
    },
    Result: SearchResultList,
  },
  "tavily/tavily_extract": {
    icon: GlobeIcon,
    title: (part, phase) => {
      const urls = argsOf(part).urls;
      const first = Array.isArray(urls) && typeof urls[0] === "string" ? hostname(urls[0]) : undefined;
      if (!first) return undefined;
      return { running: m.tool_read_running, done: m.tool_read_done, failed: m.tool_read_failed }[phase]({
        site: first,
      });
    },
  },
};

export function rendererFor(part: ToolCallPart): ToolRenderer & { icon: LucideIcon } {
  const renderer = toolRenderers[toolKey(part)] ?? {};
  const serverIcon = part.serverId ? SERVER_ICONS[part.serverId] : undefined;
  return { ...renderer, icon: renderer.icon ?? serverIcon ?? WrenchIcon };
}

const pretty = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));

/** Arguments and result (or error) as JSON. */
export function GenericToolDetail({ part }: { part: ToolCallPart }) {
  const hasArgs =
    part.args !== undefined && !(typeof part.args === "object" && Object.keys(part.args ?? {}).length === 0);
  return (
    <div className="flex flex-col gap-2">
      {hasArgs && (
        <CodeBlock size="sm">
          <CodeBlockHeader>
            <CodeBlockTitle>{m.tool_arguments()}</CodeBlockTitle>
          </CodeBlockHeader>
          <CodeBlockContent wrap className="max-h-64">
            {pretty(part.args)}
          </CodeBlockContent>
        </CodeBlock>
      )}
      {part.status === "error" && part.error && (
        <CodeBlock size="sm" variant="destructive">
          <CodeBlockContent wrap className="max-h-64">
            {part.error}
          </CodeBlockContent>
        </CodeBlock>
      )}
      {part.status === "success" && part.result !== undefined && (
        <CodeBlock size="sm">
          <CodeBlockHeader>
            <CodeBlockTitle>{m.tool_result()}</CodeBlockTitle>
          </CodeBlockHeader>
          <CodeBlockContent wrap className="max-h-64">
            {pretty(part.result)}
          </CodeBlockContent>
        </CodeBlock>
      )}
    </div>
  );
}

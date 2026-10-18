import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@sinapps/ui/components/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@sinapps/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sinapps/ui/components/select";
import { ArrowUpIcon, PlugIcon, SquareIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef } from "react";
import { m } from "@/paraglide/messages.js";

export interface ModelOption {
  id: string;
  label: string;
  tier: "premium" | "balanced" | "fast" | "budget";
}

export interface ConnectorOption {
  id: string;
  label: string;
}

const tierLabel = (tier: ModelOption["tier"]) =>
  ({
    premium: m.model_tier_premium,
    balanced: m.model_tier_balanced,
    fast: m.model_tier_fast,
    budget: m.model_tier_budget,
  })[tier]();

/** Prompt input with the conversation's model and connectors (F9, F10), send and stop. */
export function Composer({
  draft,
  onDraftChange,
  onSend,
  onStop,
  running = false,
  disabled = false,
  models,
  modelId,
  onModelChange,
  connectors,
  enabledConnectors,
  onConnectorsChange,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** A run from this tab is streaming: the send button becomes a stop button. */
  running?: boolean;
  /** Sending is not possible (a run streams elsewhere, a request is pending). */
  disabled?: boolean;
  models: ModelOption[];
  modelId: string;
  onModelChange: (id: string) => void;
  connectors: ConnectorOption[];
  enabledConnectors: string[];
  onConnectorsChange: (ids: string[]) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !running && !disabled;

  // Hand the focus back once the answer is complete.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) input.current?.focus();
    wasRunning.current = running;
  }, [running]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(draft.trim());
    onDraftChange("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const toggleConnector = (id: string, enabled: boolean) =>
    onConnectorsChange(enabled ? [...enabledConnectors, id] : enabledConnectors.filter((value) => value !== id));

  const model = models.find((option) => option.id === modelId);

  return (
    <form onSubmit={submit} className="w-full">
      <InputGroup>
        <InputGroupTextarea
          ref={input}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.composer_placeholder()}
          aria-label={m.composer_placeholder()}
          className="max-h-60 min-h-16"
          autoFocus
        />
        <InputGroupAddon align="block-end" className="gap-1">
          <Select value={modelId} onValueChange={onModelChange}>
            <SelectTrigger
              size="sm"
              className="border-0 shadow-none dark:bg-transparent"
              aria-label={m.composer_model()}
            >
              <SelectValue>{model?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {models.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                  <span className="text-muted-foreground text-xs">{tierLabel(option.tier)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {connectors.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton size="sm" aria-label={m.composer_connectors()}>
                  <PlugIcon />
                  <span className="tabular-nums">{enabledConnectors.length}</span>
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{m.composer_connectors()}</DropdownMenuLabel>
                {connectors.map((connector) => (
                  <DropdownMenuCheckboxItem
                    key={connector.id}
                    checked={enabledConnectors.includes(connector.id)}
                    onCheckedChange={(checked) => toggleConnector(connector.id, checked === true)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {connector.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {running ? (
            <InputGroupButton
              type="button"
              variant="default"
              size="icon-sm"
              className="ml-auto"
              onClick={onStop}
              aria-label={m.composer_stop()}
            >
              <SquareIcon className="fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              // Not `disabled`: InputGroup dims itself when any control inside is disabled.
              className="ml-auto aria-disabled:pointer-events-none aria-disabled:opacity-50"
              aria-disabled={!canSend}
              aria-label={m.composer_send()}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

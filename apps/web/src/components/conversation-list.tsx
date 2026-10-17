import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@sinapps/ui/components/alert-dialog";
import { Button } from "@sinapps/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@sinapps/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sinapps/ui/components/dropdown-menu";
import { Input } from "@sinapps/ui/components/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sinapps/ui/components/sidebar";
import { Link, useLoaderData, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, type MouseEvent, useMemo, useRef, useState } from "react";
import { m } from "@/paraglide/messages.js";
import { deleteConversationFn, renameConversationFn } from "@/server/conversations.functions";

interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: Date;
}

type Bucket = "today" | "yesterday" | "week" | "month" | "older";

const BUCKET_LABELS: Record<Bucket, () => string> = {
  today: m.conversations_today,
  yesterday: m.conversations_yesterday,
  week: m.conversations_week,
  month: m.conversations_month,
  older: m.conversations_older,
};

function bucketOf(date: Date, now: Date): Bucket {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = (startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  if (days < 30) return "month";
  return "older";
}

function groupByBucket(conversations: ConversationSummary[]) {
  const now = new Date();
  const groups = new Map<Bucket, ConversationSummary[]>();
  for (const conversation of conversations) {
    const bucket = bucketOf(new Date(conversation.updatedAt), now);
    groups.set(bucket, [...(groups.get(bucket) ?? []), conversation]);
  }
  return [...groups.entries()];
}

export function ConversationList() {
  const conversations = useLoaderData({ from: "/_app" });
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);

  // The list holds the latest 200 conversations: filtering them client-side is enough for now.
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle
      ? conversations.filter((c) => (c.title ?? "").toLocaleLowerCase().includes(needle))
      : conversations;
    return groupByBucket(matches);
  }, [conversations, query]);

  return (
    <>
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50" />
          <SidebarInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m.conversations_search()}
            aria-label={m.conversations_search()}
            className="pl-8"
          />
        </SidebarGroupContent>
      </SidebarGroup>

      {groups.length === 0 && (
        <p className="px-4 py-2 text-muted-foreground text-xs">
          {query ? m.conversations_no_match() : m.conversations_empty()}
        </p>
      )}

      {groups.map(([bucket, items]) => (
        <SidebarGroup key={bucket}>
          <SidebarGroupLabel>{BUCKET_LABELS[bucket]()}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onRename={() => setRenaming(conversation)}
                onDelete={() => setDeleting(conversation)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}

      <RenameDialog conversation={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog conversation={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function ConversationItem({
  conversation,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  const title = conversation.title || m.conversation_untitled();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link
          to="/c/$conversationId"
          params={{ conversationId: conversation.id }}
          activeProps={{ "data-active": true }}
          title={title}
        >
          <span className="truncate">{title}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={m.conversation_actions({ title })}>
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onSelect={onRename}>
            <PencilIcon /> {m.conversation_rename()}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon /> {m.conversation_delete()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function RenameDialog({ conversation, onClose }: { conversation: ConversationSummary | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!conversation || !title) return;
    setPending(true);
    try {
      await renameConversationFn({ data: { id: conversation.id, title } });
      await router.invalidate();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={conversation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{m.conversation_rename()}</DialogTitle>
          </DialogHeader>
          <Input
            name="title"
            defaultValue={conversation?.title ?? ""}
            maxLength={120}
            required
            autoFocus
            aria-label={m.conversation_title()}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {m.action_cancel()}
            </Button>
            <Button type="submit" disabled={pending}>
              {m.action_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ conversation, onClose }: { conversation: ConversationSummary | null; onClose: () => void }) {
  const router = useRouter();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [pending, setPending] = useState(false);
  // Runs once the dialog has fully closed: navigating earlier would move focus into
  // the app while Radix still hides it (aria-hidden) for the exit animation.
  const afterClose = useRef<(() => Promise<void>) | null>(null);

  const confirm = async (event: MouseEvent) => {
    event.preventDefault(); // keep the dialog open while deleting
    if (!conversation) return;
    setPending(true);
    try {
      await deleteConversationFn({ data: { id: conversation.id } });
      const wasOpen = params.conversationId === conversation.id;
      afterClose.current = async () => {
        if (wasOpen) await navigate({ to: "/" });
        await router.invalidate();
      };
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={conversation !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const next = afterClose.current;
          if (!next) return;
          event.preventDefault();
          afterClose.current = null;
          void next();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{m.conversation_delete_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.conversation_delete_body({ title: conversation?.title || m.conversation_untitled() })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={pending}>
            {m.conversation_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

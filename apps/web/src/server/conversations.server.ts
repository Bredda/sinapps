import { schema } from "@sinapps/db";
import type { MessagePart } from "@sinapps/db/parts";
import { chat } from "@tanstack/ai";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "./auth.server";
import { config, defaultEnabledServers } from "./config.server";
import { textAdapter } from "./llm.server";

const { conversation, message } = schema;

/** Conversations visible to their owner (soft-deleted ones excluded). */
const ownedBy = (userId: string, conversationId?: string) =>
  and(
    eq(conversation.userId, userId),
    isNull(conversation.deletedAt),
    conversationId ? eq(conversation.id, conversationId) : undefined,
  );

export async function listConversations(userId: string) {
  return db
    .select({ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt })
    .from(conversation)
    .where(ownedBy(userId))
    .orderBy(desc(conversation.updatedAt))
    .limit(200);
}

export async function getConversation(userId: string, conversationId: string) {
  const [row] = await db.select().from(conversation).where(ownedBy(userId, conversationId));
  if (!row) return null;
  const messages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt), asc(message.id));
  return { ...row, messages };
}

/** Placeholder title shown until the generated one arrives. */
export function fallbackTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}

export async function createConversation(
  userId: string,
  modelId: string,
  firstMessage: string,
  enabledServers = defaultEnabledServers(),
) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversation)
      .values({ userId, modelId, title: fallbackTitle(firstMessage), enabledServers })
      .returning({ id: conversation.id });
    if (!created) throw new Error("Conversation insert returned no row");
    const parts: MessagePart[] = [{ type: "text", id: crypto.randomUUID(), text: firstMessage }];
    await tx.insert(message).values({ conversationId: created.id, role: "user", parts, source: "user" });
    return created.id;
  });
}

export async function renameConversation(userId: string, conversationId: string, title: string) {
  const updated = await db
    .update(conversation)
    .set({ title })
    .where(ownedBy(userId, conversationId))
    .returning({ id: conversation.id });
  return updated.length > 0;
}

/** Model and connectors apply from the next turn on. */
export async function updateConversationSettings(
  userId: string,
  conversationId: string,
  settings: { modelId?: string; enabledServers?: string[] },
) {
  const updated = await db
    .update(conversation)
    .set(settings)
    .where(ownedBy(userId, conversationId))
    .returning({ id: conversation.id });
  return updated.length > 0;
}

export async function deleteConversation(userId: string, conversationId: string) {
  const deleted = await db
    .update(conversation)
    .set({ deletedAt: new Date() })
    .where(ownedBy(userId, conversationId))
    .returning({ id: conversation.id });
  return deleted.length > 0;
}

const TITLE_PROMPT = [
  "You name chat conversations.",
  "Write a short title (at most 6 words) for the user's message, in the same language as the message.",
  "Reply with the title only: no quotes, no trailing punctuation.",
].join(" ");

/**
 * Generates a title with the utility model and stores it, unless the user renamed
 * the conversation meanwhile. Returns the stored title, or null when nothing changed.
 */
export async function generateTitle(userId: string, conversationId: string): Promise<string | null> {
  const current = await getConversation(userId, conversationId);
  const first = current?.messages.find((m) => m.role === "user");
  const text = first?.parts.find((part) => part.type === "text")?.text;
  if (!current || !text) return null;

  const result = await chat({
    adapter: textAdapter(config.models.utility ?? config.models.default),
    systemPrompts: [TITLE_PROMPT],
    messages: [{ role: "user", content: text.slice(0, 2000) }],
    stream: false,
  });
  const title = result.text
    .trim()
    .replace(/^["'«]+|["'»]+$/g, "")
    .slice(0, 80);
  if (!title) return null;

  const [updated] = await db
    .update(conversation)
    // Only replace the placeholder: a manual rename wins over the generated title.
    .set({ title })
    .where(and(ownedBy(userId, conversationId), eq(conversation.title, current.title ?? "")))
    .returning({ title: conversation.title });
  return updated?.title ?? null;
}

import { eq, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { MessagePart } from "../parts";
import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const localeEnum = pgEnum("locale", ["fr", "en"]);
export const themeEnum = pgEnum("theme", ["light", "dark", "system"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const messageStatusEnum = pgEnum("message_status", ["streaming", "done", "interrupted", "error"]);
export const messageSourceEnum = pgEnum("message_source", ["user", "app", "auto_fix"]);

export const userPreference = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Null means "follow Accept-Language". */
  locale: localeEnum("locale"),
  theme: themeEnum("theme").default("system").notNull(),
  /** OpenRouter slug; null means the global default from configuration. */
  defaultModel: text("default_model"),
  updatedAt: timestamps.updatedAt,
});

export const conversation = pgTable(
  "conversation",
  {
    // uuidv7() is built into Postgres 18: time-ordered ids, index-friendly.
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    modelId: text("model_id").notNull(),
    enabledServers: text("enabled_servers").array().default(sql`'{}'::text[]`).notNull(),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("conversation_user_updated_idx").on(table.userId, table.updatedAt.desc())],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    parts: jsonb("parts").$type<MessagePart[]>().notNull(),
    status: messageStatusEnum("status").default("done").notNull(),
    source: messageSourceEnum("source"),
    modelId: text("model_id"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8, mode: "number" }),
    /** Wall-clock time of the agent run that produced an assistant message. */
    durationMs: integer("duration_ms"),
    // clock_timestamp(), not now(): a turn inserts the user and assistant rows in one
    // transaction, and now() would give them the same time (and an undefined order).
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull(),
  },
  (table) => [
    index("message_conversation_created_idx").on(table.conversationId, table.createdAt),
    // At most one agent run per conversation: the streaming assistant row is the lock.
    uniqueIndex("message_one_streaming_per_conversation")
      .on(table.conversationId)
      .where(sql`${table.status} = 'streaming'`),
  ],
);

/**
 * LLM usage per user, day and model, for cost tracking. Per-user figures live here and
 * not in metrics labels (cardinality): a read-only Grafana Postgres datasource queries it.
 */
export const usageByUserDay = pgView("usage_by_user_day").as((qb) =>
  qb
    .select({
      userId: conversation.userId,
      day: sql<string>`(${message.createdAt} at time zone 'UTC')::date`.as("day"),
      modelId: message.modelId,
      answers: sql<number>`count(*)::int`.as("answers"),
      tokensIn: sql<number>`coalesce(sum(${message.tokensIn}), 0)::bigint`.as("tokens_in"),
      tokensOut: sql<number>`coalesce(sum(${message.tokensOut}), 0)::bigint`.as("tokens_out"),
      costUsd: sql<number>`coalesce(sum(${message.costUsd}), 0)`.as("cost_usd"),
    })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(sql`${message.role} = 'assistant'`)
    .groupBy(conversation.userId, sql`2`, message.modelId),
);

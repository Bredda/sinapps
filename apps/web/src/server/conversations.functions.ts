import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createConversation,
  deleteConversation,
  generateTitle,
  getConversation,
  listConversations,
  renameConversation,
} from "./conversations.server";
import { getPreferences } from "./preferences.server";
import { requireUserId } from "./session.server";

const conversationId = z.object({ id: z.uuid() });

export const fetchConversations = createServerFn({ method: "GET" }).handler(async () => {
  return listConversations(await requireUserId());
});

export const fetchConversation = createServerFn({ method: "GET" })
  .validator(conversationId)
  .handler(async ({ data }) => {
    const found = await getConversation(await requireUserId(), data.id);
    if (!found) throw notFound();
    return found;
  });

export const startConversation = createServerFn({ method: "POST" })
  .validator(z.object({ text: z.string().trim().min(1).max(20_000) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { defaultModel } = await getPreferences(userId);
    return { id: await createConversation(userId, defaultModel, data.text) };
  });

export const titleConversation = createServerFn({ method: "POST" })
  .validator(conversationId)
  .handler(async ({ data }) => {
    return { title: await generateTitle(await requireUserId(), data.id) };
  });

export const renameConversationFn = createServerFn({ method: "POST" })
  .validator(conversationId.extend({ title: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    if (!(await renameConversation(await requireUserId(), data.id, data.title))) throw notFound();
  });

export const deleteConversationFn = createServerFn({ method: "POST" })
  .validator(conversationId)
  .handler(async ({ data }) => {
    if (!(await deleteConversation(await requireUserId(), data.id))) throw notFound();
  });

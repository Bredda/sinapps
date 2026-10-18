import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAllowedModel, isConnector, listConnectors, listModels } from "./config.server";
import {
  createConversation,
  deleteConversation,
  generateTitle,
  getConversation,
  listConversations,
  renameConversation,
  updateConversationSettings,
} from "./conversations.server";
import { getPreferences } from "./preferences.server";
import { requireUserId } from "./session.server";

const conversationId = z.object({ id: z.uuid() });
const modelId = z.string().refine(isAllowedModel, "Unknown model");
const enabledServers = z.array(z.string().refine(isConnector, "Unknown connector")).max(20);

/** Sidebar list plus the chat options (model allowlist, optional connectors). */
export const fetchConversations = createServerFn({ method: "GET" }).handler(async () => {
  return {
    conversations: await listConversations(await requireUserId()),
    models: listModels(),
    connectors: listConnectors(),
  };
});

export const fetchConversation = createServerFn({ method: "GET" })
  .validator(conversationId)
  .handler(async ({ data }) => {
    const found = await getConversation(await requireUserId(), data.id);
    if (!found) throw notFound();
    return found;
  });

export const startConversation = createServerFn({ method: "POST" })
  .validator(
    z.object({
      text: z.string().trim().min(1).max(20_000),
      modelId: modelId.optional(),
      enabledServers: enabledServers.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const model = data.modelId ?? (await getPreferences(userId)).defaultModel;
    return { id: await createConversation(userId, model, data.text, data.enabledServers) };
  });

export const updateConversationFn = createServerFn({ method: "POST" })
  .validator(conversationId.extend({ modelId: modelId.optional(), enabledServers: enabledServers.optional() }))
  .handler(async ({ data: { id, ...settings } }) => {
    if (!(await updateConversationSettings(await requireUserId(), id, settings))) throw notFound();
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

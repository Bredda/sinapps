import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAllowedModel, listModels } from "./config.server";
import { getPreferences, updatePreferences } from "./preferences.server";
import { requireUserId } from "./session.server";

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  return { preferences: await getPreferences(userId), models: listModels() };
});

const preferencesInput = z
  .object({
    locale: z.enum(["en", "fr"]),
    theme: z.enum(["light", "dark", "system"]),
    defaultModel: z.string().refine(isAllowedModel, "Unknown model"),
  })
  .partial();

export const savePreferences = createServerFn({ method: "POST" })
  .validator(preferencesInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    await updatePreferences(userId, data);
  });

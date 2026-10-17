import { schema } from "@sinapps/db";
import { eq } from "drizzle-orm";
import { db } from "./auth.server";
import { config, isAllowedModel } from "./config.server";

export type Locale = (typeof schema.localeEnum.enumValues)[number];
export type Theme = (typeof schema.themeEnum.enumValues)[number];

export interface Preferences {
  /** Null: follow the browser (Accept-Language). */
  locale: Locale | null;
  theme: Theme;
  /** Always an allowlisted model: falls back to the configured default. */
  defaultModel: string;
}

export async function getPreferences(userId: string): Promise<Preferences> {
  const [row] = await db.select().from(schema.userPreference).where(eq(schema.userPreference.userId, userId));
  const stored = row?.defaultModel;
  return {
    locale: row?.locale ?? null,
    theme: row?.theme ?? "system",
    defaultModel: stored && isAllowedModel(stored) ? stored : config.models.default,
  };
}

export async function updatePreferences(
  userId: string,
  changes: Partial<Pick<Preferences, "locale" | "theme" | "defaultModel">>,
): Promise<void> {
  await db
    .insert(schema.userPreference)
    .values({ userId, ...changes })
    .onConflictDoUpdate({ target: schema.userPreference.userId, set: changes });
}

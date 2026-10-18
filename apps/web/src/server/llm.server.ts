import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { env } from "./env.server";
import { mockTextAdapter } from "./testing/mock-llm.server";

type OpenRouterModel = Parameters<typeof createOpenRouterText>[0];

/** OpenRouter text adapter for an allowlisted model id, with app attribution headers. */
export function textAdapter(modelId: string) {
  // End-to-end tests only: a scripted model instead of OpenRouter.
  if (process.env.SINAPPS_E2E_MOCK_LLM === "true" && process.env.NODE_ENV !== "production") {
    return mockTextAdapter(modelId) as unknown as ReturnType<typeof createOpenRouterText>;
  }
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
  // Model ids come from the validated config allowlist, not from TanStack's static catalog.
  return createOpenRouterText(modelId as OpenRouterModel, env.OPENROUTER_API_KEY, {
    httpReferer: env.BETTER_AUTH_URL,
    appTitle: "Sinapps",
  });
}

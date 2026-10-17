import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { env } from "./env.server";

const modelSchema = z.object({
  /** OpenRouter model slug. */
  id: z.string().min(1),
  label: z.string().min(1),
  tier: z.enum(["premium", "balanced", "fast", "budget"]),
  /** OpenRouter provider routing, e.g. to pin hosts that stream tool arguments. */
  provider: z
    .object({
      order: z.array(z.string()).optional(),
      allowFallbacks: z.boolean().optional(),
    })
    .optional(),
  /** False when tool arguments arrive in one block: the UI shows a skeleton instead of a live preview. */
  streamsToolArgs: z.boolean().default(true),
});

const configSchema = z
  .object({
    models: z.object({
      default: z.string(),
      allowlist: z.array(modelSchema).min(1),
    }),
  })
  .refine((config) => config.models.allowlist.some((model) => model.id === config.models.default), {
    message: "models.default must be one of models.allowlist",
  });

export type ModelConfig = z.infer<typeof modelSchema>;

// Read once at startup: an invalid configuration fails fast instead of at the first request.
export const config = configSchema.parse(parse(readFileSync(env.SINAPPS_CONFIG, "utf8")));

/** Public view of the allowlist, safe to send to the browser. */
export function listModels() {
  return config.models.allowlist.map(({ id, label, tier }) => ({ id, label, tier }));
}

export function isAllowedModel(id: string): boolean {
  return config.models.allowlist.some((model) => model.id === id);
}

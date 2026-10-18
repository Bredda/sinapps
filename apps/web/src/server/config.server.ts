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
  /** Default reasoning effort; omitted: the provider default. */
  reasoning: z.enum(["off", "low", "medium", "high"]).optional(),
  /** Upper bound for one agent run (all ReAct steps). */
  timeoutMs: z.number().int().positive().default(240_000),
});

const mcpServerSchema = z.object({
  /** Stable id: tool-name prefix and the serverId MCP Apps widgets route through. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  url: z.url(),
  /** Values may reference environment variables as ${NAME} (secrets stay out of the file). */
  headers: z.record(z.string(), z.string()).default({}),
  /** Optional servers can be toggled per conversation; core servers are always on. */
  optional: z.boolean().default(false),
  enabledByDefault: z.boolean().default(true),
});

const configSchema = z
  .object({
    mcpServers: z.array(mcpServerSchema).default([]),
    models: z.object({
      default: z.string(),
      /** Model for side tasks (conversation titles…): cheap and fast. Defaults to `default`. */
      utility: z.string().optional(),
      allowlist: z.array(modelSchema).min(1),
    }),
  })
  .refine((config) => config.models.allowlist.some((model) => model.id === config.models.default), {
    message: "models.default must be one of models.allowlist",
  })
  .refine(
    (config) => !config.models.utility || config.models.allowlist.some((model) => model.id === config.models.utility),
    {
      message: "models.utility must be one of models.allowlist",
    },
  );

export type ModelConfig = z.infer<typeof modelSchema>;
export type McpServerConfig = z.infer<typeof mcpServerSchema>;

const ENV_REF = /\$\{([A-Z0-9_]+)\}/g;

/** Replaces ${NAME} references; returns null when one of them is not set. */
function interpolate(value: string): string | null {
  let missing = false;
  const result = value.replace(ENV_REF, (_, name: string) => {
    const resolved = process.env[name];
    if (!resolved) missing = true;
    return resolved ?? "";
  });
  return missing ? null : result;
}

function resolveSecrets(server: McpServerConfig): McpServerConfig | null {
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(server.headers)) {
    const value = interpolate(raw);
    if (value === null) {
      console.warn(`[config] MCP server "${server.id}" disabled: ${raw} references an unset environment variable`);
      return null;
    }
    headers[key] = value;
  }
  return { ...server, headers };
}

// Read once at startup: an invalid configuration fails fast instead of at the first request.
const parsed = configSchema.parse(parse(readFileSync(env.SINAPPS_CONFIG, "utf8")));
export const config = {
  ...parsed,
  mcpServers: parsed.mcpServers.map(resolveSecrets).filter((server) => server !== null),
};

/** Public view of the allowlist, safe to send to the browser. */
export function listModels() {
  return config.models.allowlist.map(({ id, label, tier }) => ({ id, label, tier }));
}

/** MCP servers active in a conversation: core ones plus the optional ones it enabled. */
export function activeMcpServers(enabledOptional: readonly string[]): McpServerConfig[] {
  return config.mcpServers.filter((server) => !server.optional || enabledOptional.includes(server.id));
}

/** Optional servers enabled for a new conversation. */
export function defaultEnabledServers(): string[] {
  return config.mcpServers.filter((server) => server.optional && server.enabledByDefault).map((server) => server.id);
}

export function getModel(id: string): ModelConfig | undefined {
  return config.models.allowlist.find((model) => model.id === id);
}

export function isAllowedModel(id: string): boolean {
  return config.models.allowlist.some((model) => model.id === id);
}

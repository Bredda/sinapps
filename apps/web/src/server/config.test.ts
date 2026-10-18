import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const YAML = `
mcpServers:
  - id: core
    label: Core
    url: http://localhost:1/mcp
  - id: search
    label: Search
    url: http://localhost:2/mcp
    headers: { Authorization: "Bearer \${TEST_SEARCH_KEY}" }
    optional: true
  - id: manual
    label: Manual
    url: http://localhost:3/mcp
    optional: true
    enabledByDefault: false
models:
  default: m/balanced
  utility: m/fast
  allowlist:
    - { id: m/fast, label: Fast, tier: fast, streamsToolArgs: false }
    - { id: m/balanced, label: Balanced, tier: balanced }
`;

/** config.server reads its file when first imported: load it fresh with a given file and environment. */
async function loadConfig(yaml: string, vars: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sinapps-config-"));
  const file = join(dir, "config.yaml");
  writeFileSync(file, yaml);
  vi.stubEnv("SINAPPS_CONFIG", file);
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  vi.resetModules();
  return import("./config.server");
}

beforeEach(() => vi.stubEnv("TEST_SEARCH_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

describe("config", () => {
  it("resolves environment references in headers", async () => {
    const config = await loadConfig(YAML, { TEST_SEARCH_KEY: "s3cret" });
    expect(config.config.mcpServers.find((server) => server.id === "search")?.headers).toEqual({
      Authorization: "Bearer s3cret",
    });
  });

  it("disables a server whose secret is not set, instead of failing", async () => {
    const config = await loadConfig(YAML);
    expect(config.config.mcpServers.map((server) => server.id)).toEqual(["core", "manual"]);
  });

  it("keeps core servers always on and toggles optional ones per conversation", async () => {
    const config = await loadConfig(YAML, { TEST_SEARCH_KEY: "k" });
    expect(config.activeMcpServers([]).map((server) => server.id)).toEqual(["core"]);
    expect(config.activeMcpServers(["manual"]).map((server) => server.id)).toEqual(["core", "manual"]);
    expect(config.defaultEnabledServers()).toEqual(["search"]);
    expect(config.listConnectors().map((connector) => connector.id)).toEqual(["search", "manual"]);
  });

  it("only exposes allowlisted models, without server-side fields", async () => {
    const config = await loadConfig(YAML);
    expect(config.isAllowedModel("m/fast")).toBe(true);
    expect(config.isAllowedModel("evil/model")).toBe(false);
    expect(config.listModels()).toEqual([
      { id: "m/fast", label: "Fast", tier: "fast" },
      { id: "m/balanced", label: "Balanced", tier: "balanced" },
    ]);
    expect(config.getModel("m/balanced")).toMatchObject({ streamsToolArgs: true, timeoutMs: 240_000 });
  });

  it("fails fast when the default model is not allowlisted", async () => {
    const broken = YAML.replace("default: m/balanced", "default: m/unknown");
    await expect(loadConfig(broken)).rejects.toThrow(/models.default/);
  });
});

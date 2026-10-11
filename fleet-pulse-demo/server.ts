import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import {
  McpServer,
  type CallToolResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Works both from source (server.ts) and compiled (dist/server.js).
const SERVER_FILE = fileURLToPath(import.meta.url);
const DIST_DIR = SERVER_FILE.endsWith(".ts")
  ? path.join(path.dirname(SERVER_FILE), "dist")
  : path.dirname(SERVER_FILE);

// =============================================================================
// Fleet simulation
//
// Transport runs in stateless HTTP mode (a fresh McpServer per request), so
// instead of a long-lived "world" object we model the fleet as pure
// functions of wall-clock time. Every poll recomputes metrics from
// `Date.now()`, which means multiple server instances (or horizontal scaling)
// all agree on the same simulated reality without sharing any state.
// =============================================================================

const REGIONS = ["us-east", "us-west", "eu-west", "ap-south"] as const;
type Region = (typeof REGIONS)[number];

const ROLES = ["web", "api", "db", "cache", "worker"] as const;
type Role = (typeof ROLES)[number];

interface ServerDef {
  id: string;
  name: string;
  region: Region;
  role: Role;
  baseCpu: number;
  baseMem: number;
  baseLatency: number;
  baseRps: number;
  phase: number; // offset into the sine wave, unique per server
  period: number; // ms per oscillation cycle
}

const FLEET: ServerDef[] = [
  { id: "web-ue-1", name: "web-ue-1", region: "us-east", role: "web", baseCpu: 28, baseMem: 40, baseLatency: 45, baseRps: 850, phase: 0, period: 19_000 },
  { id: "web-uw-1", name: "web-uw-1", region: "us-west", role: "web", baseCpu: 32, baseMem: 44, baseLatency: 52, baseRps: 720, phase: 1.1, period: 23_000 },
  { id: "api-ue-1", name: "api-ue-1", region: "us-east", role: "api", baseCpu: 46, baseMem: 55, baseLatency: 80, baseRps: 1_200, phase: 2.4, period: 17_000 },
  { id: "api-ew-1", name: "api-ew-1", region: "eu-west", role: "api", baseCpu: 41, baseMem: 50, baseLatency: 70, baseRps: 980, phase: 3.3, period: 21_000 },
  { id: "db-ue-1", name: "db-ue-1", region: "us-east", role: "db", baseCpu: 58, baseMem: 72, baseLatency: 12, baseRps: 3_100, phase: 0.6, period: 29_000 },
  { id: "db-ap-1", name: "db-ap-1", region: "ap-south", role: "db", baseCpu: 51, baseMem: 66, baseLatency: 18, baseRps: 2_400, phase: 4.1, period: 31_000 },
  { id: "cache-ew-1", name: "cache-ew-1", region: "eu-west", role: "cache", baseCpu: 22, baseMem: 60, baseLatency: 3, baseRps: 5_200, phase: 5.0, period: 13_000 },
  { id: "worker-ap-1", name: "worker-ap-1", region: "ap-south", role: "worker", baseCpu: 37, baseMem: 48, baseLatency: 0, baseRps: 410, phase: 2.0, period: 25_000 },
];

// Cheap deterministic hash -> stable per-server, per-time-bucket "noise".
function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // [0, 1)
}

// Every server gets its own incident schedule derived from its id so the
// demo stays lively and reproducible without any mutable server-side state.
function incidentFactor(def: ServerDef, now: number): number {
  const cycle = 45_000; // one potential incident window per 45s per server
  const idSeed = def.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const windowStart = ((now + idSeed * 977) % (cycle * FLEET.length)) ;
  const slot = Math.floor(windowStart / cycle);
  // Only the slot matching this server's own index gets to spike -> at most
  // one simulated incident across the fleet at any given moment.
  const myIndex = FLEET.indexOf(def);
  if (slot !== myIndex % FLEET.length) return 0;
  const withinCycle = windowStart % cycle;
  const incidentDuration = 9_000;
  if (withinCycle > incidentDuration) return 0;
  // Smooth ramp up/down (triangle envelope) rather than a hard step.
  const t = withinCycle / incidentDuration;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

interface ServerMetrics {
  id: string;
  cpuPercent: number;
  memPercent: number;
  latencyMs: number;
  rps: number;
  status: "healthy" | "warning" | "critical";
}

function computeMetrics(def: ServerDef, now: number): ServerMetrics {
  const wave = Math.sin((now / def.period) * 2 * Math.PI + def.phase);
  const noise = pseudoNoise(Math.floor(now / 2000) + def.phase * 1000) - 0.5;
  const incident = incidentFactor(def, now);

  const cpuPercent = clamp(
    def.baseCpu + wave * 10 + noise * 6 + incident * 45,
    1,
    99,
  );
  const memPercent = clamp(
    def.baseMem + wave * 6 + noise * 4 + incident * 20,
    1,
    99,
  );
  const latencyMs = Math.max(
    1,
    Math.round(def.baseLatency * (1 + Math.max(0, wave) * 0.3 + incident * 4) + noise * 5),
  );
  const rps = Math.max(
    0,
    Math.round(def.baseRps * (1 + wave * 0.25 - incident * 0.5) + noise * def.baseRps * 0.1),
  );

  const status: ServerMetrics["status"] =
    cpuPercent > 85 || latencyMs > 300
      ? "critical"
      : cpuPercent > 65 || latencyMs > 150
        ? "warning"
        : "healthy";

  return {
    id: def.id,
    cpuPercent: Math.round(cpuPercent),
    memPercent: Math.round(memPercent),
    latencyMs,
    rps,
    status,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// =============================================================================
// Schemas
// =============================================================================

const RegionEnum = z.enum(REGIONS);

const OverviewSchema = z.object({
  generatedAt: z.string(),
  highlightRegion: RegionEnum.or(z.literal("all")),
  servers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      region: RegionEnum,
      role: z.enum(ROLES),
    }),
  ),
});

const MetricsSchema = z.object({
  timestamp: z.string(),
  servers: z.array(
    z.object({
      id: z.string(),
      cpuPercent: z.number(),
      memPercent: z.number(),
      latencyMs: z.number(),
      rps: z.number(),
      status: z.enum(["healthy", "warning", "critical"]),
    }),
  ),
});

// =============================================================================
// MCP server
// =============================================================================

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Fleet Pulse",
    version: "1.0.0",
  });

  const resourceUri = "ui://fleet-pulse/mcp-app.html";

  // Model-facing tool: the LLM calls this to open the dashboard. It only
  // returns the static fleet topology (who exists, where) -- live numbers
  // are fetched by the App itself via the app-only polling tool below, so
  // the model's context never gets flooded with a metrics stream.
  registerAppTool(
    server,
    "open-fleet-dashboard",
    {
      title: "Open Fleet Dashboard",
      description:
        "Opens the live Fleet Pulse monitoring dashboard showing the server fleet's topology. " +
        "Optionally spotlight a region. Live metrics are streamed inside the dashboard itself, " +
        "not through this tool.",
      inputSchema: z.object({
        region: RegionEnum.or(z.literal("all"))
          .default("all")
          .describe("Region to spotlight first in the dashboard."),
      }),
      outputSchema: OverviewSchema,
      _meta: { ui: { resourceUri } },
    },
    ({ region }): CallToolResult => {
      const overview = {
        generatedAt: new Date().toISOString(),
        highlightRegion: region,
        servers: FLEET.map(({ id, name, region, role }) => ({ id, name, region, role })),
      };
      return {
        content: [
          {
            type: "text",
            text: `Fleet Pulse dashboard opened (${FLEET.length} servers, spotlighting ${region}).`,
          },
        ],
        structuredContent: overview,
      };
    },
  );

  // App-only tool: hidden from the model's tool list. The dashboard polls
  // this every 2s for fresh numbers so live updates never need a model turn.
  registerAppTool(
    server,
    "poll-fleet-metrics",
    {
      title: "Poll Fleet Metrics",
      description: "Returns current simulated metrics for every server. App-only.",
      inputSchema: z.object({}),
      outputSchema: MetricsSchema,
      _meta: { ui: { visibility: ["app"] } },
    },
    (): CallToolResult => {
      const now = Date.now();
      const metrics = {
        timestamp: new Date(now).toISOString(),
        servers: FLEET.map((def) => computeMetrics(def, now)),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(metrics) }],
        structuredContent: metrics,
      };
    },
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Fleet Pulse dashboard UI" },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );

  return server;
}

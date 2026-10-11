/**
 * @file Fleet Pulse — a live infrastructure dashboard demonstrating what an
 * MCP App can do beyond rendering text: self-driven polling, interactive
 * drill-down, and pushing information back into the conversation in two
 * different ways (silent context vs. a message that triggers a reply).
 */
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type App,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Gauge, Sparkline, StatusDot } from "./components";
import type {
  FleetMetrics,
  FleetOverview,
  MetricHistory,
  Region,
  ServerMetrics,
  ServerTopology,
  Status,
} from "./types";
import { HISTORY_LENGTH } from "./types";
import "./global.css";
import "./mcp-app.css";

const POLL_INTERVAL_MS = 2000;
const REGIONS: (Region | "all")[] = ["all", "us-east", "us-west", "eu-west", "ap-south"];

function structured<T>(result: CallToolResult): T | null {
  return (result.structuredContent as T) ?? null;
}

function pushHistory(history: MetricHistory, id: string, value: number): MetricHistory {
  const prev = history[id] ?? [];
  const next = [...prev, value].slice(-HISTORY_LENGTH);
  return { ...history, [id]: next };
}

// =============================================================================
// Root: connect to host, wire up handlers before anything else renders
// =============================================================================

function FleetPulseApp() {
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "Fleet Pulse", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = async (result) => {
        const data = structured<FleetOverview>(result);
        if (data) setOverview(data);
      };
      app.onhostcontextchanged = (ctx) => {
        setHostContext((prev) => ({ ...prev, ...ctx }));
      };
      app.onerror = (e) => console.error("[fleet-pulse]", e);
      app.onteardown = async () => ({});
    },
  });

  useEffect(() => {
    if (!app) return;
    const ctx = app.getHostContext();
    if (ctx) setHostContext(ctx);
  }, [app]);

  useEffect(() => {
    if (hostContext?.theme) applyDocumentTheme(hostContext.theme);
    if (hostContext?.styles?.variables) applyHostStyleVariables(hostContext.styles.variables);
    if (hostContext?.styles?.css?.fonts) applyHostFonts(hostContext.styles.css.fonts);
  }, [hostContext]);

  if (error) {
    return (
      <main className="shell shell--center">
        <strong>Connection error:</strong> {error.message}
      </main>
    );
  }
  if (!app) {
    return <main className="shell shell--center">Connecting to Fleet Pulse…</main>;
  }

  return <Dashboard app={app} overview={overview} hostContext={hostContext} />;
}

// =============================================================================
// Dashboard: polling, filtering, drill-down, model push
// =============================================================================

interface DashboardProps {
  app: App;
  overview: FleetOverview | null;
  hostContext?: McpUiHostContext;
}

function Dashboard({ app, overview, hostContext }: DashboardProps) {
  const [metrics, setMetrics] = useState<Record<string, ServerMetrics>>({});
  const [history, setHistory] = useState<MetricHistory>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<Region | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (overview?.highlightRegion) setRegionFilter(overview.highlightRegion);
  }, [overview?.highlightRegion]);

  // Live polling loop — runs entirely inside the App, never touches the
  // model's context. This is what makes a dashboard feel "live" rather than
  // a static snapshot re-rendered only when the model calls a tool.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await app.callServerTool({ name: "poll-fleet-metrics", arguments: {} });
        const data = structured<FleetMetrics>(result);
        if (!data || cancelled) return;
        setMetrics((prev) => {
          const next = { ...prev };
          for (const s of data.servers) next[s.id] = s;
          return next;
        });
        setHistory((prev) => {
          let next = prev;
          for (const s of data.servers) next = pushHistory(next, s.id, s.cpuPercent);
          return next;
        });
      } catch (e) {
        console.error("[fleet-pulse] poll failed", e);
      }
    }

    poll();
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [app]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Silent push: lands in the model's context on its *next* turn, without
  // interrupting the conversation now.
  const shareContext = useCallback(
    async (server: ServerTopology, m: ServerMetrics) => {
      try {
        await app.updateModelContext({
          content: [
            {
              type: "text",
              text:
                `User is viewing live metrics for ${server.name} (${server.role}, ${server.region}): ` +
                `CPU ${m.cpuPercent}%, memory ${m.memPercent}%, latency ${m.latencyMs}ms, ` +
                `${m.rps} req/s, status "${m.status}".`,
            },
          ],
        });
        showToast(`Context updated silently — ${server.name}'s state is now available to the AI.`);
      } catch (e) {
        console.error(e);
        showToast("Could not update AI context.");
      }
    },
    [app, showToast],
  );

  // Active push: this one DOES trigger a model turn, as if the user had
  // typed the message themselves.
  const askAboutServer = useCallback(
    async (server: ServerTopology, m: ServerMetrics) => {
      try {
        const { isError } = await app.sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Can you look into ${server.name} (${server.role}, ${server.region})? ` +
                `It's showing ${m.status} status: CPU ${m.cpuPercent}%, latency ${m.latencyMs}ms, ${m.rps} req/s.`,
            },
          ],
        });
        showToast(isError ? "The host rejected the message." : "Sent — check the conversation for the AI's reply.");
      } catch (e) {
        console.error(e);
        showToast("Could not send message to the AI.");
      }
    },
    [app, showToast],
  );

  const toggleFullscreen = useCallback(async () => {
    const nextMode = fullscreen ? "inline" : "fullscreen";
    if (hostContext?.availableDisplayModes && !hostContext.availableDisplayModes.includes(nextMode)) {
      showToast("This host doesn't support fullscreen mode.");
      return;
    }
    try {
      await app.requestDisplayMode({ mode: nextMode });
      setFullscreen(!fullscreen);
    } catch (e) {
      console.error(e);
      showToast("Host declined the display mode change.");
    }
  }, [app, fullscreen, hostContext, showToast]);

  const servers = overview?.servers ?? [];
  const visible = servers.filter((s) => regionFilter === "all" || s.region === regionFilter);
  const selected = servers.find((s) => s.id === selectedId) ?? null;
  const selectedMetrics = selected ? metrics[selected.id] : undefined;

  const counts = servers.reduce(
    (acc, s) => {
      const st = metrics[s.id]?.status;
      if (st) acc[st]++;
      return acc;
    },
    { healthy: 0, warning: 0, critical: 0 } as Record<Status, number>,
  );
  const avgCpu = servers.length
    ? Math.round(
        servers.reduce((sum, s) => sum + (metrics[s.id]?.cpuPercent ?? 0), 0) / servers.length,
      )
    : 0;
  const totalRps = servers.reduce((sum, s) => sum + (metrics[s.id]?.rps ?? 0), 0);

  return (
    <main
      className="shell"
      style={{
        paddingTop: hostContext?.safeAreaInsets?.top,
        paddingRight: hostContext?.safeAreaInsets?.right,
        paddingBottom: hostContext?.safeAreaInsets?.bottom,
        paddingLeft: hostContext?.safeAreaInsets?.left,
      }}
    >
      <header className="header">
        <div className="header-title">
          <span className="pulse-dot" aria-hidden="true" />
          <h1>Fleet Pulse</h1>
        </div>
        <div className="header-summary">
          <SummaryStat label="healthy" value={counts.healthy} tone="healthy" />
          <SummaryStat label="warning" value={counts.warning} tone="warning" />
          <SummaryStat label="critical" value={counts.critical} tone="critical" />
          <SummaryStat label="avg cpu" value={`${avgCpu}%`} />
          <SummaryStat label="req/s" value={totalRps.toLocaleString()} />
        </div>
        <button className="btn btn--ghost" onClick={toggleFullscreen}>
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </header>

      <nav className="region-filter" aria-label="Filter by region">
        {REGIONS.map((r) => (
          <button
            key={r}
            className={`chip ${regionFilter === r ? "chip--active" : ""}`}
            onClick={() => setRegionFilter(r)}
          >
            {r === "all" ? "All regions" : r}
          </button>
        ))}
      </nav>

      {!overview ? (
        <p className="notice">Waiting for fleet topology…</p>
      ) : (
        <div className="grid">
          {visible.map((server) => {
            const m = metrics[server.id];
            const isSpotlit = overview.highlightRegion !== "all" && overview.highlightRegion === server.region;
            return (
              <ServerCard
                key={server.id}
                server={server}
                metrics={m}
                history={history[server.id] ?? []}
                spotlit={isSpotlit}
                onOpen={() => setSelectedId(server.id)}
                onFlag={() => m && askAboutServer(server, m)}
              />
            );
          })}
        </div>
      )}

      {selected && selectedMetrics && (
        <DetailPanel
          server={selected}
          metrics={selectedMetrics}
          history={history[selected.id] ?? []}
          onClose={() => setSelectedId(null)}
          onShareContext={() => shareContext(selected, selectedMetrics)}
          onAsk={() => askAboutServer(selected, selectedMetrics)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

// =============================================================================
// Presentational pieces
// =============================================================================

function SummaryStat({ label, value, tone }: { label: string; value: string | number; tone?: Status }) {
  return (
    <div className={`summary-stat ${tone ? `summary-stat--${tone}` : ""}`}>
      <span className="summary-stat-value">{value}</span>
      <span className="summary-stat-label">{label}</span>
    </div>
  );
}

interface ServerCardProps {
  server: ServerTopology;
  metrics?: ServerMetrics;
  history: number[];
  spotlit: boolean;
  onOpen: () => void;
  onFlag: () => void;
}

function ServerCard({ server, metrics, history, spotlit, onOpen, onFlag }: ServerCardProps) {
  const status = metrics?.status ?? "healthy";
  return (
    <article className={`card ${spotlit ? "card--spotlit" : ""}`} onClick={onOpen}>
      <div className="card-head">
        <div>
          <h3>{server.name}</h3>
          <p className="card-meta">
            {server.role} · {server.region}
          </p>
        </div>
        <StatusDot status={status} />
      </div>

      <div className="card-body">
        <Gauge value={metrics?.cpuPercent ?? 0} status={status} />
        <div className="card-metrics">
          <MetricRow label="mem" value={`${metrics?.memPercent ?? 0}%`} />
          <MetricRow label="latency" value={`${metrics?.latencyMs ?? 0}ms`} />
          <MetricRow label="req/s" value={(metrics?.rps ?? 0).toLocaleString()} />
        </div>
      </div>

      <Sparkline data={history} status={status} />

      {status !== "healthy" && (
        <button
          className="btn btn--flag"
          onClick={(e) => {
            e.stopPropagation();
            onFlag();
          }}
        >
          Ask AI to investigate
        </button>
      )}
    </article>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-row">
      <span className="metric-row-label">{label}</span>
      <span className="metric-row-value">{value}</span>
    </div>
  );
}

interface DetailPanelProps {
  server: ServerTopology;
  metrics: ServerMetrics;
  history: number[];
  onClose: () => void;
  onShareContext: () => void;
  onAsk: () => void;
}

function DetailPanel({ server, metrics, history, onClose, onShareContext, onAsk }: DetailPanelProps) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <h2>{server.name}</h2>
            <p className="card-meta">
              {server.role} · {server.region}
            </p>
          </div>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="panel-body">
          <Gauge value={metrics.cpuPercent} status={metrics.status} />
          <div className="panel-metrics">
            <MetricRow label="memory" value={`${metrics.memPercent}%`} />
            <MetricRow label="latency" value={`${metrics.latencyMs}ms`} />
            <MetricRow label="throughput" value={`${metrics.rps.toLocaleString()} req/s`} />
            <MetricRow label="status" value={metrics.status} />
          </div>
        </div>

        <p className="panel-caption">CPU history (last {HISTORY_LENGTH * 2}s)</p>
        <div className="panel-sparkline">
          <Sparkline data={history} status={metrics.status} />
        </div>

        <div className="panel-actions">
          <button className="btn btn--secondary" onClick={onShareContext}>
            Share this view with AI (silent)
          </button>
          <button className="btn btn--primary" onClick={onAsk}>
            Ask AI to investigate
          </button>
        </div>
        <p className="panel-hint">
          "Share" updates the model's context quietly for its next turn. "Ask" sends a message now,
          as if you'd typed it — the AI will respond in the conversation.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<FleetPulseApp />);

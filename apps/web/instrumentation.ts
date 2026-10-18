/**
 * OpenTelemetry bootstrap (docs/architecture-proposal.md §3.11).
 *
 * Loaded before the app: `node --import ./instrumentation.ts …` (see the `dev` script).
 * Automatic instrumentation patches modules as they load, so it cannot start from
 * application code. It only runs when an OTLP endpoint is configured; configuration
 * is the standard OTEL_* environment (endpoint, headers, service name, sampler…).
 */
import { register } from "node:module";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

if (endpoint && process.env.OTEL_SDK_DISABLED !== "true") {
  // `pg` is imported by drizzle as an ES module: only the import-in-the-middle loader hook can patch it.
  // Limited to `pg`: wrapping every module breaks packages with circular imports (TanStack Router).
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url, { data: { include: ["pg"] } });
  process.env.OTEL_SERVICE_NAME ??= "sinapps-web";

  const { NodeSDK, metrics } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");
  const [{ HttpInstrumentation }, { PgInstrumentation }] = await Promise.all([
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-pg"),
  ]);

  /** Vite dev assets and static files: noise, not requests worth a trace. */
  const isAsset = (url = "") =>
    /^\/(@|src\/|node_modules\/|_build\/|assets\/)/.test(url) ||
    /\.(js|mjs|css|map|svg|png|ico|woff2?|json)(\?|$)/.test(url);

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new metrics.PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 15_000),
    }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => isAsset(request.url),
        // Readable span names for incoming requests: "POST /api/agent", "GET /c/:id",
        // "POST /_serverFn/renameConversationFn" (TanStack Start encodes the function in base64).
        requestHook: (span, request) => {
          if (!("url" in request) || !request.method) return;
          let path = (request.url ?? "").split("?")[0] ?? "";
          const serverFn = /^\/_serverFn\/([\w-]+)/.exec(path)?.[1];
          if (serverFn) {
            try {
              const { export: name } = JSON.parse(Buffer.from(serverFn, "base64url").toString());
              path = `/_serverFn/${String(name).replace(/_createServerFn_handler$/, "")}`;
            } catch {}
          }
          span.updateName(`${request.method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")}`);
        },
      }),
      new PgInstrumentation(),
    ],
  });
  sdk.start();

  const shutdown = () => sdk.shutdown().catch(() => {});
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

import { trace } from "@opentelemetry/api";
import pino from "pino";
import { env } from "./env.server";

/**
 * JSON logs on stdout (collected by the cluster), correlated with traces: every line
 * logged inside a span carries its `trace_id` and `span_id`.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: process.env.OTEL_SERVICE_NAME ?? "sinapps-web" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (level) => ({ level }) },
  mixin() {
    const span = trace.getActiveSpan()?.spanContext();
    return span ? { trace_id: span.traceId, span_id: span.spanId } : {};
  },
});

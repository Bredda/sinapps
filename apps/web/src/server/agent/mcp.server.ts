import { createMCPClient, type MCPClient } from "@tanstack/ai-mcp";
import type { ToolCallMetadata } from "@/lib/agent-run";
import { activeMcpServers } from "../config.server";
import { logger } from "../logger.server";
import { tracer } from "../telemetry.server";

export interface McpSession {
  clients: MCPClient[];
  /** Display metadata by model-visible tool name. */
  toolMeta: Map<string, ToolCallMetadata>;
  close(): Promise<void>;
}

/**
 * Connects the MCP servers active in a conversation. A server that is down is
 * skipped (logged) rather than failing the whole turn.
 */
export function openMcpSession(enabledOptional: readonly string[]): Promise<McpSession> {
  const servers = activeMcpServers(enabledOptional);
  return tracer.startActiveSpan(
    "mcp.session",
    { attributes: { "sinapps.mcp.servers": servers.map((s) => s.id) } },
    async (span) => {
      try {
        return await connect(servers);
      } finally {
        span.end();
      }
    },
  );
}

async function connect(servers: ReturnType<typeof activeMcpServers>): Promise<McpSession> {
  const clients: MCPClient[] = [];
  const toolMeta = new Map<string, ToolCallMetadata>();

  await Promise.all(
    servers.map(async (server) => {
      try {
        const client = await createMCPClient({
          transport: { type: "http", url: server.url, headers: server.headers },
          prefix: server.id,
        });
        for (const tool of await client.tools()) {
          toolMeta.set(tool.name, {
            title: tool.metadata.mcp.title,
            serverId: server.id,
            uiResourceUri: tool.metadata.mcp.uiResourceUri,
          });
        }
        clients.push(client);
      } catch (error) {
        logger.warn({ err: error, server: server.id }, "MCP server unavailable, continuing without it");
      }
    }),
  );

  return {
    clients,
    toolMeta,
    async close() {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}

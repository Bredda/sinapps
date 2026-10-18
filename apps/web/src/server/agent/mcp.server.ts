import { createMCPClient, type MCPClient } from "@tanstack/ai-mcp";
import type { ToolCallMetadata } from "@/lib/agent-run";
import { activeMcpServers } from "../config.server";

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
export async function openMcpSession(enabledOptional: readonly string[]): Promise<McpSession> {
  const clients: MCPClient[] = [];
  const toolMeta = new Map<string, ToolCallMetadata>();

  await Promise.all(
    activeMcpServers(enabledOptional).map(async (server) => {
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
        console.warn(`[mcp] server "${server.id}" unavailable, continuing without it`, error);
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

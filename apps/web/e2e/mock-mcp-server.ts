/**
 * Stand-in for the Tavily MCP server in end-to-end tests: same tool name and result
 * shape, canned results, stateless Streamable HTTP. Run with `node e2e/mock-mcp-server.ts`.
 */
import { createServer } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const PORT = Number(process.env.MOCK_MCP_PORT ?? 3398);

function build(): McpServer {
  const server = new McpServer({ name: "mock-tavily", version: "0.0.1" });
  server.registerTool(
    "tavily_search",
    {
      title: "Tavily Search",
      description: "Searches the web.",
      inputSchema: z.object({ query: z.string() }),
    },
    async ({ query }) => {
      const result = {
        query,
        results: [
          { title: "Weather in Lisbon", url: "https://www.example.com/weather/lisbon" },
          { title: "Climate data", url: "https://data.example.org/climate" },
        ],
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    },
  );
  return server;
}

createServer(async (req, res) => {
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end();
    return;
  }
  const server = build();
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}).listen(PORT, () => console.error(`mock MCP on http://localhost:${PORT}/mcp`));

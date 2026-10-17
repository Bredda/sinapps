/**
 * Spike MCP server: one plain tool (ReAct "observation" step) and two
 * MCP Apps tools (a templated table and a free-form canvas), served over
 * stateless Streamable HTTP with the official SDK v2.
 */
import { createServer as createHttpServer } from "node:http";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 3299);
const TABLE_URI = "ui://spike/table";
const CANVAS_URI = "ui://spike/canvas";

const OFFERS = [
  { name: "Plan A", dataGb: 20, priceEur: 9.99, contractMonths: 0 },
  { name: "Plan B", dataGb: 100, priceEur: 14.99, contractMonths: 12 },
  { name: "Plan C", dataGb: 60, priceEur: 11.99, contractMonths: 0 },
];

function text(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function build(): McpServer {
  const server = new McpServer({ name: "spike-genui", version: "0.0.1" });

  server.registerTool(
    "get_mobile_offers",
    {
      title: "Mobile offers",
      description: "Returns current mobile plan offers (name, data in GB, monthly price in EUR, contract length).",
      inputSchema: z.object({ country: z.string().describe("ISO country code, e.g. FR") }),
    },
    async () => text({ offers: OFFERS }),
  );

  registerAppTool(
    server,
    "show_table",
    {
      title: "Table",
      description: "Displays an interactive comparison table to the user. Use it to present tabular comparisons.",
      inputSchema: z.object({
        title: z.string(),
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
        highlightRowIndex: z.number().int().optional(),
      }),
      _meta: { ui: { resourceUri: TABLE_URI } },
    },
    async (args) => text({ rendered: true, rowCount: args.rows.length }),
  );

  registerAppTool(
    server,
    "render_canvas",
    {
      title: "Canvas",
      description:
        "Renders a self-contained interactive HTML widget to the user. Provide complete HTML with inline CSS and JS.",
      inputSchema: z.object({ title: z.string(), html: z.string() }),
      _meta: { ui: { resourceUri: CANVAS_URI } },
    },
    async (args) => text({ rendered: true, bytes: args.html.length }),
  );

  for (const uri of [TABLE_URI, CANVAS_URI]) {
    registerAppResource(server, uri, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: `<!doctype html><title>${uri}</title>` }],
    }));
  }
  return server;
}

createHttpServer(async (req, res) => {
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
}).listen(PORT, () => console.error(`spike MCP on http://localhost:${PORT}/mcp`));

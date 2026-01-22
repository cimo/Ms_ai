import { FastMCP } from "fastmcp";

// Source
import { toolMathExpression, toolMathSum } from "./tool/Math.js";

export const URL_MCP = new URL(process.env["MS_AI_URL_MCP"] as string);

const server = new FastMCP<Record<string, unknown>>({
    name: "Tool server",
    version: "1.0.0"
});

server.addTool(toolMathExpression);
server.addTool(toolMathSum);

server.start({
    transportType: "httpStream",
    httpStream: {
        host: URL_MCP.hostname,
        port: URL_MCP.port as unknown as number,
        endpoint: "/mcp"
    }
});

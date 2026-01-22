import { FastMCP } from "fastmcp";

// Source
import * as modelMain from "./model/Main.js";
import { toolSum, toolExpression } from "./tool/Math.js";

export const URL_MCP = new URL(process.env["MS_AI_URL_MCP"] as string);

const server = new FastMCP<modelMain.Auth>({
    name: "Tool server",
    version: "1.0.0"
});

server.addTool(toolSum);
server.addTool(toolExpression);

server.start({
    transportType: "httpStream",
    httpStream: {
        host: URL_MCP.hostname,
        port: URL_MCP.port as unknown as number,
        endpoint: "/mcp"
    }
});

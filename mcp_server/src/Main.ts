import { FastMCP } from "fastmcp";

// Source
import { toolMathExpression } from "./tool/Math.js";
import { toolAutomateOcr, toolAutomateMouseMove, toolAutomateMouseClick } from "./tool/Automate.js";

export const URL_MCP = new URL(process.env["MS_AI_URL_MCP"] as string);

const server = new FastMCP<Record<string, unknown>>({
    name: "Microservice mcp",
    version: "1.0.0"
});

server.addTool(toolMathExpression);
server.addTool(toolAutomateOcr);
server.addTool(toolAutomateMouseMove);
server.addTool(toolAutomateMouseClick);

server.start({
    transportType: "httpStream",
    httpStream: {
        host: URL_MCP.hostname,
        port: URL_MCP.port as unknown as number,
        endpoint: "/mcp",
        stateless: false
    }
});

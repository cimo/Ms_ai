import { FastMCP } from "fastmcp";

// Source
import * as modelMain from "./model/Main.js";
import toolMathSum from "./tool/Math/Sum.js";

const server = new FastMCP<modelMain.Auth>({
    name: "Tool server",
    version: "1.0.0"
});

server.addTool(toolMathSum);

server.start({
    transportType: "httpStream",
    httpStream: {
        endpoint: "/mcp",
        port: 8080
    }
});

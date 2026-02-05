// Source
import * as InstanceMcp from "../InstanceMcp.js";
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";

export default class Mcp {
    // Variable
    private userObject: Record<string, modelServer.Iuser>;

    // Method

    constructor(userObject: Record<string, modelServer.Iuser>) {
        this.userObject = userObject;
    }

    connection = async (uniqueId: string): Promise<void> => {
        await InstanceMcp.api
            .post<Response>(
                "/mcp",
                {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/event-stream"
                    }
                },
                {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "initialize",
                    params: {
                        protocolVersion: "2025-06-18",
                        capabilities: {},
                        clientInfo: { name: "curl", version: "1.0" }
                    }
                },
                false,
                true
            )
            .then((response) => {
                const sessionId = response.headers.get("Mcp-Session-Id") || "";

                this.userObject[uniqueId] = {
                    ...this.userObject[uniqueId],
                    mcpSessionId: sessionId
                };
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Mcp.ts - connection()", `Error: ${error}`);
            });
    };
}

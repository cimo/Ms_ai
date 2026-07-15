import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelHelperSrc from "../model/HelperSrc.js";
import * as modelLlamaCpp from "../model/LlamaCpp.js";
import * as instanceEngine from "../InstanceEngine.js";
import * as instanceMcp from "../InstanceMcp.js";

export default class LlamaCpp {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private modelId: string;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;
        this.modelId = "";
    }

    private modelAvailable = async (): Promise<string[]> => {
        return instanceEngine.api
            .get<modelLlamaCpp.IapiModel>("/v1/models", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const dataList = resultApi.data.data;

                const cleanedList: string[] = [];

                for (let a = 0; a < dataList.length; a++) {
                    const value = dataList[a];

                    if (value.id.toLowerCase().includes("default")) {
                        continue;
                    }

                    cleanedList.push(value.id);
                }

                const resultList = [...cleanedList].sort((a, b) => a.localeCompare(b));

                this.modelId = resultList[0];

                return resultList;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("LlamaCpp.ts - /v1/models - catch()", error.message);

                return [];
            });
    };

    api = (): void => {
        this.modelAvailable();

        this.app.get("/api/model", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                this.modelAvailable()
                    .then((resultApiList) => {
                        const resultList = resultApiList;

                        helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/model) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("LlamaCpp.ts - api(/api/model) - Error", "Missing or invalid token.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/response", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const mcpSessionId = request.headers["mcp-session-id"];
                const mcpCookie = request.headers["mcp-cookie"];
                const aiCookie = request.headers["ai-cookie"];
                const body = request.body as modelLlamaCpp.IapiDataResponseBody;

                if (typeof mcpSessionId === "string" && typeof mcpCookie === "string" && typeof aiCookie === "string") {
                    response.setHeader("Content-Type", "text/event-stream");
                    response.setHeader("Cache-Control", "no-cache");
                    response.setHeader("Connection", "keep-alive");
                    response.setHeader("X-Accel-Buffering", "no");

                    return new Promise((resolve, reject) => {
                        request.on("close", () => {
                            resolve("");

                            return;
                        });

                        instanceEngine.api
                            .stream(
                                "/v1/responses",
                                {
                                    headers: {
                                        "Content-Type": "application/json",
                                        "ai-cookie": aiCookie
                                    }
                                },
                                body
                            )
                            .then(async (resultApi) => {
                                const decoder = new TextDecoder("utf-8");
                                let buffer = "";
                                let responseCompleted = "";

                                while (true) {
                                    const { value, done } = await resultApi.read();

                                    if (done) {
                                        if (helperSrc.jsonCheck(responseCompleted)) {
                                            const responseCompletedObject = JSON.parse(responseCompleted) as
                                                | modelLlamaCpp.ItoolCall
                                                | modelLlamaCpp.ItaskCall;

                                            if ("name" in responseCompletedObject) {
                                                await instanceMcp.api
                                                    .post<modelHelperSrc.IresponseBody>(
                                                        "/api/tool-call",
                                                        {
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                "mcp-session-id": mcpSessionId,
                                                                "mcp-cookie": mcpCookie
                                                            }
                                                        },
                                                        {
                                                            jsonrpc: "2.0",
                                                            id: 1,
                                                            method: "tools/call",
                                                            params: {
                                                                protocolVersion: "2025-06-18",
                                                                capabilities: {},
                                                                clientInfo: {
                                                                    name: "curl",
                                                                    version: "1.0"
                                                                },
                                                                name: responseCompletedObject.name,
                                                                arguments: responseCompletedObject.argumentObject
                                                            }
                                                        }
                                                    )
                                                    .then((resultApiSub) => {
                                                        const stdout = resultApiSub.data.response.stdout;

                                                        let message = "";

                                                        if (helperSrc.jsonCheck(stdout)) {
                                                            const stdoutObject = JSON.parse(stdout) as modelLlamaCpp.IllmResponseTool;

                                                            if (
                                                                stdoutObject.result &&
                                                                stdoutObject.result.content &&
                                                                stdoutObject.result.content[0]
                                                            ) {
                                                                message = stdoutObject.result.content[0].text;
                                                            }
                                                        }

                                                        response.write(
                                                            `data: ${JSON.stringify({
                                                                type: "tool_response",
                                                                response: {
                                                                    name: responseCompletedObject.name,
                                                                    arguments: JSON.stringify(responseCompletedObject.argumentObject),
                                                                    message: message
                                                                }
                                                            })}\n\n`
                                                        );
                                                    })
                                                    .catch((error: Error) => {
                                                        helperSrc.writeLog(
                                                            "LlamaCpp.ts - api(/api/response) - api(/api/tool-call) - catch()",
                                                            error.message
                                                        );

                                                        response.write(
                                                            `data: ${JSON.stringify({
                                                                type: "tool_response",
                                                                response: {
                                                                    message: error.message
                                                                }
                                                            })}\n\n`
                                                        );

                                                        reject(new Error(error.message));

                                                        return;
                                                    });
                                            } else if ("list" in responseCompletedObject) {
                                                await instanceMcp.api
                                                    .post<modelHelperSrc.IresponseBody>(
                                                        "/api/task-call",
                                                        {
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                "mcp-session-id": mcpSessionId,
                                                                "mcp-cookie": mcpCookie
                                                            }
                                                        },
                                                        JSON.stringify(responseCompletedObject)
                                                    )
                                                    .then((resultApiSub) => {
                                                        const stdout = resultApiSub.data.response.stdout;

                                                        response.write(
                                                            `data: ${JSON.stringify({
                                                                type: "tool_response",
                                                                response: {
                                                                    message: stdout
                                                                }
                                                            })}\n\n`
                                                        );
                                                    })
                                                    .catch((error: Error) => {
                                                        helperSrc.writeLog(
                                                            "LlamaCpp.ts - api(/api/response) - api(/api/task-call) - catch()",
                                                            error.message
                                                        );

                                                        response.write(
                                                            `data: ${JSON.stringify({
                                                                type: "tool_response",
                                                                response: {
                                                                    message: error.message
                                                                }
                                                            })}\n\n`
                                                        );

                                                        reject(new Error(error.message));

                                                        return;
                                                    });
                                            }
                                        }

                                        response.end(
                                            `data: ${JSON.stringify({
                                                type: "response.completed"
                                            })}\n\n`
                                        );

                                        resolve("");

                                        return;
                                    }

                                    buffer += decoder.decode(value, { stream: true });
                                    const lineList = buffer.split(/\r?\n/);
                                    buffer = lineList.pop() as string;

                                    for (let a = 0; a < lineList.length; a++) {
                                        const line = lineList[a];

                                        if (line.startsWith("data:")) {
                                            const lineSlice = line.slice(5).trim();

                                            if (lineSlice.length > 1 && lineSlice[0] === "{" && lineSlice[lineSlice.length - 1] === "}") {
                                                const lineSliceObject = JSON.parse(lineSlice) as modelLlamaCpp.IllmResponse;

                                                if (lineSliceObject.type === "response.completed") {
                                                    const dataOutput = lineSliceObject.response.output[0];

                                                    let text = "";

                                                    if (dataOutput && dataOutput.content && dataOutput.content[0]) {
                                                        text = dataOutput.content[0].text;
                                                    }

                                                    if (text) {
                                                        responseCompleted = text.trim();
                                                    }
                                                }
                                            }

                                            response.write(`data: ${lineSlice}\n\n`);
                                        }
                                    }
                                }
                            })
                            .catch((error: Error) => {
                                helperSrc.writeLog("LlamaCpp.ts - api(/api/response) - catch()", error.message);

                                response.end(
                                    `data: ${JSON.stringify({
                                        type: "error",
                                        error: {
                                            message: error.message
                                        }
                                    })}\n\n`
                                );

                                reject(new Error(error.message));

                                return;
                            });
                    });
                } else {
                    helperSrc.writeLog("LlamaCpp.ts - api(/api/response) - Error", "Missing or invalid header.");

                    helperSrc.responseBody("", "ko", response, 500);
                }
            } else {
                helperSrc.writeLog("LlamaCpp.ts - api(/api/response) - Error", "Missing or invalid token.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}

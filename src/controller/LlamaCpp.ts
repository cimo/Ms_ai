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

    private apiModel = async (): Promise<string[]> => {
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

                    if (value.id.toLowerCase().includes("default") || value.id.toLowerCase().includes("embedding")) {
                        continue;
                    }

                    cleanedList.push(value.id);
                }

                const result = [...cleanedList].sort((a, b) => a.localeCompare(b));

                this.modelId = result[0];

                return result;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("LlamaCpp.ts - /v1/models - catch()", error.message);

                return [];
            });
    };

    private graphifyExtractNormalizeOutput = (jsonParse: unknown, text: string): modelLlamaCpp.IragGraphifyExtract => {
        let resultList: modelLlamaCpp.IragRelation[] = [];

        if (
            !jsonParse ||
            typeof jsonParse !== "object" ||
            Array.isArray(jsonParse) ||
            !Array.isArray((jsonParse as { relationList?: unknown[] }).relationList)
        ) {
            helperSrc.writeLog("LlamaCpp.ts - graphifyExtractNormalizeOutput() - Error", text);

            return { relationList: [] };
        }

        const relationList = (jsonParse as { relationList: unknown[] }).relationList;

        for (let a = 0; a < relationList.length; a++) {
            const item = relationList[a];

            if (!item || typeof item !== "object") {
                continue;
            }

            const source = typeof (item as { source?: unknown }).source === "string" ? (item as { source: string }).source.trim() : "";
            const verb = typeof (item as { verb?: unknown }).verb === "string" ? (item as { verb: string }).verb.trim() : "";
            const target = typeof (item as { target?: unknown }).target === "string" ? (item as { target: string }).target.trim() : "";

            if (source === "" || verb === "" || target === "") {
                continue;
            }

            resultList.push({ source, verb, target });
        }

        return { relationList: resultList };
    };

    api = (): void => {
        this.apiModel();

        this.app.get("/api/model", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                this.apiModel()
                    .then((resultApiList) => {
                        const resultList = resultApiList;

                        helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/model) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });

        this.app.post("/api/response", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const mcpSessionId = request.headers["mcp-session-id"];
                const mcpCookie = request.headers["mcp-cookie"];
                const aiCookie = request.headers["ai-cookie"];
                const body = request.body;

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
                                let textResponseCompleted = "";

                                while (true) {
                                    const { value, done } = await resultApi.read();

                                    if (done) {
                                        if (helperSrc.isJson(textResponseCompleted)) {
                                            const resultDataParse = JSON.parse(textResponseCompleted) as
                                                | modelLlamaCpp.ItoolCall
                                                | modelLlamaCpp.ItaskCall;

                                            if ("name" in resultDataParse) {
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
                                                                name: resultDataParse.name,
                                                                arguments: resultDataParse.argumentObject,
                                                                protocolVersion: "2025-06-18",
                                                                capabilities: {},
                                                                clientInfo: {
                                                                    name: "curl",
                                                                    version: "1.0"
                                                                }
                                                            }
                                                        }
                                                    )
                                                    .then((resultApiSub) => {
                                                        const stdout = JSON.parse(resultApiSub.data.response.stdout) as modelLlamaCpp.IapiToolCall;

                                                        let message = "";

                                                        if (stdout.result && stdout.result.content && stdout.result.content[0]) {
                                                            message = stdout.result.content[0].text;
                                                        }

                                                        response.write(
                                                            `data: ${JSON.stringify({
                                                                type: "tool_response",
                                                                response: {
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
                                            } else if ("list" in resultDataParse) {
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
                                                        JSON.stringify(resultDataParse)
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
                                                const dataTrimParse = JSON.parse(lineSlice) as modelLlamaCpp.IapiResponse;

                                                if (dataTrimParse.type === "response.completed") {
                                                    const dataOutput = dataTrimParse.response.output[0];

                                                    let text = "";

                                                    if (dataOutput && dataOutput.content && dataOutput.content[0]) {
                                                        text = dataOutput.content[0].text;
                                                    }

                                                    if (text) {
                                                        textResponseCompleted = text.trim();
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
                }
            }
        });

        this.app.post("/api/embedding", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const body = request.body;

                instanceEngine.api
                    .post<modelLlamaCpp.IapiEmbedding>(
                        "/v1/embeddings",
                        {
                            headers: {
                                "Content-Type": "application/json"
                            }
                        },
                        {
                            model: "embeddinggemma-300M-Q8_0",
                            input: body.input
                        }
                    )
                    .then((resultApi) => {
                        const data = resultApi.data;

                        helperSrc.responseBody(JSON.stringify(data), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/embedding) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });

        this.app.post("/api/ragGraphifyExtract", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const body = request.body;

                const prompt = [
                    "Extract all the relations between entities from the following TEXT.",
                    "Return ONLY raw JSON. You MUST NOT wrap in ```json and MUST NOT include any explanation.",
                    "You MUST NOT return a top-level array.",
                    "If relations exist, you MUST return exactly this structure:",
                    '{"relationList": [{"source": "value1", "verb": "verb1", "target": "value2"}]}',
                    "If no relations exist, you MUST return exactly:",
                    '{"relationList":[]}',
                    `TEXT:\n${body.input}`
                ].join("\n");

                instanceEngine.api
                    .post<modelLlamaCpp.IapiResponseNonStream>(
                        "/v1/responses",
                        {
                            headers: {
                                "Content-Type": "application/json"
                            }
                        },
                        {
                            stream: false,
                            model: this.modelId,
                            input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
                            temperature: 0,
                            max_tokens: 512
                        }
                    )
                    .then((resultApi) => {
                        const dataOutput = resultApi.data.output[0];

                        let text = "";

                        if (dataOutput && dataOutput.content && dataOutput.content[0]) {
                            text = dataOutput.content[0].text;
                        }

                        if (text && helperSrc.isJson(text)) {
                            const jsonParse = JSON.parse(text);
                            const output = this.graphifyExtractNormalizeOutput(jsonParse, text);

                            helperSrc.responseBody(JSON.stringify(output), "", response, 200);
                        } else {
                            helperSrc.responseBody("", "ko", response, 500);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/ragGraphifyExtract) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });
    };
}

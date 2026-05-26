import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Cq } from "@cimo/queue/dist/src/Main.js";

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

    private model = async (): Promise<string[]> => {
        let result: string[] = [];

        await instanceEngine.api
            .get<modelLlamaCpp.IapiModel>("/v1/models", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const cleanedList: string[] = [];

                for (const value of resultApi.data.data) {
                    if (value.id.toLowerCase() === "default") {
                        continue;
                    } else if (value.id.toLowerCase().includes("embedding")) {
                        continue;
                    }

                    cleanedList.push(value.id);
                }

                result = [...cleanedList].sort((a, b) => a.localeCompare(b));

                this.modelId = result[0];
            })
            .catch((error: Error) => {
                helperSrc.writeLog("LlamaCpp.ts - /v1/models - catch()", error.message);
            });

        return result;
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

        for (const item of relationList) {
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
        this.model();

        this.app.get("/api/model", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                this.model()
                    .then((result) => {
                        helperSrc.responseBody(JSON.stringify(result), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/model) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });

        this.app.post("/api/response", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const cookieAi = request.headers["cookie"] as string;
                const cookieMcp = request.headers["cookie-mcp"] as string;
                const sessionId = request.headers["mcp-session-id"] as string;

                if (cookieAi !== "" && cookieMcp !== "" && sessionId !== "") {
                    response.setHeader("Content-Type", "text/event-stream");
                    response.setHeader("Cache-Control", "no-cache");
                    response.setHeader("Connection", "keep-alive");
                    response.setHeader("X-Accel-Buffering", "no");

                    Cq.list.push(() => {
                        return new Promise((resolve, reject) => {
                            request.on("close", () => {
                                resolve();

                                return;
                            });

                            instanceEngine.api
                                .stream(
                                    "/v1/responses",
                                    {
                                        headers: {
                                            "Content-Type": "application/json",
                                            Cookie: cookieAi
                                        }
                                    },
                                    request.body
                                )
                                .then(async (reader) => {
                                    const decoder = new TextDecoder("utf-8");
                                    let buffer = "";
                                    let resultData = "";

                                    while (true) {
                                        const { value, done } = await reader.read();

                                        if (done) {
                                            if (helperSrc.isJson(resultData)) {
                                                const resultDataParse = JSON.parse(resultData) as modelLlamaCpp.ItoolCall | modelLlamaCpp.ItaskCall;

                                                if ("name" in resultDataParse) {
                                                    await instanceMcp.api
                                                        .post<modelHelperSrc.IresponseBody>(
                                                            "/api/tool-call",
                                                            {
                                                                headers: {
                                                                    "Content-Type": "application/json",
                                                                    Cookie: cookieMcp,
                                                                    "mcp-session-id": sessionId
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
                                                        .then((result) => {
                                                            const stdout = result.data.response.stdout as unknown as modelLlamaCpp.IapiToolCall;

                                                            response.write(
                                                                `data: ${JSON.stringify({
                                                                    type: "tool_response",
                                                                    response: {
                                                                        message: stdout.result.content[0].text
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
                                                                    Cookie: cookieMcp,
                                                                    "mcp-session-id": sessionId
                                                                }
                                                            },
                                                            JSON.stringify(resultDataParse)
                                                        )
                                                        .then((result) => {
                                                            const stdout = result.data.response.stdout;

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

                                            resolve();

                                            return;
                                        }

                                        buffer += decoder.decode(value, { stream: true });
                                        const lineList = buffer.split(/\r?\n/);
                                        buffer = lineList.pop() as string;

                                        for (const line of lineList) {
                                            if (line.startsWith("data:")) {
                                                const data = line.slice(5).trim();

                                                const dataTrim = data.trim();

                                                if (dataTrim.length > 1 && dataTrim[0] === "{" && dataTrim[dataTrim.length - 1] === "}") {
                                                    const dataTrimParse = JSON.parse(dataTrim) as modelLlamaCpp.IapiResponse;

                                                    if (dataTrimParse.type === "response.completed") {
                                                        const dataItem = dataTrimParse.response.output[0].content[0].text;

                                                        if (dataItem) {
                                                            resultData = dataItem.trim();
                                                        }
                                                    }
                                                }

                                                response.write(`data: ${data}\n\n`);
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
                    });

                    Cq.processParallel(parseInt(helperSrc.QUEUE));
                }
            }
        });

        this.app.post("/api/embedding", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                instanceEngine.api
                    .post(
                        "/v1/embeddings",
                        {
                            headers: {
                                "Content-Type": "application/json"
                            }
                        },
                        {
                            model: "embeddinggemma-300M-Q8_0",
                            input: request.body.input
                        }
                    )
                    .then((result) => {
                        helperSrc.responseBody(JSON.stringify(result.data), "", response, 200);
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
                const input = request.body.input as string;

                const prompt = [
                    "Extract all the relations between entities from the following TEXT.",
                    "Return ONLY raw JSON. You MUST NOT wrap in ```json and MUST NOT include any explanation.",
                    "You MUST NOT return a top-level array.",
                    "If relations exist, you MUST return exactly this structure:",
                    '{"relationList": [{"source": "value1", "verb": "verb1", "target": "value2"}]}',
                    "If no relations exist, you MUST return exactly:",
                    '{"relationList":[]}',
                    `TEXT:\n${input}`
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
                    .then((result) => {
                        const text = result.data.output[0].content[0].text;

                        const jsonParse = JSON.parse(text);
                        const output = this.graphifyExtractNormalizeOutput(jsonParse, text);

                        helperSrc.responseBody(JSON.stringify(output), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/ragGraphifyExtract) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });
    };
}

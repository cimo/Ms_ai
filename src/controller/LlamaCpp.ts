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

                    if (
                        value.id.toLowerCase().includes("default") ||
                        value.id.toLowerCase().includes("embeddinggemma-300M".toLowerCase()) ||
                        value.id.toLowerCase().includes("gemma-4-E2B-it".toLowerCase())
                    ) {
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

    private graphifyExtractNormalizeOutput = (textObject: unknown, text: string): modelLlamaCpp.IragGraphifyExtract => {
        let resultList: modelLlamaCpp.IragRelation[] = [];

        if (
            !textObject ||
            typeof textObject !== "object" ||
            Array.isArray(textObject) ||
            !Array.isArray((textObject as { relationList?: unknown[] }).relationList)
        ) {
            helperSrc.writeLog("LlamaCpp.ts - graphifyExtractNormalizeOutput() - Error", text);

            return { relationList: [] };
        }

        const relationList = (textObject as { relationList: unknown[] }).relationList;

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

            if (source.toLowerCase() === target.toLowerCase() || source.length < 3 || target.length < 3) {
                continue;
            }

            if (source.toLowerCase().includes("http") || target.toLowerCase().includes("http")) {
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
                const body = request.body as modelLlamaCpp.IapiResponseBody;

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
                                        if (helperSrc.isJson(responseCompleted)) {
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
                                                                name: responseCompletedObject.name,
                                                                arguments: responseCompletedObject.argumentObject,
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
                                                        const stdout = resultApiSub.data.response.stdout;

                                                        let message = "";

                                                        if (helperSrc.isJson(stdout)) {
                                                            const stdoutObject = JSON.parse(stdout) as modelLlamaCpp.IapiResponseTool;

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
                                                const lineSliceObject = JSON.parse(lineSlice) as modelLlamaCpp.IapiResponse;

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

        this.app.post("/api/embedding", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const body = request.body as modelLlamaCpp.IapiEmbeddingBody;

                instanceEngine.api
                    .post<modelLlamaCpp.IapiEmbedding>(
                        "/v1/embeddings",
                        {
                            headers: {
                                "Content-Type": "application/json"
                            }
                        },
                        {
                            model: "embeddinggemma-300M-Q4_0",
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
            } else {
                helperSrc.writeLog("LlamaCpp.ts - api(/api/embedding) - Error", "Missing or invalid token.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/ragGraphifyExtract", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const body = request.body as modelLlamaCpp.IapiRagGraphifyExtractBody;

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
                            model: "gemma-4-E2B-it-Q4_0",
                            input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
                            temperature: 0,
                            max_tokens: 768
                        }
                    )
                    .then((resultApi) => {
                        const dataOutput = resultApi.data.output[0];

                        let text = "";

                        if (dataOutput && dataOutput.content && dataOutput.content[0]) {
                            text = dataOutput.content[0].text;
                        }

                        if (text && !helperSrc.isJson(text)) {
                            const relationMatchList = text.match(/\{[^{}]*"source"[^{}]*"verb"[^{}]*"target"[^{}]*\}/g);

                            if (relationMatchList) {
                                const relationValidList: string[] = [];

                                for (let a = 0; a < relationMatchList.length; a++) {
                                    if (helperSrc.isJson(relationMatchList[a])) {
                                        relationValidList.push(relationMatchList[a]);
                                    }
                                }

                                if (relationValidList.length > 0) {
                                    text = `{"relationList": [${relationValidList.join(",")}]}`;

                                    helperSrc.writeLog(
                                        "LlamaCpp.ts - api(/api/ragGraphifyExtract) - Recovery",
                                        `Relation: ${relationValidList.length}/${relationMatchList.length}`
                                    );
                                }
                            }
                        }

                        if (text && helperSrc.isJson(text)) {
                            const textObject = JSON.parse(text) as string;
                            const output = this.graphifyExtractNormalizeOutput(textObject, text);

                            helperSrc.responseBody(JSON.stringify(output), "", response, 200);
                        } else {
                            helperSrc.writeLog("LlamaCpp.ts - api(/api/ragGraphifyExtract) - Error", text);

                            helperSrc.responseBody(JSON.stringify({ relationList: [] }), "", response, 200);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LlamaCpp.ts - api(/api/ragGraphifyExtract) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("LlamaCpp.ts - api(/api/ragGraphifyExtract) - Error", "Missing or invalid token.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}

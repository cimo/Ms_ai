import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelLlamaCpp from "../model/LlamaCpp.js";
import * as instanceEngine from "../InstanceEngine.js";

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
            .get<modelLlamaCpp.IapiModelResponse>("/v1/models", {
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
                const body = request.body as modelLlamaCpp.IapiLlmBody;

                if (typeof mcpSessionId === "string" && typeof mcpCookie === "string" && typeof aiCookie === "string") {
                    response.setHeader("Content-Type", "text/event-stream");
                    response.setHeader("Cache-Control", "no-cache");
                    response.setHeader("Connection", "keep-alive");
                    response.setHeader("X-Accel-Buffering", "no");

                    const abortControllerEngine = new AbortController();

                    response.on("close", () => {
                        if (!response.writableEnded) {
                            abortControllerEngine.abort();
                        }
                    });

                    return new Promise((resolve, reject) => {
                        instanceEngine.api
                            .stream(
                                "/v1/responses",
                                {
                                    headers: {
                                        "Content-Type": "application/json",
                                        "ai-cookie": aiCookie
                                    },
                                    signal: abortControllerEngine.signal
                                },
                                body
                            )
                            .then(async (resultApi) => {
                                const decoder = new TextDecoder("utf-8");
                                let buffer = "";

                                while (true) {
                                    const { value, done } = await resultApi.read();

                                    if (done) {
                                        response.end(
                                            `data: ${JSON.stringify({
                                                type: "response.completed"
                                            })}\n\n`
                                        );

                                        resolve("");

                                        return;
                                    }

                                    buffer += decoder.decode(value, { stream: true });
                                    const bufferSplit = buffer.split(/\r?\n/);
                                    buffer = bufferSplit.pop() as string;

                                    for (let a = 0; a < bufferSplit.length; a++) {
                                        const line = bufferSplit[a];

                                        if (line.startsWith("data:")) {
                                            const lineSlice = line.slice(5).trim();

                                            response.write(`data: ${lineSlice}\n\n`);
                                        }
                                    }
                                }
                            })
                            .catch((error: Error) => {
                                if (abortControllerEngine.signal.aborted) {
                                    resolve("");

                                    return;
                                }

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

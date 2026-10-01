import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelHelperSrc from "../model/HelperSrc.js";
import * as modelService from "../model/Service.js";
import * as instance from "../Instance.js";
import Anthropic from "./Anthropic.js";

export default class Service {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private anthropic: Anthropic;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;
        this.anthropic = new Anthropic();
    }

    private modelAvailable = async (): Promise<string[]> => {
        return instance.api
            .get<modelService.IapiModelResponse>("/v1/models", {
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

                return resultList;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Service.ts - /v1/models - catch()", error.message);

                return [];
            });
    };

    private tokenCount = async (model: string, text: string): Promise<number> => {
        return instance.api
            .post<modelService.IapiTokenizeResponse>(
                "/tokenize",
                {
                    headers: {
                        "Content-Type": "application/json"
                    }
                },
                { model, content: text }
            )
            .then((resultApi) => {
                return resultApi.data.tokens.length;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Service.ts - /tokenize - catch()", error.message);

                return -1;
            });
    };

    private contextSize = async (model: string): Promise<number> => {
        return instance.api
            .get<modelService.IapiPropsResponse>(`/props?model=${encodeURIComponent(model)}`, {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                return resultApi.data.default_generation_settings.n_ctx;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Service.ts - /props - catch()", error.message);

                return -1;
            });
    };

    api = (): void => {
        this.app.post("/api/token-detail", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const body = request.body as modelService.IapiTokenDetailBody;

            const count = await this.tokenCount(body.model, body.text);
            const contextSize = await this.contextSize(body.model);

            if (count === -1 || contextSize === -1) {
                helperSrc.responseBody({ state: "ko", message: "Engine not available." }, response, 200);
            } else {
                helperSrc.responseBody({ state: "ok", message: "", data: { count, contextSize } }, response, 200);
            }
        });

        this.app.get("/api/model", this.limiter, Ca.authenticationMiddleware, (_: Request, response: Response) => {
            this.modelAvailable()
                .then((resultApiList) => {
                    const resultList = resultApiList;

                    helperSrc.responseBody({ state: "ok", message: "", data: resultList }, response, 200);
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Service.ts - api(/api/model) - catch()", error.message);

                    helperSrc.responseBody({ state: "ko", message: "Failed to get model list." }, response, 500);
                });
        });

        this.app.post("/api/response", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const aiCookie = request.headers["ai-cookie"];
            const body = request.body as modelService.IapiLlmBody;

            if (typeof aiCookie !== "string") {
                helperSrc.writeLog("Service.ts - api(/api/response) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
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
                    instance.api
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
                                    const bufferTrim = buffer.trim();

                                    if (bufferTrim !== "" && helperSrc.jsonCheck(bufferTrim)) {
                                        const bufferObject = JSON.parse(bufferTrim) as modelService.IapiEngineError;

                                        if (bufferObject.error) {
                                            helperSrc.writeLog("Service.ts - api(/api/response) - stream()", bufferObject.error.message);

                                            response.end(
                                                `data: ${JSON.stringify({
                                                    type: "error",
                                                    error: {
                                                        message: bufferObject.error.message
                                                    }
                                                })}\n\n`
                                            );

                                            resolve("");

                                            return;
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

                            helperSrc.writeLog("Service.ts - api(/api/response) - catch()", error.message);

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
        });

        this.app.post("/api/anthropic-cli", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const aiCookie = request.headers["ai-cookie"];
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelService.IapiAnthropicCliBody;

            const code = body.code;
            const model = body.model;
            const systemPrompt = body.systemPrompt;
            const userPrompt = body.userPrompt;

            if (typeof aiCookie !== "string" || typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Service.ts - api(/api/anthropic-cli) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                let resultObject = {} as modelHelperSrc.IactionOperation;

                if (!model || !systemPrompt || !userPrompt) {
                    resultObject = await this.anthropic.authentication(mcpSessionId, code);
                } else {
                    resultObject = await this.anthropic.command(mcpSessionId, model, systemPrompt, userPrompt);
                }

                if (resultObject.state === "ko") {
                    helperSrc.responseBody({ state: "ko", message: resultObject.message }, response, 500);
                } else {
                    helperSrc.responseBody({ state: "ok", message: resultObject.message, data: resultObject.data }, response, 200);
                }
            }
        });
    };
}

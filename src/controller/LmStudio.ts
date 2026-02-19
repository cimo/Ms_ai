import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Cq } from "@cimo/queue/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelLmStudio from "../model/LmStudio.js";

export default class LmStudio {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;
    }

    api = (): void => {
        this.app.get("/api/model", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                instance.api
                    .get<modelLmStudio.IresponseModel>("/v1/models", {
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                    .then((result) => {
                        helperSrc.responseBody(JSON.stringify(result.data), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("LmStudio.ts - api(/api/model) - catch()", error);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });

        this.app.post("/api/response", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const bearerToken = helperSrc.headerBearerToken(request);

            if (bearerToken) {
                const cookieAi = request.headers["cookie"];
                const cookieMcp = request.headers["x-cookie"];
                const sessionId = request.headers["mcp-session-id"];

                if (typeof cookieAi === "string" && typeof cookieMcp === "string" && typeof sessionId === "string") {
                    response.setHeader("Content-Type", "text/event-stream");
                    response.setHeader("Cache-Control", "no-cache");
                    response.setHeader("Connection", "keep-alive");
                    response.setHeader("X-Accel-Buffering", "no");

                    Cq.list.push(() => {
                        return new Promise((resolve) => {
                            request.on("close", () => {
                                resolve();

                                return;
                            });

                            instance.api
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
                                            const resultDataParse = JSON.parse(resultData);

                                            if (resultDataParse.stepList) {
                                                await fetch("https://localhost:1047/api/task", {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                        Cookie: cookieMcp,
                                                        "mcp-session-id": sessionId
                                                    },
                                                    body: JSON.stringify(resultDataParse)
                                                });

                                                response.write(
                                                    `data: ${JSON.stringify({
                                                        type: "task_done",
                                                        response: {
                                                            message: "Task done."
                                                        }
                                                    })}\n\n`
                                                );
                                            }

                                            resolve();

                                            return;
                                        }

                                        buffer += decoder.decode(value, { stream: true });
                                        const lineList = buffer.split(/\r?\n/);
                                        buffer = lineList.pop() || "";

                                        for (const line of lineList) {
                                            if (line.startsWith("data:")) {
                                                const data = line.slice(5).trim();

                                                const dataParse = JSON.parse(data);

                                                if (dataParse.type === "response.output_item.done" && dataParse.output_index === 1) {
                                                    resultData = dataParse.item.content[0].text.trim();
                                                }

                                                response.write(`data: ${data}\n\n`);
                                            }
                                        }
                                    }
                                })
                                .catch((error: Error) => {
                                    helperSrc.writeLog("LmStudio.ts - api(/api/response) - catch()", error);

                                    resolve();

                                    return;
                                });
                        });
                    });

                    Cq.processParallel(parseInt(helperSrc.QUEUE));
                }
            }
        });
    };
}

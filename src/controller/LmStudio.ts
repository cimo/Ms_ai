import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Cu } from "@cimo/queue/dist/src/Main.js";

// Source
import * as Instance from "../Instance.js";
import * as helperSrc from "../HelperSrc.js";
import * as ModelLmStudio from "../model/LmStudio.js";

export default class LmStudio {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;

    // Method
    private dataDone = (response: Response): void => {
        response.write("event: done\ndata: [DONE]\n\n");
        response.end();
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;
    }

    api = (): void => {
        this.app.get("/api/v1/models", this.limiter, Ca.authenticationMiddleware, (_, response: Response) => {
            Instance.api
                .get<ModelLmStudio.IresponseModel>("/v1/models", {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
                .then((result) => {
                    helperSrc.responseBody(JSON.stringify(result.data), "", response, 200);
                })
                .catch((error: Error) => {
                    helperSrc.responseBody("", error, response, 500);
                });
        });

        this.app.post("/api/v1/responses", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            response.setHeader("Content-Type", "text/event-stream");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("Connection", "keep-alive");
            response.setHeader("X-Accel-Buffering", "no");

            Cu.list.push(() => {
                return new Promise((resolve) => {
                    request.on("close", () => {
                        this.dataDone(response);

                        resolve();
                    });

                    Instance.api
                        .stream(
                            "/v1/responses",
                            {
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            },
                            request.body
                        )
                        .then(async (reader) => {
                            const decoder = new TextDecoder("utf-8");
                            let buffer = "";

                            while (true) {
                                const { value, done } = await reader.read();

                                if (done) {
                                    this.dataDone(response);

                                    resolve();

                                    break;
                                }

                                buffer += decoder.decode(value, { stream: true });
                                const lineList = buffer.split(/\r?\n/);
                                buffer = lineList.pop() || "";

                                for (const line of lineList) {
                                    if (line.startsWith("data:")) {
                                        const data = line.slice(5).trim();

                                        if (data === "[DONE]") {
                                            this.dataDone(response);

                                            resolve();

                                            return;
                                        }

                                        response.write(`data: ${data}\n\n`);
                                    }
                                }
                            }
                        })
                        .catch(() => {
                            this.dataDone(response);

                            resolve();
                        });
                });
            });

            Cu.processParallel(2);
        });
    };
}

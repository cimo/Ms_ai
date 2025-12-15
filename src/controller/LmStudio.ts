import Express, { Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as Instance from "../Instance.js";
import * as helperSrc from "../HelperSrc.js";
import * as ModelLmStudio from "../model/LmStudio.js";

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
    };
}

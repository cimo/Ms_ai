import Express, { Request, Response, NextFunction } from "express";
import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import CookieParser from "cookie-parser";
import Cors from "cors";
import * as Http from "http";
import * as Https from "https";
import Fs from "fs";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Cc } from "@cimo/cronjob/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import ControllerLmStudio from "./LmStudio.js";
import ControllerMicrosoft from "./Microsoft.js";
import ControllerXvfb from "./Xvfb.js";
import ControllerMcp from "./Mcp.js";

export default class Server {
    // Variable
    private corsOption: modelServer.Icors;
    private limiter: RateLimitRequestHandler;
    private app: Express.Express;
    private userObject: Record<string, modelServer.Iuser>;

    // Method
    constructor() {
        this.corsOption = {
            originList: [helperSrc.URL_CORS_ORIGIN],
            methodList: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
            preflightContinue: false,
            optionsSuccessStatus: 200
        };

        this.limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 100,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (request: Request) => {
                let result = "";

                const forwarded = request.headers["x-forwarded-for"];
                const ip = typeof forwarded === "string" ? forwarded.split(",")[0] : request.ip;

                if (ip) {
                    result = ip.split(":").pop() || "";
                }

                return result;
            }
        });

        this.userObject = {};

        this.app = Express();
    }

    createSetting = (): void => {
        this.app.set("trust proxy", "loopback");
        this.app.use(Express.json());
        this.app.use(Express.urlencoded({ extended: true }));
        this.app.use(CookieParser());
        this.app.use(
            Cors({
                origin: this.corsOption.originList,
                methods: this.corsOption.methodList,
                optionsSuccessStatus: this.corsOption.optionsSuccessStatus
            })
        );
        this.app.use((request: modelServer.Irequest, response: Response, next: NextFunction) => {
            response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("Expires", "0");

            const headerForwarded = request.headers["x-forwarded-for"] ? request.headers["x-forwarded-for"][0] : "";
            const remoteAddress = request.socket.remoteAddress ? request.socket.remoteAddress : "";

            request.clientIp = headerForwarded || remoteAddress;

            next();
        });
        this.app.use("/asset", Express.static(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}asset/`));
        this.app.use("/file", this.limiter, Ca.authenticationMiddleware, Express.static(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}file/`));
    };

    createServer = (): void => {
        let creation: Http.Server | Https.Server;

        if (helperSrc.localeFromEnvName() === "jp") {
            creation = Https.createServer(
                {
                    key: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_KEY),
                    cert: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_CRT)
                },
                this.app
            );
        } else {
            creation = Http.createServer(this.app);
        }

        const server = creation;

        server.listen(helperSrc.SERVER_PORT, () => {
            const controllerLmStudio = new ControllerLmStudio(this.app, this.limiter);
            controllerLmStudio.api();

            const controllerMicrosoft = new ControllerMicrosoft(this.app, this.limiter, this.userObject);
            controllerMicrosoft.api();

            const controllerXvfb = new ControllerXvfb(this.userObject);

            const controllerMcp = new ControllerMcp(this.userObject);

            helperSrc.writeLog("Server.ts - createServer() - listen()", `Port: ${helperSrc.SERVER_PORT}`);

            this.app.get("/", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
                if (request.accepts("html")) {
                    response.sendFile(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}index.html`);
                } else {
                    response.status(404).send("/: html not found!");
                }
            });

            this.app.get("/info", (request: modelServer.Irequest, response: Response) => {
                helperSrc.responseBody(`Client ip: ${request.clientIp || ""}`, "", response, 200);
            });

            this.app.post("/login", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
                Ca.writeCookie(`${helperSrc.LABEL}_authentication`, response);

                const requestAuthorization = request.headers["authorization"];

                if (requestAuthorization) {
                    const token = requestAuthorization.substring(7);

                    const microsoftUrl = await controllerMicrosoft.loginWithAuthenticationCode(token);

                    await controllerXvfb.start(token);

                    await controllerMcp.connection(token);

                    // eslint-disable-next-line no-console
                    console.log("cimo", this.userObject[token]);

                    helperSrc.responseBody(microsoftUrl, "", response, 200);
                } else {
                    helperSrc.responseBody("", "ko", response, 500);
                }
            });

            this.app.post("/logout", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
                Ca.removeCookie(`${helperSrc.LABEL}_authentication`, request, response);

                const requestAuthorization = request.headers["authorization"];

                if (requestAuthorization) {
                    const token = requestAuthorization.substring(7);

                    controllerXvfb.stop(token);

                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("", "ko", response, 500);
                }
            });

            this.app.get("/userInfo", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
                const requestAuthorization = request.headers["authorization"];

                if (requestAuthorization) {
                    const token = requestAuthorization.substring(7);

                    helperSrc.responseBody(JSON.stringify(this.userObject[token]), "", response, 200);
                } else {
                    helperSrc.responseBody("", "ko", response, 500);
                }
            });
        });
    };
}

const controllerServer = new Server();
controllerServer.createSetting();
controllerServer.createServer();

Cc.execute(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}cronjob/`);

helperSrc.keepProcess();

import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { ConfidentialClientApplication, Configuration, AuthorizationUrlRequest, AuthorizationCodeRequest } from "@azure/msal-node";
import * as Crypto from "crypto";

// Source
import * as helperSrc from "../HelperSrc.js";
import ControllerLmStudio from "./LmStudio.js";

export default class Microsoft {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private userObject: Record<string, string>;
    private controllerLmStudio: ControllerLmStudio;

    // Method
    private base64Url(input: Buffer | string): string {
        const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");

        return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    private generatePkceCode = (): Record<string, string> => {
        const verifierBytes = Crypto.randomBytes(32);

        const verifier = this.base64Url(verifierBytes);
        const challenge = this.base64Url(Crypto.createHash("sha256").update(verifier).digest());

        return { verifier, challenge };
    };

    private claimsJsonObject = JSON.stringify({
        id_token: { acrs: { essential: true, values: ["C1"] } },
        access_token: { acrs: { essential: true, values: ["C1"] } }
    });

    private configurationObject: Configuration = {
        auth: {
            clientId: helperSrc.AD_CLIENT,
            clientSecret: helperSrc.AD_CLIENT_SECRET,
            authority: `${helperSrc.URL_AD_LOGIN}/${helperSrc.AD_TENANT}`
        }
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler, userObject: Record<string, string>, controllerLmStudio: ControllerLmStudio) {
        this.app = app;
        this.limiter = limiter;
        this.userObject = userObject;
        this.controllerLmStudio = controllerLmStudio;
    }

    loginWithAuthenticationCode = async (): Promise<string> => {
        const { verifier: codeVerifier, challenge: codeChallenge } = this.generatePkceCode();

        const parameterObject: AuthorizationUrlRequest = {
            scopes: JSON.parse(helperSrc.AD_SCOPE),
            redirectUri: helperSrc.URL_AD_REDIRECT,
            state: codeVerifier,
            codeChallenge,
            codeChallengeMethod: "S256",
            claims: this.claimsJsonObject
        };

        const cca = new ConfidentialClientApplication(this.configurationObject);

        const authenticationUrl = await cca.getAuthCodeUrl(parameterObject);

        return authenticationUrl;
    };

    codeToToken = async (code: string, state: string): Promise<Record<string, string>> => {
        const tokenRequestObject: AuthorizationCodeRequest = {
            code,
            redirectUri: helperSrc.URL_AD_REDIRECT,
            scopes: JSON.parse(helperSrc.AD_SCOPE),
            codeVerifier: state,
            claims: this.claimsJsonObject
        };

        const cca = new ConfidentialClientApplication(this.configurationObject);

        const authResult = await cca.acquireTokenByCode(tokenRequestObject);

        let username = "";

        if (authResult.account) {
            username = authResult.account.username;
        }

        if (username !== "") {
            return {
                username,
                accessToken: authResult.accessToken
            };
        }

        return {};
    };

    api = (): void => {
        this.app.get("/ms_ai_redirect", this.limiter, (request: Request, response: Response) => {
            const code = request.query["code"] as string;
            const state = request.query["state"] as string;

            this.codeToToken(code, state)
                .then((result) => {
                    this.userObject[result["username"]] = result["accessToken"];

                    //this.controllerLmStudio.setUsername(result["username"]);

                    helperSrc.responseBody("ok", "", response, 200);
                })
                .catch(() => {
                    helperSrc.responseBody("", "ko", response, 500);
                });
        });

        this.app.get("/ms_ai_verify", this.limiter, (request: Request, response: Response) => {
            const username = request.query["username"] as string;

            if (!(username in this.userObject)) {
                helperSrc.responseBody("", "ko", response, 500);
            }

            helperSrc.responseBody(this.userObject[username], "", response, 200);
        });
    };
}

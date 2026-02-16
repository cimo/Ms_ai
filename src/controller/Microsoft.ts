import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import * as Crypto from "crypto";
import { ConfidentialClientApplication, Configuration, AuthorizationUrlRequest, AuthorizationCodeRequest } from "@azure/msal-node";
import { Ce } from "@cimo/environment/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelMicrosoft from "../model/Microsoft.js";

Ce.loadFile("./env/microsoft.env");

export const AD_URL_LOGIN = Ce.checkVariable("MS_AI_AD_URL_LOGIN") || (process.env["MS_AI_URL_AD_LOGIN"] as string);
export const AD_URL_REDIRECT = Ce.checkVariable("MS_AI_AD_URL_REDIRECT") || (process.env["MS_AI_URL_AD_REDIRECT"] as string);
export const AD_SCOPE = Ce.checkVariable("MS_AI_AD_SCOPE") || (process.env["MS_AI_AD_SCOPE"] as string);
export const AD_TENANT = Ce.checkVariable("MS_AI_AD_TENANT");
export const AD_CLIENT = Ce.checkVariable("MS_AI_AD_CLIENT");
export const AD_CLIENT_SECRET = Ce.checkVariable("MS_AI_AD_CLIENT_SECRET");

export default class Microsoft {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private userObject: Record<string, modelServer.Iuser>;

    // Method
    private base64Url(input: Buffer | string): string {
        const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");

        return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    private generatePkceCode = (): Record<string, string> => {
        const verifier = this.base64Url(Crypto.randomBytes(32));
        const challenge = this.base64Url(Crypto.createHash("sha256").update(verifier).digest());

        return { verifier, challenge };
    };

    private claimsJsonObject = JSON.stringify({
        id_token: { acrs: { essential: true, values: ["C1"] } },
        access_token: { acrs: { essential: true, values: ["C1"] } }
    });

    private configurationObject: Configuration = {
        auth: {
            clientId: AD_CLIENT,
            clientSecret: AD_CLIENT_SECRET,
            authority: `${AD_URL_LOGIN}/${AD_TENANT}`
        }
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler, userObject: Record<string, modelServer.Iuser>) {
        this.app = app;
        this.limiter = limiter;
        this.userObject = userObject;
    }

    loginWithAuthenticationCode = async (bearerToken: string): Promise<string> => {
        let result = "";

        if (AD_URL_LOGIN && AD_URL_REDIRECT && AD_SCOPE && AD_TENANT && AD_CLIENT && AD_CLIENT_SECRET) {
            const { verifier: codeVerifier, challenge: codeChallenge } = this.generatePkceCode();

            const parameterObject: AuthorizationUrlRequest = {
                scopes: JSON.parse(AD_SCOPE),
                redirectUri: AD_URL_REDIRECT,
                state: `${codeVerifier}:-:${bearerToken}`,
                codeChallenge,
                codeChallengeMethod: "S256",
                claims: this.claimsJsonObject
            };

            const cca = new ConfidentialClientApplication(this.configurationObject);

            result = await cca.getAuthCodeUrl(parameterObject);
        } else {
            result = "Warning: Configure 'microsoft.env' file.";
        }

        return result;
    };

    codeToToken = async (code: string, state: string): Promise<modelMicrosoft.IcodeToTokenResult> => {
        let result = {} as modelMicrosoft.IcodeToTokenResult;

        const stateSplit = state.split(":-:");

        const tokenRequestObject: AuthorizationCodeRequest = {
            code,
            redirectUri: AD_URL_REDIRECT,
            scopes: JSON.parse(AD_SCOPE),
            codeVerifier: stateSplit[0],
            claims: this.claimsJsonObject
        };

        const cca = new ConfidentialClientApplication(this.configurationObject);

        const authResult = await cca.acquireTokenByCode(tokenRequestObject);

        let username = "";

        if (authResult.account) {
            username = authResult.account.username;
        }

        result = {
            bearerToken: stateSplit[1],
            username,
            accessToken: authResult.accessToken
        };

        return result;
    };

    api = (): void => {
        this.app.get("/ms-ai-redirect", this.limiter, (request: Request, response: Response) => {
            const code = request.query["code"] as string;
            const state = request.query["state"] as string;

            this.codeToToken(code, state)
                .then((result) => {
                    this.userObject[result.bearerToken] = {
                        ...this.userObject[result.bearerToken],
                        username: result.username,
                        accessToken: result.accessToken
                    };

                    helperSrc.responseBody("ok", "", response, 200);
                })
                .catch(() => {
                    helperSrc.responseBody("", "ko", response, 500);
                });
        });

        this.app.get("/ms-ai-verify", this.limiter, (request: Request, response: Response) => {
            const username = request.query["username"] as string;

            if (username in this.userObject) {
                helperSrc.responseBody(this.userObject[username].accessToken, "", response, 200);
            } else {
                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}

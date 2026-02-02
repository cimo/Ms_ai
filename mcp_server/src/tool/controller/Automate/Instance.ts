import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as Helper from "./Helper.js";
import * as model from "../../model/Automate.js";

const URL_MS_OCR = Helper.ENV_NAME === "local" ? "https://localhost:1045" : "";
const REQUEST_TIMEOUT = 60000;
const REQUEST_IS_ENCODED = false;

export const api = new Cr(`${URL_MS_OCR || ""}`, REQUEST_TIMEOUT, REQUEST_IS_ENCODED);

let cookieObject: Record<string, string> = {};

api.setRequestInterceptor((config: RequestInit) => {
    return requestLogic(config);
});

api.setResponseInterceptor((response: Response) => {
    return responseLogic(response);
});

const requestLogic = (config: RequestInit): RequestInit => {
    let cookie = "";

    if (config.headers) {
        const header = config.headers as unknown as model.IresponseHeader;

        cookie = cookieObject[header["X-Session-Id"]] || "";

        if (header["X-Endpoint"] === "/login") {
            cookieObject[header["X-Session-Id"]] = "";
            cookie = "";
        }
    }

    return {
        ...config,
        headers: {
            ...config.headers,
            Cookie: cookie
        },
        credentials: "include"
    };
};

const responseLogic = (response: Response) => {
    const setCookie = response.headers.get("set-cookie");
    const sessionId = response.headers.get("X-Session-Id");
    const endpoint = response.headers.get("X-Endpoint");

    if (endpoint === "/login") {
        if (sessionId && setCookie) {
            cookieObject[sessionId] = setCookie;
        }
    } else if (endpoint === "/logout") {
        if (sessionId) {
            delete cookieObject[sessionId];
        }
    }

    if (response.status === 403 || response.status === 500) {
        // eslint-disable-next-line no-console
        console.log("error", response.status.toString());
    }

    return response;
};

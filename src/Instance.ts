import https from "https";
import Fs from "fs";
import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "./HelperSrc.js";

export const api = new Cr(`${helperSrc.URL_ENGINE || ""}`);

api.setRequestInterceptor((config: RequestInit) => {
    return {
        ...config,
        headers: {
            ...config.headers
        },
        credentials: "include",
        agent: new https.Agent({ ca: Fs.readFileSync("/usr/local/share/ca-certificates/ca.pem") })
    };
});

api.setResponseInterceptor((response: Response) => {
    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - responseLogic() - Error", response.status.toString());
    }

    return response;
});

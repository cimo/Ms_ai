import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "./HelperSrc.js";

export const api = new Cr(`${helperSrc.URL_ENGINE || ""}`);

api.setRequestInterceptor((config: RequestInit) => {
    return requestLogic(config);
});

api.setResponseInterceptor((response: Response) => {
    return responseLogic(response);
});

const requestLogic = (config: RequestInit): RequestInit => {
    return {
        ...config,
        headers: {
            ...config.headers
        },
        credentials: "include"
    };
};

const responseLogic = (response: Response) => {
    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - responseLogic() - Error", response.status.toString());
    }

    return response;
};

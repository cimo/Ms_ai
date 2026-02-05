import { exec } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";

export default class Xvfb {
    // Variable
    private userObject: Record<string, modelServer.Iuser>;

    // Method
    private display = (uniqueId: string): number => {
        let result = 1;

        const valueList = Object.values(this.userObject);

        if (valueList.length > 0) {
            const last = valueList[valueList.length - 1];

            result = last.display + 1;
        }

        this.userObject[uniqueId] = {
            ...this.userObject[uniqueId],
            display: result
        };

        return result;
    };

    constructor(userObject: Record<string, modelServer.Iuser>) {
        this.userObject = userObject;
    }

    start = async (uniqueId: string): Promise<void> => {
        helperSrc.writeLog("Xvfb.ts - start()", `Display uniqueId: ${uniqueId}`);

        const display = this.display(uniqueId);

        exec(`Xvfb :${display} -screen 0 1920x1080x24 >> "${helperSrc.PATH_ROOT}${helperSrc.PATH_LOG}xvfb.log" 2>&1`);
    };

    stop = (uniqueId: string): void => {
        helperSrc.writeLog("Xvfb.ts - stop()", `Display uniqueId: ${uniqueId}`);

        const display = this.display(uniqueId);

        exec(`pkill -f "Xvfb :${display}"`);

        delete this.userObject[uniqueId];
    };
}

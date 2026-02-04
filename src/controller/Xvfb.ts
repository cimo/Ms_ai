import { exec } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";

export default class Xvfb {
    // Variable
    private userObject: Record<string, modelServer.Iuser>;

    // Method
    constructor(userObject: Record<string, modelServer.Iuser>) {
        this.userObject = userObject;
    }

    display = (uniqueId: string): number => {
        let result = 1;

        const display = this.userObject[uniqueId].display;

        if (display) {
            return display;
        }

        const userObjectLength = Object.values(this.userObject).length;

        if (userObjectLength > 0) {
            result = this.userObject[userObjectLength - 1].display + 1;
        }

        this.userObject[uniqueId].display = result;

        return result;
    };

    start = (uniqueId: string): void => {
        helperSrc.writeLog("Xvfb.ts - start()", `Display uniqueId: ${uniqueId}`);

        const display = this.display(uniqueId);

        exec(`Xvfb :${display} -screen 0 1920x1080x24`);
    };

    stop = (uniqueId: string): void => {
        helperSrc.writeLog("Xvfb.ts - stop()", `Display uniqueId: ${uniqueId}`);

        const display = this.display(uniqueId);

        exec(`pkill -f "Xvfb :${display}"`);
    };
}

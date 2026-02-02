import { exec, execFile } from "child_process";
import { mouse, screen, FileType } from "@nut-tree-fork/nut-js";
import sharp from "sharp";

// Source
import * as Helper from "./Helper.js";

const displayObject: Record<string, number> = {};

const drawCursor = async (file: string, x: number, y: number): Promise<void> => {
    const cursor = Buffer.from(`<svg width="20" height="20"><circle cx="5" cy="5" r="5" fill="red"/></svg>`);

    await sharp(file)
        .composite([{ input: cursor, top: y, left: x }])
        .toFile(file.replace(".jpg", "_cursor.jpg"));
};

export const number = (sessionId: string): number => {
    let result = 1;

    const displayNumber = displayObject[sessionId];

    if (displayNumber) {
        return displayNumber;
    }

    if (displayObject["length"] > 0) {
        result = displayObject[displayObject["length"] - 1] + 1;
    }

    displayObject[sessionId] = result;

    process.env["DISPLAY"] = `:${result}`;

    return result;
};

export const start = async (display: number): Promise<void> => {
    const execCommand = `. ${Helper.PATH_ROOT}script/chrome.sh`;
    const execArgumentList = [`"${display}"`, `"${Helper.CHROME_URL}"`, `"headless"`];

    execFile(execCommand, execArgumentList, { shell: "/bin/bash", encoding: "utf8" }, () => {});
};

export const stop = async (display: number): Promise<string> => {
    exec(`rm -f /tmp/.X11-unix/X${display} || true`);
    exec(`rm -f /tmp/.X${display}-lock || true`);

    exec(`kill -9 $(ps -ef | grep "Xvfb :${display}" | grep -v grep | awk '{print $2}')`);

    return "ok";
};

export const screenshot = async (): Promise<Buffer> => {
    if (Helper.IS_DEBUG) {
        const mousePosition = await mouse.getPosition();
        await screen.capture("screenshot", FileType.JPG, `${Helper.PATH_ROOT}${Helper.PATH_FILE}`);
        await drawCursor(`${Helper.PATH_ROOT}${Helper.PATH_FILE}screenshot.jpg`, mousePosition.x, mousePosition.y);
    }

    const imagePixel = await screen.grab();
    const rgbImage = await imagePixel.toRGB();

    const bufferJpg = await sharp(rgbImage.data, {
        raw: {
            width: imagePixel.width,
            height: imagePixel.height,
            channels: 4
        }
    })
        .jpeg()
        .toBuffer();

    return bufferJpg;
};

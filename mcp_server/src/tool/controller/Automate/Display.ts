import { stdout } from "process";
import { mouse, screen, FileType } from "@nut-tree-fork/nut-js";
import sharp from "sharp";

// Source
import * as Helper from "./Helper.js";

const drawCursor = async (file: string, x: number, y: number): Promise<void> => {
    const cursor = Buffer.from(`<svg width="20" height="20"><circle cx="5" cy="5" r="5" fill="red"/></svg>`);

    await sharp(file)
        .composite([{ input: cursor, top: y, left: x }])
        .toFile(file.replace(".jpg", "_cursor.jpg"));
};

const screenshot = async (): Promise<Buffer> => {
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

const argumentList = process.argv.slice(2);

let result: Buffer = Buffer.from("");

if (argumentList[0] === "screenshot") {
    result = await screenshot();
}

const base64 = result.toString("base64");

if (!stdout.write(base64)) {
    await new Promise<void>((resolve) => stdout.once("drain", resolve));
}

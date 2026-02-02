// Source
import { z } from "zod";
import type { Context } from "fastmcp";

// Source
import * as model from "./model/Automate.js";
import * as display from "./controller/Automate/Display.js";
import * as mouse from "./controller/Automate/Mouse.js";
import * as ocr from "./controller/Automate/Ocr.js";

const ocrParameter = z.object({
    searchText: z.string().optional().describe("searchText (string) : Optional, exact phrase to find in recognized text.")
});

const mouseMoveParameter = z.object({
    x: z.number().describe("x (number) : The x mouse coordinate"),
    y: z.number().describe("y (number) : The y mouse coordinate")
});
const mouseClickParameter = z.object({
    button: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .describe(
            "button (number) : Optional, this is the mouse button to click.\n" +
                "- Left (number) : 0\n" +
                "- Middle (number) : 1\n" +
                "- Right (number) : 2\n"
        )
});

export const toolAutomateOcr = {
    name: "tool_automate_ocr",
    description:
        "Extract the image with this parameter:\n" +
        "Input:\n" +
        "- searchText (string) : Used for finding the matching label in the image.\n" +
        "Output:\n" +
        "- List of elements present in the image with these parameters:\n" +
        "{\n" +
        "id: number; : A unique identifier\n" +
        "centerPoint: { x: number; y: number; }; : x and y mouse coordinates\n" +
        "text: string; : Element label\n" +
        "match: boolean; : If label matches with the searchText\n" +
        "}",
    parameters: ocrParameter,
    execute: async (argument: z.infer<typeof ocrParameter>, context: Context<Record<string, unknown>>) => {
        let resultList: model.ItoolOcrResult[] = [];

        const { reportProgress } = context;
        await reportProgress({ progress: 0, total: 100 });

        if (context.sessionId) {
            const displayNumber = await display.number(context.sessionId);

            await display.start(displayNumber);

            const file = await display.screenshot();

            await ocr.login(context.sessionId);
            resultList = await ocr.extract(context.sessionId, file, argument.searchText, "data");
            ocr.logout(context.sessionId);
        }

        await reportProgress({ progress: 100, total: 100 });

        return JSON.stringify(resultList, null, 2);
    }
};

export const toolAutomateMouseMove = {
    name: "tool_automate_mouse_move",
    description:
        "Interact with the mouse and move it with these parameters:\n" +
        "Input:\n" +
        "- x (number) : The x mouse coordinate\n" +
        "- y (number) : The y mouse coordinate\n" +
        "Output:\n" +
        "- A string with the text 'ok'",
    parameters: mouseMoveParameter,
    execute: async (argument: z.infer<typeof mouseMoveParameter>, context: Context<Record<string, unknown>>) => {
        let result = "";

        const { reportProgress } = context;
        await reportProgress({ progress: 0, total: 100 });

        if (context.sessionId) {
            result = await mouse.move(argument.x, argument.y);
        }

        await reportProgress({ progress: 100, total: 100 });

        return String(result);
    }
};

export const toolAutomateMouseClick = {
    name: "tool_automate_mouse_click",
    description:
        "Interact with the mouse and click the button with this parameter:\n" +
        "Input:\n" +
        "button (number) : Optional, this is the mouse button to click.\n" +
        "- Left (number) : 0\n" +
        "- Middle (number) : 1\n" +
        "- Right (number) : 2\n" +
        "Output:\n" +
        "- A string with the text 'ok'",
    parameters: mouseClickParameter,
    execute: async (argument: z.infer<typeof mouseClickParameter>, context: Context<Record<string, unknown>>) => {
        let result = "";

        const { reportProgress } = context;
        await reportProgress({ progress: 0, total: 100 });

        if (context.sessionId) {
            const button = (argument.button ?? 0) as 0 | 1 | 2;
            result = await mouse.click(button);
        }

        await reportProgress({ progress: 100, total: 100 });

        return String(result);
    }
};

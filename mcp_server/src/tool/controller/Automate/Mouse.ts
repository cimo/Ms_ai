import { mouse, straightTo, Point } from "@nut-tree-fork/nut-js";

export const move = async (x: number, y: number): Promise<string> => {
    await mouse.move(straightTo(new Point(x, y)));

    return "ok";
};

export const click = async (button: number): Promise<string> => {
    await mouse.click(button);

    return "ok";
};

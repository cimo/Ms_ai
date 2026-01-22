// Source
import { z } from "zod";
import type { Context } from "fastmcp";

// Source
import * as mathExpression from "./controller/Math/Expression.js";
import * as mathSum from "./controller/Math/Sum.js";

const expressionParameter = z.object({
    input: z.string().describe("A math expression, example: '3 + 4 * (2 - 1) ^ 3 / 2'")
});

const sumParameter = z.object({
    a: z.number(),
    b: z.number()
});

export const toolMathExpression = {
    name: "tool_math_expression",
    description: "Evaluate expression.",
    parameters: expressionParameter,
    execute: async (argument: z.infer<typeof expressionParameter>, { reportProgress }: Context<Record<string, unknown>>) => {
        await reportProgress({ progress: 0, total: 100 });

        const result = mathExpression.execute(argument.input);

        await reportProgress({ progress: 100, total: 100 });

        return String(result);
    }
};

export const toolMathSum = {
    name: "tool_math_sum",
    description: "Sum 2 numbers.",
    parameters: sumParameter,
    execute: async (argument: z.infer<typeof sumParameter>, { reportProgress }: Context<Record<string, unknown>>) => {
        await reportProgress({ progress: 0, total: 100 });

        const result = mathSum.execute(argument.a, argument.b);

        await reportProgress({ progress: 100, total: 100 });

        return String(result);
    }
};

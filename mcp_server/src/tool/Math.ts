// Source
import { z } from "zod";
import type { Context } from "fastmcp";

// Source
import * as modelMain from "../model/Main.js";
import * as mathSum from "./Math/Sum.js";
import * as mathExpression from "./Math/Expression.js";

const toolSumParameter = z.object({
    a: z.number(),
    b: z.number()
});

const toolExpressionParameter = z.object({
    expression: z.string().describe("A math expression, example: '3 + 4 * (2 - 1) ^ 3 / 2'")
});

export const toolSum = {
    name: "tool_math_sum",
    description: "Sum 2 numbers.",
    parameters: toolSumParameter,
    execute: async (argument: z.infer<typeof toolSumParameter>, { reportProgress }: Context<modelMain.Auth>) => {
        await reportProgress({ progress: 0, total: 100 });

        const result = mathSum.sum(argument.a, argument.b);

        await reportProgress({ progress: 100, total: 100 });

        return String(result);
    }
};

export const toolExpression = {
    name: "tool_math_expression",
    description: "Evaluate expression.",
    parameters: toolExpressionParameter,
    execute: async (argument: z.infer<typeof toolExpressionParameter>, { reportProgress }: Context<modelMain.Auth>) => {
        await reportProgress({ progress: 0, total: 100 });

        const tokens = mathExpression.tokenize(argument.expression);
        const rpn = mathExpression.toRPN(tokens);
        const evalRPN = mathExpression.evalRPN(rpn);

        await reportProgress({ progress: 100, total: 100 });

        return String(evalRPN);
    }
};

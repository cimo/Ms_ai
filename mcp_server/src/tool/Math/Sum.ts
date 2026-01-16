import { z } from "zod";
import type { Context } from "fastmcp";

// Source
import * as modelMain from "../../model/Main.js";

const parameter = z.object({
    a: z.number(),
    b: z.number()
});

const tool = {
    name: "tool_sum",
    description: "Sum 2 numbers.",
    parameters: parameter,
    execute: async (argument: z.infer<typeof parameter>, { reportProgress }: Context<modelMain.Auth>) => {
        await reportProgress({ progress: 0, total: 100 });

        const result = argument.a + argument.b;

        await reportProgress({ progress: 100, total: 100 });

        return String(result);
    }
};

export default tool;

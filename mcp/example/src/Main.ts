import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
    name: "Server example",
    version: "1.0.0",
    roots: {
        enabled: false
    }
});

server.addTool({
    name: "cimo-tool",
    description: "Sum 2 numbers.",
    parameters: z.object({
        a: z.number(),
        b: z.number()
    }),
    execute: async (argument: { a: number; b: number }, { reportProgress }) => {
        await reportProgress({
            progress: 0,
            total: 100
        });

        //...

        await reportProgress({
            progress: 100,
            total: 100
        });

        return {
            content: [
                {
                    type: "text",
                    text: String(argument.a + argument.b)
                }
            ]
        };
    }
});

server.start({
    transportType: "stdio"
});

import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
    name: "Example",
    version: "1.0.0"
});

server.addTool({
    name: "sum",
    description: "Sum 2 numbers.",
    parameters: z.object({
        a: z.number(),
        b: z.number()
    }),
    execute: async (argument: { a: number; b: number }) => {
        return String(argument.a + argument.b);
    }
});

server.start({
    transportType: "stdio"
});

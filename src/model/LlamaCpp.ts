interface IapiResponseItem {
    content: [
        {
            type: string;
            text: string;
        }
    ];
}

export interface IapiDataResponseBody extends Record<string, unknown> {
    stream: boolean;
    model: string;
    input: {
        role: string;
        content: string | { type: string; text?: string; image_url?: string }[];
    }[];
    tools: unknown[];
}

export interface IapiModel {
    data: {
        id: string;
    }[];
}

export interface IllmResponse {
    type: string;
    response: {
        output: IapiResponseItem[];
    };
}

export interface IllmResponseTool {
    result: IapiResponseItem;
}

export interface ItoolCall {
    name: string;
    argumentObject: Record<string, string>;
}

export interface ItaskCall {
    list: ItoolCall[];
}

interface Ioutput {
    content: [
        {
            type: string;
            text: string;
        }
    ];
}

export interface IapiModelResponse {
    data: {
        id: string;
    }[];
}

export interface IapiLlmBody extends Record<string, unknown> {
    stream: boolean;
    model: string;
    input: {
        role: string;
        content: string | { type: string; text?: string; image_url?: string }[];
    }[];
    tools: unknown[];
    temperature?: number;
}

export interface IapiLlmResponse {
    type: string;
    response: {
        output: Ioutput[];
    };
}

export interface IapiTokenDetailBody {
    model: string;
    text: string;
}

export interface IapiTokenizeResponse {
    tokens: number[];
}

export interface IapiPropsResponse {
    default_generation_settings: {
        n_ctx: number;
    };
}

export interface IapiEngineError {
    error?: {
        message: string;
    };
}

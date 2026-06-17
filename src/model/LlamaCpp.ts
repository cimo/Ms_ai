interface IapiResponseItem {
    content: [
        {
            type: string;
            text: string;
        }
    ];
}

export interface IapiEmbeddingBody {
    input: string;
}

export interface IapiRagGraphifyExtractBody {
    input: string;
}

export interface IapiResponseBody extends Record<string, unknown> {
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

export interface IapiEmbedding {
    data: {
        object: string;
        embedding: number[];
        index: number;
    };
}

export interface IapiResponseNonStream {
    output: IapiResponseItem[];
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

export interface IragEntity {
    name: string;
    type: string;
    description: string;
}

export interface IragRelation {
    source: string;
    verb: string;
    target: string;
    description: string;
    keyword: string;
}

export interface IragGraphifyExtract {
    entityList: IragEntity[];
    relationList: IragRelation[];
}

interface IapiResponseItem {
    content: [
        {
            type: string;
            text: string;
        }
    ];
}

export interface IapiModel {
    data: {
        id: string;
    }[];
}

export interface IapiEmbedding {
    data: {
        embedding: number[];
    };
}

export interface IapiResponse {
    type: string;
    response: {
        output: IapiResponseItem[];
    };
}

export interface IapiResponseNonStream {
    output: IapiResponseItem[];
}

export interface IapiToolCall {
    result: IapiResponseItem;
}

export interface ItoolCall {
    name: string;
    argumentObject: Record<string, string>;
}

export interface ItaskCall {
    list: ItoolCall[];
}

export interface IragRelation {
    source: string;
    verb: string;
    target: string;
}

export interface IragGraphifyExtract {
    relationList: IragRelation[];
}

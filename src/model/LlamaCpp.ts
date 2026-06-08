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
        object: string;
        embedding: number[];
        index: number;
    };
}

export interface IapiResponseNonStream {
    output: IapiResponseItem[];
}

export interface IapiResponse {
    type: string;
    response: {
        output: IapiResponseItem[];
    };
}

export interface IapiResponseTool {
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

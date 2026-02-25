export interface IapiModel {
    data: [
        {
            id: string;
            object: string;
            owned_by: string;
        }
    ];
    object: string;
}

export interface IapiResponseItem {
    content: [
        {
            type: string;
            text: string;
        }
    ];
}

export interface IapiResponse {
    type: string;
    output_index: number;
    item: IapiResponseItem;
}

export interface ItoolTask {
    stepList: [
        {
            action: string;
            argumentObject: Record<string, string>;
        }
    ];
}

interface IapiEmbeddingData {
    object: string;
    embedding: number[];
    index: number;
}

export interface IapiEmbedding {
    object: string;
    data: IapiEmbeddingData[];
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

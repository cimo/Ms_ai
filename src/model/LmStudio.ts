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
    tool_call_id: string;
    type: string;
    name: string;
    arguments: string;
    output: string;
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
    sequence_number: number;
    delta: string;
    item: IapiResponseItem;
    response: {
        id: string;
        message: string;
    };
    error: {
        code: string;
        message: string;
        param: string;
        type: string;
    };
}

export interface ItoolTask {
    [key: string]: unknown;
    stepList: {
        action: string;
        argumentList: [Record<string, unknown>];
    }[];
}

interface IapiResponseItem {
    content: [
        {
            type: string;
            text: string;
        }
    ];
}

export interface IapiResponse {
    type: string;
    response: {
        output: IapiResponseItem[];
    };
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

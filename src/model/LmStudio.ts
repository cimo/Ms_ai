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

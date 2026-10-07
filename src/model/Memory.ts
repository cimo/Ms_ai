export interface Ichunk {
    chunk: string;
    rest: string;
}

export interface Icandidate {
    text: string;
    context: string;
}

export interface IresultText {
    text: string;
    message: string;
}

export interface IresultMemory {
    memory: string;
    message: string;
}

export interface IresultCount {
    count: number;
    message: string;
}

export interface IapiChatResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

export interface IapiStreamResponse {
    type: string;
    delta?: string;
}

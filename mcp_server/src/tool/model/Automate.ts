export interface IresponseHeader {
    "X-Endpoint": string;
    "X-Session-Id": string;
}

export interface IresponseBody {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}

export interface ItoolOcrResponse {
    id: number;
    polygon: number[][];
    text: string;
    match: boolean;
}

export interface ItoolOcrResult {
    id: number;
    centerPoint: {
        x: number;
        y: number;
    };
    text: string;
    match: boolean;
}

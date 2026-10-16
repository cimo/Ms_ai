import { ChildProcessWithoutNullStreams } from "child_process";

export interface IdataSession {
    transcript: string;
    authLogin: ChildProcessWithoutNullStreams | null;
}

export interface IdataError {
    error?: { message?: string };
}

import { ChildProcessWithoutNullStreams } from "child_process";

// Source
import * as modelHelperSrc from "../model/HelperSrc.js";

export interface IdataSession {
    transcript: string;
    authLoginStart: ChildProcessWithoutNullStreams | null;
    authLoginEnd: Promise<modelHelperSrc.IactionOperation> | null;
    resolveInvalidCode: ((value: modelHelperSrc.IactionOperation) => void) | null;
}

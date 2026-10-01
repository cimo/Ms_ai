import { ChildProcessWithoutNullStreams, spawn } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelHelperSrc from "../model/HelperSrc.js";
import * as modelAnthropic from "../model/Anthropic.js";

export default class Anthropic {
    private sessionObject: Record<string, modelAnthropic.IdataSession>;

    private clearLogin = (mcpSessionId: string, authLoginStart: ChildProcessWithoutNullStreams, terminate: boolean): void => {
        const session = this.sessionObject[mcpSessionId];

        if (!session || session.authLoginStart !== authLoginStart) {
            return;
        }

        authLoginStart.stdout.removeAllListeners("data");
        authLoginStart.stderr.removeAllListeners("data");

        session.authLoginStart = null;
        session.authLoginEnd = null;
        session.resolveInvalidCode = null;

        delete this.sessionObject[mcpSessionId];

        if (terminate && !authLoginStart.killed) {
            authLoginStart.kill();
        }
    };

    private claudeData = (
        mcpSessionId: string,
        stream: "stdout" | "stderr",
        buffer: Buffer,
        resolve: (value: modelHelperSrc.IactionOperation) => void
    ): void => {
        const text = buffer.toString("utf8");

        this.sessionObject[mcpSessionId].transcript += text;

        if (stream === "stderr" && text.includes("Invalid code")) {
            if (this.sessionObject[mcpSessionId].resolveInvalidCode) {
                helperSrc.writeLog("Anthropic.ts - claudeData - Error", "Invalid authentication code.");

                this.sessionObject[mcpSessionId].resolveInvalidCode({ state: "ko", message: "Invalid authentication code." });
            }

            if (this.sessionObject[mcpSessionId].authLoginStart) {
                this.clearLogin(mcpSessionId, this.sessionObject[mcpSessionId].authLoginStart, true);
            }

            return;
        }

        if (this.sessionObject[mcpSessionId].transcript.includes("Paste code here if prompted >")) {
            const authenticationUrl = this.sessionObject[mcpSessionId].transcript.match(/https?:\/\/\S+/)?.[0] ?? "";

            resolve({
                state: "ok",
                message: "Open the URL on your browser and send the authentication token.",
                data: authenticationUrl
            });
        }
    };

    private startLogin = (mcpSessionId: string): Promise<modelHelperSrc.IactionOperation> => {
        const authLoginStartPrevious = this.sessionObject[mcpSessionId]?.authLoginStart;

        if (authLoginStartPrevious) {
            this.clearLogin(mcpSessionId, authLoginStartPrevious, true);
        }

        this.sessionObject[mcpSessionId] = {
            transcript: "",
            authLoginStart: null,
            authLoginEnd: null,
            resolveInvalidCode: null
        };

        this.sessionObject[mcpSessionId].authLoginStart = spawn("claude", ["auth", "login"], {
            env: {
                ...process.env,
                CLAUDE_CONFIG_DIR: `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}/input/${mcpSessionId}/claude`,
                NO_COLOR: "1"
            },
            stdio: ["pipe", "pipe", "pipe"],
            shell: false
        });

        const completion = new Promise<modelHelperSrc.IactionOperation>((resolve) => {
            const authLoginStart = this.sessionObject[mcpSessionId].authLoginStart;

            if (!authLoginStart) {
                helperSrc.writeLog("Anthropic.ts - startLogin - Error", "Login process not started.");

                resolve({ state: "ko", message: "Login process not started." });

                return;
            }

            authLoginStart.on("error", (error: Error) => {
                this.clearLogin(mcpSessionId, authLoginStart, true);

                helperSrc.writeLog("Anthropic.ts - claude.on('error') - Error", error.message);

                resolve({ state: "ko", message: error.message });
            });

            authLoginStart.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
                this.clearLogin(mcpSessionId, authLoginStart, false);

                if (signal) {
                    helperSrc.writeLog("Anthropic.ts - claude.on('close') - Error", signal);

                    resolve({ state: "ko", message: "Process terminated by signal." });

                    return;
                }

                if (code !== 0) {
                    helperSrc.writeLog("Anthropic.ts - claude.on('close') - Login failed", `${code}`);

                    resolve({ state: "ko", message: "Login failed." });

                    return;
                }

                resolve({ state: "ok", message: "Login successful." });
            });
        });

        this.sessionObject[mcpSessionId].authLoginEnd = completion;

        return new Promise((resolve) => {
            if (!this.sessionObject[mcpSessionId].authLoginStart) {
                helperSrc.writeLog("Anthropic.ts - startLogin - Error", "Login process not started.");

                resolve({ state: "ko", message: "Login process not started." });

                return;
            }

            this.sessionObject[mcpSessionId].authLoginStart.stdout.on("data", (buffer: Buffer) => {
                this.claudeData(mcpSessionId, "stdout", buffer, resolve);
            });

            this.sessionObject[mcpSessionId].authLoginStart.stderr.on("data", (buffer: Buffer) => {
                this.claudeData(mcpSessionId, "stderr", buffer, resolve);
            });

            completion.then(resolve);
        });
    };

    private submitCode = async (mcpSessionId: string, code: string): Promise<modelHelperSrc.IactionOperation> => {
        if (!this.sessionObject[mcpSessionId] || !this.sessionObject[mcpSessionId].authLoginStart || !this.sessionObject[mcpSessionId].authLoginEnd) {
            helperSrc.writeLog("Anthropic.ts - submitCode - Error", "Login process not started.");

            return { state: "ko", message: "Login process not started." };
        }

        if (!code.trim()) {
            helperSrc.writeLog("Anthropic.ts - submitCode - Error", "Invalid authentication code.");

            this.clearLogin(mcpSessionId, this.sessionObject[mcpSessionId].authLoginStart, true);

            return { state: "ko", message: "Invalid authentication code." };
        }

        const invalidCode = new Promise<modelHelperSrc.IactionOperation>((resolve) => {
            this.sessionObject[mcpSessionId].resolveInvalidCode = resolve;
        });

        this.sessionObject[mcpSessionId].authLoginStart.stdin.write(`${code.trim()}\n`);

        return Promise.race([this.sessionObject[mcpSessionId].authLoginEnd, invalidCode]);
    };

    constructor() {
        this.sessionObject = {};
    }

    authentication = (mcpSessionId: string, code?: string): Promise<modelHelperSrc.IactionOperation> => {
        if (typeof code === "string") {
            return this.submitCode(mcpSessionId, code);
        }

        return this.startLogin(mcpSessionId);
    };

    command = (mcpSessionId: string, model: string, systemPrompt: string, userPrompt: string): Promise<modelHelperSrc.IactionOperation> => {
        const claudePrint = spawn("claude", ["--model", model, "--system-prompt", systemPrompt, "--print", userPrompt], {
            env: {
                ...process.env,
                CLAUDE_CONFIG_DIR: `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}/input/${mcpSessionId}/claude`
            },
            stdio: ["ignore", "pipe", "pipe"],
            shell: false
        });

        return new Promise((resolve) => {
            let output = "";

            claudePrint.stdout.on("data", (buffer: Buffer) => {
                output += buffer.toString("utf8");
            });

            claudePrint.stderr.on("data", (buffer: Buffer) => {
                output += buffer.toString("utf8");
            });

            claudePrint.on("error", (error: Error) => {
                helperSrc.writeLog("Anthropic.ts - claudePrint.on('error') - Error", error.message);

                resolve({ state: "ko", message: error.message });
            });

            claudePrint.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
                if (signal) {
                    helperSrc.writeLog("Anthropic.ts - claudePrint.on('close') - Error", signal);

                    resolve({ state: "ko", message: `Process terminated with signal.` });

                    return;
                }

                if (code !== 0) {
                    helperSrc.writeLog("Anthropic.ts - claudePrint.on('close') - Command failed", output);

                    if (output.includes("Not logged in")) {
                        resolve({ state: "ko", message: "Please log in first." });
                    } else {
                        resolve({ state: "ko", message: output });
                    }

                    return;
                }

                resolve({ state: "ok", message: "", data: output });
            });
        });
    };
}

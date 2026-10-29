import Fs from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelHelperSrc from "../model/HelperSrc.js";
import * as modelOpenAi from "../model/OpenAi.js";

export default class OpenAi {
    private sessionObject: Record<string, modelOpenAi.IdataSession>;

    private clearLogin = (mcpSessionId: string, authLogin: ChildProcessWithoutNullStreams, terminate: boolean): void => {
        const session = this.sessionObject[mcpSessionId];

        if (!session || session.authLogin !== authLogin) {
            return;
        }

        authLogin.stdout.removeAllListeners("data");
        authLogin.stderr.removeAllListeners("data");
        authLogin.removeAllListeners("close");
        authLogin.removeAllListeners("error");

        session.authLogin = null;

        delete this.sessionObject[mcpSessionId];

        if (terminate && !authLogin.killed) {
            authLogin.kill();
        }
    };

    private codexData = (mcpSessionId: string, buffer: Buffer, resolve: (value: modelHelperSrc.IactionOperation) => void): void => {
        const session = this.sessionObject[mcpSessionId];

        if (!session) {
            return;
        }

        const text = buffer.toString("utf8");

        session.transcript += text;

        const authenticationUrl = session.transcript.match(/https:\/\/auth\.openai\.com\/\S+/)?.[0] ?? "";

        if (authenticationUrl) {
            resolve({
                state: "ok",
                message: "Open the URL on your browser",
                data: authenticationUrl
            });
        }
    };

    private startLogin = (mcpSessionId: string): Promise<modelHelperSrc.IactionOperation> => {
        const authLoginPrevious = this.sessionObject[mcpSessionId]?.authLogin;
        const codexHome = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/codex`;

        if (authLoginPrevious) {
            this.clearLogin(mcpSessionId, authLoginPrevious, true);
        }

        this.sessionObject[mcpSessionId] = {
            transcript: "",
            authLogin: null
        };

        const session = this.sessionObject[mcpSessionId];

        return new Promise((resolve) => {
            Fs.mkdir(codexHome, { recursive: true }, (error) => {
                if (error) {
                    helperSrc.writeLog("OpenAi.ts - authentication - Error", error.message);

                    resolve({ state: "ko", message: error.message });

                    return;
                }

                if (this.sessionObject[mcpSessionId] !== session) {
                    resolve({ state: "ko", message: "Login process replaced by a newer request." });

                    return;
                }

                this.sessionObject[mcpSessionId].authLogin = spawn("codex", ["login"], {
                    env: {
                        ...process.env,
                        CODEX_HOME: codexHome
                    },
                    stdio: ["pipe", "pipe", "pipe"],
                    shell: false
                });

                const completion = new Promise<modelHelperSrc.IactionOperation>((resolve) => {
                    const authLogin = this.sessionObject[mcpSessionId].authLogin;

                    if (!authLogin) {
                        helperSrc.writeLog("OpenAi.ts - authentication - Error", "Login process not started.");

                        resolve({ state: "ko", message: "Login process not started." });

                        return;
                    }

                    authLogin.on("error", (error: Error) => {
                        this.clearLogin(mcpSessionId, authLogin, true);

                        helperSrc.writeLog("OpenAi.ts - codex.on('error') - Error", error.message);

                        resolve({ state: "ko", message: error.message });
                    });

                    authLogin.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
                        this.clearLogin(mcpSessionId, authLogin, false);

                        if (signal) {
                            helperSrc.writeLog("OpenAi.ts - codex.on('close') - Error", signal);

                            resolve({ state: "ko", message: "Process terminated by signal." });

                            return;
                        }

                        if (code !== 0) {
                            helperSrc.writeLog("OpenAi.ts - codex.on('close') - Login failed", `${code}`);

                            resolve({ state: "ko", message: "Login failed." });

                            return;
                        }

                        resolve({ state: "ok", message: "Login successful." });
                    });
                });

                if (!this.sessionObject[mcpSessionId].authLogin) {
                    helperSrc.writeLog("OpenAi.ts - authentication - Error", "Login process not started.");

                    resolve({ state: "ko", message: "Login process not started." });

                    return;
                }

                this.sessionObject[mcpSessionId].authLogin.stdout.on("data", (buffer: Buffer) => {
                    this.codexData(mcpSessionId, buffer, resolve);
                });

                this.sessionObject[mcpSessionId].authLogin.stderr.on("data", (buffer: Buffer) => {
                    this.codexData(mcpSessionId, buffer, resolve);
                });

                completion.then(resolve);
            });
        });
    };

    private checkLogin = (mcpSessionId: string): Promise<modelHelperSrc.IactionOperation> => {
        const codexHome = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/codex`;

        return new Promise((resolve) => {
            Fs.mkdir(codexHome, { recursive: true }, (error) => {
                if (error) {
                    helperSrc.writeLog("OpenAi.ts - checkLogin - Error", error.message);

                    resolve({ state: "ko", message: error.message });

                    return;
                }

                const codexLoginStatus = spawn("codex", ["login", "status"], {
                    env: {
                        ...process.env,
                        CODEX_HOME: codexHome
                    },
                    stdio: ["ignore", "pipe", "pipe"],
                    shell: false
                });
                let output = "";

                codexLoginStatus.stdout.on("data", (buffer: Buffer) => {
                    output += buffer.toString("utf8");
                });

                codexLoginStatus.stderr.on("data", (buffer: Buffer) => {
                    output += buffer.toString("utf8");
                });

                codexLoginStatus.on("error", (error: Error) => {
                    helperSrc.writeLog("OpenAi.ts - codexLoginStatus.on('error') - Error", error.message);

                    resolve({ state: "ko", message: error.message });
                });

                codexLoginStatus.on("close", () => {
                    const loginStatus = output.trim();

                    if (loginStatus === "Logged in using ChatGPT") {
                        resolve({ state: "ok", message: "Login successful." });
                    } else if (loginStatus === "Not logged in") {
                        resolve({ state: "ko", message: "Not logged in." });
                    } else {
                        resolve({ state: "ko", message: loginStatus });
                    }
                });
            });
        });
    };

    constructor() {
        this.sessionObject = {};
    }

    authentication = (mcpSessionId: string, isCheck?: boolean): Promise<modelHelperSrc.IactionOperation> => {
        if (isCheck) {
            return this.checkLogin(mcpSessionId);
        }

        return this.startLogin(mcpSessionId);
    };

    command = async (mcpSessionId: string, model: string, systemPrompt: string, userPrompt: string): Promise<modelHelperSrc.IactionOperation> => {
        const loginStatus = await this.checkLogin(mcpSessionId);

        if (loginStatus.state !== "ok") {
            return Promise.resolve({ state: "ko", message: loginStatus.message });
        }

        const codexExec = spawn(
            "codex",
            [
                "exec",
                "--ephemeral",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--config",
                'approval_policy="never"',
                "--config",
                'history.persistence="none"',
                "--config",
                "features.memories=false",
                "--config",
                "memories.use_memories=false",
                "--config",
                "memories.generate_memories=false",
                "--config",
                "memories.dedicated_tools=false",
                "--config",
                "features.plugins=false",
                "--config",
                "features.plugin_hooks=false",
                "--config",
                "features.recommended_plugins=false",
                "--config",
                "plugins._default.enabled=false",
                "--config",
                "skills.include_instructions=false",
                "--config",
                "skills.bundled.enabled=false",
                "--config",
                "features.skill_search=false",
                "--config",
                "features.skill_env_var_dependency_prompt=false",
                "--config",
                "features.skill_mcp_dependency_install=false",
                "--config",
                `developer_instructions="${systemPrompt}"`,
                "--model",
                model,
                userPrompt
            ],
            {
                env: {
                    ...process.env,
                    CODEX_HOME: `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/codex`
                },
                stdio: ["ignore", "pipe", "pipe"],
                shell: false
            }
        );

        return new Promise((resolve) => {
            let output = "";
            let errorOutput = "";

            codexExec.stdout.on("data", (buffer: Buffer) => {
                output += buffer.toString("utf8");
            });

            codexExec.stderr.on("data", (buffer: Buffer) => {
                errorOutput += buffer.toString("utf8");
            });

            codexExec.on("error", (error: Error) => {
                helperSrc.writeLog("OpenAi.ts - codexExec.on('error') - Error", error.message);

                resolve({ state: "ko", message: error.message });
            });

            codexExec.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
                if (signal) {
                    helperSrc.writeLog("OpenAi.ts - codexExec.on('close') - Error", signal);

                    resolve({ state: "ko", message: "Process terminated with signal." });

                    return;
                }

                if (code !== 0) {
                    const commandError = errorOutput.trim() || output.trim();
                    let errorMessage = commandError;

                    for (const line of errorOutput.trim().split(/\r?\n/).reverse()) {
                        if (!line.startsWith("ERROR: ")) {
                            continue;
                        }

                        const errorObject = JSON.parse(line.slice("ERROR: ".length).replace(/\.$/, "")) as modelOpenAi.IdataError;

                        if (errorObject.error && errorObject.error.message) {
                            errorMessage = errorObject.error.message;

                            break;
                        }
                    }

                    helperSrc.writeLog("OpenAi.ts - codexExec.on('close') - Command failed", commandError);

                    if (commandError.toLowerCase().includes("not logged in")) {
                        resolve({ state: "ko", message: "Please log in first." });
                    } else {
                        resolve({ state: "ko", message: errorMessage });
                    }

                    return;
                }

                resolve({ state: "ok", message: "", data: output });
            });
        });
    };
}

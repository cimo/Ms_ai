import { launch } from "chrome-launcher";

const argumentList: string[] = process.argv.slice(2);

const pathExtension: string = "/home/app/docker/ce_microsoft_sso";
const displayNumber: string = argumentList[0];
const urlPage: string = argumentList[1];

const execute = async (): Promise<void> => {
    const flagBaseList: string[] = [
        "--ozone-platform=x11",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-crash-restore-bubble",
        "--window-position=0,0",
        "--window-size=1920,1080"
    ];

    const flagRdpList: string[] = ["--remote-debugging-pipe", "--enable-unsafe-extension-debugging"];

    const environmentList: NodeJS.ProcessEnv = {
        ...process.env,
        DISPLAY: `:${displayNumber}`,
        XDG_SESSION_TYPE: "x11"
    };

    const chrome = await launch({
        chromeFlags: [...flagBaseList, ...flagRdpList],
        startingUrl: urlPage,
        chromePath: "/usr/bin/google-chrome",
        ignoreDefaultFlags: true,
        envVars: environmentList
    });

    const remotePipe = chrome.remoteDebuggingPipes;

    if (!remotePipe) {
        throw new Error("Error: Remote-debugging-pipe is not available.");
    }

    const request = {
        id: 1234,
        method: "Extensions.loadUnpacked",
        params: { path: pathExtension }
    };

    remotePipe.outgoing.write(`${JSON.stringify(request)}\x00`);

    await new Promise((resolve, reject) => {
        let pending = "";

        remotePipe.incoming.on("error", reject);

        remotePipe.incoming.on("close", () => reject(new Error("Error: remoteDebuggingPipes closed before a response was received.")));

        remotePipe.incoming.on("data", (chunk: Buffer) => {
            pending += chunk.toString();

            let end = pending.indexOf("\x00");

            while (end !== -1) {
                const msg = pending.slice(0, end);

                pending = pending.slice(end + 1);

                end = pending.indexOf("\x00");

                resolve(JSON.parse(msg));
            }
        });
    });

    chrome.process.on("exit", () => {
        process.exit(0);
    });
};

execute().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`Error: ${error}`);

    process.exit(1);
});

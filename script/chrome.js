import { launch } from "chrome-launcher";

const argumentList = process.argv.slice(2);

const pathExtension = "/home/app/docker/ce_microsoft_sso";
const urlPage = argumentList[0];

const execute = async () => {
    const flagBaseList = [
        "--no-sandbox",
        "--shm-size=2g",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-crash-restore-bubble",
    ];

    const flagRdpList = [
        "--remote-debugging-pipe",
        "--enable-unsafe-extension-debugging",
    ];

    const chrome = await launch({
        chromeFlags: [...flagBaseList, ...flagRdpList],
        startingUrl: urlPage,
        chromePath: "/usr/bin/google-chrome",
        ignoreDefaultFlags: true,
    });

    const remotePipe = chrome.remoteDebuggingPipes;

    if (!remotePipe) {
        throw new Error("Error: Remote-debugging-pipe is not available.");
    }

    const request = {
        id: 1234,
        method: "Extensions.loadUnpacked",
        params: { path: pathExtension },
    };

    remotePipe.outgoing.write(`${JSON.stringify(request)}\x00`);

    await new Promise((resolve, reject) => {
        let pending = "";

        remotePipe.incoming.on("error", reject);

        remotePipe.incoming.on("close", () =>
            reject(
                new Error("Error: remoteDebuggingPipes closed before a response was received."),
            ),
        );

        remotePipe.incoming.on("data", (chunk) => {
            pending += chunk;

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

execute().catch((error) => {
    console.error(`Error: ${error}`);

    process.exit(1);
});

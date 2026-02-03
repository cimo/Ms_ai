export const ENV_NAME = process.env["ENV_NAME"];
export const PATH_ROOT = process.env["PATH_ROOT"];
export const IS_DEBUG = process.env["MS_AI_IS_DEBUG"];
export const PATH_FILE = process.env["MS_AI_PATH_FILE"];
export const PATH_LOG = process.env["MS_AI_PATH_LOG"];

export const CHROME_URL = ENV_NAME === "local" ? "https://doclift-jp-l.apps.kpmgservicesqa.tech/login" : "";

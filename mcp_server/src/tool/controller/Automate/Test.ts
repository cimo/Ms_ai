import * as display from "./Display.js";
import * as ocr from "./Ocr.js";

const displayNumber = await display.number("1234");

await display.start(displayNumber);

const file = await display.screenshot();

await ocr.login("1234");
const resultList = await ocr.extract("1234", file, "doclift", "data");
ocr.logout("1234");

// eslint-disable-next-line no-console
console.log("cimo", resultList);

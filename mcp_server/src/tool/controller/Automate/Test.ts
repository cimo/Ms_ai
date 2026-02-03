import * as display from "./Display.js";
//import * as ocr from "./Ocr.js";

const sessionId = "1234";
const displayNumber = await display.number(sessionId);

await display.start(displayNumber);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const file = await display.screenshot();

/*await ocr.login(sessionId);
const resultList = await ocr.extract(sessionId, file, "doclift", "data");
ocr.logout(sessionId);*/

//console.log("cimo", resultList);

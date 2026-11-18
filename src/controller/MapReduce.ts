import { Response } from "express";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelService from "../model/Service.js";
import * as modelMapReduce from "../model/MapReduce.js";
import * as instance from "../Instance.js";

export default class MapReduce {
    // Variable
    private tokenReserve: number;
    private chunkShrink: number;
    private tokenChunk: number;
    private systemCandidate: string;
    private systemChoose: string;
    private systemKind: string;
    private systemJoin: string;
    private systemMap: string;
    private systemPart: string;
    private systemCombine: string;
    private systemAnswer: string;

    // Method
    private inputText = (body: modelService.IapiLlmBody, role: string): string => {
        const textList: string[] = [];

        for (let a = 0; a < body.input.length; a++) {
            const input = body.input[a];

            if (input.role !== role) {
                continue;
            }

            if (typeof input.content === "string") {
                textList.push(input.content);
            } else {
                for (let b = 0; b < input.content.length; b++) {
                    const text = input.content[b].text;

                    if (input.content[b].type === "input_text" && text) {
                        textList.push(text);
                    }
                }
            }
        }

        return textList.join("\n");
    };

    private tokenCount = async (model: string, text: string): Promise<modelMapReduce.IresultCount> => {
        return instance.api
            .post<modelService.IapiTokenizeResponse>(
                "/tokenize",
                {
                    headers: {
                        "Content-Type": "application/json"
                    }
                },
                { model, content: text }
            )
            .then((resultApi) => {
                return { count: resultApi.data.tokens.length, message: "" };
            })
            .catch((error: Error) => {
                helperSrc.writeLog("MapReduce.ts - tokenCount() - catch()", error.message);

                return { count: -1, message: error.message };
            });
    };

    private contextSize = async (model: string): Promise<modelMapReduce.IresultCount> => {
        return instance.api
            .get<modelService.IapiPropsResponse>(`/props?model=${encodeURIComponent(model)}`, {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                return { count: resultApi.data.default_generation_settings.n_ctx, message: "" };
            })
            .catch((error: Error) => {
                helperSrc.writeLog("MapReduce.ts - contextSize() - catch()", error.message);

                return { count: -1, message: error.message };
            });
    };

    private eventWrite = (response: Response, eventObject: Record<string, unknown>): void => {
        response.write(`data: ${JSON.stringify(eventObject)}\n\n`);
    };

    private errorWrite = (response: Response, message: string): void => {
        response.end(
            `data: ${JSON.stringify({
                type: "error",
                error: {
                    message
                }
            })}\n\n`
        );
    };

    private progressWrite = (response: Response, text: string): void => {
        this.eventWrite(response, { type: "response.reasoning_text.delta", delta: `${text}\n` });
    };

    private lineList = (chunk: string): string[] => {
        const resultList: string[] = [];

        const chunkLineList = chunk.split("\n");

        for (let a = 0; a < chunkLineList.length; a++) {
            const chunkLine = chunkLineList[a].trim();

            if (chunkLine !== "") {
                resultList.push(chunkLine);
            }
        }

        return resultList;
    };

    private numberedList = (lineList: string[]): string[] => {
        const resultList: string[] = [];

        for (let a = 0; a < lineList.length; a++) {
            resultList.push(`[${a + 1}] ${lineList[a]}`);
        }

        return resultList;
    };

    private chunkNext = (text: string, lengthMax: number): modelMapReduce.Ichunk => {
        const lineList = text.split("\n");

        let chunk = "";
        let indexRest = lineList.length;

        for (let a = 0; a < lineList.length; a++) {
            const chunkNew = chunk === "" ? lineList[a] : `${chunk}\n${lineList[a]}`;

            if (chunkNew.length > lengthMax && chunk !== "") {
                indexRest = a;

                break;
            }

            if (chunkNew.length > lengthMax) {
                const indexSpace = lineList[a].lastIndexOf(" ", lengthMax);
                const indexCut = indexSpace > 0 ? indexSpace : lengthMax;

                chunk = lineList[a].slice(0, indexCut);
                lineList[a] = lineList[a].slice(indexCut).trim();
                indexRest = a;

                break;
            }

            chunk = chunkNew;
        }

        const chunkTrim = chunk.trim();
        const rest = lineList.slice(indexRest).join("\n").trim();

        return { chunk: chunkTrim, rest: this.tableHeaderRepeat(rest, chunkTrim) };
    };

    private tableHeaderRepeat = (rest: string, chunk: string): string => {
        if (!rest.startsWith("|")) {
            return rest;
        }

        const lineList = chunk.split("\n");

        for (let a = lineList.length - 2; a > 0; a--) {
            if (/^\|(\s*-{3,}\s*\|)+$/.test(lineList[a].trim())) {
                const lineHeader = lineList[a - 1].trim();

                if (lineHeader.replace(/[|\s\u200b]/g, "") === "") {
                    return rest;
                }

                for (let b = a + 1; b < lineList.length; b++) {
                    if (!lineList[b].trim().startsWith("|")) {
                        return rest;
                    }
                }

                return `${lineHeader}\n${lineList[a].trim()}\n${rest}`;
            }
        }

        return rest;
    };

    private chunkFit = async (
        model: string,
        promptBuild: (chunk: string) => string,
        tokenBudget: number,
        lengthPerToken: number,
        rest: string
    ): Promise<modelMapReduce.Ichunk | string> => {
        const tokenFixed = await this.tokenCount(model, promptBuild(""));

        if (tokenFixed.count === -1) {
            return tokenFixed.message;
        }

        let lengthMax = Math.floor(Math.min(this.tokenChunk, tokenBudget - tokenFixed.count) * lengthPerToken);
        let chunkObject = this.chunkNext(rest, lengthMax);

        while (true) {
            const tokenPrompt = await this.tokenCount(model, promptBuild(chunkObject.chunk));

            if (tokenPrompt.count === -1) {
                return tokenPrompt.message;
            }

            if (tokenPrompt.count <= tokenBudget) {
                break;
            }

            lengthMax = Math.floor(((lengthMax * tokenBudget) / tokenPrompt.count) * this.chunkShrink);
            chunkObject = this.chunkNext(rest, lengthMax);
        }

        return chunkObject;
    };

    private responseText = async (signal: AbortSignal, model: string, systemPrompt: string, userPrompt: string): Promise<modelMapReduce.IresultText> => {
        return instance.api
            .post<modelMapReduce.IapiChatResponse & modelService.IapiEngineError>(
                "/v1/chat/completions",
                {
                    headers: {
                        "Content-Type": "application/json"
                    },
                    signal
                },
                {
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0,
                    stream: false
                }
            )
            .then((resultApi) => {
                if (resultApi.data.error) {
                    helperSrc.writeLog("MapReduce.ts - responseText() - post()", resultApi.data.error.message);

                    return { text: "", message: resultApi.data.error.message };
                }

                return { text: resultApi.data.choices[0].message.content.trim(), message: "" };
            })
            .catch((error: Error) => {
                helperSrc.writeLog("MapReduce.ts - responseText() - catch()", error.message);

                return { text: "", message: error.message };
            });
    };

    private requestCandidateList = async (
        text: string,
        model: string,
        tokenBudget: number,
        lengthPerToken: number,
        response: Response,
        signal: AbortSignal
    ): Promise<modelMapReduce.Icandidate[] | string> => {
        const candidateList: modelMapReduce.Icandidate[] = [];

        const promptEnd =
            "\n\nNow write ONLY the numbers of the LINES that contain a request of the user to the assistant, separated by commas, or write ONLY NONE if no line contains it.";

        let rest = text;
        let countChunk = 0;

        while (rest !== "") {
            const chunkObject = await this.chunkFit(
                model,
                (chunk) => `${this.systemCandidate}\nLINES:\n${this.numberedList(this.lineList(chunk)).join("\n")}${promptEnd}`,
                tokenBudget,
                lengthPerToken,
                rest
            );

            if (typeof chunkObject === "string") {
                return chunkObject;
            }

            rest = chunkObject.rest;
            countChunk++;

            this.progressWrite(response, `Searching the requests, part ${countChunk}.`);

            const lineList = this.lineList(chunkObject.chunk);

            const resultText = await this.responseText(
                signal,
                model,
                this.systemCandidate,
                `LINES:\n${this.numberedList(lineList).join("\n")}${promptEnd}`
            );

            if (resultText.message !== "") {
                return resultText.message;
            }

            const numberList = resultText.text.match(/\d+/g);

            if (numberList) {
                for (let a = 0; a < numberList.length; a++) {
                    const index = parseInt(numberList[a], 10) - 1;

                    if (lineList[index]) {
                        const contextList = lineList.slice(Math.max(0, index - 1), index + 2);

                        candidateList.push({ text: lineList[index], context: contextList.join("\n") });
                    }
                }
            }
        }

        return candidateList;
    };

    private requestChoose = async (candidateList: modelMapReduce.Icandidate[], model: string, signal: AbortSignal): Promise<string[] | string> => {
        const requestList: string[] = [];

        for (let a = 0; a < candidateList.length; a++) {
            const resultText = await this.responseText(
                signal,
                model,
                this.systemChoose,
                `CONTEXT:\n${candidateList[a].context}\n\nLINE:\n${candidateList[a].text}\n\nWho is the LINE addressed to? Answer ONLY ASSISTANT or OTHER.`
            );

            if (resultText.message !== "") {
                return resultText.message;
            }

            if (resultText.text.replace(/\.$/, "").trim().toUpperCase() === "ASSISTANT" && !requestList.includes(candidateList[a].text)) {
                requestList.push(candidateList[a].text);
            }
        }

        return requestList;
    };

    private kindFind = async (signal: AbortSignal, model: string, question: string): Promise<modelMapReduce.IresultText> => {
        return this.responseText(signal, model, this.systemKind, `QUESTION:\n${question}`);
    };

    private partBuild = async (
        text: string,
        model: string,
        systemPrompt: string,
        label: string,
        question: string,
        tokenBudget: number,
        lengthPerToken: number,
        response: Response,
        numberQuestion: number,
        countQuestion: number,
        signal: AbortSignal,
        isWrite: boolean
    ): Promise<string[] | string> => {
        const partList: string[] = [];

        let rest = text;
        let countPart = 0;

        while (rest !== "") {
            const chunkObject = await this.chunkFit(
                model,
                (chunk) => `${systemPrompt}\n${label}:\n${chunk}\n\nQUESTION:\n${question}`,
                tokenBudget,
                lengthPerToken,
                rest
            );

            if (typeof chunkObject === "string") {
                return chunkObject;
            }

            rest = chunkObject.rest;
            countPart++;

            this.progressWrite(response, `Writing for the request ${numberQuestion} of ${countQuestion}, part ${countPart}.`);

            const resultText = await this.responseText(signal, model, systemPrompt, `${label}:\n${chunkObject.chunk}\n\nQUESTION:\n${question}`);

            if (resultText.message !== "") {
                return resultText.message;
            }

            if (resultText.text !== "NONE") {
                if (isWrite) {
                    const delta = partList.length > 0 ? `\n\n${resultText.text}` : resultText.text;

                    this.eventWrite(response, { type: "response.output_text.delta", delta });
                }

                partList.push(resultText.text);
            }
        }

        return partList;
    };

    private mapBuild = async (
        question: string,
        content: string,
        model: string,
        tokenBudget: number,
        lengthPerToken: number,
        response: Response,
        numberQuestion: number,
        countQuestion: number,
        signal: AbortSignal
    ): Promise<modelMapReduce.IresultMap> => {
        const mapList: string[] = [];

        const promptUser = `QUESTION OF THE USER (only to know which lines are needed, you MUST NOT answer it):\n${question}\n\nLINES:\n`;
        const promptEnd =
            "\n\nCheck each line against the QUESTION, then write ONLY the numbers of the LINES that contain information needed to answer the QUESTION, separated by commas. If you choose a row of a table, ALSO write the number of the header row of that table when it is in LINES. Write ONLY NONE if no line contains the information.";

        let rest = content;
        let countChunk = 0;

        while (rest !== "") {
            const chunkObject = await this.chunkFit(
                model,
                (chunk) => `${this.systemMap}\n${promptUser}${this.numberedList(this.lineList(chunk)).join("\n")}${promptEnd}`,
                tokenBudget,
                lengthPerToken,
                rest
            );

            if (typeof chunkObject === "string") {
                return { map: "", message: chunkObject };
            }

            rest = chunkObject.rest;
            countChunk++;

            this.progressWrite(response, `Reading for the request ${numberQuestion} of ${countQuestion}, part ${countChunk}.`);

            const lineList = this.lineList(chunkObject.chunk);

            const resultText = await this.responseText(
                signal,
                model,
                this.systemMap,
                `${promptUser}${this.numberedList(lineList).join("\n")}${promptEnd}`
            );

            if (resultText.message !== "") {
                return { map: "", message: resultText.message };
            }

            const numberList: number[] = [];

            const numberTextList = resultText.text.match(/\d+/g);

            if (numberTextList) {
                for (let a = 0; a < numberTextList.length; a++) {
                    numberList.push(parseInt(numberTextList[a], 10));
                }
            }

            numberList.sort((a, b) => a - b);

            for (let a = 0; a < numberList.length; a++) {
                const line = lineList[numberList[a] - 1];

                if (line && !mapList.includes(line)) {
                    mapList.push(line);
                }
            }
        }

        return { map: mapList.join("\n"), message: "" };
    };

    private reduceFit = async (
        map: string,
        model: string,
        systemClient: string,
        question: string,
        tokenBudget: number,
        lengthPerToken: number,
        response: Response,
        numberQuestion: number,
        countQuestion: number,
        signal: AbortSignal
    ): Promise<modelMapReduce.IresultReduce> => {
        let mapCurrent = map;
        let isCombine = false;

        while (true) {
            const systemPrompt = isCombine ? this.systemCombine : this.systemAnswer;

            const tokenMap = await this.tokenCount(model, `${systemPrompt}\n${systemClient}\n${mapCurrent}\n${question}`);

            if (tokenMap.count === -1) {
                return { map: "", isCombine, message: tokenMap.message };
            }

            if (tokenMap.count <= tokenBudget) {
                return { map: mapCurrent, isCombine, message: "" };
            }

            const partList = await this.partBuild(
                mapCurrent,
                model,
                this.systemPart,
                "MEMORY",
                question,
                tokenBudget,
                lengthPerToken,
                response,
                numberQuestion,
                countQuestion,
                signal,
                false
            );

            if (typeof partList === "string") {
                return { map: "", isCombine, message: partList };
            }

            const mapList: string[] = [];

            for (let a = 0; a < partList.length; a++) {
                mapList.push(`PART ${a + 1}\n${partList[a]}`);
            }

            const mapNext = mapList.join("\n\n");

            if (mapNext.length >= mapCurrent.length) {
                return {
                    map: "",
                    isCombine,
                    message: `The information needed for the request "${question}" is too large to be answered: please ask a more specific question.`
                };
            }

            mapCurrent = mapNext;
            isCombine = true;
        }
    };

    private answerStream = async (
        model: string,
        systemPrompt: string,
        systemClient: string,
        map: string,
        question: string,
        signal: AbortSignal,
        response: Response
    ): Promise<modelMapReduce.IresultText> => {
        const body: modelService.IapiLlmBody = {
            stream: true,
            model,
            input: [
                {
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text: `${systemPrompt}\n\nThe following instructions come from the application and you MUST follow them too; where they talk about the content of the request (for example DOCUMENT or CITATION), that content is now in MEMORY:\n${systemClient}`
                        }
                    ]
                },
                {
                    role: "user",
                    content: [{ type: "input_text", text: `MEMORY:\n${map}\n\nQUESTION:\n${question}` }]
                }
            ],
            tools: [],
            temperature: 0
        };

        return instance.api
            .stream(
                "/v1/responses",
                {
                    headers: {
                        "Content-Type": "application/json"
                    },
                    signal
                },
                body
            )
            .then(async (resultApi) => {
                const decoder = new TextDecoder("utf-8");

                let buffer = "";
                let text = "";

                while (true) {
                    const { value, done } = await resultApi.read();

                    if (done) {
                        const bufferTrim = buffer.trim();

                        if (bufferTrim !== "" && helperSrc.jsonCheck(bufferTrim)) {
                            const bufferObject = JSON.parse(bufferTrim) as modelService.IapiEngineError;

                            if (bufferObject.error) {
                                helperSrc.writeLog("MapReduce.ts - answerStream() - stream()", bufferObject.error.message);

                                return { text, message: bufferObject.error.message };
                            }
                        }

                        return { text, message: "" };
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const bufferSplit = buffer.split(/\r?\n/);
                    buffer = bufferSplit.pop() as string;

                    for (let a = 0; a < bufferSplit.length; a++) {
                        const line = bufferSplit[a];

                        if (!line.startsWith("data:")) {
                            continue;
                        }

                        const lineSlice = line.slice(5).trim();

                        if (!helperSrc.jsonCheck(lineSlice)) {
                            continue;
                        }

                        const lineObject = JSON.parse(lineSlice) as modelMapReduce.IapiStreamResponse;

                        if (lineObject.type === "response.output_text.delta" && lineObject.delta) {
                            text += lineObject.delta;

                            this.eventWrite(response, { type: "response.output_text.delta", delta: lineObject.delta });
                        }
                    }
                }
            })
            .catch((error: Error) => {
                helperSrc.writeLog("MapReduce.ts - answerStream() - catch()", error.message);

                return { text: "", message: error.message };
            });
    };

    constructor() {
        this.tokenReserve = 1536;
        this.chunkShrink = 0.9;
        this.tokenChunk = 2048;

        this.systemCandidate = [
            "You read numbered LINES of a message that a user sent to an assistant.",
            "The message is made of the requests of the user to the assistant and of a content (pasted text, document or other) that the requests talk about.",
            "A request of the user is a question or an instruction that the user writes to the assistant about the content: for example asking for a fact, an amount, a name, a list, a total or a summary. The requests are usually written on their own lines, before or after the content, in any language.",
            "A sentence that only describes or introduces the content (for example saying what a report or a table contains) is NOT a request of the user.",
            "The content can contain its own titles, questions and instructions written by its author for other readers (for example a polite request to confirm or to pay written in an invoice or a letter): they are NOT requests of the user, but their presence does NOT cancel the requests of the user that are on other lines.",
            "You MUST check EVERY line by itself and find every line that contains a request of the user to the assistant.",
            "You MUST write ONLY the numbers of those lines separated by commas, or ONLY NONE if no line contains a request of the user."
        ].join("\n");

        this.systemChoose = [
            "You receive a LINE found in a message that a user sent to an assistant, with the CONTEXT of the lines around it.",
            "The message contains the requests of the user to the assistant plus a content (pasted text, document or other) written by other people.",
            "You MUST tell who the LINE is addressed to:",
            "- ASSISTANT: the user asks the assistant something about the content: a question about a fact of the content (who, what, when, where, how much, how many), or an instruction to find, list, sort, count, compare, summarize or translate something. The content usually contains the answer: this is normal and it does NOT make the line part of the content.",
            "- OTHER: the line is part of the content: a title or a heading of the document, a sentence that describes or introduces the document or its tables, a sentence addressed to a named person, to the readers or to the recipient of the document (for example a polite request to confirm, to pay or to remit written in an invoice or a letter), a line inside quotation marks, a line of an email, a FAQ, an exercise, a quiz, a riddle, a dialogue or a story, or a rhetorical question.",
            "You MUST answer ONLY with the word ASSISTANT or the word OTHER."
        ].join("\n");

        this.systemKind = [
            "You receive the QUESTION that a user wrote to an assistant about a document.",
            "You MUST tell what the user wants to receive as answer:",
            "- WHOLE: the user wants to receive the ENTIRE document written again from the first line to the last, in another form: translated into another language, copied, rewritten in another style, corrected or converted to another format. The QUESTION talks about the whole document or text, not about one item, one value, one section or one paragraph of it.",
            "- ANSWER: every other case. The user wants to know something that is written in the document (a value, a name, a date, a place, an amount, the data of one item), or wants a summary, a list, a count, a total, a comparison, a yes or no, or wants to transform only one piece of the document (for example one section or one paragraph).",
            "A QUESTION that asks what, which, who, where, when, how much or how many is ALWAYS ANSWER, in any language.",
            "You MUST answer ONLY with the word WHOLE or the word ANSWER."
        ].join("\n");

        this.systemJoin = [
            "You receive a PART of a long document and the QUESTION of the user, which asks to transform or to write again the whole document (for example to translate it).",
            "The other parts are processed separately with the same QUESTION and the results are written one after the other, so your result MUST be only the transformed PART.",
            "How to work:",
            "- Do what the QUESTION asks on EVERY line of the PART, from the first to the last, in the same order: you MUST NOT skip, shorten or summarize anything.",
            "- Keep the structure of the PART: the titles stay titles with the same number of #, the tables stay tables with the same rows and columns, the lists stay lists, the empty lines stay where they are.",
            "- Numbers, dates, codes and references between square brackets MUST be copied character by character.",
            "- You MUST NOT add introductions, comments, notes or conclusions, and you MUST NOT say that the text is a part.",
            "You MUST write ONLY the transformed PART."
        ].join("\n");

        this.systemMap = [
            "You are a selector: you read numbered LINES of a document and choose the lines that will be used later, without the rest of the document, to answer the QUESTION of the user.",
            "You MUST NOT answer the QUESTION: you only choose lines. Whoever answers later will see ONLY the lines you choose, so every fact needed for the answer MUST be inside a chosen line.",
            "How to choose:",
            "- Read the QUESTION and understand exactly which facts are needed (names, numbers, dates, how many items).",
            "- Choose the lines that CONTAIN those facts, not the lines that only announce them: a title or a heading alone does not contain facts, so when the facts are in the lines after a title you MUST choose those lines.",
            "- When the QUESTION names a specific item (for example a code, a name or a date), a line is needed ONLY when it contains that item written exactly the same way: a similar code or a similar name is a different item. If no line in these LINES contains that item, these LINES do not contain the facts and you MUST write ONLY NONE.",
            "- When the facts are in a table, choose every row that contains a needed item and ALSO the header row of that table, because whoever answers cannot know what a value means without it. The header row is the line just before the line made of | --- |. When the QUESTION asks for a number of items (for example the first five) count the rows and make sure that all of them are chosen.",
            "- When the QUESTION asks for a list of all the items of a kind, choose every line that contains at least one of those items.",
            "- A document converted from a PDF or an image can split one item over consecutive lines (for example a name that continues on the next line, or a name on one line and its date on the next one): when a chosen line is only a part of an item, you MUST also choose the lines before and after it that complete that item.",
            "- The content can be made of more documents, each one introduced by a line that names it (for example a file name between square brackets): you MUST ALWAYS choose every line that names a document, even when nothing else of that document is chosen in these LINES, because it keeps every fact linked to the document it comes from.",
            "- Do NOT choose lines that do not contain facts needed for the answer.",
            "Before writing, check again that the chosen lines contain ALL the facts needed to answer the QUESTION completely.",
            "You MUST write ONLY the numbers of the chosen lines separated by commas, or ONLY NONE if no line contains facts needed to answer the QUESTION."
        ].join("\n");

        const answerStartList = [
            "You answer the QUESTION of the user using ONLY the information in MEMORY.",
            "MEMORY contains lines taken from one or more documents that contain the facts to answer the QUESTION; the lines can contain much more than what is asked.",
            "When MEMORY contains lines that name a document (for example a file name between square brackets), every fact belongs to the last document named before it: you MUST use this to know which document each fact comes from and you MUST NOT mix the facts of different documents.",
            "How to answer:",
            "- Write a short and direct answer that contains ONLY what the QUESTION asks: you MUST NOT copy the lines of MEMORY, you MUST extract from them only the needed facts.",
            '- When the QUESTION asks for a list, write the list with EXACTLY one item per line, each line starting with "- " and containing only that item and its requested details; you MUST NOT write the items inside a sentence or a paragraph, you MUST NOT group them under other names (for example regions) and you MUST NOT add lines that are not items.',
            "- When the QUESTION asks for a number of items (for example the first five) write exactly that number of items.",
            "- Every name, number and date MUST come from MEMORY and MUST be written with the same spelling and accents used in MEMORY; you MUST NOT use your own knowledge.",
            "- Numbers and amounts MUST be copied character by character from MEMORY, exactly as they are written there: you MUST NOT add, remove or change digit groups, thousands separators, decimal separators, spaces, units or currency symbols, even when the language of the answer normally writes numbers in another way. A number written without separators stays without separators, a number written with separators keeps the same separators, and you MUST NOT insert spaces inside a number or between a number and the characters attached to it.",
            "- When the QUESTION names a specific item (for example a code, a name or a date) and MEMORY has more lines or rows, use ONLY the line or row that contains that whole item written exactly the same way: a line where only a part of the item appears, for example the same number in another column, is about a different item.",
            "- MEMORY can come from a document converted from a PDF or an image, where one item can be split over consecutive lines (for example a name that continues on the next line): you MUST join those parts and write the item complete, without losing any item.",
            "- When the QUESTION can refer to more than one value of MEMORY (for example an amount and the tax on that amount), choose the value whose label in MEMORY corresponds best to the words of the QUESTION; if it is still ambiguous, write every possible value together with its label as written in MEMORY.",
            "- When the QUESTION asks for a calculation (for example a sum, a difference, an average or a percentage), first write every value taken from MEMORY with the document it comes from, then the operation written with those values, then the result: the result is the only number that is not copied from MEMORY, and you MUST compute it step by step and check it before writing it.",
        ];

        const answerMissing =
            "- When the information needed to answer the QUESTION, or a part of it, is NOT in MEMORY, write that the document does not contain it and do NOT complete it yourself.";

        const answerEndList = [
            "- Reply in the same language of the QUESTION; only the words follow the language of the QUESTION, the numbers stay exactly as they are written in MEMORY.",
            "Before writing the answer, check that every number in it is identical, character by character, to the same number in MEMORY."
        ];

        this.systemAnswer = [...answerStartList, answerMissing, ...answerEndList].join("\n");

        this.systemPart = [
            ...answerStartList,
            ...answerEndList,
            "IMPORTANT: MEMORY is only ONE PART of the information; the other parts are read separately with the same QUESTION and the answers of all the parts are put together later by someone else.",
            "You MUST answer the QUESTION ONLY for what this part contains, completely, without talking about the parts: you MUST NOT write that the information is partial or that something is missing.",
            "When this part contains nothing that is needed for the QUESTION, you MUST write ONLY NONE."
        ].join("\n");

        this.systemCombine = [
            this.systemAnswer,
            "IMPORTANT: here MEMORY contains the answers that were already given to the same QUESTION on each part of a long document, in the order of the document, each one introduced by a line PART and its number.",
            "You MUST write one answer to the QUESTION for the whole document using all the parts: when the QUESTION asks for a count or a total you MUST add the values of all the parts, when it asks for a list you MUST write the items of all the parts once, when it asks for a summary you MUST write one summary that covers all the parts.",
            "You MUST NOT talk about the parts in the answer."
        ].join("\n");
    }

    execute = async (body: modelService.IapiLlmBody, response: Response, signal: AbortSignal): Promise<boolean> => {
        const systemClient = this.inputText(body, "system");
        const text = this.inputText(body, "user");

        const tokenInput = await this.tokenCount(body.model, `${systemClient}\n${text}`);
        const contextSize = await this.contextSize(body.model);

        if (tokenInput.count === -1 || contextSize.count === -1) {
            this.errorWrite(response, "Engine not available.");

            return true;
        }

        const tokenBudget = contextSize.count - this.tokenReserve;

        if (tokenInput.count <= tokenBudget) {
            return false;
        }

        const tokenText = await this.tokenCount(body.model, text);

        if (tokenText.count === -1) {
            this.errorWrite(response, "Engine not available.");

            return true;
        }

        const lengthPerToken = text.length / tokenText.count;

        const candidateList = await this.requestCandidateList(text, body.model, tokenBudget, lengthPerToken, response, signal);

        if (typeof candidateList === "string") {
            this.errorWrite(response, candidateList);

            return true;
        }

        const requestList = await this.requestChoose(candidateList, body.model, signal);

        if (typeof requestList === "string") {
            this.errorWrite(response, requestList);

            return true;
        }

        if (requestList.length === 0) {
            this.errorWrite(response, "No request found in the message.");

            return true;
        }

        let content = text;

        for (let a = 0; a < requestList.length; a++) {
            content = content.replace(requestList[a], "");
        }

        content = content.trim();

        let answerText = "";

        for (let a = 0; a < requestList.length; a++) {
            if (signal.aborted) {
                return true;
            }

            const resultKind = await this.kindFind(signal, body.model, requestList[a]);

            if (resultKind.message !== "") {
                this.errorWrite(response, resultKind.message);

                return true;
            }

            let header = a > 0 ? "\n\n" : "";

            if (requestList.length > 1) {
                header += `${requestList[a]}\n`;
            }

            if (resultKind.text === "WHOLE") {
                if (header !== "") {
                    answerText += header;

                    this.eventWrite(response, { type: "response.output_text.delta", delta: header });
                }

                const partList = await this.partBuild(
                    content,
                    body.model,
                    this.systemJoin,
                    "PART",
                    requestList[a],
                    tokenBudget,
                    lengthPerToken,
                    response,
                    a + 1,
                    requestList.length,
                    signal,
                    true
                );

                if (typeof partList === "string") {
                    this.errorWrite(response, partList);

                    return true;
                }

                answerText += partList.join("\n\n");
            } else {
                const resultMap = await this.mapBuild(
                    requestList[a],
                    content,
                    body.model,
                    tokenBudget,
                    lengthPerToken,
                    response,
                    a + 1,
                    requestList.length,
                    signal
                );

                if (resultMap.message !== "") {
                    this.errorWrite(response, resultMap.message);

                    return true;
                }

                const resultReduce = await this.reduceFit(
                    resultMap.map,
                    body.model,
                    systemClient,
                    requestList[a],
                    tokenBudget,
                    lengthPerToken,
                    response,
                    a + 1,
                    requestList.length,
                    signal
                );

                if (resultReduce.message !== "") {
                    this.errorWrite(response, resultReduce.message);

                    return true;
                }

                if (header !== "") {
                    answerText += header;

                    this.eventWrite(response, { type: "response.output_text.delta", delta: header });
                }

                const resultAnswer = await this.answerStream(
                    body.model,
                    resultReduce.isCombine ? this.systemCombine : this.systemAnswer,
                    systemClient,
                    resultReduce.map,
                    requestList[a],
                    signal,
                    response
                );

                if (resultAnswer.message !== "") {
                    this.errorWrite(response, resultAnswer.message);

                    return true;
                }

                answerText += resultAnswer.text;
            }
        }

        response.end(
            `data: ${JSON.stringify({
                type: "response.completed",
                response: {
                    output: [
                        {
                            content: [
                                {
                                    type: "output_text",
                                    text: answerText
                                }
                            ]
                        }
                    ]
                }
            })}\n\n`
        );

        return true;
    };
}

type Token = number | "(" | ")" | "+" | "-" | "*" | "/" | "^";

function isDigit(ch: string) {
    return ch >= "0" && ch <= "9";
}

function isUnaryMinus(expr: string, i: number, lastType: "number" | "operator" | "lparen" | "rparen" | null) {
    if (expr[i] !== "-") return false;
    const atStart = lastType === null;
    const afterOp = lastType === "operator" || lastType === "lparen";
    const next = expr[i + 1];
    const nextIsNumChar = next === "." || (next >= "0" && next <= "9");
    return (atStart || afterOp) && nextIsNumChar;
}

function isOp(x: Token) {
    return x === "+" || x === "-" || x === "*" || x === "/" || x === "^";
}

export function tokenize(expr: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    let lastType: "number" | "operator" | "lparen" | "rparen" | null = null;

    while (i < expr.length) {
        const c = expr[i];

        // spazi
        if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            i++;
            continue;
        }

        // numero (decimali) e meno unario come segno
        if (isDigit(c) || c === "." || isUnaryMinus(expr, i, lastType)) {
            const start = i;

            if (expr[i] === "-" && isUnaryMinus(expr, i, lastType)) {
                i++;
            }

            let sawDigit = false;
            while (i < expr.length && (isDigit(expr[i]) || expr[i] === ".")) {
                if (isDigit(expr[i])) sawDigit = true;
                i++;
            }
            if (!sawDigit) throw new Error("Invalid number at position " + start);

            const num = Number(expr.slice(start, i));
            if (!Number.isFinite(num)) throw new Error("Invalid numeric literal");

            out.push(num);
            lastType = "number";
            continue;
        }

        // operatori
        if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
            out.push(c as Token);
            i++;
            lastType = "operator";
            continue;
        }

        // parentesi
        if (c === "(") {
            out.push("(");
            i++;
            lastType = "lparen";
            continue;
        }
        if (c === ")") {
            out.push(")");
            i++;
            lastType = "rparen";
            continue;
        }

        throw new Error("Unsupported character: " + c);
    }

    return out;
}

export function toRPN(tokens: Token[]): Token[] {
    const output: Token[] = [];
    const stack: Token[] = [];

    const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
    const rightAssoc: Record<string, boolean> = { "^": true };

    for (const t of tokens) {
        if (typeof t === "number") {
            output.push(t);
            continue;
        }

        if (t === "+" || t === "-" || t === "*" || t === "/" || t === "^") {
            while (
                stack.length &&
                isOp(stack[stack.length - 1]) &&
                ((rightAssoc[t] !== true && prec[t] <= prec[stack[stack.length - 1] as string]) ||
                    (rightAssoc[t] === true && prec[t] < prec[stack[stack.length - 1] as string]))
            ) {
                output.push(stack.pop() as Token);
            }
            stack.push(t);
            continue;
        }

        if (t === "(") {
            stack.push(t);
            continue;
        }

        if (t === ")") {
            while (stack.length && stack[stack.length - 1] !== "(") {
                output.push(stack.pop() as Token);
            }
            if (!stack.length) throw new Error("Mismatched parentheses");
            stack.pop(); // rimuove "("
            continue;
        }

        throw new Error("Unsupported token in shunting-yard: " + String(t));
    }

    while (stack.length) {
        const s = stack.pop() as Token;
        if (s === "(" || s === ")") throw new Error("Mismatched parentheses");
        output.push(s);
    }

    return output;
}

export function evalRPN(rpn: Token[]): number {
    const stack: number[] = [];
    for (const t of rpn) {
        if (typeof t === "number") {
            stack.push(t);
            continue;
        }

        const b = stack.pop() as number;
        const a = stack.pop() as number;
        if (typeof a !== "number" || typeof b !== "number") {
            throw new Error("Invalid expression (insufficient operands)");
        }

        if (t === "+") stack.push(a + b);
        else if (t === "-") stack.push(a - b);
        else if (t === "*") stack.push(a * b);
        else if (t === "/")
            stack.push(a / b); // divisione per zero -> Infinity in JS
        else if (t === "^") stack.push(Math.pow(a, b));
        else throw new Error("Unknown operator: " + String(t));
    }

    if (stack.length !== 1) throw new Error("Invalid expression (remaining operands)");
    return stack[0];
}

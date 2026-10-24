/** Tokenizer for the small PureStep functional language. */
import { syntaxError } from "./ast";

export type TokenKind =
  | "int" | "ident" | "lambda" | "arrow" | "plus" | "minus" | "star" | "equals"
  | "lparen" | "rparen" | "lbracket" | "rbracket" | "comma" | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

const SINGLE_CHAR_TOKENS: ReadonlyMap<string, TokenKind> = new Map([
  ["\\", "lambda"], ["+", "plus"], ["*", "star"], ["=", "equals"],
  ["(", "lparen"], [")", "rparen"], ["[", "lbracket"], ["]", "rbracket"], [",", "comma"],
]);
const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c) || c === "'";
const isWhitespace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  const advance = (): void => {
    if (source.charAt(offset) === "\n") { line += 1; column = 1; }
    else column += 1;
    offset += 1;
  };
  const readWhile = (predicate: (c: string) => boolean): string => {
    const start = offset;
    while (offset < source.length && predicate(source.charAt(offset))) advance();
    return source.slice(start, offset);
  };

  while (offset < source.length) {
    const ch = source.charAt(offset);
    if (isWhitespace(ch)) { advance(); continue; }
    const start = { offset, line, column };

    if (isDigit(ch)) {
      const digits = readWhile(isDigit);
      const next = source.charAt(offset);
      if (isIdentStart(next)) {
        const rest = readWhile(isIdentPart);
        throw syntaxError(`'${digits}${rest}' is not valid: names cannot start with a digit, and numbers cannot contain letters.`, start.line, start.column);
      }
      if (!Number.isSafeInteger(Number(digits))) {
        throw syntaxError(`The number ${digits} is too large (maximum ${Number.MAX_SAFE_INTEGER}).`, start.line, start.column);
      }
      tokens.push({ kind: "int", text: digits, ...start });
      continue;
    }
    if (isIdentStart(ch)) {
      tokens.push({ kind: "ident", text: readWhile(isIdentPart), ...start });
      continue;
    }
    if (ch === "-") {
      if (source.charAt(offset + 1) === ">") {
        advance(); advance(); tokens.push({ kind: "arrow", text: "->", ...start });
      } else {
        advance(); tokens.push({ kind: "minus", text: "-", ...start });
      }
      continue;
    }
    const kind = SINGLE_CHAR_TOKENS.get(ch);
    if (kind !== undefined) {
      advance(); tokens.push({ kind, text: ch, ...start }); continue;
    }
    if (ch === "/" || ch === "%") {
      throw syntaxError(`Operator '${ch}' is not supported. Use +, -, or * for arithmetic.`, line, column);
    }
    throw syntaxError(`Unexpected character '${ch}'.`, line, column);
  }
  tokens.push({ kind: "eof", text: "", offset, line, column });
  return tokens;
}

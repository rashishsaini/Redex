/** Recursive-descent parser for the supported Haskell-like syntax. */
import type { Expr } from "./ast";
import { apply, binary, intLit, lambda, letBinding, listLit, negate, syntaxError, variable } from "./ast";
import type { Token, TokenKind } from "./tokenizer";
import { tokenize } from "./tokenizer";

const FALLBACK_EOF: Token = { kind: "eof", text: "", offset: 0, line: 1, column: 1 };
const EXAMPLE = "map (\\x -> x * 2) [1, 2, 3, 4]";

function describeToken(t: Token): string {
  if (t.kind === "eof") return "the end of the program";
  if (t.kind === "int") return `the number ${t.text}`;
  if (t.kind === "ident") return `the name '${t.text}'`;
  return `'${t.text}'`;
}
const isKeyword = (t: Token, word: string) => t.kind === "ident" && t.text === word;
function startsAtom(t: Token): boolean {
  return t.kind === "int" || t.kind === "lparen" || t.kind === "lbracket" ||
    (t.kind === "ident" && t.text !== "in" && t.text !== "let");
}

export function parse(source: string): Expr {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = (): Token => tokens[pos] ?? tokens[tokens.length - 1] ?? FALLBACK_EOF;
  const consume = (): Token => { const token = peek(); if (token.kind !== "eof") pos += 1; return token; };
  const fail = (t: Token, message: string): never => { throw syntaxError(message, t.line, t.column); };
  const expect = (kind: TokenKind, message: string): Token => {
    const token = peek();
    if (token.kind !== kind) return fail(token, `${message} Found ${describeToken(token)}.`);
    return consume();
  };

  function parseExpr(): Expr {
    if (peek().kind === "lambda") return parseLambda();
    if (isKeyword(peek(), "let")) return parseLet();
    return parseSum();
  }

  function parseLambda(): Expr {
    consume(); // lambda slash
    const params: string[] = [];
    while (peek().kind === "ident" && !isKeyword(peek(), "in") && !isKeyword(peek(), "let")) {
      params.push(consume().text);
    }
    if (params.length === 0) return fail(peek(), "Expected at least one parameter after '\\'. Example: \\x -> x * 2.");
    expect("arrow", `Expected '->' after parameter${params.length === 1 ? "" : "s"} ${params.join(", ")}.`);
    let body = parseExpr();
    // Haskell-style multi-parameter lambdas are curried nested functions.
    for (let i = params.length - 1; i >= 0; i -= 1) {
      const param = params[i];
      if (param !== undefined) body = lambda(param, body);
    }
    return body;
  }

  function parseLet(): Expr {
    consume(); // let
    const nameToken = expect("ident", "Expected a variable name after 'let'.");
    if (nameToken.text === "in" || nameToken.text === "let") return fail(nameToken, `'${nameToken.text}' is reserved and cannot be used as a variable name.`);
    expect("equals", `Expected '=' after let variable '${nameToken.text}'.`);
    const value = parseExpr();
    if (!isKeyword(peek(), "in")) return fail(peek(), `Expected 'in' after the value of '${nameToken.text}'.`);
    consume();
    const body = parseExpr();
    return letBinding(nameToken.text, value, body);
  }

  function parseSum(): Expr {
    let left = parseProduct();
    while (peek().kind === "plus" || peek().kind === "minus") {
      const operator = consume();
      if (peek().kind === "eof") return fail(operator, `Expected an expression after '${operator.text}'.`);
      left = binary(operator.kind === "plus" ? "+" : "-", left, parseProduct());
    }
    return left;
  }

  function parseProduct(): Expr {
    let left = parseApplication();
    while (peek().kind === "star") {
      const operator = consume();
      if (peek().kind === "eof") return fail(operator, "Expected an expression after '*'.");
      left = binary("*", left, parseApplication());
    }
    return left;
  }

  function parseApplication(): Expr {
    let expression = parseUnary();
    while (startsAtom(peek())) expression = apply(expression, parseAtom());
    if (peek().kind === "lambda") {
      return fail(peek(), `A lambda must be parenthesized when passed as an argument, for example: ${EXAMPLE}`);
    }
    return expression;
  }

  function parseUnary(): Expr {
    if (peek().kind === "minus") {
      consume();
      if (peek().kind === "eof") return fail(peek(), "Expected an expression after unary '-'.");
      return negate(parseUnary());
    }
    return parseAtom();
  }

  function parseAtom(): Expr {
    const token = peek();
    switch (token.kind) {
      case "int": consume(); return intLit(Number(token.text));
      case "ident":
        if (token.text === "in") return fail(token, "'in' is only valid in a let expression.");
        if (token.text === "let") return fail(token, "A let expression must follow the form: let x = value in body.");
        consume(); return variable(token.text);
      case "lparen": {
        consume();
        const inner = parseExpr();
        expectClose("rparen", token);
        return inner;
      }
      case "lbracket": return parseList();
      case "lambda": return fail(token, `A lambda must be parenthesized when used as an argument, for example: ${EXAMPLE}`);
      default: return fail(token, `Expected an expression but found ${describeToken(token)}.`);
    }
  }

  function expectClose(kind: TokenKind, open: Token): void {
    const token = peek();
    if (token.kind === kind) { consume(); return; }
    const closer = open.kind === "lparen" ? ")" : "]";
    fail(token, `Expected '${closer}' to close the '${open.text}' opened at line ${open.line}, column ${open.column}.`);
  }

  function parseList(): Expr {
    const open = consume(); // '['
    const items: Expr[] = [];
    if (peek().kind !== "rbracket") {
      items.push(parseExpr());
      while (peek().kind === "comma") {
        const comma = consume();
        if (peek().kind === "rbracket") return fail(comma, "Unexpected trailing comma before ']'.");
        items.push(parseExpr());
      }
    }
    expectClose("rbracket", open);
    return listLit(items);
  }

  if (peek().kind === "eof") return fail(peek(), `The program is empty. Try ${EXAMPLE}.`);
  const program = parseExpr();
  const rest = peek();
  if (rest.kind !== "eof") {
    if (rest.kind === "rparen") return fail(rest, "Unmatched ')': there is no '(' to close.");
    if (rest.kind === "rbracket") return fail(rest, "Unmatched ']': there is no '[' to close.");
    if (rest.kind === "comma") return fail(rest, "Unexpected ',': commas only separate list items.");
    if (rest.kind === "arrow") return fail(rest, "Unexpected '->': it must follow a lambda parameter.");
    if (isKeyword(rest, "in")) return fail(rest, "Unexpected 'in': it must follow a let binding value.");
    return fail(rest, `Unexpected ${describeToken(rest)}.`);
  }
  return program;
}

# Redex

Redex is a visual interpreter for a deliberately small Haskell-like functional language. It shows intermediate reductions, the progress of `map`, and the accumulator updates of `foldl`.

## Run locally

Requires Node.js 20.19+ (Node 22 recommended).

```bash
npm install
npm run dev
```

Other commands:

```bash
npm run build       # TypeScript check + production Vite build
npm run test        # Compile and run the engine regression checks
npm run typecheck   # TypeScript check only
npm run preview     # Serve the production build
```

## Supported syntax

- Integer literals, including negative integers
- Arithmetic: `+`, `-`, `*` with conventional precedence and parentheses
- Lists, including `[]`
- `let name = value in body` bindings (strict/call-by-value)
- Anonymous functions: `\x -> ...`; multi-parameter syntax such as `\acc x -> ...` is treated as curried lambdas
- Function application
- `map function list`
- `foldl function initialAccumulator list`

Examples to paste into the editor:

```haskell
(2 + 3) * 4
let x = 5 in x * 2
map (\x -> x * 2) [1, 2, 3, 4]
foldl (\acc x -> acc + x) 0 [1, 2, 3]
let xs = [1, 2, 3] in foldl (\acc x -> acc + x) 0 (map (\x -> x * 2) xs)
```

The interpreter implements a small-step, left-to-right, call-by-value evaluation strategy. Every Next Step performs at most one reduction: a variable substitution, arithmetic operation, function application, or an internal `map`/`foldl` transition. Previous Step replays the stored previous snapshot; Reset returns to the initial state. A 5,000-step limit guards against non-terminating programs.

This is an educational subset, not a full Haskell implementation. It does not currently implement division, booleans, conditionals, pattern matching, recursive `let`, or all Haskell syntax.

## Architecture

```text
src/
  engine/
    ast.ts            AST nodes, immutable constructors, free variables, substitution
    tokenizer.ts      Source-to-token conversion and source positions
    parser.ts         Recursive-descent parser
    prettyPrint.ts    Source-like expression printer and active reduction focus
    reducer.ts        Small-step evaluator and map/fold visualization traces
    index.ts          Execution session, immutable state history, step limit
    contract.ts       Public UI/engine data contract
    selfCheck.ts      Engine acceptance/regression checks
  hooks/useExecution.ts
                      Owns the session and Run All timer
  components/         Existing React rendering components
  styles.css          Existing styling, retained with minimal accumulator support
```

The engine remains separate from React rendering. `ExecutionView` exposes the current expression, explanation, step count, Input/Output state, current `map`/`foldl` visualization mode, and the printed fold accumulator.

## Tests

`npm run test` runs `src/engine/selfCheck.ts`. The checks cover the requested acceptance examples, arithmetic precedence, let/function behavior, empty lists, map output commits, fold accumulator updates, active input state, nested map-to-fold execution, exact history replay, reset, runtime/syntax errors, and the infinite-execution step cap.

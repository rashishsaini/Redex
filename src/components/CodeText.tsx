/**
 * Display-only syntax colouring for an expression string. It never evaluates
 * or rewrites the text; it only wraps tokens in styled spans.
 */
const TOKEN = /(\b(?:map|foldl|let|in)\b|->|\\|-?\d+|[()[\],:=+*/-])/g;

function classify(token: string): string | null {
  if (["map", "foldl", "let", "in"].includes(token)) return "tok-kw";
  if (token === "->" || token === "\\") return "tok-lambda";
  if (/^-?\d+$/.test(token)) return "tok-num";
  if (/^[:+*/-]$/.test(token)) return "tok-op";
  if (/^[()[\],]$/.test(token)) return "tok-punct";
  return null;
}

export function CodeText({ text }: { text: string }) {
  // split() with a capture group yields [plain, token, plain, token, ...]
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, index) => {
        if (part === "") return null;
        const className = index % 2 === 1 ? classify(part) : null;
        return className ? (
          <span key={index} className={className}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

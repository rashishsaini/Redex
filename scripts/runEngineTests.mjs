import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, ".test-build");
// The main project is ESM; the test-only TypeScript compile targets CommonJS.
writeFileSync(resolve(outputDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2));
const result = spawnSync(process.execPath, [resolve(outputDir, "engine", "selfCheck.js")], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

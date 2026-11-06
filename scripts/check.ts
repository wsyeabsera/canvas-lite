// npm run check: typecheck + all unit tests, with the elapsed time.
import { spawnSync } from "node:child_process";
import { ROOT } from "./lib/repo.ts";

const t0 = performance.now();
const run = (script: string) => spawnSync("npm", ["run", "-s", script], { cwd: ROOT, stdio: "inherit" }).status ?? 1;
const status = run("typecheck") || run("test");
console.log(`check ${status === 0 ? "passed" : "FAILED"} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
process.exit(status);

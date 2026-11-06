// npm test [-- <word> ...]: every unit test file, or only those whose name contains a word.
import { spawnSync } from "node:child_process";
import { loadGraph, ROOT } from "./lib/repo.ts";

const words = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((w) => w.toLowerCase());
const { tests } = loadGraph();
const chosen = words.length ? tests.filter((t) => words.some((w) => t.toLowerCase().includes(w))) : tests;
if (chosen.length === 0) {
  console.error(`no test file name contains: ${words.join(", ")}`);
  process.exit(1);
}
const r = spawnSync(process.execPath, ["--test", ...chosen], { cwd: ROOT, stdio: "inherit" });
process.exit(r.status ?? 1);

// npm run test:changed [-- --list] [--no-cache] [--base <ref>]
// Typecheck, the inventory guard, then only the unit files that (transitively) import what changed since main,
// skipping any whose inputs are unchanged since a green run.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { inputHash, loadGraph, lockHash, readCache, ROOT, writeCache } from "./lib/repo.ts";
import { selectTests } from "./lib/select.ts";

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const useCache = !args.includes("--no-cache") && !process.env.LITE_NO_CACHE;
const bi = args.indexOf("--base");
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const tryGit = (...a: string[]) => {
  try {
    return git(...a);
  } catch {
    return "";
  }
};

const base = (bi >= 0 ? args[bi + 1] : "") || tryGit("merge-base", "HEAD", "main") || "HEAD";
const lines = (s: string) => s.split("\n").filter(Boolean);
const changed = [...new Set([...lines(git("diff", "--name-only", base)), ...lines(git("ls-files", "--others", "--exclude-standard"))])];

const { sources, graph, tests } = loadGraph();
const plan = selectTests({ changed, tests, graph, exists: (f) => existsSync(join(ROOT, f)) });

const cache = useCache ? readCache() : {};
const lock = lockHash();
const hashes = new Map(plan.tests.map((t) => [t, inputHash(t, sources, graph, lock)]));
const toRun = plan.tests.filter((t) => cache[t] !== hashes.get(t));
const cached = plan.tests.length - toRun.length;

console.log(`changed since ${base.slice(0, 8)}: ${changed.length} file(s); ${plan.all ? "ALL tests" : `${plan.tests.length} test file(s)`} (${plan.reason})`);
for (const t of plan.tests) console.log(`  ${cache[t] === hashes.get(t) ? "cached " : "run    "}${t}`);
if (listOnly) process.exit(0);

const t0 = performance.now();
const npm = (script: string) => spawnSync("npm", ["run", "-s", script], { cwd: ROOT, stdio: "inherit" }).status ?? 1;
let status = npm("typecheck") || npm("test:inventory");
if (status === 0 && toRun.length) {
  status = spawnSync(process.execPath, ["--test", ...toRun], { cwd: ROOT, stdio: "inherit" }).status ?? 1;
  if (status === 0) writeCache({ ...readCache(), ...Object.fromEntries(toRun.map((t) => [t, hashes.get(t)!])) });
}
const secs = ((performance.now() - t0) / 1000).toFixed(1);
console.log(
  status === 0
    ? `test:changed passed in ${secs}s: ${toRun.length} test file(s) ran${cached ? `, ${cached} from the cache` : ""}`
    : `test:changed FAILED in ${secs}s`,
);
process.exit(status);

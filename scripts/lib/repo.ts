// Reading the repo for the scripts: files, the import graph, hashes, the cache file.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, transitiveDeps } from "./graph.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Every other top-level folder (src, test, cli, scripts, ...) is scanned for imports. */
const SKIP_DIRS = new Set(["node_modules", "site", "docs", ".git", ".claude", ".wrangler", ".lite-cache"]);
export const CACHE_FILE = join(ROOT, ".lite-cache", "unit.json");

function walk(dir: string, out: string[]) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|mjs|js)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(rel);
  }
}

export function scanFiles(): string[] {
  const out: string[] = [];
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(e.name, out);
  }
  return out.sort();
}

export const testFiles = (files: string[]) => files.filter((f) => /^test\/[^/]+\.test\.ts$/.test(f));

export function loadGraph() {
  const files = scanFiles();
  const sources = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
  return { files, sources, graph: buildGraph(sources), tests: testFiles(files) };
}

const sha = (...parts: string[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex");
};

/** Hash of a test's own content, every transitive import's content, node version and the lockfile. */
export function inputHash(test: string, sources: ReadonlyMap<string, string>, graph: Map<string, Set<string>>, lock: string): string {
  const deps = [...transitiveDeps(test, graph)].sort();
  return sha(process.version, lock, test, sources.get(test) ?? "", ...deps.flatMap((d) => [d, sources.get(d) ?? ""]));
}

export const lockHash = () => {
  const f = join(ROOT, "package-lock.json");
  return existsSync(f) ? sha(readFileSync(f, "utf8")) : "";
};

export function readCache(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function writeCache(c: Record<string, string>) {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2) + "\n");
}

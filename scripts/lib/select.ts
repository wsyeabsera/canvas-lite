// Which unit test files cover a set of changed files. Pure.
import { importers, transitiveDeps } from "./graph.ts";

export interface Plan {
  /** true when every test runs, with the reason */
  all: boolean;
  reason: string;
  tests: string[];
}

export const isTestFile = (f: string) => /^test\/[^/]+\.test\.ts$/.test(f);
const isConfig = (f: string) => f === "package.json" || f === "package-lock.json" || /^tsconfig[^/]*\.json$/.test(f);
/** Prose and site files: no unit test imports them, and they never need tests. */
const isIgnored = (f: string) =>
  f.startsWith("docs/") || f.startsWith("site/") || /\.md$/.test(f) || f === ".gitignore" || f.startsWith(".lite-cache/");

/**
 * changed: repo-relative paths (existing or deleted). tests: all test files. graph: file -> direct imports
 * (must contain every scanned file). exists: whether a path is still on disk.
 */
export function selectTests(opts: {
  changed: string[];
  tests: string[];
  graph: ReadonlyMap<string, ReadonlySet<string>>;
  exists?: (f: string) => boolean;
}): Plan {
  const { graph, tests } = opts;
  const exists = opts.exists ?? (() => true);
  const all = (reason: string): Plan => ({ all: true, reason, tests: [...tests] });
  const changed = opts.changed.filter((f) => !isIgnored(f));
  if (changed.length === 0) return { all: false, reason: "nothing to test changed", tests: [] };

  const picked = new Set<string>();
  for (const f of changed) {
    if (isConfig(f)) return all(`${f} changed`);
    if (isTestFile(f)) return all(`${f} (a test file) changed`);
    if (!exists(f)) return all(`${f} was deleted`);
    if (!graph.has(f)) return all(`${f} is not a source file the graph knows`);
    const covering = tests.filter((t) => transitiveDeps(t, graph).has(f));
    if (covering.length === 0 && importers(f, graph).length === 0) return all(`nothing imports ${f}`);
    for (const t of covering) picked.add(t);
  }
  return { all: false, reason: "tests that import what changed", tests: tests.filter((t) => picked.has(t)) };
}

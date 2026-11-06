// Import graph by scanning relative import statements. No dependency, pure functions.
import { dirname, posix } from "node:path";

const IMPORT_RE =
  /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

/** The relative module specifiers a source file imports (not packages, not node: builtins). */
export function importsOf(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec && (spec.startsWith("./") || spec.startsWith("../"))) out.push(spec);
  }
  return out;
}

/** Resolve a relative specifier from a file (paths are repo-relative, posix) to a known file, or null. */
export function resolveImport(from: string, spec: string, known: ReadonlySet<string>): string | null {
  const base = posix.normalize(posix.join(dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`]) {
    if (known.has(c)) return c;
  }
  return null;
}

/** file -> the files it directly imports (only files in the map). */
export function buildGraph(sources: ReadonlyMap<string, string>): Map<string, Set<string>> {
  const known = new Set(sources.keys());
  const graph = new Map<string, Set<string>>();
  for (const [file, src] of sources) {
    const deps = new Set<string>();
    for (const spec of importsOf(src)) {
      const r = resolveImport(file, spec, known);
      if (r) deps.add(r);
    }
    graph.set(file, deps);
  }
  return graph;
}

/** Every file reachable from `file` through imports, not including `file` itself unless it is in a cycle. */
export function transitiveDeps(file: string, graph: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(graph.get(file) ?? [])];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph.get(f) ?? []) stack.push(d);
  }
  return seen;
}

/** Who imports `file` directly. */
export function importers(file: string, graph: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  return [...graph].filter(([, deps]) => deps.has(file)).map(([f]) => f);
}

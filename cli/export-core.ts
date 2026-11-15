// Pure parts of `lite export`: argument parsing, the API URL, and the file text. No network, no disk.

const ID_RE = /^[a-z0-9][a-z0-9-]*$/; // the same id rule as the API (docs/api.md)
export const DEFAULT_BASE = "http://127.0.0.1:8790";

export type ExportArgs = { project: string; scene: string; out: string };

/** `<project> <scene> [--out file|-]`; the file defaults to `<scene>.json`, `-` means stdout. Throws a one-line usage error. */
export function parseExportArgs(argv: string[]): ExportArgs {
  const rest: string[] = [];
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      out = argv[++i] ?? "";
    } else rest.push(argv[i]);
  }
  const [project, scene] = rest;
  const usage = "usage: lite export <project> <scene> [--out <file>|-]";
  if (rest.length !== 2 || out === "") throw new Error(usage);
  for (const [what, id] of [["project", project], ["scene", scene]]) {
    if (id.length > 40 || !ID_RE.test(id)) throw new Error(`invalid ${what} id "${id}": use lowercase letters, digits and -, at most 40. ${usage}`);
  }
  return { project, scene, out: out ?? `${scene}.json` };
}

/** `http(s)://host[:port]` (a ws:// URL or a path is reduced to its origin; empty means local dev) -> the scene API URL. */
export function sceneUrl(base: string | undefined, project: string, scene: string): string {
  const u = new URL(base?.trim() || DEFAULT_BASE);
  if (u.protocol === "ws:") u.protocol = "http:";
  else if (u.protocol === "wss:") u.protocol = "https:";
  else if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`unsupported URL scheme: ${u.protocol}`);
  return `${u.origin}/api/projects/${project}/scenes/${scene}`;
}

/** The file text: the stored scene {name, objects, lights, sky, camera} as indented JSON with a trailing newline. */
export function sceneFileText(answer: unknown): string {
  const scene = (answer as { scene?: unknown } | null)?.scene;
  if (typeof scene !== "object" || scene === null || !Array.isArray((scene as { objects?: unknown }).objects)) throw new Error("the answer has no scene with objects");
  return `${JSON.stringify(scene, null, 2)}\n`;
}

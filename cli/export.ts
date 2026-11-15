// `lite export <project> <scene> [--out <file>|-]`: save a stored scene as a JSON file other repos can load.
// Env: LITE_URL (default http://127.0.0.1:8790), LITE_TOKEN (not needed for local dev).
import { writeFileSync } from "node:fs";
import { parseExportArgs, sceneFileText, sceneUrl } from "./export-core.ts";

try {
  const args = parseExportArgs(process.argv.slice(2));
  const token = process.env.LITE_TOKEN;
  const res = await fetch(sceneUrl(process.env.LITE_URL, args.project, args.scene), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`${res.status} ${body?.error ?? res.statusText}`);
  }
  const text = sceneFileText(await res.json());
  if (args.out === "-") process.stdout.write(text);
  else {
    writeFileSync(args.out, text);
    console.error(`wrote ${args.out}`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

// node scripts/sync-skill.mjs [--check]
// The plugin skill is the one source; this copies it to the repo's agent skill. --check only compares (exit 1 on drift).
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../plugin/lite-prototyping/skills/prototyping/SKILL.md", import.meta.url);
const dst = new URL("../.agents/skills/lite-prototyping/SKILL.md", import.meta.url);
const want = readFileSync(src, "utf8");
const have = (() => {
  try {
    return readFileSync(dst, "utf8");
  } catch {
    return null;
  }
})();

if (process.argv.includes("--check")) {
  if (have !== want) (console.error("skill drift: run node scripts/sync-skill.mjs"), process.exit(1));
} else if (have !== want) {
  writeFileSync(dst, want);
  console.log("synced .agents/skills/lite-prototyping/SKILL.md");
}

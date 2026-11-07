// node scripts/sync-skill.mjs [--check]
// The plugin skills are the one source; this copies each to the repo's agent skill. --check only compares (exit 1 on drift).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SKILLS = [
  { src: "../plugin/lite-prototyping/skills/prototyping/SKILL.md", dst: "../.agents/skills/lite-prototyping/SKILL.md" },
  { src: "../plugin/lite-prototyping/skills/scenes/SKILL.md", dst: "../.agents/skills/lite-scenes/SKILL.md" },
  { src: "../plugin/lite-prototyping/skills/tournament/SKILL.md", dst: "../.agents/skills/lite-tournament/SKILL.md" },
];

const read = (url) => {
  try {
    return readFileSync(url, "utf8");
  } catch {
    return null;
  }
};

let drift = false;
for (const s of SKILLS) {
  const src = new URL(s.src, import.meta.url);
  const dst = new URL(s.dst, import.meta.url);
  const want = readFileSync(src, "utf8");
  if (read(dst) === want) continue;
  if (process.argv.includes("--check")) {
    console.error(`skill drift: ${s.dst.replace("../", "")}: run node scripts/sync-skill.mjs`);
    drift = true;
  } else {
    mkdirSync(new URL(".", dst), { recursive: true });
    writeFileSync(dst, want);
    console.log(`synced ${s.dst.replace("../", "")}`);
  }
}
if (drift) process.exit(1);

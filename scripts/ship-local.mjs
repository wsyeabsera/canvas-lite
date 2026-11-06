// npm run ship:local [-- --dry-run]
// From a ws/ task branch: refuse if uncommitted, run test:changed, fast-forward main (in the main worktree),
// and push main only when an origin remote exists. --dry-run checks and prints the plan, changes nothing.
import { execFileSync, spawnSync } from "node:child_process";

const dry = process.argv.includes("--dry-run");
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const fail = (m) => {
  console.error(`ship:local refused: ${m}`);
  process.exit(1);
};

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (!branch.startsWith("ws/")) fail(`on "${branch}", not a ws/ task branch`);
if (git("status", "--porcelain")) fail("uncommitted changes (commit or discard them first)");

// The worktree that has main checked out, if any.
const trees = git("worktree", "list", "--porcelain")
  .split("\n\n")
  .map((b) => Object.fromEntries(b.split("\n").map((l) => l.split(/ (.*)/s))));
const mainDir = trees.find((t) => t.branch === "refs/heads/main")?.worktree;
const hasOrigin = git("remote").split("\n").includes("origin");

try {
  git("merge-base", "--is-ancestor", "main", branch);
} catch {
  fail(`main is not an ancestor of ${branch}: rebase onto main first`);
}
if (mainDir && git("-C", mainDir, "status", "--porcelain")) fail(`the main worktree ${mainDir} has uncommitted changes`);

// The merge gate never reads the cache; a dry run only prints the plan.
const gate = spawnSync("npm", ["run", "-s", "test:changed", "--", ...(dry ? ["--list"] : ["--no-cache"])], { stdio: "inherit" });
if (gate.status !== 0) fail("test:changed failed");

const plan = [
  mainDir ? `fast-forward main in ${mainDir} to ${branch}` : `fast-forward the main ref to ${branch} (main is not checked out anywhere)`,
  hasOrigin ? "git push origin main" : "no origin remote: not pushing",
];
if (dry) {
  console.log(`dry run, would:\n  ${plan.join("\n  ")}`);
  process.exit(0);
}
if (mainDir) git("-C", mainDir, "merge", "--ff-only", branch);
else git("update-ref", "refs/heads/main", branch);
console.log(plan[0]);
if (hasOrigin) {
  git("push", "origin", "main");
  console.log("pushed main to origin");
} else console.log(plan[1]);

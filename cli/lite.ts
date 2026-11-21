#!/usr/bin/env node
// `lite <init|watch> ...`: the global command (npm link). Drops the subcommand from argv, then runs that script.
export {};
const [cmd] = process.argv.splice(2, 1);
if (cmd === "init") await import("./init.ts");
else if (cmd === "watch") await import("./watch.ts");
else {
  console.error("usage: lite init [dir] [--url <worker url>] [--devtools]\n       lite watch [--after N]");
  process.exit(2);
}

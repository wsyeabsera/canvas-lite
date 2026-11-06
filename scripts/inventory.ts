// npm run test:inventory [-- --reason "<text>"]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkInventory, countTests, lowerInventory, type Inventory } from "./lib/inventory.ts";
import { ROOT, scanFiles, testFiles } from "./lib/repo.ts";

const file = join(ROOT, "test", "inventory.json");
const current = testFiles(scanFiles()).reduce((n, f) => n + countTests(readFileSync(join(ROOT, f), "utf8")), 0);
const inv: Inventory = JSON.parse(readFileSync(file, "utf8"));
const args = process.argv.slice(2);
const i = args.indexOf("--reason");
const reason = i >= 0 ? args[i + 1] : undefined;

const problem = checkInventory(current, inv);
if (problem && reason) {
  writeFileSync(file, JSON.stringify(lowerInventory(current, inv, reason, new Date().toISOString().slice(0, 10)), null, 2) + "\n");
  console.log(`inventory lowered to ${current}: ${reason}`);
} else if (problem) {
  console.error(problem);
  process.exit(1);
} else {
  if (current > inv.count) {
    writeFileSync(file, JSON.stringify({ ...inv, count: current }, null, 2) + "\n");
    console.log(`inventory raised from ${inv.count} to ${current}`);
  }
  console.log(`inventory ok: ${current} unit tests (recorded ${inv.count})`);
}

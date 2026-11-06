// `lite watch`: read-only terminal watcher. Env: LITE_URL, LITE_TOKEN. Flag: --after N.
import { formatEvent } from "./format.ts";
import { normalizeUrl, Watcher, type SocketLike } from "./watch-core.ts";

const argv = process.argv.slice(2);
const i = argv.indexOf("--after");
const after = i >= 0 ? Number(argv[i + 1]) : 0;
if (!Number.isInteger(after) || after < 0) {
  console.error("usage: node cli/watch.ts [--after N]");
  process.exit(2);
}

let url: string;
try {
  url = normalizeUrl(process.env.LITE_URL);
} catch (e) {
  console.error(`bad LITE_URL: ${(e as Error).message}`);
  process.exit(2);
}

const watcher = new Watcher({
  url,
  token: process.env.LITE_TOKEN || undefined,
  after,
  WebSocket: WebSocket as unknown as new (url: string) => SocketLike,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
  onRow: (row) => console.log(formatEvent(row)),
  onStatus: (line) => console.error(line),
  onRefused: () => process.exit(1),
});

process.on("SIGINT", () => {
  watcher.stop();
  process.exit(0);
});
watcher.start();

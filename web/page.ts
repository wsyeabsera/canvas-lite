// The read-only watch page: the CLI's Watcher and formatter, drawn into a list. It never sends anything but the hello.
import { formatEvent } from "../cli/format.ts";
import { Watcher, normalizeUrl } from "../cli/watch-core.ts";
import { tokenFromHash } from "./token.ts";

const MAX_ROWS = 500;
const KEY = "lite.token";
const list = document.getElementById("events")!;
const status = document.getElementById("status")!;

let token = tokenFromHash(location.hash);
try {
  if (token) {
    localStorage.setItem(KEY, token);
    history.replaceState(null, "", location.pathname); // the token leaves the address bar
  } else token = localStorage.getItem(KEY) ?? undefined;
} catch {
  /* storage can be blocked: the token then lives only in this tab's fragment */
}

const setStatus = (text: string, state: "ok" | "wait" | "bad") => {
  status.textContent = text;
  status.dataset.state = state;
};

const watcher = new Watcher({
  url: normalizeUrl(location.origin),
  token,
  WebSocket: WebSocket as any,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as number),
  onRow: (row) => {
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const li = document.createElement("li");
    li.textContent = formatEvent(row);
    list.append(li);
    while (list.childElementCount > MAX_ROWS) list.firstElementChild!.remove();
    if (atEnd) list.scrollTop = list.scrollHeight;
  },
  onStatus: (line) => setStatus(line, line === "connected" ? "ok" : "wait"),
  onRefused: () => setStatus(token ? "refused: the token is wrong" : "refused: open this page with #token=<your token>", "bad"),
});
watcher.start();

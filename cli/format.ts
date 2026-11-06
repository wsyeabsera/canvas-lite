// Pure helpers for `lite watch`: one plain line per event, never a large payload.
export type WatchRow = { seq: number; project: string | null; kind: string; payload: unknown; ts: number };

const MAX_DETAIL = 100;
const pad = (n: number) => String(n).padStart(2, "0");

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Collapses whitespace and caps the text at `max` characters, the last three being `...`. */
export function clip(text: string, max = MAX_DETAIL): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

export function detail(row: Pick<WatchRow, "kind" | "payload">): string {
  const p = row.payload as Record<string, unknown> | null | undefined;
  if (row.kind === "ping") return clip(typeof p?.note === "string" ? p.note : "");
  if (row.kind === "project.opened" && typeof p?.name === "string") return clip(`opened ${p.name}`);
  let json: string | undefined;
  try {
    json = JSON.stringify(row.payload);
  } catch {
    json = undefined;
  }
  return clip(json ?? "");
}

export function formatEvent(row: WatchRow): string {
  return `${clock(row.ts)} #${row.seq} ${row.project ?? "-"} ${row.kind} ${detail(row)}`.trimEnd();
}

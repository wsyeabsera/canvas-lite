// Scenarios (docs/prototype-tools.md): named user journeys over a canvas, played by the watch page with a cursor that clicks
// the real links. Stored like the tour: the latest `scenarios.set` event of the canvas (no table, no migration).
import { checkId, requireCanvas, requireProject } from "./canvases.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";

export const SCENARIOS_MAX = 12;
export const SCENARIO_STEPS_MAX = 40;
export const SCENARIO_NAME_MAX = 80;
export const SCENARIO_DESCRIPTION_MAX = 200;
export const SCENARIO_CAPTION_MAX = 200;
export const SCENARIO_VIA_MAX = 60;
export const SCENARIO_DWELL_MIN = 200;
export const SCENARIO_DWELL_MAX = 60_000;

export type ScenarioStep = { screen: string; via?: string; dwell_ms: number; caption?: string };
export type Scenario = { id: string; name: string; description?: string; steps: ScenarioStep[] };
export type ScenarioSummary = { id: string; name: string; steps: number; duration_ms: number };
export type ScenarioRead = Scenario & { duration_ms: number; missing: number[] };

const TAG_RE = /<([a-zA-Z][^\s>\/]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export type Control = { kind: "to" | "back"; to: string | null; text: string };

/** Pure: the clickable link elements of a screen in document order: every `data-to` (with its target) and `data-back`, with the element's visible text (tags stripped, spaces collapsed, plus aria-label and title). Tolerant, no DOM. */
export function linkControls(html: string): Control[] {
  const clean = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const out: Control[] = [];
  for (const m of clean.matchAll(TAG_RE)) {
    let to: string | null = null;
    let back = false;
    const extra: string[] = [];
    for (const a of m[2].matchAll(ATTR_RE)) {
      const name = a[1].toLowerCase();
      const value = (a[2] ?? a[3] ?? a[4] ?? "").trim();
      if (name === "data-to" && to === null) to = value;
      else if (name === "data-back") back = true;
      else if ((name === "aria-label" || name === "title") && value) extra.push(value);
    }
    if (!to && !back) continue;
    const rest = clean.slice((m.index ?? 0) + m[0].length);
    const close = rest.search(new RegExp(`</${m[1].replace(/[^a-zA-Z0-9]/g, "")}\\s*>`, "i"));
    const inner = (close === -1 ? rest.slice(0, 200) : rest.slice(0, close)).replace(/<[^>]*>/g, " ");
    const text = [inner, ...extra].join(" ").replace(/\s+/g, " ").trim();
    if (to) out.push({ kind: "to", to, text });
    else out.push({ kind: "back", to: null, text });
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Pure: scenarios -> a validated copy (throws `invalid scenario <i>: ...` / `invalid scenario "<id>" step <j>: ...`). Empty array is allowed (clears). */
export function checkScenarios(input: unknown): Scenario[] {
  if (!Array.isArray(input) || input.length > SCENARIOS_MAX) throw new Error(`invalid scenarios: use 0 to ${SCENARIOS_MAX} scenarios`);
  const seen = new Set<string>();
  return input.map((s, i) => {
    if (!isObj(s)) throw new Error(`invalid scenario ${i}: must be an object {id, name, steps}`);
    if (typeof s.id !== "string" || s.id.length > 40 || !/^[a-z0-9][a-z0-9-]*$/.test(s.id))
      throw new Error(`invalid scenario ${i}: id "${String(s.id)}" must be lowercase letters, digits and -, at most 40`);
    if (seen.has(s.id)) throw new Error(`invalid scenario ${i}: duplicate id "${s.id}"`);
    seen.add(s.id);
    if (typeof s.name !== "string" || s.name.trim() === "" || s.name.length > SCENARIO_NAME_MAX)
      throw new Error(`invalid scenario "${s.id}": name must be 1 to ${SCENARIO_NAME_MAX} characters`);
    if (s.description !== undefined && (typeof s.description !== "string" || s.description.length > SCENARIO_DESCRIPTION_MAX))
      throw new Error(`invalid scenario "${s.id}": description must be text of at most ${SCENARIO_DESCRIPTION_MAX} characters`);
    if (!Array.isArray(s.steps) || s.steps.length < 1 || s.steps.length > SCENARIO_STEPS_MAX)
      throw new Error(`invalid scenario "${s.id}": use 1 to ${SCENARIO_STEPS_MAX} steps`);
    const steps = s.steps.map((t: any, j: number): ScenarioStep => {
      const at = `invalid scenario "${s.id}" step ${j}`;
      if (!isObj(t)) throw new Error(`${at}: must be an object {screen, dwell_ms}`);
      if (typeof t.screen !== "string") throw new Error(`${at}: screen must be a screen id`);
      checkId("screen", t.screen);
      if (!Number.isSafeInteger(t.dwell_ms) || t.dwell_ms < SCENARIO_DWELL_MIN || t.dwell_ms > SCENARIO_DWELL_MAX)
        throw new Error(`${at}: dwell_ms must be an integer from ${SCENARIO_DWELL_MIN} to ${SCENARIO_DWELL_MAX}`);
      if (t.caption !== undefined && (typeof t.caption !== "string" || t.caption.length > SCENARIO_CAPTION_MAX))
        throw new Error(`${at}: caption must be text of at most ${SCENARIO_CAPTION_MAX} characters`);
      if (t.via !== undefined && (typeof t.via !== "string" || t.via.length > SCENARIO_VIA_MAX))
        throw new Error(`${at}: via must be text of at most ${SCENARIO_VIA_MAX} characters`);
      return {
        screen: t.screen,
        ...(t.via !== undefined && t.via !== "" && { via: t.via }),
        dwell_ms: t.dwell_ms,
        ...(t.caption !== undefined && t.caption !== "" && { caption: t.caption }),
      };
    });
    return { id: s.id, name: s.name, ...(s.description !== undefined && s.description !== "" && { description: s.description }), steps };
  });
}

export const scenarioDuration = (steps: ScenarioStep[]): number => steps.reduce((t, s) => t + s.dwell_ms, 0);

/** Pure: how the player gets from the previous step to this one. "to" = click a data-to link, "back" = click data-back, null = no way. `stack` is the visit stack so far (last = previous step's screen). */
export function stepMove(stack: string[], screen: string, controls: Control[]): "to" | "back" | null {
  const hasBack = controls.some((c) => c.kind === "back");
  if (hasBack && stack.length >= 2 && stack[stack.length - 2] === screen) return "back";
  if (controls.some((c) => c.kind === "to" && c.to === screen)) return "to";
  if (hasBack && stack.includes(screen)) return "back";
  return null;
}

/** Pure: checks every scenario against the canvas's screens (id + html). Throws the first problem, naming scenario, step index and the fix. */
export function validateScenarios(scenarios: Scenario[], screens: { id: string; html: string }[]): void {
  const html = new Map(screens.map((s) => [s.id, s.html]));
  const controls = new Map<string, Control[]>();
  const ctl = (id: string) => (controls.has(id) ? controls.get(id)! : (controls.set(id, linkControls(html.get(id) ?? "")), controls.get(id)!));
  for (const sc of scenarios) {
    sc.steps.forEach((st, n) => {
      if (!html.has(st.screen)) throw new Error(`scenario "${sc.id}" step ${n}: unknown screen "${st.screen}": use a screen id from read_canvas`);
    });
    const stack = [sc.steps[0].screen];
    for (let n = 1; n < sc.steps.length; n++) {
      const st = sc.steps[n];
      const prev = stack[stack.length - 1];
      const cs = ctl(prev);
      const move = stepMove(stack, st.screen, cs);
      if (move === null)
        throw new Error(`scenario "${sc.id}" step ${n}: no link from "${prev}" to "${st.screen}": add data-to="${st.screen}" to a control in "${prev}" (patch_screen), or use data-back if this returns to an earlier screen, or change the step`);
      if (st.via !== undefined) {
        const want = st.via.toLowerCase();
        const cands = cs.filter((c) => (move === "to" ? c.kind === "to" && c.to === st.screen : c.kind === "back"));
        if (!cands.some((c) => c.text.toLowerCase().includes(want)))
          throw new Error(`scenario "${sc.id}" step ${n}: via "${st.via}" matches no link text in "${prev}" that goes to "${st.screen}" (${cands.length ? `found: ${cands.map((c) => `"${c.text}"`).join(", ")}` : "no such link"}): fix via or the screen's link text`);
      }
      if (move === "back") stack.length = stack.lastIndexOf(st.screen) + 1;
      else stack.push(st.screen);
    }
  }
}

function screenHtml(sql: Sql, project: string, canvas: string) {
  return sql.all<{ id: string; html: string }>("SELECT id, html FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid", project, canvas);
}

/** Stores the scenarios (empty clears) as a `scenarios.set` event {canvas, scenarios}. Validated against the canvas as it is now. */
export function setScenarios(
  sql: Sql, project: string, canvas: string, scenarios: unknown, now = Date.now(),
): { canvas: string; scenarios: ScenarioSummary[]; total_ms: number; event: LiteEvent } {
  requireProject(sql, project);
  const checked = checkScenarios(scenarios);
  return sql.transaction(() => {
    requireCanvas(sql, project, canvas);
    validateScenarios(checked, screenHtml(sql, project, canvas));
    sql.run("UPDATE canvases SET updated_at = ? WHERE project = ? AND id = ?", now, project, canvas);
    const event = appendEvent(sql, { project, kind: "scenarios.set", payload: { canvas, scenarios: checked } }, now);
    const summary = checked.map((s) => ({ id: s.id, name: s.name, steps: s.steps.length, duration_ms: scenarioDuration(s.steps) }));
    return { canvas, scenarios: summary, total_ms: summary.reduce((t, s) => t + s.duration_ms, 0), event };
  });
}

/** The canvas's current scenarios (latest `scenarios.set`), [] when never set or cleared. `missing` lists step indexes whose screen was removed since. */
export function readScenarios(sql: Sql, project: string, canvas: string): ScenarioRead[] {
  const [r] = sql.all<{ payload: string }>(
    "SELECT payload FROM events WHERE project = ? AND kind = 'scenarios.set' AND json_extract(payload, '$.canvas') = ? ORDER BY seq DESC LIMIT 1", project, canvas,
  );
  const list: Scenario[] = r ? JSON.parse(r.payload).scenarios : [];
  if (list.length === 0) return [];
  const have = new Set(screenHtml(sql, project, canvas).map((s) => s.id));
  return list.map((s) => ({ ...s, duration_ms: scenarioDuration(s.steps), missing: s.steps.flatMap((t, i) => (have.has(t.screen) ? [] : [i])) }));
}

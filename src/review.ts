// Product-completeness review (docs/prototype-tools.md): what validate_flow does not say. Pure, no Sql, no DOM.
// validate_flow checks that links resolve; this checks the prototype is wired like a product: every screen reachable and
// reached, a way out and a way back, one navigation model, states, and a tour that covers the screens.
import { extractLinks, hasBackLink } from "./canvases.ts";
import { scanControls, unlinkedSummary } from "./coverage.ts";
import { driftIssues } from "./design-drift.ts";
import type { DesignSystem } from "./design-system.ts";

export type ReviewSeverity = "error" | "warning" | "info";
export type ReviewIssue = { severity: ReviewSeverity; kind: string; screen?: string; message: string; fix: string };
export type ReviewStats = {
  screens: number; links: number; controls: number; linked: number; unlinked: number; reachable: number; nav_sets: number; tour_steps: number; tour_screens: number; scenarios: number; scenario_steps: number; covered_screens: number;
};
export type Review = { score: number; ok: boolean; issues: ReviewIssue[]; stats: ReviewStats };
export type ReviewInput = {
  screens: { id: string; name: string; html: string }[];
  start: string | null;
  tour: { screen: string }[] | null;
  scenarios?: { steps: { screen: string }[] }[] | null;
  /** The project's design system, when it has one: adds the off_token_* warnings (docs/design-system.md). */
  design?: DesignSystem | null;
};

export const PASS_SCORE = 90;
export const PENALTY: Record<ReviewSeverity, number> = { error: 15, warning: 6, info: 1 };
export const NAV_MIN_ITEMS = 3;
/** A screen is compared with a nav bar only when it has at least this share of its items. */
export const NAV_NEAR = 0.75;
export const STATES_MIN_SCREENS = 4;
export const SCENARIOS_MIN_SCREENS = 4;
export const STATE_WORDS = /empty|loading|error|success|offline|confirm/i;

const quote = (xs: string[]) => xs.map((x) => `"${x}"`).join(", ");

export function reviewPrototype(input: ReviewInput): Review {
  const { screens } = input;
  const stats: ReviewStats = { screens: screens.length, links: 0, controls: 0, linked: 0, unlinked: 0, reachable: 0, nav_sets: 0, tour_steps: input.tour?.length ?? 0, tour_screens: 0, scenarios: input.scenarios?.length ?? 0, scenario_steps: input.scenarios?.reduce((n, s) => n + s.steps.length, 0) ?? 0, covered_screens: 0 };
  if (screens.length === 0) {
    const issues: ReviewIssue[] = [{ severity: "error", kind: "no_screens", message: "the canvas has no screens", fix: "write the screens with set_screens" }];
    return { score: 0, ok: false, issues, stats };
  }
  const issues: ReviewIssue[] = [];
  const ids = screens.map((s) => s.id);
  const idSet = new Set(ids);
  const start = input.start !== null && idSet.has(input.start) ? input.start : ids[0];
  if (input.start === null || !idSet.has(input.start))
    issues.push({ severity: "warning", kind: "no_start_screen", screen: start, message: `no valid start screen: play opens on "${start}"`, fix: `call set_flow with start_screen set to the screen a user lands on first` });

  const targets = new Map<string, Set<string>>(); // existing link targets per screen
  const linkCount = new Map<string, number>();
  const back = new Map<string, boolean>();
  for (const s of screens) {
    const links = extractLinks(s.html);
    stats.links += links.length;
    linkCount.set(s.id, links.length);
    back.set(s.id, hasBackLink(s.html));
    targets.set(s.id, new Set(links.map((l) => l.to).filter((t) => idSet.has(t))));
    const seen = new Set<string>();
    for (const { to } of links)
      if (!idSet.has(to) && !seen.has(to)) {
        seen.add(to);
        issues.push({ severity: "error", kind: "dangling_link", screen: s.id, message: `"${s.id}" links to "${to}", which is not a screen`, fix: `create a screen with id "${to}", or change that data-to to an existing screen id` });
      }
    const scan = scanControls(s.html);
    stats.controls += scan.controls; stats.linked += scan.linked; stats.unlinked += scan.unlinked;
    if (scan.unlinked > 0)
      issues.push({ severity: "warning", kind: "unlinked_control", screen: s.id, message: `"${s.id}" has ${unlinkedSummary(scan.unlinked, scan.items)}`, fix: "add data-to=<screen id> or data-back to each control (patch_screen), or data-inert if it deliberately goes nowhere" });
  }

  // Reachability from the start over data-to.
  const reach = new Set([start]);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift())
    for (const to of targets.get(id)!) if (!reach.has(to)) (reach.add(to), queue.push(to));
  stats.reachable = reach.size;
  const inbound = new Set<string>();
  for (const [from, set] of targets) for (const to of set) if (to !== from) inbound.add(to);
  for (const s of screens) {
    if (!reach.has(s.id))
      issues.push({ severity: "warning", kind: "unreachable", screen: s.id, message: `"${s.id}" cannot be reached from the start screen "${start}"`, fix: `add a control on a reachable screen with data-to="${s.id}" (a nav item, a button or a list row), or remove the screen` });
    if (s.id !== start && !inbound.has(s.id))
      issues.push({ severity: "warning", kind: "no_inbound_link", screen: s.id, message: `no screen links to "${s.id}"`, fix: `link to it from the screen a user would come from: data-to="${s.id}"` });
  }

  // Dead ends: no way out at all.
  const dead = new Set<string>();
  for (const s of screens)
    if (linkCount.get(s.id) === 0 && !back.get(s.id)) {
      dead.add(s.id);
      issues.push({ severity: "warning", kind: "dead_end", screen: s.id, message: `"${s.id}" has no link out and no data-back: the user is stuck`, fix: `add a data-back control, or a data-to to the next screen or to the nav` });
    }

  // Navigation consistency: a set of 3+ targets repeated across 2+ screens is a nav bar. Each screen counts its own id as a
  // member (the current tab usually does not link to itself), so a 4-item bar still overlaps in 4.
  const aug = new Map(screens.map((s) => [s.id, new Set([...targets.get(s.id)!, s.id])]));
  // Each repeated set is its own candidate (never merged with an overlapping one: unrelated content links that share a
  // target would chain into one fake bar); only maximal candidates count, and a screen differs only when it has most of
  // a bar (at least NAV_NEAR of its items) but not all, i.e. it is a near miss, not a different screen.
  const candidates = new Map<string, Set<string>>();
  for (let i = 0; i < screens.length; i++)
    for (let j = i + 1; j < screens.length; j++) {
      const common = [...aug.get(ids[i])!].filter((t) => aug.get(ids[j])!.has(t));
      if (common.length >= NAV_MIN_ITEMS) candidates.set([...common].sort().join("\n"), new Set(common));
    }
  // Among nested candidates keep one bar: the larger set wins only while it keeps at least 3/4 of the smaller set's carriers
  // (the screens that have every item). Otherwise the larger set is the bar plus an extra link only some screens share (a
  // header gear on the tab screens) and the smaller set is the bar.
  const sets = [...candidates.values()];
  const carriers = new Map(sets.map((c) => [c, screens.filter((s) => [...c].every((t) => aug.get(s.id)!.has(t))).length]));
  const inside = (a: Set<string>, b: Set<string>) => a.size < b.size && [...a].every((t) => b.has(t));
  const clusters = sets.filter((c) => !sets.some((o) => (inside(c, o) && carriers.get(o)! * 4 >= carriers.get(c)! * 3) || (inside(o, c) && carriers.get(c)! * 4 < carriers.get(o)! * 3)));
  stats.nav_sets = clusters.length;
  for (const nav of clusters) {
    const have = (s: { id: string }) => [...nav].filter((t) => aug.get(s.id)!.has(t)).length;
    const members = screens.filter((s) => have(s) >= Math.ceil(nav.size * NAV_NEAR));
    if (members.length < 2) continue;
    for (const s of members) {
      const missing = [...nav].filter((t) => !aug.get(s.id)!.has(t));
      if (missing.length)
        issues.push({ severity: "warning", kind: "nav_differs", screen: s.id, message: `nav bar differs on screen "${s.id}": no link to ${quote(missing)} that the other screens' bar has`, fix: `add the missing nav items (${missing.map((m) => `data-to="${m}"`).join(", ")}) so every screen shows the same bar` });
    }
  }

  // No way back: not the start, no data-back, and no link to the start or to a screen that leads to it. Advisory.
  const leadsToStart = new Set([start]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of screens)
      if (!leadsToStart.has(s.id) && [...targets.get(s.id)!].some((t) => leadsToStart.has(t))) {
        leadsToStart.add(s.id);
        grew = true;
      }
  }
  for (const s of screens)
    if (s.id !== start && !dead.has(s.id) && !back.get(s.id) && ![...targets.get(s.id)!].some((t) => leadsToStart.has(t)))
      issues.push({ severity: "info", kind: "no_way_back", screen: s.id, message: `"${s.id}" has no data-back and no link towards "${start}"`, fix: `add a data-back control (a back arrow or Cancel) or a nav item linking to the start` });

  if (screens.length >= STATES_MIN_SCREENS && !screens.some((s) => STATE_WORDS.test(s.id) || STATE_WORDS.test(s.name)))
    issues.push({ severity: "info", kind: "missing_state", message: `${screens.length} screens but none is an empty, loading, error, success, offline or confirm state`, fix: "add the states a real product has: e.g. an empty list, a loading skeleton, an error with retry, a success confirmation, a confirm dialog; name them so (id like list-empty)" });

  // Coverage: a screen visited by the tour or by any scenario step counts as covered.
  const scenarios = input.scenarios ?? [];
  const hasTour = input.tour !== null && input.tour.length > 0;
  const visited = new Set<string>([...(input.tour ?? []).map((t) => t.screen), ...scenarios.flatMap((s) => s.steps.map((t) => t.screen))]);
  stats.tour_screens = ids.filter((id) => (input.tour ?? []).some((t) => t.screen === id)).length;
  stats.covered_screens = ids.filter((id) => visited.has(id)).length;
  if (scenarios.length === 0 && screens.length >= SCENARIOS_MIN_SCREENS)
    issues.push({ severity: "info", kind: "no_scenarios", message: `${screens.length} screens but no scenarios are set`, fix: "call set_scenarios with 2 to 4 scenarios, one per user journey, each step captioned in plain words, so the prototype can be played without clicking" });
  else if (scenarios.length === 0 && !hasTour)
    issues.push({ severity: "info", kind: "no_tour", message: "no scenarios and no tour are set", fix: "call set_scenarios with one scenario per user journey, so the prototype can be played without clicking" });
  if (visited.size > 0)
    for (const s of screens)
      if (!visited.has(s.id)) {
        const by = scenarios.length > 0 ? "scenario" : "tour";
        issues.push({ severity: "info", kind: `${by}_skips_screen`, screen: s.id, message: `no ${by} step shows "${s.id}"`, fix: by === "scenario" ? `add a step for "${s.id}" to a scenario (set_scenarios), or cover it in another journey` : `add a step for "${s.id}" to the tour (set_tour), or cover it in a second journey` });
      }

  if (input.design) issues.push(...driftIssues(screens, input.design));

  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]); // stable: screen order kept inside a group
  const score = Math.max(0, 100 - issues.reduce((n, i) => n + PENALTY[i.severity], 0));
  return { score, ok: !issues.some((i) => i.severity !== "info"), issues, stats };
}

// The present gate (docs/improvements.md): showing a prototype requires a passing review of the canvas as it is now.
// The review is recomputed at present time, so an edit after the last review can never slip through. Pure.
import { PASS_SCORE, type Review } from "./review.ts";

const MAX_LISTED = 3;

/** Null when the review lets the canvas be presented; otherwise the error message that says what to fix. */
export function presentBlock(r: Pick<Review, "ok" | "score" | "issues">): string | null {
  if (r.ok && r.score >= PASS_SCORE) return null;
  const open = r.issues.filter((i) => i.severity !== "info");
  const shown = (open.length > 0 ? open : r.issues).slice(0, MAX_LISTED);
  const lines = shown.map((i) => `${i.kind}${i.screen ? ` on "${i.screen}"` : ""}: ${i.fix}`);
  const more = (open.length > 0 ? open : r.issues).length - shown.length;
  return (
    `not presented: the review scores ${r.score} of 100 (needs ok and ${PASS_SCORE} or more). ` +
    `Fix these, run review_prototype again, then present: ${lines.join("; ")}${more > 0 ? `; and ${more} more` : ""}. ` +
    `To show a deliberate rough draft anyway, pass force: true.`
  );
}

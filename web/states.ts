// One look for "nothing to show": loading, empty, missing and error. The words are pure (unit tested); stateBlock draws them.
export type StateKind = "loading" | "empty" | "missing" | "error";
export type StateAction = { label: string; href?: string; onClick?: () => void };

/** The title and hint for a state of `subject` (`design`, `design system`, ...). */
export function stateText(kind: StateKind, subject: string): { title: string; hint: string } {
  switch (kind) {
    case "loading": return { title: `Loading the ${subject}…`, hint: "" };
    case "empty": return { title: `No ${subject} yet`, hint: "Ask Claude to make one." };
    case "missing": return { title: `This ${subject} does not exist`, hint: "It may have been removed, or the link is wrong." };
    case "error": return { title: `Could not load the ${subject}`, hint: "Check your connection and try again." };
  }
}

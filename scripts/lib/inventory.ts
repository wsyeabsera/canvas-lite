// The test inventory guard: the number of unit tests may not drop unless a reason is recorded.
export const countTests = (source: string) => (source.match(/^[ \t]*test(?:\.\w+)?\(/gm) ?? []).length;

export interface Inventory {
  count: number;
  history: { count: number; reason: string; date: string }[];
}

/** null when fine, else the message. */
export function checkInventory(current: number, inv: Inventory): string | null {
  return current < inv.count
    ? `Unit test count dropped: ${current} now, ${inv.count} recorded in test/inventory.json. Never delete a test to save time; if it is truly gone, run npm run test:inventory -- --reason "<why>".`
    : null;
}

export function lowerInventory(current: number, inv: Inventory, reason: string, date: string): Inventory {
  return { count: current, history: [...inv.history, { count: current, reason, date }] };
}

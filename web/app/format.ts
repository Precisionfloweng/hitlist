export function syncLabel(days: number | null): { text: string; cls: string } {
  if (days === null) return { text: "Never synced", cls: "pill bad" };
  if (days === 0) return { text: "Today", cls: "pill ok" };
  const text = `${days} day${days === 1 ? "" : "s"} ago`;
  return { text, cls: days >= 7 ? "pill bad" : days >= 3 ? "pill warn" : "pill ok" };
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v)}%`);

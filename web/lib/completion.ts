// The job's overall % complete, weighted by equipment category (Admin → Completion weights).
// Each category's own % = required fields filled / required fields across its types (same as the type cards).
// Job % = Σ(share × category %) / Σ(share) over the categories the job has, so a missing category's share is
// spread over the rest. Same sum as worker/hitlist/completion.py (both read the same category list).
import data from "@/content/completion-categories.json";

export type Category = { key: string; label: string; default: number; types: string[]; includes: string };
export const CATEGORIES: Category[] = data.categories;
const TYPE_CATEGORY = new Map(CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.key] as const)));
export const categoryOf = (typeKey: string) => TYPE_CATEGORY.get(typeKey) ?? "other";
export type Weights = Record<string, number>;
export const DEFAULT_WEIGHTS: Weights = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.default]));

/** Per-type totals: all the sum needs from a project's results (small enough to send to the browser). */
export type TypeTotals = { key: string; name: string; required: number; filled: number }[];
export const typeTotals = (types: { key: string; name: string; units: { required: number; required_filled: number }[];
  summary?: { weighted_pct?: number } }[]): TypeTotals =>
  types.map((t) => {
    const required = t.units.reduce((n, u) => n + u.required, 0);
    const wp = t.summary?.weighted_pct;   // a type with completion weights counts by its weighted %
    return { key: t.key, name: t.name, required,
      filled: wp !== undefined ? (required * wp) / 100 : t.units.reduce((n, u) => n + u.required_filled, 0) };
  });

/** Each category the job has (with required fields): its % of required fields filled. */
export function categoryPcts(totals: TypeTotals): Record<string, number> {
  const req: Record<string, number> = {}, filled: Record<string, number> = {};
  for (const t of totals) { const c = categoryOf(t.key); req[c] = (req[c] ?? 0) + t.required; filled[c] = (filled[c] ?? 0) + t.filled; }
  return Object.fromEntries(Object.entries(req).filter(([, n]) => n > 0).map(([c, n]) => [c, (100 * filled[c]) / n]));
}

export function completePct(totals: TypeTotals, weights: Weights, fallback = 100): number {
  const pcts = categoryPcts(totals);
  const total = Object.keys(pcts).reduce((n, c) => n + (weights[c] ?? 0), 0);
  if (!total) return fallback;
  return Math.round(10 * Object.entries(pcts).reduce((n, [c, p]) => n + (weights[c] ?? 0) * p, 0) / total) / 10;
}

export function weightsFromSettings(s: Record<string, string>): Weights {
  return Object.fromEntries(CATEGORIES.map((c) => {
    const v = Number(String(s[`weight_${c.key}`] ?? "").trim());
    return [c.key, s[`weight_${c.key}`] !== undefined && String(s[`weight_${c.key}`]).trim() !== "" && isFinite(v) && v >= 0 ? v : c.default];
  }));
}

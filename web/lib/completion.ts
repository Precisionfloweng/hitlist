// The job's overall % complete by work per unit (Admin → Completion weights). Each equipment type has one number:
// how much work one unit is (Settings work_<type>, default 1; work_unit "points" | "minutes": points are just
// numbers, minutes are entered per unit and totals shown in hours, to admins only). Job % = Σ(work × unit %) / Σ(work) over every unit on the job, so each job's mix
// comes from its own equipment and nothing is set per project. A unit's % = its weighted % when its type has item
// weights (lib/weights.ts), else its required fields filled; units with nothing required are left out.
// Same sum as worker/hitlist/completion.py. The category list is only used for headings.
import data from "@/content/completion-categories.json";

export type Category = { key: string; label: string; default: number; types: string[]; includes: string };
export const CATEGORIES: Category[] = data.categories;
const TYPE_CATEGORY = new Map(CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.key] as const)));
export const categoryOf = (typeKey: string) => TYPE_CATEGORY.get(typeKey) ?? "other";

export const DEFAULT_WORK = 1;
export type WorkUnit = "points" | "minutes";
export type Work = { unit: WorkUnit; perType: Record<string, number> };
export const workOf = (w: Work, typeKey: string) => w.perType[typeKey] ?? DEFAULT_WORK;

export function workFromSettings(s: Record<string, string>): Work {
  const perType: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) {
    if (!k.startsWith("work_") || k === "work_unit") continue;
    const n = Number(String(v ?? "").trim());
    if (String(v ?? "").trim() !== "" && isFinite(n) && n >= 0) perType[k.slice(5)] = n;
  }
  return { unit: s.work_unit === "minutes" || s.work_unit === "hours" ? "minutes" : "points", perType };   // "hours" = older setting
}

/** Each type's unit %s: all the sum needs from a project's results (small enough to send to the browser). */
export type TypeTotals = { key: string; name: string; pcts: number[] }[];
type UnitLike = { required: number; required_filled: number; weighted_pct?: number };
export const unitPctOf = (u: UnitLike): number | null =>
  u.weighted_pct !== undefined && u.weighted_pct !== null ? u.weighted_pct : u.required ? (100 * u.required_filled) / u.required : null;
export const typeTotals = (types: { key: string; name: string; units: UnitLike[] }[]): TypeTotals =>
  types.map((t) => ({ key: t.key, name: t.name, pcts: t.units.map(unitPctOf).filter((p): p is number => p !== null) }));

export type Progress = { pct: number; total: number; done: number; left: number;
  byType: Map<string, { units: number; work: number; total: number; pct: number }> };
export function jobProgress(totals: TypeTotals, work: Work, fallback = 100): Progress {
  let total = 0, done = 0;
  const byType = new Map<string, { units: number; work: number; total: number; pct: number }>();
  for (const t of totals) {
    const w = workOf(work, t.key);
    if (!t.pcts.length) continue;
    const sum = t.pcts.reduce((a, b) => a + b, 0);
    byType.set(t.key, { units: t.pcts.length, work: w, total: w * t.pcts.length, pct: sum / t.pcts.length });
    if (w <= 0) continue;
    total += w * t.pcts.length;
    done += (w * sum) / 100;
  }
  const pct = total ? Math.round((1000 * done) / total) / 10 : fallback;
  return { pct, total, done, left: Math.max(0, total - done), byType };
}

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString();
/** A total amount of work as text: minutes are shown in hours ("160 hrs"), points as points. */
export const workText = (n: number, unit: WorkUnit) => (unit === "minutes" ? `${round(n / 60)} hrs` : `${round(n)} pts`);

export const completePct = (totals: TypeTotals, work: Work, fallback = 100) => jobProgress(totals, work, fallback).pct;

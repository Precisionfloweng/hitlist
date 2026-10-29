// Completion weights per field (Default Rules, admins only): how much of a unit's work each field is. A unit's % is
// the weight of what's filled in; fields sharing a weight group (e.g. "Unit Data") count as one item, each
// member equal; items that don't apply to the unit (ignored, no design, N/A) are left out and the rest scale to 100%.
// Same sum as worker/hitlist/engine.py weighted_pct. Client-safe.
import type { TypeResult } from "./results";

export type WeightField = { weight?: number | null; group?: string };

export function weightedPct(fields: WeightField[], codes: string): number | null {
  const items = new Map<string, { w: number; idx: number[] }>();
  fields.forEach((f, i) => {
    const w = Number(f.weight);
    if (!f.weight || !isFinite(w) || w <= 0) return;
    const key = f.group ? `g:${f.group.toLowerCase()}` : `f:${i}`;
    const it = items.get(key) ?? { w: 0, idx: [] };
    it.w = Math.max(it.w, w); it.idx.push(i); items.set(key, it);
  });
  if (!items.size) return null;
  let earned = 0, available = 0;
  for (const { w, idx } of items.values()) {
    const live = idx.filter((i) => "PRO".includes(codes[i] ?? "-") && codes[i] !== undefined);
    if (!live.length) continue;
    available += w;
    earned += (w * live.filter((i) => codes[i] === "P").length) / live.length;
  }
  return available ? Math.round((1000 * earned) / available) / 10 : 100;
}

/** The results with each unit's and type's weighted % worked out from the current weights (by field name). */
export function applyWeights<T extends { types: TypeResult[] }>(results: T,
  rules: { key: string; fields: { field: string; weight?: number | null; group?: string }[] }[]): T {
  const byType = new Map(rules.map((r) => [r.key, new Map(r.fields.map((f) => [f.field, f]))]));
  return { ...results, types: results.types.map((t) => {
    const rf = byType.get(t.key);
    if (!rf) return t;
    const fields = t.fields.map((f) => ({ weight: rf.get(f.label)?.weight ?? null, group: rf.get(f.label)?.group ?? "" }));
    const units = t.units.map((u) => {
      const wp = weightedPct(fields, u.codes);
      const { weighted_pct: _drop, ...rest } = u as typeof u & { weighted_pct?: number };   // eslint-disable-line @typescript-eslint/no-unused-vars
      return wp === null ? rest : { ...rest, weighted_pct: wp };
    });
    const weighted = units.filter((u) => "weighted_pct" in u) as (typeof units[number] & { weighted_pct: number })[];
    const { weighted_pct: _d, ...summary } = t.summary;   // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...t, units, summary: weighted.length
      ? { ...summary, weighted_pct: Math.round((10 * weighted.reduce((n, u) => n + u.weighted_pct, 0)) / units.length) / 10 }
      : summary };
  }) };
}

/** A type's % complete: by its weights when it has them, else required fields filled. */
export const typePct = (t: { summary: { fields_pct: number; weighted_pct?: number } }) => t.summary.weighted_pct ?? t.summary.fields_pct;
/** A unit's % complete: by weights when its type has them, else required fields filled. */
export const unitPct = (u: { required: number; required_filled: number; weighted_pct?: number }) =>
  u.weighted_pct ?? (u.required ? (100 * u.required_filled) / u.required : 100);

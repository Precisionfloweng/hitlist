// The two Suggestions on AI Tools worked out in code (no AI, nothing saved): Out of tolerance (every unit's
// Design/Actual airflow and water pairs against the project's tolerances) and What's left to do (from the last
// sync's Hitlist results). Both are calculated fresh each time from the latest data.
import type { BsValues } from "./bsvalues";
import type { Results } from "./results";
import type { Tolerances } from "./toleranceCats";
import { checkUnit, fmtPct, tolerancePairs, tolRange } from "./tolCheck";
import { byTypeOrder } from "./typeOrder";

export type OutRow = { unit: string; typeKey: string | null; reading: string; design: number; actual: number;
  pct: string; allowed: string; isDefault: boolean };
export type OutGroup = { sheet: string; checked: number; rows: OutRow[];
  unchecked: { unit: string; typeKey: string | null; readings: string[] }[] };
export type ToleranceReport = { kind: "tolerance"; synced: string; groups: OutGroup[]; outside: number; checked: number; unchecked: number };

export type LeftGroup = { key: string; name: string; units: number; complete: number; notStarted: string[];
  partly: { unit: string; missing: string[] }[]; topMissing: { field: string; units: number }[] };
export type LeftReport = { kind: "left"; synced: string; groups: LeftGroup[]; units: number; complete: number };

const sheetKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** The Hitlist type a unit belongs to (for the link to its Equipment checklist page). */
function typeIndex(results: Results | null) {
  const byPath = new Map<string, string>();
  for (const t of results?.types ?? []) for (const u of t.units) {
    byPath.set(`${sheetKey(t.export_sheet)}|${u.path || u.name}`, t.key);
    byPath.set(`${sheetKey(t.export_sheet)}|n:${u.name}`, t.key);
  }
  return (sheet: string, path: string, name: string) =>
    byPath.get(`${sheetKey(sheet)}|${path || name}`) ?? byPath.get(`${sheetKey(sheet)}|n:${name}`) ?? null;
}

export function toleranceReport(values: BsValues, results: Results | null, tol: Tolerances): ToleranceReport {
  const typeOf = typeIndex(results);
  const groups: OutGroup[] = [];
  for (const s of values.sheets) {
    const pairs = tolerancePairs(s.headers);
    if (!pairs.length) continue;
    const g: OutGroup = { sheet: s.sheet, checked: 0, rows: [], unchecked: [] };
    for (const u of s.units) {
      const checks = checkUnit(s.sheet, u.name, u.v, pairs, tol);
      if (!checks.length) continue;
      const typeKey = typeOf(s.sheet, u.path, u.name);
      const missing = checks.filter((c) => c.pct === null).map((c) => c.pair);
      if (missing.length) g.unchecked.push({ unit: u.name, typeKey, readings: missing });
      if (checks.some((c) => c.pct !== null)) g.checked++;
      for (const c of checks) {
        if (!c.outside) continue;
        g.rows.push({ unit: u.name, typeKey, reading: c.pair, design: c.design, actual: c.actual!,
          pct: fmtPct(c.pct!, c.tol), allowed: tolRange(c.tol), isDefault: !!c.tol.isDefault });
      }
    }
    if (g.checked || g.unchecked.length) groups.push(g);
  }
  return { kind: "tolerance", synced: values.synced_at, groups,
    outside: groups.reduce((n, g) => n + g.rows.length, 0),
    checked: groups.reduce((n, g) => n + g.checked, 0),
    unchecked: groups.reduce((n, g) => n + g.unchecked.length, 0) };
}

export function leftReport(results: Results): LeftReport {
  const groups: LeftGroup[] = results.types.filter((t) => t.units.length).map((t) => {
    const missingOf = (codes: string) => t.fields.filter((_, i) => codes[i] === "R").map((f) => f.label);
    const left = t.units.filter((u) => u.required_filled < u.required);
    const none = left.filter((u) => u.required_filled === 0);
    const counts = new Map<string, number>();
    for (const u of left) for (const f of missingOf(u.codes)) counts.set(f, (counts.get(f) ?? 0) + 1);
    return {
      key: t.key, name: t.name, units: t.units.length, complete: t.units.length - left.length,
      notStarted: none.map((u) => u.name),
      partly: left.filter((u) => !none.includes(u)).map((u) => ({ unit: u.name, missing: missingOf(u.codes) })),
      topMissing: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([field, units]) => ({ field, units })),
    };
  }).sort(byTypeOrder);
  return { kind: "left", synced: results.generated_at, groups,
    units: groups.reduce((n, g) => n + g.units, 0), complete: groups.reduce((n, g) => n + g.complete, 0) };
}

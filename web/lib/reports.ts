// The Suggestions on AI Tools worked out in code (no AI, nothing saved): Out of tolerance (every unit's
// Design/Actual airflow and water pairs and amps against the project's tolerances), What's left to do (from the
// last sync's Hitlist results) and Design values – BuildingStart. All calculated fresh from the latest data.
import type { BsValues } from "./bsvalues";
import type { Results } from "./results";
import type { Tolerances } from "./toleranceCats";
import { ampChecksFor, checkAmps, checkUnit, fmtPct, HEATER_TOL, tolerancePairs, tolRange } from "./tolCheck";
import { byTypeOrder } from "./typeOrder";

/** One reading outside tolerance (flow: % of design vs the allowed range; amps: above design by any amount). */
export type OutItem = { reading: string; design: number; actual: number; kind: "flow" | "amps" | "heater";
  pct: string; allowed: string; isDefault: boolean; note?: string };
/** One unit, with everything on it that's out of tolerance together. */
export type OutRow = { unit: string; typeKey: string | null; items: OutItem[] };
export type OutGroup = { sheet: string; checked: number; rows: OutRow[];
  unchecked: { unit: string; typeKey: string | null; readings: string[] }[] };
export type ToleranceReport = { kind: "tolerance"; synced: string; groups: OutGroup[]; outside: number; checked: number; unchecked: number };   // outside = units

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
    if (!pairs.length && !ampChecksFor(s.sheet).length) continue;
    const g: OutGroup = { sheet: s.sheet, checked: 0, rows: [], unchecked: [] };
    for (const u of s.units) {
      const flows = checkUnit(s.sheet, u.name, u.v, pairs, tol);
      const amps = checkAmps(s.sheet, u.v);
      if (!flows.length && !amps.length) continue;
      const typeKey = typeOf(s.sheet, u.path, u.name);
      const missing = [...flows.filter((c) => c.pct === null).map((c) => c.pair), ...amps.filter((c) => c.actual === null).map((c) => c.label)];
      if (missing.length) g.unchecked.push({ unit: u.name, typeKey, readings: missing });
      if (flows.some((c) => c.pct !== null) || amps.some((c) => c.actual !== null)) g.checked++;
      const items: OutItem[] = [
        ...flows.filter((c) => c.outside).map((c) => ({ reading: c.pair, design: c.design, actual: c.actual!, kind: "flow" as const,
          pct: fmtPct(c.pct!, c.tol), allowed: tolRange(c.tol), isDefault: !!c.tol.isDefault })),
        ...amps.filter((c) => c.over).map((c) => c.heater
          ? { reading: c.label, design: c.design, actual: c.actual!, kind: "heater" as const,
              pct: fmtPct(c.pct!, HEATER_TOL), allowed: tolRange(HEATER_TOL), isDefault: false }
          : { reading: c.label, design: c.design, actual: c.actual!, kind: "amps" as const, pct: "-", allowed: "below design",
              isDefault: false, note: c.perMotor ? `${c.motors} motors × ${c.perMotor} A` : undefined }),
      ];
      if (items.length) g.rows.push({ unit: u.name, typeKey, items });
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

// ---- Design values – BuildingStart: the unit's design / nameplate values and its sub-items (coils, heat…) ----
export type DesignSection = { name: string; sheet: string; fields: [string, string][] };
export type DesignReport = { kind: "design"; synced: string; unit: string; sections: DesignSection[] };

/** Readings (not design): actual values, phase readings, percentages, dates, notes, location. */
const NOT_DESIGN = [/^(actual|act\.?)\s/i, /\bact\.?\s/i, /\bT[123](\b|-T[123])/i, /\bamps?\s*[123]$/i, /^%/, /final|measured|reading|vfd display/i,
  /^completed$/i, /date|comment|note/i, /^(area|zone)$/i];
const isDesignField = (h: string) => !NOT_DESIGN.some((re) => re.test(h));
const squashName = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

export function designReport(values: BsValues, unitName: string): DesignReport | null {
  let found: { sheet: string; unit: BsValues["sheets"][number]["units"][number] } | null = null;
  for (const s of values.sheets) for (const u of s.units) {
    if (!found && squashName(u.name) === squashName(unitName)) found = { sheet: s.sheet, unit: u };
  }
  if (!found) return null;
  const base = found.unit.path || found.unit.name;
  const section = (sheet: string, u: { name: string; v: Record<string, unknown> }): DesignSection => ({
    name: u.name, sheet,
    fields: Object.entries(u.v).filter(([h]) => isDesignField(h)).map(([h, v]) => [h, typeof v === "boolean" ? (v ? "yes" : "no") : String(v)]),
  });
  const subs: DesignSection[] = [];
  for (const s of values.sheets) for (const u of s.units) {
    if (u !== found.unit && u.path && u.path.toLowerCase().startsWith(base.toLowerCase() + "/")) subs.push(section(s.sheet, u));
  }
  return { kind: "design", synced: values.synced_at, unit: found.unit.name,
    sections: [section(found.sheet, found.unit), ...subs].filter((x) => x.fields.length) };
}

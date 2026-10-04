// Out-of-tolerance check, done in code (exact) rather than by the AI: for each Design/Actual pair on a unit
// (e.g. "Design Max Airflow" / "Actual Max Airflow"), percent off = (actual − design) / design × 100, against the
// project's tolerance for that kind of reading (or the company default). Only airflow and water-flow pairs
// have tolerances; temperatures, pressures, volts etc. are not checked.
import { categoriesFor, fmtTol, type Tol, type Tolerances } from "./toleranceCats";

export type Pair = { name: string; design: string; actual: string; water: boolean };
export type PairCheck = { pair: string; design: number; actual: number | null; pct: number | null; tol: Tol; cat: string;
  outside: boolean | null };

const DES = /^(?:design|des)\.?\s+(.+)$/i;
const ACT = /^(?:actual|act)\.?\s+(.+)$/i;
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const isAir = (s: string) => /airflow|air flow|cfm|o\/a|outside air|air vol/i.test(s);
const isWater = (s: string) => !isAir(s) && /gpm|flow/i.test(s);

/** The Design/Actual pairs among a sheet's columns that have a tolerance (airflow or water flow). */
export function tolerancePairs(headers: string[]): Pair[] {
  const designs = new Map<string, string>();
  for (const h of headers) { const m = DES.exec(h); if (m) designs.set(key(m[1]), h); }
  const out: Pair[] = [];
  for (const h of headers) {
    const m = ACT.exec(h);
    const d = m && designs.get(key(m[1]));
    if (!m || !d || !(isAir(m[1]) || isWater(m[1]))) continue;
    out.push({ name: m[1].trim(), design: d, actual: h, water: isWater(m[1]) });
  }
  return out;
}

/** Which tolerance category a pair on this unit uses (null = none applies). */
export function categoryFor(sheet: string, unitName: string, pair: Pair): string | null {
  const cats = categoriesFor(sheet, unitName);
  const n = pair.name.toLowerCase();
  if (pair.water) return cats.find((c) => ["pumps", "coils", "tu_coils"].includes(c))
    ?? (cats.includes("tu_max") ? "tu_coils" : null);              // a VAV's reheat coil
  const air = cats.filter((c) => !["pumps", "coils", "tu_coils"].includes(c));
  if (!air.length) return null;
  if (air.includes("tu_max")) return /\bmin/.test(n) ? "tu_min" : "tu_max";
  if (air.includes("ahu_supply")) return /o\/a|outside|\boa\b/.test(n) ? "ahu_oa" : /return|\bra\b/.test(n) ? "ahu_return" : "ahu_supply";
  if (air.length === 1) return air[0];
  return air.find((c) => (/exhaust/.test(n) && c.endsWith("exhaust")) || (/return/.test(n) && c.endsWith("return"))) ?? air[0];
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

/** Check one unit's pairs. Pairs with no usable design (blank, "-", 0) are left out. */
export function checkUnit(sheet: string, unitName: string, v: Record<string, unknown>, pairs: Pair[], tol: Tolerances): PairCheck[] {
  const out: PairCheck[] = [];
  for (const p of pairs) {
    const design = num(v[p.design]);
    const cat = categoryFor(sheet, unitName, p);
    if (design === null || design <= 0 || !cat || !tol[cat]) continue;
    const actual = num(v[p.actual]);
    const t = tol[cat];
    const pct = actual === null ? null : Math.round(((actual - design) / design) * 1000) / 10;
    const outside = pct === null ? null : pct > Number(t.plus) + 1e-9 || pct < -Number(t.minus) - 1e-9;
    out.push({ pair: p.name, design, actual, pct, tol: t, cat, outside });
  }
  return out;
}

/** The allowed range as percent of design: ±10 → "90–110%", +10/−5 → "95–110%". */
export const tolRange = (t: Tol) => `${100 - Number(t.minus)}–${100 + Number(t.plus)}%`;

/** A reading as percent of design, the way TAB reports show it: +8% → "108%". Whole numbers, with one decimal
 *  only when rounding would land exactly on a limit (so 110.4% isn't shown as an in-range 110%). */
export function fmtPct(pct: number, t?: Tol): string {
  const of = 100 + pct;
  const whole = Math.round(of);
  const onLimit = t && (whole === 100 + Number(t.plus) || whole === 100 - Number(t.minus)) && Math.abs(of - whole) >= 0.05;
  return `${onLimit ? of.toFixed(1) : whole}%`;
}

/** "92% of design, within 95–110%"-style text, or "no reading". */
export function describe(c: PairCheck): string {
  if (c.pct === null) return "no reading";
  return `${fmtPct(c.pct, c.tol)} of design, ${c.outside ? "OUTSIDE" : "within"} ${tolRange(c.tol)}${c.tol.isDefault ? " (default)" : ""}`;
}

/** How close a reading is to its limit: 1 = right at it, over 1 = outside. */
export function nearness(c: PairCheck): number {
  if (c.pct === null) return 0;
  const limit = Number(c.pct >= 0 ? c.tol.plus : c.tol.minus);
  return limit > 0 ? Math.abs(c.pct) / limit : c.pct === 0 ? 0 : Infinity;
}

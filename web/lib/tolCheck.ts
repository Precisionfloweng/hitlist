// Out-of-tolerance check, done in code (exact) rather than by the AI: for each Design/Actual pair on a unit
// (e.g. "Design Max Airflow" / "Actual Max Airflow"), percent off = (actual − design) / design × 100, against the
// project's tolerance for that kind of reading (or the company default). Only airflow and water-flow pairs
// have tolerances; motor amps are flagged when above design by any amount, heater amps outside ±10% (see the end);
// temperatures, pressures, volts etc. are not checked.
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

// ---- amps -------------------------------------------------------------------------------------------------
// Motor amps: flagged when the highest actual phase is above design by any amount. When a unit has several motors
// (a fan array: "Number of Motors/Fans", or else "Fan Wall Array" like 3x3), design = per-motor amps × motors,
// since the reading is the total.
// Heater amps (electric heat, unit heater elements): always ±10% of design; the phase furthest from design is used.
export type AmpCheck = { label: string; heater: boolean; design: number; perMotor: number | null; motors: number;
  actual: number | null; pct: number | null; over: boolean | null; phases: number[] };   // phases: every reading, in order
export const HEATER_TOL: Tol = { plus: "10", minus: "10" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const T123 = (prefix: string) => [1, 2, 3].map((n) => `${prefix}${n}`);
const MOTORS = ["Number of Motors/Fans", "No. of Motors/fans", "Number of Motors", "No. of Motors", "# of Motors"];
type AmpDef = { label: string; design: string; actual: string[]; heater?: boolean; count?: string[] };
/** BuildingStart names the amp columns differently on each sheet, so each sheet has its own map. Keys and
 *  columns are compared without case, spaces or punctuation. */
const AMP_MAP: Record<string, AmpDef[]> = {
  airhandlingunit: [{ label: "Motor Amps", design: "Amps", actual: T123("Motor Amps T"), count: MOTORS }],
  rooftopunit: [{ label: "Motor Amps", design: "Amps", actual: T123("Motor Amps T"), count: MOTORS }],
  makeupairunit: [{ label: "Motor Amps", design: "Amps", actual: ["Motor Amps T1"], count: MOTORS }],
  fanunit: [{ label: "Motor Amps", design: "Motor FL Amps", actual: T123("Motor Amps T") }],
  toiletexhaustfan: [{ label: "Motor Amps", design: "Motor FL Amps", actual: ["Motor Amps T1"] }],
  airapparatusfan: [{ label: "Motor Amps", design: "Motor FL Amps", actual: T123("Motor Amps T") }],
  fancoil: [{ label: "Motor Amps", design: "Motor FL Amps", actual: T123("Motor Amps T") }],
  splitsystem: [{ label: "Motor Amps", design: "Motor FL Amps", actual: T123("Motor Amps T") }],
  ductlesssplitsystem: [{ label: "Motor Amps", design: "Motor FL Amps", actual: ["Amps"] }],
  watersourceheatpump: [{ label: "Amps", design: "Amps", actual: ["Amps T1"] }],
  hydronicpump: [{ label: "Motor Amps", design: "Motor F.L. Amps", actual: T123("Motor Amps T") }],
  coolingtower: [{ label: "Motor Amps", design: "Motor F.L. Amps", actual: ["Actual Amps T1"] }],
  // Unit heaters: only electric heat is read (no motor amps are taken on these).
  unitheater: [{ label: "Heater Amps", design: "Dsgn. Amps", actual: T123("Amps "), heater: true }],
  electriccoil: [{ label: "Heater Amps", design: "EDH Design Amps", actual: T123("EDH Act. Amps "), heater: true }],
};

/** Motors in a fan wall from the "Fan Wall Array" field: "3x3" / "3 X 3" / "3/3" / "2×4" = rows × columns, or a plain count. */
export function arrayCount(v: unknown): number | null {
  if (typeof v === "number") return v > 0 ? v : null;
  const t = String(v ?? "").trim();
  const m = /^(\d+)\s*[x×*/]\s*(\d+)$/i.exec(t);
  if (m) return Number(m[1]) * Number(m[2]);
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null;
}

export function ampChecksFor(sheet: string): AmpDef[] {
  return AMP_MAP[norm(sheet)] ?? [];
}

/** Check a unit's amps. Left out when the design isn't a number above 0. */
export function checkAmps(sheet: string, v: Record<string, unknown>): AmpCheck[] {
  const byNorm = new Map(Object.entries(v).map(([h, x]) => [norm(h), x]));
  const out: AmpCheck[] = [];
  for (const m of ampChecksFor(sheet)) {
    const base = num(byNorm.get(norm(m.design)));
    if (base === null || base <= 0) continue;
    const readings = m.actual.map((a) => num(byNorm.get(norm(a)))).filter((x): x is number => x !== null);
    if (m.heater) {
      const actual = readings.length ? readings.reduce((a, b) => (Math.abs(b - base) > Math.abs(a - base) ? b : a)) : null;
      const pct = actual === null ? null : Math.round(((actual - base) / base) * 1000) / 10;
      out.push({ label: m.label, heater: true, design: base, perMotor: null, motors: 1, actual, pct,
        over: pct === null ? null : Math.abs(pct) > 10 + 1e-9, phases: readings });
      continue;
    }
    const counted = (m.count ?? []).map((c) => num(byNorm.get(norm(c)))).find((n) => n !== null && n !== undefined)
      ?? (m.count ? arrayCount(byNorm.get(norm("Fan Wall Array"))) : null);
    const motors = counted && counted > 1 ? Math.round(counted) : 1;
    const design = Math.round(base * motors * 100) / 100;
    const actual = readings.length ? Math.max(...readings) : null;
    out.push({ label: m.label, heater: false, design, perMotor: motors > 1 ? base : null, motors, actual,
      pct: actual === null ? null : Math.round(((actual - design) / design) * 1000) / 10,
      over: actual === null ? null : actual > design + 1e-9, phases: readings });
  }
  return out;
}

/** The design as text: "39.6 A (9 motors × 4.4 A)" or "14.2 A". */
export const ampDesign = (c: AmpCheck) => `${c.design} A${c.perMotor ? ` (${c.motors} motors × ${c.perMotor} A)` : ""}`;

/** The phase readings as text: "0.3 / 0.3 / 3.0 A" (one decimal when any reading has one). */
export function ampPhases(c: AmpCheck): string {
  const dec = c.phases.some((x) => !Number.isInteger(x));
  return `${c.phases.map((x) => (dec ? x.toFixed(1) : String(x))).join(" / ")} A`;
}

/** For the AI: "phases 0.3 / 0.3 / 3.0 A, highest 3 A = 176% of design, OVER DESIGN (allowed up to 1.7 A)" /
 *  "21.0 A = 105% of design, within 90–110% (heater amps)" / "no reading". */
export function describeAmps(c: AmpCheck): string {
  if (c.actual === null) return "no reading";
  const ph = c.phases.length > 1 ? `phases ${ampPhases(c)}, ` : "";
  if (c.heater) return `${ph}${c.phases.length > 1 ? "furthest " : ""}${c.actual} A = ${fmtPct(c.pct!, HEATER_TOL)} of design ${c.design} A, ${c.over ? "OUTSIDE" : "within"} 90–110% (heater amps are always ±10%)`;
  return `${ph}${c.phases.length > 1 ? "highest " : ""}${c.actual} A = ${fmtPct(c.pct!)} of design, ${c.over ? "OVER DESIGN" : "within design"} (allowed up to ${ampDesign(c)})`;
}

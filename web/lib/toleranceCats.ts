// Project tolerance categories (shared by the website pages and the AI prompts).
// Specs often give different values by air/water side and different plus and minus values, so each
// category holds a +% and a −% (e.g. supply outlets +10/−0, exhaust 0/−10). Blank = not specified.

export type Tol = { plus: string; minus: string; isDefault?: boolean };   // isDefault: the company default, not set for this project
export type Tolerances = Record<string, Tol>;
export type ToleranceGroupKey = "ahu" | "fans" | "outlets" | "terminal" | "water";

export const TOLERANCE_GROUPS: { key: ToleranceGroupKey; label: string; items: { key: string; label: string }[] }[] = [
  { key: "ahu", label: "AHUs / RTUs", items: [
    { key: "ahu_supply", label: "Supply air" }, { key: "ahu_return", label: "Return air" }, { key: "ahu_oa", label: "Outside air" }] },
  { key: "fans", label: "Fans", items: [
    { key: "fan_supply", label: "Supply" }, { key: "fan_return", label: "Return" }, { key: "fan_exhaust", label: "Exhaust" }] },
  { key: "outlets", label: "Outlets & Inlets", items: [
    { key: "out_supply", label: "Supply" }, { key: "out_return", label: "Return" }, { key: "out_exhaust", label: "Exhaust" }] },
  { key: "terminal", label: "Terminal Units", items: [
    { key: "tu_max", label: "Max airflow" }, { key: "tu_min", label: "Min airflow" }] },
  { key: "water", label: "Water", items: [
    { key: "pumps", label: "Pumps" }, { key: "coils", label: "Coils" }, { key: "tu_coils", label: "TU / FCU coils" }] },
];

/** Every category, flat, with its group: { key, label: "Supply", full: "Outlets & Inlets – Supply", group }. */
export const TOLERANCE_CATS = TOLERANCE_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.key, full: `${g.label} – ${i.label}` })));
export const isToleranceKey = (k: string) => TOLERANCE_CATS.some((c) => c.key === k);

/** The project's tolerances with the company default (Admin → Settings, ±10% to start) filled into every
 *  category the project hasn't set. Those carry isDefault so pages can show them as "(default)". */
export function withDefaults(tol: Tolerances, def: Tol): Tolerances {
  const out: Tolerances = {};
  for (const c of TOLERANCE_CATS) out[c.key] = hasTol(tol[c.key]) ? tol[c.key] : { plus: def.plus, minus: def.minus, isDefault: true };
  return out;
}

/** Before categories were split (one ± value each): where an old value goes. */
export const LEGACY: Record<string, string[]> = {
  ahu: ["ahu_supply", "ahu_return", "ahu_oa"], rtu: ["ahu_supply", "ahu_return", "ahu_oa"],
  fans: ["fan_supply", "fan_return", "fan_exhaust"], outlets: ["out_supply", "out_return", "out_exhaust"],
  terminal: ["tu_max", "tu_min"], pumps: ["pumps"], coils: ["coils", "tu_coils"],
};

/** "±10%" or "+10/−0%". */
export const fmtTol = (t: Tol) => (t.plus === t.minus ? `±${t.plus}%` : `+${t.plus}/−${t.minus}%`);
export const hasTol = (t?: Tol) => !!t && (t.plus !== "" || t.minus !== "");

/** Read "10", "±10", "+10/-0", "0/-10", "+10% / -5%" into plus and minus. Null if it isn't one of those. */
export function parseTol(text: string): Tol | null {
  const s = String(text ?? "").replace(/%/g, "").replace(/\s+/g, "").replace(/[−–]/g, "-");
  let m = /^(?:±|\+\/-|\+-)?(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (m) return { plus: m[1], minus: m[1] };
  m = /^\+?(\d{1,2}(?:\.\d+)?)\/-?(\d{1,2}(?:\.\d+)?)$/.exec(s);
  return m ? { plus: m[1], minus: m[2] } : null;
}

const side = (text: string) =>
  /supply|^sf|\bsf[-\s]?\d/i.test(text) ? "supply" : /return|^rf|\brf[-\s]?\d/i.test(text) ? "return"
    : /exhaust|toilet|^t?ef|\bt?ef[-\s]?\d/i.test(text) ? "exhaust" : null;

/** The tolerance categories that apply to a unit, from its BuildingStart item type (sheet name) or Hitlist type,
 *  and its name/tag (SF-1, RF-2, EF-3...). Empty when none applies. */
export function categoriesFor(itemType: string, unitName = ""): string[] {
  const t = itemType.toLowerCase();
  if (/electric|sensor|chiller|boiler|cooling tower|duct traverse|face velocity|autoflow|filter|pressuriz|^ach/.test(t)) return [];
  if (/air handling|^ahu|roof top|^rtu|make-up|^mau|doas/.test(t)) return ["ahu_supply", "ahu_return", "ahu_oa"];
  if (/terminal|^vav/.test(t)) return ["tu_max", "tu_min"];
  if (/fan coil|^fcu|heat pump|wshp/.test(t)) return ["tu_coils"];
  if (/pump/.test(t)) return ["pumps"];
  if (/coil/.test(t)) return ["coils"];
  if (/outlet|inlet|diffuser|grille|register|^(supply|return|exhaust)( air)?s?$/.test(t)) {
    const s = side(t) ?? side(unitName);
    return s ? [`out_${s}`] : ["out_supply", "out_return", "out_exhaust"];
  }
  if (/fan|exhaust/.test(t)) {
    const s = side(unitName) ?? (/exhaust|toilet/.test(t) ? "exhaust" : null);
    return s ? [`fan_${s}`] : ["fan_supply", "fan_return", "fan_exhaust"];
  }
  return [];
}

/** Which groups a project's equipment needs (for showing only the relevant tolerance boxes). */
export const groupsFor = (itemType: string): ToleranceGroupKey[] =>
  [...new Set(categoriesFor(itemType).map((k) => TOLERANCE_CATS.find((c) => c.key === k)!.group))];

/** The groups for the equipment a project has, from its last sync (tracked types and untracked sheets like Supply Outlet). */
export function presentGroups(results: { types: { key: string; export_sheet: string; units: unknown[] }[];
  untracked_sheets?: Record<string, number> }): ToleranceGroupKey[] {
  return [...new Set<ToleranceGroupKey>([
    ...results.types.filter((t) => t.units.length).flatMap((t) => [...groupsFor(t.export_sheet), ...groupsFor(t.key)]),
    ...Object.entries(results.untracked_sheets ?? {}).filter(([, n]) => n > 0).flatMap(([sheet]) => groupsFor(sheet)),
  ])];
}

/** The project's tolerances that apply to a unit, as one line for the AI, e.g.
 *  "Outlets & Inlets – Supply +10/−0%". Null when none are set for it. */
export function toleranceFor(itemType: string, tol: Tolerances, unitName = ""): string | null {
  const parts = categoriesFor(itemType, unitName)
    .filter((k) => hasTol(tol[k]))
    .map((k) => `${TOLERANCE_CATS.find((c) => c.key === k)!.full} ${fmtTol(tol[k])}${tol[k].isDefault ? " (company default)" : ""}`);
  return parts.length ? parts.join("; ") : null;
}

/** One line per group for the Overview: "Outlets & Inlets: Supply +10/−0% · Return ±5%". */
export function toleranceSummary(tol: Tolerances): { group: string; text: string }[] {
  return TOLERANCE_GROUPS.map((g) => ({
    group: g.label,
    text: g.items.filter((i) => hasTol(tol[i.key])).map((i) => `${i.label} ${fmtTol(tol[i.key])}`).join(" · "),
  })).filter((x) => x.text);
}

/** Tolerances from anywhere (an AI answer, older saved answers with one ± number per old category) as
 *  { key: { plus, minus } } with today's keys. Anything unreadable is left out. */
export function normalizeTolerances(raw: Record<string, unknown> | null | undefined): Tolerances {
  const out: Tolerances = {};
  const read = (v: unknown) => typeof v === "object" && v ? parseTol(`${(v as Tol).plus ?? ""}/${(v as Tol).minus ?? ""}`)
    ?? parseTol(String((v as Tol).plus ?? "")) : parseTol(String(v ?? ""));
  const entries = Object.entries(raw ?? {});
  for (const [k, v] of entries) {                       // today's categories first...
    const t = isToleranceKey(k) ? read(v) : null;
    if (t) out[k] = t;
  }
  for (const [k, v] of entries) {                       // ...then old single values only fill what's missing
    const t = LEGACY[k] ? read(v) : null;
    if (t) for (const key of LEGACY[k]) if (!out[key]) out[key] = t;
  }
  return out;
}

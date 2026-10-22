// Company-wide settings (Admin → Settings), kept in the sheet's Settings tab: one row per setting.
import "server-only";
import type { User } from "./auth";
import { appendRows, ensureHeader, ensureTab, readTab, updateCell, updateRows } from "./sheets";
import { CATEGORIES, completePct, typeTotals, weightsFromSettings, type Weights } from "./completion";
import { loadResults } from "./results";
import { isToleranceKey, TOLERANCE_CATS, type Tol, type Tolerances } from "./toleranceCats";

export const DEFAULT_TOL: Tol = { plus: "10", minus: "10" };
const num = /^\d{1,2}(\.\d+)?$/;

export async function loadSettings(): Promise<Record<string, string>> {
  try {
    return Object.fromEntries((await readTab("Settings")).map((r) => [r.setting, r.value ?? ""]));
  } catch {
    return {};                        // tab not created yet
  }
}

const readTol = (s: Record<string, string>, plusKey: string, minusKey: string): Tol | null => {
  const plus = num.test(s[plusKey] ?? "") ? s[plusKey] : "";
  const minus = num.test(s[minusKey] ?? "") ? s[minusKey] : "";
  return plus || minus ? { plus: plus || minus, minus: minus || plus } : null;
};

/** Company defaults (Admin → Settings): "all equipment" (±10% to start) and any category given its own value. */
export type CompanyTol = { all: Tol; cats: Tolerances };
export async function companyTolerances(): Promise<CompanyTol> {
  const s = await loadSettings();
  const cats: Tolerances = {};
  for (const c of TOLERANCE_CATS) {
    const t = readTol(s, `default_tol_plus_${c.key}`, `default_tol_minus_${c.key}`);
    if (t) cats[c.key] = t;
  }
  return { all: readTol(s, "default_tol_plus", "default_tol_minus") ?? DEFAULT_TOL, cats };
}

/** The default for every category: its own company default, else the all-equipment one. */
export async function defaultTolerances(): Promise<Tolerances> {
  const { all, cats } = await companyTolerances();
  return Object.fromEntries(TOLERANCE_CATS.map((c) => [c.key, cats[c.key] ?? all]));
}

/** The all-equipment default (±10% unless an admin changed it). */
export async function defaultTolerance(): Promise<Tol> {
  return (await companyTolerances()).all;
}

/** Save settings (admins only, checked by the caller). Changes are logged in RuleHistory. */
export async function saveSettings(values: Record<string, string>, by: User) {
  await ensureTab("Settings");
  await ensureHeader("Settings");
  await ensureHeader("RuleHistory");
  const rows = await readTab("Settings", true);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const updates: { row: number; rec: Record<string, unknown> }[] = [];
  const adds: Record<string, unknown>[] = [];
  const log: Record<string, string>[] = [];
  for (const [setting, value] of Object.entries(values)) {
    const row = rows.find((r) => r.setting === setting);
    if ((row?.value ?? "") === value) continue;
    const rec = { setting, value, changed_by: by.email, changed_at: now };
    if (row) updates.push({ row: row._row, rec }); else adds.push(rec);
    log.push({ changed_at: now, changed_by: by.email, type_key: "settings", field: setting,
      old_status: row?.value || "(none)", new_status: value || "(none)", project_number: "" });
  }
  if (updates.length) await updateRows("Settings", updates);
  if (adds.length) await appendRows("Settings", adds);
  if (log.length) await appendRows("RuleHistory", log);
}

/** Save the company defaults: the all-equipment value (required) and each category's (blank = use all-equipment). */
export async function saveCompanyTolerances(all: Partial<Tol>, cats: Record<string, Partial<Tol>>, by: User): Promise<CompanyTol> {
  const check = (t?: Partial<Tol>) => {
    const plus = (t?.plus ?? "").trim(), minus = (t?.minus ?? "").trim();
    for (const x of [plus, minus]) if (x && !num.test(x)) throw new Error("Tolerances are a number like 5 or 10 (percent)");
    return { plus: plus || minus, minus: minus || plus };
  };
  const a = check(all);
  if (!a.plus) throw new Error("Enter the all-equipment default, e.g. 10");
  const values: Record<string, string> = { default_tol_plus: a.plus, default_tol_minus: a.minus };
  for (const [k, t] of Object.entries(cats ?? {})) {
    if (!isToleranceKey(k)) throw new Error("Unknown tolerance");
    const c = check(t);
    values[`default_tol_plus_${k}`] = c.plus;
    values[`default_tol_minus_${k}`] = c.minus;
  }
  await saveSettings(values, by);
  return companyTolerances();
}

/** Completion weights (Admin → Completion weights): each category's share of the job. */
export async function loadWeights(): Promise<Weights> {
  return weightsFromSettings(await loadSettings());
}

/** Save the shares (must total 100), then recalculate every project's overall % from its last sync. */
export async function saveWeights(input: Record<string, unknown>, by: User): Promise<{ weights: Weights; updated: number }> {
  const values: Record<string, string> = {};
  let total = 0;
  for (const c of CATEGORIES) {
    const v = Number(String(input[c.key] ?? "").trim());
    if (String(input[c.key] ?? "").trim() === "" || !isFinite(v) || v < 0 || v > 100) throw new Error(`Enter a % from 0 to 100 for ${c.label}`);
    values[`weight_${c.key}`] = String(v);
    total += v;
  }
  if (Math.abs(total - 100) > 0.001) throw new Error(`The shares add up to ${Math.round(total * 10) / 10}%, not 100%`);
  await saveSettings(values, by);
  await ensureHeader("Projects");
  const weights = await loadWeights();
  let updated = 0;
  for (const p of await readTab("Projects", true)) {
    const key = (p.project_id || "").trim() || p.project_number;
    const r = key ? await loadResults(key) : null;
    if (!r) continue;
    const pct = String(completePct(typeTotals(r.types), weights, r.summary.fields_pct));
    if (pct !== (p.complete_pct ?? "")) { await updateCell("Projects", p._row, "complete_pct", pct); updated++; }
  }
  return { weights, updated };
}

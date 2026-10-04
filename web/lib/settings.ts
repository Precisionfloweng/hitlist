// Company-wide settings (Admin → Settings), kept in the sheet's Settings tab: one row per setting.
import "server-only";
import type { User } from "./auth";
import { appendRows, ensureHeader, ensureTab, readTab, updateRows } from "./sheets";
import type { Tol } from "./toleranceCats";

export const DEFAULT_TOL: Tol = { plus: "10", minus: "10" };
const num = /^\d{1,2}(\.\d+)?$/;

export async function loadSettings(): Promise<Record<string, string>> {
  try {
    return Object.fromEntries((await readTab("Settings")).map((r) => [r.setting, r.value ?? ""]));
  } catch {
    return {};                        // tab not created yet
  }
}

/** The tolerance used for any category a project hasn't set (±10% unless an admin changed it). */
export async function defaultTolerance(): Promise<Tol> {
  const s = await loadSettings();
  const plus = num.test(s.default_tol_plus ?? "") ? s.default_tol_plus : "";
  const minus = num.test(s.default_tol_minus ?? "") ? s.default_tol_minus : "";
  return plus || minus ? { plus: plus || minus, minus: minus || plus } : DEFAULT_TOL;
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

export async function saveDefaultTolerance(t: Partial<Tol>, by: User): Promise<Tol> {
  const plus = (t.plus ?? "").trim(), minus = (t.minus ?? "").trim();
  if (!plus && !minus) throw new Error("Enter the default tolerance, e.g. 10");
  for (const x of [plus, minus]) if (x && !num.test(x)) throw new Error("Tolerances are a number like 5 or 10 (percent)");
  await saveSettings({ default_tol_plus: plus || minus, default_tol_minus: minus || plus }, by);
  return defaultTolerance();
}

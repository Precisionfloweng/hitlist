// A project's tolerances (+% / −% by category), typed in by a tech on the project's Rules tab. Blank = not set.
import "server-only";
import type { User } from "./auth";
import { appendRows, deleteRows, ensureHeader, ensureTab, readTab, updateRows } from "./sheets";
import { fmtTol, isToleranceKey, LEGACY, parseTol, TOLERANCE_CATS, type Tol, type Tolerances } from "./toleranceCats";

const num = /^\d{1,2}(\.\d+)?$/;

/** A row's value: plus/minus columns, or (rows saved before the split) the single ± "pct". */
function rowTol(r: Record<string, string>): Tol | null {
  if (num.test(r.plus ?? "") || num.test(r.minus ?? "")) {
    const plus = num.test(r.plus ?? "") ? r.plus : r.minus, minus = num.test(r.minus ?? "") ? r.minus : r.plus;
    return { plus, minus };
  }
  return parseTol(r.pct ?? "");
}

export async function loadTolerances(project: string): Promise<Tolerances> {
  try {
    const rows = (await readTab("Tolerances")).filter((r) => r.project_number === project);
    const out: Tolerances = {};
    for (const r of rows) {                                   // current categories first
      const t = rowTol(r);
      if (t && isToleranceKey(r.category)) out[r.category] = t;
    }
    for (const r of rows) {                                   // then old single values fill what isn't set
      const t = rowTol(r);
      for (const k of (t && LEGACY[r.category]) || []) if (!out[k]) out[k] = t!;
    }
    return out;
  } catch {
    return {};                      // tab not created yet
  }
}

/** Save the boxes shown for one project. A key with both boxes blank removes that value; a blank box takes
 *  the other box's number (so "10" alone means ±10). Each change is logged in RuleHistory. */
export async function saveTolerances(project: string, values: Record<string, Partial<Tol>>, by: User): Promise<Tolerances> {
  const clean: Record<string, Tol | null> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!isToleranceKey(k)) throw new Error("Unknown tolerance");
    const plus = (v?.plus ?? "").trim(), minus = (v?.minus ?? "").trim();
    for (const x of [plus, minus]) if (x && !num.test(x)) throw new Error("Tolerances are a number like 5 or 10 (percent)");
    clean[k] = plus || minus ? { plus: plus || minus, minus: minus || plus } : null;
  }
  const before = await loadTolerances(project);
  await ensureTab("Tolerances");
  await ensureHeader("Tolerances");
  await ensureHeader("RuleHistory");
  const rows = (await readTab("Tolerances", true)).filter((r) => r.project_number === project);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const updates: { row: number; rec: Record<string, unknown> }[] = [];
  const adds: Record<string, unknown>[] = [];
  const log: Record<string, string>[] = [];
  // Old single-value rows are replaced by the split categories (their values were already carried over).
  const removes = rows.filter((r) => LEGACY[r.category] && !isToleranceKey(r.category)).map((r) => r._row);
  const keep = (k: string) => (k in clean ? clean[k] : before[k] ?? null);
  for (const c of TOLERANCE_CATS) {
    const v = keep(c.key);
    const row = rows.find((r) => r.category === c.key);
    const was = before[c.key];
    const rec = v && { project_number: project, category: c.key, pct: v.plus === v.minus ? v.plus : "", plus: v.plus,
      minus: v.minus, changed_by: by.email, changed_at: now };
    if (!v && row) removes.push(row._row);
    else if (v && row) {
      const cur = rowTol(row);
      if (!cur || fmtTol(cur) !== fmtTol(v)) updates.push({ row: row._row, rec: rec! });
    }
    else if (v) adds.push(rec!);
    if (c.key in clean && (was ? fmtTol(was) : "") !== (v ? fmtTol(v) : "")) {
      log.push({ changed_at: now, changed_by: by.email, type_key: "tolerances", field: c.full,
        old_status: was ? fmtTol(was) : "(none)", new_status: v ? fmtTol(v) : "(none)", project_number: project });
    }
  }
  if (!log.length && !removes.length) return before;
  if (updates.length) await updateRows("Tolerances", updates);
  if (adds.length) await appendRows("Tolerances", adds);
  if (removes.length) await deleteRows("Tolerances", removes);
  if (log.length) await appendRows("RuleHistory", log);
  return loadTolerances(project);
}

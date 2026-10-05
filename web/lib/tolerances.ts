// A project's tolerances (+% / −% by category), typed in by a tech on the project's Rules tab. Blank = not set.
import "server-only";
import type { User } from "./auth";
import { appendRows, deleteRows, ensureHeader, ensureTab, readTab, updateRows } from "./sheets";
import { defaultTolerance } from "./settings";
import { fmtTol, isToleranceKey, LEGACY, parseTol, TOLERANCE_CATS, withDefaults, type Tol, type Tolerances } from "./toleranceCats";

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

export type TolSourceIn = { kind: "spec" | "hand"; note?: string };
/** Where a project's saved value came from. "" = saved before sources were recorded. */
export type TolSource = { source: "spec" | "hand" | ""; note: string; by: string; at: string };

export async function loadToleranceSources(project: string): Promise<Record<string, TolSource>> {
  try {
    const out: Record<string, TolSource> = {};
    for (const r of (await readTab("Tolerances")).filter((r) => r.project_number === project && isToleranceKey(r.category))) {
      out[r.category] = { source: r.source === "spec" || r.source === "hand" ? r.source : "", note: r.source_note ?? "",
        by: r.changed_by ?? "", at: r.changed_at ?? "" };
    }
    return out;
  } catch {
    return {};
  }
}

/** Every category: the project's value, or the company default (marked isDefault) where it hasn't set one. */
export async function loadTolerancesWithDefaults(project: string): Promise<{ tol: Tolerances; def: Tol }> {
  const [tol, def] = await Promise.all([loadTolerances(project), defaultTolerance()]);
  return { tol: withDefaults(tol, def), def };
}

/** Save the boxes shown for one project. A key with both boxes blank removes that value; a blank box takes
 *  the other box's number (so "10" alone means ±10). Each change is logged in RuleHistory. */
export async function saveTolerances(project: string, values: Record<string, Partial<Tol>>, by: User,
  from?: TolSourceIn): Promise<Tolerances> {
  // Where these values came from: the spec (file and page, from the AI answer) or typed in by hand.
  const source = from?.kind === "spec" ? "spec" : "hand";
  const note = from?.kind === "spec" ? (from.note ?? "").slice(0, 300) : "";
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
    const mine = c.key in clean;                       // only the values in this save take its source
    const rec = v && { project_number: project, category: c.key, pct: v.plus === v.minus ? v.plus : "", plus: v.plus,
      minus: v.minus, changed_by: mine ? by.email : row?.changed_by ?? by.email, changed_at: mine ? now : row?.changed_at ?? now,
      source: mine ? source : row?.source ?? "", source_note: mine ? note : row?.source_note ?? "" };
    if (!v && row) removes.push(row._row);
    else if (v && row) {
      const cur = rowTol(row);
      const changed = !cur || fmtTol(cur) !== fmtTol(v);
      // A spec save of the same value still records that it now comes from the spec.
      const respec = mine && source === "spec" && (row.source !== "spec" || (row.source_note ?? "") !== note);
      if (changed || respec) updates.push({ row: row._row, rec: rec! });
    }
    else if (v) adds.push(rec!);
    if (c.key in clean && (was ? fmtTol(was) : "") !== (v ? fmtTol(v) : "")) {
      log.push({ changed_at: now, changed_by: by.email, type_key: "tolerances", field: c.full,
        old_status: was ? fmtTol(was) : "(none)", new_status: v ? fmtTol(v) : "(none)", project_number: project });
    }
  }
  if (!log.length && !removes.length && !updates.length && !adds.length) return before;
  if (updates.length) await updateRows("Tolerances", updates);
  if (adds.length) await appendRows("Tolerances", adds);
  if (removes.length) await deleteRows("Tolerances", removes);
  if (log.length) await appendRows("RuleHistory", log);
  return loadTolerances(project);
}

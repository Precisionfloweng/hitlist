// A project's tolerances (±%), typed in by a tech on the project's Rules tab. Blank = not set.
import "server-only";
import type { User } from "./auth";
import { appendRows, deleteRows, ensureHeader, ensureTab, readTab, updateRows } from "./sheets";
import { TOLERANCE_CATS, type Tolerances } from "./toleranceCats";

export async function loadTolerances(project: string): Promise<Tolerances> {
  try {
    const rows = await readTab("Tolerances");
    const out: Tolerances = {};
    for (const r of rows) {
      if (r.project_number === project && r.pct && TOLERANCE_CATS.some((c) => c.key === r.category)) {
        out[r.category as keyof Tolerances] = r.pct;
      }
    }
    return out;
  } catch {
    return {};                      // tab not created yet
  }
}

/** Save the boxes for one project (blank removes a value). Each change is logged in RuleHistory. */
export async function saveTolerances(project: string, values: Tolerances, by: User): Promise<Tolerances> {
  for (const [k, v] of Object.entries(values)) {
    if (!TOLERANCE_CATS.some((c) => c.key === k)) throw new Error("Unknown tolerance");
    if (v && !/^\d{1,2}(\.\d+)?$/.test(v.trim())) throw new Error("Tolerances are a number like 5 or 10 (meaning ±%)");
  }
  await ensureTab("Tolerances");
  await ensureHeader("RuleHistory");
  const rows = (await readTab("Tolerances", true)).filter((r) => r.project_number === project);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const updates: { row: number; rec: Record<string, unknown> }[] = [];
  const adds: Record<string, unknown>[] = [];
  const removes: number[] = [];
  const log: Record<string, string>[] = [];
  for (const c of TOLERANCE_CATS) {
    if (!(c.key in values)) continue;
    const v = (values[c.key] ?? "").trim();
    const row = rows.find((r) => r.category === c.key);
    const old = row?.pct ?? "";
    if (v === old) continue;
    if (!v && row) removes.push(row._row);
    else if (row) updates.push({ row: row._row, rec: { project_number: project, category: c.key, pct: v, changed_by: by.email, changed_at: now } });
    else adds.push({ project_number: project, category: c.key, pct: v, changed_by: by.email, changed_at: now });
    log.push({ changed_at: now, changed_by: by.email, type_key: "tolerances", field: c.label,
      old_status: old ? `±${old}%` : "(none)", new_status: v ? `±${v}%` : "(none)", project_number: project });
  }
  if (updates.length) await updateRows("Tolerances", updates);
  if (adds.length) await appendRows("Tolerances", adds);
  if (removes.length) await deleteRows("Tolerances", removes);
  if (log.length) await appendRows("RuleHistory", log);
  return loadTolerances(project);
}

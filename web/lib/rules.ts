import "server-only";
import { appendRows, ensureHeader, ensureTab, readTab, readTabs, updateRows, type Rec } from "./sheets";
import type { User } from "./auth";
import { byTypeOrder } from "./typeOrder";

export type Condition = { column?: string | null; label?: string; equals?: string; gt?: number; filled?: boolean };
export type RuleField = {
  order: number; field: string; columns: string; when: Condition[];
  status: string;          // what applies (the project's own choice, or the default)
  defaultStatus: string;   // the company default
};
export type RuleType = {
  key: string; name: string; exportSheet: string; confirmed: boolean; parentTypes: string;
  fields: RuleField[];
};
export type HistoryRow = { changedAt: string; changedBy: string; typeKey: string; field: string; old: string; new: string };

async function projectOverrides(project: string): Promise<Rec[]> {
  await ensureTab("ProjectRules");
  return (await readTab("ProjectRules", true)).filter((r) => r.project_number === project);
}

/** The company default rules, or (with `project`) what applies to that one project. */
export async function loadRules(project?: string): Promise<{ types: RuleType[]; history: HistoryRow[] }> {
  const { Rules, RuleHistory } = await readTabs(["Rules", "RuleHistory"], true);
  const overrides = new Map<string, string>();
  if (project) for (const o of await projectOverrides(project)) if (o.status) overrides.set(`${o.type_key}|${o.field}`, o.status);
  const byKey = new Map<string, RuleType>();
  for (const r of Rules) {
    let t = byKey.get(r.type_key);
    if (!t) {
      t = { key: r.type_key, name: r.type_name, exportSheet: r.export_sheet, confirmed: r.sheet_confirmed !== "no",
        parentTypes: r.parent_types, fields: [] };
      byKey.set(r.type_key, t);
    }
    let when: Condition[] = [];
    try { when = r.when ? JSON.parse(r.when) : []; } catch { when = []; }
    const def = r.status || "required";
    t.fields.push({ order: Number(r.order) || 0, field: r.field, columns: r.columns, when,
      defaultStatus: def, status: overrides.get(`${r.type_key}|${r.field}`) ?? def });
  }
  const types = [...byKey.values()].sort(byTypeOrder);
  types.forEach((t) => t.fields.sort((a, b) => a.order - b.order));
  const history = RuleHistory.filter((h) => (h.project_number || "") === (project ?? "")).map((h) => ({ changedAt: h.changed_at, changedBy: h.changed_by, typeKey: h.type_key,
    field: h.field, old: h.old_status, new: h.new_status })).sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  return { types, history };
}

export type RuleChange =
  | { kind: "status"; order: number; value: string }
  | { kind: "columns"; order: number; value: string }
  | { kind: "sheet"; value: string; confirmed: boolean };

const STATUSES = ["required", "optional", "ignore"];

/** Apply edits to one equipment type and log each one to RuleHistory. */
export async function saveRuleChanges(typeKey: string, changes: RuleChange[], by: User): Promise<number> {
  const { Rules } = await readTabs(["Rules"], true);
  const rows = Rules.filter((r) => r.type_key === typeKey);
  if (!rows.length) throw new Error("Unknown equipment type");
  const now = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const edited = new Map<number, Record<string, unknown>>();
  const log: Record<string, string>[] = [];
  const get = (r: Rec) => (edited.get(r._row) ?? { ...r }) as Record<string, string>;

  for (const c of changes) {
    if (c.kind === "sheet") {
      const sheet = c.value.trim();
      if (!sheet) throw new Error("Export sheet name can't be blank");
      const confirmed = c.confirmed ? "yes" : "no";
      if (rows[0].export_sheet === sheet && rows[0].sheet_confirmed === confirmed) continue;
      for (const r of rows) edited.set(r._row, { ...get(r), export_sheet: sheet, sheet_confirmed: confirmed });
      log.push({ changed_at: now, changed_by: by.email, type_key: typeKey, field: "(export sheet)",
        old_status: `sheet=${rows[0].export_sheet}`, new_status: `sheet=${sheet}${c.confirmed ? "" : " (unconfirmed)"}` });
      continue;
    }
    const r = rows.find((x) => Number(x.order) === c.order);
    if (!r) throw new Error(`Field #${c.order} not found`);
    const cur = get(r);
    if (c.kind === "status") {
      if (!STATUSES.includes(c.value)) throw new Error("Status must be required, optional or ignore");
      if (cur.status === c.value) continue;
      log.push({ changed_at: now, changed_by: by.email, type_key: typeKey, field: r.field,
        old_status: cur.status, new_status: c.value });
      edited.set(r._row, { ...cur, status: c.value });
    } else {
      const cols = c.value.split("|").map((s) => s.trim()).filter(Boolean).join(" | ");
      if (cur.columns === cols) continue;
      log.push({ changed_at: now, changed_by: by.email, type_key: typeKey, field: r.field,
        old_status: `columns=${cur.columns}`, new_status: `columns=${cols}` });
      edited.set(r._row, { ...cur, columns: cols });
    }
  }
  await updateRows("Rules", [...edited.entries()].map(([row, rec]) => ({ row, rec })));
  if (log.length) await appendRows("RuleHistory", log);
  return log.length;
}

/** Change required/optional/ignore for one project only. Picking the default again removes the project's change. */
export async function saveProjectRuleChanges(project: string, typeKey: string, changes: RuleChange[], by: User): Promise<number> {
  const { types } = await loadRules(project);
  const t = types.find((x) => x.key === typeKey);
  if (!t) throw new Error("Unknown equipment type");
  await ensureTab("ProjectRules");
  await ensureHeader("RuleHistory");
  const existing = await projectOverrides(project);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const updates: { row: number; rec: Record<string, unknown> }[] = [];
  const adds: Record<string, unknown>[] = [];
  const log: Record<string, string>[] = [];
  for (const c of changes) {
    if (c.kind !== "status") throw new Error("Only required / optional / ignore can be changed for one project");
    if (!STATUSES.includes(c.value)) throw new Error("Status must be required, optional or ignore");
    const f = t.fields.find((x) => x.order === c.order);
    if (!f) throw new Error(`Field #${c.order} not found`);
    if (f.status === c.value) continue;
    const status = c.value === f.defaultStatus ? "" : c.value;   // back to default = no project change
    const rec = { project_number: project, type_key: typeKey, field: f.field, status, changed_by: by.email, changed_at: now };
    const row = existing.find((o) => o.type_key === typeKey && o.field === f.field);
    if (row) updates.push({ row: row._row, rec });
    else if (status) adds.push(rec);
    log.push({ changed_at: now, changed_by: by.email, type_key: typeKey, field: f.field,
      old_status: f.status, new_status: c.value, project_number: project });
  }
  if (updates.length) await updateRows("ProjectRules", updates);
  if (adds.length) await appendRows("ProjectRules", adds);
  if (log.length) await appendRows("RuleHistory", log);
  return log.length;
}

import "server-only";
import { appendRows, ensureHeader, ensureTab, readTab, readTabs, updateRows, type Rec } from "./sheets";
import type { User } from "./auth";
import { byTypeOrder } from "./typeOrder";
import { describeItems, type FieldWeight } from "./weightItems";

export type Condition = { column?: string | null; label?: string; equals?: string; gt?: number; filled?: boolean };
export type RuleField = {
  order: number; field: string; columns: string; when: Condition[];
  status: string;          // what applies (the project's own choice, or the default)
  defaultStatus: string;   // the company default
  weight: number | null;   // completion weight in % (company-wide; admins set it on Admin → Completion weights)
  group: string;           // fields with the same weight group count as one item (e.g. "Unit Data")
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
    const w = Number(r.weight);
    t.fields.push({ order: Number(r.order) || 0, field: r.field, columns: r.columns, when,
      defaultStatus: def, status: overrides.get(`${r.type_key}|${r.field}`) ?? def,
      weight: r.weight !== undefined && String(r.weight).trim() !== "" && isFinite(w) ? w : null, group: (r.weight_group ?? "").trim() });
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

/** Save one type's item weights (admins only, checked by the caller): `fields` gives each changed field's new weight
 *  (% or null) and weight group ("" = its own item). A group's members all get the group's weight; a group or field
 *  with no weight drops out. One RuleHistory row per item that changed ("Weight: Unit Data"). Returns rows changed. */
export async function saveTypeWeights(typeKey: string, fields: { order: number; weight: number | string | null; group: string }[],
  by: User): Promise<number> {
  await ensureHeader("Rules");
  await ensureHeader("RuleHistory");
  const { Rules } = await readTabs(["Rules"], true);
  const rows = Rules.filter((r) => r.type_key === typeKey);
  if (!rows.length) throw new Error("Unknown equipment type");
  const asFW = (r: Rec, w: string, g: string): FieldWeight => ({ order: Number(r.order), field: r.field, weight: Number(w) || null, group: g });
  const before = rows.map((r) => asFW(r, String(r.weight ?? ""), String(r.weight_group ?? "").trim()));
  const next = new Map(rows.map((r) => [Number(r.order), { w: String(r.weight ?? ""), g: String(r.weight_group ?? "").trim() }]));
  for (const f of fields) {
    const cur = next.get(Number(f.order));
    if (!cur) throw new Error("Unknown field");
    const text = f.weight === null || f.weight === undefined ? "" : String(f.weight).trim();
    const n = Number(text);
    if (text !== "" && (!isFinite(n) || n < 0 || n > 100)) throw new Error("A weight is a % from 0 to 100");
    const g = String(f.group ?? "").trim().replace(/\s+/g, " ");
    if (g.length > 40) throw new Error("Keep a combined item's name under 40 characters");
    next.set(Number(f.order), { w: text === "" || n === 0 ? "" : String(n), g });
  }
  // a group's weight is shared by every member; a group with no weight is undone
  const groupW = new Map<string, string>();
  for (const v of next.values()) if (v.g && v.w) groupW.set(v.g.toLowerCase(), String(Math.max(Number(groupW.get(v.g.toLowerCase()) ?? 0), Number(v.w))));
  for (const v of next.values()) if (v.g) { const w = groupW.get(v.g.toLowerCase()); if (w) v.w = w; else { v.g = ""; v.w = ""; } }
  const updates: { row: number; rec: Record<string, unknown> }[] = [];
  for (const r of rows) {
    const v = next.get(Number(r.order))!;
    if (String(r.weight ?? "") !== v.w || String(r.weight_group ?? "").trim() !== v.g) updates.push({ row: r._row, rec: { ...r, weight: v.w, weight_group: v.g } });
  }
  if (!updates.length) return 0;
  const after = rows.map((r) => { const v = next.get(Number(r.order))!; return asFW(r, v.w, v.g); });
  const was = describeItems(before), now = describeItems(after);
  const at = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const log: Record<string, string>[] = [];
  for (const name of new Set([...was.keys(), ...now.keys()])) {
    if (was.get(name) === now.get(name)) continue;
    log.push({ changed_at: at, changed_by: by.email, type_key: typeKey, field: `Weight: ${name}`,
      old_status: was.get(name) ?? "(none)", new_status: now.get(name) ?? "(none)", project_number: "" });
  }
  await updateRows("Rules", updates);
  if (log.length) await appendRows("RuleHistory", log);
  return updates.length;
}

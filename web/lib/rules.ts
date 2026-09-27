import "server-only";
import { appendRows, readTabs, updateRows, type Rec } from "./sheets";
import type { User } from "./auth";

export type Condition = { column?: string | null; label?: string; equals?: string; gt?: number };
export type RuleField = { order: number; field: string; columns: string; status: string; when: Condition[] };
export type RuleType = {
  key: string; name: string; exportSheet: string; confirmed: boolean; parentTypes: string;
  fields: RuleField[];
};
export type HistoryRow = { changedAt: string; changedBy: string; typeKey: string; field: string; old: string; new: string };

export async function loadRules(): Promise<{ types: RuleType[]; history: HistoryRow[] }> {
  const { Rules, RuleHistory } = await readTabs(["Rules", "RuleHistory"], true);
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
    t.fields.push({ order: Number(r.order) || 0, field: r.field, columns: r.columns, status: r.status || "required", when });
  }
  const types = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  types.forEach((t) => t.fields.sort((a, b) => a.order - b.order));
  const history = RuleHistory.map((h) => ({ changedAt: h.changed_at, changedBy: h.changed_by, typeKey: h.type_key,
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

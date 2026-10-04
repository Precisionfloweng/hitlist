// The Google Sheet "PFE Hitlist Data" as a small database (same tabs as worker/hitlist/store.py).
import "server-only";
import { JWT } from "google-auth-library";

export const SCHEMA = {
  Projects: ["project_number", "name", "tech", "date", "address", "status", "buildingstart_url",
    "last_sync", "last_sync_status", "fields_pct", "units_pct", "units",
    "open_deficiencies", "open_high", "gap_flags", "project_id",
    // Dropbox project folder and document index (written by the server; dropbox_path can be pasted on AI Tools)
    "dropbox_id", "dropbox_path", "docs_updated", "docs_status",
    // newest file in the project's Dropbox "Deficiency Reports" folder = last punch list sent (server)
    "punch_sent", "punch_file",
    // BuildingStart values sent for Search the Documents (server): date, and "ok: N units, N values" or the problem
    "values_updated", "values_status"],
  // projects: for role "customer", the project keys they may see (" | " separated)
  // last_seen: date (Central) the person last opened the app, updated at most once a day.
  Users: ["email", "name", "role", "active", "added", "password_hash", "projects", "last_seen"],
  Rules: ["type_key", "type_name", "export_sheet", "sheet_confirmed", "parent_types",
    "order", "field", "columns", "status", "when"],
  RuleHistory: ["changed_at", "changed_by", "type_key", "field", "old_status", "new_status", "project_number"],
  // One project's differences from the default rules (status only). Blank status = use the default.
  ProjectRules: ["project_number", "type_key", "field", "status", "changed_by", "changed_at"],
  // kind: blank = BuildingStart sync, "docs" = read the project's Dropbox documents
  Queue: ["id", "project_number", "requested_by", "requested_at", "status",
    "started_at", "finished_at", "message", "kind"],
  Dashboard: ["project_number", "type", "units", "units_complete", "required_fields",
    "required_filled", "missing_required", "missing_optional", "fields_pct", "units_pct", "updated_at"],
  Deficiencies: ["project_number", "group", "value", "count", "updated_at"],
  History: ["project_number", "synced_at", "fields_pct", "units_pct", "units",
    "open_deficiencies", "open_high"],
  // A project's tolerances (+% / −%) by category, typed in on the project's Rules tab. Website only.
  // pct = the single ± value (also how rows saved before the +/− split are read).
  Tolerances: ["project_number", "category", "pct", "changed_by", "changed_at", "plus", "minus"],
  // A project's email list for sending the deficiency list, kept on the project's Contacts tab. Website only.
  // on_list: "yes" = included in the "New email" link; send_as: "to" or "cc".
  Contacts: ["project_number", "id", "name", "company", "trade", "email", "on_list", "added_by", "added_at", "position", "send_as"],
  // Company-wide settings (Admin → Settings), e.g. default_tol_plus / default_tol_minus.
  Settings: ["setting", "value", "changed_by", "changed_at"],
  // Server heartbeat: "server_last_seen" (worker, every 5 min) and "down_alert_sent_for" (website).
  Status: ["name", "value", "local_time"],
  // One row per sign-in (time in Central). Written by the website only.
  SignIns: ["signed_in_at", "email", "name", "role", "method", "device"],
} as const;

export type Tab = keyof typeof SCHEMA;
export type Rec = Record<string, string> & { _row: number };

const API = "https://sheets.googleapis.com/v4/spreadsheets/";
let client: JWT | null = null;

function sheetId(): string {
  const id = process.env.HITLIST_SHEET_ID;
  if (!id) throw new Error("HITLIST_SHEET_ID is not set");
  return id;
}

function auth(): JWT {
  if (!client) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
    const key = JSON.parse(raw);
    client = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  return client;
}

async function call(path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
  const url = new URL(API + sheetId() + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await auth().request({
    url: url.toString(),
    method: (init.method ?? "GET") as "GET",
    data: init.body,
  });
  return res.data as Record<string, unknown>;
}

const rangeFor = (tab: string, a1 = "") => encodeURIComponent(`'${tab}'${a1 ? "!" + a1 : ""}`);

function toRecords(values: string[][] | undefined): Rec[] {
  if (!values || values.length === 0) return [];
  const head = values[0];
  const out: Rec[] = [];
  values.slice(1).forEach((r, i) => {
    const rec = { _row: i + 2 } as Rec;
    head.forEach((h, j) => (rec[h] = r[j] ?? ""));
    if (head.some((h) => rec[h] !== "")) out.push(rec);
  });
  return out;
}

// Short in-memory cache so a page with several tabs doesn't hammer the API.
const cache = new Map<string, { at: number; data: Rec[] }>();
const TTL_MS = 15_000;

export function invalidate(...tabs: Tab[]) {
  for (const t of tabs) cache.delete(t);
}

/** Read several tabs in one API call. */
export async function readTabs<T extends Tab>(tabs: T[], fresh = false): Promise<Record<T, Rec[]>> {
  const now = Date.now();
  const out = {} as Record<T, Rec[]>;
  const need = tabs.filter((t) => {
    const hit = cache.get(t);
    if (!fresh && hit && now - hit.at < TTL_MS) {
      out[t] = hit.data;
      return false;
    }
    return true;
  });
  if (need.length) {
    const qs = need.map((t) => "ranges=" + rangeFor(t)).join("&");
    const data = await call(`/values:batchGet?${qs}`);
    const ranges = (data.valueRanges as { values?: string[][] }[]) ?? [];
    need.forEach((t, i) => {
      const recs = toRecords(ranges[i]?.values);
      cache.set(t, { at: now, data: recs });
      out[t] = recs;
    });
  }
  return out;
}

export async function readTab(tab: Tab, fresh = false): Promise<Rec[]> {
  return (await readTabs([tab], fresh))[tab];
}

const toRow = (tab: Tab, rec: Record<string, unknown>) =>
  SCHEMA[tab].map((c) => (rec[c] === undefined || rec[c] === null ? "" : String(rec[c])));

export async function appendRows(tab: Tab, recs: Record<string, unknown>[]) {
  await call(`/values/${rangeFor(tab, "A1")}:append`, {
    method: "POST",
    query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    body: { values: recs.map((r) => toRow(tab, r)) },
  });
  invalidate(tab);
}

export async function updateRow(tab: Tab, row: number, rec: Record<string, unknown>) {
  await call(`/values/${rangeFor(tab, `A${row}`)}`, {
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [toRow(tab, rec)] },
  });
  invalidate(tab);
}

/** Write one cell (by column name) without touching the rest of the row. */
export async function updateCell(tab: Tab, row: number, column: string, value: string) {
  const i = (SCHEMA[tab] as readonly string[]).indexOf(column);
  if (i < 0) throw new Error(`No column ${column} in ${tab}`);
  const letter = i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(65 + i - 26);
  await call(`/values/${rangeFor(tab, `${letter}${row}`)}`, {
    method: "PUT", query: { valueInputOption: "RAW" }, body: { values: [[value]] },
  });
  invalidate(tab);
}

let gids: Record<string, number> | null = null;
async function gidFor(tab: Tab): Promise<number> {
  if (!gids || gids[tab] === undefined) {
    const meta = await call("", { query: { fields: "sheets.properties(sheetId,title)" } });
    gids = {};
    for (const s of (meta.sheets as { properties: { sheetId: number; title: string } }[]) ?? []) {
      gids[s.properties.title] = s.properties.sheetId;
    }
  }
  return gids[tab];
}

export async function deleteRow(tab: Tab, row: number) {
  const gid = await gidFor(tab);
  await call(":batchUpdate", {
    method: "POST",
    body: { requests: [{ deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
  });
  invalidate(tab);
}

/** Make sure row 1 of a tab has every column in SCHEMA (new columns are only ever added at the end). */
export async function ensureHeader(tab: Tab) {
  const data = await call(`/values/${rangeFor(tab, "1:1")}`);
  const have = ((data.values as string[][] | undefined)?.[0] ?? []);
  const want = SCHEMA[tab] as readonly string[];
  if (want.every((c, i) => have[i] === c)) return;
  await call(`/values/${rangeFor(tab, "A1")}`, {
    method: "PUT", query: { valueInputOption: "RAW" }, body: { values: [want] },
  });
  invalidate(tab);
}

/** Update several rows of one tab in a single API call. */
export async function updateRows(tab: Tab, updates: { row: number; rec: Record<string, unknown> }[]) {
  if (!updates.length) return;
  await call("/values:batchUpdate", {
    method: "POST",
    body: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({ range: `'${tab}'!A${u.row}`, values: [toRow(tab, u.rec)] })),
    },
  });
  invalidate(tab);
}

/** Create a tab (with its header row) if the sheet doesn't have it yet. */
const ensured = new Set<Tab>();
export async function ensureTab(tab: Tab) {
  if (ensured.has(tab)) return;
  await gidFor(tab);
  if (gids?.[tab] === undefined) {
    await call(":batchUpdate", { method: "POST", body: { requests: [{ addSheet: { properties: { title: tab } } }] } });
    gids = null;
  }
  await ensureHeader(tab);
  ensured.add(tab);
}

/** Delete several rows of one tab in a single call (bottom-up, so row numbers stay valid). */
export async function deleteRows(tab: Tab, rows: number[]) {
  if (!rows.length) return;
  const gid = await gidFor(tab);
  if (gid === undefined) return;
  const requests = [...new Set(rows)].sort((a, b) => b - a).map((row) => ({
    deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: row - 1, endIndex: row } },
  }));
  await call(":batchUpdate", { method: "POST", body: { requests } });
  invalidate(tab);
}

import "server-only";
import { appendRows, deleteRow, deleteRows, ensureHeader, readTab, readTabs, updateRow, type Rec } from "./sheets";
import { deleteResults } from "./results";
import type { User } from "./auth";

export type Project = {
  number: string; name: string; tech: string; date: string; address: string; status: string;
  lastSync: string; lastSyncStatus: string; daysSinceSync: number | null;
  fieldsPct: number | null; unitsPct: number | null; units: number | null;
  openDeficiencies: number | null; openHigh: number | null; gapFlags: number | null;
  punchItems: number | null;   // all deficiencies, open and closed
  queue: "queued" | "running" | null; job: SyncJob | null; row: number;
};

/** The latest refresh request for a project, as the Refresh button shows it. */
export type SyncJob = {
  id: string; status: "queued" | "running" | "done" | "failed"; step: string;
  requestedBy: string; requestedAt: string; startedAt: string; finishedAt: string;
  ahead: number;             // syncs that will run before this one (queued jobs only)
  lastMinutes: number | null; // how long this project's previous successful sync took
};

const STALE_RUNNING_MS = 90 * 60_000;   // a "running" job this old means the worker was stopped mid-sync

function isActive(q: Rec, now = Date.now()) {
  if (q.status === "queued") return true;
  return q.status === "running" && now - Date.parse(q.started_at || q.requested_at) < STALE_RUNNING_MS;
}

export function jobFor(number: string, queue: Rec[]): SyncJob | null {
  const mine = queue.filter((q) => q.project_number === number)
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const last = mine[mine.length - 1];
  if (!last) return null;
  const queued = queue.filter((q) => q.status === "queued").sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const running = queue.some((q) => q.status === "running" && isActive(q));
  const ahead = last.status === "queued" ? queued.findIndex((q) => q.id === last.id) + (running ? 1 : 0) : 0;
  const prev = [...mine].reverse().find((q) => q.status === "done" && q.started_at && q.finished_at && q.id !== last.id);
  const lastMinutes = prev ? Math.max(1, Math.round((Date.parse(prev.finished_at) - Date.parse(prev.started_at)) / 60_000)) : null;
  let status = last.status as SyncJob["status"];
  let step = last.message;
  if (status === "running" && !isActive(last)) {
    status = "failed";
    step = "The server stopped partway through this sync. Press Refresh to try again.";
  }
  return { id: last.id, status, step, requestedBy: last.requested_by, requestedAt: last.requested_at,
    startedAt: last.started_at, finishedAt: last.finished_at, ahead, lastMinutes };
}

/** Always reads the Queue tab fresh (no cache), for the live status on the Refresh button. */
export async function syncStatus(number: string): Promise<SyncJob | null> {
  return jobFor(number, await readTab("Queue", true));
}

const num = (v: string) => (v === "" || v === undefined ? null : Number(v));

export function daysSince(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

/** Total deficiencies per project, from the "status" counts the worker saves. */
function punchTotals(defs: Rec[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of defs) if (d.group === "status") out.set(d.project_number, (out.get(d.project_number) ?? 0) + (Number(d.count) || 0));
  return out;
}

function toProject(p: Rec, queue: Rec[], punch?: Map<string, number>): Project {
  const pending = queue.filter((q) => q.project_number === p.project_number && isActive(q));
  return {
    number: p.project_number, name: p.name, tech: p.tech, date: p.date, address: p.address,
    status: p.status || "active", lastSync: p.last_sync, lastSyncStatus: p.last_sync_status,
    daysSinceSync: daysSince(p.last_sync), fieldsPct: num(p.fields_pct), unitsPct: num(p.units_pct),
    units: num(p.units), openDeficiencies: num(p.open_deficiencies), openHigh: num(p.open_high),
    gapFlags: num(p.gap_flags),
    punchItems: p.last_sync ? (punch?.get(p.project_number) ?? 0) : null,
    queue: pending.some((q) => q.status === "running") ? "running" : pending.length ? "queued" : null,
    job: jobFor(p.project_number, queue),
    row: p._row,
  };
}

export async function listProjects(fresh = false): Promise<Project[]> {
  const { Projects, Queue, Deficiencies } = await readTabs(["Projects", "Queue", "Deficiencies"], fresh);
  const punch = punchTotals(Deficiencies);
  return Projects.filter((p) => p.status !== "deleted").map((p) => toProject(p, Queue, punch));
}

export async function getProject(number: string) {
  const { Projects, Queue, Dashboard, Deficiencies, History } =
    await readTabs(["Projects", "Queue", "Dashboard", "Deficiencies", "History"]);
  const p = Projects.find((x) => x.project_number === number);
  if (!p) return null;
  const mine = <T extends Rec>(rows: T[]) => rows.filter((r) => r.project_number === number);
  return {
    project: toProject(p, Queue, punchTotals(Deficiencies)),
    dashboard: mine(Dashboard),
    deficiencies: mine(Deficiencies),
    history: mine(History).sort((a, b) => a.synced_at.localeCompare(b.synced_at)),
  };
}

/** Is this the user's project? Matches the Tech column against the user's full or first name. */
export function isMine(p: Project, u: User): boolean {
  const tech = (p.tech || "").trim().toLowerCase();
  if (!tech) return false;
  const full = u.name.trim().toLowerCase();
  return tech === full || tech === full.split(" ")[0] || tech === u.email;
}

export async function requestRefresh(number: string, by: User): Promise<"queued" | "already" | "missing"> {
  const { Projects, Queue } = await readTabs(["Projects", "Queue"], true);
  if (!Projects.some((p) => p.project_number === number)) return "missing";
  if (Queue.some((q) => q.project_number === number && isActive(q))) {
    return "already";
  }
  const now = new Date();
  const id = now.toISOString().replace(/\D/g, "").slice(0, 17) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  await appendRows("Queue", [{ id, project_number: number, requested_by: by.email,
    requested_at: now.toISOString().replace(/\.\d+Z$/, "+00:00"), status: "queued" }]);
  return "queued";
}

// ---- admin: project list ------------------------------------------------------------
export type ProjectInput = { number: string; name: string; tech: string; date: string; address: string; status: string };

export async function saveProject(input: ProjectInput, originalNumber?: string) {
  const rows = await readTab("Projects", true);
  const clash = rows.find((r) => r.project_number === input.number && r.project_number !== originalNumber);
  if (clash) throw new Error(`Project ${input.number} already exists`);
  const existing = originalNumber ? rows.find((r) => r.project_number === originalNumber) : undefined;
  const rec = {
    ...(existing ?? {}), project_number: input.number, name: input.name, tech: input.tech,
    date: input.date || new Date().toISOString().slice(0, 10), address: input.address,
    status: input.status || "active",
  };
  if (existing) await updateRow("Projects", existing._row, rec);
  else await appendRows("Projects", [rec]);
}

/** Delete a project and everything kept for it: results file, dashboard, deficiency and
 *  history rows, and its project rules. (Archiving is the way to hide a project but keep it.) */
export async function removeProject(number: string) {
  const rows = await readTab("Projects", true);
  const p = rows.find((r) => r.project_number === number);
  if (!p) return;
  const tabs = ["Dashboard", "Deficiencies", "History", "ProjectRules"] as const;
  for (const tab of tabs) {
    let recs: Rec[] = [];
    try { recs = await readTab(tab, true); } catch { continue; }   // e.g. ProjectRules not created yet
    await deleteRows(tab, recs.filter((r) => r.project_number === number).map((r) => r._row));
  }
  await deleteResults(number);
  await deleteRow("Projects", p._row);
}

// ---- admin: users ------------------------------------------------------------------
export type UserRow = { email: string; name: string; role: string; active: boolean; added: string };

export async function listUsers(): Promise<UserRow[]> {
  const rows = await readTab("Users", true);
  return rows.map((u) => ({
    email: u.email.trim().toLowerCase(), name: u.name, role: u.role || "tech",
    active: !["no", "false", "0"].includes((u.active || "").toLowerCase()), added: u.added,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveUser(input: { email: string; name: string; role: string; active: boolean },
                               originalEmail?: string) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (!input.name.trim()) throw new Error("Name is required");
  if (!["admin", "tech", "viewer"].includes(input.role)) throw new Error("Role must be admin, tech or viewer");
  await ensureHeader("Users");
  const rows = await readTab("Users", true);
  const orig = (originalEmail ?? "").trim().toLowerCase();
  if (rows.some((r) => r.email.trim().toLowerCase() === email && r.email.trim().toLowerCase() !== orig)) {
    throw new Error(`${email} is already on the list`);
  }
  const existing = orig ? rows.find((r) => r.email.trim().toLowerCase() === orig) : undefined;
  const rec = { email, name: input.name.trim(), role: input.role, active: input.active ? "yes" : "no",
    added: existing?.added || new Date().toISOString().slice(0, 10),
    password_hash: existing?.password_hash || "" };  // keep their password when an admin edits the row
  if (existing) await updateRow("Users", existing._row, rec);
  else await appendRows("Users", [rec]);
}

export async function removeUser(email: string) {
  const rows = await readTab("Users", true);
  const u = rows.find((r) => r.email.trim().toLowerCase() === email.trim().toLowerCase());
  if (u) await deleteRow("Users", u._row);
}

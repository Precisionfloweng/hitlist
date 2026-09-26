import "server-only";
import { appendRows, deleteRow, readTab, readTabs, updateRow, type Rec } from "./sheets";
import type { User } from "./auth";

export type Project = {
  number: string; name: string; tech: string; date: string; address: string; status: string;
  lastSync: string; lastSyncStatus: string; daysSinceSync: number | null;
  fieldsPct: number | null; unitsPct: number | null; units: number | null;
  openDeficiencies: number | null; openHigh: number | null; gapFlags: number | null;
  queue: "queued" | "running" | null; row: number;
};

const num = (v: string) => (v === "" || v === undefined ? null : Number(v));

export function daysSince(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

function toProject(p: Rec, queue: Rec[]): Project {
  const pending = queue.filter((q) => q.project_number === p.project_number && (q.status === "queued" || q.status === "running"));
  return {
    number: p.project_number, name: p.name, tech: p.tech, date: p.date, address: p.address,
    status: p.status || "active", lastSync: p.last_sync, lastSyncStatus: p.last_sync_status,
    daysSinceSync: daysSince(p.last_sync), fieldsPct: num(p.fields_pct), unitsPct: num(p.units_pct),
    units: num(p.units), openDeficiencies: num(p.open_deficiencies), openHigh: num(p.open_high),
    gapFlags: num(p.gap_flags),
    queue: pending.some((q) => q.status === "running") ? "running" : pending.length ? "queued" : null,
    row: p._row,
  };
}

export async function listProjects(fresh = false): Promise<Project[]> {
  const { Projects, Queue } = await readTabs(["Projects", "Queue"], fresh);
  return Projects.filter((p) => p.status !== "deleted").map((p) => toProject(p, Queue));
}

export async function getProject(number: string) {
  const { Projects, Queue, Dashboard, Deficiencies, History } =
    await readTabs(["Projects", "Queue", "Dashboard", "Deficiencies", "History"]);
  const p = Projects.find((x) => x.project_number === number);
  if (!p) return null;
  const mine = <T extends Rec>(rows: T[]) => rows.filter((r) => r.project_number === number);
  return {
    project: toProject(p, Queue),
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
  if (Queue.some((q) => q.project_number === number && (q.status === "queued" || q.status === "running"))) {
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

export async function removeProject(number: string) {
  const rows = await readTab("Projects", true);
  const p = rows.find((r) => r.project_number === number);
  if (p) await deleteRow("Projects", p._row);
}

// "What's new in Hitlist": a short list of changes, written in plain English as features are added.
// Shown on the Help page, the Admin page and in the Monday email (the server fetches it from the website).
import entries from "@/content/whats-new.json";

export type WhatsNew = { date: string; audience: "all" | "admins"; title: string; text: string };
export const ALL: WhatsNew[] = (entries as WhatsNew[]).slice().sort((a, b) => b.date.localeCompare(a.date));
export const RECENT_DAYS = 30;

/** Newest first; admins-only entries left out for everyone else. `days` limits to the last N days. */
export function whatsNew(isAdmin: boolean, days?: number): WhatsNew[] {
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
  return ALL.filter((e) => (isAdmin || e.audience === "all") && e.date >= since);
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The "New in Hitlist" box as it appears in the Monday email (same look as the server builds). */
export function whatsNewEmailHtml(items: WhatsNew[]): string {
  if (!items.length) return "";
  const lis = items.map((e) => `<li style="margin:0 0 6px"><b>${esc(e.title)}</b>${e.audience === "admins" ? " (admins)" : ""}: ${esc(e.text)}</li>`).join("");
  return `<div style="background:#f4f0fb;border:1px solid #d9cff0;border-radius:8px;padding:12px 16px;margin:0 0 18px">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#4b3591;margin:0 0 6px">New in Hitlist (last 30 days)</div>` +
    `<ul style="margin:0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45">${lis}</ul></div>`;
}

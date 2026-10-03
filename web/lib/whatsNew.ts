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
export const EMAIL_SHOWN = 10;   // the newest changes shown in the Monday email; the rest are a link away

/** Same layout as the worker's Monday email (worker/hitlist/summary.py whats_new_block). */
export function whatsNewEmailHtml(all: WhatsNew[], site = "", admin = false): string {
  if (!all.length) return "";
  const items = all.slice(0, EMAIL_SHOWN);
  const more = all.length - items.length;
  const F = "Arial,Helvetica,sans-serif";
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const rows = items.map((e) =>
    `<tr><td valign="top" style="padding:9px 12px 9px 0;border-top:1px solid #e3dcf3;font-family:${F};font-size:12px;color:#7a6aa8;white-space:nowrap;width:52px">${esc(day(e.date))}</td>` +
    `<td valign="top" style="padding:9px 0;border-top:1px solid #e3dcf3;font-family:${F};font-size:14px;line-height:1.4;color:#1c2430"><b>${esc(e.title)}</b>` +
    `${e.audience === "admins" ? ` <span style="font-size:11px;color:#7a6aa8">(admins)</span>` : ""}` +
    `<br><span style="color:#475467">${esc(e.text)}</span></td></tr>`).join("") +
    (more > 0 ? `<tr><td></td><td style="padding:10px 0 6px;border-top:1px solid #e3dcf3;font-family:${F};font-size:14px">` +
      `<a href="${esc(site.replace(/\/$/, ""))}${admin ? "/admin/whats-new" : "/help#whats-new"}" style="color:#4b3591;font-weight:bold;text-decoration:none">` +
      `See all ${all.length} changes in Hitlist &rarr;</a></td></tr>` : "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4fd;border:1px solid #d9cff0;margin:0 0 18px">` +
    `<tr><td style="padding:12px 16px 4px;font-family:${F};font-size:15px;font-weight:bold;color:#4b3591">New in Hitlist <span style="font-weight:normal;font-size:13px;color:#7a6aa8">(last 30 days)</span></td></tr>` +
    `<tr><td style="padding:0 16px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
}

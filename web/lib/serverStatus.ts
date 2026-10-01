// Is the server (the Hitlist worker on the mini PC) running? It writes "server_last_seen" to the Status tab
// every 5 minutes; if that's older than DOWN_AFTER, the site shows a banner and emails the admins once.
import "server-only";
import { after } from "next/server";
import { appendRows, readTab, updateRow } from "./sheets";
import { listUsers } from "./data";
import { sendMail } from "./mail";

const DOWN_AFTER_MS = 12 * 60_000;     // two missed check-ins plus a little slack
let alerting = "";                     // outage this server instance is already emailing about

export type ServerStatus = { down: boolean; lastSeen: string };

export async function serverStatus(): Promise<ServerStatus | null> {
  let rows;
  try {
    rows = await readTab("Status");
  } catch {
    return null;                       // no Status tab yet (server not updated): say nothing
  }
  const seen = rows.find((r) => r.name === "server_last_seen");
  if (!seen?.value) return null;
  const t = Date.parse(seen.value);
  if (Number.isNaN(t)) return null;
  const down = Date.now() - t > DOWN_AFTER_MS;
  if (down) {
    const alerted = rows.find((r) => r.name === "down_alert_sent_for");
    if (alerted?.value !== seen.value && alerting !== seen.value) {
      alerting = seen.value;
      after(() => emailAdmins(seen.value, alerted?._row));
    }
  }
  return { down, lastSeen: seen.value };
}

/** One email per outage, to admins (not the owner). */
async function emailAdmins(lastSeen: string, alertRow?: number) {
  try {
    const rec = { name: "down_alert_sent_for", value: lastSeen };
    if (alertRow) await updateRow("Status", alertRow, rec);
    else await appendRows("Status", [rec]);
    const when = new Date(lastSeen).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const to = (await listUsers()).filter((u) => u.role === "admin" && u.active).map((u) => u.email);
    for (const email of to) {
      await sendMail(email, "Hitlist server is down",
        `<p style="margin:0 0 12px"><b>The Hitlist server hasn't checked in since ${when}.</b></p>` +
        `<p style="margin:0 0 12px">Syncs won't run until it's back. Check that the mini PC is on and connected, ` +
        `and that the <b>Hitlist worker</b> task is running in Task Scheduler.</p>` +
        `<p style="margin:0">You'll get this email once per outage.</p>`);
    }
  } catch (e) {
    console.error("server-down email failed", e);
  }
}

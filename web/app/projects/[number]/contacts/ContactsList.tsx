"use client";
import { useEffect, useState } from "react";

type Contact = { id: string; name: string; position: string; company: string; trade: string; email: string;
  onList: boolean; sendAs: "to" | "cc"; addedBy: string; addedAt: string };
type Draft = { name: string; position: string; company: string; trade: string; email: string };

const EMPTY: Draft = { name: "", position: "", company: "", trade: "", email: "" };
const TRADES = ["Owner", "GC", "Mechanical", "Controls", "Electrical", "Engineer", "Commissioning", "Architect"];

function added(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return isNaN(+d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The project's email list: add, edit, remove, tick who's included, To or Cc, and open a new email to all of them. */
export default function ContactsList({ project, subject, initial, canEdit }:
  { project: string; subject: string; initial: Contact[]; canEdit: boolean }) {
  const [list, setList] = useState<Contact[]>(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; d: Draft } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const onList = list.filter((c) => c.onList);
  const to = onList.filter((c) => c.sendAs !== "cc").map((c) => c.email);
  const cc = onList.filter((c) => c.sendAs === "cc").map((c) => c.email);
  // Opens a new email in the person's own mail app (sent from their account), To and Cc filled in.
  // Outlook on Windows wants semicolons between addresses; Apple Mail / Outlook on iPad use commas.
  const [sep, setSep] = useState(",");
  useEffect(() => { if (/Windows/i.test(navigator.userAgent)) setSep(";"); }, []);
  const mailto = `mailto:${to.join(sep)}?${cc.length ? `cc=${cc.join(sep)}&` : ""}subject=${encodeURIComponent(subject)}`;

  async function send(body: Record<string, unknown>, done?: () => void) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/contacts", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, ...body }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setList(data.contacts);
    done?.();
  }

  const toggle = (c: Contact) => (
    <span className="tocc" role="group" aria-label="To or Cc">
      {(["to", "cc"] as const).map((v) => (
        <button key={v} type="button" className={c.sendAs === v ? "on" : ""} disabled={!canEdit || busy || c.sendAs === v}
          onClick={() => send({ action: "update", id: c.id, contact: { sendAs: v } })}>{v === "to" ? "To" : "Cc"}</button>
      ))}
    </span>
  );

  const field = (d: Draft, set: (d: Draft) => void, k: keyof Draft, placeholder: string, extra = {}) => (
    <input value={d[k]} placeholder={placeholder} onChange={(e) => set({ ...d, [k]: e.target.value })} {...extra} />
  );

  return (
    <>
      <div className="card contacts-top">
        <div>
          <b>To:</b> {to.length} <span className="muted">·</span> <b>Cc:</b> {cc.length}
          {list.length > onList.length && <span className="muted"> ({list.length - onList.length} unticked, left off)</span>}
          <div className="muted" style={{ fontSize: 13 }}>Opens a new email in your mail app with everyone ticked on the To and Cc lines.</div>
        </div>
        {onList.length ? <a className="btn primary" href={mailto}>✉ New email</a>
          : <button className="primary" disabled>✉ New email</button>}
      </div>

      {canEdit && (
        <form className="card contacts-add" onSubmit={(e) => { e.preventDefault(); send({ action: "add", contact: draft }, () => setDraft(EMPTY)); }}>
          <b>Add a contact</b>
          <div className="contacts-form">
            {field(draft, setDraft, "name", "Name")}
            {field(draft, setDraft, "position", "Position")}
            {field(draft, setDraft, "company", "Company")}
            {field(draft, setDraft, "trade", "Trade", { list: "contact-trades" })}
            {field(draft, setDraft, "email", "Email", { type: "email", required: true, autoCapitalize: "none" })}
            <button className="primary" disabled={busy || !draft.email.trim()}>Add</button>
          </div>
          <datalist id="contact-trades">{TRADES.map((t) => <option key={t} value={t} />)}</datalist>
        </form>
      )}
      {msg && <div className={msg.ok ? "pill ok" : "error"} style={{ margin: "0 0 10px" }}>{msg.text}</div>}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {list.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No contacts yet.{canEdit && " Add the first one above."}</div>
        ) : (
          <table className="proj-table contacts-table">
            <thead>
              <tr><th title="Included in New email">On list</th><th>To / Cc</th><th>Name</th><th>Position</th><th>Company</th><th>Trade</th><th>Email</th><th>Added</th>{canEdit && <th />}</tr>
            </thead>
            <tbody>
              {list.map((c) => editing?.id === c.id ? (
                <tr key={c.id} className="contacts-editing">
                  <td><input type="checkbox" checked={c.onList} disabled /></td>
                  <td>{toggle(c)}</td>
                  <td>{field(editing.d, (d) => setEditing({ id: c.id, d }), "name", "Name")}</td>
                  <td>{field(editing.d, (d) => setEditing({ id: c.id, d }), "position", "Position")}</td>
                  <td>{field(editing.d, (d) => setEditing({ id: c.id, d }), "company", "Company")}</td>
                  <td>{field(editing.d, (d) => setEditing({ id: c.id, d }), "trade", "Trade", { list: "contact-trades" })}</td>
                  <td>{field(editing.d, (d) => setEditing({ id: c.id, d }), "email", "Email", { type: "email", autoCapitalize: "none" })}</td>
                  <td className="muted">{added(c.addedAt)}</td>
                  <td className="contacts-actions">
                    <button className="primary" disabled={busy} onClick={() => send({ action: "update", id: c.id, contact: editing.d }, () => setEditing(null))}>Save</button>
                    <button disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={c.onList ? "" : "contacts-off"}>
                  <td><input type="checkbox" checked={c.onList} disabled={!canEdit || busy}
                    onChange={(e) => send({ action: "update", id: c.id, contact: { onList: e.target.checked } })} /></td>
                  <td>{toggle(c)}</td>
                  <td>{c.name}</td>
                  <td>{c.position}</td>
                  <td>{c.company}</td>
                  <td>{c.trade}</td>
                  <td><a href={`mailto:${c.email}`}>{c.email}</a></td>
                  <td className="muted" title={c.addedBy ? `Added by ${c.addedBy}` : undefined}>{added(c.addedAt)}</td>
                  {canEdit && (
                    <td className="contacts-actions">
                      {removing === c.id ? (
                        <>
                          <button className="danger" disabled={busy} onClick={() => send({ action: "remove", id: c.id }, () => setRemoving(null))}>Remove</button>
                          <button disabled={busy} onClick={() => setRemoving(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button disabled={busy} onClick={() => { setRemoving(null); setEditing({ id: c.id, d: { name: c.name, position: c.position, company: c.company, trade: c.trade, email: c.email } }); }}>Edit</button>
                          <button disabled={busy} onClick={() => { setEditing(null); setRemoving(c.id); }}>✕</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

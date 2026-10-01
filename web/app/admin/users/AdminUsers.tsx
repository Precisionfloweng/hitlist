"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type U = { email: string; name: string; role: string; active: boolean; added: string; projects: string[]; lastSeen?: string };

/** "Today", "Yesterday", "Sep 28", or "Never", from a Central date like "2026-09-28". */
function lastUsed(date?: string): string {
  if (!date) return "Never";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
  const today = day(new Date()), yesterday = day(new Date(Date.now() - 86_400_000));
  if (date === today) return "Today";
  if (date === yesterday) return "Yesterday";
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}
type Choice = { id: string; label: string };

/** For a customer: tick the projects they may see. */
function ProjectPicker({ value, onChange, choices }: { value: string[]; onChange: (v: string[]) => void; choices: Choice[] }) {
  return (
    <div className="proj-pick">
      <div className="muted" style={{ fontSize: 12 }}>Projects this customer can see:</div>
      {choices.map((c) => (
        <label key={c.id}>
          <input type="checkbox" checked={value.includes(c.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} /> {c.label}
        </label>
      ))}
    </div>
  );
}
type Row = U & { original: string; dirty: boolean };

export default function AdminUsers({ initial, me, projects: choices }: { initial: U[]; me: string; projects: Choice[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map((u) => ({ ...u, original: u.email, dirty: false })));
  const [adding, setAdding] = useState<U | null>(null);
  const [welcome, setWelcome] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function send(body: object, id: string) {
    setBusy(id); setMsg(null);
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return false; }
    router.refresh();
    return true;
  }
  const set = (i: number, patch: Partial<U>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, dirty: true } : r)));
  const roleSelect = (value: string, onChange: (v: string) => void, disabled = false) => (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="tech">tech</option><option value="admin">admin</option><option value="viewer">viewer</option>
      <option value="customer">customer</option>
      <option value="owner">owner</option>
    </select>
  );

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        {!adding && <button className="primary" onClick={() => setAdding({ email: "", name: "", role: "tech", active: true, added: "", projects: [] })}>+ Add person</button>}
        {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Last used</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {adding && (
              <tr style={{ background: "#f3f7fb" }}>
                <td><input value={adding.name} placeholder="First Last" onChange={(e) => setAdding({ ...adding, name: e.target.value })} style={{ width: 170 }} /></td>
                <td><input type="email" value={adding.email} placeholder="name@precisionfloweng.com" onChange={(e) => setAdding({ ...adding, email: e.target.value })} style={{ width: 250 }} /></td>
                <td>{roleSelect(adding.role, (v) => setAdding({ ...adding, role: v }))}
                  {adding.role === "customer" && <ProjectPicker value={adding.projects} choices={choices}
                    onChange={(v) => setAdding({ ...adding, projects: v })} />}</td>
                <td><label className="row" style={{ gap: 6 }}><input type="checkbox" checked={welcome} onChange={(e) => setWelcome(e.target.checked)} /> Email them a welcome</label></td>
                <td></td>
                <td></td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="primary" disabled={busy === "new"} onClick={async () => {
                    if (await send({ action: "save", user: adding, welcome }, "new")) {
                      setRows((rs) => [{ ...adding, email: adding.email.trim().toLowerCase(), added: new Date().toISOString().slice(0, 10), original: adding.email.trim().toLowerCase(), dirty: false }, ...rs]);
                      setMsg({ text: `Added ${adding.name}${welcome ? " and sent a welcome email" : ""}`, ok: true });
                      setAdding(null);
                    }
                  }}>Save</button>
                  <button onClick={() => setAdding(null)}>Cancel</button>
                </td>
              </tr>
            )}
            {rows.map((u, i) => {
              const self = u.original === me;
              const owner = initial.find((x) => x.email === u.original)?.role === "owner";   // saved as owner
              return (
                <tr key={u.original || i} style={u.active ? undefined : { opacity: 0.6 }}>
                  <td><input value={u.name} onChange={(e) => set(i, { name: e.target.value })} style={{ width: 170 }} /></td>
                  <td><input type="email" value={u.email} onChange={(e) => set(i, { email: e.target.value })} style={{ width: 250 }} /></td>
                  <td>{roleSelect(u.role, (v) => {
                    if (v === "owner" && !confirm(`Make ${u.name} an owner?\n\nOwners have full admin access and can't be removed, turned off or changed back from the site.`)) return;
                    set(i, { role: v });
                  }, self || owner)}
                  {u.role === "customer" && <ProjectPicker value={u.projects} choices={choices} onChange={(v) => set(i, { projects: v })} />}</td>
                  <td>
                    <label className="row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={u.active} disabled={self || owner} onChange={(e) => set(i, { active: e.target.checked })} />
                      {u.active ? <span className="pill ok">On</span> : <span className="pill gray">Off</span>}
                    </label>
                  </td>
                  <td>{lastUsed(u.lastSeen)}</td>
                  <td className="muted">{u.added}</td>
                  <td className="row" style={{ flexWrap: "nowrap" }}>
                    <button className="primary" disabled={!u.dirty || busy === u.original} onClick={async () => {
                      if (await send({ action: "save", user: u, original: u.original }, u.original)) {
                        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, email: x.email.trim().toLowerCase(), original: x.email.trim().toLowerCase(), dirty: false } : x)));
                        setMsg({ text: `Saved ${u.name}`, ok: true });
                      }
                    }}>Save</button>
                    <button disabled={busy === u.original || !u.active || u.dirty}
                      title={!u.active ? "Turn their access on first" : u.dirty ? "Save first" : "Email them the sign-in and iPad instructions"}
                      onClick={async () => {
                        if (!confirm(`Send the welcome email to ${u.name} (${u.original})?`)) return;
                        if (await send({ action: "welcome", original: u.original }, u.original)) {
                          setMsg({ text: `Welcome email sent to ${u.name}`, ok: true });
                        }
                      }}>Send welcome</button>
                    {!self && !owner && (
                      <button className="danger" disabled={busy === u.original} onClick={async () => {
                        if (!confirm(`Remove ${u.name} (${u.original}) from the list? To just block sign-in, turn Access off instead.`)) return;
                        if (await send({ action: "delete", original: u.original }, u.original)) setRows((rs) => rs.filter((_, j) => j !== i));
                      }}>Remove</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { number: string; name: string; tech: string; date: string; address: string; status: string;
  id?: string; sharedWith?: string[] };
const blank = (): Row => ({ number: "", name: "", tech: "", date: new Date().toISOString().slice(0, 10), address: "", status: "active" });

export default function AdminProjects({ initial }: { initial: Row[] }) {
  const router = useRouter();
  // `original` is the project's key (usually its number) — what the server uses to find the row.
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, original: r.id || r.number, dirty: false })));
  const [adding, setAdding] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  // A save waiting for "is this a second site?" (the number is already on the list).
  const [askSite, setAskSite] = useState<{ text: string; retry: () => void } | null>(null);

  async function send(body: Record<string, unknown>, id: string, onDone?: (res: { id?: string }) => void): Promise<{ id?: string } | false> {
    setBusy(id); setMsg(""); setAskSite(null);
    const r = await fetch("/api/admin/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.status === 409 && data.confirmSecondSite) {
      setAskSite({ text: data.error, retry: async () => {
        const res = await send({ ...body, secondSite: true }, id);
        if (res && onDone) onDone(res);
      } });
      return false;
    }
    if (!r.ok) { setMsg(data.error || "Save failed"); return false; }
    router.refresh();
    return data;
  }

  const set = (i: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, dirty: true } : r)));

  const cell = (value: string, onChange: (v: string) => void, width = 140, type = "text") => (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width }} />
  );

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        {!adding && <button className="primary" onClick={() => setAdding(blank())}>+ Add project</button>}
        {msg && <span className="error">{msg}</span>}
      </div>
      {askSite && (
        <div className="card confirm-box">
          <b>{askSite.text}</b>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={askSite.retry}>Yes, add as a second site</button>
            <button onClick={() => setAskSite(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="scroll">
        <table>
          <thead><tr><th>Project #</th><th>Project name</th><th>Tech</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {adding && (
              <tr style={{ background: "#f3f7fb" }}>
                <td>{cell(adding.number, (v) => setAdding({ ...adding, number: v }), 90)}</td>
                <td>{cell(adding.name, (v) => setAdding({ ...adding, name: v }), 220)}</td>
                <td>{cell(adding.tech, (v) => setAdding({ ...adding, tech: v }), 110)}</td>
                <td>{cell(adding.date, (v) => setAdding({ ...adding, date: v }), 140, "date")}</td>
                <td>active</td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="primary" disabled={busy === "new"} onClick={async () => {
                    const added = (res: { id?: string }) => {
                      setRows((rs) => [{ ...adding, original: res.id || adding.number, dirty: false }, ...rs]); setAdding(null);
                    };
                    const res = await send({ action: "save", project: adding }, "new", added);
                    if (res) added(res);
                  }}>Save</button>
                  <button onClick={() => setAdding(null)}>Cancel</button>
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.original || i}>
                <td>{cell(r.number, (v) => set(i, "number", v), 90)}</td>
                <td>{cell(r.name, (v) => set(i, "name", v), 220)}
                  {!!r.sharedWith?.length && <div className="muted" style={{ fontSize: 12 }}>Shares # with {r.sharedWith.join(", ")}</div>}</td>
                <td>{cell(r.tech, (v) => set(i, "tech", v), 110)}</td>
                <td>{cell(r.date, (v) => set(i, "date", v), 140, "date")}</td>
                <td><select value={r.status} onChange={(e) => set(i, "status", e.target.value)}>
                  <option value="active">active</option><option value="archived">archived</option></select></td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="primary" disabled={!r.dirty || busy === r.original} onClick={async () => {
                    const saved = (res: { id?: string }) =>
                      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, original: res.id || x.original, dirty: false } : x)));
                    const res = await send({ action: "save", project: r, original: r.original }, r.original, saved);
                    if (res) {
                      saved(res);
                    }
                  }}>Save</button>
                  <button className="danger" disabled={busy === r.original} onClick={async () => {
                    if (!confirm(`Delete ${r.number} ${r.name} for good?\n\nThis also deletes everything Hitlist keeps for it: sync results, history, project rules, tolerances, contacts, AI Review suggestions, and the Dropbox document text and questions (Dropbox itself isn't touched). To hide it but keep its data, set its status to Archived instead.`)) return;
                    if (await send({ action: "delete", original: r.original }, r.original)) setRows((rs) => rs.filter((_, j) => j !== i));
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

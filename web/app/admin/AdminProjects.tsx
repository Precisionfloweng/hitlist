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

  async function send(body: object, id: string): Promise<{ id?: string } | false> {
    setBusy(id); setMsg("");
    const r = await fetch("/api/admin/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
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
      <div className="scroll">
        <table>
          <thead><tr><th>Project #</th><th>Project name</th><th>Tech</th><th>Date</th><th>Address</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {adding && (
              <tr style={{ background: "#f3f7fb" }}>
                <td>{cell(adding.number, (v) => setAdding({ ...adding, number: v }), 90)}</td>
                <td>{cell(adding.name, (v) => setAdding({ ...adding, name: v }), 220)}</td>
                <td>{cell(adding.tech, (v) => setAdding({ ...adding, tech: v }), 110)}</td>
                <td>{cell(adding.date, (v) => setAdding({ ...adding, date: v }), 140, "date")}</td>
                <td>{cell(adding.address, (v) => setAdding({ ...adding, address: v }), 220)}</td>
                <td>active</td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="primary" disabled={busy === "new"} onClick={async () => {
                    const res = await send({ action: "save", project: adding }, "new");
                    if (res) {
                      setRows((rs) => [{ ...adding, original: res.id || adding.number, dirty: false }, ...rs]); setAdding(null);
                    }
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
                <td>{cell(r.address, (v) => set(i, "address", v), 220)}</td>
                <td><select value={r.status} onChange={(e) => set(i, "status", e.target.value)}>
                  <option value="active">active</option><option value="archived">archived</option></select></td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="primary" disabled={!r.dirty || busy === r.original} onClick={async () => {
                    const res = await send({ action: "save", project: r, original: r.original }, r.original);
                    if (res) {
                      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, original: res.id || x.original, dirty: false } : x)));
                    }
                  }}>Save</button>
                  <button className="danger" disabled={busy === r.original} onClick={async () => {
                    if (!confirm(`Delete ${r.number} ${r.name} for good?\n\nThis also deletes its sync results, history and project rules. To hide it but keep its data, set its status to Archived instead.`)) return;
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

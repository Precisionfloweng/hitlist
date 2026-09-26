"use client";
import { useMemo, useState } from "react";
import type { Deficiency } from "@/lib/results";

export default function Deficiencies({ items }: { items: Deficiency[] }) {
  const [openOnly, setOpenOnly] = useState(true);
  const [priority, setPriority] = useState("");
  const [contact, setContact] = useState("");
  const priorities = [...new Set(items.map((d) => d.priority))].sort();
  const contacts = [...new Set(items.map((d) => d.contact))].sort();
  const shown = useMemo(() => items.filter((d) => (!openOnly || d.open) && (!priority || d.priority === priority) &&
    (!contact || d.contact === contact)), [items, openOnly, priority, contact]);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All priorities</option>{priorities.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={contact} onChange={(e) => setContact(e.target.value)}><option value="">All contacts</option>{contacts.map((c) => <option key={c}>{c}</option>)}</select>
        <span className="muted">{shown.length} of {items.length}</span>
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>No.</th><th>Equipment</th><th>Deficiency</th><th>Priority</th><th>Status</th><th>Role</th><th>Contact</th><th>Due</th></tr></thead>
          <tbody>
            {shown.map((d, i) => (
              <tr key={d.number + d.path + i}>
                <td>{d.number}</td><td title={d.path}>{d.equipment}<div className="muted" style={{ fontSize: 12 }}>{d.item_type}</div></td>
                <td style={{ maxWidth: 420 }}>{d.text}</td>
                <td><span className={`pill ${d.priority === "High" ? "bad" : d.priority === "Medium" ? "warn" : "gray"}`}>{d.priority}</span></td>
                <td>{d.status}</td><td>{d.role}</td><td>{d.contact}</td><td>{d.date_due}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="muted">No deficiencies match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

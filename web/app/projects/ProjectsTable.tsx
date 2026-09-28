"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import RefreshButton from "../RefreshButton";
import { pct, syncLabel } from "../format";
import type { Project } from "@/lib/data";

type Row = Project & { mine: boolean };

export default function ProjectsTable({ rows, userName, customer = false, canSync = true }:
  { rows: Row[]; userName: string; customer?: boolean; canSync?: boolean }) {
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  // Someone who isn't the tech on any project (e.g. the owner) still sees everything with My projects ticked.
  const hasMine = rows.some((r) => r.mine);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (!mineOnly || !hasMine || r.mine) &&
        (!s || [r.number, r.name, r.tech, r.address].some((v) => (v || "").toLowerCase().includes(s))))
      .sort((a, b) => a.number.localeCompare(b.number) * -1);
  }, [rows, q, mineOnly, hasMine]);

  const first = (userName || "").trim().split(/\s+/)[0];
  const title = customer ? "Your Projects" : mineOnly ? `${first ? `${first}'${first.endsWith("s") ? "" : "s"}` : "My"} Projects` : "All Projects";

  return (
    <>
      <h1 className="page-title">{title}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search project #, name, tech or address" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        {!customer && <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My projects
        </label>}
        <span className="muted">{shown.length} of {rows.length}</span>
      </div>
      <div className="scroll">
        <table className="proj-table">
          <thead>
            <tr><th>Project #</th><th>Project</th><th>Tech</th><th>Complete</th><th className="ctr">Units</th>
              <th className="ctr">Punch items</th><th className="ctr">Last sync</th><th className="ctr">Sync status</th>{canSync && <th></th>}</tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const s = syncLabel(p.daysSinceSync);
              return (
                <tr key={p.id}>
                  <td><Link href={`/projects/${encodeURIComponent(p.id)}`}>{p.number}</Link></td>
                  <td><Link href={`/projects/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                    {p.address && <div className="muted" style={{ fontSize: 12 }}>{p.address}</div>}</td>
                  <td>{p.tech}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <div className="bar" style={{ flex: 1 }}><span style={{ width: `${p.fieldsPct ?? 0}%` }} /></div>
                      <span className="num" style={{ width: 40 }}>{pct(p.fieldsPct)}</span>
                    </div>
                  </td>
                  <td className="ctr num-font">{p.units ?? "–"}</td>
                  <td className="ctr num-font">{p.punchItems ?? "–"}</td>
                  <td className="ctr">
                    <span className={s.cls}>{s.text}</span>
                  </td>
                  {canSync ? <RefreshButton project={p.id} job={p.job} cells /> : <td className="ctr muted">{p.lastSyncStatus === "ok" ? "✓ Complete" : "–"}</td>}
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={9} className="muted">No projects match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

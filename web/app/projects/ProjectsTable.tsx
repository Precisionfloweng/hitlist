"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import RefreshButton from "../RefreshButton";
import { pct, syncLabel } from "../format";
import type { Project } from "@/lib/data";

type Row = Project & { mine: boolean };

export default function ProjectsTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (!mineOnly || r.mine) &&
        (!s || [r.number, r.name, r.tech, r.address].some((v) => (v || "").toLowerCase().includes(s))))
      .sort((a, b) => a.number.localeCompare(b.number) * -1);
  }, [rows, q, mineOnly]);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search project #, name, tech or address" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My projects
        </label>
        <span className="muted">{shown.length} of {rows.length}</span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Project #</th><th>Project</th><th>Tech</th><th>Complete</th><th className="num">Units</th>
              <th className="num">Open high</th><th>Last sync</th><th>Sync status</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const s = syncLabel(p.daysSinceSync);
              return (
                <tr key={p.number}>
                  <td><Link href={`/projects/${encodeURIComponent(p.number)}`}>{p.number}</Link></td>
                  <td><Link href={`/projects/${encodeURIComponent(p.number)}`}>{p.name}</Link>
                    {p.address && <div className="muted" style={{ fontSize: 12 }}>{p.address}</div>}</td>
                  <td>{p.tech}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <div className="bar" style={{ flex: 1 }}><span style={{ width: `${p.fieldsPct ?? 0}%` }} /></div>
                      <span className="num" style={{ width: 40 }}>{pct(p.fieldsPct)}</span>
                    </div>
                  </td>
                  <td className="num">{p.units ?? "–"}</td>
                  <td className="num">{p.openHigh ? <span className="pill bad">{p.openHigh}</span> : p.openHigh === 0 ? "0" : "–"}</td>
                  <td>
                    <span className={s.cls}>{s.text}</span>
                  </td>
                  <RefreshButton project={p.number} job={p.job} cells />
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

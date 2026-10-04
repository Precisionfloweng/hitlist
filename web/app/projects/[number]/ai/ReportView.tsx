"use client";
import Link from "next/link";
import type { LeftReport, ToleranceReport } from "@/lib/reports";

const day = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
};
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function UnitLink({ project, unit, typeKey }: { project: string; unit: string; typeKey: string | null }) {
  if (!typeKey) return <>{unit}</>;
  return <Link href={`/projects/${encodeURIComponent(project)}/equipment?type=${encodeURIComponent(typeKey)}`}>{unit}</Link>;
}

/** Out of tolerance / What's left to do, worked out by Hitlist from the last sync (not saved). */
export default function ReportView({ report, project, onClose }:
  { report: ToleranceReport | LeftReport; project: string; onClose: () => void }) {
  return (
    <div className="docs-answer report">
      <button type="button" className="ai-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
      {report.kind === "tolerance" ? <Tolerance r={report} project={project} /> : <Left r={report} project={project} />}
    </div>
  );
}

function Tolerance({ r, project }: { r: ToleranceReport; project: string }) {
  return (
    <>
      <div className="report-head">
        <b>Out of tolerance</b>
        <span className="muted"> · from BuildingStart data synced {day(r.synced)}</span>
      </div>
      <div className={`report-sum${r.outside ? " bad" : " good"}`}>
        {r.outside ? `${plural(r.outside, "unit")} with readings outside tolerance` : "✓ Nothing outside tolerance"}
        <span className="muted"> · {plural(r.checked, "unit")} checked{r.unchecked ? ` · ${r.unchecked.toLocaleString()} can't be checked yet` : ""}</span>
      </div>
      {r.groups.map((g) => (
        <div key={g.sheet} className="report-group">
          <div className="report-group-name">{g.sheet}
            <span className="muted"> · {!g.checked ? "no readings to check yet"
              : !g.rows.length ? "all passed" : `${g.rows.length} flagged · ${g.checked - g.rows.length} passed`}</span>
          </div>
          {g.rows.length > 0 && (
            <table className="report-table">
              <thead><tr><th>Unit</th><th>Reading</th><th>Design</th><th>Actual</th><th>% of design</th><th>Allowed</th></tr></thead>
              <tbody>
                {g.rows.flatMap((x) => x.items.map((it, i) => (
                  <tr key={`${x.unit}-${i}`} className={i === 0 ? "unit-first" : "unit-more"}>
                    {i === 0 && <td rowSpan={x.items.length}><UnitLink project={project} unit={x.unit} typeKey={x.typeKey} /></td>}
                    <td>{it.reading}</td>
                    <td>{it.design.toLocaleString()}{it.kind !== "flow" && " A"}{it.note && <div className="muted" style={{ fontSize: 12 }}>{it.note}</div>}</td>
                    <td className={it.kind === "amps" ? "bad" : ""}>{it.actual.toLocaleString()}{it.kind !== "flow" && " A"}</td>
                    <td className={it.kind === "amps" ? "" : "bad"}>{it.pct}</td>
                    <td>{it.allowed}{it.isDefault && <span className="muted"> (default)</span>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
          {g.unchecked.length > 0 && (
            <details className="report-more">
              <summary>{plural(g.unchecked.length, "unit")} can&apos;t be checked yet (no actual reading)</summary>
              <ul>{g.unchecked.map((u) => (
                <li key={u.unit}><UnitLink project={project} unit={u.unit} typeKey={u.typeKey} /> <span className="muted">· {u.readings.join(", ")}</span></li>
              ))}</ul>
            </details>
          )}
        </div>
      ))}
      {!r.groups.length && <div className="muted">No units with design and actual airflow or water flow readings to check.</div>}
    </>
  );
}

function Left({ r, project }: { r: LeftReport; project: string }) {
  const left = r.units - r.complete;
  return (
    <>
      <div className="report-head">
        <b>What&apos;s left to do</b>
        <span className="muted"> · from the sync on {day(r.synced)}</span>
      </div>
      <div className={`report-sum${left ? "" : " good"}`}>
        {left ? `${plural(left, "unit")} left` : "✓ Everything is complete"}
        <span className="muted"> · {r.complete.toLocaleString()} of {plural(r.units, "unit")} complete</span>
      </div>
      {r.groups.map((g) => {
        const n = g.units - g.complete;
        const href = `/projects/${encodeURIComponent(project)}/equipment?type=${encodeURIComponent(g.key)}`;
        if (!n) return <div key={g.key} className="report-type done">✓ <b>{g.name}</b> <span className="muted">· all {g.units} complete</span></div>;
        return (
          <details key={g.key} className="report-type">
            <summary><b>{g.name}</b> <span className="muted">· {n} left of {g.units} ({g.notStarted.length} not started, {g.partly.length} partly done)</span></summary>
            <div className="report-type-body">
              {g.topMissing.length > 0 && <div><span className="muted">Most often missing:</span> {g.topMissing.map((m) => `${m.field} (${m.units})`).join(", ")}</div>}
              {g.notStarted.length > 0 && <div><span className="muted">Not started:</span> {g.notStarted.join(", ")}</div>}
              {g.partly.length > 0 && (
                <ul>{g.partly.map((u) => <li key={u.unit}><b>{u.unit}</b> <span className="muted">· missing {u.missing.join(", ")}</span></li>)}</ul>
              )}
              <Link href={href}>Open {g.name} on the Equipment checklist →</Link>
            </div>
          </details>
        );
      })}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../Header";
import RefreshButton from "../../RefreshButton";
import { pct, syncLabel } from "../../format";
import Deficiencies from "./Deficiencies";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const [data, results] = await Promise.all([getProject(number), loadResults(number)]);
  if (!data) notFound();
  const { project: p, dashboard, deficiencies, history } = data;
  const s = syncLabel(p.daysSinceSync);
  const group = (g: string) => deficiencies.filter((d) => d.group === g)
    .map((d) => ({ value: d.value, count: Number(d.count) })).sort((a, b) => b.count - a.count);
  const summary = results?.summary;
  const eqHref = (type?: string) =>
    `/projects/${encodeURIComponent(p.number)}/equipment${type ? `?type=${encodeURIComponent(type)}` : ""}`;
  const typeKey = (name: string) => results?.types.find((t) => t.name === name)?.key;

  return (
    <>
      <Header user={user} />
      <main>
        <div className="muted"><Link href="/projects">← Projects</Link></div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>{p.number} · {p.name}</h1>
          <div className="row">
            {results && <Link className="btn primary" href={eqHref()}>Open equipment checklist →</Link>}
            <span className={s.cls}>Last sync: {s.text}</span>
            <RefreshButton project={p.number} job={p.job} />
          </div>
        </div>
        <div className="muted" style={{ marginTop: -10, marginBottom: 16 }}>
          {[p.tech && `Tech: ${p.tech}`, p.address].filter(Boolean).join(" · ")}
        </div>
        {p.lastSyncStatus.startsWith("failed") && <p className="error">The last sync failed: {p.lastSyncStatus.slice(8)}</p>}

        {p.lastSync ? (
          <>
            <div className="tiles">
              <Tile big={pct(p.fieldsPct)} label="Required fields filled" />
              <Tile big={summary ? `${summary.units_complete} / ${summary.units}` : pct(p.unitsPct)} label="Units fully complete" />
              <Tile big={String(summary?.missing_required ?? "–")} label="Required fields missing" />
              <Tile big={String(p.openDeficiencies ?? "–")} label="Open deficiencies" />
              <Tile big={String(p.openHigh ?? "–")} label="Open high priority" />
            </div>

            {(results?.gap_flags?.length ?? 0) > 0 && (
              <div className="card" style={{ marginTop: 16, borderColor: "#f5c2c0" }}>
                <b>Possible export gaps ({results!.gap_flags!.length})</b>
                <p className="muted" style={{ margin: "4px 0 8px" }}>Data that was there last sync is blank now, or a unit is ticked Completed with required fields empty. Check these in BuildingStart.</p>
                <ul style={{ margin: 0 }}>
                  {results!.gap_flags!.slice(0, 15).map((g, i) => (
                    <li key={i}><b>{g.unit}</b> ({g.type}): {g.kind === "data_disappeared" ? "went blank: " : "Completed but missing: "}{g.fields.join(", ")}</li>
                  ))}
                </ul>
              </div>
            )}

            <h2>Completion by equipment type</h2>
            <table className="card" style={{ padding: 0 }}>
              <thead><tr><th>Type</th><th className="num">Units</th><th className="num">Complete</th><th>Fields filled</th><th className="num">Missing required</th><th className="num">Missing optional</th></tr></thead>
              <tbody>
                {dashboard.sort((a, b) => Number(a.fields_pct) - Number(b.fields_pct)).map((d) => (
                  <tr key={d.type}>
                    <td>{typeKey(d.type) ? <Link href={eqHref(typeKey(d.type))}>{d.type}</Link> : d.type}</td><td className="num">{d.units}</td><td className="num">{d.units_complete}</td>
                    <td style={{ minWidth: 160 }}><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <div className="bar" style={{ flex: 1 }}><span style={{ width: `${d.fields_pct}%` }} /></div>
                      <span className="num" style={{ width: 44 }}>{pct(Number(d.fields_pct))}</span></div></td>
                    <td className="num">{d.missing_required}</td><td className="num">{d.missing_optional}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {history.length >= 2 && (<><h2>Progress over time</h2><Trend points={history.map((h) => ({ at: h.synced_at, v: Number(h.fields_pct) }))} /></>)}

            <h2>Deficiencies</h2>
            <div className="two">
              <Breakdown title="Open by priority" rows={group("open_priority")} />
              <Breakdown title="Open by contractor role" rows={group("open_role")} />
              <Breakdown title="Open by assigned contact" rows={group("open_contact")} />
              <Breakdown title="All by status" rows={group("status")} />
            </div>
            {results && <Deficiencies items={results.deficiencies} />}
          </>
        ) : (
          <div className="card">This project hasn&apos;t been synced yet. Press <b>Refresh</b> to pull it from BuildingStart (takes 5–10 minutes).</div>
        )}
      </main>
    </>
  );
}

function Tile({ big, label }: { big: string; label: string }) {
  return <div className="card tile"><div className="big">{big}</div><div className="label">{label}</div></div>;
}

function Breakdown({ title, rows }: { title: string; rows: { value: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card">
      <b>{title}</b>
      {rows.length === 0 ? <p className="muted">None</p> : (
        <table style={{ marginTop: 8 }}><tbody>
          {rows.map((r) => (
            <tr key={r.value}><td style={{ width: "45%" }}>{r.value}</td>
              <td><div className="bar"><span style={{ width: `${(100 * r.count) / max}%` }} /></div></td>
              <td className="num" style={{ width: 50 }}>{r.count}</td></tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}

function Trend({ points }: { points: { at: string; v: number }[] }) {
  const W = 640, H = 160, P = 28;
  const xs = points.map((_, i) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1));
  const ys = points.map((p) => H - P - (p.v / 100) * (H - 2 * P));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <div className="card">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Required fields filled over time">
        {[0, 50, 100].map((g) => { const y = H - P - (g / 100) * (H - 2 * P);
          return <g key={g}><line x1={P} x2={W - P} y1={y} y2={y} stroke="#e3e6eb" /><text x={4} y={y + 4} fontSize="11" fill="#667085">{g}%</text></g>; })}
        <path d={d} fill="none" stroke="#1f4e79" strokeWidth="2.5" />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3.5" fill="#1f4e79"><title>{points[i].at.slice(0, 10)}: {points[i].v}%</title></circle>)}
        <text x={P} y={H - 6} fontSize="11" fill="#667085">{points[0].at.slice(0, 10)}</text>
        <text x={W - P} y={H - 6} fontSize="11" fill="#667085" textAnchor="end">{points[points.length - 1].at.slice(0, 10)}</text>
      </svg>
    </div>
  );
}

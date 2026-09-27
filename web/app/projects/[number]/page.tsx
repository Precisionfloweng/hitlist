import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../Header";
import { pct } from "../../format";
import { byTypeOrder } from "@/lib/typeOrder";
import ProjectHeader from "./ProjectHeader";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const [data, results] = await Promise.all([getProject(number), loadResults(number)]);
  if (!data) notFound();
  const { project: p } = data;
  const summary = results?.summary;
  // Only "ticked Complete but required fields empty" (older results may also hold "went blank" flags).
  const issues = (results?.gap_flags ?? []).filter((g) => g.kind === "completed_but_missing");
  const eqHref = (type?: string) =>
    `/projects/${encodeURIComponent(p.id)}/equipment${type ? `?type=${encodeURIComponent(type)}` : ""}`;

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader project={p} tab="overview" missingRequired={summary?.missing_required} />
        {p.lastSyncStatus.startsWith("failed") && <p className="error">The last sync failed: {p.lastSyncStatus.slice(8)}</p>}

        {p.lastSync ? (
          <>
            <div className="tiles">
              <Tile big={summary ? `${summary.units_complete} / ${summary.units}` : pct(p.unitsPct)} label="Units fully complete" />
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={String(p.openDeficiencies ?? "–")} label="Open deficiencies" /></Link>
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={results ? String(results.deficiencies.filter((d) => !d.open).length) : "–"} label="Closed deficiencies" /></Link>
            </div>

            {results && results.types.length > 0 && (
              <div className="type-cards">
                {[...results.types].sort(byTypeOrder).map((t) => {
                  const done = t.summary.units_complete, n = t.summary.units;
                  const pctDone = n ? (100 * done) / n : 0;
                  return (
                    <Link key={t.key} href={eqHref(t.key)} className="type-card" title={`${t.name}: ${done} of ${n} units fully complete`}>
                      <span className="tc-name">{t.name}</span>
                      <span className="tc-num"><b>{done}</b> / {n}</span>
                      <span className={`tc-bar ${pctDone >= 100 ? "full" : ""}`}><span style={{ width: `${pctDone}%` }} /></span>
                    </Link>
                  );
                })}
              </div>
            )}

            {(() => {
              const problems = (results?.warnings ?? []).filter((w) => /no sheet named|not in export|no export column found/.test(w));
              return problems.length > 0 && (
                <div className="card" style={{ marginTop: 16, borderColor: "#f3d19c", background: "#fffaf0" }}>
                  <b>Rules that didn&apos;t match this export ({problems.length})</b>
                  <p className="muted" style={{ margin: "4px 0 8px" }}>
                    A sheet or column name in the <Link href="/rules">Default rules</Link> isn&apos;t in this project&apos;s
                    BuildingStart export, so those items weren&apos;t checked. Fix the name on the Rules page and Refresh.
                  </p>
                  <ul style={{ margin: 0 }}>{problems.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              );
            })()}

            {issues.length > 0 && (
              <div className="card" style={{ marginTop: 16, borderColor: "#f5c2c0" }}>
                <b>Possible issues found ({issues.length})</b>
                <p className="muted" style={{ margin: "4px 0 8px" }}>The unit is ticked Complete with required fields empty. Check these in BuildingStart.</p>
                <ul style={{ margin: 0 }}>
                  {issues.slice(0, 15).map((g, i) => (
                    <li key={i}><b>{g.unit}</b> ({g.type}): Ticked Complete but missing: {g.fields.join(", ")}</li>
                  ))}
                </ul>
              </div>
            )}



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

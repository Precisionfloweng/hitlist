import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../Header";
import { pct } from "../../format";
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
  const eqHref = (type?: string) =>
    `/projects/${encodeURIComponent(p.number)}/equipment${type ? `?type=${encodeURIComponent(type)}` : ""}`;

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
              <Link href={`/projects/${encodeURIComponent(p.number)}/deficiencies`} className="tile-link"><Tile big={String(p.openDeficiencies ?? "–")} label="Open deficiencies" /></Link>
              <Link href={`/projects/${encodeURIComponent(p.number)}/deficiencies`} className="tile-link"><Tile big={results ? String(results.deficiencies.filter((d) => !d.open).length) : "–"} label="Closed deficiencies" /></Link>
            </div>

            {results && results.types.length > 0 && (
              <div className="type-cards">
                {[...results.types].sort((x, y) => x.name.localeCompare(y.name)).map((t) => {
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

            {(results?.gap_flags?.length ?? 0) > 0 && (
              <div className="card" style={{ marginTop: 16, borderColor: "#f5c2c0" }}>
                <b>Possible export gaps ({results!.gap_flags!.length})</b>
                <p className="muted" style={{ margin: "4px 0 8px" }}>Data that was there last sync is blank now, or a unit is ticked Complete with required fields empty. Check these in BuildingStart.</p>
                <ul style={{ margin: 0 }}>
                  {results!.gap_flags!.slice(0, 15).map((g, i) => (
                    <li key={i}><b>{g.unit}</b> ({g.type}): {g.kind === "data_disappeared" ? "went blank: " : "Ticked Complete but missing: "}{g.fields.join(", ")}</li>
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

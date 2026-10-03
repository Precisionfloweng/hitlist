import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../Header";
import { pct, syncLabel } from "../../format";
import { byTypeOrder } from "@/lib/typeOrder";
import IssuesList from "./IssuesList";
import ProjectHeader from "./ProjectHeader";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { daysSince, getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";
import { loadTolerances } from "@/lib/tolerances";
import { fmtTol, hasTol, TOLERANCE_GROUPS, toleranceSummary } from "@/lib/toleranceCats";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const [data, results, tol] = await Promise.all([getProject(number), loadResults(number), loadTolerances(number)]);
  if (!data || !canSee(user, data.project.id)) notFound();
  const { project: p } = data;
  const summary = results?.summary;
  // Only "ticked Complete but required fields empty" (older results may also hold "went blank" flags).
  const issues = (results?.gap_flags ?? []).filter((g) => g.kind === "completed_but_missing");
  const eqHref = (type?: string) =>
    `/projects/${encodeURIComponent(p.id)}/equipment${type ? `?type=${encodeURIComponent(type)}` : ""}`;
  // Group the issues by equipment type, in BuildingStart order (the flags carry the type's name).
  const typeKeys = new Map((results?.types ?? []).map((t) => [t.name, t.key]));
  const issueGroups = [...new Set(issues.map((g) => g.type))]
    .map((name) => ({ name, key: typeKeys.get(name) ?? name }))
    .sort(byTypeOrder)
    .map(({ name, key }) => ({
      type: name, href: eqHref(typeKeys.has(name) ? key : undefined),
      items: issues.filter((g) => g.type === name).map((g) => ({ unit: g.unit, fields: g.fields })),
    }));

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: user.role === "customer", canSync: canEdit(user) }} project={p} tab="overview" missingRequired={summary?.missing_required} notes={results?.notes?.length} />
        {p.lastSyncStatus.startsWith("failed") && <p className="error">The last sync failed: {p.lastSyncStatus.slice(8)}</p>}

        {p.lastSync ? (
          <>
            {toleranceSummary(tol).length > 0 && (
              <details className="card tol-view">
                <summary>
                  <b>Tolerances</b>
                  <span className="muted"> · from the spec ({TOLERANCE_GROUPS.filter((g) => g.items.some((i) => hasTol(tol[i.key]))).length} groups set) · tap to show</span>
                </summary>
                <div className="tol-groups">
                  {TOLERANCE_GROUPS.filter((g) => g.items.some((i) => hasTol(tol[i.key]))).map((g) => (
                    <div key={g.key} className="tol-group">
                      <div className="tol-group-name">{g.label}</div>
                      {g.items.map((i) => (
                        <div key={i.key} className="tol-item">
                          <span className="tol-label">{i.label}</span>
                          <span className={`tol-value${hasTol(tol[i.key]) ? "" : " none"}`}>{hasTol(tol[i.key]) ? fmtTol(tol[i.key]) : "not set"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {user.role !== "customer" && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  Change them on the <Link href={`/projects/${encodeURIComponent(p.id)}/rules`}>Rules / Tol.</Link> tab.</div>}
              </details>
            )}
            <div className="tiles">
              <Tile big={summary ? `${summary.units_complete} / ${summary.units}` : pct(p.unitsPct)} label="Units fully complete" />
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={String(p.openDeficiencies ?? "–")} label="Open deficiencies" /></Link>
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={results ? String(results.deficiencies.filter((d) => !d.open).length) : "–"} label="Closed deficiencies" /></Link>
              {user.role !== "customer" && (
                <Tile big={p.punchSent ? new Date(p.punchSent).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })
                  : p.dropboxPath ? "None yet" : "–"}
                  label={p.punchSent ? `Last punch list sent · ${syncLabel(daysSince(p.punchSent)).text.toLowerCase()}` : "Last punch list sent"}
                  title={p.punchFile ? `Newest file in Deficiency Reports: ${p.punchFile}` : "From the newest file in the project's Dropbox Deficiency Reports folder"} />
              )}
            </div>

            {results && results.types.length > 0 && (
              <div className="type-cards">
                {[...results.types].sort(byTypeOrder).map((t) => {
                  const done = t.summary.units_complete, n = t.summary.units;
                  const pctDone = n ? (100 * done) / n : 0;
                  return (
                    <Link key={t.key} href={eqHref(t.key)} className={`type-card${pctDone >= 100 ? " full" : ""}`} title={`${t.name}: ${done} of ${n} units fully complete, ${Math.round(t.summary.fields_pct)}% of required fields filled`}>
                      <span className="tc-name">{t.name}</span>
                      <span className="tc-row">
                        <span className="tc-num"><b>{done}</b> / {n} <span className="tc-units">units</span></span>
                        <span className={`tc-pct${t.summary.fields_pct >= 100 ? " full" : ""}`} title="Required fields filled for this equipment type (same as the Equipment checklist)">{Math.round(t.summary.fields_pct)}%</span>
                      </span>
                      <span className={`tc-bar ${pctDone >= 100 ? "full" : ""}`}><span style={{ width: `${pctDone}%` }} /></span>
                    </Link>
                  );
                })}
              </div>
            )}

            {(() => {
              if (user.role === "customer") return null;   // internal setup notes
              const problems = (results?.warnings ?? []).filter((w) => /the export has '|not in export|no export column found/.test(w));
              return problems.length > 0 && (
                <div className="card" style={{ marginTop: 16, borderColor: "#f3d19c", background: "#fffaf0" }}>
                  <b>Rules that didn&apos;t match this export ({problems.length})</b>
                  <p className="muted" style={{ margin: "4px 0 8px" }}>
                    A sheet or column name in the <Link href="/rules">Default Rules</Link> isn&apos;t in this project&apos;s
                    BuildingStart export, so those items weren&apos;t checked. Fix the name on the Rules page and press Sync.
                  </p>
                  <ul style={{ margin: 0 }}>{problems.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              );
            })()}

            {issues.length > 0 && (
              <div className="card" style={{ marginTop: 16, borderColor: "#f5c2c0" }}>
                <b>Possible issues found ({issues.length})</b>
                <p className="muted" style={{ margin: "4px 0 8px" }}>BuildingStart shows the following units checked complete with required fields empty.</p>
                <IssuesList total={issues.length} groups={issueGroups} />
              </div>
            )}



          </>
        ) : (
          <div className="card">This project hasn&apos;t been synced yet. Press <b>Sync</b> to pull it from BuildingStart (takes 5–10 minutes).</div>
        )}
      </main>
    </>
  );
}

function Tile({ big, label, title }: { big: string; label: string; title?: string }) {
  return <div className="card tile" title={title}><div className="big">{big}</div><div className="label">{label}</div></div>;
}

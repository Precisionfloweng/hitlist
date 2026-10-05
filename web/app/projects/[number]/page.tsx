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
import { loadToleranceSources, loadTolerancesWithDefaults } from "@/lib/tolerances";
import { fmtTol, presentGroups, TOLERANCE_GROUPS } from "@/lib/toleranceCats";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const [data, results, { tol, def }, tolSrc] = await Promise.all([getProject(number), loadResults(number),
    loadTolerancesWithDefaults(number), loadToleranceSources(number)]);
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
            {(() => {   // tolerances for the equipment this project has: from the spec, or the company default
              const present = results ? presentGroups(results) : [];
              const groups = TOLERANCE_GROUPS.filter((g) => present.includes(g.key) || g.items.some((i) => !tol[i.key].isDefault));
              if (!groups.length) return null;
              // Each group's tag: where its saved values came from (recorded when they were saved).
              const TAGS = { spec: ["ok", "From spec"], hand: ["warn", "Set by hand"], mixed: ["warn", "Spec + by hand"],
                saved: ["gray", "Saved"], default: ["gray", "Default"] } as const;
              const tagOf = (g: (typeof groups)[number]): keyof typeof TAGS => {
                const set = g.items.filter((i) => !tol[i.key].isDefault).map((i) => tolSrc[i.key]?.source ?? "");
                if (!set.length) return "default";
                if (set.every((x) => x === "spec")) return "spec";
                if (set.every((x) => x === "hand")) return "hand";
                return set.includes("spec") && set.includes("hand") ? "mixed" : "saved";
              };
              const tags = groups.map(tagOf);
              const count = (k: string) => tags.filter((t) => t === k).length;
              const parts = [["spec", "from the spec"], ["hand", "set by hand"], ["mixed", "partly by hand"], ["saved", "saved"]]
                .filter(([k]) => count(k)).map(([k, w]) => `${count(k)} group${count(k) === 1 ? "" : "s"} ${w}`);
              const nDef = count("default");
              const line = [...parts, nDef ? `${parts.length ? "the rest" : "all"} company default ${fmtTol(def)}` : ""].filter(Boolean).join(", ");
              // The spec(s) the values came from, newest first.
              const specs = new Map<string, string>();
              for (const g of groups) for (const i of g.items) {
                const src = tolSrc[i.key];
                if (!tol[i.key].isDefault && src?.source === "spec" && !specs.has(src.note)) specs.set(src.note, src.at);
              }
              const day = (iso: string) => { const d = new Date(iso);
                return isNaN(+d) ? "" : d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }); };
              return (
                <details className="card tol-view">
                  <summary>
                    <b>Design Tolerances</b>
                    <span className="muted"> · {tags.every((t) => t === "spec") ? "✓ All from the project spec"
                      : canEdit(user) ? <>Ask <Link href={`/projects/${encodeURIComponent(p.id)}/ai`} className="tol-ai-link">✨ AI Tools</Link> to pull these from the project spec</>
                      : line} · tap to show</span>
                  </summary>
                  <div className="docs-tol-grid" style={{ marginTop: 10 }}>
                    {groups.map((g, n) => (
                      <table key={g.key} className="docs-tol-table">
                        <thead><tr><th colSpan={2}>{g.label}<span className={`pill ${TAGS[tags[n]][0]} tol-src`}>{TAGS[tags[n]][1]}</span></th></tr></thead>
                        <tbody>{g.items.map((i) => (
                          <tr key={i.key}>
                            <td>{i.label}</td>
                            <td className={`v${tol[i.key].isDefault ? " dflt" : ""}`}>{fmtTol(tol[i.key])}{tol[i.key].isDefault && <small> (default)</small>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    ))}
                  </div>
                  {[...specs].sort((a, b) => b[1].localeCompare(a[1])).map(([note, at]) => (
                    <div key={note} className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                      <b style={{ color: "var(--ink)" }}>From spec:</b> {note || "the project spec"}{day(at) && ` · saved ${day(at)}`}</div>
                  ))}
                  {user.role !== "customer" && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                    Change them on the <Link href={`/projects/${encodeURIComponent(p.id)}/rules`}>Rules / Tol.</Link> tab.</div>}
                </details>
              );
            })()}
            <div className="ov-head">Project summary</div>
            <div className="tiles summary-banner">
              <Tile big={summary ? `${summary.units_complete} / ${summary.units}` : pct(p.unitsPct)} label="Units fully complete" />
              <Tile big={pct(summary ? summary.fields_pct : p.fieldsPct)} label="Overall complete"
                title="Required fields filled across the whole project (same as Complete on the projects list)" />
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={String(p.openDeficiencies ?? "–")} label="Open deficiencies" /></Link>
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={results ? String(results.deficiencies.filter((d) => !d.open).length) : "–"} label="Closed deficiencies" /></Link>
              {user.role !== "customer" && (
                <Tile big={p.punchSent ? new Date(p.punchSent).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })
                  : p.dropboxPath ? "None yet" : "–"}
                  label={p.punchSent ? `Last punch list sent · ${syncLabel(daysSince(p.punchSent)).text.toLowerCase().replace(/ ago$/, "")}` : "Last punch list sent"}
                  title={p.punchFile ? `Newest file in Deficiency Reports: ${p.punchFile}` : "From the newest file in the project's Dropbox Deficiency Reports folder"} />
              )}
            </div>

            {results && results.types.length > 0 && <div className="ov-head">Equipment <span>· {results.types.length} type{results.types.length === 1 ? "" : "s"} · tap a card for its checklist</span></div>}
            {results && results.types.length > 0 && (
              <div className="type-cards">
                {[...results.types].sort(byTypeOrder).map((t) => {
                  const done = t.summary.units_complete, n = t.summary.units;
                  const pctDone = Math.min(100, t.summary.fields_pct);   // the bar follows the % (required fields filled)
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

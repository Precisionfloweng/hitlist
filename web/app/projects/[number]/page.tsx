import Link from "next/link";
import { customerTypes } from "@/lib/customerView";
import { unitWhere } from "@/lib/unitLabel";
import { jobProgress, typeTotals, workText } from "@/lib/completion";
import { loadWork } from "@/lib/settings";
import { loadRules } from "@/lib/rules";
import { applyWeights, typePct } from "@/lib/weights";
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
  const [data, raw, { tol, def }, tolSrc, work, rules] = await Promise.all([getProject(number), loadResults(number),
    loadTolerancesWithDefaults(number), loadToleranceSources(number), loadWork(), loadRules()]);
  const results = raw ? applyWeights(raw, rules.types) : null;   // each type's % by its completion weights, when it has them
  const progress = results ? jobProgress(typeTotals(results.types), work, results.summary.fields_pct) : null;   // job % by work per unit
  if (!data || !canSee(user, data.project.id)) notFound();
  const { project: p } = data;
  const summary = results?.summary;
  const customer = user.role === "customer";
  const cust = customer && results ? customerTypes(results.types, results.deficiencies) : null;   // main units only
  // Only "ticked Complete but required fields empty" (older results may also hold "went blank" flags).
  const issues = (results?.gap_flags ?? []).filter((g) => g.kind === "completed_but_missing");
  const eqHref = (type?: string) =>
    `/projects/${encodeURIComponent(p.id)}/equipment${type ? `?type=${encodeURIComponent(type)}` : ""}`;
  // The grey line for a flagged unit (a grille's unit and area): from the flag's path, else the only unit with that name.
  const issueWhere = (g: { type: string; unit: string; path?: string }) => {
    const t = results?.types.find((x) => x.name === g.type);
    if (!t) return "";
    const same = t.units.filter((u) => (g.path ? u.path === g.path : u.name === g.unit));
    return same.length === 1 ? unitWhere(t.export_sheet, same[0].path, same[0].area) : g.path ? unitWhere(t.export_sheet, g.path) : "";
  };
  // Group the issues by equipment type, in BuildingStart order (the flags carry the type's name).
  const typeKeys = new Map((results?.types ?? []).map((t) => [t.name, t.key]));
  const issueGroups = [...new Set(issues.map((g) => g.type))]
    .map((name) => ({ name, key: typeKeys.get(name) ?? name }))
    .sort(byTypeOrder)
    .map(({ name, key }) => ({
      type: name, href: eqHref(typeKeys.has(name) ? key : undefined),
      items: issues.filter((g) => g.type === name).map((g) => ({ unit: g.unit, fields: g.fields, where: issueWhere(g) })),
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
              const line = [...parts, nDef ? `${parts.length ? "the rest" : "all"} company default${new Set(groups.flatMap((g) => g.items.filter((i) => tol[i.key].isDefault).map((i) => fmtTol(tol[i.key])))).size === 1 ? ` ${fmtTol(tol[groups.flatMap((g) => g.items).find((i) => tol[i.key].isDefault)!.key])}` : "s"}` : ""].filter(Boolean).join(", ");
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
                    <span className="muted"> · {tags.every((t) => t === "spec") ? <><svg className="ok-check" viewBox="0 0 20 20" aria-hidden><circle cx="10" cy="10" r="10" /><path d="M5.5 10.5l3 3 6-6.5" /></svg>All from the project spec</>
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
              {customer ? (   // customers: when it was last updated instead of the counts and the overall %
                <Tile big={p.lastSync ? new Date(p.lastSync).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "–"}
                  label="Last updated" title="When the technician last synced this job from the field" />
              ) : (<>
                <Tile big={summary ? `${summary.units_complete} / ${summary.units}` : pct(p.unitsPct)} label="Items fully complete" />
<Tile big={pct(progress ? progress.pct : p.completePct)} label="Overall complete"
                  sub={progress && user.role === "admin" && work.unit === "minutes" ? `about ${workText(progress.left, "minutes")} of ${workText(progress.total, "minutes")} left` : undefined}
                  title="Each unit's % done, weighted by how much work one of its type is (same as Complete on the projects list)" />
              </>)}
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={String(p.openDeficiencies ?? "–")} label="Open deficiencies" /></Link>
              <Link href={`/projects/${encodeURIComponent(p.id)}/deficiencies`} className="tile-link"><Tile big={results ? String(results.deficiencies.filter((d) => !d.open).length) : "–"} label="Closed deficiencies" /></Link>
              {(
                <Tile big={p.punchSent ? new Date(p.punchSent).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })
                  : p.dropboxPath ? "None yet" : "–"}
                  label={p.punchSent ? `Last punch list sent · ${syncLabel(daysSince(p.punchSent)).text.toLowerCase().replace(/ ago$/, "")}` : "Last punch list sent"}
                  title={p.punchFile ? `Newest file in Deficiency Reports: ${p.punchFile}` : "From the newest file in the project's Dropbox Deficiency Reports folder"} />
              )}
            </div>

            {cust && cust.length > 0 && (<>
              <div className="ov-head">Equipment <span>· tap a card for its units</span></div>
              <div className="type-cards">
                {cust.map((t) => {
                  const n = t.units.length, pctDone = Math.min(100, Math.round(t.pct));   // same % as the staff card
                  return (
                    <Link key={t.key} href={eqHref(t.key)} className={`type-card${pctDone >= 100 ? " full" : ""}`}>
                      <span className="tc-name">{t.name}</span>
                      <span className="tc-row">
                        <span className={`tc-num tc-w${String(t.done).length + String(n).length}`}><b>{t.done}</b> / {n} <span className="tc-units">done</span></span>
                        <span className={`tc-pct${pctDone >= 100 ? " full" : ""}`}>{pctDone}%</span>
                      </span>
                      <span className={`tc-bar ${pctDone >= 100 ? "full" : ""}`}><span style={{ width: `${pctDone}%` }} /></span>
                    </Link>
                  );
                })}
              </div>
            </>)}
            {!cust && results && results.types.length > 0 && <div className="ov-head">Equipment <span>· {results.types.length} type{results.types.length === 1 ? "" : "s"} · tap a card for its checklist</span></div>}
            {!cust && results && results.types.length > 0 && (
              <div className="type-cards">
                {[...results.types].sort(byTypeOrder).map((t) => {
                  const done = t.summary.units_complete, n = t.summary.units;
                  const pctDone = Math.min(100, typePct(t));   // the bar follows the % (by weights, else required fields filled)
                  return (
                    <Link key={t.key} href={eqHref(t.key)} className={`type-card${pctDone >= 100 ? " full" : ""}`} title={`${t.name}: ${done} of ${n} items fully complete, ${Math.round(typePct(t))}% done${t.summary.weighted_pct !== undefined ? " (by completion weights)" : " (required fields filled)"}`}>
                      <span className="tc-name">{t.name}</span>
                      <span className="tc-row">
                        <span className={`tc-num tc-w${String(done).length + String(n).length}`}><b>{done}</b> / {n} <span className="tc-units">items</span></span>
                        <span className={`tc-pct${typePct(t) >= 100 ? " full" : ""}`} title="% done for this equipment type (same as the Equipment checklist)">{Math.round(typePct(t))}%</span>
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

            {issues.length > 0 && user.role !== "customer" && (   // staff only: units ticked Complete but missing readings
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

function Tile({ big, label, title, sub }: { big: string; label: string; title?: string; sub?: string }) {
  return <div className="card tile" title={title}><div className="big">{big}</div><div className="label">{label}</div>{sub && <div className="label tile-sub">{sub}</div>}</div>;
}

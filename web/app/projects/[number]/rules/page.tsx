import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import RulesEditor from "../../../rules/RulesEditor";
import { canEdit, requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadRules } from "@/lib/rules";
import { loadResults } from "@/lib/results";
import { loadTolerances } from "@/lib/tolerances";
import TolerancesCard from "./TolerancesCard";
import { presentGroups } from "@/lib/toleranceCats";
import { defaultTolerance } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ProjectRulesPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireStaff();
  const number = decodeURIComponent((await params).number);
  const [data, rules, results, tol, def] = await Promise.all([getProject(number), loadRules(number), loadResults(number),
    loadTolerances(number), defaultTolerance()]);
  if (!data) notFound();
  // Tolerance boxes only for equipment this project has (from its last sync, including untracked sheets
  // like Supply Outlet); before a first sync, all of them.
  const present = results ? presentGroups(results) : null;
  const changed = rules.types.reduce((n, t) => n + t.fields.filter((f) => f.status !== f.defaultStatus).length, 0);

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: false, canSync: canEdit(user) }} project={data.project} tab="rules" missingRequired={results?.summary.missing_required} rulesChanged={changed} notes={results?.notes?.length} />
        <TolerancesCard project={data.project.id} initial={tol} canEdit={canEdit(user)} present={present} def={def} />
        <div className="card tol-card">
          <div className="card-head">
            <b>Rules</b>
            <span className="muted" style={{ fontSize: 13 }}>Pick a type, set each field Required, Optional or Ignore.
              Starts from the <Link href="/rules">company defaults</Link>; changes (blue) apply to this project only. After making changes, run a new sync to update the Hitlist.
              {changed > 0 && <> This project has <b>{changed}</b> field{changed === 1 ? "" : "s"} changed.</>}</span>
          </div>
          <RulesEditor types={rules.types} history={rules.history} canEdit={canEdit(user)} project={data.project.id} />
        </div>
      </main>
    </>
  );
}

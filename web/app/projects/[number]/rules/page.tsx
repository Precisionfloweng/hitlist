import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import RulesEditor from "../../../rules/RulesEditor";
import { canEdit, requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadRules } from "@/lib/rules";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function ProjectRulesPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireStaff();
  const number = decodeURIComponent((await params).number);
  const [data, rules, results] = await Promise.all([getProject(number), loadRules(number), loadResults(number)]);
  if (!data) notFound();
  const changed = rules.types.reduce((n, t) => n + t.fields.filter((f) => f.status !== f.defaultStatus).length, 0);

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: false, canSync: canEdit(user) }} project={data.project} tab="rules" missingRequired={results?.summary.missing_required} rulesChanged={changed} notes={results?.notes?.length} />
        <p className="muted" style={{ marginTop: 0 }}>
          What this project needs filled in. It starts from the <Link href="/rules">company default rules</Link>;
          anything you change here applies to this project only (highlighted blue), on its next sync.
          {changed > 0 && <> This project has <b>{changed}</b> field{changed === 1 ? "" : "s"} changed from the default.</>}
        </p>
        <RulesEditor types={rules.types} history={rules.history} canEdit={canEdit(user)} project={data.project.id} />
      </main>
    </>
  );
}

import { notFound, redirect } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import AiTools from "./AiTools";
import DocsAsk from "./DocsAsk";
import { loadTolerances } from "@/lib/tolerances";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";
import { byTypeOrder } from "@/lib/typeOrder";

export const dynamic = "force-dynamic";

export default async function AiToolsPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  if (!canEdit(user)) redirect(`/projects/${encodeURIComponent(number)}`);   // techs and admins only
  const [data, results, projectTol] = await Promise.all([getProject(number), loadResults(number), loadTolerances(number)]);
  if (!data || !canSee(user, data.project.id)) notFound();
  const p = data.project;
  // Every unit and sub-item, in BuildingStart order, for the optional equipment picker.
  const units = (results?.types ?? []).slice().sort(byTypeOrder)
    .flatMap((t) => t.units.map((u) => ({ path: u.path, name: u.name, type: t.name })));

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: false, canSync: true }} project={p} tab="ai"
          missingRequired={results?.summary.missing_required} notes={results?.notes?.length} />
        <AiTools project={p.id} units={units} />
        <section className="ai-tools">
          <DocsAsk project={p.id} units={[...new Set(units.map((u) => u.name))]} projectTol={projectTol} />
        </section>
      </main>
    </>
  );
}

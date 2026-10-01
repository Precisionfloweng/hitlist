import { notFound } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import Breakdown from "./Breakdown";
import DeficiencyList from "./DeficiencyList";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function DeficienciesPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const [data, results] = await Promise.all([getProject(number), loadResults(number)]);
  if (!data || !canSee(user, data.project.id)) notFound();
  const { project: p, deficiencies } = data;
  const group = (g: string) => deficiencies.filter((d) => d.group === g)
    .map((d) => ({ value: d.value, count: Number(d.count) })).sort((a, b) => b.count - a.count);

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: user.role === "customer", canSync: canEdit(user) }} project={p} tab="deficiencies" missingRequired={results?.summary.missing_required} notes={results?.notes?.length} />
        {p.lastSync ? (
          <>
            <div className="two">
              <Breakdown title="Open by priority" rows={group("open_priority")} />
              <Breakdown title="Open by contractor role" rows={group("open_role")} />
              <Breakdown title="Open by assigned contact" rows={group("open_contact")} />
              <Breakdown title="All by status" rows={group("status")} />
            </div>
            {results ? <DeficiencyList items={results.deficiencies} /> :
              <p className="muted">The full list appears after the next sync.</p>}
          </>
        ) : (
          <div className="card">This project hasn&apos;t been synced yet. Press <b>Sync</b> to pull it from BuildingStart.</div>
        )}
      </main>
    </>
  );
}

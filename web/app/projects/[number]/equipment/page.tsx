import { notFound } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import EquipmentView from "./EquipmentView";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({ params, searchParams }:
  { params: Promise<{ number: string }>; searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const { type } = await searchParams;
  const [data, results] = await Promise.all([getProject(number), loadResults(number)]);
  if (!data || !canSee(user, data.project.id)) notFound();
  const p = data.project;

  return (
    <>
      <Header user={user} />
      <main className="wide">
        <ProjectHeader user={{ customer: user.role === "customer", canSync: canEdit(user) }} project={p} tab="equipment" missingRequired={results?.summary.missing_required} notes={results?.notes?.length} />
        {results ? <EquipmentView types={results.types} initialType={type} syncedAt={results.generated_at} deficiencies={results.deficiencies} notes={user.role === "customer" ? [] : results.notes ?? []} /> : (
          <div className="card">No equipment results yet. Press <b>Sync</b> to pull this project from BuildingStart.</div>
        )}
      </main>
    </>
  );
}

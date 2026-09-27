import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../Header";
import RefreshButton from "../../../RefreshButton";
import EquipmentView from "./EquipmentView";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({ params, searchParams }:
  { params: Promise<{ number: string }>; searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  const { type } = await searchParams;
  const [data, results] = await Promise.all([getProject(number), loadResults(number)]);
  if (!data) notFound();
  const p = data.project;
  const href = `/projects/${encodeURIComponent(p.number)}`;

  return (
    <>
      <Header user={user} />
      <main className="wide">
        <div className="muted"><Link href={href}>← {p.number} · {p.name}</Link></div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1>Equipment checklist</h1>
          <RefreshButton project={p.number} job={p.job} />
        </div>
        {results ? <EquipmentView types={results.types} initialType={type} syncedAt={results.generated_at} /> : (
          <div className="card">No equipment results yet. Press <b>Refresh</b> to pull this project from BuildingStart.</div>
        )}
      </main>
    </>
  );
}

import Header from "../../Header";
import AdminNav from "../AdminNav";
import WeightsEditor from "./WeightsEditor";
import { requireAdmin } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { loadWeights } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function WeightsAdmin() {
  const [user, weights, projects] = await Promise.all([requireAdmin(), loadWeights(), listProjects()]);
  const choices = projects.filter((p) => p.status === "active" && p.lastSync)
    .map((p) => ({ id: p.id, label: `${p.number} · ${p.name}` }));
  return (
    <>
      <Header user={user} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="weights" />
        <WeightsEditor initial={weights} projects={choices} />
      </main>
    </>
  );
}

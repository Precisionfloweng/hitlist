import Header from "../../Header";
import AdminNav from "../AdminNav";
import WeightsEditor, { type EditorType } from "./WeightsEditor";
import { requireAdmin } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { loadWork } from "@/lib/settings";
import { loadRules } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function WeightsAdmin() {
  const [user, work, projects, rules] = await Promise.all([requireAdmin(), loadWork(), listProjects(), loadRules()]);
  const choices = projects.filter((p) => p.status === "active" && p.lastSync)
    .map((p) => ({ id: p.id, label: `${p.number} · ${p.name}` }));
  const types: EditorType[] = rules.types.map((t) => ({ key: t.key, name: t.name,
    fields: t.fields.map((f) => ({ order: f.order, field: f.field, status: f.status, weight: f.weight, group: f.group ?? "" })) }));
  return (
    <>
      <Header user={user} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="weights" />
        <WeightsEditor initial={work} projects={choices} types={types} />
      </main>
    </>
  );
}

import Header from "../Header";
import AdminProjects from "./AdminProjects";
import AdminNav from "./AdminNav";
import { requireAdmin } from "@/lib/auth";
import { listProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdmin();
  const projects = await listProjects(true);
  const rows = projects.map((p) => ({ number: p.number, name: p.name, tech: p.tech, date: p.date,
    address: p.address, status: p.status || "active" }));
  return (
    <>
      <Header user={user} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="projects" />
        <p className="muted">Add, edit, archive or delete projects. Archived projects drop off the Projects page and the weekly summary but keep their data.</p>
        <AdminProjects initial={rows} />
      </main>
    </>
  );
}

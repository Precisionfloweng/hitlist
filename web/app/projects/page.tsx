import Header from "../Header";
import ProjectsTable from "./ProjectsTable";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { isMine, listProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = (await listProjects()).filter((p) => p.status !== "archived" && canSee(user, p.id));
  const rows = projects.map((p) => ({ ...p, mine: isMine(p, user) }));
  return (
    <>
      <Header user={user} />
      <main>
        <ProjectsTable rows={rows} userName={user.name} customer={user.role === "customer"} canSync={canEdit(user)} />
      </main>
    </>
  );
}

import Header from "../../Header";
import AdminNav from "../AdminNav";
import AdminUsers from "./AdminUsers";
import { requireAdmin } from "@/lib/auth";
import { listProjects, listUsers } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, projects] = await Promise.all([listUsers(), listProjects(true)]);
  const choices = projects.map((p) => ({ id: p.id, label: `${p.number} · ${p.name}` }));
  return (
    <>
      <Header user={me} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="users" />
        <p className="muted">
          Only people on this list can sign in. <b>Admin</b>: everything, including this page and the project list.
          {" "}<b>Tech</b>: all projects, Sync, and rules. <b>Viewer</b>: read-only. <b>Owner</b>: an admin who can&apos;t be removed or changed.
          {" "}<b>Customer</b>: someone outside PFE who sees <b>only the projects you tick</b>, read-only (no Sync, rules or help).
          Turning someone <b>off</b> blocks sign-in right away and keeps their history.
          For "My projects" to work, a tech&apos;s name here should match the Tech column on the project list (first name is enough).
        </p>
        <AdminUsers initial={users} me={me.email} projects={choices} />
      </main>
    </>
  );
}

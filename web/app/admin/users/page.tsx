import Header from "../../Header";
import AdminNav from "../AdminNav";
import AdminUsers from "./AdminUsers";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await listUsers();
  return (
    <>
      <Header user={me} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="users" />
        <p className="muted">
          Only people on this list can sign in. <b>Admin</b>: everything, including this page and the project list.
          {" "}<b>Tech</b>: all projects, Sync, and rules. <b>Viewer</b>: read-only. <b>Owner</b>: an admin who can&apos;t be removed or changed.
          Turning someone <b>off</b> blocks sign-in right away and keeps their history.
          For "My projects" to work, a tech&apos;s name here should match the Tech column on the project list (first name is enough).
        </p>
        <AdminUsers initial={users} me={me.email} />
      </main>
    </>
  );
}

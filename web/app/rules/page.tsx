import Header from "../Header";
import RulesEditor from "./RulesEditor";
import { requireUser } from "@/lib/auth";
import { loadRules } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const user = await requireUser();
  const { types, history } = await loadRules();
  return (
    <>
      <Header user={user} />
      <main>
        <h1>Default rules</h1>
        <p className="muted">
          What each equipment type needs filled in. <span className="s-R">✖ Required</span> counts toward completion %,
          {" "}<span className="s-O">⚠ Optional</span> shows as a warning, <b>Ignore</b> isn&apos;t checked.
          These are the company defaults every project starts with. To change a rule for one job only, open
          the project and use its <b>Rules</b> tab. Changes here apply to every project on its next sync,
          except fields a project has changed for itself.
        </p>
        {user.role !== "admin" && <p className="card">Only admins can change the default rules.</p>}
        <RulesEditor types={types} history={history} canEdit={user.role === "admin"} />
      </main>
    </>
  );
}

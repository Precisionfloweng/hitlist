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
        <h1>Rules</h1>
        <p className="muted">
          What each equipment type needs filled in. <span className="s-R">✖ Required</span> counts toward completion %,
          {" "}<span className="s-O">⚠ Optional</span> shows as a warning, <b>Ignore</b> isn&apos;t checked.
          Changes apply to each project on its next sync.
        </p>
        <RulesEditor types={types} history={history} canEdit={user.role !== "viewer"} />
      </main>
    </>
  );
}

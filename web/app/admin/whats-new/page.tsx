import Header from "../../Header";
import AdminNav from "../AdminNav";
import PreviewButton from "./PreviewButton";
import { requireAdmin } from "@/lib/auth";
import { EMAIL_SHOWN, whatsNew } from "@/lib/whatsNew";

export const dynamic = "force-dynamic";

export default async function WhatsNewAdmin() {
  const user = await requireAdmin();
  // In Monday's email: the newest 10 for techs, and the newest 10 for admins (which can include admin-only items).
  const recent = new Set([...whatsNew(false).slice(0, EMAIL_SHOWN), ...whatsNew(true).slice(0, EMAIL_SHOWN)]);
  const all = whatsNew(true);
  return (
    <>
      <Header user={user} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="whats-new" />
        <p className="muted">
          Changes to Hitlist, written as they&apos;re added. Each Monday email starts with the {EMAIL_SHOWN} newest
          (the <b>In Monday&apos;s email</b> ones). Items marked <b>Admins only</b> go only to admins. Techs see the list on the Help page too.
        </p>
        <PreviewButton />
        <div className="card" style={{ marginTop: 14 }}>
          <table><thead><tr><th>Date</th><th>Change</th><th>Who sees it</th><th></th></tr></thead><tbody>
            {all.map((e, i) => (
              <tr key={i}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                <td><b>{e.title}</b><div className="muted" style={{ fontSize: 13 }}>{e.text}</div></td>
                <td>{e.audience === "admins" ? <span className="pill gray">Admins only</span> : "Everyone"}</td>
                <td>{recent.has(e) && <span className="pill ok" style={{ whiteSpace: "nowrap" }}>In Monday&apos;s email</span>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </main>
    </>
  );
}

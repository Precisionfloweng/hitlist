import Header from "../../Header";
import AdminNav from "../AdminNav";
import DefaultTolerance from "./DefaultTolerance";
import { requireAdmin } from "@/lib/auth";
import { defaultTolerance } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsAdmin() {
  const [user, def] = await Promise.all([requireAdmin(), defaultTolerance()]);
  return (
    <>
      <Header user={user} />
      <main>
        <h1>Admin</h1>
        <AdminNav on="settings" />
        <p className="muted">Company-wide settings. Only admins can see or change these; every change is logged with who made it.</p>
        <DefaultTolerance initial={def} />
      </main>
    </>
  );
}

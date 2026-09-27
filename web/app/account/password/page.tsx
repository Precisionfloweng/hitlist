import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <main>
      <div className="card login">
        <h1>{user.hasPassword ? "Change your password" : "Create your password"}</h1>
        <p className="muted">
          {user.hasPassword ? "" : `Welcome, ${user.name.split(" ")[0]}. `}
          From now on you&apos;ll sign in with <b>{user.email}</b> and this password, and each device stays signed in.
        </p>
        <PasswordForm first={!user.hasPassword} />
      </div>
    </main>
  );
}

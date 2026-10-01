import Link from "next/link";
import type { User } from "@/lib/auth";
import { serverStatus } from "@/lib/serverStatus";

export default async function Header({ user }: { user: User }) {
  const status = user.role === "customer" ? null : await serverStatus();
  return (
    <>
    <header className="top">
      <div className="inner">
        <Link href="/projects" className="logo" aria-label="PFE Hitlist: projects" title="PFE Hitlist">
          <span className="logo-word">HIT<span>LIST</span></span>
          <span className="logo-bar" aria-hidden="true" />
        </Link>
        <Link href="/projects">Projects</Link>
        {user.role !== "customer" && <Link href="/rules">Default Rules</Link>}
        {user.role === "admin" && <Link href="/admin">Admin</Link>}
        {user.role !== "customer" && <Link href="/help">Help</Link>}
        <span className="spacer" />
        <Link href="/account/password">{user.name}</Link>
        <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
      </div>
    </header>
    {status?.down && (
      <div className="server-down" role="status">
        <b>The server is currently down so the site is unable to sync.</b>
        <span className="muted"> Last checked in {new Date(status.lastSeen).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })}.</span>
      </div>
    )}
    </>
  );
}

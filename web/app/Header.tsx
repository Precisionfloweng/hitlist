import Link from "next/link";
import type { User } from "@/lib/auth";
import { serverStatus } from "@/lib/serverStatus";
import TopMenu from "./TopMenu";

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
        <TopMenu name={user.name} links={[
          { href: "/projects", label: "Projects" },
          ...(user.role !== "customer" ? [{ href: "/rules", label: "Default Rules" }] : []),
          ...(user.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
          ...(user.role !== "customer" ? [{ href: "/help", label: "Help" }] : []),
        ]} />
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

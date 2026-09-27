import Link from "next/link";
import type { User } from "@/lib/auth";

export default function Header({ user }: { user: User }) {
  return (
    <header className="top">
      <div className="inner">
        <Link href="/projects" className="logo">PFE Hitlist</Link>
        <Link href="/projects">Projects</Link>
        <Link href="/rules">Default rules</Link>
        {user.role === "admin" && <Link href="/admin">Admin</Link>}
        <span className="spacer" />
        <Link href="/account/password">{user.name}</Link>
        <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
      </div>
    </header>
  );
}

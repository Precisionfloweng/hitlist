"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string };

/** The top bar's links. On a narrow screen (phone upright) they fold into a ☰ menu at the right. */
export default function TopMenu({ links, name }: { links: NavLink[]; name: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);             // close after moving to another page
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const signOut = <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>;
  return (
    <>
      <nav className="top-links">
        {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        <span className="spacer" />
        <Link href="/account/password">{name}</Link>
        {signOut}
      </nav>
      <div ref={box} className="top-burger">
        <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
        {open && (
          <div className="top-drop">
            {links.map((l) => <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "on" : ""}>{l.label}</Link>)}
            <div className="top-drop-sep" />
            <Link href="/account/password" className={path.startsWith("/account") ? "on" : ""}>{name}<span className="top-drop-sub">Change password</span></Link>
            {signOut}
          </div>
        )}
      </div>
    </>
  );
}

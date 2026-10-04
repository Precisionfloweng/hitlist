"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type TabLink = { key: string; label: string; href: string; count?: number | null };

/** The project's tabs. When they don't all fit on one line (iPad upright, phone), they fold into one ☰ menu. */
export default function ProjectTabs({ tabs, active }: { tabs: TabLink[]; active: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      if (wrap.current && measure.current) setNarrow(measure.current.offsetWidth > wrap.current.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [tabs.length]);

  useEffect(() => {                         // close the menu on a tap outside it or Escape
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const inner = (t: TabLink) => (
    <>
      {t.key === "ai" ? <span className="ai-spark-sm" aria-hidden>✨</span> : <TabIcon tab={t.key} />}
      {t.label}
      {t.count ? <span className={`ptab-count${t.key === "deficiencies" ? " red" : t.key === "notes" ? " blue" : ""}`}>{t.count}</span> : null}
    </>
  );
  const link = (t: TabLink, onClick?: () => void) => (
    <Link key={t.key} href={t.href} onClick={onClick}
      className={`${t.key === active ? "on" : ""}${t.key === "ai" ? " ptab-ai" : ""}`}
      aria-current={t.key === active ? "page" : undefined}>
      {inner(t)}
    </Link>
  );
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div ref={wrap} className="ptabs-wrap">
      {/* Invisible copy of the full row, used only to measure whether it fits. */}
      <nav ref={measure} className="ptabs ptabs-measure" aria-hidden>{tabs.map((t) => <span key={t.key} className="ptab-m">{inner(t)}</span>)}</nav>
      {!narrow ? (
        <nav className="ptabs">{tabs.map((t) => link(t))}</nav>
      ) : (
        <nav className="ptabs ptabs-menu">
          <button type="button" className="ptabs-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="ptabs-burger" aria-hidden>☰</span>
            {inner(current)}
            <span className="ptabs-caret" aria-hidden>▾</span>
          </button>
          {open && <div className="ptabs-drop">{tabs.map((t) => link(t, () => setOpen(false)))}</div>}
        </nav>
      )}
    </div>
  );
}

/** Thin line icons for the project tabs (they take the tab's colour). AI Tools keeps its ✨. */
const ICONS: Record<string, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  equipment: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>,
  deficiencies: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  notes: <><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" /><path d="M15 3v6h6" /><path d="M7 13h10M7 17h6" /></>,
  contacts: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  rules: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
};

function TabIcon({ tab }: { tab: string }) {
  const icon = ICONS[tab];
  return icon ? <svg className="ptab-icon" viewBox="0 0 24 24" aria-hidden>{icon}</svg> : null;
}

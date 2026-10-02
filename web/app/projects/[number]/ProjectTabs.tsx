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
      {t.key === "ai" && <span className="ai-spark-sm" aria-hidden>✨</span>}
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

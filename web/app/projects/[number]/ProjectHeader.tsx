import Link from "next/link";
import RefreshButton from "../../RefreshButton";
import { syncLabel } from "../../format";
import type { Project } from "@/lib/data";

export type ProjectTab = "overview" | "equipment" | "deficiencies" | "rules";

/** Title, sync status and the tabs shared by every page of a project. */
export default function ProjectHeader({ project: p, tab, missingRequired, rulesChanged }:
  { project: Project; tab: ProjectTab; missingRequired?: number | null; rulesChanged?: number }) {
  const s = syncLabel(p.daysSinceSync);
  const base = `/projects/${encodeURIComponent(p.number)}`;
  const tabs: { key: ProjectTab; label: string; href: string; count?: number | null }[] = [
    { key: "overview", label: "Overview", href: base },
    { key: "equipment", label: "Equipment checklist", href: `${base}/equipment` },
    { key: "deficiencies", label: "Deficiencies", href: `${base}/deficiencies`, count: p.openDeficiencies },
    { key: "rules", label: "Rules", href: `${base}/rules`, count: rulesChanged },
  ];
  return (
    <div className="phead">
      <div className="muted"><Link href="/projects">← Projects</Link></div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{p.number} · {p.name}</h1>
          <div className="muted phead-sub">
            {[p.tech && `Tech: ${p.tech}`, p.address].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span className={s.cls} style={{ marginTop: 8 }}>Last sync: {s.text}</span>
          <RefreshButton project={p.number} job={p.job} />
        </div>
      </div>
      <nav className="ptabs">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={t.key === tab ? "on" : ""} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
            {t.count ? <span className={`ptab-count${t.key === "deficiencies" ? " red" : ""}`}>{t.count}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

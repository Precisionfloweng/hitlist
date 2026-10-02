import Link from "next/link";
import ProjectTabs from "./ProjectTabs";
import RefreshButton from "../../RefreshButton";
import { syncLabel } from "../../format";
import type { Project } from "@/lib/data";

export type ProjectTab = "overview" | "equipment" | "deficiencies" | "notes" | "contacts" | "rules" | "ai";

/** Title, sync status and the tabs shared by every page of a project. */
export default function ProjectHeader({ project: p, tab, missingRequired, rulesChanged, notes, user }:
  { project: Project; tab: ProjectTab; missingRequired?: number | null; rulesChanged?: number; notes?: number;
    user: { customer: boolean; canSync: boolean } }) {
  const s = syncLabel(p.daysSinceSync);
  const base = `/projects/${encodeURIComponent(p.id)}`;
  type Tab = { key: ProjectTab; label: string; href: string; count?: number | null };
  const allTabs: Tab[] = [
    { key: "overview", label: "Overview", href: base },
    { key: "equipment", label: "Equipment checklist", href: `${base}/equipment` },
    { key: "deficiencies", label: "Deficiencies", href: `${base}/deficiencies`, count: p.openDeficiencies },
    { key: "notes", label: "Notes", href: `${base}/notes`, count: notes },
    { key: "contacts", label: "Contacts", href: `${base}/contacts` },
    { key: "rules", label: "Rules / Tol.", href: `${base}/rules`, count: rulesChanged },
    { key: "ai", label: "AI Tools", href: `${base}/ai` },
  ];
  // Customers don't see the rules, the techs' notes or the contact list.
  const tabs = allTabs.filter((t) => !(user.customer && (t.key === "rules" || t.key === "notes" || t.key === "contacts"))
    && !(t.key === "ai" && !user.canSync));            // AI Tools: techs and admins only
  return (
    <div className="phead">
      <div className="muted"><Link href="/projects">← Projects</Link></div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{p.number} · {p.name}</h1>
          <div className="muted phead-sub">
            {p.tech && `Tech: ${p.tech}`}
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span className={s.cls} style={{ marginTop: 8 }}>Last sync: {s.text}</span>
          {user.canSync && <RefreshButton project={p.id} job={p.job} />}
        </div>
      </div>
      <ProjectTabs tabs={tabs} active={tab} />
    </div>
  );
}

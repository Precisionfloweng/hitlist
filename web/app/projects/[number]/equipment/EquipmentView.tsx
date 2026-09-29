"use client";
import { useEffect, useMemo, useState } from "react";
import { loadLastType, saveLastType } from "@/lib/lastType";
import type { Deficiency, TypeResult } from "@/lib/results";
import { byTypeOrder } from "@/lib/typeOrder";

type Filter = "missing" | "all";
const STATUS_WORD: Record<string, string> = { P: "filled", R: "required, missing", O: "optional, missing",
  N: "marked with a dash", "-": "doesn't apply" };

function Cell({ code, label }: { code: string; label: string }) {
  const tip = `${label}: ${STATUS_WORD[code] ?? ""}`;
  if (code === "P") return <td className="ck p" title={tip}>✓</td>;
  if (code === "R") return <td className="ck r" title={tip}><span>✕</span></td>;
  if (code === "O") return <td className="ck o" title={tip}>!</td>;
  if (code === "N") return <td className="ck mn" title={tip}>–</td>;
  return <td className="ck na" title={tip}>·</td>;
}

export default function EquipmentView({ types, initialType, syncedAt, deficiencies = [] }:
  { types: TypeResult[]; initialType?: string; syncedAt?: string; deficiencies?: Deficiency[] }) {
  // Open deficiencies per unit: its own, plus any on its sub-items (a coil's item also lights up its AHU).
  // Matched on the equipment path (segments trimmed), or the name if a unit's own path doesn't match.
  const openDefs = useMemo(() => {
    const norm = (path: string) => path.split("/").map((x) => x.trim()).filter(Boolean);
    const byPath = new Map<string, Deficiency[]>(), byName = new Map<string, Deficiency[]>();
    const add = (m: Map<string, Deficiency[]>, k: string, d: Deficiency) => m.set(k, [...(m.get(k) ?? []), d]);
    for (const d of deficiencies) {
      if (!d.open) continue;
      const segs = norm(d.path || "");
      for (let i = 1; i <= segs.length; i++) add(byPath, segs.slice(0, i).join("/"), d);
      if (d.equipment) add(byName, d.equipment, d);
    }
    return (path: string, name: string) => byPath.get(norm(path || "").join("/")) || byName.get(name) || [];
  }, [deficiencies]);
  const sorted = useMemo(() => [...types].sort(byTypeOrder), [types]);
  const [key, setKey] = useState(() => sorted.find((t) => t.key === initialType)?.key ?? sorted[0]?.key);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const t = sorted.find((x) => x.key === key) ?? sorted[0];

  // No ?type= in the link: open on the type picked last (here or on the Rules page).
  useEffect(() => {
    if (initialType) return;
    const last = loadLastType();
    if (last && sorted.some((t) => t.key === last)) setKey(last);
  }, [initialType, sorted]);

  function pick(k: string) {
    saveLastType(k);
    setKey(k);
    setQ("");
    const url = new URL(window.location.href);
    url.searchParams.set("type", k);
    window.history.replaceState(null, "", url);
  }

  const incomplete = t ? t.units.filter((u) => u.required_filled < u.required).length : 0;
  const units = useMemo(() => {
    if (!t) return [];
    const s = q.trim().toLowerCase();
    return t.units
      .filter((u) => filter === "all" || u.required_filled < u.required)
      .filter((u) => !s || u.name.toLowerCase().includes(s) || (u.area || "").toLowerCase().includes(s));
  }, [t, filter, q]);
  // Only show fields that apply to at least one of the units on screen.
  const cols = useMemo(() => {
    if (!t) return [];
    const shown = units.length ? units : t.units;
    return t.fields.map((f, i) => ({ ...f, i })).filter((f) => shown.some((u) => (u.codes[f.i] ?? "-") !== "-"));
  }, [t, units]);
  if (!t) return <div className="card">No equipment in this export.</div>;

  const missingReq = t.summary.missing_required;

  return (
    <div className="eq">
        <div className="eq-head">
          <div>
            <h2>{t.name}</h2>
            <div className="muted">
              {t.summary.units_complete} of {t.summary.units} units complete · {missingReq} required field{missingReq === 1 ? "" : "s"} missing
              {syncedAt && <> · synced {new Date(syncedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</>}
            </div>
          </div>
        </div>

      <nav className="eq-types" aria-label="Equipment types">
        <select className="eq-select" value={t.key} onChange={(e) => pick(e.target.value)}>
          {sorted.map((x) => <option key={x.key} value={x.key}>{x.name} ({Math.round(x.summary.fields_pct)}%)</option>)}
        </select>
        <ul>
          {sorted.map((x) => {
            const open = x.units.filter((u) => u.required_filled < u.required).length;
            return (
              <li key={x.key}>
                <button className={x.key === t.key ? "on" : ""} onClick={() => pick(x.key)}>
                  <span className="eq-name">{x.name}</span>
                  <span className="eq-pct">{Math.round(x.summary.fields_pct)}%</span>
                  <span className="bar"><span style={{ width: `${x.summary.fields_pct}%` }} /></span>
                  <span className="eq-sub">{open ? `${open} of ${x.units.length} need data` : `All ${x.units.length} complete`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="eq-main">
        <div className="eq-tools">
          <input type="search" placeholder="Find a unit or area" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg" role="group">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All units ({t.units.length})</button>
            <button className={filter === "missing" ? "on" : ""} onClick={() => setFilter("missing")}>Needs data ({incomplete})</button>
          </div>
          <div className="legend" title="Optional fields have grey headings. Hover or tap and hold a mark to see the field name.">
            <span><span className="ck-key p">✓</span>Filled</span>
            <span><span className="ck-key r"><span>✕</span></span>Required missing</span>
            <span><span className="ck-key o">!</span>Optional missing</span>
            <span><span className="ck-key mn">–</span>Marked with a dash</span>
            <span><span className="ck-key na">·</span>Doesn&apos;t apply</span>
            <a className="help-q" href="/help#checklist" title="What do the marks mean?">?</a>
          </div>
        </div>

        <div className="eq-scroll">
          <table className="eq-grid">
            <thead>
              <tr>
                <th className="u">Unit</th>
                <th className="d">Done <a className="help-q" href="/help#done" title="What does Done mean?">?</a></th>
                {cols.map((c, n) => (
                  <th key={c.i} className={`f ${c.status === "optional" ? "opt" : ""}`} title={`${c.label} (${c.status})`}
                    style={{ zIndex: 2 + cols.length - n }}>
                    <span>{c.label}</span>
                  </th>
                ))}
                <th className="pad" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const defs = openDefs(u.path, u.name);
                const done = u.required ? u.required_filled / u.required : 1;
                return (
                  <tr key={u.path || u.name} className={defs.length ? "has-def" : undefined}>
                    <td className="u">
                      <div className="u-name" title={u.path || u.name}>{u.name}</div>
                      {/* The badge leads the second line so a long unit name can't push it out of view */}
                      {(defs.length > 0 || u.area) && (
                        <div className="u-area">
                          {defs.length > 0 && (
                            <span className="def-badge" title={defs.map((d) => `#${d.number} ${d.priority}${d.equipment && d.equipment !== u.name ? ` (${d.equipment})` : ""}: ${d.text}`).join("\n")}>
                              {defs.length} open
                            </span>
                          )}
                          {u.area}
                        </div>
                      )}
                    </td>
                    <td className="d">
                      <div className="d-num">{u.required_filled}/{u.required}</div>
                      <div className={`d-bar ${done >= 1 ? "full" : ""}`}><span style={{ width: `${done * 100}%` }} /></div>
                    </td>
                    {cols.map((c) => <Cell key={c.i} code={u.codes[c.i] ?? "-"} label={c.label} />)}
                    <td className="pad" />
                  </tr>
                );
              })}
              {units.length === 0 && (
                <tr><td colSpan={cols.length + 3} className="eq-empty">
                  {q ? "No units match your search." : "Every unit has all its required data. ✓"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

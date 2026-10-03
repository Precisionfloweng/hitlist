"use client";
import { useEffect, useMemo, useState } from "react";
import { categoriesFor, fmtTol, hasTol, TOLERANCE_CATS, type Tolerances } from "@/lib/toleranceCats";
import { loadLastType, saveLastType } from "@/lib/lastType";
import type { Deficiency, Note, TypeResult } from "@/lib/results";
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

export default function EquipmentView({ types, initialType, syncedAt, deficiencies = [], notes = [], tolerances = {} }:
  { types: TypeResult[]; initialType?: string; syncedAt?: string; deficiencies?: Deficiency[]; notes?: Note[];
    tolerances?: Tolerances }) {
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
  const unitNotes = useMemo(() => {
    const norm = (path: string) => path.split("/").map((x) => x.trim()).filter(Boolean);
    const byPath = new Map<string, Note[]>(), byName = new Map<string, Note[]>();
    const add = (m: Map<string, Note[]>, k: string, n: Note) => m.set(k, [...(m.get(k) ?? []), n]);
    for (const n of notes) {
      const segs = norm(n.path || "");
      if (!segs.length) continue;                       // general project notes live on the Notes tab
      for (let i = 1; i <= segs.length; i++) add(byPath, segs.slice(0, i).join("/"), n);
      if (n.equipment) add(byName, n.equipment, n);
    }
    return (path: string, name: string) => byPath.get(norm(path || "").join("/")) || byName.get(name) || [];
  }, [notes]);
  const sorted = useMemo(() => [...types].sort(byTypeOrder), [types]);
  const [key, setKey] = useState(() => sorted.find((t) => t.key === initialType)?.key ?? sorted[0]?.key);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  // Tapped "open" badge: its deficiencies in a small panel (iPads have no hover).
  const [pop, setPop] = useState<{ unit: string; kind: "def" | "note"; defs: Deficiency[]; notes: Note[]; x: number; y: number } | null>(null);
  const openPop = (e: React.MouseEvent<HTMLElement>, unit: string, kind: "def" | "note", defs: Deficiency[], ns: Note[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPop((p) => (p?.unit === unit && p.kind === kind ? null
      : { unit, kind, defs, notes: ns, x: Math.min(r.left, window.innerWidth - 380), y: r.bottom + 6 }));
  };
  useEffect(() => {
    if (!pop) return;
    const close = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".def-pop, .def-badge, .note-badge")) return;
      setPop(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", esc);
    };
  }, [pop]);
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
            {(() => {   // the project's tolerances for this kind of equipment (Rules / Tol. tab)
              const keys = [...new Set([...categoriesFor(t.export_sheet), ...categoriesFor(t.key)])].filter((k) => hasTol(tolerances[k]));
              return keys.length > 0 && (
                <div className="eq-tol"><b>Tolerance</b>{" "}
                  {keys.map((k) => { const c = TOLERANCE_CATS.find((x) => x.key === k)!;
                    return <span key={k} className="eq-tol-item">{keys.length > 1 || c.group === "ahu" || c.group === "terminal" ? `${c.label} ` : ""}{fmtTol(tolerances[k])}</span>; })}
                </div>
              );
            })()}
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
                <button className={`${x.key === t.key ? "on" : ""}${!open && x.units.length ? " full" : ""}`} onClick={() => pick(x.key)}>
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
                const uNotes = unitNotes(u.path, u.name);
                const done = u.required ? u.required_filled / u.required : 1;
                return (
                  <tr key={u.path || u.name} className={defs.length ? "has-def" : uNotes.length ? "has-note" : undefined}>
                    <td className="u">
                      <div className="u-name" title={u.path || u.name}>{u.name}</div>
                      {/* The badge leads the second line so a long unit name can't push it out of view */}
                      {(defs.length > 0 || uNotes.length > 0 || u.area) && (
                        <div className="u-area">
                          {defs.length > 0 && (
                            <button type="button" className="def-badge" title="Show the open deficiencies"
                              onClick={(e) => openPop(e, u.name, "def", defs, [])}>
                              {defs.length} open
                            </button>
                          )}
                          {uNotes.length > 0 && (
                            <button type="button" className="note-badge" title="Show the notes"
                              onClick={(e) => openPop(e, u.name, "note", [], uNotes)}>
                              {uNotes.length} note{uNotes.length === 1 ? "" : "s"}
                            </button>
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

      {pop && (
        <div className={`def-pop${pop.kind === "note" ? " note-pop" : ""}`} role="dialog"
          aria-label={`${pop.kind === "note" ? "Notes" : "Open deficiencies"} for ${pop.unit}`}
          style={{ left: Math.max(8, pop.x), top: Math.min(pop.y, window.innerHeight - 220) }}>
          <div className="def-pop-head">
            <b>{pop.unit}</b>
            <button type="button" aria-label="Close" onClick={() => setPop(null)}>✕</button>
          </div>
          {pop.kind === "note" ? (
            <ul>
              {pop.notes.map((n, i) => (
                <li key={`n-${i}`}>
                  {n.equipment && n.equipment !== pop.unit && <div className="def-pop-meta">{n.equipment}</div>}
                  <div>{n.text}</div>
                  {(n.reading || n.comments) && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {[n.reading && `${n.reading}${n.units ? ` ${n.units}` : ""}`, n.comments].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
          <ul>
            {pop.defs.map((d, i) => (
              <li key={`${d.number}-${i}`}>
                <div className="def-pop-meta">
                  #{d.number}{d.priority && <> · {d.priority}</>}
                  {d.equipment && d.equipment !== pop.unit && <> · {d.equipment}</>}
                  {d.contact && <> · {d.contact}</>}
                </div>
                <div>{d.text || "(no description)"}</div>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}
    </div>
  );
}

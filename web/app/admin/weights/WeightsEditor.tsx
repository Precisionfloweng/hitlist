"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, DEFAULT_WORK, categoryOf, jobProgress, typeTotals, workOf, workText, type Progress, type Work, type WorkUnit } from "@/lib/completion";
import { applyWeights } from "@/lib/weights";
import { unweighted, weightItems, type FieldWeight, type WeightItem } from "@/lib/weightItems";
import type { TypeResult } from "@/lib/results";
import { byTypeOrder } from "@/lib/typeOrder";

export type EditorType = { key: string; name: string; fields: (FieldWeight & { status: string })[] };
type Draft = Record<string, Record<number, { weight: string; group: string }>>;   // typeKey → order → new values
type Preview = { types: TypeResult[]; fields_pct: number };
type JobRow = { units: number; work: number; total: number; pct: number };

// headings in the app's usual equipment order (air handlers first … grilles last)
const CAT_ORDER = ["air_handlers", "fans", "unitary", "face_velocity", "terminal", "hydronic", "other", "outlets"];
const at = (k: string) => { const i = CAT_ORDER.indexOf(k); return i < 0 ? CAT_ORDER.length : i; };
const ORDERED = [...CATEGORIES].sort((a, b) => at(a.key) - at(b.key));
const COLS = 4;

const num = (s: string) => (s.trim() === "" ? null : Number(s) || null);

/**
 * Admin → Completion weights. Each equipment type has one number: how much work one unit is (points or minutes;
 * the unit is only a label). A job's % = work done ÷ total work over its own equipment, so nothing is set per project.
 * Open a type for its item weights (how much of one unit each item is), one row each: single fields or combined
 * items (e.g. "Unit Data"), which can be added, combined, split off or removed. One Save stores everything and
 * recalculates every project. Hours left shows on the project preview here (admins only).
 */
export default function WeightsEditor({ initial, projects, types }:
  { initial: Work; projects: { id: string; label: string }[]; types: EditorType[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState<Work>(initial);
  const [unit, setUnit] = useState<WorkUnit>(initial.unit);
  const [workBoxes, setWorkBoxes] = useState<Record<string, string>>({});   // typeKey → typed value (draft)
  const [draft, setDraft] = useState<Draft>({});
  const [keep, setKeep] = useState<Record<string, Set<number>>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [project, setProject] = useState(projects[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!project) return;
    setPreview(null);
    fetch(`/api/admin/weights?project=${encodeURIComponent(project)}`).then((r) => r.json())
      .then((d) => setPreview({ types: d.types ?? [], fields_pct: d.fields_pct ?? 100 })).catch(() => setPreview({ types: [], fields_pct: 100 }));
  }, [project]);

  // each type's fields with the draft applied
  const current = useMemo(() => types.map((t) => ({ ...t, fields: t.fields.map((f) => {
    const d = draft[t.key]?.[f.order];
    return d ? { ...f, weight: num(d.weight), group: d.group } : f;
  }) })), [types, draft]);
  const byKey = new Map(current.map((t) => [t.key, t]));
  const savedOrder = useMemo(() => new Map(types.map((t) => [t.key, weightItems(t.fields).map((i) => i.key)])), [types]);

  // work per unit: saved values with what's typed on top (blank box = the default 1)
  const workBox = (k: string) => workBoxes[k] ?? (saved.perType[k] !== undefined ? String(saved.perType[k]) : "");
  const workChanges = Object.fromEntries(Object.entries(workBoxes).filter(([k, v]) =>
    (v.trim() === "" ? undefined : Number(v)) !== saved.perType[k]));
  const workValid = Object.values(workBoxes).every((v) => v.trim() === "" || (isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1000));
  const draftWork: Work = { unit, perType: { ...saved.perType, ...Object.fromEntries(Object.entries(workBoxes)
    .filter(([, v]) => v.trim() !== "" && isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) } };
  for (const [k, v] of Object.entries(workBoxes)) if (v.trim() === "") delete draftWork.perType[k];
  const unitDirty = unit !== saved.unit;

  const changes = useMemo(() => {
    const out: Record<string, { order: number; weight: string; group: string }[]> = {};
    for (const t of types) {
      const list = t.fields.filter((f) => { const d = draft[t.key]?.[f.order];
        return d && (num(d.weight) !== (f.weight || null) || d.group.trim() !== f.group.trim()); })
        .map((f) => ({ order: f.order, ...draft[t.key][f.order] }));
      if (list.length) out[t.key] = list;
    }
    return out;
  }, [types, draft]);
  const dirty = unitDirty || Object.keys(workChanges).length > 0 || Object.keys(changes).length > 0;

  // ---- item-weight editing helpers
  const setFields = (typeKey: string, orders: number[], v: (cur: { weight: string; group: string }) => { weight: string; group: string }) => {
    const t = byKey.get(typeKey)!;
    const next = { ...(draft[typeKey] ?? {}) };
    for (const o of orders) {
      const f = t.fields.find((x) => x.order === o)!;
      next[o] = v({ weight: f.weight ? String(f.weight) : "", group: f.group });
    }
    setDraft({ ...draft, [typeKey]: next });
  };
  const keepAdd = (typeKey: string, orders: number[]) => setKeep({ ...keep, [typeKey]: new Set([...(keep[typeKey] ?? []), ...orders]) });
  const keepDrop = (typeKey: string, orders: number[]) => setKeep({ ...keep, [typeKey]: new Set([...(keep[typeKey] ?? [])].filter((o) => !orders.includes(o))) });
  const toggle = (k: string) => { const s = new Set(open); if (s.has(k)) s.delete(k); else s.add(k); setOpen(s); };

  // item boxes show what was typed (even blank) rather than the number, so typing isn't fought
  const [typed, setTyped] = useState<Record<string, string>>({});
  const itemBox = (typeKey: string, it: WeightItem) => typed[`${typeKey}|${it.key}`] ?? (it.weight ? String(it.weight) : "");
  const setItemWeight = (typeKey: string, it: WeightItem, value: string) => {
    const v = value.replace(/[^\d.]/g, "");
    setTyped({ ...typed, [`${typeKey}|${it.key}`]: v });
    if (!it.group) keepAdd(typeKey, [it.members[0].order]);
    setFields(typeKey, it.members.map((m) => m.order), (cur) => ({ ...cur, weight: v }));
  };
  const removeItem = (typeKey: string, it: WeightItem) => {
    keepDrop(typeKey, it.members.map((m) => m.order));
    setFields(typeKey, it.members.map((m) => m.order), () => ({ weight: "", group: "" }));
  };
  const removeMember = (typeKey: string, order: number) => setFields(typeKey, [order], () => ({ weight: "", group: "" }));

  function itemsOf(t: EditorType): WeightItem[] {
    const items = weightItems(t.fields, keep[t.key]);
    const order = savedOrder.get(t.key) ?? [];
    const pos = (k: string) => { const i = order.indexOf(k); return i < 0 ? 1e6 : i; };
    return [...items].sort((a, b) => pos(a.key) - pos(b.key));   // keep rows still while typing; new ones at the end
  }

  // ---- preview: the job's progress with the saved weights and with what's on screen
  const calc = (ts: { key: string; fields: FieldWeight[] }[], work: Work): Progress | null => {
    if (!preview || !preview.types.length) return null;
    const rules = ts.map((t) => ({ key: t.key, fields: t.fields.map((f) => ({ field: f.field, weight: f.weight, group: f.group })) }));
    const r = applyWeights({ types: preview.types }, rules);
    return jobProgress(typeTotals(r.types), work, preview.fields_pct);
  };
  const before = useMemo(() => calc(types, saved), [preview, types, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (workValid ? calc(current, draftWork) : null), [preview, current, workBoxes, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = after ?? before;
  const label = unit === "minutes" ? "min" : "pts";

  async function save() {
    setBusy(true); setMsg(null);
    const work = unitDirty || Object.keys(workChanges).length ? { unit, perType: workChanges } : undefined;
    const r = await fetch("/api/admin/weights", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ work, types: changes }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    if (data.work) { setSaved(data.work); setUnit(data.work.unit); }
    setWorkBoxes({}); setDraft({}); setKeep({}); setTyped({});
    setMsg({ text: `Saved · ${data.updated} project${data.updated === 1 ? "" : "s"} recalculated`, ok: true });
    router.refresh();
  }
  const discard = () => { setUnit(saved.unit); setWorkBoxes({}); setDraft({}); setKeep({}); setTyped({}); setMsg(null); };

  return (
    <div className="card tol-card cw">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div className="card-head" style={{ marginBottom: 0, maxWidth: 640 }}>
          <b>How much work is one of each?</b>
          <span className="muted" style={{ fontSize: 13 }}>Set once for every project. Hitlist counts each job&apos;s equipment from
            BuildingStart and adds up the work: the job&apos;s % complete = work done ÷ total work. Sub-items (coils, sensors…) are just
            equipment with their own number. A type left blank counts {DEFAULT_WORK}. Open a type (▸) for its <b>item weights</b>: how much of
            one unit each item is. Admins only; techs never see the times.</span>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="muted">Count work in</span>
          <div className="tabs seg" style={{ margin: 0 }}>
            {(["points", "minutes"] as const).map((u) => <button key={u} type="button" className={unit === u ? "on" : ""} onClick={() => setUnit(u)}>{u === "points" ? "Points" : "Minutes"}</button>)}
          </div>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="row cw-preview">
          <span className="muted">Preview with</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {shown && <span className="cw-big">{shown.pct}% complete</span>}
          {shown && <span>· about <b>{workText(shown.left, unit)}</b> of {workText(shown.total, unit)} left</span>}
          {before && after && dirty && after.pct !== before.pct && <span className="muted">(now {before.pct}%)</span>}
          {preview && !preview.types.length && <span className="muted">No sync results for this project yet.</span>}
        </div>
      )}

      <table className="weights-table cw-table">
        <thead><tr><th>Equipment</th><th className="w">One is worth</th><th className="w">On this job</th><th>Done</th></tr></thead>
        <tbody>
          {ORDERED.map((c) => {
            const catTypes = current.filter((t) => categoryOf(t.key) === c.key).sort(byTypeOrder);
            if (!catTypes.length) return null;
            return (
              <Fragment key={c.key}>
                <tr className="cw-head"><td colSpan={COLS}>{c.label}</td></tr>
                {catTypes.map((t) => <TypeRows key={t.key} t={t} items={itemsOf(t)} isOpen={open.has(`t:${t.key}`)}
                  onToggle={() => toggle(`t:${t.key}`)} itemBox={(it) => itemBox(t.key, it)} onWeight={(it, v) => setItemWeight(t.key, it, v)}
                  onRemove={(it) => removeItem(t.key, it)} onRemoveMember={(o) => removeMember(t.key, o)}
                  work={workBox(t.key)} workNow={workOf(draftWork, t.key)} label={label} unit={unit} hasPreview={!!shown}
                  onWork={(v) => setWorkBoxes({ ...workBoxes, [t.key]: v.replace(/[^\d.]/g, "") })}
                  job={shown?.byType.get(t.key)}
                  onAdd={(orders, group, weight) => {
                    if (!group) keepAdd(t.key, orders);
                    setFields(t.key, orders, () => ({ weight, group }));
                    if (!open.has(`t:${t.key}`)) toggle(`t:${t.key}`);
                  }} />)}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy || !workValid || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "No changes"}</button>
        {dirty && <button disabled={busy} onClick={discard}>Discard</button>}
        {!workValid && <span className="error">Enter a number from 0 to 1000.</span>}
        {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** One equipment type: its row, and when open, one row per weighted item plus the add buttons. */
function TypeRows({ t, items, isOpen, onToggle, itemBox, onWeight, onRemove, onRemoveMember, onAdd, work, workNow, label, unit, onWork, job, hasPreview }: {
  t: EditorType; items: WeightItem[]; isOpen: boolean; onToggle: () => void;
  itemBox: (it: WeightItem) => string; onWeight: (it: WeightItem, v: string) => void; onRemove: (it: WeightItem) => void;
  onRemoveMember: (order: number) => void; onAdd: (orders: number[], group: string, weight: string) => void;
  work: string; workNow: number; label: string; unit: WorkUnit; onWork: (v: string) => void; job?: JobRow; hasPreview: boolean;
}) {
  const cols = COLS;
  const [adding, setAdding] = useState("");   // "" | "item" | "group" | "into:<combined item>"
  const [showMembers, setShowMembers] = useState<string>("");
  const total = Math.round(10 * items.reduce((n, it) => n + (Number(itemBox(it)) || 0), 0)) / 10;
  const groups = items.filter((i) => i.group);
  return (
    <>
      <tr className="cw-type-row">
        <td className="cw-type"><button type="button" className="cw-arrow" aria-expanded={isOpen} onClick={onToggle}>{isOpen ? "▾" : "▸"} <b>{t.name}</b></button>
          {items.length ? <span className="cw-tag cw-tag-on">{items.length} item weight{items.length === 1 ? "" : "s"}</span>
            : <span className="cw-tag">No item weights yet</span>}</td>
        <td className="w"><span className="tol-input"><input inputMode="decimal" aria-label={`Work for one ${t.name}`} value={work}
          placeholder={String(DEFAULT_WORK)} onChange={(e) => onWork(e.target.value)} /> {label}</span></td>
        <td className="w muted">{!hasPreview ? "" : job ? `${job.units} × ${workNow} ${label} = ${workText(job.units * workNow, unit)}` : "none on this job"}</td>
        <td>{job && <span className="cw-done"><span className="bar"><span style={{ width: `${Math.min(100, job.pct)}%` }} /></span>{Math.round(job.pct)}%</span>}</td>
      </tr>
      {isOpen && <>
        {!items.length && <tr><td colSpan={cols} className="muted cw-item">Every required field counts the same. Add an item to start weighting {t.name}.</td></tr>}
        {items.map((it) => (
          <tr key={it.key} className="cw-item-row">
            <td className="cw-item">
              {it.group ? <><b>{it.name}</b>
                <div className="muted cw-members">{it.members.length} field{it.members.length === 1 ? "" : "s"} counted together{showMembers === it.key ? ":" : `: ${it.members.slice(0, 6).map((m) => m.field).join(", ")}${it.members.length > 6 ? "…" : ""}`}
                  {" "}<button type="button" className="cw-toggle" aria-expanded={showMembers === it.key} onClick={() => setShowMembers(showMembers === it.key ? "" : it.key)}>{showMembers === it.key ? "▴ Close" : "▾ Edit fields"}</button>
                  {showMembers === it.key && <div className="cw-chips">{it.members.map((m) => (
                    <span key={m.order} className="cw-chip">{m.field}<button type="button" aria-label={`Take ${m.field} out of ${it.name}`} onClick={() => onRemoveMember(m.order)}>×</button></span>))}
                    <button type="button" className="linkish" onClick={() => setAdding(`into:${it.name}`)}>+ Add a field to {it.name}</button>
                    <button type="button" className="cw-toggle" onClick={() => setShowMembers("")}>▴ Close</button></div>}
                </div></> : it.name}
            </td>
            <td className="w"><span className="tol-input"><input inputMode="decimal" aria-label={`${it.name} weight`} value={itemBox(it)} placeholder="0"
              onChange={(e) => onWeight(it, e.target.value)} />%</span>
              <button type="button" className="cw-x" title={`Remove ${it.name}${it.group ? " (its fields go back to the Add list)" : ""}`} aria-label={`Remove ${it.name}`} onClick={() => onRemove(it)}>×</button></td>
            <td colSpan={2} />
          </tr>
        ))}
        {items.length > 0 && <tr className="cw-item-row"><td className="cw-item"><b>{t.name} total</b></td>
          <td className="w"><b>{total}%</b>{total !== 100 && total > 0 && <span className="muted" style={{ fontSize: 12 }}> · scaled to 100%</span>}</td><td colSpan={2} /></tr>}
        <tr><td colSpan={cols} className="cw-item">
          {adding ? <AddPanel key={adding} t={t} mode={adding === "group" ? "group" : "item"} startInto={adding.startsWith("into:") ? adding.slice(5) : ""} groups={groups} onCancel={() => setAdding("")}
            onAdd={(orders, group, weight) => { onAdd(orders, group, weight); setAdding(""); }} />
            : <span className="row" style={{ gap: 14 }}>
              <button type="button" className="linkish" onClick={() => setAdding("item")}>+ Add an item</button>
              <button type="button" className="linkish" onClick={() => setAdding("group")}>+ New combined item</button></span>}
        </td></tr>
      </>}
    </>
  );
}

/** Pick fields: "item" adds one field on its own or into an existing combined item; "group" makes a new combined item. */
function AddPanel({ t, mode, startInto, groups, onAdd, onCancel }: { t: EditorType; mode: "item" | "group"; startInto: string; groups: WeightItem[];
  onAdd: (orders: number[], group: string, weight: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [into, setInto] = useState(startInto);   // "" = its own item, else a combined item's name
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  // a new combined item can also take fields that are weighted on their own now (they move into it)
  const choices = (mode === "group" ? t.fields.filter((f) => !f.group.trim()) : unweighted(t.fields))
    .filter((f) => !q || f.field.toLowerCase().includes(q.toLowerCase()));
  const one = (o: number) => setPick(mode === "item" ? new Set([o]) : new Set(pick.has(o) ? [...pick].filter((x) => x !== o) : [...pick, o]));
  const grp = groups.find((g) => g.name === into);
  const ok = pick.size > 0 && (mode === "item" ? (into ? true : Number(weight) > 0) : name.trim() !== "" && Number(weight) > 0 && !groups.some((g) => g.name.toLowerCase() === name.trim().toLowerCase()));
  return (
    <div className="cw-add">
      <b>{mode === "item" ? `Add an item to ${t.name}` : `New combined item for ${t.name}`}</b>
      <div className="row" style={{ flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
        {mode === "group" && <input placeholder="Name, e.g. Unit Statics" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}
        {mode === "item" && groups.length > 0 && <select value={into} onChange={(e) => setInto(e.target.value)} aria-label="Add as">
          <option value="">On its own</option>
          {groups.map((g) => <option key={g.key} value={g.name}>Into {g.name}</option>)}
        </select>}
        {!(mode === "item" && into) && <span className="tol-input"><input inputMode="decimal" placeholder="0" aria-label="Weight" value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} />%</span>}
        <input type="search" placeholder="Find a field" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cw-pick">
        {choices.length === 0 && <span className="muted">No fields left to add.</span>}
        {choices.map((f) => (
          <label key={f.order}><input type={mode === "item" ? "radio" : "checkbox"} name={`pick-${t.key}`} checked={pick.has(f.order)} onChange={() => one(f.order)} />
            {f.field}{f.weight ? <span className="muted"> · {f.weight}% now</span> : null}{f.status === "ignore" && <span className="muted"> · ignored (won&apos;t count)</span>}</label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button className="primary" disabled={!ok} onClick={() => onAdd([...pick], mode === "group" ? name.trim() : into,
          mode === "item" && grp ? String(grp.weight ?? "") : weight)}>
          {mode === "group" ? `Create with ${pick.size} field${pick.size === 1 ? "" : "s"}` : "Add"}</button>
        <button onClick={onCancel}>Cancel</button>
        <span className="muted" style={{ fontSize: 12 }}>Not saved until you press Save changes.</span>
      </div>
    </div>
  );
}

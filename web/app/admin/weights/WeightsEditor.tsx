"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, categoryOf, categoryPcts, completePct, typeTotals, type Weights } from "@/lib/completion";
import { applyWeights, typePct } from "@/lib/weights";
import { unweighted, weightItems, type FieldWeight, type WeightItem } from "@/lib/weightItems";
import type { TypeResult } from "@/lib/results";
import { byTypeOrder } from "@/lib/typeOrder";

export type EditorType = { key: string; name: string; fields: (FieldWeight & { status: string })[] };
type Draft = Record<string, Record<number, { weight: string; group: string }>>;   // typeKey → order → new values
type Preview = { types: TypeResult[]; fields_pct: number };

// categories in the app's usual equipment order (air handlers first … grilles last)
const CAT_ORDER = ["air_handlers", "fans", "unitary", "face_velocity", "terminal", "hydronic", "other", "outlets"];
const at = (k: string) => { const i = CAT_ORDER.indexOf(k); return i < 0 ? CAT_ORDER.length : i; };
const ORDERED = [...CATEGORIES].sort((a, b) => at(a.key) - at(b.key));

const num = (s: string) => (s.trim() === "" ? null : Number(s) || null);

/**
 * Admin → Completion weights: one page for how a job's % complete is built.
 * Level 1: each category's share of the job (must total 100). Level 2 (open a category): its equipment types.
 * Level 3 (open a type): that type's item weights, one row each — single fields or combined items (e.g. "Unit Data").
 * Items can be added, combined, split off or removed; one Save stores everything and recalculates every project.
 */
export default function WeightsEditor({ initial, projects, types }:
  { initial: Weights; projects: { id: string; label: string }[]; types: EditorType[] }) {
  const router = useRouter();
  const str = (w: Weights) => Object.fromEntries(CATEGORIES.map((c) => [c.key, String(w[c.key] ?? c.default)]));
  const [saved, setSaved] = useState<Weights>(initial);
  const [boxes, setBoxes] = useState<Record<string, string>>(str(initial));
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

  const nums: Weights = Object.fromEntries(CATEGORIES.map((c) => [c.key, Number(boxes[c.key]) || 0]));
  const total = Math.round(10 * Object.values(nums).reduce((a, b) => a + b, 0)) / 10;
  const sharesDirty = CATEGORIES.some((c) => Number(boxes[c.key]) !== saved[c.key] || boxes[c.key].trim() === "");
  const sharesValid = CATEGORIES.every((c) => boxes[c.key].trim() !== "" && Number(boxes[c.key]) >= 0 && Number(boxes[c.key]) <= 100) && total === 100;
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
  const typesDirty = Object.keys(changes).length > 0;
  const dirty = sharesDirty || typesDirty;

  // ---- editing helpers
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

  // ---- preview: the job % with the saved weights and with what's on screen
  const calc = (ts: { key: string; fields: FieldWeight[] }[], shares: Weights) => {
    if (!preview || !preview.types.length) return null;
    const rules = ts.map((t) => ({ key: t.key, fields: t.fields.map((f) => ({ field: f.field, weight: f.weight, group: f.group })) }));
    const r = applyWeights({ types: preview.types }, rules);
    const totals = typeTotals(r.types);
    return { job: completePct(totals, shares, preview.fields_pct), cats: categoryPcts(totals),
      types: new Map(r.types.map((t) => [t.key, typePct(t)])) };
  };
  const before = useMemo(() => calc(types, saved), [preview, types, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (sharesValid ? calc(current, nums) : null), [preview, current, boxes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/weights", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ weights: sharesDirty ? boxes : undefined, types: changes }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    if (data.weights) { setSaved(data.weights); setBoxes(str(data.weights)); }
    setDraft({}); setKeep({}); setTyped({});
    setMsg({ text: `Saved · ${data.updated} project${data.updated === 1 ? "" : "s"} recalculated`, ok: true });
    router.refresh();
  }

  const fmt = (n: number | undefined) => (n === undefined ? "" : `${Math.round(n)}%`);
  const cols = preview && preview.types.length ? 3 : 2;

  return (
    <div className="card tol-card cw">
      <div className="card-head">
        <b>Completion weights</b>
        <span className="muted" style={{ fontSize: 13 }}>How a project&apos;s % complete is built. Each category&apos;s <b>share of the job</b> (must
          total 100%); open a category for its equipment, and open one of those for its <b>item weights</b>: how much of one unit each
          item is. A unit&apos;s % = the weights of what&apos;s filled in, scaled to 100%; items a unit doesn&apos;t have are left out. Equipment
          with no item weights counts its required fields equally. Admins only.</span>
      </div>

      {projects.length > 0 && (
        <div className="row cw-preview">
          <span className="muted">Preview with</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {before && <span>Overall complete: <b>{before.job}%</b> now{dirty && <> → <b>{after ? `${after.job}%` : "–"}</b> with these changes</>}</span>}
          {preview && !preview.types.length && <span className="muted">No sync results for this project yet.</span>}
        </div>
      )}

      <table className="weights-table cw-table">
        <thead><tr><th>Category · equipment · item</th><th className="w">Weight</th>{cols === 3 && <th className="w">This job</th>}</tr></thead>
        <tbody>
          {ORDERED.map((c) => {
            const catTypes = current.filter((t) => categoryOf(t.key) === c.key).sort(byTypeOrder);
            const isOpen = open.has(c.key);
            return (
              <Fragment key={c.key}>
                <tr className="cw-cat">
                  <td><button type="button" className="cw-arrow" aria-expanded={isOpen} onClick={() => toggle(c.key)}>{isOpen ? "▾" : "▸"} <b>{c.label}</b></button>
                    <span className="muted cw-sub">{c.includes}</span></td>
                  <td className="w"><span className="tol-input"><input inputMode="decimal" aria-label={`${c.label} share of the job`} value={boxes[c.key]}
                    onChange={(e) => setBoxes({ ...boxes, [c.key]: e.target.value.replace(/[^\d.]/g, "") })} />%</span></td>
                  {cols === 3 && <td className="w muted">{after?.cats[c.key] !== undefined ? `${fmt(after.cats[c.key])} done` : before?.cats[c.key] !== undefined ? `${fmt(before.cats[c.key])} done` : "not on this job"}</td>}
                </tr>
                {isOpen && catTypes.map((t) => <TypeRows key={t.key} t={t} cols={cols} items={itemsOf(t)} isOpen={open.has(`t:${t.key}`)}
                  onToggle={() => toggle(`t:${t.key}`)} itemBox={(it) => itemBox(t.key, it)} onWeight={(it, v) => setItemWeight(t.key, it, v)}
                  onRemove={(it) => removeItem(t.key, it)} onRemoveMember={(o) => removeMember(t.key, o)}
                  jobPct={after?.types.get(t.key) ?? before?.types.get(t.key)}
                  onAdd={(orders, group, weight) => {
                    if (!group) keepAdd(t.key, orders);
                    setFields(t.key, orders, () => ({ weight, group }));
                    if (!open.has(`t:${t.key}`)) toggle(`t:${t.key}`);
                  }} />)}
                {isOpen && !catTypes.length && <tr><td colSpan={cols} className="muted cw-type">No equipment types in this category.</td></tr>}
              </Fragment>
            );
          })}
          <tr className="weights-total"><td><b>Job total</b></td><td className="w"><b className={total === 100 ? "ok-text" : "error"}>{total}%</b></td>{cols === 3 && <td />}</tr>
          {total !== 100 && <tr><td colSpan={cols} className="error">The shares must add up to 100%.</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy || !sharesValid || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "No changes"}</button>
        {dirty && <button disabled={busy} onClick={() => { setBoxes(str(saved)); setDraft({}); setKeep({}); setTyped({}); setMsg(null); }}>Discard</button>}
        {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** One equipment type: its row, and when open, one row per weighted item plus the add buttons. */
function TypeRows({ t, cols, items, isOpen, onToggle, itemBox, onWeight, onRemove, onRemoveMember, onAdd, jobPct }: {
  t: EditorType; cols: number; items: WeightItem[]; isOpen: boolean; onToggle: () => void;
  itemBox: (it: WeightItem) => string; onWeight: (it: WeightItem, v: string) => void; onRemove: (it: WeightItem) => void;
  onRemoveMember: (order: number) => void; onAdd: (orders: number[], group: string, weight: string) => void; jobPct?: number;
}) {
  const [adding, setAdding] = useState("");   // "" | "item" | "group" | "into:<combined item>"
  const [showMembers, setShowMembers] = useState<string>("");
  const total = Math.round(10 * items.reduce((n, it) => n + (Number(itemBox(it)) || 0), 0)) / 10;
  const groups = items.filter((i) => i.group);
  return (
    <>
      <tr className="cw-type-row">
        <td className="cw-type"><button type="button" className="cw-arrow" aria-expanded={isOpen} onClick={onToggle}>{isOpen ? "▾" : "▸"} <b>{t.name}</b></button>
          {items.length ? <span className="muted cw-sub">{items.length} item{items.length === 1 ? "" : "s"} · total {total}%</span>
            : <span className="cw-tag">No item weights yet</span>}</td>
        <td className="w" />
        {cols === 3 && <td className="w muted">{jobPct === undefined ? "" : `${Math.round(jobPct)}% done`}</td>}
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
            {cols === 3 && <td />}
          </tr>
        ))}
        {items.length > 0 && <tr className="cw-item-row"><td className="cw-item"><b>{t.name} total</b></td>
          <td className="w"><b>{total}%</b>{total !== 100 && total > 0 && <span className="muted" style={{ fontSize: 12 }}> · scaled to 100%</span>}</td>{cols === 3 && <td />}</tr>}
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

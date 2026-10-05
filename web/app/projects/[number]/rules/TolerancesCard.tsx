"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TOLERANCE_GROUPS, type Tol, type ToleranceGroupKey, type Tolerances } from "@/lib/toleranceCats";

type Box = { plus: string; minus: string; linked: boolean };   // linked: − follows + until it's typed in
const toBoxes = (t: Tolerances): Record<string, Box> => Object.fromEntries(Object.entries(t).map(([k, v]) =>
  [k, { plus: v.plus, minus: v.minus, linked: v.plus === v.minus }]));
const same = (a?: Box, b?: Tol) => (a?.plus ?? "") === (b?.plus ?? "") && (a?.minus ?? "") === (b?.minus ?? "");

/** The project's tolerances from the spec: + and − percent per category. Blank = the company default
 *  (Admin → Settings), shown greyed in the box. */
export default function TolerancesCard({ project, initial, canEdit, present, def }:
  { project: string; initial: Tolerances; canEdit: boolean; present: ToleranceGroupKey[] | null; def: Tol }) {
  // Only the groups for equipment this project has (plus any group that already has a value, so it can be cleared).
  const groups = TOLERANCE_GROUPS.filter((g) => !present || present.includes(g.key) || g.items.some((i) => initial[i.key]));
  const router = useRouter();
  const [saved, setSaved] = useState<Tolerances>(initial);
  const [boxes, setBoxes] = useState<Record<string, Box>>(toBoxes(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const keys = groups.flatMap((g) => g.items.map((i) => i.key));
  const dirty = keys.some((k) => !same(boxes[k], saved[k]));

  const clean = (v: string) => v.replace(/[^\d.]/g, "");
  function setPlus(k: string, v: string) {
    const b = boxes[k] ?? { plus: "", minus: "", linked: true };
    setBoxes({ ...boxes, [k]: { ...b, plus: clean(v), minus: b.linked ? clean(v) : b.minus } });
  }
  function setMinus(k: string, v: string) {
    const b = boxes[k] ?? { plus: "", minus: "", linked: true };
    setBoxes({ ...boxes, [k]: { ...b, minus: clean(v), linked: false } });
  }

  async function save() {
    setBusy(true); setMsg(null);
    const values = Object.fromEntries(keys.map((k) => [k, { plus: boxes[k]?.plus ?? "", minus: boxes[k]?.minus ?? "" }]));
    const r = await fetch("/api/tolerances", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, values }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setSaved(data.tolerances); setBoxes(toBoxes(data.tolerances));
    setMsg({ text: "Saved", ok: true });
    router.refresh();
  }

  if (groups.length === 0) return null;          // none of this equipment on the project
  return (
    <div className="card tol-card">
      <div className="card-head">
        <b>Tolerances</b>
        <span className="muted" style={{ fontSize: 13 }}>From the project spec, percent of design. Type in + and − fills to match; change − if it differs (e.g. +10 / −0). Blank uses the company default ({def.plus === def.minus ? `±${def.plus}` : `+${def.plus}/−${def.minus}`}%, shown grey).</span>
      </div>
      <div className="tol-groups">
        {groups.map((g) => (
          <div key={g.key} className="tol-group">
            <div className="tol-group-name">{g.label}</div>
            {g.items.map((i) => (
              <div key={i.key} className="tol-item">
                <span className="tol-label">{i.label}</span>
                <span className="tol-input">
                  +<input inputMode="decimal" aria-label={`${g.label} ${i.label} plus percent`} value={boxes[i.key]?.plus ?? ""}
                    disabled={!canEdit} placeholder={def.plus} onChange={(e) => setPlus(i.key, e.target.value)} />
                  −<input inputMode="decimal" aria-label={`${g.label} ${i.label} minus percent`} value={boxes[i.key]?.minus ?? ""}
                    disabled={!canEdit} placeholder={def.minus} onChange={(e) => setMinus(i.key, e.target.value)} />%
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save tolerances"}</button>
          {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

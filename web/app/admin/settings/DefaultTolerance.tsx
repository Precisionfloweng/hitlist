"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TOLERANCE_GROUPS, type Tol, type Tolerances } from "@/lib/toleranceCats";

type Box = { plus: string; minus: string; linked: boolean };   // linked: − follows + until it's typed in
const box = (t?: Tol): Box => ({ plus: t?.plus ?? "", minus: t?.minus ?? "", linked: (t?.plus ?? "") === (t?.minus ?? "") });
const KEYS = TOLERANCE_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const ALL = "__all";

/** Company default tolerances: one for all equipment, and any line given its own (blank = the all-equipment value). */
export default function DefaultTolerance({ initial }: { initial: { all: Tol; cats: Tolerances } }) {
  const router = useRouter();
  const start = () => ({ [ALL]: box(initial.all), ...Object.fromEntries(KEYS.map((k) => [k, box(initial.cats[k])])) });
  const [saved, setSaved] = useState<Record<string, Box>>(start);
  const [boxes, setBoxes] = useState<Record<string, Box>>(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const clean = (v: string) => v.replace(/[^\d.]/g, "");
  const dirty = [ALL, ...KEYS].some((k) => boxes[k].plus !== saved[k].plus || boxes[k].minus !== saved[k].minus);
  const all = boxes[ALL];

  function setPlus(k: string, v: string) {
    const b = boxes[k];
    setBoxes({ ...boxes, [k]: { ...b, plus: clean(v), minus: b.linked ? clean(v) : b.minus } });
  }
  function setMinus(k: string, v: string) {
    setBoxes({ ...boxes, [k]: { ...boxes[k], minus: clean(v), linked: false } });
  }

  async function save() {
    setBusy(true); setMsg(null);
    const cats = Object.fromEntries(KEYS.map((k) => [k, { plus: boxes[k].plus, minus: boxes[k].minus }]));
    const r = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: { plus: all.plus, minus: all.minus }, cats }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    const next = { [ALL]: box(data.defaults.all), ...Object.fromEntries(KEYS.map((k) => [k, box(data.defaults.cats[k])])) };
    setSaved(next); setBoxes(next);
    setMsg({ text: "Saved", ok: true });
    router.refresh();
  }

  const inputs = (k: string, label: string, ph?: Box) => (
    <span className="tol-input">
      +<input inputMode="decimal" aria-label={`${label} plus percent`} value={boxes[k].plus} placeholder={ph?.plus}
        onChange={(e) => setPlus(k, e.target.value)} />
      −<input inputMode="decimal" aria-label={`${label} minus percent`} value={boxes[k].minus} placeholder={ph?.minus}
        onChange={(e) => setMinus(k, e.target.value)} />%
    </span>
  );

  return (
    <div className="card tol-card">
      <div className="card-head">
        <b>Default tolerances</b>
        <span className="muted" style={{ fontSize: 13 }}>Used for any line a project hasn&apos;t set from its spec (shown as
          &quot;default&quot; on the project pages, and used by the tolerance checks and the AI). A project&apos;s own values on its
          Rules / Tol. tab always win. Leave a line blank to use the All equipment value (shown grey).</span>
      </div>
      <div className="tol-item" style={{ maxWidth: 420, marginBottom: 12 }}>
        <span className="tol-label"><b>All equipment</b></span>
        {inputs(ALL, "All equipment")}
      </div>
      <div className="tol-groups">
        {TOLERANCE_GROUPS.map((g) => (
          <div key={g.key} className="tol-group">
            <div className="tol-group-name">{g.label}</div>
            {g.items.map((i) => (
              <div key={i.key} className="tol-item">
                <span className="tol-label">{i.label}</span>
                {inputs(i.key, `${g.label} ${i.label}`, all)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={busy || !dirty || (!all.plus && !all.minus)} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
      </div>
    </div>
  );
}

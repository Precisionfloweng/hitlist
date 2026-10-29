"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RuleType } from "@/lib/rules";

/** Default Rules: what each field (or group of fields) is worth toward a unit's % complete. Company-wide;
 *  admins edit, everyone else sees it. Weights don't have to add up to 100: Hitlist scales them. */
export default function WeightsPanel({ t, canEdit }: { t: RuleType; canEdit: boolean }) {
  const router = useRouter();
  const items = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; weight: number | null; members: string[] }>();
    const fields: { key: string; name: string; weight: number | null; members: string[] }[] = [];
    for (const f of t.fields) {
      if (f.group) {
        const g = groups.get(f.group.toLowerCase()) ?? { key: `group:${f.group}`, name: f.group, weight: f.weight, members: [] };
        g.members.push(f.field); if (f.weight !== null) g.weight = Math.max(g.weight ?? 0, f.weight);
        groups.set(f.group.toLowerCase(), g);
      } else fields.push({ key: `field:${f.order}`, name: f.field, weight: f.weight, members: [] });
    }
    const byWeight = (a: { weight: number | null }, b: { weight: number | null }) => (b.weight ?? 0) - (a.weight ?? 0);
    // groups (e.g. Unit Data) first, then the single items by weight
    const all = [...[...groups.values()].sort(byWeight), ...fields.filter((x) => x.weight).sort(byWeight)];
    return { weighted: all, zero: fields.filter((x) => !x.weight) };
  }, [t]);
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const val = (k: string, w: number | null) => boxes[k] ?? (w ? String(w) : "");
  const all = [...items.weighted, ...items.zero];
  const total = Math.round(10 * all.reduce((n, x) => n + (Number(val(x.key, x.weight)) || 0), 0)) / 10;
  const changed = all.filter((x) => boxes[x.key] !== undefined && (Number(boxes[x.key]) || 0) !== (x.weight ?? 0));
  const set = (k: string, v: string) => setBoxes({ ...boxes, [k]: v.replace(/[^\d.]/g, "") });

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ typeKey: t.key, weights: Object.fromEntries(changed.map((x) => [x.key, boxes[x.key]])) }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setMsg({ text: `Saved · ${data.updated} project${data.updated === 1 ? "" : "s"} recalculated`, ok: true });
    setBoxes({});
    router.refresh();
  }

  const row = (x: { key: string; name: string; weight: number | null; members: string[] }) => (
    <tr key={x.key}>
      <td><b>{x.name}</b>{x.members.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{x.members.length} fields, each counting equally: {x.members.join(", ")}</div>}</td>
      <td className="w"><span className="tol-input"><input inputMode="decimal" aria-label={`${x.name} weight`} disabled={!canEdit}
        value={val(x.key, x.weight)} placeholder="0" onChange={(e) => set(x.key, e.target.value)} />%</span></td>
    </tr>
  );

  return (
    <div className="card weights-card" style={{ marginBottom: 12 }}>
      <div className="card-head">
        <b>Completion weights · {t.name}</b>
        <span className="muted" style={{ fontSize: 13 }}>How much of a unit&apos;s work each item is. A unit&apos;s % = the weights of what&apos;s
          filled in, scaled so the total is 100%. Items a unit doesn&apos;t have (ignored, no design value) are left out and the rest scaled up. In a combined item (e.g. Unit Data) a blank Optional field doesn&apos;t count against it.
          Required / Optional still decide what gets a red ✗. {items.weighted.length === 0 && <b>No weights yet: every required field counts the same.</b>}
          {!canEdit && " Only admins can change these."}</span>
      </div>
      {items.weighted.length > 0 && (
        <table className="weights-table"><thead><tr><th>Item</th><th>Weight</th></tr></thead>
          <tbody>{items.weighted.map(row)}
            <tr className="weights-total"><td><b>Total</b></td><td><b>{total}%</b>{total !== 100 && total > 0 &&
              <span className="muted" style={{ fontSize: 12 }}> · scaled to 100%</span>}</td></tr></tbody></table>
      )}
      {items.zero.length > 0 && items.weighted.length === 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted">{items.zero.length} field{items.zero.length === 1 ? "" : "s"} worth 0%{canEdit ? " (give one a weight here)" : ""}</summary>
          <table className="weights-table"><tbody>{items.zero.map(row)}</tbody></table>
        </details>
      )}
      {canEdit && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" disabled={busy || !changed.length} onClick={save}>{busy ? "Saving…" : changed.length ? `Save ${changed.length} weight${changed.length === 1 ? "" : "s"}` : "No changes"}</button>
          {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

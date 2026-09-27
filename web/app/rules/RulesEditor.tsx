"use client";
import { useEffect, useMemo, useState } from "react";
import { loadLastType, saveLastType } from "@/lib/lastType";
import { useRouter } from "next/navigation";
import type { Condition, HistoryRow, RuleType } from "@/lib/rules";

const LABEL: Record<string, string> = { required: "✖ Required", optional: "⚠ Optional", ignore: "Ignore" };

function describe(when: Condition[]): string {
  return when.map((c) => `${c.column || c.label} ${c.equals !== undefined ? "= " + c.equals : "> " + c.gt}`).join(" and ");
}

/**
 * Rules editor. Without `project` it edits the company default (admins).
 * With `project` it edits required/optional/ignore for that one project; columns and sheets stay as the default.
 */
export default function RulesEditor({ types, history, canEdit, project }:
  { types: RuleType[]; history: HistoryRow[]; canEdit: boolean; project?: string }) {
  const router = useRouter();
  const [key, setKey] = useState(types[0]?.key);
  useEffect(() => {
    const last = loadLastType();
    if (last && types.some((t) => t.key === last)) setKey(last);
  }, [types]);
  const t = types.find((x) => x.key === key) ?? types[0];
  const [status, setStatus] = useState<Record<string, string>>({});   // `${key}:${order}` -> status
  const [cols, setCols] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<Record<string, { value: string; confirmed: boolean }>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const k = (order: number) => `${t.key}:${order}`;
  const pending = useMemo(() => {
    if (!t) return [];
    const out: { kind: string; order?: number; value: string; confirmed?: boolean }[] = [];
    for (const f of t.fields) {
      const s = status[k(f.order)];
      if (s !== undefined && s !== f.status) out.push({ kind: "status", order: f.order, value: s });
      const c = cols[k(f.order)];
      if (c !== undefined && c !== f.columns) out.push({ kind: "columns", order: f.order, value: c });
    }
    const sh = sheet[t.key];
    if (sh && (sh.value !== t.exportSheet || sh.confirmed !== t.confirmed)) out.push({ kind: "sheet", ...sh });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, status, cols, sheet]);

  if (!t) return <p className="muted">No rules found. Run the worker setup first.</p>;
  const counts = (x: RuleType) => ({
    r: x.fields.filter((f) => f.status === "required").length,
    o: x.fields.filter((f) => f.status === "optional").length,
    changed: x.fields.filter((f) => f.status !== f.defaultStatus).length,
  });
  const shown = t.fields.filter((f) => !q || f.field.toLowerCase().includes(q.toLowerCase()) || f.columns.toLowerCase().includes(q.toLowerCase()));
  const sh = sheet[t.key] ?? { value: t.exportSheet, confirmed: t.confirmed };
  const typeHistory = history.filter((h) => h.typeKey === t.key);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ typeKey: t.key, changes: pending, project }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setMsg({ text: `Saved ${data.changed} change${data.changed === 1 ? "" : "s"}. ${project ? "They apply on this project's next sync." : "They apply on each project's next sync."}`, ok: true });
    setStatus({}); setCols({}); setSheet({});
    router.refresh();
  }

  async function undo(h: HistoryRow) {
    const f = t.fields.find((x) => x.field === h.field);
    let change: object | null = null;
    if (project && f) change = { kind: "status", order: f.order, value: h.old };
    else if (h.old.startsWith("columns=") && f) change = { kind: "columns", order: f.order, value: h.old.slice(8) };
    else if (h.old.startsWith("sheet=")) change = { kind: "sheet", value: h.old.slice(6), confirmed: t.confirmed };
    else if (f) change = { kind: "status", order: f.order, value: h.old };
    if (!change || !confirm(`Put "${h.field}" back to ${h.old}?`)) return;
    setBusy(true);
    const r = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ typeKey: t.key, changes: [change], project }) });
    setBusy(false);
    setMsg(r.ok ? { text: "Undone.", ok: true } : { text: "Undo failed", ok: false });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <nav className="eq-types rule-types" aria-label="Equipment types">
        <ul>
          {types.map((x) => { const c = counts(x); return (
            <li key={x.key}>
              <button className={x.key === t.key ? "on" : ""}
                onClick={() => { if (pending.length && !confirm("Discard unsaved changes?")) return; setStatus({}); setCols({}); setSheet({}); setKey(x.key); saveLastType(x.key); setMsg(null); }}>
                <span className="eq-name">{x.name}{!x.confirmed && <span title="Export sheet name not confirmed yet"> ●</span>}</span>
                <span className="eq-sub">{c.r} required · {c.o} optional</span>
                {project && c.changed > 0 && <span className="eq-sub eq-changed">{c.changed} changed for this project</span>}
              </button>
            </li>); })}
        </ul>
      </nav>

      <div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <b style={{ fontSize: 18 }}>{t.name}</b>
            <span className="muted">BuildingStart export sheet:</span>
            <input value={sh.value} disabled={!canEdit || !!project} onChange={(e) => setSheet({ ...sheet, [t.key]: { ...sh, value: e.target.value } })} style={{ width: 240 }} />
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={sh.confirmed} disabled={!canEdit || !!project} onChange={(e) => setSheet({ ...sheet, [t.key]: { ...sh, confirmed: e.target.checked } })} /> Confirmed
            </label>
            {t.parentTypes && <span className="muted">Only units under: {t.parentTypes.replace("!", "not ")}</span>}
          </div>
          {!t.confirmed && <p className="muted" style={{ margin: "8px 0 0" }}>● This type wasn&apos;t in the sample export, so its sheet and column names are best guesses. Once a project with this equipment syncs, check the names against the export and tick Confirmed.</p>}
        </div>

        <div className="row" style={{ marginBottom: 8 }}>
          <input placeholder="Find a field" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{t.fields.length} fields</span>
          <span style={{ flex: 1 }} />
          {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
          {canEdit && <button className="primary" disabled={busy || pending.length === 0} onClick={save}>
            {busy ? "Saving…" : pending.length ? `Save ${pending.length} change${pending.length === 1 ? "" : "s"}` : "No changes"}</button>}
        </div>

        <div className="scroll">
          <table>
            <thead><tr><th>Field</th><th>Status</th>{project && <th>Company default</th>}<th>BuildingStart column(s)</th><th>Only checked when</th></tr></thead>
            <tbody>
              {shown.map((f) => {
                const s = status[k(f.order)] ?? f.status;
                const c = cols[k(f.order)] ?? f.columns;
                const changed = s !== f.status || c !== f.columns;
                const differs = !!project && s !== f.defaultStatus;
                return (
                  <tr key={f.order} style={changed ? { background: "#fff8e6" } : differs ? { background: "#eef4fb" } : undefined}>
                    <td>{f.field}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="tabs" style={{ margin: 0, flexWrap: "nowrap" }}>
                        {["required", "optional", "ignore"].map((v) => (
                          <button key={v} disabled={!canEdit} className={s === v ? "on" : ""} style={{ padding: "4px 10px" }}
                            onClick={() => setStatus({ ...status, [k(f.order)]: v })}>{LABEL[v]}</button>
                        ))}
                      </div>
                    </td>
                    {project && <td style={{ whiteSpace: "nowrap" }}>
                      {differs ? <>
                        <span className="muted">{LABEL[f.defaultStatus]}</span>{" "}
                        {canEdit && <button style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={() => setStatus({ ...status, [k(f.order)]: f.defaultStatus })}>Reset</button>}
                      </> : <span className="muted">Same</span>}
                    </td>}
                    <td><input value={c} disabled={!canEdit || !!project} placeholder="(matched automatically)" title="Several columns: separate with |  (filled if any has a value)"
                      onChange={(e) => setCols({ ...cols, [k(f.order)]: e.target.value })} style={{ width: "100%", minWidth: 220 }} /></td>
                    <td className="muted">{describe(f.when)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2>Change history · {t.name}</h2>
        {typeHistory.length === 0 ? <p className="muted">No changes yet.</p> : (
          <div className="scroll" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Field</th><th>From</th><th>To</th><th></th></tr></thead>
              <tbody>
                {typeHistory.slice(0, 100).map((h, i) => (
                  <tr key={i}>
                    <td className="muted">{new Date(h.changedAt).toLocaleString()}</td><td>{h.changedBy}</td><td>{h.field}</td>
                    <td>{h.old}</td><td>{h.new}</td>
                    <td>{canEdit && i === typeHistory.findIndex((x) => x.field === h.field) &&
                      <button disabled={busy} onClick={() => undo(h)}>Undo</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

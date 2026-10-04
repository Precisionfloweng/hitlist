"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tol } from "@/lib/toleranceCats";

/** The tolerance used for any category a project hasn't set from its spec. */
export default function DefaultTolerance({ initial }: { initial: Tol }) {
  const router = useRouter();
  const [plus, setPlus] = useState(initial.plus);
  const [minus, setMinus] = useState(initial.minus);
  const [linked, setLinked] = useState(initial.plus === initial.minus);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const clean = (v: string) => v.replace(/[^\d.]/g, "");
  const dirty = plus !== saved.plus || minus !== saved.minus;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultTolerance: { plus, minus } }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setSaved(data.defaultTolerance); setPlus(data.defaultTolerance.plus); setMinus(data.defaultTolerance.minus);
    setMsg({ text: "Saved", ok: true });
    router.refresh();
  }

  return (
    <div className="card tol-card" style={{ maxWidth: 560 }}>
      <b>Default tolerance</b>
      <p className="muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>
        Used for every tolerance a project hasn&apos;t set from its spec (shown as &quot;default&quot; on the project pages,
        and used by AI Review and Search the Documents). A project&apos;s own values on its Rules / Tol. tab always win.
      </p>
      <span className="tol-input">
        +<input inputMode="decimal" aria-label="Default plus percent" value={plus}
          onChange={(e) => { setPlus(clean(e.target.value)); if (linked) setMinus(clean(e.target.value)); }} />
        −<input inputMode="decimal" aria-label="Default minus percent" value={minus}
          onChange={(e) => { setMinus(clean(e.target.value)); setLinked(false); }} />%
      </span>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={busy || !dirty || (!plus && !minus)} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
      </div>
    </div>
  );
}

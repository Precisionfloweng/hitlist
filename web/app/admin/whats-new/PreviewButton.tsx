"use client";
import { useState } from "react";

export default function PreviewButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <div className="row">
      <button className="primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await fetch("/api/admin/whats-new", { method: "POST" });
        const data = await r.json().catch(() => ({}));
        setBusy(false);
        setMsg(r.ok ? { text: `Preview sent to ${data.to}`, ok: true } : { text: data.error || "Couldn't send it", ok: false });
      }}>{busy ? "Sending…" : "Email me a preview"}</button>
      <span className="muted" style={{ fontSize: 13 }}>Sends you the &ldquo;New in Hitlist&rdquo; part of the Monday email, as a tech and as an admin will see it.</span>
      {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
    </div>
  );
}

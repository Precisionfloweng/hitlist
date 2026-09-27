"use client";
import { useState } from "react";

export default function PasswordForm({ first }: { first: boolean }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (pw !== again) { setMsg("The two passwords don't match."); return; }
      setBusy(true); setMsg("");
      const r = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const data = await r.json().catch(() => ({}));
      setBusy(false);
      if (r.ok) window.location.href = "/projects"; else setMsg(data.error || "Couldn't save the password.");
    }}>
      <label>New password (8+ characters)</label>
      <input type={show ? "text" : "password"} autoFocus required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <label>Type it again</label>
      <input type={show ? "text" : "password"} required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      <label className="row" style={{ gap: 6, marginBottom: 12 }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: "auto", margin: 0 }} /> Show password</label>
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : first ? "Create password" : "Save password"}</button>
        {!first && <a href="/projects">Cancel</a>}
      </div>
      {msg && <p className="error">{msg}</p>}
    </form>
  );
}

"use client";
import { useState } from "react";

export default function Login() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function post(url: string, body: object) {
    setBusy(true); setMsg("");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }

  return (
    <main>
      <div className="card login">
        <h1>PFE Hitlist</h1>
        {step === "email" ? (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const r = await post("/api/auth/request", { email });
            if (r.ok) setStep("code"); else setMsg(r.data.error || "Something went wrong.");
          }}>
            <label>Work email</label>
            <input type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@precisionfloweng.com" />
            <button className="primary" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
          </form>
        ) : (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const r = await post("/api/auth/verify", { code });
            if (r.ok) window.location.href = "/projects"; else setMsg(r.data.error || "Something went wrong.");
          }}>
            <p className="muted">If {email} has access, a 6-digit code is on its way. It expires in 10 minutes.</p>
            <input inputMode="numeric" autoFocus required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            <div className="row">
              <button className="primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
              <button type="button" onClick={() => { setStep("email"); setCode(""); }}>Use a different email</button>
            </div>
          </form>
        )}
        {msg && <p className="error">{msg}</p>}
      </div>
    </main>
  );
}

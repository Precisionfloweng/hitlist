"use client";
import { useState } from "react";

type Step = "password" | "email" | "code";

export default function Login() {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function post(url: string, body: object) {
    setBusy(true); setMsg("");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }

  async function sendCode() {
    const r = await post("/api/auth/request", { email });
    if (r.ok) setStep("code"); else setMsg(r.data.error || "Something went wrong.");
  }

  return (
    <main>
      <div className="card login">
        <h1>PFE Hitlist</h1>

        {step === "password" && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const r = await post("/api/auth/password", { email, password });
            if (r.ok) { window.location.href = "/projects"; return; }
            if (r.data.error === "no-password") {
              setMsg("You haven't set a password yet. We'll email you a one-time code to set one.");
              await sendCode();
              return;
            }
            setMsg(r.data.error || "Something went wrong.");
          }}>
            <label>Work email</label>
            <input type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@precisionfloweng.com" autoComplete="username" />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button className="primary" disabled={busy || !email}>{busy ? "Signing in…" : "Sign in"}</button>
            <p className="muted" style={{ marginTop: 16 }}>
              First time here, or forgot your password?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMsg(""); setStep("email"); }}>Email me a code</a>
            </p>
          </form>
        )}

        {step === "email" && (
          <form onSubmit={async (e) => { e.preventDefault(); await sendCode(); }}>
            <p className="muted">We&apos;ll email you a 6-digit code. After you enter it you can set a new password.</p>
            <label>Work email</label>
            <input type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@precisionfloweng.com" />
            <div className="row">
              <button className="primary" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
              <button type="button" onClick={() => { setStep("password"); setMsg(""); }}>Back</button>
            </div>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const r = await post("/api/auth/verify", { code });
            if (r.ok) window.location.href = "/account/password"; else setMsg(r.data.error || "Something went wrong.");
          }}>
            <p className="muted">If {email} has access, a 6-digit code is on its way. It expires in 10 minutes.</p>
            <input inputMode="numeric" autoFocus required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            <div className="row">
              <button className="primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
              <button type="button" onClick={() => { setStep("password"); setCode(""); setMsg(""); }}>Back</button>
            </div>
          </form>
        )}
        {msg && <p className={msg.startsWith("You haven't") ? "muted" : "error"}>{msg}</p>}
      </div>
    </main>
  );
}

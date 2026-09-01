import { useState, useRef } from "react";
import { UserRound, Building2, MailCheck, RefreshCw, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { registerStart, registerVerify, registerResend, login, setToken, setUser } from "../api/client";

const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export default function AuthPage({ onAuth, onBack, initialNotice }) {
  const [mode, setMode] = useState("login");           // "login" | "register"
  const [stage, setStage] = useState("form");           // "form" | "otp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("candidate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice || null);

  // ── OTP step state ──
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpPassword, setOtpPassword] = useState("");
  const [otpPassword2, setOtpPassword2] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  async function handleResend() {
    setResending(true);
    setResendMsg("");
    try {
      await registerResend(pendingEmail);
      setResendMsg("A new code was sent — check your inbox.");
    } catch (err) {
      setResendMsg(err.message);
    } finally {
      setResending(false);
    }
  }

  // Step 1: email + name + role (register) — sends the code.
  // Or a normal login attempt.
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "register") {
        await registerStart(email, fullName, role);
        setPendingEmail(email);
        setOtp(""); setOtpPassword(""); setOtpPassword2(""); setOtpError(""); setResendMsg("");
        setStage("otp");
        return;
      }
      const res = await login(email, password);
      setToken(res.access_token);
      setUser(res.user);
      onAuth(res.user);
    } catch (err) {
      if (err.detail?.code === "email_not_verified") {
        setPendingEmail(err.detail.email || email);
        setOtp(""); setOtpPassword(""); setOtpPassword2(""); setOtpError(""); setResendMsg("");
        setStage("otp");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 2: enter the code + set the password — finishes the account.
  async function handleVerify(e) {
    e.preventDefault();
    setOtpError("");
    if (otp.trim().length !== 6) { setOtpError("Enter the 6-digit code."); return; }
    if (otpPassword.length < 6) { setOtpError("Password must be at least 6 characters."); return; }
    if (otpPassword !== otpPassword2) { setOtpError("Passwords don't match."); return; }
    setOtpLoading(true);
    try {
      const res = await registerVerify(pendingEmail, otp.trim(), otpPassword);
      setToken(res.access_token);
      setUser(res.user);
      onAuth(res.user);
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            position: "fixed", top: 20, left: 20, zIndex: 10,
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px",
            background: "rgba(201,168,76,.08)",
            border: "1px solid rgba(201,168,76,.22)",
            borderRadius: 8,
            color: "rgba(201,168,76,.7)",
            fontSize: 13, fontWeight: "bold",
            fontFamily: FONT,
            cursor: "pointer", transition: "all .2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "#c9a84c";
            e.currentTarget.style.borderColor = "rgba(201,168,76,.45)";
            e.currentTarget.style.background = "rgba(201,168,76,.14)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "rgba(201,168,76,.7)";
            e.currentTarget.style.borderColor = "rgba(201,168,76,.22)";
            e.currentTarget.style.background = "rgba(201,168,76,.08)";
          }}
        >
          ← Back
        </button>
      )}

      <div className="auth-card">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 11,
            background: "rgba(201,168,76,.1)",
            border: "1.5px solid rgba(201,168,76,.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 4px 20px rgba(201,168,76,.18)",
          }}>
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
              <rect x="5" y="3" width="16" height="21" rx="2.5" fill="#e8dfc8" stroke="#c9a84c" strokeWidth="1.4"/>
              <line x1="9" y1="9"  x2="17" y2="9"  stroke="#c9a84c" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="9" y1="13" x2="17" y2="13" stroke="#c9a84c" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="9" y1="17" x2="13" y2="17" stroke="#c9a84c" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="25" cy="26" r="7" fill="#e8dfc8" stroke="#c9a84c" strokeWidth="1.6"/>
              <line x1="30" y1="31" x2="33" y2="34" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>

          <h2 style={{ fontSize: 26, fontWeight: "bold", marginBottom: 4, lineHeight: 1, fontFamily: FONT }}>
            <span style={{ color: "#1a2e14" }}>Resume</span>
            <span style={{
              background: "linear-gradient(108deg,#8a6010 0%,#c9a84c 22%,#f5e888 42%,#fffce0 50%,#f5e888 58%,#c9a84c 78%,#8a6010 100%)",
              backgroundSize: "240% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "shimmer 3s linear infinite",
            }}>Xpert</span>
          </h2>
          <p style={{ fontSize: 10, color: "rgba(80,50,10,.55)", letterSpacing: ".16em", textTransform: "uppercase", marginTop: 6 }}>
            Smart Résumé · Career Edge
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 0" }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,rgba(139,90,20,.3))" }}/>
            <span style={{ fontSize: 10, color: "rgba(139,90,20,.45)", letterSpacing: ".12em" }}>✦</span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,rgba(139,90,20,.3),transparent)" }}/>
          </div>
        </div>

        {notice && (
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "10px 14px", marginBottom: 18, borderRadius: 8,
            background: notice.ok ? "rgba(45,110,66,.1)" : "rgba(180,50,30,.1)",
            border: `1px solid ${notice.ok ? "rgba(45,110,66,.28)" : "rgba(180,50,30,.28)"}`,
            color: notice.ok ? "#2d6e42" : "#b8461f", fontSize: 13,
          }}>
            {notice.ok ? <CheckCircle2 size={16} strokeWidth={2.25}/> : <AlertTriangle size={16} strokeWidth={2.25}/>}
            <span>{notice.message}</span>
          </div>
        )}

        {/* ── Step 2: enter code + set password ── */}
        {stage === "otp" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%", margin: "0 auto 14px",
                background: "rgba(45,110,66,.1)", border: "1.5px solid rgba(45,110,66,.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><MailCheck size={24} strokeWidth={1.75} color="#2d6e42"/></div>
              <h3 style={{ fontSize: 16.5, fontWeight: "bold", color: "#1a2e14", marginBottom: 6 }}>Enter your code</h3>
              <p style={{ fontSize: 13, color: "rgba(60,45,20,.7)", lineHeight: 1.6 }}>
                We sent a 6-digit code to <strong>{pendingEmail}</strong>. Enter it below, then
                choose the password you'll use to sign in from now on.
              </p>
            </div>

            <form onSubmit={handleVerify} className="auth-form">
              <div className="auth-field">
                <label className="field-label">6-digit code</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  className="auth-input" placeholder="123456"
                  style={{ letterSpacing: ".4em", textAlign: "center", fontWeight: "bold", fontSize: 18 }}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required autoFocus
                />
              </div>
              <div className="auth-field">
                <label className="field-label">Create a password</label>
                <input type="password" className="auth-input" placeholder="Min 6 characters"
                  value={otpPassword} onChange={e => setOtpPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="auth-field">
                <label className="field-label">Confirm password</label>
                <input type="password" className="auth-input" placeholder="Retype your password"
                  value={otpPassword2} onChange={e => setOtpPassword2(e.target.value)} required minLength={6} />
              </div>

              {otpError && (
                <div style={{ padding: "10px 14px", background: "rgba(180,50,30,.12)", border: "1px solid rgba(180,50,30,.28)", borderRadius: 8, color: "#e07c5a", fontSize: 13 }}>
                  ⚠ {otpError}
                </div>
              )}

              <button
                type="submit" disabled={otpLoading}
                style={{
                  width: "100%", marginTop: 4, padding: "13px 28px",
                  background: otpLoading ? "rgba(201,168,76,.35)" : "linear-gradient(135deg,#c9a84c,#deba52)",
                  color: "#1a1208", fontSize: 14, fontWeight: "bold", fontFamily: FONT,
                  border: "none", borderRadius: 8, cursor: otpLoading ? "not-allowed" : "pointer",
                  letterSpacing: ".06em", boxShadow: otpLoading ? "none" : "0 4px 18px rgba(201,168,76,.32)",
                  transition: "all .22s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              ><KeyRound size={15} strokeWidth={2.25}/> {otpLoading ? "Verifying…" : "Verify & Create Account"}</button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={handleResend} disabled={resending}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "none", border: "none", color: "#8a6422", fontWeight: "bold",
                  fontSize: 12.5, cursor: resending ? "default" : "pointer", fontFamily: FONT,
                }}
              ><RefreshCw size={12} strokeWidth={2.25}/> {resending ? "Sending…" : "Resend code"}</button>
              {resendMsg && <p style={{ fontSize: 12, color: "rgba(60,45,20,.6)", marginTop: 8 }}>{resendMsg}</p>}
              <p style={{ fontSize: 12.5, marginTop: 12 }}>
                <span style={{ color: "#c9a84c", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => { setStage("form"); setMode("login"); setError(""); }}>
                  ← Back to sign in
                </span>
              </p>
            </div>
          </div>
        )}

        {/* ── Step 1: login, or start registration ── */}
        {stage === "form" && (
        <>
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}>
            Sign In
          </button>
          <button className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => { setMode("register"); setError(""); }}>
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <div className="auth-field">
              <label className="field-label">Full Name</label>
              <input type="text" className="auth-input" placeholder="Sarowar jahan"
                value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
          )}

          <div className="auth-field">
            <label className="field-label">Email</label>
            <input type="email" className="auth-input" placeholder="you@email.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          {mode === "login" && (
            <div className="auth-field">
              <label className="field-label">Password</label>
              <input type="password" className="auth-input" placeholder="Min 6 characters"
                value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}

          {mode === "register" && (
            <div className="auth-field">
              <label className="field-label">I am a</label>
              <div className="auth-role-row">
                <button type="button"
                  className={`auth-role-btn ${role === "candidate" ? "active" : ""}`}
                  onClick={() => setRole("candidate")}
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                  <UserRound size={15} strokeWidth={2.25}/> Candidate
                </button>
                <button type="button"
                  className={`auth-role-btn ${role === "recruiter" ? "active" : ""}`}
                  onClick={() => setRole("recruiter")}
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                  <Building2 size={15} strokeWidth={2.25}/> Recruiter / HR
                </button>
              </div>
            </div>
          )}

          {mode === "register" && (
            <p style={{ fontSize: 11.5, color: "rgba(80,50,10,.55)", lineHeight: 1.6, margin: "-6px 0 0" }}>
              a 6-digit code to inbox —set your
              password on the next step
            </p>
          )}

          {error && (
            <div style={{
              padding: "10px 14px",
              background: "rgba(180,50,30,.12)",
              border: "1px solid rgba(180,50,30,.28)",
              borderRadius: 8,
              color: "#e07c5a", fontSize: 13,
            }}>⚠ {error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", marginTop: 8,
              padding: "13px 28px",
              background: loading
                ? "rgba(201,168,76,.35)"
                : "linear-gradient(135deg,#c9a84c,#deba52)",
              color: "#1a1208",
              fontSize: 14, fontWeight: "bold",
              fontFamily: FONT,
              border: "none", borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: ".06em",
              boxShadow: loading ? "none" : "0 4px 18px rgba(201,168,76,.32)",
              transition: "all .22s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "linear-gradient(135deg,#deba52,#f0cc5a)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 26px rgba(201,168,76,.44)"; } }}
            onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = "linear-gradient(135deg,#c9a84c,#deba52)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 18px rgba(201,168,76,.32)"; } }}
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Send Verification Code"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(80,50,10,.6)", marginTop: 18 }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <span
            style={{ color: "#c9a84c", cursor: "pointer", fontWeight: "bold" }}
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          >
            {mode === "login" ? "Register" : "Sign In"}
          </span>
        </p>
        </>
        )}
      </div>
    </div>
  );
}

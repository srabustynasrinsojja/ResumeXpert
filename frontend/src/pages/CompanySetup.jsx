/**
 * CompanySetup — shown once, right after login, only while a recruiter's
 * company_verified flag is false (see App.jsx routing).
 */
import { useState } from "react";
import { updateMyProfile, verifyCompany } from "../api/client";
import { ErrorNote } from "../components/ui";

export default function CompanySetup({ onComplete }) {
  const [form, setForm] = useState({ company_name: "", phone: "", location: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await updateMyProfile({ company_name: form.company_name, phone: form.phone, location: form.location });
      const res = await verifyCompany();
      onComplete(res.profile);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: 9,
    border: "1px solid rgba(201,168,76,.25)", background: "rgba(12,18,8,.55)",
    color: "rgba(232,220,168,.9)", fontFamily: "inherit", fontSize: 13,
  };
  const labelStyle = {
    display: "block", marginBottom: 6, fontSize: 12, fontWeight: "bold",
    color: "rgba(201,168,76,.7)", textTransform: "uppercase", letterSpacing: ".04em",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--pm-chrome-bg)", padding: "24px",
    }}>
      <form onSubmit={handleSubmit} style={{
        maxWidth: 480, width: "100%", background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(201,168,76,.2)", borderRadius: 18, padding: "34px 36px",
      }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "rgba(232,220,168,.95)" }}>Set up your company profile</h2>
        <p style={{ margin: "0 0 22px", fontSize: 13, color: "rgba(232,220,168,.55)" }}>
          Candidates will see this company info on every job you post.
        </p>

        <label style={labelStyle}>Company name</label>
        <input required value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
          placeholder="e.g. Brainstation-23" style={{ ...inputStyle, marginBottom: 14 }} />

        <label style={labelStyle}>Contact phone</label>
        <input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14 }} />

        <label style={labelStyle}>Location</label>
        <input required value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          placeholder="e.g. Dhaka, Bangladesh" style={{ ...inputStyle, marginBottom: 18 }} />

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }}>
          <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
            style={{ marginTop: 3 }} />
          <span style={{ fontSize: 12, color: "rgba(232,220,168,.6)", lineHeight: 1.5 }}>
            I confirm this information is accurate and I'm authorized to post jobs on behalf of this company.
          </span>
        </label>

        {error && <ErrorNote message={error} />}

        <button type="submit" disabled={saving || !confirmed} style={{
          width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
          background: saving || !confirmed ? "rgba(201,168,76,.25)" : "linear-gradient(135deg,#c9a84c,#deba52)",
          color: "#1a1208", fontWeight: "bold", fontSize: 14,
          cursor: saving || !confirmed ? "default" : "pointer", fontFamily: "inherit",
        }}>{saving ? "Setting up…" : "Verify and continue"}</button>
      </form>
    </div>
  );
}

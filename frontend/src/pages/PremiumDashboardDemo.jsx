/**
 * PremiumDashboardDemo — a REFERENCE implementation, not wired into
 * MainApp's routing. Shows the Stripe/Linear/Vercel-style Candidate
 * Dashboard from the blueprint, using real data from your existing
 * /candidate/resume-quality/file endpoint (not mock data) — drop a
 * real resume in and you'll see a real score.
 *
 * To actually adopt this screen, swap it in for <CheckCV/> in
 * MainApp.jsx once you're happy with the direction.
 */
import { useState } from "react";
import { Upload } from "lucide-react";
import { checkCVQuality } from "../api/client";
import { PremiumCard, MatchPill, KeywordTag, RadialScore, ResumeParsingSkeleton, PremiumButton } from "../components/premium";

function extractText(x) {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") return x.keyword || x.skill || x.name || JSON.stringify(x);
  return String(x);
}

function DropZone({ file, onFile, disabled }) {
  return (
    <label
      htmlFor="pm-resume-input"
      style={{
        display: "flex", alignItems: "center", gap: 16, padding: "22px 24px",
        border: "1.5px dashed var(--pm-border-strong)", borderRadius: "var(--pm-radius)",
        background: "var(--pm-surface-sunken)", cursor: disabled ? "default" : "pointer",
        transition: "border-color .2s ease, background .2s ease",
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = "var(--pm-accent)"; e.currentTarget.style.background = "var(--pm-accent-bg)"; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--pm-border-strong)"; e.currentTarget.style.background = "var(--pm-surface-sunken)"; }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: "var(--pm-radius-sm)", flexShrink: 0,
        background: "var(--pm-surface)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Upload size={19} strokeWidth={2} color="var(--pm-accent)"/>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--pm-text)", fontFamily: "var(--pm-font)" }}>
          {file ? file.name : "Drop resume to check ATS score"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--pm-text-muted)", fontFamily: "var(--pm-font)" }}>
          PDF or DOCX, parsed instantly
        </p>
      </div>
      <input id="pm-resume-input" type="file" accept=".pdf,.docx" style={{ display: "none" }}
        disabled={disabled} onChange={e => onFile(e.target.files?.[0] || null)} />
    </label>
  );
}

export default function PremiumDashboardDemo() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFile(f) {
    setFile(f);
    if (!f) { setResult(null); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await checkCVQuality(f);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const score = result?.score_summary?.resume_quality_score ?? 0;
  const foundSkills = result?.candidate_feedback?.matched_skills || [];
  const missingSkills = result?.candidate_feedback?.suggested_skills || [];

  return (
    <div style={{
      fontFamily: "var(--pm-font)", background: "var(--pm-bg)", minHeight: "100%",
      padding: "32px", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, maxWidth: 920, margin: "0 auto",
    }}>
      <div style={{ gridColumn: "span 2" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pm-text)", margin: "0 0 4px" }}>Candidate dashboard</h1>
        <p style={{ fontSize: 13.5, color: "var(--pm-text-secondary)", margin: 0 }}>Upload a resume to see the live ATS score.</p>
      </div>

      <div style={{ gridColumn: "span 2" }}>
        <DropZone file={file} onFile={handleFile} disabled={loading} />
      </div>

      {loading && (
        <div style={{ gridColumn: "span 2" }}><ResumeParsingSkeleton /></div>
      )}

      {!loading && error && (
        <div style={{ gridColumn: "span 2" }}>
          <PremiumCard style={{ borderColor: "var(--pm-danger-bg)" }}>
            <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{error}</p>
          </PremiumCard>
        </div>
      )}

      {!loading && result && (
        <>
          <PremiumCard interactive className="pm-enter">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--pm-text)", margin: 0 }}>
                  {result.profile?.candidate_name || "Your resume"}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--pm-text-secondary)", margin: "3px 0 0" }}>
                  {result.profile?.headline || "Resume quality check"}
                </p>
              </div>
              <MatchPill percent={score} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
              {foundSkills.slice(0, 4).map((s, i) => <KeywordTag key={`f${i}`} text={extractText(s)} found />)}
              {missingSkills.slice(0, 3).map((s, i) => <KeywordTag key={`m${i}`} text={extractText(s)} found={false} />)}
            </div>
          </PremiumCard>

          <PremiumCard className="pm-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <RadialScore score={score} label="ATS score" />
          </PremiumCard>
        </>
      )}

      {!loading && !result && (
        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end" }}>
          <PremiumButton variant="ghost" disabled>Waiting for a resume…</PremiumButton>
        </div>
      )}
    </div>
  );
}

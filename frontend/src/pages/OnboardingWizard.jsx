/**
 * OnboardingWizard — shown once, right after login, only while the candidate's
 * profile is incomplete (see App.jsx routing + backend compute_profile_status).
 * Two steps, driven by whichever field is actually missing — not a fixed counter,
 * so a candidate who already has a resume but no phone number skips straight to
 * the info step instead of being forced through both regardless.
 */
import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { updateMyProfile, uploadResumeToAccountAsync } from "../api/client";
import { useProcessingJob, ProcessingIndicator } from "../hooks/useProcessingJob";
import { ErrorNote } from "../components/ui";

const wrapStyle = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--pm-chrome-bg)", padding: "24px",
};
const cardStyle = {
  maxWidth: 480, width: "100%", background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(201,168,76,.2)", borderRadius: 18, padding: "34px 36px",
};
const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 9,
  border: "1px solid rgba(201,168,76,.25)", background: "rgba(12,18,8,.55)",
  color: "rgba(232,220,168,.9)", fontFamily: "inherit", fontSize: 13,
};
const labelStyle = {
  display: "block", marginBottom: 6, fontSize: 12, fontWeight: "bold",
  color: "rgba(201,168,76,.7)", textTransform: "uppercase", letterSpacing: ".04em",
};

function StepDots({ step }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
      {[1, 2].map(n => (
        <div key={n} style={{
          height: 4, flex: 1, borderRadius: 99,
          background: n <= step ? "linear-gradient(135deg,#c9a84c,#deba52)" : "rgba(201,168,76,.15)",
        }} />
      ))}
    </div>
  );
}

function BasicInfoStep({ user, onNext }) {
  const [form, setForm] = useState({ full_name: user.full_name || "", phone: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res = await updateMyProfile({ full_name: form.full_name, phone: form.phone, location: form.location });
      onNext(res.profile);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "rgba(232,220,168,.95)" }}>Let's set up your profile</h2>
      <p style={{ margin: "0 0 22px", fontSize: 13, color: "rgba(232,220,168,.55)" }}>
        Just a couple of details so recruiters and job matches make sense for you.
      </p>

      <label style={labelStyle}>Full name</label>
      <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 14 }} />

      <label style={labelStyle}>Phone number</label>
      <input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
        placeholder="+880 1XXX-XXXXXX" style={{ ...inputStyle, marginBottom: 14 }} />

      <label style={labelStyle}>Location</label>
      <input required value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
        placeholder="e.g. Dhaka, Bangladesh" style={{ ...inputStyle, marginBottom: 20 }} />

      {error && <ErrorNote message={error} />}

      <button type="submit" disabled={saving} style={{
        width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
        background: "linear-gradient(135deg,#c9a84c,#deba52)", color: "#1a1208",
        fontWeight: "bold", fontSize: 14, cursor: saving ? "default" : "pointer", fontFamily: "inherit",
      }}>{saving ? "Saving…" : "Continue"}</button>
    </form>
  );
}

function ResumeStep({ onDone }) {
  const [file, setFile] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const { job, timedOut, start, reset } = useProcessingJob();

  async function handleUpload() {
    if (!file) return;
    setStarting(true); setError("");
    try {
      const res = await uploadResumeToAccountAsync(file, "Initial resume");
      start(res.job_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  // job resolved successfully — hand control back to the wizard
  useEffect(() => {
    if (job?.status === "done") onDone();
  }, [job?.status, onDone]);

  const processing = job && job.status !== "done" && job.status !== "error";

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "rgba(232,220,168,.95)" }}>Upload your resume</h2>
      <p style={{ margin: "0 0 22px", fontSize: 13, color: "rgba(232,220,168,.55)" }}>
        We'll parse it automatically so you can check your ATS score, apply to jobs, and get matched — no manual re-entry.
      </p>

      {!processing && (
        <label
          htmlFor="onboarding-resume-input"
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            border: "2px dashed rgba(201,168,76,.3)", borderRadius: 12, padding: "36px 20px",
            cursor: "pointer", marginBottom: 16, textAlign: "center",
          }}
        >
          <FileUp size={26} strokeWidth={1.75} color="var(--brass, #c9a84c)" style={{ marginBottom: 8 }}/>
          <span style={{ fontSize: 13, color: "rgba(232,220,168,.8)", fontWeight: "bold" }}>
            {file ? file.name : "Click to choose a PDF or DOCX"}
          </span>
          <input
            id="onboarding-resume-input" type="file" accept=".pdf,.docx" style={{ display: "none" }}
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
        </label>
      )}

      {processing && (
        <div style={{
          border: "1px solid rgba(201,168,76,.2)", borderRadius: 12, padding: "20px",
          marginBottom: 16,
        }}>
          <ProcessingIndicator
            label={
              job.status === "queued" ? "Queued…" :
              job.progress_pct < 50 ? "Reading your resume…" :
              job.progress_pct < 85 ? "Scoring your resume…" : "Almost done…"
            }
            progressPct={job.progress_pct || 0}
          />
        </div>
      )}

      {timedOut && (
        <ErrorNote message="This is taking longer than usual. You can retry, or continue and check back later." />
      )}
      {job?.status === "error" && <ErrorNote message={job.error_message || "Resume processing failed."} />}
      {!processing && error && <ErrorNote message={error} />}

      {(timedOut || job?.status === "error") ? (
        <button onClick={() => { reset(); setError(""); }} style={{
          width: "100%", padding: "13px 0", borderRadius: 10, border: "1px solid rgba(201,168,76,.3)",
          background: "transparent", color: "#c9a84c", fontWeight: "bold", fontSize: 14,
          cursor: "pointer", fontFamily: "inherit", marginTop: 8,
        }}>Try again</button>
      ) : !processing && (
        <button
          onClick={handleUpload}
          disabled={!file || starting}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 10, border: "none", marginTop: 8,
            background: !file || starting ? "rgba(201,168,76,.25)" : "linear-gradient(135deg,#c9a84c,#deba52)",
            color: "#1a1208", fontWeight: "bold", fontSize: 14,
            cursor: !file || starting ? "default" : "pointer", fontFamily: "inherit",
          }}
        >{starting ? "Starting…" : "Finish setup"}</button>
      )}
    </div>
  );
}

export default function OnboardingWizard({ user, initialStep, onComplete }) {
  const [step, setStep] = useState(initialStep === "resume" ? 2 : 1);

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <StepDots step={step} />
        {step === 1
          ? <BasicInfoStep user={user} onNext={() => setStep(2)} />
          : <ResumeStep onDone={onComplete} />
        }
      </div>
    </div>
  );
}

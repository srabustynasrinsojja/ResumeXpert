/**
 * RecruiterJobs — post real job listings, browse your postings, and review
 * a ranked applicant list per job (powered by the ats_score_engine match
 * score computed at apply time, not a manual upload-and-screen flow).
 */
import { useEffect, useState } from "react";
import { createJobPosting, myJobPostings, jobApplicants, updateApplicationStatus, scheduleInterview, getApplicantProfile, recruiterDownloadDocument, parseJobLive, updateJobStatus } from "../api/client";
import { Spinner, ErrorNote, ScoreRing } from "../components/ui";
import { MapPin, Inbox, ClipboardList, Video, CalendarClock, FileText, Download, Lock, Unlock } from "lucide-react";
import { ResumeSummaryView } from "./Profile";
import InterviewRoom from "../components/InterviewRoom";

const EMPLOYMENT_TYPES = [
  { id: "full_time", label: "Full-time" },
  { id: "part_time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "remote", label: "Remote" },
];

// Kanban pipeline stages — matches backend RECRUITER_TRANSITIONS exactly.
// "applied" isn't a column here: it's a transient DB state that's already
// resolved to "ai_ranked" by the time the recruiter ever sees the applicant.
const KANBAN_COLUMNS = [
  { id: "ai_ranked",           label: "Ranked" },
  { id: "reviewed",            label: "Reviewed" },
  { id: "interview_scheduled", label: "Interview scheduled" },
  { id: "hired",               label: "Hired" },
];
// Legal next-status moves per current status — mirrors database.RECRUITER_TRANSITIONS.
// Kept in sync manually since frontend/backend are separate codebases; the backend
// is the enforced source of truth regardless (a stale frontend list here just means
// a slightly-wrong button shows up, not a security gap — the server rejects illegal
// moves either way).
const NEXT_MOVES = {
  ai_ranked: ["reviewed", "rejected"],
  reviewed: ["interview_scheduled", "rejected"],
  interview_scheduled: ["hired", "rejected"],
  hired: [], rejected: [], withdrawn: [],
};
const STATUS_STYLES = {
  applied:             { bg: "rgba(181,134,13,.1)", border: "rgba(181,134,13,.3)",  color: "var(--brass)" },
  ai_ranked:           { bg: "rgba(181,134,13,.1)", border: "rgba(181,134,13,.3)",  color: "var(--brass)" },
  reviewed:            { bg: "rgba(37,99,178,.1)", border: "rgba(37,99,178,.3)",  color: "#2563b2" },
  interview_scheduled: { bg: "rgba(115,72,196,.1)",border: "rgba(115,72,196,.32)",color: "#7348c4" },
  hired:               { bg: "rgba(45,110,66,.12)",  border: "rgba(45,110,66,.35)",  color: "var(--forest2)" },
  rejected:            { bg: "rgba(168,52,31,.1)",  border: "rgba(168,52,31,.3)",   color: "var(--pm-danger)" },
  withdrawn:           { bg: "var(--pm-surface-sunken)",border: "var(--pm-border)",color: "var(--ink-muted)" },
};
const STATUS_LABELS = {
  applied: "Applied", ai_ranked: "Ranked", reviewed: "Reviewed",
  interview_scheduled: "Interview scheduled", hired: "Hired",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(201,168,76,.25)", background: "var(--pm-surface)",
  color: "var(--ink)", fontFamily: "inherit", fontSize: 13,
};
const labelStyle = {
  display: "block", marginBottom: 6, fontSize: 12, fontWeight: "bold",
  color: "rgba(201,168,76,.7)", textTransform: "uppercase", letterSpacing: ".05em",
};

/* ── Post a Job form ─────────────────────────────────────────── */
function PostJobForm({ onPosted }) {
  const [form, setForm] = useState({
    title: "", company_name: "", location: "Dhaka, Bangladesh",
    employment_type: "full_time", salary_min: "", salary_max: "", description: "",
  });
  const [skills, setSkills] = useState([]);          // recruiter-confirmed chip list
  const [suggesting, setSuggesting] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  // Debounced live skill suggestion — reuses the existing /recruiter/job/parse
  // endpoint, called as the recruiter types rather than only at final submit.
  useEffect(() => {
    if (form.description.trim().length < 30) return;
    const timer = setTimeout(() => {
      setSuggesting(true);
      parseJobLive(form.description)
        .then(res => {
          const detected = res.parsed_job?.required_skills || [];
          // Merge, don't overwrite — keep any skills the recruiter already
          // manually removed or added, only add genuinely new detections.
          setSkills(prev => {
            const existing = new Set(prev.map(s => s.toLowerCase()));
            const fresh = detected.filter(s => !existing.has(s.toLowerCase()));
            return [...prev, ...fresh];
          });
        })
        .catch(() => {})
        .finally(() => setSuggesting(false));
    }, 800);
    return () => clearTimeout(timer);
  }, [form.description]);

  function removeSkill(skill) { setSkills(prev => prev.filter(s => s !== skill)); }
  function addSkill() {
    const s = newSkill.trim();
    if (s && !skills.some(x => x.toLowerCase() === s.toLowerCase())) setSkills(prev => [...prev, s]);
    setNewSkill("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true); setError("");
    try {
      await createJobPosting({
        title: form.title,
        company_name: form.company_name,
        location: form.location,
        employment_type: form.employment_type,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        description: form.description,
        confirmed_skills: skills.length > 0 ? skills : null,
      });
      setForm({ title: "", company_name: "", location: "Dhaka, Bangladesh", employment_type: "full_time", salary_min: "", salary_max: "", description: "" });
      setSkills([]);
      onPosted();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      maxWidth: 620, margin: "0 auto", background: "var(--pm-surface-sunken)",
      border: "1px solid rgba(201,168,76,.16)", borderRadius: 16, padding: "26px 30px",
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>Job Title</label>
          <input required value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="e.g. Python Backend Developer" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Company Name</label>
          <input required value={form.company_name} onChange={e => set("company_name", e.target.value)}
            placeholder="e.g. Brainstation-23" style={inputStyle} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>Location</label>
          <input required value={form.location} onChange={e => set("location", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Employment Type</label>
          <select value={form.employment_type} onChange={e => set("employment_type", e.target.value)} style={inputStyle}>
            {EMPLOYMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>Salary Min (৳/mo, optional)</label>
          <input type="number" min="0" value={form.salary_min} onChange={e => set("salary_min", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Salary Max (৳/mo, optional)</label>
          <input type="number" min="0" value={form.salary_max} onChange={e => set("salary_max", e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Job Description</label>
        <textarea required rows={8} value={form.description} onChange={e => set("description", e.target.value)}
          placeholder="Paste the full job description — required skills, responsibilities, qualifications…"
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <div>
        <label style={labelStyle}>
          Detected skills {suggesting && <span style={{ color: "var(--ink-faded)", textTransform: "none", fontWeight: "normal" }}>· scanning…</span>}
        </label>
        <p style={{ fontSize: 11, color: "var(--ink-faded)", margin: "0 0 8px" }}>
          Auto-detected as you type — remove any that don't apply, add any we missed.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {skills.map(s => (
            <span key={s} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, padding: "4px 6px 4px 10px", borderRadius: 99,
              background: "rgba(90,192,112,.1)", border: "1px solid rgba(90,192,112,.3)", color: "var(--forest2)",
            }}>
              {s}
              <button type="button" onClick={() => removeSkill(s)} style={{
                background: "none", border: "none", color: "var(--forest2)", cursor: "pointer",
                fontSize: 13, lineHeight: 1, padding: 0,
              }}>×</button>
            </span>
          ))}
          {skills.length === 0 && !suggesting && (
            <span style={{ fontSize: 11, color: "var(--ink-faded)" }}>No skills detected yet — keep typing the description.</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            placeholder="Add a skill manually" style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={addSkill} style={{
            padding: "0 16px", borderRadius: 8, border: "1px solid rgba(201,168,76,.3)",
            background: "transparent", color: "var(--brass)", fontSize: 12, fontWeight: "bold", cursor: "pointer", fontFamily: "inherit",
          }}>Add</button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      <button type="submit" disabled={submitting} style={{
        padding: "13px 0", borderRadius: 10, border: "none",
        background: "linear-gradient(135deg,var(--brass),#deba52)", color: "#1a1208",
        fontWeight: "bold", fontSize: 14, cursor: submitting ? "default" : "pointer",
        fontFamily: "inherit", opacity: submitting ? 0.7 : 1,
      }}>
        {submitting ? "Posting…" : "Post Job"}
      </button>
    </form>
  );
}

/* ── Full applicant profile modal ─────────────────────────────── */
/* ── Pick a date/time to schedule an interview ───────────────── */
function ScheduleInterviewModal({ applicationId, onClose, onScheduled }) {
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!when) { setError("Pick a date and time first."); return; }
    setSaving(true); setError("");
    try {
      const iso = new Date(when).toISOString();
      const res = await scheduleInterview(applicationId, iso);
      onScheduled(res.application);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const minLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 250,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#171008", border: "1px solid rgba(201,168,76,.25)",
        borderRadius: 16, padding: "24px 26px", maxWidth: 380, width: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <CalendarClock size={17} strokeWidth={2.25} color="#deba52" />
          <h3 style={{ margin: 0, fontSize: 16, color: "rgba(232,223,200,.95)" }}>Schedule Interview</h3>
        </div>
        <p style={{ fontSize: 12.5, color: "rgba(232,223,200,.55)", margin: "0 0 18px", lineHeight: 1.5 }}>
          A live video room is created automatically — the candidate will see the date/time
          and a "Join Interview" button on their application.
        </p>
        <label style={{ display: "block", fontSize: 11.5, fontWeight: "bold", color: "rgba(201,168,76,.7)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>
          Date &amp; time
        </label>
        <input
          type="datetime-local" value={when} min={minLocal}
          onChange={e => setWhen(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8, marginBottom: 16,
            border: "1px solid rgba(201,168,76,.3)", background: "rgba(0,0,0,.25)",
            color: "rgba(232,223,200,.95)", fontFamily: "inherit", fontSize: 13,
          }}
        />
        {error && (
          <div style={{ fontSize: 12, color: "#f09a72", marginBottom: 14 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(232,223,200,.2)",
            background: "transparent", color: "rgba(232,223,200,.7)", fontWeight: "bold", fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={handleConfirm} disabled={saving} style={{
            flex: 1.4, padding: "10px 0", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg,#c9a84c,#deba52)", color: "#1a1208",
            fontWeight: "bold", fontSize: 13, cursor: saving ? "default" : "pointer",
            fontFamily: "inherit", opacity: saving ? .6 : 1,
          }}>{saving ? "Scheduling…" : "Confirm & Create Room"}</button>
        </div>
      </div>
    </div>
  );
}

function ApplicantProfileModal({ applicationId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  useEffect(() => {
    getApplicantProfile(applicationId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [applicationId]);

  const app = data?.application;
  const canSchedule = app && (NEXT_MOVES[app.status] || []).includes("interview_scheduled");
  const hasInterview = app?.status === "interview_scheduled" && app.interview_room;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#171008", border: "1px solid rgba(201,168,76,.25)",
        borderRadius: 18, padding: "26px 30px", maxWidth: 560, width: "100%",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        {loading && <Spinner text="Loading candidate profile…" />}
        {!loading && error && <ErrorNote message={error} />}
        {!loading && data && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12 }}>
                {data.candidate?.avatar ? (
                  <img src={data.candidate.avatar} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(201,168,76,.3)", flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, fontWeight: "bold", color: "#deba52",
                  }}>{(data.candidate?.full_name || "?").slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, color: "rgba(232,220,168,.95)" }}>{data.candidate?.full_name}</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(232,220,168,.55)" }}>
                    {data.candidate?.email}{data.candidate?.phone ? ` · ${data.candidate.phone}` : ""}
                  </p>
                  {data.candidate?.location && (
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(232,220,168,.45)", display:"flex", alignItems:"center", gap:5 }}><MapPin size={11} strokeWidth={2.25}/> {data.candidate.location}</p>
                  )}
                </div>
              </div>
              <button onClick={onClose} style={{
                background: "none", border: "none", color: "rgba(232,220,168,.5)", fontSize: 18, cursor: "pointer",
              }}>✕</button>
            </div>
            {data.resume_quality_score != null && (
              <p style={{ fontSize: 12, color: "#deba52", fontWeight: "bold", marginBottom: 16 }}>
                Resume quality score: {Math.round(data.resume_quality_score)}
              </p>
            )}

            {/* ── Interview: schedule, or show the scheduled slot + join ── */}
            {(canSchedule || hasInterview) && (
              <div style={{
                marginBottom: 18, padding: "14px 16px", borderRadius: 12,
                background: "rgba(115,72,196,.08)", border: "1px solid rgba(115,72,196,.25)",
              }}>
                {hasInterview ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9268e0", fontSize: 12.5, fontWeight: "bold" }}>
                      <CalendarClock size={15} strokeWidth={2.25} />
                      Interview: {new Date(app.interview_datetime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                    <button onClick={() => setJoiningRoom(true)} style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 8,
                      border: "none", cursor: "pointer", background: "linear-gradient(135deg,#7348c4,#9268e0)",
                      color: "#fff", fontWeight: "bold", fontSize: 12.5, fontFamily: "inherit",
                    }}><Video size={14} strokeWidth={2.25} /> Join Interview</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: "rgba(232,223,200,.65)" }}>No interview scheduled yet.</span>
                    <button onClick={() => setScheduling(true)} style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 8,
                      border: "1px solid rgba(115,72,196,.4)", cursor: "pointer", background: "rgba(115,72,196,.12)",
                      color: "#9268e0", fontWeight: "bold", fontSize: 12.5, fontFamily: "inherit",
                    }}><CalendarClock size={14} strokeWidth={2.25} /> Schedule Interview</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Documents the candidate uploaded, beyond the résumé ── */}
            {data.candidate?.documents?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 11.5, fontWeight: "bold", color: "rgba(201,168,76,.7)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                  Documents ({data.candidate.documents.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.candidate.documents.map(doc => (
                    <button key={doc.id}
                      onClick={() => recruiterDownloadDocument(applicationId, doc.id, doc.filename).catch(e => alert(e.message))}
                      style={{
                        display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8,
                        background: "rgba(232,223,200,.04)", border: "1px solid rgba(232,223,200,.1)",
                        color: "rgba(232,223,200,.85)", fontSize: 12.5, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left", width: "100%",
                      }}>
                      <FileText size={14} strokeWidth={2} color="#deba52" style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</span>
                      <Download size={13} strokeWidth={2.25} style={{ flexShrink: 0, opacity: .6 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ResumeSummaryView resume={data.resume} />
          </>
        )}
      </div>

      {scheduling && (
        <ScheduleInterviewModal
          applicationId={applicationId}
          onClose={() => setScheduling(false)}
          onScheduled={(updatedApp) => {
            setScheduling(false);
            setData(prev => ({ ...prev, application: updatedApp }));
          }}
        />
      )}
      {joiningRoom && app?.interview_room && (
        <InterviewRoom
          room={app.interview_room}
          title={`Interview — ${data.candidate?.full_name}`}
          onClose={() => setJoiningRoom(false)}
        />
      )}
    </div>
  );
}

/* ── One applicant card inside a Kanban column ───────────────── */
function ApplicantCard({ a, updating, onMove, onViewProfile, onScheduleInterview, onJoinInterview }) {
  const style = STATUS_STYLES[a.status] || STATUS_STYLES.applied;
  const moves = NEXT_MOVES[a.status] || [];
  const hasInterview = a.status === "interview_scheduled" && a.interview_room;
  return (
    <div style={{
      background: "var(--pm-surface-sunken)", border: "1px solid rgba(201,168,76,.16)",
      borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ScoreRing score={a.combined_score} size={40} stroke={5} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: "bold", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {a.candidate_name}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--ink-muted)" }}>
            Match {a.job_match_score?.toFixed(0)}
          </p>
        </div>
      </div>
      {a.cover_note && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--ink-muted)", fontStyle: "italic", lineHeight: 1.5 }}>
          "{a.cover_note.length > 80 ? a.cover_note.slice(0, 80) + "…" : a.cover_note}"
        </p>
      )}
      {hasInterview && (
        <div style={{ fontSize: 10.5, color: "#7348c4", fontWeight: "bold", display: "flex", alignItems: "center", gap: 5 }}>
          <CalendarClock size={11} strokeWidth={2.25} />
          {new Date(a.interview_datetime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      )}
      <button onClick={() => onViewProfile(a.id)} style={{
        fontSize: 10.5, fontWeight: "bold", padding: "5px 0", borderRadius: 7,
        background: "transparent", border: "1px solid rgba(201,168,76,.25)", color: "var(--brass)",
        cursor: "pointer", fontFamily: "inherit",
      }}>View profile</button>
      {hasInterview && (
        <button onClick={() => onJoinInterview(a)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          fontSize: 10.5, fontWeight: "bold", padding: "6px 0", borderRadius: 7,
          background: "linear-gradient(135deg,#7348c4,#9268e0)", border: "none", color: "#fff",
          cursor: "pointer", fontFamily: "inherit",
        }}><Video size={12} strokeWidth={2.25} /> Join Interview</button>
      )}
      {moves.length > 0 && (
        <div style={{ display: "flex", gap: 6 }}>
          {moves.map(m => {
            const mStyle = STATUS_STYLES[m];
            return (
              <button key={m} disabled={updating}
                onClick={() => m === "interview_scheduled" ? onScheduleInterview(a.id) : onMove(a.id, m)}
                style={{
                  flex: 1, fontSize: 10.5, fontWeight: "bold", padding: "6px 4px", borderRadius: 7,
                  background: mStyle.bg, border: `1px solid ${mStyle.border}`, color: mStyle.color,
                  cursor: updating ? "default" : "pointer", fontFamily: "inherit", opacity: updating ? 0.5 : 1,
                }}>{m === "rejected" ? "Reject" : m === "interview_scheduled" ? "→ Schedule Interview" : `→ ${STATUS_LABELS[m]}`}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Ranked applicants view for one job — Kanban board ───────── */
function ApplicantsPanel({ job, onBack }) {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(null); // application id currently updating
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [schedulingId, setSchedulingId] = useState(null);
  const [joiningInterview, setJoiningInterview] = useState(null); // the applicant object
  const [jobStatus, setJobStatus] = useState(job.status);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");

  function load() {
    setLoading(true); setError("");
    jobApplicants(job.id)
      .then(d => setApplicants(d.applicants || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMove(appId, status) {
    setUpdating(appId);
    setError("");
    try {
      await updateApplicationStatus(appId, status);
      setApplicants(prev => prev.map(a => a.id === appId ? { ...a, status } : a));
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(null);
    }
  }

  async function handleToggleJobStatus() {
    const nextStatus = jobStatus === "open" ? "closed" : "open";
    const confirmMsg = nextStatus === "closed"
      ? `Close "${job.title}" to new applicants? Candidates won't be able to see or apply to this listing anymore. Existing applications stay as-is.`
      : `Reopen "${job.title}" for applications?`;
    if (!window.confirm(confirmMsg)) return;

    setStatusError("");
    setStatusUpdating(true);
    try {
      const { job: updated } = await updateJobStatus(job.id, nextStatus);
      setJobStatus(updated?.status || nextStatus);
    } catch (e) {
      setStatusError(e.message || "Couldn't update job status.");
    } finally {
      setStatusUpdating(false);
    }
  }

  function handleScheduled(updatedApp) {
    setSchedulingId(null);
    setApplicants(prev => prev.map(a => a.id === updatedApp.id ? { ...a, ...updatedApp } : a));
  }

  const rejected = applicants.filter(a => a.status === "rejected" || a.status === "withdrawn");
  const isOpen = jobStatus === "open";

  return (
    <div style={{
      maxWidth: 1100, margin: "0 auto",
      background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
      borderRadius: "var(--pm-radius-lg)", boxShadow: "var(--pm-shadow-md)",
      padding: "26px 28px 30px", fontFamily: "var(--pm-font)",
    }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "var(--brass)", cursor: "pointer",
        fontFamily: "inherit", fontSize: 13, fontWeight: "bold", marginBottom: 18, padding: 0,
      }}>← Back to my postings</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--ink)" }}>{job.title}</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-muted)" }}>
            {applicants.length} applicant{applicants.length === 1 ? "" : "s"} · click a stage button to move a candidate forward
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: "bold", padding: "3px 10px", borderRadius: 6,
            background: isOpen ? "rgba(45,110,66,.1)" : "var(--pm-surface-sunken)",
            border: `1px solid ${isOpen ? "rgba(45,110,66,.3)" : "var(--pm-border)"}`,
            color: isOpen ? "var(--forest2)" : "var(--ink-muted)",
            textTransform: "uppercase", letterSpacing: ".04em",
          }}>{jobStatus}</span>
          <button
            onClick={handleToggleJobStatus}
            disabled={statusUpdating}
            title={isOpen ? "Close this posting — e.g. once you've hired someone" : "Reopen this posting"}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, fontFamily: "inherit",
              fontSize: 12, fontWeight: "bold", cursor: statusUpdating ? "default" : "pointer",
              opacity: statusUpdating ? 0.6 : 1,
              background: isOpen ? "rgba(196,90,72,.08)" : "rgba(45,110,66,.08)",
              border: `1px solid ${isOpen ? "rgba(196,90,72,.3)" : "rgba(45,110,66,.3)"}`,
              color: isOpen ? "#b85f46" : "var(--forest2)",
            }}>
            {isOpen
              ? <><Lock size={13} strokeWidth={2.4}/> {statusUpdating ? "Closing…" : "Close to applicants"}</>
              : <><Unlock size={13} strokeWidth={2.4}/> {statusUpdating ? "Reopening…" : "Reopen"}</>}
          </button>
        </div>
      </div>
      {statusError && <div style={{ margin: "10px 0 0" }}><ErrorNote message={statusError} /></div>}
      <div style={{ height: 16 }} />

      {loading && <Spinner text="Loading applicants…" />}
      {!loading && error && <ErrorNote message={error} />}
      {!loading && !error && applicants.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--ink-faded)" }}>
          <Inbox size={34} strokeWidth={1.6} style={{ display:"block", margin:"0 auto 8px" }}/>
          <p>No applicants yet for this posting.</p>
        </div>
      )}

      {!loading && !error && applicants.length > 0 && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: `repeat(${KANBAN_COLUMNS.length}, minmax(220px, 1fr))`,
            gap: 14, overflowX: "auto", paddingBottom: 8,
          }}>
            {KANBAN_COLUMNS.map(col => {
              const colApplicants = applicants.filter(a => a.status === col.id);
              return (
                <div key={col.id} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
                    <span style={{ fontSize: 11.5, fontWeight: "bold", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                      {col.label}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink-faded)" }}>{colApplicants.length}</span>
                  </div>
                  <div style={{
                    background: "var(--pm-surface-sunken)", borderRadius: 12, padding: 8,
                    display: "flex", flexDirection: "column", gap: 8, minHeight: 80,
                  }}>
                    {colApplicants.length === 0 && (
                      <p style={{ fontSize: 11, color: "var(--ink-faded)", textAlign: "center", padding: "16px 4px" }}>Empty</p>
                    )}
                    {colApplicants.map(a => (
                      <ApplicantCard key={a.id} a={a} updating={updating === a.id}
                        onMove={handleMove} onViewProfile={setViewingProfileId}
                        onScheduleInterview={setSchedulingId} onJoinInterview={setJoiningInterview} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {rejected.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p style={{ fontSize: 11.5, fontWeight: "bold", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
                Rejected / withdrawn ({rejected.length})
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {rejected.map(a => (
                  <ApplicantCard key={a.id} a={a} updating={false} onMove={() => {}} onViewProfile={setViewingProfileId}
                    onScheduleInterview={() => {}} onJoinInterview={setJoiningInterview} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {viewingProfileId && (
        <ApplicantProfileModal applicationId={viewingProfileId} onClose={() => setViewingProfileId(null)} />
      )}
      {schedulingId && (
        <ScheduleInterviewModal
          applicationId={schedulingId}
          onClose={() => setSchedulingId(null)}
          onScheduled={handleScheduled}
        />
      )}
      {joiningInterview && (
        <InterviewRoom
          room={joiningInterview.interview_room}
          title={`Interview — ${joiningInterview.candidate_name}`}
          onClose={() => setJoiningInterview(null)}
        />
      )}
    </div>
  );
}

/* ── My Postings list ────────────────────────────────────────── */
function MyPostings({ onSelectJob, onPostNew }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState("");

  function load() {
    setLoading(true); setError("");
    myJobPostings().then(d => setJobs(d.jobs || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleToggleStatus(e, job) {
    e.stopPropagation(); // don't trigger onSelectJob on the parent card
    const nextStatus = job.status === "open" ? "closed" : "open";
    const confirmMsg = nextStatus === "closed"
      ? `Close "${job.title}" to new applicants? Candidates won't be able to see or apply to this listing anymore. Existing applications are unaffected.`
      : `Reopen "${job.title}" for applications?`;
    if (!window.confirm(confirmMsg)) return;

    setActionError("");
    setUpdatingId(job.id);
    try {
      const { job: updated } = await updateJobStatus(job.id, nextStatus);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: updated?.status || nextStatus } : j));
    } catch (err) {
      setActionError(err.message || "Couldn't update job status.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <Spinner text="Loading your postings…" />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div style={{
      maxWidth: 820, margin: "0 auto",
      background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
      borderRadius: "var(--pm-radius-lg)", boxShadow: "var(--pm-shadow-md)",
      padding: "26px 28px 30px", fontFamily: "var(--pm-font)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--ink)" }}>My Job Postings</h2>
        <button onClick={onPostNew} style={{
          padding: "9px 18px", borderRadius: 9, border: "none",
          background: "linear-gradient(135deg,var(--brass),#deba52)", color: "#16220f",
          fontWeight: "bold", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>+ Post New Job</button>
      </div>
      <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "var(--ink-muted)" }}>
        {jobs.length} active posting{jobs.length === 1 ? "" : "s"}
      </p>

      {actionError && <div style={{ marginBottom: 14 }}><ErrorNote message={actionError} /></div>}

      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--ink-faded)" }}>
          <ClipboardList size={34} strokeWidth={1.6} color="var(--ink-faded)" style={{ display:"block", margin:"0 auto 8px" }}/>
          <p>You haven't posted any jobs yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {jobs.map(job => {
            const isOpen = job.status === "open";
            const isUpdating = updatingId === job.id;
            return (
              <div key={job.id} onClick={() => onSelectJob(job)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectJob(job); }}
                style={{
                  textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  background: "var(--pm-surface-sunken)", border: "1px solid rgba(201,168,76,.14)",
                  borderRadius: 14, padding: "18px 22px",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap",
                }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: "bold", color: "var(--ink)" }}>{job.title}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>{job.location} · {job.employment_type.replace("_", " ")}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "var(--brass)", fontWeight: "bold" }}>
                    {job.application_count || 0} applicant{job.application_count === 1 ? "" : "s"}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: "bold", padding: "3px 10px", borderRadius: 6,
                    background: isOpen ? "rgba(45,110,66,.1)" : "var(--pm-surface-sunken)",
                    border: `1px solid ${isOpen ? "rgba(45,110,66,.3)" : "var(--pm-border)"}`,
                    color: isOpen ? "var(--forest2)" : "var(--ink-muted)",
                    textTransform: "uppercase", letterSpacing: ".04em",
                  }}>{job.status}</span>
                  <button
                    onClick={(e) => handleToggleStatus(e, job)}
                    disabled={isUpdating}
                    title={isOpen ? "Close this posting to new applicants" : "Reopen this posting"}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 7, fontFamily: "inherit",
                      fontSize: 11.5, fontWeight: "bold", cursor: isUpdating ? "default" : "pointer",
                      opacity: isUpdating ? 0.6 : 1,
                      background: isOpen ? "rgba(196,90,72,.08)" : "rgba(45,110,66,.08)",
                      border: `1px solid ${isOpen ? "rgba(196,90,72,.3)" : "rgba(45,110,66,.3)"}`,
                      color: isOpen ? "#b85f46" : "var(--forest2)",
                    }}>
                    {isOpen
                      ? <><Lock size={12} strokeWidth={2.4}/> {isUpdating ? "Closing…" : "Close"}</>
                      : <><Unlock size={12} strokeWidth={2.4}/> {isUpdating ? "Reopening…" : "Reopen"}</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Root ─────────────────────────────────────────────────────── */
export default function RecruiterJobs() {
  const [view, setView] = useState("myjobs"); // "myjobs" | "post" | "applicants"
  const [selectedJob, setSelectedJob] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (view === "post") {
    return <PostJobForm onPosted={() => { setView("myjobs"); setRefreshKey(k => k + 1); }} />;
  }
  if (view === "applicants" && selectedJob) {
    return <ApplicantsPanel job={selectedJob} onBack={() => setView("myjobs")} />;
  }
  return (
    <MyPostings
      key={refreshKey}
      onSelectJob={job => { setSelectedJob(job); setView("applicants"); }}
      onPostNew={() => setView("post")}
    />
  );
}

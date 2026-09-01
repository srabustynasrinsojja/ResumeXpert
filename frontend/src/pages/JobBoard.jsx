/**
 * JobBoard — candidate-facing job browsing + detail view.
 * Migrated onto the premium component system (components/premium.jsx):
 * PremiumCard, MatchPill, KeywordTag, RadialScore, SkeletonBlock.
 * Same functionality as before this migration — every API call, every
 * state transition, every handler is unchanged. Only the visual layer
 * moved from one-off inline styles to the shared token/component system.
 */
import { useEffect, useState, useCallback } from "react";
import { MapPin, Coins, Clock, ArrowRight, ArrowLeft, X, Users, ArrowUpDown, SearchX, Building2 } from "lucide-react";
import { browseJobs, getJob, applyToJob, candidateResumeVersions, previewJobMatch } from "../api/client";
import { ErrorNote } from "../components/ui";
import { PremiumCard, MatchPill, KeywordTag, RadialScore, SkeletonBlock, PremiumButton } from "../components/premium";
import { CompanyProfileModal } from "../components/CompanyProfile";

const EMPLOYMENT_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  remote: "Remote",
};

function formatSalary(min, max) {
  if (!min && !max) return null;
  if (min && max) return `৳${min.toLocaleString()} – ৳${max.toLocaleString()}`;
  return `৳${(min || max).toLocaleString()}+`;
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

const chipStyle = {
  fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--pm-radius-sm)",
  background: "var(--pm-accent-bg)", border: "1px solid var(--pm-border-strong)",
  color: "var(--pm-accent)", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: ".04em",
  fontFamily: "var(--pm-font)",
};
const metaRowStyle = { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--pm-text-secondary)", fontFamily: "var(--pm-font)" };

/* ── Job card (list view) ────────────────────────────────────── */
function JobCard({ job, onSelect }) {
  const salary = formatSalary(job.salary_min, job.salary_max);
  return (
    <button
      onClick={() => onSelect(job.id)}
      className="pm-card pm-card--interactive pm-focusable"
      style={{
        textAlign: "left", cursor: "pointer", fontFamily: "var(--pm-font)",
        padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10, width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--pm-text)" }}>
            {job.title}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--pm-accent)", fontWeight: 600 }}>
            {job.company_name}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={chipStyle}>{EMPLOYMENT_LABELS[job.employment_type] || job.employment_type}</span>
          {typeof job._match_score === "number" && job._match_score > 0 && (
            <MatchPill percent={job._match_score * 100} size="sm" />
          )}
        </div>
      </div>

      <div style={metaRowStyle}>
        <span><MapPin size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />{job.location}</span>
        {salary && <span><Coins size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />{salary}</span>}
        <span><Clock size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />{timeAgo(job.created_at)}</span>
      </div>

      <p style={{
        margin: 0, fontSize: 13, color: "var(--pm-text-secondary)", lineHeight: 1.6, fontFamily: "var(--pm-font)",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {job.description}
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "var(--pm-text-muted)", fontFamily: "var(--pm-font)" }}>
          {job.application_count || 0} applicant{job.application_count === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pm-accent)", fontFamily: "var(--pm-font)" }}>
          View details <ArrowRight size={13} strokeWidth={2.25} style={{ verticalAlign: -2 }} />
        </span>
      </div>
    </button>
  );
}

/** Skeleton matching JobCard's exact shape — used while the list loads,
 * so nothing visually jumps when real cards replace it. */
function JobCardSkeleton() {
  return (
    <PremiumCard style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonBlock width={180} height={16} />
          <SkeletonBlock width={110} height={12} />
        </div>
        <SkeletonBlock width={70} height={20} radius={6} />
      </div>
      <SkeletonBlock width="60%" height={12} />
      <SkeletonBlock width="90%" height={12} />
    </PremiumCard>
  );
}

/* ── Apply modal: resume picker, live match preview, cover note ── */
function ApplyModal({ job, onClose, onApplied }) {
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    candidateResumeVersions()
      .then(d => {
        const vs = d.versions || [];
        setVersions(vs);
        if (vs.length > 0) setVersionId(vs[vs.length - 1].id);
      })
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, []);

  const runPreview = useCallback((vid) => {
    setPreviewing(true); setPreviewError(""); setPreview(null);
    previewJobMatch(job.id, vid)
      .then(setPreview)
      .catch(e => setPreviewError(e.message))
      .finally(() => setPreviewing(false));
  }, [job.id]);

  useEffect(() => {
    if (versionId) runPreview(versionId);
  }, [versionId, runPreview]);

  async function handleSubmit() {
    setSubmitting(true); setSubmitError("");
    try {
      await applyToJob(job.id, { resumeVersionId: versionId, coverNote: coverNote.trim() || null });
      onApplied();
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: "var(--pm-radius-sm)",
    border: "1px solid var(--pm-border-strong)", background: "var(--pm-surface-sunken)",
    color: "var(--pm-text)", fontFamily: "var(--pm-font)", fontSize: 13,
  };
  const labelStyle = {
    fontSize: 11.5, fontWeight: 700, color: "var(--pm-text-secondary)",
    textTransform: "uppercase", letterSpacing: ".05em", fontFamily: "var(--pm-font)",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="pm-enter"
        style={{
          background: "var(--pm-surface)", border: "1px solid var(--pm-border)",
          boxShadow: "var(--pm-shadow-lg)",
          borderRadius: "var(--pm-radius-lg)", padding: "28px 30px", maxWidth: 480, width: "100%",
          maxHeight: "88vh", overflowY: "auto", fontFamily: "var(--pm-font)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--pm-text)" }}>Apply to {job.title}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--pm-accent)", fontWeight: 600 }}>{job.company_name}</p>
          </div>
          <button onClick={onClose} className="pm-focusable" style={{
            background: "none", border: "none", color: "var(--pm-text-muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1, borderRadius: 6, padding: 4,
          }}><X size={16} strokeWidth={2.25} /></button>
        </div>

        <div style={{ height: 1, background: "var(--pm-border)", margin: "16px 0 18px" }} />

        {loadingVersions ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonBlock height={14} width="40%" />
            <SkeletonBlock height={36} />
          </div>
        ) : versions.length === 0 ? (
          <ErrorNote message="No saved resume found on your account. Build or upload a resume first, then come back to apply." />
        ) : (
          <>
            <label style={labelStyle}>Apply with resume version</label>
            <select
              value={versionId || ""} onChange={e => setVersionId(e.target.value)}
              className="pm-focusable" style={inputStyle}
            >
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  v{v.version_number}{v.label ? ` — ${v.label}` : ""}{v.resume_quality_score ? ` (Quality ${v.resume_quality_score.toFixed(0)})` : ""}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 18 }}>
              {previewing && (
                <PremiumCard style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 18px" }}>
                  <SkeletonBlock width={72} height={72} radius={999} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <SkeletonBlock width="70%" height={13} />
                    <SkeletonBlock width="50%" height={11} />
                  </div>
                </PremiumCard>
              )}
              {!previewing && previewError && <ErrorNote message={previewError} />}
              {!previewing && preview && (
                <PremiumCard className="pm-enter" style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 18px" }}>
                  <RadialScore score={preview.job_match_score} size={72} stroke={7} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--pm-text)" }}>Job match score</p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--pm-text-secondary)" }}>
                      Combined score: {preview.combined_score?.toFixed(0)}
                    </p>
                    {preview.missing_required_skills?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {preview.missing_required_skills.slice(0, 4).map((s, i) => (
                          <KeywordTag key={i} text={s} found={false} />
                        ))}
                      </div>
                    )}
                  </div>
                </PremiumCard>
              )}
            </div>

            <label style={{ ...labelStyle, display: "block", marginTop: 18 }}>Cover note (optional)</label>
            <textarea
              value={coverNote} onChange={e => setCoverNote(e.target.value)}
              rows={3} maxLength={2000}
              placeholder="Briefly say why you're a fit…"
              className="pm-focusable"
              style={{ ...inputStyle, resize: "vertical" }}
            />

            {submitError && <ErrorNote message={submitError} />}

            <PremiumButton
              variant="primary" onClick={handleSubmit} disabled={submitting}
              style={{ width: "100%", marginTop: 18, padding: "13px 0", fontSize: 14 }}
            >
              {submitting ? "Submitting…" : "Submit application"}
            </PremiumButton>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Job detail view ─────────────────────────────────────────── */
function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [applied, setApplied] = useState(false);
  const [showCompany, setShowCompany] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setJob(null); setApplied(false);
    getJob(jobId)
      .then(d => { if (!cancelled) setJob(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PremiumCard style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          <SkeletonBlock width="50%" height={22} />
          <SkeletonBlock width="30%" height={14} />
          <div style={{ display: "flex", gap: 8 }}>
            <SkeletonBlock width={80} height={22} radius={999} />
            <SkeletonBlock width={90} height={22} radius={999} />
          </div>
          <SkeletonBlock height={100} />
        </PremiumCard>
      </div>
    );
  }
  if (error) return <ErrorNote message={error} />;
  if (!job) return null;

  const salary = formatSalary(job.salary_min, job.salary_max);
  const skills = job.parsed_job?.required_skills || job.parsed_job?.all_skills || [];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", fontFamily: "var(--pm-font)" }}>
      <button onClick={onBack} className="pm-focusable" style={{
        background: "none", border: "none", color: "var(--pm-accent)", cursor: "pointer",
        fontFamily: "inherit", fontSize: 13, fontWeight: 700, marginBottom: 18, padding: 0,
        display: "flex", alignItems: "center", gap: 4,
      }}><ArrowLeft size={14} strokeWidth={2.25} style={{ verticalAlign: -2 }} /> Back to jobs</button>

      <PremiumCard className="pm-enter" style={{ padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--pm-text)" }}>{job.title}</h2>
            <button onClick={() => setShowCompany(true)} className="pm-focusable" style={{
              display: "inline-flex", alignItems: "center", gap: 6, margin: "6px 0 0", padding: 0,
              background: "none", border: "none", cursor: "pointer",
              fontSize: 15, color: "var(--pm-accent)", fontWeight: 600, fontFamily: "inherit",
            }}><Building2 size={14} strokeWidth={2.25} />{job.company_name}</button>
          </div>
          <span style={chipStyle}>{EMPLOYMENT_LABELS[job.employment_type] || job.employment_type}</span>
        </div>

        <div style={{ ...metaRowStyle, margin: "16px 0", gap: 18 }}>
          <span><MapPin size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />{job.location}</span>
          {salary && <span><Coins size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />{salary}</span>}
          <span><Clock size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />Posted {timeAgo(job.created_at)}</span>
          <span><Users size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />{job.application_count || 0} applicant{job.application_count === 1 ? "" : "s"}</span>
        </div>

        {skills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {skills.slice(0, 12).map((s, i) => <KeywordTag key={i} text={s} found />)}
          </div>
        )}

        <div style={{ height: 1, background: "var(--pm-border)", margin: "8px 0 20px" }} />

        <h4 style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--pm-text-secondary)", fontWeight: 700, marginBottom: 10 }}>
          Job description
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: "var(--pm-text-secondary)", whiteSpace: "pre-wrap" }}>
          {job.description}
        </p>

        <div style={{ marginTop: 26 }}>
          <PremiumButton
            variant={applied ? "ghost" : "primary"}
            onClick={() => setShowApply(true)}
            disabled={applied || job.status !== "open"}
            style={{ width: "100%", padding: "14px 0", fontSize: 15 }}
          >
            {applied ? "✓ Applied" : job.status !== "open" ? "Applications Closed" : "Apply now"}
          </PremiumButton>
          {applied && (
            <p style={{ marginTop: 10, fontSize: 13, textAlign: "center", color: "var(--pm-success)" }}>
              Application submitted! Track it under My Applications.
            </p>
          )}
          {!applied && job.status !== "open" && (
            <p style={{ marginTop: 10, fontSize: 13, textAlign: "center", color: "var(--pm-text-secondary)" }}>
              This employer is no longer accepting applications for this role.
            </p>
          )}
        </div>
      </PremiumCard>

      {showApply && (
        <ApplyModal
          job={job}
          onClose={() => setShowApply(false)}
          onApplied={() => { setShowApply(false); setApplied(true); }}
        />
      )}
      {showCompany && (
        <CompanyProfileModal recruiterId={job.recruiter_id} onClose={() => setShowCompany(false)} />
      )}
    </div>
  );
}

/* ── Root JobBoard ───────────────────────────────────────────── */
export default function JobBoard() {
  const [view, setView] = useState("list");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [personalized, setPersonalized] = useState(false);

  const load = useCallback((s = search, l = location) => {
    setLoading(true); setError("");
    browseJobs(s, l)
      .then(d => { setJobs(d.jobs || []); setPersonalized(!!d.personalized); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, location]);

  useEffect(() => { load("", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchSubmit(e) {
    e.preventDefault();
    load(search, location);
  }

  if (view === "detail") {
    return <JobDetail jobId={selectedJobId} onBack={() => setView("list")} />;
  }

  const inputStyle = {
    padding: "12px 16px", borderRadius: "var(--pm-radius-sm)",
    border: "1px solid var(--pm-border-strong)", background: "var(--pm-surface-sunken)",
    color: "var(--pm-text)", fontFamily: "var(--pm-font)", fontSize: 13,
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "var(--pm-font)" }}>
      <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search job title (e.g. Backend Developer)"
          className="pm-focusable" style={{ ...inputStyle, flex: "2 1 240px" }}
        />
        <input
          value={location} onChange={e => setLocation(e.target.value)}
          placeholder="Location (e.g. Dhaka, Remote)"
          className="pm-focusable" style={{ ...inputStyle, flex: "1 1 180px" }}
        />
        <PremiumButton type="submit" variant="primary" style={{ padding: "0 24px" }}>Search</PremiumButton>
      </form>

      {loading && (
        <div style={{ display: "grid", gap: 16 }}>
          {[0, 1, 2].map(i => <JobCardSkeleton key={i} />)}
        </div>
      )}
      {!loading && !error && personalized && jobs.length > 0 && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: 600, color: "var(--brass)",
          background: "rgba(201,168,76,.1)", border: "1px solid rgba(201,168,76,.22)",
          borderRadius: 999, padding: "6px 14px", marginBottom: 16,
          fontFamily: "var(--pm-font)",
        }}>
          <ArrowUpDown size={13} strokeWidth={2}/>
          Sorted by how well each job matches your resume
        </div>
      )}
      {!loading && error && <ErrorNote message={error} />}
      {!loading && !error && jobs.length === 0 && (
        <div style={{
          textAlign: "center", padding: "56px 24px", fontFamily: "var(--pm-font)",
          background: "rgba(255,255,255,.5)", border: "1px solid rgba(90,64,32,.14)",
          borderRadius: "var(--pm-radius-lg)", color: "var(--ink-soft)",
        }}>
          <SearchX size={30} strokeWidth={1.6} color="var(--ink-faded)" style={{ display: "block", margin: "0 auto 12px" }} />
          <p style={{ margin: 0 }}>No open jobs match your search yet. Try a broader search, or check back soon.</p>
        </div>
      )}
      {!loading && !error && jobs.length > 0 && (
        <div style={{ display: "grid", gap: 16 }}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onSelect={id => { setSelectedJobId(id); setView("detail"); }} />
          ))}
        </div>
      )}
    </div>
  );
}

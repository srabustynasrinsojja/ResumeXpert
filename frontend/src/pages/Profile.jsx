/**
 * Profile — "My Profile" dashboard for both roles, LinkedIn/bdjobs-style.
 * Candidates see their resume summary + application stats.
 * Recruiters see company info + posting/hiring stats.
 *
 * ResumeSummaryView is exported separately so the recruiter's "View applicant
 * profile" panel (RecruiterJobs.jsx) can render the exact same resume layout
 * without duplicating the skills/experience/education markup.
 */
import { useEffect, useRef, useState } from "react";
import { Mail, Phone, MapPin, Camera, FileText, Upload, UploadCloud, Folder, X, Download, Trash2, Image as ImageIcon, History, RotateCcw, CheckCircle2 } from "lucide-react";
import { getMyProfile, updateMyProfile, uploadAvatar, deleteAvatar, listDocuments, uploadDocument, deleteDocument, downloadOwnDocument, uploadCompanyPhoto, deleteCompanyPhoto, candidateResumeVersions, restoreResumeVersion } from "../api/client";
import { Spinner, ErrorNote } from "../components/ui";
import { CompanyDetailsView } from "../components/CompanyProfile";

const cardStyle = {
  background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
  borderRadius: 16, padding: "24px 28px", boxShadow: "var(--pm-shadow-md)",
  fontFamily: "var(--pm-font)",
};
const sectionTitle = {
  fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em",
  color: "rgba(201,168,76,.7)", marginBottom: 12, fontWeight: "bold",
};
const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid rgba(201,168,76,.25)", background: "rgba(12,18,8,.55)",
  color: "rgba(232,223,200,.95)", fontFamily: "inherit", fontSize: 13,
};

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
}

function AvatarUpload({ avatar, name, onChanged }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  async function handlePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadAvatar(file);
      onChanged(res.avatar);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      await deleteAvatar();
      onChanged(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => !busy && fileRef.current.click()}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 64, height: 64, borderRadius: "50%", flexShrink: 0, position: "relative",
        cursor: busy ? "default" : "pointer", overflow: "hidden",
        background: avatar ? undefined : "linear-gradient(135deg,#c9a84c,#deba52)",
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePick} />
      {avatar ? (
        <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#1a1208", fontWeight: "bold", fontSize: 22,
        }}>{initials(name)}</div>
      )}
      {(hover || busy) && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,.55)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        }}>
          {busy ? (
            <span style={{ color: "#fff", fontSize: 10 }}>…</span>
          ) : (
            <>
              <Camera size={16} strokeWidth={2.25} color="#fff" />
              {avatar && (
                <button onClick={handleRemove} title="Remove photo" style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  display: "flex", position: "absolute", right: 4, bottom: 4,
                }}><X size={12} strokeWidth={3} color="#f09a72" /></button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Candidate document shelf — résumé lives elsewhere; this is for
   certificates, cover letters, portfolios, transcripts, etc. ── */
function DocumentsCard({ documents, onChanged }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const res = await uploadDocument(file);
      onChanged(res.documents);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }
  function handlePick(e) { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }
  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    if (documents.length >= 5 || uploading) return;
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function handleDelete(docId) {
    try {
      const res = await deleteDocument(docId);
      onChanged(res.documents);
    } catch (err) {
      alert(err.message);
    }
  }

  function prettySize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const full = documents.length >= 5;

  return (
    <section style={{
      position: "relative", overflow: "hidden",
      background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
      borderRadius: 18, padding: "28px 30px 30px", boxShadow: "var(--pm-shadow-md)",
      fontFamily: "var(--pm-font)",
    }}>
      <span style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 4,
        background: "linear-gradient(90deg,#b5860d,#deba52 45%,#b5860d)",
      }} />
      <p style={{
        margin: "0 0 10px", fontSize: 11, fontWeight: "bold", color: "var(--brass)",
        textTransform: "uppercase", letterSpacing: ".1em",
      }}>Candidate Files</p>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{
            width: 50, height: 50, borderRadius: 13, flexShrink: 0,
            background: "rgba(181,134,13,.1)", border: "1px solid rgba(181,134,13,.28)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Folder size={23} strokeWidth={2} color="var(--brass)" /></span>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: "bold", color: "var(--ink)" }}>Documents</h3>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>
              Certificates, cover letters, portfolios — separate from your résumé
            </p>
          </div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 12, fontWeight: "bold", padding: "6px 13px", borderRadius: 999,
          background: full ? "rgba(192,74,48,.1)" : "var(--pm-surface-sunken)",
          border: `1px solid ${full ? "rgba(192,74,48,.28)" : "var(--pm-border)"}`,
          color: full ? "#c04a30" : "var(--ink-muted)",
        }}>{documents.length} / 5</span>
      </div>

      <input ref={fileRef} type="file" style={{ display: "none" }}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handlePick} />
      <div
        onClick={() => !full && !uploading && fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); if (!full && !uploading) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          padding: "18px 20px", borderRadius: 13, marginBottom: 16,
          border: `1.5px dashed ${dragOver ? "var(--brass)" : "var(--pm-border-strong)"}`,
          background: dragOver ? "rgba(181,134,13,.07)" : "var(--pm-surface-sunken)",
          cursor: full || uploading ? "default" : "pointer",
          opacity: full ? .55 : 1, transition: "all .15s ease",
        }}>
        <UploadCloud size={19} strokeWidth={2} color="var(--brass)" style={{ flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: "bold", color: "var(--ink)" }}>
            {uploading ? "Uploading…" : full ? "Document limit reached" : "Drop a file here, or click to browse"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-faded)" }}>PDF, DOC, DOCX, JPG, PNG · up to 3MB each</p>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#c04a30", marginBottom: 14 }}>{error}</div>}

      {documents.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 10px" }}>
          <FileText size={26} strokeWidth={1.6} color="var(--ink-faded)" style={{ display: "block", margin: "0 auto 8px" }} />
          <p style={{ fontSize: 12.5, color: "var(--ink-faded)", fontStyle: "italic", margin: 0 }}>No documents uploaded yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {documents.map(doc => (
            <div key={doc.id} style={{
              display: "flex", alignItems: "center", gap: 11, padding: "11px 13px",
              background: "var(--pm-surface-sunken)", border: "1px solid var(--pm-border)", borderRadius: 11,
            }}>
              <span style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: "rgba(181,134,13,.1)", display: "flex", alignItems: "center", justifyContent: "center",
              }}><FileText size={16} strokeWidth={2} color="var(--brass)" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: "bold", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</p>
                <p style={{ margin: 0, fontSize: 10.5, color: "var(--ink-faded)" }}>{prettySize(doc.size)}</p>
              </div>
              <button onClick={() => downloadOwnDocument(doc.id, doc.filename).catch(e => alert(e.message))} title="Download" style={{
                background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", display: "flex", flexShrink: 0,
              }}><Download size={14} strokeWidth={2.25} /></button>
              <button onClick={() => handleDelete(doc.id)} title="Remove" style={{
                background: "none", border: "none", cursor: "pointer", color: "#c04a30", display: "flex", flexShrink: 0,
              }}><Trash2 size={14} strokeWidth={2.25} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Candidate-only: full résumé version history with restore.
   Every save (CV Builder, upload, or a Tailor for Job upgrade) adds a NEW
   version rather than overwriting anything — this is where the candidate
   can see all of them and go back to an older one at any time. Restoring
   doesn't delete newer versions; it adds a fresh copy of the old content
   on top, so nothing is ever permanently lost either way. ── */
function ResumeVersionsCard({ versions, activeId, onRestored }) {
  const [restoringId, setRestoringId] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function handleRestore(versionId) {
    setRestoringId(versionId); setError("");
    try {
      const res = await restoreResumeVersion(versionId);
      onRestored(res.version);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoringId(null);
    }
  }

  function sourceLabel(sourceType) {
    if (sourceType === "tailored") return "Tailored";
    if (sourceType === "restored") return "Restored";
    if (sourceType === "built") return "Built";
    return "Uploaded";
  }

  const visible = expanded ? versions : versions.slice(0, 4);

  return (
    <section style={{
      background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
      borderRadius: 18, padding: "26px 28px", boxShadow: "var(--pm-shadow-md)",
      fontFamily: "var(--pm-font)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 18 }}>
        <span style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "rgba(181,134,13,.1)", border: "1px solid rgba(181,134,13,.28)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><History size={21} strokeWidth={2} color="var(--brass)" /></span>
        <div>
          <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: "bold", color: "var(--ink)" }}>Résumé Versions</h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
            Every upload, build, or tailored upgrade — go back to any of them, anytime
          </p>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#c04a30", marginBottom: 14 }}>{error}</div>}

      {versions.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-faded)", fontStyle: "italic" }}>No résumé versions yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map(v => {
              const isActive = v.id === activeId;
              return (
                <div key={v.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                  background: isActive ? "rgba(181,134,13,.06)" : "var(--pm-surface-sunken)",
                  border: `1px solid ${isActive ? "rgba(181,134,13,.3)" : "var(--pm-border)"}`,
                  borderRadius: 11,
                }}>
                  <span style={{
                    flexShrink: 0, width: 34, height: 34, borderRadius: 9,
                    background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11.5, fontWeight: "bold", color: "var(--ink-muted)",
                  }}>v{v.version_number}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: "bold", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.label || sourceLabel(v.source_type)}
                    </p>
                    <p style={{ margin: 0, fontSize: 10.5, color: "var(--ink-faded)" }}>
                      {sourceLabel(v.source_type)} · {v.created_at ? new Date(v.created_at).toLocaleDateString() : ""}
                      {v.resume_quality_score != null && <> · Score {Math.round(v.resume_quality_score)}</>}
                    </p>
                  </div>
                  {isActive ? (
                    <span style={{
                      flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                      fontSize: 11, fontWeight: "bold", color: "var(--forest2)",
                    }}><CheckCircle2 size={13} strokeWidth={2.25} /> Active</span>
                  ) : (
                    <button onClick={() => handleRestore(v.id)} disabled={restoringId === v.id}
                      style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 8, border: "1px solid var(--pm-border-strong)",
                        background: "transparent", color: "var(--ink-soft)", fontSize: 11.5, fontWeight: "bold",
                        cursor: restoringId === v.id ? "default" : "pointer", fontFamily: "inherit",
                      }}>
                      <RotateCcw size={12} strokeWidth={2.25} />
                      {restoringId === v.id ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {versions.length > 4 && (
            <button onClick={() => setExpanded(e => !e)} style={{
              marginTop: 12, background: "none", border: "none", cursor: "pointer",
              color: "var(--brass)", fontSize: 12, fontWeight: "bold", fontFamily: "inherit", padding: 0,
            }}>{expanded ? "Show fewer" : `Show all ${versions.length} versions`}</button>
          )}
        </>
      )}
    </section>
  );
}

/* ── Recruiter-only: company photo gallery, shown on the public
   company page a candidate can open from a job listing. ── */
function CompanyPhotosCard({ photos, onChanged }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handlePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setError("");
    try {
      const res = await uploadCompanyPhoto(file);
      onChanged(res.photos);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photoId) {
    try {
      const res = await deleteCompanyPhoto(photoId);
      onChanged(res.photos);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...sectionTitle, marginBottom: 0 }}>Company Photos</p>
        <button onClick={() => fileRef.current.click()} disabled={uploading || photos.length >= 6} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(201,168,76,.3)",
          background: "transparent", color: "#c9a84c", fontSize: 12, fontWeight: "bold",
          cursor: (uploading || photos.length >= 6) ? "default" : "pointer", fontFamily: "inherit",
          opacity: (uploading || photos.length >= 6) ? .5 : 1,
        }}><Upload size={13} strokeWidth={2.25} /> {uploading ? "Uploading…" : "Upload"}</button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePick} />
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "-6px 0 14px" }}>
        Office photos, team shots, culture — up to 6 images, 2MB each. Visible to candidates on your job listings.
      </p>
      {error && <div style={{ fontSize: 12, color: "#c04a30", marginBottom: 10 }}>{error}</div>}
      {photos.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-faded)", fontStyle: "italic" }}>No photos uploaded yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
          {photos.map(p => (
            <div key={p.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid var(--pm-border)" }}>
              <img src={p.data_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => handleDelete(p.id)} title="Remove" style={{
                position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: "50%",
                background: "rgba(0,0,0,.55)", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><X size={12} strokeWidth={2.5} color="#fff" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
      borderRadius: 12, padding: "14px 18px", textAlign: "center",
      fontFamily: "var(--pm-font)",
    }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: "bold", color: accent ? "#c9a84c" : "var(--ink)" }}>
        {value}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </p>
    </div>
  );
}

function TagRow({ items, tone = "green" }) {
  if (!items || items.length === 0) return null;
  const colors = tone === "green"
    ? { bg: "rgba(45,110,66,.1)", border: "rgba(45,110,66,.3)", text: "var(--forest2)" }
    : { bg: "rgba(181,134,13,.1)", border: "rgba(181,134,13,.3)", text: "var(--brass)" };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((s, i) => (
        <span key={i} style={{
          fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
          background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
        }}>{s}</span>
      ))}
    </div>
  );
}

/* ── Shared: renders a ParsedResume object (skills/experience/education/etc) ── */
export function ResumeSummaryView({ resume }) {
  if (!resume) {
    return (
      <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--ink-faded)" }}>
        <p>No resume on file yet.</p>
      </div>
    );
  }
  const skills = resume.skills || {};
  const hasSkills = (skills.technical?.length || skills.tools?.length || skills.soft?.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {resume.summary && (
        <div>
          <h4 style={sectionTitle}>Summary</h4>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--ink-soft)" }}>{resume.summary}</p>
        </div>
      )}

      {hasSkills > 0 && (
        <div>
          <h4 style={sectionTitle}>Skills</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TagRow items={skills.technical} tone="green" />
            <TagRow items={skills.tools} tone="brass" />
            <TagRow items={skills.soft} tone="brass" />
          </div>
        </div>
      )}

      {resume.experience?.length > 0 && (
        <div>
          <h4 style={sectionTitle}>Experience</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {resume.experience.map((e, i) => (
              <div key={i}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: "bold", color: "var(--ink)" }}>
                  {e.job_title}{e.company ? ` · ${e.company}` : ""}
                </p>
                <p style={{ margin: "2px 0 6px", fontSize: 11, color: "var(--ink-muted)" }}>
                  {e.start_date || ""}{e.end_date ? ` – ${e.end_date}` : ""}
                </p>
                {e.responsibilities?.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.7 }}>
                    {e.responsibilities.slice(0, 4).map((r, j) => <li key={j}>{r}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {resume.education?.length > 0 && (
        <div>
          <h4 style={sectionTitle}>Education</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resume.education.map((ed, i) => (
              <div key={i}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: "bold", color: "var(--ink)" }}>{ed.degree}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                  {ed.institution}{ed.grade ? ` · ${ed.grade}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {resume.projects?.length > 0 && (
        <div>
          <h4 style={sectionTitle}>Projects</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {resume.projects.map((p, i) => (
              <div key={i}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: "bold", color: "var(--ink)" }}>{p.name}</p>
                {p.description && <p style={{ margin: "2px 0 4px", fontSize: 12, color: "var(--ink-muted)" }}>{p.description}</p>}
                <TagRow items={p.technologies} tone="brass" />
              </div>
            ))}
          </div>
        </div>
      )}

      {resume.certifications?.length > 0 && (
        <div>
          <h4 style={sectionTitle}>Certifications</h4>
          <TagRow items={resume.certifications.map(c => c.name).filter(Boolean)} tone="brass" />
        </div>
      )}
    </div>
  );
}

/* ── Edit modal for editable profile fields ──────────────────────── */
function EditProfileModal({ profile, isRecruiter, onClose, onSaved }) {
  const [form, setForm] = useState({
    headline: profile.headline || "",
    phone: profile.phone || "",
    location: profile.location || "",
    bio: profile.bio || "",
    company_name: profile.company_name || "",
    company_website: profile.company_website || "",
    company_facebook: profile.company_facebook || "",
    company_linkedin: profile.company_linkedin || "",
    company_twitter: profile.company_twitter || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true); setError("");
    try {
      const res = await updateMyProfile(form);
      onSaved(res.profile);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#171008", border: "1px solid rgba(201,168,76,.25)",
        borderRadius: 18, padding: "26px 30px", maxWidth: 440, width: "100%",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 17, color: "rgba(232,220,168,.95)" }}>Edit profile</h3>

        {!isRecruiter && (
          <>
            <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>Headline</label>
            <input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
              placeholder="e.g. Backend Developer | Python & FastAPI" style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />
          </>
        )}
        {isRecruiter && (
          <>
            <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>Company name</label>
            <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />
          </>
        )}

        <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>Phone</label>
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />

        <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>
          {isRecruiter ? "Location (used for the map on your listings)" : "Location"}
        </label>
        <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          placeholder={isRecruiter ? "e.g. Gulshan 2, Dhaka, Bangladesh" : undefined}
          style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />

        <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>
          {isRecruiter ? "About the company" : "About you"}
        </label>
        <textarea rows={3} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
          style={{ ...inputStyle, marginTop: 6, marginBottom: isRecruiter ? 16 : 16, resize: "vertical" }} />

        {isRecruiter && (
          <>
            <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>Website</label>
            <input value={form.company_website} onChange={e => setForm(f => ({ ...f, company_website: e.target.value }))}
              placeholder="e.g. company.com" style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />

            <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>Facebook</label>
            <input value={form.company_facebook} onChange={e => setForm(f => ({ ...f, company_facebook: e.target.value }))}
              placeholder="e.g. facebook.com/yourcompany" style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />

            <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>LinkedIn</label>
            <input value={form.company_linkedin} onChange={e => setForm(f => ({ ...f, company_linkedin: e.target.value }))}
              placeholder="e.g. linkedin.com/company/yourcompany" style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }} />

            <label style={{ fontSize: 11, color: "rgba(201,168,76,.7)", fontWeight: "bold" }}>Twitter / X</label>
            <input value={form.company_twitter} onChange={e => setForm(f => ({ ...f, company_twitter: e.target.value }))}
              placeholder="e.g. twitter.com/yourcompany" style={{ ...inputStyle, marginTop: 6, marginBottom: 16 }} />
          </>
        )}
        {error && <ErrorNote message={error} />}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid rgba(201,168,76,.3)",
            background: "transparent", color: "rgba(232,220,168,.7)", fontFamily: "inherit", fontSize: 13, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg,#c9a84c,#deba52)", color: "#1a1208",
            fontWeight: "bold", fontSize: 13, cursor: saving ? "default" : "pointer", fontFamily: "inherit",
          }}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [companyPhotos, setCompanyPhotos] = useState([]);
  const [versions, setVersions] = useState([]);

  function load() {
    setLoading(true); setError("");
    getMyProfile().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function loadVersions() {
    candidateResumeVersions().then(d => setVersions(d.versions || [])).catch(() => {});
  }

  useEffect(() => {
    if (data?.profile?.role === "candidate") {
      listDocuments().then(d => setDocuments(d.documents || [])).catch(() => {});
      loadVersions();
    }
    if (data?.profile?.role === "recruiter") {
      setCompanyPhotos(data.profile.company_photos || []);
    }
  }, [data?.profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner text="Loading your profile…" />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const { profile, stats } = data;
  const isRecruiter = profile.role === "recruiter";
  const resume = data.resume_summary;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header card */}
      <div style={{ ...cardStyle, display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <AvatarUpload
          avatar={profile.avatar}
          name={profile.full_name}
          onChanged={avatar => setData(d => ({ ...d, profile: { ...d.profile, avatar } }))}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, color: "var(--ink)" }}>{profile.full_name || "Unnamed user"}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#c9a84c", fontWeight: "bold" }}>
                {isRecruiter ? (profile.company_name || "Recruiter") : (profile.headline || "Candidate")}
              </p>
            </div>
            <button onClick={() => setEditing(true)} style={{
              padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(201,168,76,.3)",
              background: "transparent", color: "#c9a84c", fontSize: 12, fontWeight: "bold",
              cursor: "pointer", fontFamily: "inherit",
            }}>Edit profile</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, fontSize: 12, color: "var(--ink-muted)" }}>
            <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><Mail size={12} strokeWidth={2.25}/> {profile.email}</span>
            {profile.phone && <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><Phone size={12} strokeWidth={2.25}/> {profile.phone}</span>}
            {profile.location && <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><MapPin size={12} strokeWidth={2.25}/> {profile.location}</span>}
          </div>
          {profile.bio && (
            <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)" }}>{profile.bio}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {isRecruiter ? (
          <>
            <StatCard label="Job postings" value={stats.total_postings} />
            <StatCard label="Open postings" value={stats.open_postings} accent />
            <StatCard label="Total applicants" value={stats.total_applicants} />
            <StatCard label="Interviewing" value={stats.interview_scheduled_count} accent />
            <StatCard label="Hired" value={stats.hired_count} accent />
          </>
        ) : (
          <>
            <StatCard label="Applications" value={stats.total_applications} />
            <StatCard label="Interviewing" value={stats.interview_scheduled} accent />
            <StatCard label="Hired" value={stats.hired} accent />
            <StatCard label="Resume quality" value={data.resume_quality_score ? Math.round(data.resume_quality_score) : "—"} accent />
          </>
        )}
      </div>

      {/* Resume summary — candidates only */}
      {!isRecruiter && (
        <div style={cardStyle}>
          <ResumeSummaryView resume={resume} />
        </div>
      )}

      {!isRecruiter && (
        <DocumentsCard documents={documents} onChanged={setDocuments} />
      )}

      {!isRecruiter && (
        <ResumeVersionsCard
          versions={[...versions].reverse()}
          activeId={versions.length > 0 ? versions[versions.length - 1].id : null}
          onRestored={() => loadVersions()}
        />
      )}

      {isRecruiter && (
        <div style={cardStyle}>
          <p style={sectionTitle}>Company Details</p>
          <CompanyDetailsView company={{
            description: profile.bio,
            location: profile.location,
            website: profile.company_website,
            facebook: profile.company_facebook,
            linkedin: profile.company_linkedin,
            twitter: profile.company_twitter,
            photos: companyPhotos.map(p => p.data_url),
            verified: profile.company_verified,
          }} />
          {!profile.bio && !profile.company_website && !profile.company_facebook &&
           !profile.company_linkedin && !profile.company_twitter && companyPhotos.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--ink-faded)", fontStyle: "italic" }}>
              Add a description, website, or social links via "Edit profile" — candidates see this on your job listings.
            </p>
          )}
        </div>
      )}

      {isRecruiter && (
        <CompanyPhotosCard photos={companyPhotos} onChanged={setCompanyPhotos} />
      )}

      {editing && (
        <EditProfileModal
          profile={profile}
          isRecruiter={isRecruiter}
          onClose={() => setEditing(false)}
          onSaved={updated => { setData(d => ({ ...d, profile: updated })); setEditing(false); }}
        />
      )}
    </div>
  );
}

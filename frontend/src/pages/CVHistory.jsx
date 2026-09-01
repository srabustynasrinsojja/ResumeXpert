import { useState, useEffect, useRef } from "react";
import { FileText, FolderOpen, Lightbulb, ClipboardList } from "lucide-react";
import { candidateParseUpload, candidateVersionHistory, candidateVersionCompare } from "../api/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function authHeaders(json = false) {
  const t = localStorage.getItem("ats_token");
  const h = t ? { Authorization: `Bearer ${t}` } : {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/* ── Mini score ring ── */
function ScoreRing({ score, size = 64, stroke = 7 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const color = pct >= 70 ? "var(--forest2)" : pct >= 45 ? "var(--brass2)" : "var(--burgundy2)";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--parchment3)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ - (pct/100)*circ} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ transform:"rotate(90deg)", transformOrigin:"center", fontSize:size*0.22, fontWeight:"bold", fill:color, font:"inherit" }}>
        {pct.toFixed(0)}
      </text>
    </svg>
  );
}

/* ── Delta badge ── */
function DeltaBadge({ delta }) {
  if (delta == null) return null;
  const pos = delta >= 0;
  return (
    <span style={{
      fontSize: 12, fontWeight: "bold", padding: "3px 10px", borderRadius: 99,
      background: pos ? "rgba(45,110,66,.15)" : "rgba(122,27,46,.15)",
      color: pos ? "var(--forest2)" : "var(--burgundy2)",
      border: `1px solid ${pos ? "rgba(45,110,66,.25)" : "rgba(122,27,46,.25)"}`,
    }}>
      {pos ? "+" : ""}{delta.toFixed(1)} pts
    </span>
  );
}

/* ── Section pill ── */
function SectionPill({ label, added }) {
  return (
    <span style={{
      fontSize: 11, padding: "2px 9px", borderRadius: 6, fontWeight: "bold",
      background: added ? "rgba(45,110,66,.12)" : "rgba(201,168,76,.1)",
      color: added ? "var(--forest2)" : "var(--brass2)",
      border: `1px solid ${added ? "rgba(45,110,66,.2)" : "rgba(201,168,76,.18)"}`,
    }}>
      {added ? "+ " : "~ "}{label.replace(/_/g, " ")}
    </span>
  );
}

/* ── File drop zone ── */
function DropZone({ file, onChange, label }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  return (
    <div
      className={`v-drop ${drag ? "over" : ""} ${file ? "filled" : ""}`}
      style={{ minHeight: 100 }}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onChange(f); }}
      onClick={() => ref.current.click()}>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }}
        onChange={e => onChange(e.target.files?.[0] || null)}/>
      {file ? (
        <div className="v-drop-file">
          <span className="v-drop-file-ico"><FileText size={26} strokeWidth={1.75} color="var(--brass)"/></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="v-drop-name">{file.name}</p>
            <p className="v-drop-size">{(file.size/1024).toFixed(1)} KB</p>
          </div>
          <button className="v-drop-remove" onClick={e => { e.stopPropagation(); onChange(null); }}>✕</button>
        </div>
      ) : (
        <div className="v-drop-empty">
          <span className="v-drop-icon"><FolderOpen size={30} strokeWidth={1.6} color="var(--ink-faded)"/></span>
          <p className="v-drop-title">{label}</p>
          <p className="v-drop-hint">PDF · DOC · DOCX</p>
        </div>
      )}
    </div>
  );
}

/* ── Compare result panel ── */
function ComparePanel({ diff, oldScore, newScore, onClose }) {
  if (!diff) return null;
  const delta = diff.score_delta;

  return (
    <div className="results-wrap" style={{ marginTop: 20 }}>
      <div className="results-tab-bar">
        <span className="results-tab-label">◈ Version Comparison Result</span>
        <button className="stamp-btn secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={onClose}>✕</button>
      </div>
      <div className="result-section">

        {/* Score delta hero */}
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ textAlign: "center" }}>
            <ScoreRing score={oldScore} size={80} stroke={8}/>
            <p style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>Previous</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 24, color: "var(--brass)" }}>→</span>
            <DeltaBadge delta={delta}/>
          </div>
          <div style={{ textAlign: "center" }}>
            <ScoreRing score={newScore} size={80} stroke={8}/>
            <p style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>New</p>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", color: "var(--ink)", marginBottom: 6 }}>
              {delta > 0 ? "✦ Resume Improved!" : delta < 0 ? "⚠ Score Dropped" : "◈ No Score Change"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65 }}>
              {delta > 0
                ? "Your new version scores higher. The improvements below show what changed."
                : delta < 0
                ? "Your new version scores lower. Review the changes below to understand why."
                : "Score is the same but content may have changed."}
            </p>
          </div>
        </div>

        {/* Improvement highlights */}
        {diff.improvement_highlights?.length > 0 && (
          <div className="vcard" style={{ marginBottom: 14 }}>
            <h4 className="card-h">✦ What Changed</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {diff.improvement_highlights.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--brass2)", flexShrink: 0, marginTop: 2 }}>◈</span>
                  <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, margin: 0 }}>{h}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills diff */}
        <div className="two-col" style={{ marginBottom: 14 }}>
          <div className="vcard">
            <h4 className="card-h">+ Skills Added</h4>
            {diff.added_skills?.length > 0 ? (
              <div className="pill-row">
                {diff.added_skills.map(s => <span key={s} className="vtag green">{s}</span>)}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>No new skills added.</p>
            )}
          </div>
          <div className="vcard">
            <h4 className="card-h">− Skills Removed</h4>
            {diff.removed_skills?.length > 0 ? (
              <div className="pill-row">
                {diff.removed_skills.map(s => <span key={s} className="vtag red">{s}</span>)}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>No skills removed. ✦</p>
            )}
          </div>
        </div>

        {/* Changed sections */}
        {diff.changed_sections?.length > 0 && (
          <div className="vcard" style={{ marginBottom: 14 }}>
            <h4 className="card-h">~ Sections Changed</h4>
            <div className="pill-row">
              {diff.changed_sections.map(s => <SectionPill key={s} label={s} added/>)}
            </div>
          </div>
        )}

        {/* Interview probe points */}
        {diff.interview_probe_points?.length > 0 && (
          <div className="vcard">
            <h4 className="card-h">◎ Recruiter May Ask About</h4>
            <ul className="vlist numbered">
              {diff.interview_probe_points.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN CV HISTORY PAGE
════════════════════════════════════════════════════════════ */
export default function CVHistory({ user }) {
  const [profileId, setProfileId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Upload to compare
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Select two versions to compare
  const [selectedA, setSelectedA] = useState(null);
  const [selectedB, setSelectedB] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [compareError, setCompareError] = useState("");

  // Tab: "history" | "upload" | "compare"
  const [tab, setTab] = useState("history");
  const resultRef = useRef();

  /* ── Load profile + version history on mount ── */
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Get parsed profile to get profile_id
        const profileRes = await fetch(`${API_BASE}/candidate/parsed-profile`, { headers: authHeaders() });
        if (!profileRes.ok) throw new Error("No profile found. Analyse a CV first in the Check CV tab.");
        const profileData = await profileRes.json();
        const pid = profileData.profile_id || profileData.parsed_resume?.email?.replace(/[@.]/g, "_");
        if (!pid) throw new Error("Could not determine your profile ID.");
        setProfileId(pid);

        // Load version history
        const histRes = await candidateVersionHistory(pid);
        const versionList = histRes.versions || histRes || [];
        setVersions(Array.isArray(versionList) ? versionList.reverse() : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ── Upload new CV as a saved version ── */
  async function handleUploadSave() {
    if (!uploadFile) return;
    setUploadLoading(true); setUploadError("");
    try {
      await candidateParseUpload(uploadFile, true, profileId, true);
      // Reload versions
      const histRes = await candidateVersionHistory(profileId);
      const versionList = histRes.versions || histRes || [];
      setVersions(Array.isArray(versionList) ? versionList.reverse() : []);
      setUploadFile(null);
      setTab("history");
    } catch (e) {
      setUploadError(e.message || "Upload failed. Try again.");
    } finally {
      setUploadLoading(false);
    }
  }

  /* ── Compare two saved versions ── */
  async function handleCompare() {
    if (!selectedA || !selectedB) return;
    setCompareLoading(true); setCompareError(""); setCompareResult(null);
    try {
      const vA = versions.find(v => v.version_id === selectedA);
      const vB = versions.find(v => v.version_id === selectedB);
      if (!vA || !vB) throw new Error("Could not find selected versions.");
      const result = await candidateVersionCompare(vA.parsed_resume, vB.parsed_resume);
      setCompareResult({
        diff: result,
        oldScore: vA.resume_quality_score || 0,
        newScore: vB.resume_quality_score || 0,
      });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      setCompareError(e.message || "Comparison failed.");
    } finally {
      setCompareLoading(false);
    }
  }

  /* ── Auto-compare latest two versions ── */
  async function handleAutoCompareLatest() {
    if (versions.length < 2) return;
    const vB = versions[0]; // newest (reversed)
    const vA = versions[1]; // second newest
    setCompareLoading(true); setCompareError(""); setCompareResult(null); setTab("compare");
    try {
      const result = await candidateVersionCompare(vA.parsed_resume, vB.parsed_resume);
      setCompareResult({
        diff: result,
        oldScore: vA.resume_quality_score || 0,
        newScore: vB.resume_quality_score || 0,
      });
    } catch (e) {
      setCompareError(e.message);
    } finally {
      setCompareLoading(false);
    }
  }

  const TABS = [
    { id: "history", label: `◎ Version History (${versions.length})` },
    { id: "upload",  label: "⬆ Upload New Version" },
    { id: "compare", label: "◈ Compare Versions" },
  ];

  /* ── Loading / error states ── */
  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div className="v-spinner-wrap" style={{ justifyContent: "center", padding: "60px 0" }}>
          <div className="v-spinner"/><span>Loading your version history…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div className="app-hero" style={{ paddingBottom: 16 }}>
          <p className="app-eyebrow">✦ CV Version History ✦</p>
          <h1 className="app-title" style={{ fontSize: "clamp(22px,4vw,34px)" }}>
            Version History &amp; Comparison
          </h1>
        </div>
        <div className="vcard" style={{ textAlign: "center", padding: "32px 24px" }}>
          <FolderOpen size={32} strokeWidth={1.6} color="var(--ink-faded)" style={{ display: "block", margin: "0 auto 12px" }}/>
          <p style={{ fontWeight: "bold", color: "var(--ink)", marginBottom: 8 }}>No versions found yet</p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, maxWidth: 420, margin: "0 auto" }}>
            {error}
          </p>
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(201,168,76,.07)", borderRadius: 8, border: "1px solid rgba(201,168,76,.14)", display:"flex", gap:9, alignItems:"flex-start" }}>
            <Lightbulb size={14} strokeWidth={2} style={{ flexShrink:0, marginTop:2, color:"var(--brass)" }}/>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
              Go to <strong>Check CV</strong> tab, upload your résumé, and your first version will be saved automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div className="app-hero" style={{ paddingBottom: 16 }}>
        <p className="app-eyebrow">✦ CV Version History ✦</p>
        <h1 className="app-title" style={{ fontSize: "clamp(22px,4vw,34px)" }}>
          Track Your <span className="app-accent">Resume Progress</span>
        </h1>
        <p className="app-sub">Upload new versions, compare scores, and see exactly what improved.</p>
      </div>

      {/* Quick action — auto compare latest two */}
      {versions.length >= 2 && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <button className="stamp-btn" onClick={handleAutoCompareLatest} disabled={compareLoading}
            style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {compareLoading ? "Comparing…" : "◈ Compare Latest Two Versions"}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        background: "rgba(12,18,8,.6)", border: "1px solid rgba(201,168,76,.12)",
        borderRadius: 12, padding: 4,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === t.id ? "linear-gradient(135deg,#c9a84c,#deba52)" : "transparent",
              color: tab === t.id ? "#1a1208" : "rgba(201,168,76,.55)",
              fontSize: 12, fontWeight: "bold", fontFamily: "inherit", transition: "all .2s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div>
          {versions.length === 0 ? (
            <div className="vcard" style={{ textAlign: "center", padding: "32px 24px" }}>
              <ClipboardList size={32} strokeWidth={1.6} color="var(--ink-faded)" style={{ display: "block", margin: "0 auto 12px" }}/>
              <p style={{ fontWeight: "bold", color: "var(--ink)", marginBottom: 6 }}>No versions saved yet</p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                Upload a new version in the "Upload New Version" tab to start tracking.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {versions.map((v, i) => {
                const isLatest = i === 0;
                const prevScore = versions[i + 1]?.resume_quality_score;
                const delta = prevScore != null ? (v.resume_quality_score || 0) - prevScore : null;
                return (
                  <div key={v.version_id} className="rd-row" style={{
                    borderLeft: `3px solid ${isLatest ? "var(--brass2)" : "var(--border)"}`,
                    cursor: "default",
                  }}>
                    <div style={{ flexShrink: 0 }}>
                      <ScoreRing score={v.resume_quality_score} size={52} stroke={6}/>
                    </div>
                    <div className="rd-info">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <p className="rd-name">Version {v.version_number}</p>
                        {isLatest && <span className="lp-badge amber" style={{ fontSize: 9 }}>Latest</span>}
                        {v.label && <span className="lp-badge green" style={{ fontSize: 9 }}>{v.label}</span>}
                      </div>
                      <p className="rd-file">
                        {new Date(v.created_at).toLocaleString()} &nbsp;·&nbsp; {v.source_type?.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {delta != null && <DeltaBadge delta={delta}/>}
                      <span style={{ fontSize: 14, fontWeight: "bold", color: "var(--ink-soft)" }}>
                        {(v.resume_quality_score || 0).toFixed(1)} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Score timeline */}
          {versions.length >= 2 && (
            <div className="vcard" style={{ marginTop: 16 }}>
              <h4 className="card-h">◎ Score Timeline</h4>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80, padding: "8px 0" }}>
                {[...versions].reverse().map((v, i) => {
                  const pct = Math.min(Math.max(v.resume_quality_score || 0, 0), 100);
                  const color = pct >= 70 ? "var(--forest2)" : pct >= 45 ? "var(--brass2)" : "var(--burgundy2)";
                  return (
                    <div key={v.version_id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: "var(--ink-muted)" }}>{pct.toFixed(0)}</span>
                      <div style={{ width: "100%", height: `${pct}%`, background: color, borderRadius: "4px 4px 0 0", minHeight: 4, transition: "height .6s ease" }}/>
                      <span style={{ fontSize: 9, color: "var(--ink-faded)" }}>v{v.version_number}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD TAB ── */}
      {tab === "upload" && (
        <div className="step-block">
          <div className="step-label"><span className="step-num-badge">⬆</span> Upload a New CV Version</div>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16, lineHeight: 1.65 }}>
            Upload your updated résumé to save it as a new version. Your profile will be auto-filled from it,
            and you'll be able to compare it against any previous version.
          </p>
          <DropZone file={uploadFile} onChange={setUploadFile} label="Drop your updated résumé here"/>
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="stamp-btn" onClick={handleUploadSave}
              disabled={!uploadFile || uploadLoading || !profileId}>
              {uploadLoading ? "Saving version…" : "⬆ Save as New Version"}
            </button>
            <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>
              This will also auto-fill your CV Builder with the new data.
            </p>
          </div>
          {uploadError && <div className="error-note" style={{ marginTop: 12 }}>⚠ {uploadError}</div>}
          {!profileId && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(201,168,76,.07)", borderRadius: 8, border: "1px solid rgba(201,168,76,.14)" }}>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
                ⚠ Run Check CV first to create your profile before saving versions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── COMPARE TAB ── */}
      {tab === "compare" && (
        <div>
          {versions.length < 2 ? (
            <div className="vcard" style={{ textAlign: "center", padding: "32px 24px" }}>
              <span style={{ fontSize: 36, display: "block", marginBottom: 12 }}>◈</span>
              <p style={{ fontWeight: "bold", color: "var(--ink)", marginBottom: 6 }}>Need at least 2 versions</p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                You currently have {versions.length} version{versions.length !== 1 ? "s" : ""}. Upload another version to enable comparison.
              </p>
            </div>
          ) : (
            <div className="step-block">
              <div className="step-label"><span className="step-num-badge">◈</span> Select Two Versions to Compare</div>
              <div className="two-col" style={{ marginBottom: 16 }}>
                <div>
                  <label className="field-label" style={{ marginBottom: 8, display: "block" }}>Older version (baseline)</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {versions.slice(1).map(v => (
                      <div key={v.version_id}
                        onClick={() => setSelectedA(v.version_id)}
                        style={{
                          padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                          background: selectedA === v.version_id ? "rgba(201,168,76,.1)" : "var(--parchment2)",
                          border: `1px solid ${selectedA === v.version_id ? "var(--brass)" : "var(--border)"}`,
                          transition: "all .15s",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: "bold", color: "var(--ink)" }}>Version {v.version_number}</span>
                          <span style={{ fontSize: 12, fontWeight: "bold", color: "var(--brass2)" }}>{(v.resume_quality_score||0).toFixed(1)} pts</span>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--ink-muted)", margin: "2px 0 0" }}>{new Date(v.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="field-label" style={{ marginBottom: 8, display: "block" }}>Newer version (to evaluate)</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {versions.slice(0, versions.length - 1).map(v => (
                      <div key={v.version_id}
                        onClick={() => setSelectedB(v.version_id)}
                        style={{
                          padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                          background: selectedB === v.version_id ? "rgba(45,110,66,.08)" : "var(--parchment2)",
                          border: `1px solid ${selectedB === v.version_id ? "var(--forest2)" : "var(--border)"}`,
                          transition: "all .15s",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: "bold", color: "var(--ink)" }}>Version {v.version_number}</span>
                          <span style={{ fontSize: 12, fontWeight: "bold", color: "var(--forest2)" }}>{(v.resume_quality_score||0).toFixed(1)} pts</span>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--ink-muted)", margin: "2px 0 0" }}>{new Date(v.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="run-bar">
                <div className="run-checklist">
                  <span className={`run-check ${selectedA ? "done" : ""}`}>{selectedA ? "✓" : "○"} Baseline version selected</span>
                  <span className={`run-check ${selectedB ? "done" : ""}`}>{selectedB ? "✓" : "○"} New version selected</span>
                </div>
                <div className="run-actions">
                  <button className="stamp-btn" disabled={!selectedA || !selectedB || compareLoading} onClick={handleCompare}>
                    {compareLoading ? "Comparing…" : "◈ Compare Now"}
                  </button>
                </div>
              </div>
              {compareError && <div className="error-note" style={{ marginTop: 12 }}>⚠ {compareError}</div>}
            </div>
          )}

          {/* Comparison result */}
          {compareResult && (
            <div ref={resultRef}>
              <ComparePanel
                diff={compareResult.diff}
                oldScore={compareResult.oldScore}
                newScore={compareResult.newScore}
                onClose={() => setCompareResult(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
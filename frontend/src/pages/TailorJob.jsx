import { useState, useRef } from "react";
import { FileText, FolderOpen, ClipboardList, Sparkles, Save, CheckCircle2, Check, X, Pencil, Plus } from "lucide-react";
import { suggestTailoredEdits, saveTailoredVersion } from "../api/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function authHeaders() {
  const t = localStorage.getItem("ats_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function ScoreRing({ score, size = 100, stroke = 10, label }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const color = pct >= 70 ? "var(--forest2)" : pct >= 45 ? "var(--brass2)" : "var(--burgundy2)";
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--parchment3)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ - (pct/100)*circ} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }}/>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          style={{ transform:"rotate(90deg)", transformOrigin:"center", fontSize: size*0.22, fontWeight:"bold", fill:color, font:"inherit" }}>
          {pct.toFixed(0)}
        </text>
      </svg>
      {label && <p className="ring-label">{label}</p>}
    </div>
  );
}

function VBar({ value = 0, label, sublabel }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color = pct >= 70 ? "var(--forest2)" : pct >= 45 ? "var(--brass2)" : "var(--burgundy2)";
  return (
    <div className="vbar-wrap">
      <div className="vbar-header"><span className="vbar-label">{label}</span><span className="vbar-val" style={{ color }}>{pct.toFixed(1)}</span></div>
      <div className="vbar-track"><div className="vbar-fill" style={{ width: `${pct}%`, background: color }}/></div>
      {sublabel && <p className="vbar-sub">{sublabel}</p>}
    </div>
  );
}

export default function TailorJob() {
  const [file, setFile] = useState(null);
  const [jobText, setJobText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const resultRef = useRef();

  // Upgrade-CV-for-this-job state (jobsuit.ai-style accept/reject edits)
  const [edits, setEdits] = useState(null);          // null = not generated yet
  const [editDecisions, setEditDecisions] = useState({}); // { [editId]: true|false }
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedVersion, setSavedVersion] = useState(null);

  async function handleTailor() {
    if (!file || !jobText.trim()) return;
    setLoading(true); setError(""); setResult(null);
    setSavedVersion(null); setSaveError(""); setEdits(null); setEditDecisions({}); setSuggestError("");
    try {
      const fd = new FormData();
      fd.append("resume_file", file);
      fd.append("job_text", jobText);
      fd.append("prefer_gemini", "true");
      const r = await fetch(`${API_BASE}/candidate/tailor-job`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.detail || "Tailoring failed"); }
      const d = await r.json();
      setResult(d);
      setVersionLabel(`Tailored — ${jobText.trim().split(/\s+/).slice(0, 5).join(" ")}…`);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  async function handleSuggestEdits() {
    if (!file || !result) return;
    setSuggesting(true); setSuggestError(""); setEdits(null); setEditDecisions({});
    try {
      const missingSkills = [...new Set([...(result.missing_required_skills||[]), ...(ts?.skills_to_add||[])])];
      const res = await suggestTailoredEdits(file, jobText, missingSkills, result.missing_keywords || []);
      setEdits(res.edits || []);
      // Default every suggestion to accepted — candidate reviews and rejects what doesn't fit.
      setEditDecisions(Object.fromEntries((res.edits || []).map(e => [e.id, true])));
    } catch (e) {
      setSuggestError(e.message);
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSaveVersion() {
    if (!file) return;
    setSavingVersion(true); setSaveError(""); setSavedVersion(null);
    try {
      const accepted = (edits || []).filter(e => editDecisions[e.id]);
      const res = await saveTailoredVersion(file, accepted, versionLabel.trim() || "Tailored version");
      setSavedVersion(res.version);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSavingVersion(false);
    }
  }

  const sc = result?.scores;
  const ts = result?.tailoring_suggestions;

  return (
    <div className="tj-scope" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="app-hero" style={{ paddingBottom: 16 }}>
        <p className="app-eyebrow">✦ Tailor for a Job ✦</p>
        <h1 className="app-title" style={{ fontSize: "clamp(24px, 4vw, 36px)" }}>Match Your CV.<br/><span className="app-accent">To a Specific Job.</span></h1>
        <p className="app-sub">Upload your résumé + paste a job description. Get tailoring suggestions: keywords to add, skills gaps, and what to prioritize.</p>
      </div>

      {/* Upload + JD */}
      <div className="step-block" style={{ marginBottom: 16 }}>
        <div className="step-label"><span className="step-num-badge">1</span> Upload Résumé &amp; Job Description</div>
        <div className="upload-cols">
          <div className="upload-col">
            <label className="field-label" style={{ display:"flex", alignItems:"center", gap:6 }}><FileText size={13} strokeWidth={2.25}/> Your Résumé</label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }}
              onChange={e => setFile(e.target.files?.[0] || null)}/>
            <div className={`v-drop ${file ? "filled" : ""}`} onClick={() => fileRef.current.click()} style={{ cursor: "pointer", minHeight: 100 }}>
              {file ? (
                <div className="v-drop-file">
                  <span className="v-drop-file-ico"><FileText size={24} strokeWidth={1.75} color="var(--brass)"/></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="v-drop-name">{file.name}</p>
                    <p className="v-drop-size">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button className="v-drop-remove" onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
                </div>
              ) : (
                <div className="v-drop-empty">
                  <FolderOpen size={26} strokeWidth={1.6} color="var(--ink-faded)" style={{ display:"block", margin:"0 auto 4px" }}/>
                  <p className="v-drop-title">Drop résumé here</p>
                </div>
              )}
            </div>
          </div>
          <div className="upload-col">
            <label className="field-label" style={{ display:"flex", alignItems:"center", gap:6 }}><ClipboardList size={13} strokeWidth={2.25}/> Job Description</label>
            <textarea className="jd-area" rows={8} value={jobText}
              placeholder="Paste the job description here…"
              onChange={e => setJobText(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="step-block" style={{ marginBottom: 16 }}>
        <div className="run-bar">
          <div className="run-checklist">
            <span className={`run-check ${file ? "done" : ""}`}>{file ? "✓" : "○"} Résumé {file ? `— ${file.name}` : ""}</span>
            <span className={`run-check ${jobText.trim() ? "done" : ""}`}>{jobText.trim() ? "✓" : "○"} Job description</span>
          </div>
          <div className="run-actions">
            <button className="stamp-btn" disabled={!file || !jobText.trim() || loading} onClick={handleTailor}>
              {loading ? "Analyzing…" : "✦ Tailor Now"}
            </button>
            <button className="stamp-btn secondary" onClick={() => { setFile(null); setJobText(""); setResult(null); setError(""); }}>✕ Reset</button>
          </div>
        </div>
        {loading && <div className="v-spinner-wrap"><div className="v-spinner"/><span>Comparing your CV with the job…</span></div>}
        {error && <div className="error-note" style={{ marginTop: 12 }}>⚠ {error}</div>}
      </div>

      {/* Results */}
      {result && (
        <div className="results-wrap" ref={resultRef}>
          <div className="results-tab-bar">
            <span className="results-tab-label">✦ Tailoring Report</span>
            <button className="stamp-btn secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setResult(null)}>✕</button>
          </div>
          <div className="result-section">
            {/* Score rings */}
            <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
              <ScoreRing score={sc?.resume_quality_score} size={110} stroke={10} label="CV Quality"/>
              <ScoreRing score={sc?.legacy_match_score} size={110} stroke={10} label="Job Match"/>
              <ScoreRing score={sc?.tailor_combined_score} size={110} stroke={10} label="Combined"/>
            </div>

            {/* Match breakdown */}
            <div className="deco-rule">◎ MATCH BREAKDOWN ◎</div>
            <div className="breakdown-grid">
              {["skills", "experience", "education", "keywords", "semantic", "projects"].map(k => {
                const c = result.match_breakdown?.[k]; if (!c) return null;
                return (
                  <div key={k} className="vcard breakdown-card">
                    <VBar value={c.score} label={k.charAt(0).toUpperCase() + k.slice(1)} sublabel={c.summary}/>
                  </div>
                );
              })}
            </div>

            {/* Skills match */}
            <div className="deco-rule">✦ SKILLS ✦</div>
            <div className="two-col">
              <div className="vcard">
                <h4 className="card-h">✓ Matched Required Skills</h4>
                <div className="pill-row">
                  {result.matched_required_skills?.map(s => <span key={s} className="vtag green">{s}</span>)}
                  {!result.matched_required_skills?.length && <span className="muted-text">None matched</span>}
                </div>
                {result.missing_required_skills?.length > 0 && <>
                  <p className="kw-label red-text" style={{ margin: "12px 0 6px" }}>✗ Missing Required Skills</p>
                  <div className="pill-row">{result.missing_required_skills.map(s => <span key={s} className="vtag red">{s}</span>)}</div>
                </>}
              </div>
              <div className="vcard">
                <h4 className="card-h">Keywords</h4>
                <p className="kw-label green-text" style={{ marginBottom: 6 }}>✓ Matched ({result.matched_keywords?.length || 0})</p>
                <div className="pill-row">{result.matched_keywords?.map(k => <span key={k} className="vtag green">{k}</span>)}</div>
                {result.missing_keywords?.length > 0 && <>
                  <p className="kw-label red-text" style={{ margin: "12px 0 6px" }}>✗ Missing ({result.missing_keywords.length})</p>
                  <div className="pill-row">{result.missing_keywords.map(k => <span key={k} className="vtag red">{k}</span>)}</div>
                </>}
              </div>
            </div>

            {/* Tailoring suggestions */}
            <div className="deco-rule">⬆ TAILORING SUGGESTIONS ⬆</div>

            {ts?.skills_to_add?.length > 0 && (
              <div className="vcard">
                <h4 className="card-h">Skills to Add to Your CV</h4>
                <div className="pill-row">{ts.skills_to_add.map(s => <span key={s} className="vtag amber">{s}</span>)}</div>
              </div>
            )}

            {ts?.keywords_to_include?.length > 0 && (
              <div className="vcard">
                <h4 className="card-h">Keywords to Include</h4>
                <div className="pill-row">{ts.keywords_to_include.map(k => <span key={k} className="vtag blue">{k}</span>)}</div>
              </div>
            )}

            {ts?.improvement_areas?.length > 0 && (
              <div className="vcard">
                <h4 className="card-h">Job-Specific Improvements</h4>
                <div className="improve-list">
                  {ts.improvement_areas.map((a, i) => (
                    <div key={i} className="improve-item"><span className="improve-dot"/><p>{a}</p></div>
                  ))}
                </div>
              </div>
            )}

            {ts?.general_improvements?.length > 0 && (
              <div className="vcard">
                <h4 className="card-h">General Improvements</h4>
                <div className="improve-list">
                  {ts.general_improvements.map((a, i) => (
                    <div key={i} className="improve-item"><span className="improve-dot"/><p>{a}</p></div>
                  ))}
                </div>
              </div>
            )}

            {ts?.next_steps?.length > 0 && (
              <div className="vcard">
                <h4 className="card-h">Next Steps</h4>
                <div className="steps-list">
                  {ts.next_steps.map((s, i) => (
                    <div key={i} className="step-item"><div className="step-num">{i + 1}</div><p>{s}</p></div>
                  ))}
                </div>
              </div>
            )}

            {/* Upgrade & save a tailored version — jobsuit.ai-style accept/reject edits */}
            <div className="deco-rule">⬆ UPGRADE YOUR CV FOR THIS JOB ⬆</div>
            <div className="vcard">
              <h4 className="card-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={16} strokeWidth={2.25} color="var(--brass)" /> Tailored Edit Suggestions
              </h4>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.6 }}>
                Generates specific rewrites — a tweaked bullet or a new one — that naturally work missing keywords into
                your real experience. Review each one and accept or reject it individually; nothing is added unless you approve it.
              </p>

              {edits === null && (
                <button className="stamp-btn" disabled={suggesting} onClick={handleSuggestEdits}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={14} strokeWidth={2.25} />
                  {suggesting ? "Generating suggestions…" : "Generate Tailored Suggestions"}
                </button>
              )}
              {suggestError && <div className="error-note" style={{ marginTop: 12 }}>⚠ {suggestError}</div>}

              {edits !== null && edits.length === 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-faded)", fontStyle: "italic" }}>
                  No specific edits to suggest — your résumé already covers this job well.
                </p>
              )}

              {edits !== null && edits.length > 0 && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    {edits.map(edit => {
                      const accepted = !!editDecisions[edit.id];
                      return (
                        <div key={edit.id} style={{
                          padding: "14px 16px", borderRadius: 11,
                          background: accepted ? "rgba(31,74,46,.05)" : "var(--pm-surface-sunken)",
                          border: `1px solid ${accepted ? "rgba(31,74,46,.25)" : "var(--pm-border)"}`,
                          opacity: accepted ? 1 : .65, transition: "all .15s ease",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9, gap: 10 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: "bold", color: "var(--brass)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                              {edit.type === "modify_bullet" ? <Pencil size={12} strokeWidth={2.25}/> : <Plus size={12} strokeWidth={2.25}/>}
                              {edit.type === "modify_bullet" ? "Rewrite bullet" : "New bullet"}
                              {edit.keyword && <span style={{ color: "var(--ink-muted)", fontWeight: 600, textTransform: "none" }}>· addresses "{edit.keyword}"</span>}
                            </span>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button onClick={() => setEditDecisions(prev => ({ ...prev, [edit.id]: true }))}
                                title="Accept" style={{
                                  width: 26, height: 26, borderRadius: 7, cursor: "pointer",
                                  border: `1px solid ${accepted ? "var(--forest2)" : "var(--pm-border-strong)"}`,
                                  background: accepted ? "var(--forest2)" : "transparent",
                                  color: accepted ? "#fff" : "var(--ink-muted)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}><Check size={13} strokeWidth={2.5}/></button>
                              <button onClick={() => setEditDecisions(prev => ({ ...prev, [edit.id]: false }))}
                                title="Reject" style={{
                                  width: 26, height: 26, borderRadius: 7, cursor: "pointer",
                                  border: `1px solid ${!accepted ? "#c04a30" : "var(--pm-border-strong)"}`,
                                  background: !accepted ? "#c04a30" : "transparent",
                                  color: !accepted ? "#fff" : "var(--ink-muted)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}><X size={13} strokeWidth={2.5}/></button>
                            </div>
                          </div>
                          {edit.original_text && (
                            <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "var(--ink-faded)", textDecoration: "line-through", lineHeight: 1.5 }}>
                              {edit.original_text}
                            </p>
                          )}
                          <p style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.55 }}>
                            {edit.suggested_text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 16 }}>
                    {edits.filter(e => editDecisions[e.id]).length} of {edits.length} suggestions accepted
                  </p>
                </>
              )}

              <label className="field-label" style={{ display: "block", marginBottom: 6 }}>Version label</label>
              <input
                type="text" value={versionLabel} onChange={e => setVersionLabel(e.target.value)}
                placeholder="e.g. Tailored — Backend Engineer @ Brainstation-23"
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8, marginBottom: 14,
                  border: "1px solid var(--pm-border-strong)", background: "var(--pm-surface-sunken)",
                  color: "var(--ink)", fontFamily: "inherit", fontSize: 13,
                }}
              />

              <button className="stamp-btn" disabled={savingVersion} onClick={handleSaveVersion}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Save size={14} strokeWidth={2.25} />
                {savingVersion ? "Saving…" : "Save This Tailored Version"}
              </button>
              <p style={{ fontSize: 11, color: "var(--ink-faded)", marginTop: 8 }}>
                Saved as a new version — your original résumé is never changed or overwritten. Manage and restore
                any previous version from your Profile page.
              </p>

              {saveError && <div className="error-note" style={{ marginTop: 12 }}>⚠ {saveError}</div>}
              {savedVersion && (
                <div style={{
                  marginTop: 14, padding: "12px 16px", borderRadius: 10,
                  background: "rgba(31,74,46,.08)", border: "1px solid rgba(31,74,46,.25)",
                  display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--forest2)", fontWeight: "bold",
                }}>
                  <CheckCircle2 size={16} strokeWidth={2.25} />
                  Saved as version {savedVersion.version_number} — quality score {Math.round(savedVersion.resume_quality_score || 0)}.
                </div>
              )}
            </div>

            {ts?.encouragement && (
              <div className="rec-cta-card">
                <span style={{ fontSize: 22 }}>✦</span>
                <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>{ts.encouragement}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
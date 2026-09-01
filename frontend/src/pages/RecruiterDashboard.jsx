import { useState, useRef } from "react";
import { StickyNote, ClipboardList, Mail, FolderPlus, FileText, PackageOpen, Inbox } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
function authHeaders() {
  const t = localStorage.getItem("ats_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function formReq(endpoint, fd) {
  const r = await fetch(`${API_BASE}${endpoint}`, { method:"POST", headers:authHeaders(), body:fd });
  let d; try { d = await r.json(); } catch { d = { detail:"Invalid response" }; }
  if (!r.ok) throw new Error(d?.detail || `Request failed (${r.status})`);
  return d;
}

/* ── Small shared components ── */
function ScoreRing({ score, size=64, stroke=7 }) {
  const r=(size-stroke)/2, circ=2*Math.PI*r;
  const pct=Math.min(Math.max(score||0,0),100);
  const color=pct>=70?"var(--forest2)":pct>=45?"var(--brass2)":"var(--burgundy2)";
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--parchment3)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ-(pct/100)*circ} strokeLinecap="round"
        style={{ transition:"stroke-dashoffset 1s ease" }}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ transform:"rotate(90deg)",transformOrigin:"center",fontSize:size*0.22,fontWeight:"bold",fill:color,font:"inherit" }}>
        {pct.toFixed(0)}
      </text>
    </svg>
  );
}

function BucketBadge({ bucket }) {
  const m = { shortlist:{c:"green",l:"✓ Shortlist"}, review:{c:"amber",l:"◈ Review"}, reject:{c:"red",l:"✗ Reject"} };
  const {c,l} = m[bucket]||m.review;
  return <span className={`lp-badge ${c}`}>{l}</span>;
}

/* NEW — model confidence badge */
function ConfidencePill({ confidence, needsReview }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const color = needsReview ? "#a04020" : pct >= 80 ? "#1a6e3e" : pct >= 65 ? "#7a6020" : "#a04020";
  const bg    = needsReview ? "rgba(160,64,32,.10)" : pct >= 80 ? "rgba(26,110,62,.10)" : pct >= 65 ? "rgba(122,96,32,.10)" : "rgba(160,64,32,.10)";
  return (
    <span style={{ fontSize:10, fontWeight:"bold", padding:"2px 7px", borderRadius:6, color, background:bg, border:`1px solid ${color}33`, letterSpacing:".04em" }}>
      {pct}% conf
    </span>
  );
}

/* NEW — match label badge from the ML model */
function MatchLabelBadge({ label }) {
  if (!label) return null;
  const m = {
    strong_match:   { c:"#1a6e3e", bg:"rgba(26,110,62,.10)",  l:"⬢ Strong" },
    moderate_match: { c:"#7a6020", bg:"rgba(122,96,32,.10)",  l:"◈ Moderate" },
    poor_match:     { c:"#a04020", bg:"rgba(160,64,32,.10)",  l:"▽ Poor" },
  };
  const { c, bg, l } = m[label] || m.moderate_match;
  return (
    <span style={{ fontSize:10, fontWeight:"bold", padding:"2px 7px", borderRadius:6, color:c, background:bg, border:`1px solid ${c}33`, letterSpacing:".04em" }}>
      {l}
    </span>
  );
}

function VBar({ value=0, label }) {
  const pct=Math.min(Math.max(value,0),100);
  const color=pct>=70?"var(--forest2)":pct>=45?"var(--brass2)":"var(--burgundy2)";
  return (
    <div className="vbar-wrap">
      <div className="vbar-header"><span className="vbar-label">{label}</span><span className="vbar-val" style={{color}}>{pct.toFixed(1)}</span></div>
      <div className="vbar-track"><div className="vbar-fill" style={{width:`${pct}%`,background:color}}/></div>
    </div>
  );
}

/* ── Candidate Detail Modal ── */
function CandidateDetail({ candidate, onClose, notes, onNoteChange, onBucketChange }) {
  if (!candidate) return null;
  const fb = candidate.recruiter_feedback || {};
  const sc = candidate.score_summary || {};
  const result = candidate.result || {};
  const hist = candidate.history_snapshot;

  return (
    <div className="rd-modal-overlay" onClick={onClose}>
      <div className="rd-modal" onClick={e=>e.stopPropagation()}>
        <div className="rd-modal-header">
          <div>
            <h3 style={{ fontSize:20, fontWeight:"bold" }}>{candidate.candidate_name}</h3>
            <span style={{ fontSize:12, color:"var(--ink-muted)" }}>{candidate.filename}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <BucketBadge bucket={fb.decision_bucket}/>
            <button className="stamp-btn secondary" style={{ padding:"4px 12px", fontSize:12 }} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="rd-modal-body">
          {/* Override bucket */}
          <div style={{ display:"flex", gap:8, marginBottom:16, padding:"10px 14px", background:"rgba(201,168,76,.06)", borderRadius:8, border:"1px solid rgba(201,168,76,.12)" }}>
            <span style={{ fontSize:12, color:"var(--ink-soft)", fontWeight:"bold", alignSelf:"center" }}>Override decision:</span>
            {["shortlist","review","reject"].map(b=>(
              <button key={b} onClick={()=>onBucketChange(candidate.filename, b)}
                className={`stamp-btn ${(candidate._override||fb.decision_bucket)===b?"":"secondary"}`}
                style={{ padding:"4px 12px", fontSize:11 }}>
                {b==="shortlist"?"✓ Shortlist":b==="review"?"◈ Review":"✗ Reject"}
              </button>
            ))}
          </div>

          {/* Scores */}
          <div style={{ display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
            <ScoreRing score={sc.combined_score} size={90} stroke={9}/>
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
              <VBar value={sc.resume_quality_score} label="Resume Quality"/>
              <VBar value={sc.job_match_score} label="Job Match"/>
              <VBar value={sc.combined_score} label="Combined Score"/>
              <VBar value={candidate.ranking_score ?? sc.ranking_score} label="Model Ranking Score"/>
            </div>
          </div>

          {/* NEW: model output summary */}
          <div style={{ display:"flex", gap:8, marginTop:14, padding:"10px 14px", background:"rgba(201,168,76,.06)", borderRadius:8, border:"1px solid rgba(201,168,76,.12)", flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:12, color:"var(--ink-soft)", fontWeight:"bold" }}>Model output:</span>
            <MatchLabelBadge label={candidate.match_label}/>
            <ConfidencePill confidence={candidate.confidence} needsReview={candidate.needs_review}/>
            {candidate.needs_review && (
              <span style={{ fontSize:11, color:"#a04020", fontWeight:"bold", marginLeft:6 }}>
                ⚠ Low confidence — HR review recommended
              </span>
            )}
            {candidate.class_probabilities && (
              <span style={{ fontSize:11, color:"var(--ink-muted)", marginLeft:"auto" }}>
                Poor {((candidate.class_probabilities.poor_match || 0) * 100).toFixed(0)}% · Mod {((candidate.class_probabilities.moderate_match || 0) * 100).toFixed(0)}% · Strong {((candidate.class_probabilities.strong_match || 0) * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Summary + recommendation */}
          {fb.summary&&(<div className="vcard" style={{ marginTop:16 }}><h4 className="card-h">Summary</h4><p style={{ fontSize:13, color:"var(--ink-soft)", lineHeight:1.7 }}>{fb.summary}</p></div>)}
          {fb.recommendation&&(<div className="rec-cta-card" style={{ marginTop:12 }}><span style={{ fontSize:20 }}>⬡</span><div><p style={{ fontWeight:"bold", marginBottom:4 }}>Recommendation</p><p style={{ fontSize:13, color:"var(--ink-soft)" }}>{fb.recommendation}</p></div></div>)}

          {/* Strengths & risks */}
          <div className="two-col" style={{ marginTop:14 }}>
            {fb.accept_reasons?.length>0&&(<div className="vcard"><h4 className="card-h">✓ Accept Reasons</h4><ul className="vlist green">{fb.accept_reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></div>)}
            {fb.reject_reasons?.length>0&&(<div className="vcard"><h4 className="card-h">✗ Reject Reasons</h4><ul className="vlist red">{fb.reject_reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></div>)}
          </div>
          <div className="two-col" style={{ marginTop:10 }}>
            {fb.strengths?.length>0&&(<div className="vcard"><h4 className="card-h">Strengths</h4><ul className="vlist green">{fb.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>)}
            {fb.risks?.length>0&&(<div className="vcard"><h4 className="card-h">⚠ Risks</h4><ul className="vlist red">{fb.risks.map((r,i)=><li key={i}>{r}</li>)}</ul></div>)}
          </div>

          {/* Interview questions */}
          {fb.interview_probe_points?.length>0&&(
            <div className="vcard" style={{ marginTop:10 }}>
              <h4 className="card-h">Interview Questions</h4>
              <ul className="vlist numbered">{fb.interview_probe_points.map((q,i)=><li key={i}>{q}</li>)}</ul>
            </div>
          )}

          {/* Skills */}
          <div className="two-col" style={{ marginTop:10 }}>
            <div className="vcard">
              <h4 className="card-h">✓ Matched Skills</h4>
              <div className="pill-row">{result.matched_required_skills?.map(s=><span key={s} className="vtag green">{s}</span>)}{!result.matched_required_skills?.length&&<span className="muted-text">None detected</span>}</div>
            </div>
            <div className="vcard">
              <h4 className="card-h">✗ Missing Skills</h4>
              <div className="pill-row">{result.missing_required_skills?.map(s=><span key={s} className="vtag red">{s}</span>)}{!result.missing_required_skills?.length&&<span className="muted-text">No gaps</span>}</div>
            </div>
          </div>

          {/* Recruiter notes */}
          <div className="vcard" style={{ marginTop:12 }}>
            <h4 className="card-h" style={{ display:"flex", alignItems:"center", gap:7 }}><StickyNote size={15} strokeWidth={2}/> Recruiter Notes</h4>
            <textarea className="auth-input" rows={3} style={{ minHeight:64, resize:"vertical" }}
              placeholder="Add your notes about this candidate…"
              value={notes[candidate.filename]||""}
              onChange={e=>onNoteChange(candidate.filename, e.target.value)}/>
            <p style={{ fontSize:11, color:"var(--ink-muted)", marginTop:4 }}>Notes are saved locally and included in the CSV export.</p>
          </div>

          {/* History */}
          {hist&&(
            <div className="vcard" style={{ marginTop:10 }}>
              <h4 className="card-h">Resume Improvement History</h4>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:8 }}>
                <div className="stat-box"><span>Versions</span><strong>{hist.version_count}</strong></div>
                <div className="stat-box"><span>Latest Score</span><strong>{hist.latest_resume_quality_score?.toFixed(1)}</strong></div>
                <div className="stat-box"><span>Score Δ</span><strong>{hist.score_delta_from_previous>=0?"+":""}{hist.score_delta_from_previous?.toFixed(1)}</strong></div>
              </div>
              {hist.recent_improvement_highlights?.length>0&&(<><p style={{ fontSize:12, fontWeight:"bold", color:"var(--ink-soft)", marginBottom:6 }}>Recent Improvements:</p><ul className="vlist green">{hist.recent_improvement_highlights.map((h,i)=><li key={i}>{h}</li>)}</ul></>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shortlist Panel ── */
function ShortlistPanel({ candidates, notes, overrides, onRemove, onExport, onEmailDraft }) {
  const shortlisted = candidates.filter(c => {
    const bucket = overrides[c.filename] || c.recruiter_feedback?.decision_bucket;
    return bucket === "shortlist";
  });

  if (shortlisted.length === 0) {
    return (
      <div className="vcard" style={{ textAlign:"center", padding:"28px 20px" }}>
        <ClipboardList size={30} strokeWidth={1.6} color="var(--ink-faded)" style={{ display:"block", margin:"0 auto 10px" }}/>
        <h4 style={{ fontWeight:"bold", marginBottom:6, color:"var(--ink-soft)" }}>No candidates shortlisted yet</h4>
        <p style={{ fontSize:13, color:"var(--ink-muted)" }}>Top candidates are shortlisted automatically. You can also override any decision in the candidate detail view.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <h4 style={{ fontWeight:"bold", fontSize:16 }}>✓ Shortlisted Candidates</h4>
          <p style={{ fontSize:12, color:"var(--ink-muted)" }}>{shortlisted.length} candidate{shortlisted.length!==1?"s":""} ready for next stage</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="stamp-btn secondary" style={{ padding:"7px 14px", fontSize:12, display:"inline-flex", alignItems:"center", gap:6 }} onClick={onEmailDraft}>
            <Mail size={14} strokeWidth={2.25}/> Draft Emails
          </button>
          <button className="stamp-btn" style={{ padding:"7px 16px", fontSize:12 }} onClick={onExport}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {shortlisted.map((c,i)=>{
        const sc = c.score_summary||{};
        const fb = c.recruiter_feedback||{};
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:"rgba(31,74,46,.07)", border:"1px solid rgba(31,74,46,.2)", borderRadius:10, marginBottom:8 }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(45,110,66,.18)", border:"1px solid rgba(45,110,66,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"bold", fontSize:14, color:"var(--forest2)", flexShrink:0 }}>
              {i+1}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontWeight:"bold", fontSize:14, color:"var(--ink)" }}>{c.candidate_name}</p>
              <p style={{ fontSize:11, color:"var(--ink-muted)" }}>{c.filename}</p>
              {notes[c.filename]&&<p style={{ fontSize:11, color:"var(--ink-soft)", marginTop:3, fontStyle:"italic" }}>"{notes[c.filename]}"</p>}
            </div>
            <div style={{ display:"flex", gap:10, fontSize:12, color:"var(--ink-soft)" }}>
              <span>Quality: <strong style={{ color:"var(--forest2)" }}>{sc.resume_quality_score?.toFixed(0)}</strong></span>
              <span>Match: <strong style={{ color:"var(--forest2)" }}>{sc.job_match_score?.toFixed(0)}</strong></span>
              <span>Combined: <strong style={{ color:"var(--forest2)" }}>{sc.combined_score?.toFixed(0)}</strong></span>
            </div>
            <button className="v-drop-remove" style={{ marginLeft:0, flexShrink:0 }} title="Remove from shortlist" onClick={()=>onRemove(c.filename)}>✕</button>
          </div>
        );
      })}

      {/* Summary stats */}
      <div style={{ marginTop:14, padding:"12px 16px", background:"rgba(201,168,76,.05)", borderRadius:8, border:"1px solid rgba(201,168,76,.1)", display:"flex", gap:20 }}>
        <div className="stat-box" style={{ flex:1 }}>
          <span>Avg Quality</span>
          <strong>{(shortlisted.reduce((s,c)=>s+(c.score_summary?.resume_quality_score||0),0)/shortlisted.length).toFixed(1)}</strong>
        </div>
        <div className="stat-box" style={{ flex:1 }}>
          <span>Avg Match</span>
          <strong>{(shortlisted.reduce((s,c)=>s+(c.score_summary?.job_match_score||0),0)/shortlisted.length).toFixed(1)}</strong>
        </div>
        <div className="stat-box" style={{ flex:1 }}>
          <span>Avg Combined</span>
          <strong>{(shortlisted.reduce((s,c)=>s+(c.score_summary?.combined_score||0),0)/shortlisted.length).toFixed(1)}</strong>
        </div>
      </div>
    </div>
  );
}

/* ── Email Draft Modal ── */
function EmailDraftModal({ candidates, overrides, onClose }) {
  const shortlisted = candidates.filter(c=>{
    const bucket = overrides[c.filename]||c.recruiter_feedback?.decision_bucket;
    return bucket==="shortlist";
  });
  const [copied, setCopied] = useState(null);

  function copyEmail(name, text) {
    navigator.clipboard.writeText(text).then(()=>{ setCopied(name); setTimeout(()=>setCopied(null),2000); });
  }

  return (
    <div className="rd-modal-overlay" onClick={onClose}>
      <div className="rd-modal" onClick={e=>e.stopPropagation()}>
        <div className="rd-modal-header">
          <div><h3 style={{ fontSize:18, fontWeight:"bold", display:"flex", alignItems:"center", gap:8 }}><Mail size={17} strokeWidth={2.25}/> Interview Invitation Drafts</h3><span style={{ fontSize:12, color:"var(--ink-muted)" }}>{shortlisted.length} shortlisted candidate{shortlisted.length!==1?"s":""}</span></div>
          <button className="stamp-btn secondary" style={{ padding:"4px 12px", fontSize:12 }} onClick={onClose}>✕</button>
        </div>
        <div className="rd-modal-body">
          {shortlisted.map((c,i)=>{
            const emailText = `Subject: Interview Invitation — ${c.candidate_name}

Dear ${c.candidate_name.split(" ")[0]},

Thank you for your application. We have reviewed your résumé and are pleased to invite you to an interview.

Could you please confirm your availability for the next 1–2 weeks? We typically conduct a 45-minute video call.

We look forward to speaking with you.

Best regards,
[Your Name]
[Company Name]`;
            return (
              <div key={i} className="vcard" style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <h4 className="card-h" style={{ margin:0 }}>To: {c.candidate_name}</h4>
                  <button className="stamp-btn secondary" style={{ padding:"3px 10px", fontSize:11 }} onClick={()=>copyEmail(c.candidate_name, emailText)}>
                    {copied===c.candidate_name?"✓ Copied!":"Copy"}
                  </button>
                </div>
                <pre style={{ fontSize:12, color:"var(--ink-soft)", whiteSpace:"pre-wrap", lineHeight:1.7, margin:0, fontFamily:"inherit" }}>{emailText}</pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN RECRUITER DASHBOARD
════════════════════════════════════════════════════════════ */
export default function RecruiterDashboard() {
  const [files, setFiles] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [jobText, setJobText] = useState("");
  const [mode, setMode] = useState("files");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [selectedCandidate, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("screen"); // "screen" | "shortlist"
  const [notes, setNotes] = useState({});  // filename -> note
  const [overrides, setOverrides] = useState({}); // filename -> bucket override
  const [sortBy, setSortBy] = useState("rank"); // "rank" | "quality" | "match" | "combined"
  const [showEmailModal, setShowEmailModal] = useState(false);

  const fileRef = useRef();
  const zipRef = useRef();
  const resultRef = useRef();

  function handleFilesChange(e) { const f=Array.from(e.target.files||[]); setFiles(p=>[...p,...f]); }
  function removeFile(idx) { setFiles(p=>p.filter((_,i)=>i!==idx)); }

  async function handleScreen() {
    if (!jobText.trim()) { setError("Paste a job description first."); return; }
    setLoading(true); setError(""); setSession(null); setNotes({}); setOverrides({});
    try {
      let res;
      if (mode==="zip"&&zipFile) {
        const fd=new FormData(); fd.append("job_text",jobText); fd.append("zip_file",zipFile); fd.append("prefer_gemini","true");
        res=await formReq("/recruiter/job/screen-zip",fd);
      } else if (files.length>0) {
        const fd=new FormData(); fd.append("job_text",jobText); fd.append("prefer_gemini","true");
        files.forEach(f=>fd.append("resume_files",f));
        res=await formReq("/recruiter/job/screen-files",fd);
      } else { setError("Upload at least one resume file."); setLoading(false); return; }
      setSession(res);
      setTimeout(()=>resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),100);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  function handleReset() { setFiles([]); setZipFile(null); setJobText(""); setSession(null); setError(""); setFilter("all"); setSelected(null); setNotes({}); setOverrides({}); setActiveTab("screen"); }

  function handleBucketOverride(filename, bucket) {
    setOverrides(p=>({...p,[filename]:bucket}));
    if (selectedCandidate?.filename===filename) {
      setSelected(p=>p?{...p,_override:bucket}:p);
    }
  }

  function removeFromShortlist(filename) {
    setOverrides(p=>({...p,[filename]:"review"}));
  }

  function exportCSV() {
    const shortlisted = (session?.candidates||[]).filter(c=>{
      const bucket=overrides[c.filename]||c.recruiter_feedback?.decision_bucket;
      return bucket==="shortlist";
    });
    const header = ["Rank","Name","File","Combined Score","Quality Score","Job Match","Decision","Recruiter Notes","Accept Reasons","Reject Reasons"];
    const rows = shortlisted.map(c=>{
      const sc=c.score_summary||{}; const fb=c.recruiter_feedback||{};
      const bucket=overrides[c.filename]||fb.decision_bucket;
      return [
        c.rank||"",
        `"${c.candidate_name||""}"`,
        `"${c.filename||""}"`,
        sc.combined_score?.toFixed(1)||"",
        sc.resume_quality_score?.toFixed(1)||"",
        sc.job_match_score?.toFixed(1)||"",
        bucket||"",
        `"${(notes[c.filename]||"").replace(/"/g,'""')}"`,
        `"${(fb.accept_reasons||[]).join("; ").replace(/"/g,'""')}"`,
        `"${(fb.reject_reasons||[]).join("; ").replace(/"/g,'""')}"`,
      ];
    });
    const csvContent = [header, ...rows].map(r=>r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url;
    a.download = `shortlist_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function fullExportCSV() {
    const candidates = session?.candidates||[];
    const header = ["Rank","Name","File","Combined Score","Quality Score","Job Match","Decision","Override","Recruiter Notes","Matched Skills","Missing Skills"];
    const rows = candidates.map(c=>{
      const sc=c.score_summary||{}; const fb=c.recruiter_feedback||{}; const res=c.result||{};
      const bucket=overrides[c.filename]||fb.decision_bucket;
      return [
        c.rank||"",
        `"${c.candidate_name||""}"`,
        `"${c.filename||""}"`,
        sc.combined_score?.toFixed(1)||"",
        sc.resume_quality_score?.toFixed(1)||"",
        sc.job_match_score?.toFixed(1)||"",
        fb.decision_bucket||"",
        overrides[c.filename]||"",
        `"${(notes[c.filename]||"").replace(/"/g,'""')}"`,
        `"${(res.matched_required_skills||[]).join("; ")}"`,
        `"${(res.missing_required_skills||[]).join("; ")}"`,
      ];
    });
    const csvContent = [header, ...rows].map(r=>r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url;
    a.download = `all_candidates_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const candidates = session?.candidates||[];
  const summary = session?.summary||{};

  // Sort candidates
  const sorted = [...candidates].sort((a,b)=>{
    if (sortBy==="quality")    return (b.score_summary?.resume_quality_score||0)-(a.score_summary?.resume_quality_score||0);
    if (sortBy==="match")      return (b.score_summary?.job_match_score||0)-(a.score_summary?.job_match_score||0);
    if (sortBy==="combined")   return (b.score_summary?.combined_score||0)-(a.score_summary?.combined_score||0);
    if (sortBy==="ranking")    return (b.ranking_score||b.score_summary?.ranking_score||0)-(a.ranking_score||a.score_summary?.ranking_score||0);
    if (sortBy==="confidence") return (b.confidence||0)-(a.confidence||0);
    return (a.rank||0)-(b.rank||0);
  });

  const filtered = filter==="all" ? sorted : sorted.filter(c=>{
    const bucket = overrides[c.filename]||c.recruiter_feedback?.decision_bucket;
    return bucket===filter;
  });

  const shortlistCount = candidates.filter(c=>{
    const bucket=overrides[c.filename]||c.recruiter_feedback?.decision_bucket;
    return bucket==="shortlist";
  }).length;

  return (
    <div className="rd-scope">
      <div style={{
        maxWidth: 900, margin: "0 auto 20px",
        background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
        borderRadius: "var(--pm-radius-lg)", boxShadow: "var(--pm-shadow-md)",
        padding: "26px 28px 30px", fontFamily: "var(--pm-font)",
      }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "var(--ink)" }}>Quick Screen</h2>
        <p style={{ margin: "0 0 22px", fontSize: 12.5, color: "var(--ink-muted)" }}>
          Upload multiple résumés with a job description — candidates are ranked, scored, and shortlisted automatically. You review and export.
        </p>

        {/* Step 1: JD */}
        <div className="rd-section">
          <div className="step-label"><span className="step-num-badge">1</span> Paste Job Description</div>
          <textarea className="jd-area" rows={8} value={jobText} placeholder="Paste the full job description here…" onChange={e=>setJobText(e.target.value)}/>
        </div>

        {/* Step 2: Upload */}
        <div className="rd-section">
          <div className="step-label"><span className="step-num-badge">2</span> Upload Résumés</div>
          <div className="auth-tabs" style={{ maxWidth:300, marginBottom:16 }}>
            <button className={`auth-tab ${mode==="files"?"active":""}`} onClick={()=>setMode("files")}>Multiple Files</button>
            <button className={`auth-tab ${mode==="zip"?"active":""}`} onClick={()=>setMode("zip")}>ZIP Archive</button>
          </div>
          {mode==="files"?(
            <div>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" multiple style={{ display:"none" }} onChange={handleFilesChange}/>
              <button className="stamp-btn secondary" onClick={()=>fileRef.current.click()} style={{ marginBottom:12, display:"inline-flex", alignItems:"center", gap:7 }}><FolderPlus size={15} strokeWidth={2.25}/> Add Résumé Files</button>
              {files.length>0&&(
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {files.map((f,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"var(--pm-surface-sunken)", borderRadius:8, border:"1px solid var(--pm-border)" }}>
                      <FileText size={16} strokeWidth={2} color="var(--brass)"/>
                      <span style={{ flex:1, fontSize:13, fontWeight:"bold", color:"var(--ink2)" }}>{f.name}</span>
                      <span style={{ fontSize:11, color:"var(--ink-muted)" }}>{(f.size/1024).toFixed(1)} KB</span>
                      <button className="v-drop-remove" style={{ marginLeft:0 }} onClick={()=>removeFile(i)}>✕</button>
                    </div>
                  ))}
                  <p style={{ fontSize:12, color:"var(--ink-muted)" }}>{files.length} file(s) ready</p>
                </div>
              )}
            </div>
          ):(
            <div>
              <input ref={zipRef} type="file" accept=".zip" style={{ display:"none" }} onChange={e=>setZipFile(e.target.files?.[0]||null)}/>
              <div className={`v-drop ${zipFile?"filled":""}`} onClick={()=>zipRef.current.click()} style={{ cursor:"pointer" }}>
                {zipFile?(
                  <div className="v-drop-file">
                    <span className="v-drop-file-ico"><PackageOpen size={26} strokeWidth={1.75} color="var(--forest2)"/></span>
                    <div style={{ flex:1 }}><p className="v-drop-name">{zipFile.name}</p><p className="v-drop-size">{(zipFile.size/1024).toFixed(1)} KB</p></div>
                    <button className="v-drop-remove" onClick={e=>{e.stopPropagation();setZipFile(null);}}>✕</button>
                  </div>
                ):(
                  <div className="v-drop-empty">
                    <PackageOpen size={30} strokeWidth={1.6} color="var(--ink-faded)" style={{ display:"block", margin:"0 auto 6px" }}/>
                    <p className="v-drop-title">Drop a ZIP archive</p>
                    <p className="v-drop-hint">Contains .pdf, .docx, or .txt résumés</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Run */}
        <div className="rd-section" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <div className="step-label"><span className="step-num-badge">3</span> Screen Candidates</div>
          <div className="run-bar">
            <div className="run-checklist">
              <span className={`run-check ${jobText.trim()?"done":""}`}>{jobText.trim()?"✓":"○"} Job description</span>
              <span className={`run-check ${(files.length>0||zipFile)?"done":""}`}>{(files.length>0||zipFile)?"✓":"○"} Résumés ({mode==="zip"?(zipFile?"1 zip":"none"):`${files.length} files`})</span>
            </div>
            <div className="run-actions">
              <button className="stamp-btn" disabled={loading||!jobText.trim()||(mode==="files"?files.length===0:!zipFile)} onClick={handleScreen}>
                {loading?"Screening…":"⬡ Screen Now"}
              </button>
              <button className="stamp-btn secondary" onClick={handleReset}>✕ Reset</button>
            </div>
          </div>
          {loading&&(<div className="v-spinner-wrap"><div className="v-spinner"/><span>Screening all candidates, please wait…</span></div>)}
          {error&&<div className="error-note" style={{ marginTop:12 }}>⚠ {error}</div>}
        </div>
      </div>

      {/* RESULTS */}
      {session&&(
        <div className="results-wrap" ref={resultRef} style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Result tabs */}
          <div style={{ display:"flex", gap:4, marginBottom:16, background:"var(--pm-card-bg)", border:"1px solid var(--pm-border)", boxShadow:"var(--pm-shadow-sm)", borderRadius:12, padding:4 }}>
            {[{id:"screen",label:`⬡ All Candidates (${candidates.length})`},{id:"shortlist",label:`✓ Shortlist (${shortlistCount})`}].map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                style={{ flex:1, padding:"9px 12px", borderRadius:8, border:"none", cursor:"pointer",
                  background:activeTab===t.id?"linear-gradient(135deg,#c9a84c,#deba52)":"transparent",
                  color:activeTab===t.id?"#1a1208":"var(--ink-muted)",
                  fontSize:13, fontWeight:"bold", fontFamily:"inherit", transition:"all .2s" }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="result-section">
            {/* SCREEN TAB */}
            {activeTab==="screen"&&(
              <>
                {/* Summary stat cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14 }}>
                  {[["Total",summary.total_candidates,"all","var(--brass)"],["✓ Shortlist",summary.shortlist_count,"shortlist","var(--forest2)"],["◈ Review",summary.review_count,"review","var(--brass2)"],["✗ Reject",summary.reject_count,"reject","var(--burgundy2)"]].map(([label,val,f,color])=>(
                    <div key={f} className="stat-box" onClick={()=>setFilter(f)} style={{ cursor:"pointer", borderColor:filter===f?color:undefined, transition:"border-color .2s" }}>
                      <span>{label}</span><strong style={{ color }}>{val}</strong>
                    </div>
                  ))}
                </div>

                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                  <p style={{ fontSize:12, color:"var(--ink-muted)" }}>
                    Average score: <strong>{summary.average_combined_score}</strong> &nbsp;·&nbsp; Click a candidate for full details
                  </p>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"var(--ink-muted)" }}>Sort:</span>
                    {["rank","quality","match","combined","ranking","confidence"].map(s=>(
                      <button key={s} onClick={()=>setSortBy(s)}
                        style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"1px solid", cursor:"pointer", fontFamily:"inherit",
                          borderColor:sortBy===s?"var(--brass)":"var(--border)",
                          background:sortBy===s?"rgba(201,168,76,.12)":"transparent",
                          color:sortBy===s?"var(--brass)":"var(--ink-muted)" }}>
                        {s.charAt(0).toUpperCase()+s.slice(1)}
                      </button>
                    ))}
                    <button className="stamp-btn secondary" style={{ padding:"4px 10px", fontSize:11 }} onClick={fullExportCSV}>
                      ↓ Export All
                    </button>
                  </div>
                </div>

                {/* Top missing skills */}
                {summary.top_missing_required_skills?.length>0&&(
                  <div className="vcard" style={{ marginBottom:12 }}>
                    <h4 className="card-h">Most Commonly Missing Skills Across All Candidates</h4>
                    <div className="pill-row">
                      {summary.top_missing_required_skills.map(s=><span key={s.skill} className="vtag red">{s.skill} ({s.count})</span>)}
                    </div>
                  </div>
                )}

                {/* Candidate rows */}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {filtered.map((c,i)=>{
                    const fb=c.recruiter_feedback||{};
                    const sc=c.score_summary||{};
                    const bucket=overrides[c.filename]||fb.decision_bucket;
                    const isOverridden=!!overrides[c.filename];
                    return (
                      <div key={i} className="rd-row" onClick={()=>setSelected(c)}
                        style={{ borderLeft:`3px solid ${bucket==="shortlist"?"var(--forest2)":bucket==="reject"?"var(--burgundy2)":"var(--brass2)"}` }}>
                        <div className="rd-rank">#{c.rank||i+1}</div>
                        <ScoreRing score={sc.combined_score} size={48} stroke={5}/>
                        <div className="rd-info">
                          <p className="rd-name">{c.candidate_name}</p>
                          <p className="rd-file">{c.filename}</p>
                          {notes[c.filename]&&<p style={{ fontSize:10, color:"var(--ink-muted)", marginTop:2, fontStyle:"italic", display:"flex", alignItems:"center", gap:4 }}><StickyNote size={10} strokeWidth={2}/> {notes[c.filename].slice(0,50)}{notes[c.filename].length>50?"…":""}</p>}
                        </div>
                        <div className="rd-scores">
                          <span>Q: {sc.resume_quality_score?.toFixed(0)}</span>
                          <span>M: {sc.job_match_score?.toFixed(0)}</span>
                          <span>C: {sc.combined_score?.toFixed(0)}</span>
                          <span style={{ color:"var(--brass2)" }}>R: {(c.ranking_score ?? sc.ranking_score)?.toFixed(0)}</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          <BucketBadge bucket={bucket}/>
                          <div style={{ display:"flex", gap:4 }}>
                            <MatchLabelBadge label={c.match_label}/>
                            <ConfidencePill confidence={c.confidence} needsReview={c.needs_review}/>
                          </div>
                          {isOverridden && <span style={{ fontSize:9, color:"var(--brass)", letterSpacing:".06em" }}>OVERRIDDEN</span>}
                          {c.needs_review && <span style={{ fontSize:9, color:"#a04020", letterSpacing:".06em", fontWeight:"bold" }}>⚠ REVIEW</span>}
                        </div>
                        <span className="rd-arrow">→</span>
                      </div>
                    );
                  })}
                  {filtered.length===0&&(
                    <div className="v-empty"><span className="v-empty-icon"><Inbox size={30} strokeWidth={1.6}/></span><h3>No candidates in this category</h3></div>
                  )}
                </div>

                {/* Skipped files */}
                {session.skipped_files?.length>0&&(
                  <div className="vcard" style={{ marginTop:8 }}>
                    <h4 className="card-h">⚠ Skipped Files</h4>
                    {session.skipped_files.map((s,i)=><p key={i} style={{ fontSize:13, color:"var(--burgundy2)" }}>{s.filename}: {s.reason}</p>)}
                  </div>
                )}
              </>
            )}

            {/* SHORTLIST TAB */}
            {activeTab==="shortlist"&&(
              <ShortlistPanel
                candidates={candidates}
                notes={notes}
                overrides={overrides}
                onRemove={removeFromShortlist}
                onExport={exportCSV}
                onEmailDraft={()=>setShowEmailModal(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* Candidate Detail Modal */}
      {selectedCandidate&&(
        <CandidateDetail
          candidate={selectedCandidate}
          onClose={()=>setSelected(null)}
          notes={notes}
          onNoteChange={(filename,note)=>setNotes(p=>({...p,[filename]:note}))}
          onBucketChange={handleBucketOverride}
        />
      )}

      {/* Email Draft Modal */}
      {showEmailModal&&(
        <EmailDraftModal candidates={candidates} overrides={overrides} onClose={()=>setShowEmailModal(false)}/>
      )}
    </div>
  );
}
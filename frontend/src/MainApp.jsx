import { useEffect, useState, useRef } from "react";
import {
  Compass, ClipboardList, User, Target, FileText, Crosshair,
  Briefcase, LayoutGrid, ScanEye,
} from "lucide-react";
import { healthCheck } from "./api/client";
import RecruiterDashboard from "./pages/RecruiterDashboard";
import RecruiterJobs from "./pages/RecruiterJobs";
import CheckCV from "./pages/CheckCV";
import CVBuilder from "./pages/CVBuilder";
import TailorJob from "./pages/TailorJob";
import JobBoard from "./pages/JobBoard";
import MyApplications from "./pages/MyApplications";
import Profile from "./pages/Profile";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// ── API helpers ────────────────────────────────────────────────
async function postForm(endpoint, fd) {
  const token = localStorage.getItem("ats_token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await fetch(`${API_BASE}${endpoint}`, { method: "POST", body: fd, headers });
  let d; try { d = await r.json(); } catch { d = { detail: "Invalid server response" }; }
  if (!r.ok) throw new Error(d?.detail || "Request failed");
  return d;
}
function buildFD(resumeFile, jobText) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("job_text", jobText);
  fd.append("resume_model_name", "gemini-2.5-flash");
  fd.append("job_model_name", "gemini-2.5-flash");
  fd.append("prefer_pdf_vision", "true");
  fd.append("prefer_gemini_job_parser", "true");
  return fd;
}

const DEFAULT_JD = `Python Backend Developer

We are looking for a Python Backend Developer with 3+ years of experience.
Required skills: Python, FastAPI, SQL, Docker, AWS
Preferred skills: REST API, Microservices, Git, Linux
Education: Bachelor's degree in Computer Science or related field
Responsibilities:
- Build scalable backend systems
- Develop REST APIs
- Work with cloud deployment`;

// ── Perspective options ────────────────────────────────────────
const PERSPECTIVES = [
  {
    id:       "score",
    icon:     "◎",
    title:    "ATS Score",
    desc:     "Full numeric score with 6-dimension breakdown, skill gap analysis & keyword match.",
    endpoint: "/score",
    color:    "brass",
  },
  {
    id:       "recruiter",
    icon:     "⬡",
    title:    "Recruiter View",
    desc:     "Internal hiring report — strengths, risks, screening questions & hiring recommendation.",
    endpoint: "/review/internal",
    color:    "burgundy",
  },
  {
    id:       "candidate",
    icon:     "◈",
    title:    "Candidate View",
    desc:     "Privacy-safe feedback — what to improve, skills to add & your personal action plan.",
    endpoint: "/review/candidate",
    color:    "forest",
  },
];

// ── Shared primitives ──────────────────────────────────────────
function VTag({ text, color = "blue" }) {
  return <span className={`vtag ${color}`}>{text}</span>;
}
function LpBadge({ label, type = "brass" }) {
  const t = type==="strong_match"?"green":type==="moderate_match"?"amber":type==="poor_match"?"red":type;
  return <span className={`lp-badge ${t}`}>{label?.replace(/_/g," ")}</span>;
}
function DecoRule({ label }) {
  return <div className="deco-rule">{label||"✦"}</div>;
}
function Spinner({ text = "Analysing your resume…" }) {
  return (
    <div className="v-spinner-wrap">
      <div className="v-spinner" />
      <span>{text}</span>
    </div>
  );
}

function ScoreRing({ score, size = 130, stroke = 12 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const color = pct >= 70 ? "var(--forest2)" : pct >= 45 ? "var(--brass2)" : "var(--burgundy2)";
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--parchment3)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ-(pct/100)*circ}
        strokeLinecap="round"
        style={{transition:"stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)"}}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{transform:"rotate(90deg)",transformOrigin:"center",
          fontSize:size*0.2,fontWeight:"bold",fill:color,font:"inherit"}}>
        {pct.toFixed(0)}
      </text>
    </svg>
  );
}

function VBar({ value=0, label, sublabel }) {
  const pct = Math.min(Math.max(value,0),100);
  const color = pct>=70?"var(--forest2)":pct>=45?"var(--brass2)":"var(--burgundy2)";
  return (
    <div className="vbar-wrap">
      <div className="vbar-header">
        <span className="vbar-label">{label}</span>
        <span className="vbar-val" style={{color}}>{pct.toFixed(1)}</span>
      </div>
      <div className="vbar-track">
        <div className="vbar-fill" style={{width:`${pct}%`,background:color}}/>
      </div>
      {sublabel && <p className="vbar-sub">{sublabel}</p>}
    </div>
  );
}

// ── File drop zone ─────────────────────────────────────────────
function FileDropZone({ file, onChange }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const onDrop = e => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0]; if (f) onChange(f);
  };
  return (
    <div className={`v-drop ${drag?"over":""} ${file?"filled":""}`}
      onDragOver={e=>{e.preventDefault();setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={onDrop}
      onClick={()=>ref.current.click()}>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx"
        style={{display:"none"}} onChange={e=>onChange(e.target.files?.[0]||null)}/>
      {file ? (
        <div className="v-drop-file">
          <span className="v-drop-file-ico">📜</span>
          <div style={{flex:1,minWidth:0}}>
            <p className="v-drop-name">{file.name}</p>
            <p className="v-drop-size">{(file.size/1024).toFixed(1)} KB</p>
          </div>
          <button className="v-drop-remove"
            onClick={e=>{e.stopPropagation();onChange(null);}}>✕</button>
        </div>
      ) : (
        <div className="v-drop-empty">
          <span className="v-drop-icon">📂</span>
          <p className="v-drop-title">Drop your résumé here</p>
          <p className="v-drop-hint">PDF · DOC · DOCX &nbsp;·&nbsp; or click to browse</p>
        </div>
      )}
    </div>
  );
}

// ── Perspective picker card ────────────────────────────────────
function PerspectiveCard({ p, selected, onSelect }) {
  return (
    <button
      className={`persp-card persp-${p.color} ${selected ? "persp-selected" : ""}`}
      onClick={() => onSelect(p.id)}>
      <div className="persp-top">
        <span className="persp-icon">{p.icon}</span>
        {selected && <span className="persp-check">✓</span>}
      </div>
      <h3 className="persp-title">{p.title}</h3>
      <p className="persp-desc">{p.desc}</p>
    </button>
  );
}

// ── Result: ATS Score view ─────────────────────────────────────
function ScoreResult({ result }) {
  if (!result) return null;
  const mt = result.match_label || "neutral";
  return (
    <div className="result-section">
      {/* Hero row */}
      <div className="result-hero">
        <div className="rh-ring">
          <ScoreRing score={result.ats_score} size={150} stroke={13}/>
          <p className="ring-label">ATS Score</p>
        </div>
        <div className="rh-meta">
          <LpBadge label={result.match_label} type={mt}/>
          <h2 className="rh-headline">
            {mt==="strong_match"?"Strong Match ✦":mt==="moderate_match"?"Moderate Match ◈":"Poor Match ✗"}
          </h2>
          <div className="stat-row">
            <div className="stat-box"><span>Legacy</span><strong>{result.legacy_ats_score}</strong></div>
            <div className="stat-box"><span>ML Score</span><strong>{result.ml_score}</strong></div>
            <div className="stat-box"><span>Ranking</span><strong>{result.ranking_score}</strong></div>
            <div className="stat-box"><span>Parser</span><strong style={{fontSize:12}}>{result.parser_mode?.replace(/_/g," ")}</strong></div>
          </div>
          <div className="prob-row">
            {Object.entries(result.class_probabilities||{}).map(([k,v])=>(
              <div key={k} className="prob-item">
                <span>{k.replace(/_/g," ")}</span>
                <strong>{(v*100).toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DecoRule label="◎ SCORE BREAKDOWN ◎"/>
      <div className="breakdown-grid">
        {["skills","experience","education","keywords","semantic","projects"].map(k=>{
          const c=result.breakdown?.[k]; if(!c) return null;
          return (
            <div key={k} className="vcard breakdown-card">
              <VBar value={c.score} label={k.charAt(0).toUpperCase()+k.slice(1)} sublabel={c.summary}/>
              {c.evidence?.length>0&&(
                <div className="pill-row" style={{marginTop:8}}>
                  {c.evidence.slice(0,3).map((e,i)=><VTag key={i} text={e} color="blue"/>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DecoRule label="✦ SKILLS ✦"/>
      <div className="two-col">
        <div className="vcard">
          <h4 className="card-h">Required Skills</h4>
          <p className="kw-label green-text" style={{marginBottom:6}}>✓ Matched</p>
          <div className="pill-row">{result.matched_required_skills?.map(s=><VTag key={s} text={s} color="green"/>)}</div>
          {result.missing_required_skills?.length>0&&<>
            <p className="kw-label red-text" style={{margin:"10px 0 6px"}}>✗ Missing</p>
            <div className="pill-row">{result.missing_required_skills.map(s=><VTag key={s} text={s} color="red"/>)}</div>
          </>}
        </div>
        <div className="vcard">
          <h4 className="card-h">Keywords</h4>
          <p className="kw-label green-text" style={{marginBottom:6}}>✓ Matched ({result.matched_keywords?.length||0})</p>
          <div className="pill-row">{result.matched_keywords?.map(k=><VTag key={k} text={k} color="green"/>)}</div>
          {result.missing_keywords?.length>0&&<>
            <p className="kw-label red-text" style={{margin:"10px 0 6px"}}>✗ Missing ({result.missing_keywords.length})</p>
            <div className="pill-row">{result.missing_keywords.map(k=><VTag key={k} text={k} color="red"/>)}</div>
          </>}
        </div>
      </div>

      {result.notes?.length>0&&(
        <div className="vcard notes-card">
          <h4 className="card-h">Engine Notes</h4>
          <ul className="notes-list">{result.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ── Result: Recruiter view ─────────────────────────────────────
function RecruiterResult({ data }) {
  const fb = data?.internal_feedback;
  const result = data?.ats_result;
  if (!fb||!result) return null;
  const mt = result.match_label||"neutral";
  return (
    <div className="result-section">
      <div className="result-hero">
        <div className="rh-ring">
          <ScoreRing score={result.ats_score} size={150} stroke={13}/>
          <p className="ring-label">ATS Score</p>
        </div>
        <div className="rh-meta">
          <LpBadge label={result.match_label} type={mt}/>
          <h2 className="rh-headline">Candidate Summary</h2>
          <p style={{fontSize:14,color:"var(--ink-soft)",lineHeight:1.7,maxWidth:560}}>{fb.summary}</p>
          <div className="rec-cta-card" style={{marginTop:14}}>
            <span style={{fontSize:22}}>⬡</span>
            <div>
              <p style={{fontWeight:"bold",marginBottom:4}}>Recommendation</p>
              <p style={{fontSize:14,color:"var(--ink-soft)"}}>{fb.recommendation}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="vcard">
          <h4 className="card-h">✓ Strengths</h4>
          <ul className="vlist green">{fb.strengths?.map((s,i)=><li key={i}>{s}</li>)}</ul>
        </div>
        <div className="vcard">
          <h4 className="card-h">⚠ Risks</h4>
          <ul className="vlist red">{fb.risks?.map((r,i)=><li key={i}>{r}</li>)}</ul>
        </div>
      </div>

      <div className="two-col">
        <div className="vcard">
          <h4 className="card-h">Screening Questions</h4>
          <ul className="vlist numbered">{fb.reviewer_questions?.map((q,i)=><li key={i}>{q}</li>)}</ul>
        </div>
        <div className="vcard">
          <h4 className="card-h">Next Actions</h4>
          <div className="action-list">
            {fb.next_actions?.map((a,i)=>(
              <div key={i} className="action-item"><span className="action-arrow">→</span>{a}</div>
            ))}
          </div>
        </div>
      </div>

      <DecoRule label="◎ SCORE BREAKDOWN ◎"/>
      <div className="breakdown-grid">
        {["skills","experience","education","keywords","semantic","projects"].map(k=>{
          const c=result.breakdown?.[k]; if(!c) return null;
          return (
            <div key={k} className="vcard breakdown-card">
              <VBar value={c.score} label={k.charAt(0).toUpperCase()+k.slice(1)} sublabel={c.summary}/>
            </div>
          );
        })}
      </div>

      <div className="two-col">
        {data.parsed_resume&&<div className="vcard"><h4 className="card-h">Parsed Résumé</h4><pre className="json-pre">{JSON.stringify(data.parsed_resume,null,2)}</pre></div>}
        {data.parsed_job&&<div className="vcard"><h4 className="card-h">Parsed Job</h4><pre className="json-pre">{JSON.stringify(data.parsed_job,null,2)}</pre></div>}
      </div>
    </div>
  );
}

// ── Result: Candidate view ─────────────────────────────────────
function CandidateResult({ data }) {
  const fb = data?.candidate_feedback;
  const mt = data?.match_label||"neutral";
  if (!fb) return null;
  return (
    <div className="result-section">
      <div className="result-hero">
        <div className="rh-ring">
          <ScoreRing score={fb.ats_score} size={150} stroke={13}/>
          <p className="ring-label">Your Score</p>
        </div>
        <div className="rh-meta">
          <LpBadge label={data.match_label} type={mt}/>
          <h2 className="rh-headline">{fb.encouragement}</h2>
          <p style={{fontSize:14,color:"var(--ink-soft)",lineHeight:1.7,maxWidth:560}}>{fb.summary}</p>
        </div>
      </div>

      <div className="vcard">
        <h4 className="card-h">✓ Your Strengths</h4>
        <div className="strength-list">
          {fb.strengths?.map((s,i)=>(
            <div key={i} className="strength-item">
              <span className="strength-num">{String(i+1).padStart(2,"0")}</span>
              <p>{s}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="vcard">
        <h4 className="card-h">⬆ Areas to Improve</h4>
        <div className="improve-list">
          {fb.improvement_areas?.map((a,i)=>(
            <div key={i} className="improve-item">
              <span className="improve-dot"/>
              <p>{a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col">
        <div className="vcard">
          <h4 className="card-h">Skills to Add</h4>
          <div className="pill-row">
            {fb.suggested_skills?.map(s=><VTag key={s} text={s} color="amber"/>)}
            {!fb.suggested_skills?.length&&<span className="muted-text">No skill gaps ✦</span>}
          </div>
        </div>
        <div className="vcard">
          <h4 className="card-h">Keywords to Include</h4>
          <div className="pill-row">
            {fb.suggested_keywords?.map(k=><VTag key={k} text={k} color="blue"/>)}
            {!fb.suggested_keywords?.length&&<span className="muted-text">No missing keywords ✦</span>}
          </div>
        </div>
      </div>

      <div className="vcard">
        <h4 className="card-h">Next Steps</h4>
        <div className="steps-list">
          {fb.next_steps?.map((s,i)=>(
            <div key={i} className="step-item">
              <div className="step-num">{i+1}</div>
              <p>{s}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────
function Nav({ health, user, onLogout }) {
  const alive = health?.status==="ok";
  return (
    <nav style={{
      position:"sticky", top:0, zIndex:100,
      background:"var(--pm-chrome-bg)",
      borderBottom:"1px solid var(--pm-chrome-border)",
      backdropFilter:"blur(16px)",
      boxShadow:"var(--pm-shadow-sm)",
      fontFamily:"var(--pm-font)",
    }}>
      <div style={{
        maxWidth:1200, margin:"0 auto", padding:"0 clamp(14px,4vw,32px)",
        minHeight:64, display:"flex", alignItems:"center", justifyContent:"space-between",
        flexWrap:"wrap", gap:8, rowGap:6,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:38, height:38, borderRadius:9,
            background:"var(--pm-accent-bg)", border:"1.5px solid var(--pm-chrome-border-strong)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              <rect x="5" y="3" width="16" height="21" rx="2.5" fill="var(--pm-chrome-bg)" stroke="var(--pm-accent-solid)" strokeWidth="1.4"/>
              <line x1="9" y1="9"  x2="17" y2="9"  stroke="var(--pm-accent-solid)" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="9" y1="13" x2="17" y2="13" stroke="var(--pm-accent-solid)" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="9" y1="17" x2="13" y2="17" stroke="var(--pm-accent-solid)" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="25" cy="26" r="7" fill="var(--pm-chrome-bg)" stroke="var(--pm-accent-solid)" strokeWidth="1.6"/>
              <line x1="30" y1="31" x2="33" y2="34" stroke="var(--pm-accent-solid)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <span style={{ display:"block", fontSize:17, fontWeight:"bold", lineHeight:1.1 }}>
              <span style={{ color:"var(--pm-chrome-text)" }}>Resume</span><span style={{ color:"var(--pm-accent-solid)" }}>Xpert</span>
            </span>
            <span style={{ display:"block", fontSize:9, letterSpacing:".13em", textTransform:"uppercase", color:"var(--pm-chrome-text-muted)" }}>Smart Resume · Career Edge</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {user && (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:12, color:"var(--pm-chrome-text-secondary)", fontWeight:"bold" }}>{user.full_name || user.email}</span>
              <span style={{ fontSize:10, padding:"2px 9px", borderRadius:5, background:"var(--pm-accent-bg)", border:"1px solid var(--pm-chrome-border-strong)", color:"var(--pm-accent-solid)", fontWeight:"bold", textTransform:"uppercase", letterSpacing:".06em" }}>{user.role}</span>
              <button onClick={onLogout} style={{ fontSize:11, color:"var(--pm-chrome-text-secondary)", background:"var(--pm-chrome-bg-hover)", border:"1px solid var(--pm-chrome-border)", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontFamily:"inherit" }}>Logout</button>
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--pm-chrome-text-muted)" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:alive?"#22883f":"#c53030", boxShadow:alive?"0 0 6px #22883f":"0 0 6px #c53030", display:"inline-block" }}/>
            <span className="rx-hide-mobile">{alive ? "Online" : "API Offline"}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ── Footer ─────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{
      padding:"18px 40px",
      background:"var(--pm-chrome-bg)",
      borderTop:"1px solid var(--pm-chrome-border)",
      fontFamily:"var(--pm-font)",
    }}>
      <div style={{
        maxWidth:1160, margin:"0 auto",
        display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <svg width="16" height="16" viewBox="0 0 36 36" fill="none">
            <rect x="5" y="3" width="16" height="21" rx="2.5" fill="var(--pm-chrome-bg)" stroke="var(--pm-accent-solid)" strokeWidth="1.4"/>
            <circle cx="25" cy="26" r="7" fill="var(--pm-chrome-bg)" stroke="var(--pm-accent-solid)" strokeWidth="1.6"/>
            <line x1="30" y1="31" x2="33" y2="34" stroke="var(--pm-accent-solid)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize:13, fontWeight:"bold", color:"var(--pm-accent-solid)" }}>ResumeXpert</span>
        </div>
        <p style={{ fontSize:11, color:"var(--pm-chrome-text-muted)", letterSpacing:".04em", margin:0 }}>
          © {new Date().getFullYear()} ResumeXpert · Smart Resume · Career Edge
        </p>
      </div>
    </footer>
  );
}

// ── ROOT APP ───────────────────────────────────────────────────
export default function MainApp({ user, onLogout }) {
  const [health, setHealth]       = useState(null);
  const [page, setPage]           = useState("jobs"); // "jobs" | "check" | "build" | "tailor"
  const [resumeFile, setResume]   = useState(null);
  const [jobText, setJobText]     = useState(DEFAULT_JD);
  const [perspective, setPersp]   = useState(null);   // "score" | "recruiter" | "candidate"
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [result, setResult]       = useState(null);
  const [resultType, setResType]  = useState(null);

  const resultRef = useRef(null);

  useEffect(()=>{
    healthCheck().then(setHealth).catch(()=>setHealth({status:"offline"}));
  },[]);

  const canRun = resumeFile && jobText.trim() && perspective;

  async function handleRun() {
    if (!canRun) return;
    const p = PERSPECTIVES.find(x=>x.id===perspective);
    try {
      setLoading(true); setError(""); setResult(null); setResType(null);
      const d = await postForm(p.endpoint, buildFD(resumeFile, jobText));
      setResult(d);
      setResType(perspective);
      setTimeout(()=>resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 100);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  function handleReset() {
    setResume(null); setJobText(DEFAULT_JD);
    setPersp(null); setResult(null); setResType(null); setError("");
  }

  // If recruiter, show recruiter dashboard
  if (user?.role === "recruiter") {
    return (
      <div className="theme-recruiter">
        <Nav health={health} user={user} onLogout={onLogout}/>
        <main style={{ minHeight:"calc(100vh - 64px - 56px)", padding:"32px 24px 48px", fontFamily:"var(--pm-font)" }}>
          <div style={{
            display:"flex", gap:4, maxWidth:480,
            margin:"0 auto 32px",
            background:"var(--pm-chrome-bg)",
            border:"1px solid var(--pm-chrome-border)",
            boxShadow:"var(--pm-shadow-sm)",
            borderRadius:12, padding:4,
          }}>
            {[
              { id:"recjobs",   label:"Job Postings",    Icon: Briefcase },
              { id:"recprofile",label:"Company Profile", Icon: User },
              { id:"recscreen", label:"Quick Screen",    Icon: ScanEye },
            ].map(t => {
              const active = page===t.id || (page==="jobs" && t.id==="recjobs");
              return (
                <button key={t.id}
                  onClick={() => setPage(t.id)}
                  style={{
                    flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                    padding:"11px 12px",
                    background: active ? "var(--pm-accent-solid)" : "transparent",
                    color: active ? "var(--pm-accent-on)" : "var(--pm-chrome-text-secondary)",
                    border:"none", borderRadius:9,
                    fontSize:13.5, fontWeight:800,
                    fontFamily:"inherit", cursor:"pointer",
                    letterSpacing:".02em", transition:"all .2s",
                  }}
                ><t.Icon size={15} strokeWidth={2.4}/>{t.label}</button>
              );
            })}
          </div>
          {page === "recscreen" ? <RecruiterDashboard/> : page === "recprofile" ? <Profile/> : <RecruiterJobs/>}
        </main>
        <Footer/>
      </div>
    );
  }

  return (
    <div className="theme-candidate">
      <Nav health={health} user={user} onLogout={onLogout}/>
      <main style={{
        minHeight:"calc(100vh - 64px - 56px)",
        padding:"32px 24px 48px",
        fontFamily:"var(--pm-font)",
      }}>
        {/* ── Tabs ── */}
        <div style={{
          display:"flex", gap:4, maxWidth:760,
          margin:"0 auto 32px",
          background:"var(--pm-chrome-bg)",
          border:"1px solid var(--pm-chrome-border)",
          boxShadow:"var(--pm-shadow-sm)",
          borderRadius:12, padding:4,
        }}>
          {[
            { id:"jobs",   label:"Browse Jobs",     Icon: Compass },
            { id:"myapps", label:"My Applications", Icon: ClipboardList },
            { id:"profile",label:"My Profile",      Icon: User },
            { id:"check",  label:"Check CV",         Icon: Target },
            { id:"build",  label:"Build CV",         Icon: FileText },
            { id:"tailor", label:"Tailor for Job",   Icon: Crosshair },
          ].map(t => (
            <button key={t.id}
              onClick={() => setPage(t.id)}
              style={{
                flex:"1 1 auto", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                padding:"11px 10px",
                background: page===t.id
                  ? "var(--pm-accent-solid)"
                  : "transparent",
                color: page===t.id ? "var(--pm-accent-on)" : "var(--pm-chrome-text-secondary)",
                border:"none", borderRadius:9,
                fontSize:13.5, fontWeight:800,
                fontFamily:"inherit", cursor:"pointer",
                letterSpacing:".01em", transition:"all .2s",
                whiteSpace:"nowrap",
              }}
            ><t.Icon size={15} strokeWidth={2.4}/>{t.label}</button>
          ))}
        </div>

        {page === "jobs"   ? <JobBoard/>           : null}
        {page === "myapps" ? <MyApplications/>     : null}
        {page === "profile"? <Profile/>            : null}
        {page === "check"  ? <CheckCV/>           : null}
        {page === "build"  ? <CVBuilder/>          : null}
        {page === "tailor" ? <TailorJob/>          : null}
      </main>
      <Footer/>
    </div>
  );
}
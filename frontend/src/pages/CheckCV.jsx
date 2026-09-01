import { useState, useRef, Component } from "react";
import { Lightbulb, Settings2, KeyRound, ListChecks } from "lucide-react";
import { checkCVQuality } from "../api/client";
import { ScoreRing, Spinner, FileDropZone } from "../components/ui";

/* ── Error Boundary: catches render crashes and shows a message instead of blank screen ── */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error("[CheckCV] Render crash:", err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          margin: "24px 0", padding: "20px 24px",
          background: "#fff2ef", border: "1px solid #efc5bc",
          borderRadius: 12, color: "#b85f46",
        }}>
          <p style={{ fontWeight: "bold", marginBottom: 8 }}>⚠ Results failed to render</p>
          <p style={{ fontSize: 13, opacity: .8, marginBottom: 12 }}>
            The API returned data but the display crashed. Check the browser console for details.
          </p>
          <pre style={{ fontSize: 11, opacity: .6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error.message}
          </pre>
          <button
            style={{ marginTop: 12, padding: "8px 16px", background: "#fde6e1",
              border: "1px solid rgba(220,80,60,.4)", color: "#b85f46",
              borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
            onClick={() => this.setState({ error: null })}>
            ✕ Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Botanical deco element (matches homepage Bot) ── */
function Bot({ style }) {
  return (
    <svg viewBox="0 0 40 40" fill="none"
      style={{ position: "absolute", opacity: 0.13, pointerEvents: "none", ...style }}
      width="32" height="32">
      <circle cx="20" cy="20" r="3" fill="#b8ae98"/>
      {[[20,17,20,4],[20,23,20,36],[17,20,4,20],[23,20,36,20],
        [17.9,17.9,8.5,8.5],[22.1,22.1,31.5,31.5],
        [22.1,17.9,31.5,8.5],[17.9,22.1,8.5,31.5]].map(([x1,y1,x2,y2],i)=>(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#d7cfbf" strokeWidth={i<4?1.2:.9}/>
      ))}
    </svg>
  );
}

/* ── Mini score bar ── */
function DimBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight:"bold", color:"rgba(232,220,168,.72)",
          textTransform:"uppercase", letterSpacing:".07em" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight:"bold", color }}>{value}</span>
      </div>
      <div style={{ height: 6, background:"rgba(201,168,76,.12)", borderRadius: 99, overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${value}%`, borderRadius: 99,
          background: color,
          animation: "ccv-bar .9s ease both",
        }}/>
      </div>
    </div>
  );
}

/* ── Tag pill ── */
function Tag({ children, variant = "amber", onClick, active }) {
  const colors = {
    amber: { bg:"#f5f1e6", border:"#ddd5c6", color:"#8a6d2f" },
    green: { bg:"#eef6ef", border:"#cfe2d2", color:"#4f8a5b" },
    blue:  { bg:"#eef4fb", border:"#cfdaea", color:"#4f77a3" },
  };
  const c = colors[variant];
  return (
    <span
      onClick={onClick}
      style={{
        display:"inline-flex", alignItems:"center",
        padding:"4px 11px", borderRadius: 6,
        background: active ? c.color : c.bg,
        border:`1px solid ${c.border}`,
        fontSize: 11, fontWeight:"bold", color: active ? "#fff" : c.color,
        letterSpacing:".04em",
        cursor: onClick ? "pointer" : "default",
        transition: "all .15s",
      }}>{children}{onClick && <span style={{ marginLeft:5, opacity:.7, fontSize:9 }}>{active ? "▲" : "▼"}</span>}</span>
  );
}

/* ── Interactive keyword: click to see how/where to add it ── */
function KeywordTag({ text, variant, kind }) {
  const [open, setOpen] = useState(false);
  const tip = kind === "skill"
    ? "This skill doesn't clearly appear in your resume. If you have real experience with it, add it to your Skills section — or better, work it into a bullet point under the relevant role so it reads as demonstrated, not just listed."
    : "This keyword is commonly matched by ATS systems for roles like yours but wasn't found in your resume. Consider adding it naturally to your Skills section or a relevant experience bullet, only if it genuinely applies to you.";
  return (
    <div style={{ display:"inline-block" }}>
      <Tag variant={variant} onClick={()=>setOpen(o=>!o)} active={open}>{text}</Tag>
      {open && (
        <div style={{
          marginTop:6, marginBottom:2, maxWidth:260, fontSize:11.5, lineHeight:1.6,
          color:"var(--ink-soft)", background:"var(--parchment2)",
          border:"1px solid var(--border2)", borderRadius:8, padding:"8px 10px",
        }}>
          <span style={{ display:"inline-flex", alignItems:"flex-start", gap:6 }}>
            <Lightbulb size={13} strokeWidth={2} style={{ flexShrink:0, marginTop:2 }}/> {tip}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Section card ── */
function VCard({ icon, title, children, accent = false }) {
  return (
    <div style={{
      background: accent
        ? "#f7f3ea"
        : "#ffffff",
      border: `1px solid ${accent ? "#d9cfbb" : "#e7e1d5"}`,
      borderRadius: 12, padding:"20px 22px", marginBottom: 14,
    }}>
      {title && (
        <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 14 }}>
          {icon && <span style={{ display:"flex", color:"rgba(201,168,76,.85)" }}>{icon}</span>}
          <h4 style={{ margin:0, fontSize:13, fontWeight:"bold",
            textTransform:"uppercase", letterSpacing:".1em",
            color:"rgba(201,168,76,.85)" }}>{title}</h4>
        </div>
      )}
      {children}
    </div>
  );
}

/* ── List items ── */
function CheckList({ items, type = "strength" }) {
  const icon = type === "strength" ? "✓" : "→";
  const iconColor = type === "strength" ? "#5ac070" : "#c9a84c";
  return (
    <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ color: iconColor, fontWeight:"bold", fontSize:13,
            marginTop:1, flexShrink:0 }}>{icon}</span>
          <span style={{ fontSize:13, color:"#111", lineHeight:1.65, fontWeight:500 }}>
            {extractText(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function extractText(item) {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (Array.isArray(item)) return item.map(extractText).filter(Boolean).join(", ");
  if (typeof item === "object") {
    if (typeof item.summary === "string") return item.summary;
    if (typeof item.area === "string") return item.area;
    if (typeof item.suggestion === "string") return item.suggestion;
    if (typeof item.action === "string") return item.action;
    if (typeof item.label === "string") return item.label;
    if (typeof item.name === "string") return item.name;
    if (typeof item.title === "string") return item.title;
    if (typeof item.value === "string" || typeof item.value === "number") return String(item.value);
    return JSON.stringify(item);
  }
  return String(item);
}

function extractScore(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && typeof val.score === "number") return val.score;
  return 0;
}

const DIM_COLORS = {
  contact:        "linear-gradient(90deg,#4caf76,#38d070)",
  sections:       "linear-gradient(90deg,#c9a84c,#e8c84a)",
  achievements:   "linear-gradient(90deg,#5b9bd5,#78b8f0)",
  readability:    "linear-gradient(90deg,#e07c5a,#f09a72)",
  skills_clarity: "linear-gradient(90deg,#9b7bd5,#b89af0)",
};
const DIM_LABELS = {
  contact:"Contact Info", sections:"Sections", achievements:"Achievements",
  readability:"Readability", skills_clarity:"Skills Clarity",
};
const DIM_SOLID = {
  contact:"#38d070", sections:"#c9a84c", achievements:"#78b8f0",
  readability:"#f09a72", skills_clarity:"#b89af0",
};

export default function CheckCV({ guestMode = false, onSignUp } = {}) {
  const [file, setFile]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [result, setResult]   = useState(null);
  const [showControls, setShowControls] = useState(true);
  const resultRef             = useRef();

  async function handleCheck() {
    if (!file) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await checkCVQuality(file);
      console.log("[CheckCV] API response:", data);
      if (!data || typeof data !== "object") {
        throw new Error("Unexpected response format from server");
      }
      setResult(data);
      setShowControls(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 120);
    } catch (e) {
      console.error("[CheckCV] Error:", e);
      setError(e.message || "An unknown error occurred");
    }
    finally { setLoading(false); }
  }

  const fb = result?.candidate_feedback;
  const qr = result?.resume_quality_result;
  const qs = result?.score_summary;
  const pf = result?.profile;

  const score     = extractScore(qs?.resume_quality_score);
  const scoreGrade = score >= 75 ? { label:"Strong ATS Profile", icon:"✦", color:"#5ac070" }
                   : score >= 50 ? { label:"Decent — Room to Improve", icon:"◈", color:"#c9a84c" }
                   :               { label:"Needs Significant Work", icon:"✗", color:"#e07c5a" };

  return (
    <>
      <style>{`
        @keyframes ccv-fade-up {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes ccv-bar { from { width:0; } }
        @keyframes ccv-ring-appear {
          from { opacity:0; transform:scale(.88); }
          to   { opacity:1; transform:scale(1); }
        }
        .ccv-wrap { animation: ccv-fade-up .5s ease both; }
        .ccv-controls {
          max-height: 1000px;
          overflow: hidden;
          transition: max-height .35s ease, opacity .25s ease, transform .25s ease, margin .25s ease;
        }
        .ccv-controls.collapsed {
          max-height: 0;
          opacity: 0;
          transform: translateY(-8px);
          margin-bottom: 0;
          pointer-events: none;
        }
        .ccv-step {
          background: rgba(12,18,8,.72);
          border: 1px solid rgba(201,168,76,.15);
          border-radius: 14px;
          padding: 24px 26px;
          margin-bottom: 16px;
          backdrop-filter: blur(8px);
          position: relative;
          overflow: hidden;
        }
        .ccv-step-label {
          display: flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: bold;
          letter-spacing: .14em; text-transform: uppercase;
          color: rgba(179, 188, 109, 0.99);
          margin-bottom: 16px;
        }
        .ccv-num {
          width: 24px; height: 24px; border-radius: 50%;
          background: #c9a84c; color: #1a1208;
          font-size: 12px; font-weight: bold;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ccv-btn-row {
          display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;
        }
        .ccv-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 28px;
          background: linear-gradient(135deg,#c9a84c,#deba52);
          color: #150c02; font-size: 13px; font-weight: bold;
          font-family: inherit; border: none; border-radius: 8px;
          cursor: pointer; letter-spacing: .04em;
          box-shadow: 0 4px 18px rgba(201,168,76,.32);
          transition: all .22s;
        }
        .ccv-btn:hover:not(:disabled) {
          background: linear-gradient(135deg,#deba52,#f0cc5a);
          transform: translateY(-2px);
          box-shadow: 0 8px 26px rgba(201,168,76,.44);
        }
        .ccv-btn:disabled {
          opacity: .42; cursor: not-allowed; transform: none;
        }
        .ccv-btn.ghost {
          background: rgba(201,168,76,.1);
          color: rgba(225, 136, 67, 0.7);
          border: 1px solid rgba(201,168,76,.22);
          box-shadow: none;
        }
        .ccv-btn.ghost:hover {
          background: rgba(201,168,76,.18);
          transform: translateY(-1px);
        }
        .ccv-results {
          animation: ccv-fade-up .45s ease both;
          border: 1px solid #ddd6c8;
          border-radius: 16px;
          overflow: hidden;
          margin-top: 8px;
        }
        .ccv-results-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 22px;
          background: #f3f1ea;
          border-bottom: 1px solid rgba(201,168,76,.2);
        }
        .ccv-results-title {
          font-size: 11px; font-weight: bold;
          letter-spacing: .16em; text-transform: uppercase;
          color: #6f531d;
        }
        .ccv-results-body {
          background: #faf9f6;
          padding: 28px 26px;
        }
        .ccv-score-hero {
          display: flex; align-items: center; gap: 28px;
          margin-bottom: 28px; flex-wrap: wrap;
          animation: ccv-ring-appear .5s ease both;
        }
        .ccv-ring-wrap {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          flex-shrink: 0;
        }
        .ccv-ring-label {
          font-size: 10px; font-weight: bold;
          letter-spacing: .12em; text-transform: uppercase;
          color: #5b5b5b;
        }
        .ccv-meta { flex: 1; min-width: 200px; }
        .ccv-grade {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 10px;
        }
        .ccv-grade-text {
          font-size: 20px; font-weight: 800; color: #111111;
        }
        .ccv-grade-icon {
          font-size: 18px;
        }
        .ccv-summary {
          font-size: 13.5px; color: #222222;
          line-height: 1.78; margin-bottom: 12px;
        }
        .ccv-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .ccv-divider {
          display: flex; align-items: center; gap: 14px;
          margin: 22px 0 18px;
        }
        .ccv-divider-line {
          flex: 1; height: 1px;
          background: #e5dfd2;
        }
        .ccv-divider-txt {
          font-size: 9px; font-weight: bold;
          letter-spacing: .18em; text-transform: uppercase;
          color: #7a6a45; white-space: nowrap;
        }
        .ccv-dim-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .ccv-dim-card {
          background: #ffffff;
          border: 1px solid #e7e1d5;
          border-radius: 10px; padding: 14px 16px;
        }
        .ccv-dim-top {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 8px;
        }
        .ccv-dim-name {
          font-size: 11px; font-weight: bold;
          color: #4b4b4b;
          text-transform: uppercase; letter-spacing: .08em;
        }
        .ccv-dim-val {
          font-size: 16px; font-weight: 800; color: #111111;
        }
        .ccv-dim-bar-track {
          height: 5px; background: #f3efe4;
          border-radius: 99px; overflow: hidden;
        }
        .ccv-dim-bar-fill {
          height: 100%; border-radius: 99px;
          animation: ccv-bar 1.1s ease both;
        }
        .ccv-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .ccv-pill-row {
          display: flex; flex-wrap: wrap; gap: 7px;
        }
        .ccv-steps-list {
          display: flex; flex-direction: column; gap: 10px;
        }
        .ccv-step-item {
          display: flex; gap: 12px; align-items: flex-start;
        }
        .ccv-step-num {
          width: 22px; height: 22px; border-radius: 50%;
          border: 1.5px solid #d8cdb7;
          color: #8a6d2f; font-size: 11px; font-weight: bold;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 1px;
        }
        .ccv-encourage {
          margin-top: 22px;
          background: #f7f3ea;
          border: 1px solid #ddd3c2;
          border-radius: 12px; padding: 18px 20px;
          display: flex; gap: 12px; align-items: flex-start;
        }
        .ccv-encourage-icon {
          font-size: 20px; flex-shrink: 0; margin-top: 1px;
        }
        .ccv-encourage-text {
          font-size: 13px; color: #222222;
          line-height: 1.75; font-style: italic;
        }
        @media(max-width:640px) {
          .ccv-score-hero { gap: 18px; }
          .ccv-two-col { grid-template-columns: 1fr; }
          .ccv-results-body { padding: 20px 16px; }
          .ccv-step { padding: 18px 16px; }
        }
      `}</style>

      <div className="ccv-wrap" style={{ maxWidth: 820, margin: "0 auto", color: "#2c2c2c" }}>

        {/* ── Hero ── */}
        <div style={{ textAlign:"center", padding:"36px 0 28px", position:"relative" }}>
          <Bot style={{ top:10, left:"5%"  }}/>
          <Bot style={{ top:10, right:"5%" }}/>

          <p style={{
            fontSize:10, fontWeight:"bold", letterSpacing:".18em",
            textTransform:"uppercase", color:"#6f531d",
            marginBottom: 12,
          }}>✦ &nbsp;CV Quality Check&nbsp; ✦</p>

          <h1 style={{
            fontSize:"clamp(26px,4.5vw,40px)", fontWeight:"bold",
            lineHeight:1.12, margin:"0 0 14px",
            fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          }}>
            <span style={{ color:"#111111" }}>Check Your CV.</span><br/>
            <span style={{
              background:"linear-gradient(108deg,#8a6010 0%,#c9a84c 22%,#f5e888 42%,#fffce0 50%,#f5e888 58%,#c9a84c 78%,#8a6010 100%)",
              backgroundSize:"240% auto",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
              backgroundClip:"text",
              animation:"shimmer 3s linear infinite",
            }}>Get ATS Feedback.</span>
          </h1>

          <p style={{
            fontSize:14, color:"#222",
            lineHeight:1.78, maxWidth:460, margin:"0 auto",
          }}>
            Upload your resume — no job description needed.<br></br> Get an instant ATS quality
            score with personalised improvement suggestions.
          </p>
        </div>

        <div className={`ccv-controls ${showControls ? "" : "collapsed"}`}>
          {/* ── Step 1: Upload ── */}
          <div className="ccv-step">
            <div className="ccv-step-label">
              <span className="ccv-num">1</span>
              Upload Your Resume
            </div>
            <FileDropZone file={file} onChange={f => { setFile(f); setResult(null); setShowControls(true); }}/>
          </div>

          {/* ── Step 2: Run ── */}
          <div className="ccv-step">
            <div className="ccv-step-label">
              <span className="ccv-num">2</span>
              Run Analysis
            </div>
            <div className="ccv-btn-row">
              <button className="ccv-btn" disabled={!file || loading} onClick={handleCheck}>
                {loading ? "Analysing…" : "◎ Check CV Quality"}
              </button>
              <button className="ccv-btn ghost"
                onClick={() => { setFile(null); setResult(null); setError(""); setShowControls(true); }}>
                ✕ Reset
              </button>
            </div>
            {loading && (
              <div style={{ textAlign:"center", marginTop:18 }}>
                <Spinner text="Analysing your résumé…"/>
              </div>
            )}
            {error && (
              <div style={{
                marginTop:14, padding:"12px 16px",
                background:"#fff2ef", border:"1px solid #efc5bc",
                borderRadius:8, color:"#b85f46", fontSize:13,
              }}>⚠ {error}</div>
            )}
          </div>
        </div>

        {!showControls && result && (
          <div style={{ display:"flex", justifyContent:"flex-end", margin:"4px 0 12px" }}>
            <button
              className="ccv-btn ghost"
              style={{ padding:"7px 14px", fontSize:12 }}
              onClick={() => setShowControls(true)}
            >
              Show Upload Panel
            </button>
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <ErrorBoundary key={JSON.stringify(result).slice(0,50)}>
          <div className="ccv-results" ref={resultRef}>
            {/* Header bar */}
            <div className="ccv-results-header">
              <span className="ccv-results-title">◎ &nbsp;Resume Quality Report</span>
              <button className="ccv-btn ghost"
                style={{ padding:"6px 14px", fontSize:12 }}
                onClick={() => { setResult(null); setShowControls(true); }}>✕ Close</button>
            </div>

            <div className="ccv-results-body">

              {/* Score hero */}
              <div className="ccv-score-hero">
                <div className="ccv-ring-wrap">
                  <ScoreRing score={score} size={140} stroke={12}/>
                  <span className="ccv-ring-label">Quality Score</span>
                </div>
                <div className="ccv-meta">
                  <div className="ccv-grade">
                    <span className="ccv-grade-icon" style={{ color: scoreGrade.color }}>
                      {scoreGrade.icon}
                    </span>
                    <span className="ccv-grade-text">{scoreGrade.label}</span>
                  </div>
                  <p className="ccv-summary">{extractText(fb?.summary)}</p>
                  {pf?.candidate_name && (
                    <div className="ccv-tags">
                      <Tag variant="green">{pf.candidate_name}</Tag>
                      {pf.email    && <Tag variant="blue">{pf.email}</Tag>}
                      {pf.location && <Tag variant="blue">{pf.location}</Tag>}
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="ccv-divider">
                <span className="ccv-divider-line"/>
                <span className="ccv-divider-txt">✦ &nbsp;Quality Breakdown&nbsp; ✦</span>
                <span className="ccv-divider-line"/>
              </div>

              {/* Dimension cards */}
              <div className="ccv-dim-grid">
                {["contact","sections","achievements","readability","skills_clarity"].map(key => {
                  const raw = qr?.quality_breakdown?.[key];
                  const val = extractScore(raw);
                  return (
                    <div key={key} className="ccv-dim-card">
                      <div className="ccv-dim-top">
                        <span className="ccv-dim-name">{DIM_LABELS[key]}</span>
                        <span className="ccv-dim-val" style={{ color: DIM_SOLID[key] }}>{val}</span>
                      </div>
                      <div className="ccv-dim-bar-track">
                        <div className="ccv-dim-bar-fill"
                          style={{ width:`${val}%`, background: DIM_COLORS[key] }}/>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Strengths */}
              {fb?.strengths?.length > 0 && (
                <>
                  <div className="ccv-divider">
                    <span className="ccv-divider-line"/>
                    <span className="ccv-divider-txt">✦ &nbsp;Strengths&nbsp; ✦</span>
                    <span className="ccv-divider-line"/>
                  </div>
                  <VCard>
                    <CheckList items={fb.strengths} type="strength"/>
                  </VCard>
                </>
              )}

              {/* Priority improvements */}
              {(fb?.job_specific_improvement_areas?.length > 0 ||
                fb?.general_improvement_areas?.length > 0 ||
                fb?.improvement_areas?.length > 0) && (
                <>
                  <div className="ccv-divider">
                    <span className="ccv-divider-line"/>
                    <span className="ccv-divider-txt">✦ &nbsp;Improvements&nbsp; ✦</span>
                    <span className="ccv-divider-line"/>
                  </div>
                  <div className="ccv-two-col">
                    {fb?.job_specific_improvement_areas?.length > 0 && (
                      <VCard icon="⬆" title="Priority Improvements">
                        <CheckList items={fb.job_specific_improvement_areas} type="improve"/>
                      </VCard>
                    )}
                    {fb?.general_improvement_areas?.length > 0 && (
                      <VCard icon="◈" title="General Improvements">
                        <CheckList items={fb.general_improvement_areas} type="improve"/>
                      </VCard>
                    )}
                    {!fb?.job_specific_improvement_areas?.length &&
                     !fb?.general_improvement_areas?.length &&
                     fb?.improvement_areas?.length > 0 && (
                      <VCard icon="⬆" title="Areas to Improve" style={{ gridColumn:"span 2" }}>
                        <CheckList items={fb.improvement_areas} type="improve"/>
                      </VCard>
                    )}
                  </div>
                </>
              )}

              {/* Skills + Keywords */}
              {(fb?.suggested_skills?.length > 0 || fb?.suggested_keywords?.length > 0) && (
                <>
                  <div className="ccv-divider">
                    <span className="ccv-divider-line"/>
                    <span className="ccv-divider-txt">✦ &nbsp;Suggested Additions&nbsp; ✦</span>
                    <span className="ccv-divider-line"/>
                  </div>
                  <div className="ccv-two-col">
                    {fb.suggested_skills?.length > 0 && (
                      <VCard icon={<Settings2 size={16} strokeWidth={2}/>} title="Skills to Add">
                        <div className="ccv-pill-row">
                          {fb.suggested_skills.map((s, i)=><KeywordTag key={i} text={extractText(s)} variant="amber" kind="skill"/>)}
                        </div>
                      </VCard>
                    )}
                    {fb.suggested_keywords?.length > 0 && (
                      <VCard icon={<KeyRound size={16} strokeWidth={2}/>} title="Keywords to Include">
                        <div className="ccv-pill-row">
                          {fb.suggested_keywords.map((k, i)=><KeywordTag key={i} text={extractText(k)} variant="blue" kind="keyword"/>)}
                        </div>
                      </VCard>
                    )}
                  </div>
                </>
              )}

              {/* Rebuild focus */}
              {fb?.rebuild_focus_areas?.length > 0 && (
                <>
                  <div className="ccv-divider">
                    <span className="ccv-divider-line"/>
                    <span className="ccv-divider-txt">✦ &nbsp;Rebuild Focus&nbsp; ✦</span>
                    <span className="ccv-divider-line"/>
                  </div>
                  <VCard icon="◎" title="Rebuild Focus Areas" accent>
                    <div className="ccv-pill-row">
                      {fb.rebuild_focus_areas.map((a, i)=><Tag key={i} variant="amber">{extractText(a)}</Tag>)}
                    </div>
                  </VCard>
                </>
              )}

              {/* Next steps */}
              {fb?.next_steps?.length > 0 && (
                <>
                  <div className="ccv-divider">
                    <span className="ccv-divider-line"/>
                    <span className="ccv-divider-txt">✦ &nbsp;Next Steps&nbsp; ✦</span>
                    <span className="ccv-divider-line"/>
                  </div>
                  <VCard icon={<ListChecks size={16} strokeWidth={2}/>} title="Action Plan">
                    <div className="ccv-steps-list">
                      {fb.next_steps.map((step, i) => (
                        <div key={i} className="ccv-step-item">
                          <span className="ccv-step-num">{String(i+1).padStart(2,"0")}</span>
 <span style={{ fontSize:13, color:"#2e2b2b", lineHeight:1.7, fontWeight:600 }}>
                            {extractText(step)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </VCard>
                </>
              )}

              {/* Encouragement */}
              {fb?.encouragement && (
                <div className="ccv-encourage">
                  <span className="ccv-encourage-icon">✦</span>
                  <p className="ccv-encourage-text">{extractText(fb.encouragement)}</p>
                </div>
              )}

              {/* Guest CTA — offer to save progress with a free account */}
              {guestMode && (
                <div style={{
                  marginTop: 22, padding: "20px 22px", borderRadius: 12,
                  background: "#f7f3ea", border: "1px solid #ddd3c2",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 16, flexWrap: "wrap",
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: "bold", color: "#3a2f16" }}>
                      Want to track improvements over time?
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#5c5240" }}>
                      Create a free account to save this result, compare future versions, and match against real jobs.
                    </p>
                  </div>
                  <button
                    onClick={onSignUp}
                    style={{
                      flexShrink: 0, padding: "10px 20px", borderRadius: 9, border: "none",
                      background: "linear-gradient(135deg,#c9a84c,#deba52)", color: "#1a1208",
                      fontWeight: "bold", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Create Free Account →
                  </button>
                </div>
              )}

            </div>
          </div>
          </ErrorBoundary>
        )}
      </div>
    </>
  );
}
import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function authHeaders(json = true) {
  const t = localStorage.getItem("ats_token");
  const h = t ? { Authorization: `Bearer ${t}` } : {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function Field({ label, hint, children }) {
  return (
    <div className="cv-field">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label className="field-label">{label}</label>
        {hint && <span style={{ fontSize: 10, color: "var(--brass)", letterSpacing: ".04em" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function Input(props) { return <input className="auth-input" {...props} />; }
function Textarea(props) { return <textarea className="auth-input" style={{ minHeight: 72, resize: "vertical" }} {...props} />; }

function ListSection({ items, onAdd, onRemove, renderItem }) {
  return (
    <div className="cv-list-section">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button type="button" className="stamp-btn secondary" style={{ padding: "4px 14px", fontSize: 12 }} onClick={onAdd}>+ Add</button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="cv-list-item">
          {renderItem(item, i)}
          <button type="button" className="v-drop-remove" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onRemove(i)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function parsedToForm(data) {
  if (!data) return null;
  return {
    candidate_name: data.candidate_name || "",
    headline: data.headline || "",
    email: data.email || "",
    phone: data.phone || "",
    location: data.location || "",
    linkedin: data.linkedin || "",
    github: data.github || "",
    portfolio: data.portfolio || "",
    summary: data.summary || "",
    skills: { technical: data.skills?.technical || [], tools: data.skills?.tools || [], soft: data.skills?.soft || [] },
    experience: (data.experience || []).map(e => ({ job_title: e.job_title || "", company: e.company || "", start_date: e.start_date || "", end_date: e.end_date || "", responsibilities: e.responsibilities?.length ? e.responsibilities : [""], technologies: e.technologies || [] })),
    education: (data.education || []).map(e => ({ degree: e.degree || "", institution: e.institution || "", start_date: e.start_date || "", end_date: e.end_date || "", grade: e.grade || "" })),
    projects: (data.projects || []).map(p => ({ name: p.name || "", description: p.description || "", technologies: p.technologies || [], link: p.link || "" })),
    certifications: (data.certifications || []).map(c => ({ name: c.name || "", issuer: c.issuer || "", date: c.date || "" })),
    languages: data.languages || [],
  };
}

const EMPTY_FORM = { candidate_name: "", headline: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "", summary: "", skills: { technical: [], tools: [], soft: [] }, experience: [], education: [], projects: [], certifications: [], languages: [] };

function MiniRing({ score, size = 56, stroke = 6 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const color = pct >= 70 ? "var(--forest2)" : pct >= 45 ? "var(--brass2)" : "var(--burgundy2)";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--parchment3)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ-(pct/100)*circ} strokeLinecap="round"
        style={{ transition:"stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ transform:"rotate(90deg)",transformOrigin:"center",fontSize:size*0.22,fontWeight:"bold",fill:color,font:"inherit" }}>
        {pct.toFixed(0)}
      </text>
    </svg>
  );
}

function ATSPanel({ form }) {
  const tips = [];
  const allSkills = [...form.skills.technical, ...form.skills.tools, ...form.skills.soft];
  if (allSkills.length < 12) tips.push({ type:"warn", text:`Add ${12 - allSkills.length} more skills to pass the 12-skill threshold.` });
  if (!form.summary || form.summary.length < 60) tips.push({ type:"warn", text:"Summary too short. Aim for 2–3 sentences (60+ chars)." });
  if (!form.linkedin) tips.push({ type:"warn", text:"Add LinkedIn URL — it boosts contact score by 20%." });
  if (form.experience.length === 0) tips.push({ type:"warn", text:"No experience entries. Add at least one role." });
  if (form.experience.some(e => e.responsibilities.filter(r=>r.trim()).length < 3)) tips.push({ type:"warn", text:"Some roles have <3 bullet points. ATS rewards 4–6 per role." });
  const allBullets = form.experience.flatMap(e=>e.responsibilities).join(" ").toLowerCase();
  const VERBS = ["led","built","created","developed","designed","implemented","improved","optimized","managed","delivered","launched","increased","reduced","analyzed","automated","deployed"];
  if (VERBS.filter(v=>allBullets.includes(v)).length < 4) tips.push({ type:"warn", text:'Use more action verbs: "Led", "Built", "Improved", "Optimized"…' });
  if (!/\d+(%|x|×| users| million| thousand)/.test(allBullets)) tips.push({ type:"info", text:'Quantify an achievement — e.g. "improved load time by 40%".' });
  if (form.projects.length === 0) tips.push({ type:"info", text:"Add 1–2 projects — ATS has a dedicated projects dimension." });
  if (!form.github && !form.portfolio) tips.push({ type:"info", text:"Add GitHub or portfolio link to strengthen contact score." });
  if (tips.length === 0) tips.push({ type:"ok", text:"All major ATS checkpoints satisfied!" });

  const skillCount = allSkills.length;
  const bulletCount = form.experience.flatMap(e=>e.responsibilities.filter(r=>r.trim())).length;
  const sectionCount = [form.summary, form.experience.length, form.education.length, form.skills.technical.length].filter(Boolean).length;
  const linkCount = [form.linkedin, form.github, form.portfolio, form.email, form.phone].filter(Boolean).length;

  return (
    <div className="vcard" style={{ position:"sticky", top:80, alignSelf:"flex-start", minWidth:248, maxWidth:268, flexShrink:0 }}>
      <h4 className="card-h" style={{ marginBottom:10 }}>◎ Live ATS Tips</h4>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {tips.map((t,i) => (
          <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
            <span style={{ flexShrink:0, fontSize:13, color:t.type==="warn"?"var(--brass2)":t.type==="ok"?"var(--forest2)":"var(--parchment)" }}>
              {t.type==="warn"?"⚠":t.type==="ok"?"✓":"→"}
            </span>
            <p style={{ fontSize:11.5, color:"var(--ink-soft)", lineHeight:1.55, margin:0 }}>{t.text}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid var(--border2)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[["Skills",`${skillCount}/12+`],["Bullets",`${bulletCount}/6+`],["Sections",`${sectionCount}/4`],["Links",`${linkCount}/5`]].map(([l,v])=>(
          <div key={l} className="stat-box" style={{ padding:"6px 10px" }}>
            <span style={{ fontSize:10 }}>{l}</span><strong style={{ fontSize:13 }}>{v}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeywordBooster({ form, onAddSkill }) {
  const [jd, setJD] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const allSkills = [...form.skills.technical, ...form.skills.tools, ...form.skills.soft].map(s=>s.toLowerCase());

  async function extract() {
    if (!jd.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/candidate/tailor-job`, {
        method:"POST", headers:authHeaders(), body:JSON.stringify({ job_text:jd, resume_form:form }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setSuggestions(d);
    } catch {
      const TECH = ["python","javascript","react","node","sql","aws","docker","git","fastapi","typescript","postgresql","redis","kubernetes","tensorflow","java","golang","flutter","android","ios","api","rest","graphql","mongodb","firebase","linux","agile","scrum","ci/cd","pandas","numpy","pytorch","django","spring","vue","angular","express","nextjs"];
      const words = jd.toLowerCase().match(/\b[a-z][a-z0-9+#./]{1,}\b/g) || [];
      const hits = [...new Set(words.filter(w=>TECH.includes(w)))];
      setSuggestions({ missing_keywords: hits.slice(0,14), missing_required_skills:[] });
    } finally { setLoading(false); }
  }

  const missing = [...(suggestions?.missing_required_skills||[]), ...(suggestions?.missing_keywords||[])].filter(k=>!allSkills.includes(k.toLowerCase())).slice(0,16);

  return (
    <div className="vcard" style={{ marginBottom:16 }}>
      <h4 className="card-h" style={{ marginBottom:6 }}>✦ Keyword Booster</h4>
      <p style={{ fontSize:12, color:"var(--ink-soft)", marginBottom:10 }}>
        Paste a job description to find skill gaps and inject missing keywords directly into your skills section.
      </p>
      <textarea className="auth-input" rows={5} value={jd} onChange={e=>setJD(e.target.value)}
        placeholder="Paste job description here…" style={{ minHeight:90 }}/>
      <button className="stamp-btn secondary" style={{ marginTop:8, fontSize:12 }} onClick={extract} disabled={loading||!jd.trim()}>
        {loading?"Extracting…":"⚡ Extract Keywords"}
      </button>
      {missing.length>0 && (
        <div style={{ marginTop:14 }}>
          <p style={{ fontSize:11, fontWeight:"bold", color:"var(--ink-soft)", marginBottom:6 }}>Missing from your CV — click to add:</p>
          <div className="pill-row">
            {missing.map((k,i)=>(
              <span key={i} className="vtag amber" style={{ cursor:"pointer" }} onClick={()=>onAddSkill("technical",k)}>+ {k}</span>
            ))}
          </div>
          <p style={{ fontSize:11, color:"var(--ink-muted)", marginTop:8 }}>Keywords added to Technical Skills. Regenerate your PDF after adding them.</p>
        </div>
      )}
      {suggestions && missing.length===0 && <p style={{ fontSize:12, color:"var(--forest2)", marginTop:8 }}>✓ You already have all the key skills for this role!</p>}
    </div>
  );
}

export default function CVBuilder() {
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({...EMPTY_FORM});
  const [skillInput, setSkillInput] = useState({ technical:"", tools:"", soft:"" });
  const [langInput, setLangInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scoreResult, setScoreResult] = useState(null);
  const [section, setSection] = useState("personal");
  const [dbProfile, setDbProfile] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbUpdatedAt, setDbUpdatedAt] = useState("");
  const [dlSuccess, setDlSuccess] = useState(false);

  // ── Upload & compare state ──
  const [uploadedCV, setUploadedCV] = useState(null);       // the File object user dropped
  const [uploadedParsed, setUploadedParsed] = useState(null); // parsed data from that file
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const uploadRef = useRef();

  useEffect(()=>{
    fetch(`${API_BASE}/candidate/parsed-profile`,{headers:authHeaders(false)})
      .then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>{setDbProfile(d.parsed_resume||null);setDbUpdatedAt(d.updated_at||"");})
      .catch(()=>setDbProfile(null))
      .finally(()=>setDbLoading(false));
  },[]);

  const hasParsed = dbProfile && (dbProfile.candidate_name || dbProfile.email || dbProfile.skills?.technical?.length);
  function startQuick(){const c=parsedToForm(dbProfile);if(c)setForm(c);setMode("quick");}
  function startScratch(){setForm({...EMPTY_FORM});setMode("scratch");}
  function goBack(){setMode(null);setScoreResult(null);setError("");setDlSuccess(false);setCompareResult(null);setUploadedCV(null);setUploadedParsed(null);}

  // ── Parse uploaded CV and autofill form ──
  async function handleUploadAutofill(file) {
    if (!file) return;
    setUploadedCV(file);
    setUploadLoading(true); setUploadError("");
    try {
      const fd = new FormData();
      fd.append("resume_file", file);
      fd.append("prefer_gemini", "true");
      const r = await fetch(`${API_BASE}/candidate/profile/parse-upload`, {
        method:"POST", headers:authHeaders(false), body:fd,
      });
      if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d?.detail||"Parse failed"); }
      const d = await r.json();
      const parsed = d.parsed_resume || d.profile || d;
      setUploadedParsed(parsed);
      const converted = parsedToForm(parsed);
      if (converted) setForm(converted);
      setMode("quick");
    } catch(e) { setUploadError(e.message||"Could not parse CV. Try a cleaner PDF."); }
    finally { setUploadLoading(false); }
  }

  // ── Compare uploaded CV vs current built form ──
  async function handleCompare() {
    if (!uploadedParsed) return;
    setCompareLoading(true); setCompareResult(null);
    try {
      const r = await fetch(`${API_BASE}/candidate/resume-version/compare`, {
        method:"POST", headers:authHeaders(),
        body: JSON.stringify({ old_resume: uploadedParsed, new_resume: form }),
      });
      if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d?.detail||"Compare failed"); }
      setCompareResult(await r.json());
    } catch(e) { setError(e.message); }
    finally { setCompareLoading(false); }
  }
  function set(k,v){setForm(p=>({...p,[k]:v}));}
  function addSkill(type, val){
    const v=(val||skillInput[type]).trim();
    if(!v)return;
    if(form.skills[type].map(s=>s.toLowerCase()).includes(v.toLowerCase()))return;
    setForm(p=>({...p,skills:{...p.skills,[type]:[...p.skills[type],v]}}));
    if(!val)setSkillInput(p=>({...p,[type]:""}));
  }
  function removeSkill(type,idx){setForm(p=>({...p,skills:{...p.skills,[type]:p.skills[type].filter((_,i)=>i!==idx)}}));}
  function addLang(){if(!langInput.trim())return;setForm(p=>({...p,languages:[...p.languages,langInput.trim()]}));setLangInput("");}

  function addExp(){setForm(p=>({...p,experience:[...p.experience,{job_title:"",company:"",start_date:"",end_date:"",responsibilities:[""],technologies:[]}]}));}
  function updExp(i,k,v){setForm(p=>{const e=[...p.experience];e[i]={...e[i],[k]:v};return{...p,experience:e};});}
  function delExp(i){setForm(p=>({...p,experience:p.experience.filter((_,j)=>j!==i)}));}

  function addEdu(){setForm(p=>({...p,education:[...p.education,{degree:"",institution:"",start_date:"",end_date:"",grade:""}]}));}
  function updEdu(i,k,v){setForm(p=>{const e=[...p.education];e[i]={...e[i],[k]:v};return{...p,education:e};});}
  function delEdu(i){setForm(p=>({...p,education:p.education.filter((_,j)=>j!==i)}));}

  function addProj(){setForm(p=>({...p,projects:[...p.projects,{name:"",description:"",technologies:[],link:""}]}));}
  function updProj(i,k,v){setForm(p=>{const a=[...p.projects];a[i]={...a[i],[k]:v};return{...p,projects:a};});}
  function delProj(i){setForm(p=>({...p,projects:p.projects.filter((_,j)=>j!==i)}));}

  function addCert(){setForm(p=>({...p,certifications:[...p.certifications,{name:"",issuer:"",date:""}]}));}
  function updCert(i,k,v){setForm(p=>{const c=[...p.certifications];c[i]={...c[i],[k]:v};return{...p,certifications:c};});}
  function delCert(i){setForm(p=>({...p,certifications:p.certifications.filter((_,j)=>j!==i)}));}

  async function handleGenerate(){
    setLoading(true);setError("");setDlSuccess(false);
    try{
      const r=await fetch(`${API_BASE}/candidate/generate-cv`,{method:"POST",headers:authHeaders(),body:JSON.stringify(form)});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d?.detail||"Generation failed");}
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download=(form.candidate_name||"resume").replace(/\s+/g,"_")+"_CV.pdf";
      a.click();URL.revokeObjectURL(url);
      setDlSuccess(true);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }

  async function handleScore(){
    setLoading(true);setError("");setScoreResult(null);
    try{
      const r=await fetch(`${API_BASE}/candidate/resume-quality/form`,{method:"POST",headers:authHeaders(),body:JSON.stringify(form)});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d?.detail||"Scoring failed");}
      setScoreResult(await r.json());
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }

  const SECTIONS=[
    {id:"personal",label:"👤 Personal",badge:form.candidate_name?"✓":null},
    {id:"skills",label:"⚡ Skills",badge:[...form.skills.technical,...form.skills.tools,...form.skills.soft].length||null},
    {id:"experience",label:"💼 Experience",badge:form.experience.length||null},
    {id:"education",label:"🎓 Education",badge:form.education.length||null},
    {id:"projects",label:"🏗 Projects",badge:form.projects.length||null},
    {id:"certs",label:"📜 Certs",badge:form.certifications.length||null},
    {id:"boost",label:"✦ Boost",badge:null},
  ];

  /* ── Mode selection ── */
  if(mode===null){
    return (
      <div style={{ maxWidth:720, margin:"0 auto" }}>
        <div className="app-hero" style={{ paddingBottom:20 }}>
          <p className="app-eyebrow">✦ CV Builder ✦</p>
          <h1 className="app-title" style={{ fontSize:"clamp(24px,4vw,38px)" }}>Build Your Résumé.<br/><span className="app-accent">ATS-Optimised & Job-Ready.</span></h1>
          <p className="app-sub">Live ATS scoring at every step — so you can fix issues before you apply.</p>
        </div>
        {dbLoading?(
          <div className="v-spinner-wrap" style={{ justifyContent:"center" }}><div className="v-spinner"/><span>Checking for parsed CV data…</span></div>
        ):(
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

            {/* ── Quick Build card — now with upload option ── */}
            <div className="vcard" style={{ padding:"28px 24px" }}>
              <div style={{ textAlign:"center", marginBottom:16 }}>
                <span style={{ fontSize:40, display:"block", marginBottom:10 }}>⚡</span>
                <h3 style={{ fontSize:17, fontWeight:"bold", color:"var(--ink)", marginBottom:6 }}>Quick Build</h3>
                <p style={{ fontSize:13, color:"var(--ink-soft)", lineHeight:1.6 }}>
                  Auto-fill from your saved profile, or upload a CV to parse it instantly.
                </p>
              </div>

              {/* Option A — load from saved profile */}
              {hasParsed && (
                <div
                  onClick={startQuick}
                  style={{ cursor:"pointer", padding:"12px 14px", borderRadius:10, marginBottom:10,
                    background:"rgba(var(--pm-accent-rgb),.07)", border:"1px solid rgba(var(--pm-accent-rgb),.2)",
                    transition:"all .18s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(var(--pm-accent-rgb),.12)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(var(--pm-accent-rgb),.07)"}>
                  <p style={{ fontSize:12, fontWeight:"bold", color:"var(--brass2)", marginBottom:4 }}>
                    ◎ Load from saved profile
                  </p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {dbProfile.candidate_name&&<span className="vtag green">{dbProfile.candidate_name}</span>}
                    {dbProfile.skills?.technical?.slice(0,2).map(s=><span key={s} className="vtag amber">{s}</span>)}
                    {dbProfile.skills?.technical?.length>2&&<span className="vtag blue">+{dbProfile.skills.technical.length-2} more</span>}
                  </div>
                  {dbUpdatedAt&&<p style={{ fontSize:10, color:"var(--ink-faded)", marginTop:5 }}>Last updated: {new Date(dbUpdatedAt).toLocaleString()}</p>}
                </div>
              )}

              {/* Divider */}
              {hasParsed && (
                <div style={{ display:"flex", alignItems:"center", gap:8, margin:"8px 0" }}>
                  <div style={{ flex:1, height:1, background:"var(--border2)" }}/>
                  <span style={{ fontSize:10, color:"var(--ink-muted)", letterSpacing:".08em" }}>OR</span>
                  <div style={{ flex:1, height:1, background:"var(--border2)" }}/>
                </div>
              )}

              {/* Option B — upload a CV file */}
              <div>
                <p style={{ fontSize:12, fontWeight:"bold", color:"var(--ink-soft)", marginBottom:8 }}>
                  ⬆ Upload a CV to auto-fill
                </p>
                <input ref={uploadRef} type="file" accept=".pdf,.doc,.docx"
                  style={{ display:"none" }}
                  onChange={e=>handleUploadAutofill(e.target.files?.[0]||null)}/>
                <div
                  onClick={()=>uploadRef.current.click()}
                  style={{ cursor:"pointer", border:"2px dashed var(--border)", borderRadius:10,
                    padding:"16px 12px", textAlign:"center", transition:"all .18s",
                    background: uploadedCV?"rgba(45,110,66,.06)":"var(--parchment2)" }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor="var(--brass)"; e.currentTarget.style.background="rgba(var(--pm-accent-rgb),.06)"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.background=uploadedCV?"rgba(45,110,66,.06)":"var(--parchment2)"; }}>
                  {uploadLoading ? (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <div className="v-spinner" style={{ width:16, height:16 }}/>
                      <span style={{ fontSize:12, color:"var(--ink-soft)" }}>Parsing with Gemini…</span>
                    </div>
                  ) : uploadedCV ? (
                    <div>
                      <p style={{ fontSize:13, fontWeight:"bold", color:"var(--forest2)", marginBottom:2 }}>✓ {uploadedCV.name}</p>
                      <p style={{ fontSize:11, color:"var(--ink-muted)" }}>CV parsed — click to replace</p>
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontSize:24, display:"block", marginBottom:6 }}>📂</span>
                      <p style={{ fontSize:12, color:"var(--ink-soft)" }}>Drop PDF / DOC / DOCX</p>
                      <p style={{ fontSize:11, color:"var(--ink-muted)" }}>Gemini will extract all fields</p>
                    </div>
                  )}
                </div>
                {uploadError&&<p style={{ fontSize:11, color:"var(--burgundy2)", marginTop:6 }}>⚠ {uploadError}</p>}
                {uploadedParsed&&!uploadLoading&&(
                  <button className="stamp-btn" style={{ width:"100%", marginTop:10, fontSize:12 }}
                    onClick={()=>setMode("quick")}>
                    ✓ Continue with parsed CV →
                  </button>
                )}
              </div>

              {!hasParsed&&!uploadedCV&&(
                <div style={{ marginTop:12, textAlign:"center" }}>
                  <span className="lp-badge amber">Upload a CV above to start</span>
                </div>
              )}
            </div>

            {/* ── Build from Scratch ── */}
            <div className="vcard" style={{ cursor:"pointer", textAlign:"center", padding:"32px 24px", transition:"transform .2s" }}
              onMouseEnter={e=>(e.currentTarget.style.transform="translateY(-3px)")}
              onMouseLeave={e=>(e.currentTarget.style.transform="none")}
              onClick={startScratch}>
              <span style={{ fontSize:44, display:"block", marginBottom:14 }}>📝</span>
              <h3 style={{ fontSize:18, fontWeight:"bold", color:"var(--ink)", marginBottom:8 }}>Build from Scratch</h3>
              <p style={{ fontSize:13, color:"var(--ink-soft)", lineHeight:1.6 }}>Blank form with live ATS guidance. Fill in and generate an ATS-optimised PDF.</p>
              <div style={{ marginTop:12 }}><span className="lp-badge green">Always available</span></div>
            </div>
          </div>
        )}
        <div style={{ marginTop:28, padding:"18px 20px", background:"rgba(var(--pm-accent-rgb),.06)", border:"1px solid rgba(var(--pm-accent-rgb),.12)", borderRadius:12, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {[["◎","Live ATS scoring as you type"],["✦","Keyword booster from any job post"],["📄","Professional PDF — ready to apply"]].map(([icon,text])=>(
            <div key={text} style={{ textAlign:"center" }}>
              <span style={{ display:"block", fontSize:20, marginBottom:4 }}>{icon}</span>
              <span style={{ fontSize:11, color:"var(--ink-soft)", lineHeight:1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Form view ── */
  return (
    <div style={{ maxWidth:1060, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="stamp-btn secondary" style={{ padding:"6px 14px", fontSize:12 }} onClick={goBack}>← Back</button>
        <span style={{ fontSize:14, fontWeight:"bold", color:"var(--ink-soft)" }}>{mode==="quick"?"⚡ Quick Build":"📝 Build from Scratch"}</span>
        {mode==="quick"&&<span className="lp-badge green" style={{ fontSize:9 }}>Auto-filled</span>}
      </div>

      {/* Section tabs */}
      <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:20, background:"var(--pm-input-bg)", border:"1px solid rgba(var(--pm-accent-rgb),.12)", borderRadius:12, padding:4 }}>
        {SECTIONS.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)}
            style={{ flex:"1 1 auto", padding:"7px 8px", borderRadius:8, border:"none", cursor:"pointer",
              background:section===s.id?"linear-gradient(135deg,var(--pm-accent-solid),var(--pm-accent-solid-hover))":"transparent",
              color:section===s.id?"var(--pm-accent-on)":"rgba(var(--pm-accent-rgb),.55)",
              fontSize:11, fontWeight:"bold", fontFamily:"inherit", transition:"all .18s",
              display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
            {s.label}
            {s.badge&&<span style={{ fontSize:9, padding:"1px 5px", borderRadius:99, background:section===s.id?"rgba(0,0,0,.15)":"rgba(var(--pm-accent-rgb),.2)" }}>{s.badge}</span>}
          </button>
        ))}
      </div>

      <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:0 }}>

          {/* PERSONAL */}
          {section==="personal"&&(
            <div className="step-block" style={{ marginBottom:16 }}>
              <div className="step-label"><span className="step-num-badge">1</span> Personal Information</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="Full Name" hint="ATS reads this first"><Input value={form.candidate_name} onChange={e=>set("candidate_name",e.target.value)} placeholder="Srabusty Nasrin "/></Field>
                <Field label="Headline / Title"><Input value={form.headline} onChange={e=>set("headline",e.target.value)} placeholder="Full Stack Developer"/></Field>
                <Field label="Email" hint="Required for contact score"><Input type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="you@email.com"/></Field>
                <Field label="Phone"><Input value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+880-1234567890"/></Field>
                <Field label="Location"><Input value={form.location} onChange={e=>set("location",e.target.value)} placeholder="Dhaka, Bangladesh"/></Field>
                <Field label="LinkedIn" hint="+20% contact score"><Input value={form.linkedin} onChange={e=>set("linkedin",e.target.value)} placeholder="linkedin.com/in/you"/></Field>
                <Field label="GitHub"><Input value={form.github} onChange={e=>set("github",e.target.value)} placeholder="github.com/you"/></Field>
                <Field label="Portfolio"><Input value={form.portfolio} onChange={e=>set("portfolio",e.target.value)} placeholder="your-site.com"/></Field>
              </div>
              <div style={{ marginTop:12 }}>
                <Field label="Professional Summary" hint="2–3 sentences, 60+ chars for full score">
                  <Textarea value={form.summary} onChange={e=>set("summary",e.target.value)}
                    placeholder="Experienced developer with 3+ years in Python and React, building scalable APIs and data pipelines…" rows={3}/>
                </Field>
                {form.summary.length>0&&(
                  <span style={{ fontSize:11, color:form.summary.length>=60?"var(--forest2)":"var(--brass)" }}>
                    {form.summary.length>=60?"✓":"⚠"} {form.summary.length} chars{form.summary.length<60?` (need ${60-form.summary.length} more)`:""}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* SKILLS */}
          {section==="skills"&&(
            <div className="step-block" style={{ marginBottom:16 }}>
              <div className="step-label">
                <span className="step-num-badge">2</span> Skills
                <span style={{ marginLeft:10, fontSize:11, color:"var(--ink-muted)", fontWeight:"normal" }}>
                  {[...form.skills.technical,...form.skills.tools,...form.skills.soft].length}/12+ skills
                </span>
              </div>
              {[{type:"technical",label:"Technical Skills",color:"green",hint:"Languages & frameworks"},
                {type:"tools",label:"Tools & Platforms",color:"amber",hint:"Docker, AWS, Git…"},
                {type:"soft",label:"Soft Skills",color:"blue",hint:"Leadership, communication…"}].map(({type,label,color,hint})=>(
                <div key={type} style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <label className="field-label">{label}</label>
                    <span style={{ fontSize:10, color:"var(--ink-muted)" }}>{hint}</span>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Input value={skillInput[type]} onChange={e=>setSkillInput(p=>({...p,[type]:e.target.value}))}
                      placeholder="Add skill and press Enter"
                      onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addSkill(type))}/>
                    <button type="button" className="stamp-btn secondary" style={{ padding:"8px 14px", fontSize:12 }} onClick={()=>addSkill(type)}>+</button>
                  </div>
                  <div className="pill-row" style={{ marginTop:6 }}>
                    {form.skills[type].map((s,i)=>(
                      <span key={i} className={`vtag ${color}`} style={{ cursor:"pointer" }} onClick={()=>removeSkill(type,i)}>{s} ✕</span>
                    ))}
                    {form.skills[type].length===0&&<span className="muted-text" style={{ fontSize:12 }}>No {type} skills yet</span>}
                  </div>
                </div>
              ))}
              <div style={{ padding:"10px 14px", background:"rgba(var(--pm-accent-rgb),.06)", borderRadius:8, border:"1px solid rgba(var(--pm-accent-rgb),.12)" }}>
                <p style={{ fontSize:12, color:"var(--ink-soft)", margin:0 }}>💡 <strong>Tip:</strong> List all tools — even Git, VS Code, Linux. Skills section = 10% of ATS score.</p>
              </div>
            </div>
          )}

          {/* EXPERIENCE */}
          {section==="experience"&&(
            <div className="step-block" style={{ marginBottom:16 }}>
              <div className="step-label">
                <span className="step-num-badge">3</span> Experience
                <span style={{ marginLeft:10, fontSize:11, color:"var(--ink-muted)", fontWeight:"normal" }}>
                  {form.experience.flatMap(e=>e.responsibilities.filter(r=>r.trim())).length} total bullets
                </span>
              </div>
              <ListSection items={form.experience} onAdd={addExp} onRemove={delExp}
                renderItem={(exp,i)=>(
                  <div style={{ flex:1 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                      <Input value={exp.job_title} onChange={e=>updExp(i,"job_title",e.target.value)} placeholder="Job Title"/>
                      <Input value={exp.company} onChange={e=>updExp(i,"company",e.target.value)} placeholder="Company Name"/>
                      <Input value={exp.start_date} onChange={e=>updExp(i,"start_date",e.target.value)} placeholder="Start Date"/>
                      <Input value={exp.end_date} onChange={e=>updExp(i,"end_date",e.target.value)} placeholder="End Date or Present"/>
                    </div>
                    <Field label="Responsibilities" hint="Start with action verbs: Led, Built, Improved…">
                      <Textarea value={exp.responsibilities.join("\n")} onChange={e=>updExp(i,"responsibilities",e.target.value.split("\n"))}
                        placeholder={"• Led development of REST API serving 50K+ daily users\n• Reduced page load time by 40% via caching\n• Collaborated with 5-person team using Agile"} rows={5}/>
                    </Field>
                    {exp.responsibilities.filter(r=>r.trim()).length<3&&(
                      <p style={{ fontSize:11, color:"var(--brass)", marginTop:4 }}>⚠ Add at least 3 bullets — ATS rewards 4–6 per role.</p>
                    )}
                  </div>
                )}/>
              {form.experience.length===0&&<p className="muted-text" style={{ fontSize:12, textAlign:"center", padding:"16px 0" }}>Click "+ Add" to add work experience.</p>}
            </div>
          )}

          {/* EDUCATION */}
          {section==="education"&&(
            <div className="step-block" style={{ marginBottom:16 }}>
              <div className="step-label"><span className="step-num-badge">4</span> Education</div>
              <ListSection items={form.education} onAdd={addEdu} onRemove={delEdu}
                renderItem={(edu,i)=>(
                  <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <Input value={edu.degree} onChange={e=>updEdu(i,"degree",e.target.value)} placeholder="BSc Computer Science"/>
                    <Input value={edu.institution} onChange={e=>updEdu(i,"institution",e.target.value)} placeholder="University Name"/>
                    <Input value={edu.start_date} onChange={e=>updEdu(i,"start_date",e.target.value)} placeholder="Start Year"/>
                    <Input value={edu.end_date} onChange={e=>updEdu(i,"end_date",e.target.value)} placeholder="End Year"/>
                    <Input value={edu.grade} onChange={e=>updEdu(i,"grade",e.target.value)} placeholder="CGPA / Grade (optional)" style={{ gridColumn:"1/-1" }}/>
                  </div>
                )}/>
              {form.education.length===0&&<p className="muted-text" style={{ fontSize:12, textAlign:"center", padding:"12px 0" }}>Click "+ Add" to add education.</p>}
            </div>
          )}

          {/* PROJECTS */}
          {section==="projects"&&(
            <div className="step-block" style={{ marginBottom:16 }}>
              <div className="step-label"><span className="step-num-badge">5</span> Projects <span style={{ fontSize:11, color:"var(--ink-muted)", fontWeight:"normal", marginLeft:8 }}>dedicated ATS dimension</span></div>
              <ListSection items={form.projects} onAdd={addProj} onRemove={delProj}
                renderItem={(proj,i)=>(
                  <div style={{ flex:1 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                      <Input value={proj.name} onChange={e=>updProj(i,"name",e.target.value)} placeholder="Project Name"/>
                      <Input value={proj.link} onChange={e=>updProj(i,"link",e.target.value)} placeholder="GitHub / Live Link"/>
                    </div>
                    <Textarea value={proj.description} onChange={e=>updProj(i,"description",e.target.value)}
                      placeholder="Built a real-time chat app using React and Node.js, handling 500+ concurrent WebSocket connections…" rows={3}/>
                  </div>
                )}/>
              {form.projects.length===0&&<p className="muted-text" style={{ fontSize:12, textAlign:"center", padding:"12px 0" }}>Add 1–2 strong projects to boost your projects dimension score.</p>}
            </div>
          )}

          {/* CERTS */}
          {section==="certs"&&(
            <>
              <div className="step-block" style={{ marginBottom:16 }}>
                <div className="step-label"><span className="step-num-badge">6</span> Certifications</div>
                <ListSection items={form.certifications} onAdd={addCert} onRemove={delCert}
                  renderItem={(cert,i)=>(
                    <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      <Input value={cert.name} onChange={e=>updCert(i,"name",e.target.value)} placeholder="AWS Cloud Practitioner"/>
                      <Input value={cert.issuer} onChange={e=>updCert(i,"issuer",e.target.value)} placeholder="Issuer"/>
                      <Input value={cert.date} onChange={e=>updCert(i,"date",e.target.value)} placeholder="Date"/>
                    </div>
                  )}/>
              </div>
              <div className="step-block">
                <div className="step-label"><span className="step-num-badge">7</span> Languages</div>
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <Input value={langInput} onChange={e=>setLangInput(e.target.value)} placeholder="e.g. English (Fluent)"
                    onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addLang())}/>
                  <button type="button" className="stamp-btn secondary" style={{ padding:"8px 14px", fontSize:12 }} onClick={addLang}>+</button>
                </div>
                <div className="pill-row">
                  {form.languages.map((l,i)=>(
                    <span key={i} className="vtag blue" style={{ cursor:"pointer" }}
                      onClick={()=>setForm(p=>({...p,languages:p.languages.filter((_,j)=>j!==i)}))}>{l} ✕</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* BOOST */}
          {section==="boost"&&<KeywordBooster form={form} onAddSkill={addSkill}/>}

          {/* ACTIONS */}
          <div className="step-block" style={{ marginTop:16 }}>
            <div className="run-bar" style={{ flexDirection:"column", gap:12 }}>
              <div className="run-actions" style={{ width:"100%", justifyContent:"center", flexWrap:"wrap", gap:10 }}>
                <button className="stamp-btn" style={{ minWidth:180 }} onClick={handleGenerate} disabled={loading||!form.candidate_name}>
                  {loading?"Generating…":"📄 Download PDF"}
                </button>
                <button className="stamp-btn secondary" style={{ minWidth:180 }} onClick={handleScore} disabled={loading||!form.candidate_name}>
                  ◎ Check ATS Score
                </button>
              </div>
              {dlSuccess&&(
                <div style={{ textAlign:"center", padding:"8px 16px", background:"rgba(45,110,66,.12)", border:"1px solid rgba(45,110,66,.25)", borderRadius:8 }}>
                  <span style={{ color:"var(--forest2)", fontSize:13 }}>✓ PDF downloaded! Now run "Check ATS Score" to see how it performs.</span>
                </div>
              )}
              {/* ── Compare button — only shows if user uploaded a CV ── */}
              {uploadedParsed && dlSuccess && (
                <div style={{ textAlign:"center", padding:"14px 16px", background:"rgba(var(--pm-accent-rgb),.06)", border:"1px solid rgba(var(--pm-accent-rgb),.18)", borderRadius:10 }}>
                  <p style={{ fontSize:12, color:"var(--ink-soft)", marginBottom:10 }}>
                    ◈ You uploaded <strong>{uploadedCV?.name}</strong> — compare it with your updated CV to see what improved.
                  </p>
                  <button className="stamp-btn secondary" style={{ fontSize:12 }}
                    onClick={handleCompare} disabled={compareLoading}>
                    {compareLoading ? "Comparing…" : "◈ Compare with Uploaded CV"}
                  </button>
                </div>
              )}
              {error&&<div className="error-note">⚠ {error}</div>}
            </div>
          </div>

          {/* Score result */}
          {scoreResult&&(
            <div className="results-wrap" style={{ marginTop:20 }}>
              <div className="results-tab-bar">
                <span className="results-tab-label">◎ Resume Quality Score</span>
                <button className="stamp-btn secondary" style={{ padding:"6px 14px", fontSize:12 }} onClick={()=>setScoreResult(null)}>✕</button>
              </div>
              <div className="result-section">
                <div style={{ display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ textAlign:"center" }}>
                    <MiniRing score={scoreResult.score_summary?.resume_quality_score} size={100} stroke={8}/>
                    <p className="ring-label">Quality Score</p>
                  </div>
                  <div style={{ flex:1 }}>
                    {scoreResult.candidate_feedback?.strengths?.map((s,i)=>(
                      <p key={i} style={{ fontSize:13, color:"var(--forest2)", marginBottom:4 }}>✓ {s}</p>
                    ))}
                    {scoreResult.candidate_feedback?.improvement_areas?.map((a,i)=>(
                      <p key={i} style={{ fontSize:13, color:"var(--brass)", marginBottom:4 }}>⬆ {a}</p>
                    ))}
                  </div>
                </div>
                {scoreResult.candidate_feedback?.next_steps?.length>0&&(
                  <div className="vcard" style={{ marginTop:14 }}>
                    <h4 className="card-h">Next Steps to Improve Your Score</h4>
                    <div className="steps-list">
                      {scoreResult.candidate_feedback.next_steps.map((s,i)=>(
                        <div key={i} className="step-item"><div className="step-num">{i+1}</div><p>{s}</p></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ATS Tips Sidebar */}
        <ATSPanel form={form}/>
      </div>

      {/* ── Compare result panel ── */}
      {compareResult && (
        <div className="results-wrap" style={{ marginTop:20 }}>
          <div className="results-tab-bar">
            <span className="results-tab-label">◈ Uploaded CV vs Your Updated CV</span>
            <button className="stamp-btn secondary" style={{ padding:"6px 14px", fontSize:12 }} onClick={()=>setCompareResult(null)}>✕</button>
          </div>
          <div className="result-section">

            {/* Score delta */}
            <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap", marginBottom:16 }}>
              <div style={{ padding:"10px 18px", background:"var(--parchment2)", borderRadius:10, border:"1px solid var(--border)", textAlign:"center" }}>
                <span style={{ display:"block", fontSize:11, color:"var(--ink-muted)", marginBottom:4 }}>Uploaded CV Score</span>
                <span style={{ fontSize:22, fontWeight:"bold", color:"var(--burgundy2)" }}>—</span>
              </div>
              <div style={{ fontSize:20, color:"var(--brass)" }}>→</div>
              <div style={{ padding:"10px 18px", background:"var(--parchment2)", borderRadius:10, border:"1px solid var(--border)", textAlign:"center" }}>
                <span style={{ display:"block", fontSize:11, color:"var(--ink-muted)", marginBottom:4 }}>Updated CV Score</span>
                <span style={{ fontSize:22, fontWeight:"bold", color:"var(--forest2)" }}>—</span>
              </div>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:13, fontWeight:"bold", color:compareResult.score_delta>0?"var(--forest2)":compareResult.score_delta<0?"var(--burgundy2)":"var(--brass)", padding:"4px 12px", borderRadius:99, background:compareResult.score_delta>0?"rgba(45,110,66,.12)":compareResult.score_delta<0?"rgba(122,27,46,.12)":"rgba(var(--pm-accent-rgb),.1)", border:`1px solid ${compareResult.score_delta>0?"rgba(45,110,66,.25)":compareResult.score_delta<0?"rgba(122,27,46,.25)":"rgba(var(--pm-accent-rgb),.2)"}` }}>
                  {compareResult.score_delta>0?"+":""}{compareResult.score_delta?.toFixed?.(1)??0} pts
                </span>
              </div>
            </div>

            {/* Improvement highlights */}
            {compareResult.improvement_highlights?.length>0&&(
              <div className="vcard" style={{ marginBottom:12 }}>
                <h4 className="card-h">✦ What Improved</h4>
                {compareResult.improvement_highlights.map((h,i)=>(
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:8 }}>
                    <span style={{ color:"var(--brass2)", flexShrink:0 }}>◈</span>
                    <p style={{ fontSize:13, color:"var(--ink-soft)", margin:0, lineHeight:1.65 }}>{h}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Skills diff */}
            <div className="two-col">
              <div className="vcard">
                <h4 className="card-h">+ Skills Added</h4>
                {compareResult.added_skills?.length>0
                  ? <div className="pill-row">{compareResult.added_skills.map(s=><span key={s} className="vtag green">{s}</span>)}</div>
                  : <p style={{ fontSize:12, color:"var(--ink-muted)" }}>No new skills added.</p>}
              </div>
              <div className="vcard">
                <h4 className="card-h">− Skills Removed</h4>
                {compareResult.removed_skills?.length>0
                  ? <div className="pill-row">{compareResult.removed_skills.map(s=><span key={s} className="vtag red">{s}</span>)}</div>
                  : <p style={{ fontSize:12, color:"var(--ink-muted)" }}>No skills removed. ✦</p>}
              </div>
            </div>

            {/* Changed sections */}
            {compareResult.changed_sections?.length>0&&(
              <div className="vcard" style={{ marginTop:12 }}>
                <h4 className="card-h">~ Sections Changed</h4>
                <div className="pill-row">
                  {compareResult.changed_sections.map(s=>(
                    <span key={s} className="vtag amber">{s.replace(/_/g," ")}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Interview probe points */}
            {compareResult.interview_probe_points?.length>0&&(
              <div className="vcard" style={{ marginTop:12 }}>
                <h4 className="card-h">◎ Recruiters May Now Ask</h4>
                <ul className="vlist numbered">
                  {compareResult.interview_probe_points.map((q,i)=><li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Zap, Target, CheckCircle2, Hammer, BarChart3,
  UserPlus, Upload, PenLine, Trophy,
  ArrowRight, Play, ScanSearch, Search, Users,
} from "lucide-react";
import "./Homepage.css";

/* ── useReveal: adds "in-view" once an element scrolls into frame ── */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("in-view"); io.unobserve(el); } },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={`hp-reveal ${className}`} style={{ transitionDelay: `${delay}s` }} {...rest}>
      {children}
    </Tag>
  );
}

/* ── useCountUp: animates 0 -> target once visible ── */
function useCountUp(target, duration = 1200) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !done.current) {
        done.current = true;
        const start = performance.now();
        function tick(now) {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(eased * target));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        io.unobserve(el);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration]);
  return [val, ref];
}

/* ── useParallax: normalized mouse position within a wrapper, -1..1 ── */
function useParallax() {
  const wrapRef = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const handleMove = useCallback((e) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    setPos({ x, y });
  }, []);
  const handleLeave = useCallback(() => setPos({ x: 0, y: 0 }), []);
  return { wrapRef, pos, handleMove, handleLeave };
}

/* ══════════════════════════════════════════════
   Hero mockup — stylized recreation of the actual
   candidate dashboard (job card + score ring + kanban),
   with mouse-parallax depth.
══════════════════════════════════════════════ */
function HeroMockup() {
  const { wrapRef, pos, handleMove, handleLeave } = useParallax();
  const r = 22, circ = 2 * Math.PI * r;
  return (
    <div
      className="hp-mock-wrap"
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <div
        className="hp-mock-frame"
        style={{ transform: `rotateX(${pos.y * -4}deg) rotateY(${pos.x * 5}deg) translateZ(0)` }}
      >
        <div className="hp-mock-top">
          <span className="hp-mock-dot r" /><span className="hp-mock-dot y" /><span className="hp-mock-dot g" />
          <span className="hp-mock-tab">resumexpert.app/jobs</span>
        </div>
        <div className="hp-mock-body">
          {[
            { title: "Senior Backend Engineer", co: "Brainstation-23 · Dhaka", match: 94 },
            { title: "Product Designer", co: "Therap BD · Remote", match: 81 },
            { title: "Data Analyst", co: "Chaldal · Dhaka", match: 68 },
          ].map((j) => (
            <div className="hp-mock-jobcard" key={j.title}>
              <div className="hp-mock-jobcard-top">
                <div>
                  <p className="hp-mock-jobtitle">{j.title}</p>
                  <p className="hp-mock-jobco">{j.co}</p>
                </div>
                <span className="hp-mock-pill">{j.match}% match</span>
              </div>
              <div className="hp-mock-tagrow">
                <span className="hp-mock-tag">Full-time</span>
                <span className="hp-mock-tag">Remote-friendly</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="hp-mock-float score"
        style={{ transform: `translate(${pos.x * 10}px, ${pos.y * 10}px)` }}
      >
        <p className="hp-mock-float-label">ATS Score</p>
        <svg width="58" height="58" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(232,223,200,.1)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r} fill="none" stroke="url(#hmGrad)" strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={circ * 0.16} strokeLinecap="round"
            transform="rotate(-90 32 32)"
          />
          <text x="32" y="37" textAnchor="middle" className="hp-mock-ring-num">84</text>
          <defs>
            <linearGradient id="hmGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c9a84c" /><stop offset="100%" stopColor="#deba52" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div
        className="hp-mock-float kanban"
        style={{ transform: `translate(${pos.x * -12}px, ${pos.y * -8}px)` }}
      >
        <p className="hp-mock-float-label">Pipeline</p>
        {[
          { name: "Reviewed", w: 82, color: "#4a9463" },
          { name: "Interview", w: 56, color: "#c9a84c" },
          { name: "Hired", w: 30, color: "#deba52" },
        ].map((s) => (
          <div className="hp-mock-kb-row" key={s.name}>
            <span className="hp-mock-kb-dot" style={{ background: s.color }} />
            <span className="hp-mock-kb-name">{s.name}</span>
            <span className="hp-mock-kb-track"><span className="hp-mock-kb-fill" style={{ width: `${s.w}%`, background: s.color }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Interactive demo — self-contained, client-side
   simulation. No account or backend call needed;
   purely illustrative of what the real scoring feels like.
══════════════════════════════════════════════ */
const DEMO_ROLES = [
  { id: "backend", label: "Backend Engineer", jd: "backend engineer with python, django, postgresql, docker, aws, rest api design and ci/cd experience" },
  { id: "product", label: "Product Designer", jd: "product designer with figma, user research, design systems, prototyping, accessibility and cross-functional collaboration" },
  { id: "data", label: "Data Analyst", jd: "data analyst with sql, python, tableau, statistics, data visualization and stakeholder reporting experience" },
];

function scoreAgainstRole(text, roleId) {
  const role = DEMO_ROLES.find(r => r.id === roleId) || DEMO_ROLES[0];
  const jdWords = Array.from(new Set(role.jd.toLowerCase().match(/[a-z]+/g) || []))
    .filter(w => w.length > 3);
  const lower = text.toLowerCase();
  const found = jdWords.filter(w => lower.includes(w));
  const missing = jdWords.filter(w => !lower.includes(w)).slice(0, 5);
  const keywordScore = Math.min(100, Math.round((found.length / Math.max(4, jdWords.length)) * 100));
  const lengthBonus = Math.min(20, Math.round(text.trim().split(/\s+/).length / 6));
  const overall = Math.max(18, Math.min(97, keywordScore + lengthBonus - 4));
  return {
    overall,
    breakdown: [
      { label: "Keyword Match", value: keywordScore },
      { label: "Skills Coverage", value: Math.max(10, Math.min(96, keywordScore - 6 + lengthBonus)) },
      { label: "Formatting", value: Math.min(94, 60 + lengthBonus) },
    ],
    found: found.slice(0, 6),
    missing,
  };
}

function DemoRing({ score }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnimated(score), 60); return () => clearTimeout(t); }, [score]);
  const size = 100, stroke = 9, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, animated) / 100) * circ;
  return (
    <div className="hp-demo-ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#demoGrad)" strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" }}
        />
        <defs>
          <linearGradient id="demoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c9a84c" /><stop offset="60%" stopColor="#deba52" /><stop offset="100%" stopColor="#4a9463" />
          </linearGradient>
        </defs>
      </svg>
      <div className="hp-demo-ring-num"><b>{animated}</b><span>/ 100</span></div>
    </div>
  );
}

function InteractiveDemo() {
  const [role, setRole] = useState("backend");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  function handleRun() {
    if (!text.trim() || running) return;
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      setResult(scoreAgainstRole(text, role));
      setRunning(false);
    }, 900);
  }

  return (
    <section className="hp-demo" id="demo">
      <div className="hp-demo-inner">
        <Reveal className="hp-sec-head">
          <p className="hp-sec-eyebrow">Try It Now</p>
          <h2 className="hp-sec-h2">See your score before you sign up</h2>
          <p className="hp-sec-sub">Paste a few lines from your résumé, pick a target role, and watch a live sample score come together — no account required.</p>
        </Reveal>

        <Reveal delay={0.1} className="hp-demo-panel">
          <div className="hp-demo-left">
            <h3>Quick sample check</h3>
            <p>Runs right in your browser. </p>

            <span className="hp-demo-field-label">Target role</span>
            <div className="hp-demo-chip-row">
              {DEMO_ROLES.map(r => (
                <button key={r.id} className={`hp-demo-chip${role === r.id ? " active" : ""}`} onClick={() => { setRole(r.id); setResult(null); }}>
                  {r.label}
                </button>
              ))}
            </div>

            <span className="hp-demo-field-label">Paste a snippet of your résumé</span>
            <textarea
              className="hp-demo-textarea"
          
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <button className="hp-demo-run-btn" onClick={handleRun} disabled={!text.trim() || running}>
              {running ? "Analysing…" : <>Run sample check <Play size={14} strokeWidth={2.5}/></>}
            </button>
        
          </div>

          <div className="hp-demo-right">
            {!result && !running && (
              <div className="hp-demo-empty">
                <ScanSearch size={30} strokeWidth={1.6} style={{ margin: "0 auto" }} />
                <p>Your sample score will appear here.</p>
              </div>
            )}
            {running && (
              <div className="hp-demo-empty">
                <ScanSearch size={30} strokeWidth={1.6} style={{ margin: "0 auto" }} className="hp-demo-spin" />
                <p>Scanning for role-relevant signals…</p>
              </div>
            )}
            {result && !running && (
              <div className="hp-demo-result">
                <DemoRing score={result.overall} />
                <div className="hp-demo-bars">
                  {result.breakdown.map((b, i) => (
                    <div className="hp-demo-bar-row" key={b.label}>
                      <div className="hp-demo-bar-top"><span>{b.label}</span><span>{b.value}</span></div>
                      <div className="hp-demo-bar-track">
                        <div className="hp-demo-bar-fill" style={{
                          width: `${b.value}%`,
                          background: ["#c9a84c", "#deba52", "#4a9463"][i % 3],
                          animationDelay: `${i * 0.1}s`,
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hp-demo-tags">
                  {result.found.map(k => <span className="hp-demo-tag found" key={k}><CheckCircle2 size={11} strokeWidth={2.5}/>{k}</span>)}
                  {result.missing.map(k => <span className="hp-demo-tag missing" key={k}>{k}</span>)}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Feature grid
══════════════════════════════════════════════ */
const FEATURES = [
  { Icon: Zap, title: "ATS Score Analysis", desc: "Instant compatibility score across 6 dimensions, from keywords to semantic fit." },
  { Icon: Target, title: "Job Tailoring", desc: "Paste a job description, get exact keyword gaps and priority fixes." },
  { Icon: Hammer, title: "Guided CV Builder", desc: "Build an exportable résumé with live scoring as you type." },
  { Icon: BarChart3, title: "Recruiter Shortlist", desc: "Rank candidates, leave notes, export a ready-to-share list." },
];

function FeatureGrid() {
  return (
    <section className="hp-features" id="features">
      <div className="hp-features-inner">
        <Reveal className="hp-sec-head">
          <p className="hp-sec-eyebrow">What We Offer</p>
          <h2 className="hp-sec-h2">Everything you need to stand out</h2>
          <p className="hp-sec-sub">Six focused tools, built for both candidates and the recruiters reviewing them.</p>
        </Reveal>
        <div className="hp-fg">
          {FEATURES.map((f, i) => (
            <Reveal as="div" delay={i * 0.06} className="hp-feature-card" key={f.title}>
              <div className="hp-feature-icon">
                <f.Icon size={21} strokeWidth={1.8} color="#deba52" />
              </div>
              <h3 className="hp-feature-title">{f.title}</h3>
              <p className="hp-feature-desc">{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   How it works — same step logic as before, restyled
══════════════════════════════════════════════ */
function HowItWorks({ animatedMode }) {
  const steps = [
    { title: "Sign Up & Choose Role", desc: "Register as a candidate or a recruiter.", Icon: UserPlus },
    { title: "Upload & Add a Job", desc: "Drop your résumé, paste the role you're targeting.", Icon: Upload },
    { title: "Review Your Score", desc: "Skills, experience, keywords, and semantic fit.", Icon: BarChart3 },
    { title: "Improve What Matters", desc: "Live ATS tips as you edit in the CV Builder.", Icon: PenLine },
    { title: "Export & Apply", desc: "Download an ATS-friendly résumé, ready to send.", Icon: Trophy },
  ];
  const [visibleCount, setVisibleCount] = useState(animatedMode ? 1 : steps.length);
  const total = steps.length;

  useEffect(() => {
    if (!animatedMode) { setVisibleCount(steps.length); return; }
    setVisibleCount(1);
  }, [animatedMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!animatedMode || visibleCount >= total) return;
    const t = setTimeout(() => setVisibleCount(p => Math.min(p + 1, total)), 5000);
    return () => clearTimeout(t);
  }, [visibleCount, total, animatedMode]);

  return (
    <section className="hp-how" id="how">
      <div className="hp-hwi">
        <Reveal className="hp-sec-head">
          <p className="hp-sec-eyebrow">Process</p>
          <h2 className="hp-sec-h2">How it works</h2>
          <p className="hp-sec-sub">A simple flow — from a raw résumé to an ATS-ready application.</p>

          {animatedMode && (
            <div className="hp-progress-wrap">
              <div className="hp-progress-dots">
                {steps.map((_, i) => (
                  <span key={i} className={`hp-prog-dot${i < visibleCount ? " active" : ""}${i === visibleCount - 1 ? " current" : ""}`} />
                ))}
              </div>
              <span className="hp-progress-text">Step {Math.min(visibleCount, total)} of {total}</span>
              {visibleCount < total && (
                <button className="hp-next-btn" onClick={() => setVisibleCount(p => Math.min(p + 1, total))}>Next →</button>
              )}
              {visibleCount >= total && <span className="hp-done-badge"><CheckCircle2 size={14} strokeWidth={2.5}/> All steps</span>}
            </div>
          )}
        </Reveal>

        <div className="hp-steps">
          {steps.map((step, index) => {
            const revealed = index < visibleCount;
            if (!revealed && !animatedMode) return null;
            return (
              <div
                key={step.title}
                className={`hp-step-card${!revealed ? " hp-step-hidden" : ""}${animatedMode && index === visibleCount - 1 ? " hp-step-new" : ""}`}
                style={{ animationDelay: animatedMode ? "0s" : `${index * 0.06}s` }}
              >
                <span className="hp-step-badge">{String(index + 1).padStart(2, "0")}</span>
                <div className="hp-step-icon"><step.Icon size={18} strokeWidth={2}/></div>
                <h4 className="hp-step-title">{step.title}</h4>
                <p className="hp-step-desc">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Two audiences — replaces testimonials. No fabricated reviews;
   just a direct, honest split of what each side of the platform
   actually does, since we don't have real customer quotes yet.
══════════════════════════════════════════════ */
function Audience({ onGetStarted }) {
  const Check = ({ children }) => (
    <div className="hp-aud-item">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2.5 8L6 11.5L12.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>{children}</span>
    </div>
  );
  return (
    <section className="hp-audience">
      <div className="hp-audience-inner">
        <Reveal className="hp-sec-head">
          <p className="hp-sec-eyebrow">Two Sides, One Platform</p>
          <h2 className="hp-sec-h2">Built for both ends of the hiring process</h2>
          <p className="hp-sec-sub">Whichever side of the table you're on, the same engine does the work.</p>
        </Reveal>

        <Reveal className="hp-aud-grid" as="div">
          <div className="hp-aud-card">
            <span className="hp-aud-tag">For Candidates</span>
            <h3 className="hp-aud-title">Know before you apply</h3>
            <p className="hp-aud-sub">Stop guessing whether your résumé will even get seen.</p>
            <div className="hp-aud-list">
              <Check>Instant ATS quality score across 6 dimensions</Check>
              <Check>A recruiter's-eye view — red flags and blind spots</Check>
              <Check>Guided CV builder with live scoring as you type</Check>
            </div>
            <button className="hp-aud-btn" onClick={onGetStarted}>Start as a candidate <ArrowRight size={14} strokeWidth={2.5}/></button>
          </div>
          <div className="hp-aud-card">
            <span className="hp-aud-tag">For Recruiters</span>
            <h3 className="hp-aud-title">Screen in minutes, not hours</h3>
            <p className="hp-aud-sub">Upload a stack of résumés, get a ranked, explainable shortlist.</p>
            <div className="hp-aud-list">
              <Check>Bulk résumé upload with automatic ranking</Check>
              <Check>Accept/reject reasoning for every candidate</Check>
              <Check>Override any decision, export the shortlist</Check>
            </div>
            <button className="hp-aud-btn" onClick={onGetStarted}>Start as a recruiter <ArrowRight size={14} strokeWidth={2.5}/></button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   Main page
══════════════════════════════════════════════ */
export default function HomePage({ onGetStarted, onCheckCV }) {
  const [scrolled, setScrolled] = useState(false);
  const [animatedMode, setAnimatedMode] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const scoreStats = [
    [useCountUp(6), "Scoring Dimensions"],
    [useCountUp(3), "Analysis Modes"],
    [useCountUp(2), "User Roles"],
  ];

  function handleHowItWorksClick(e) {
    e.preventDefault();
    setAnimatedMode(true);
    document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
  }
  function handleDemoClick(e) {
    e.preventDefault();
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="hp">
      <nav className={`hp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="hp-nav-inner">
          <div className="hp-brand">
            <div className="hp-logo-box">
              <Search size={19} strokeWidth={2.25} color="#8a6010"/>
            </div>
            <div>
              <span className="hp-bname"><span className="bn-r">Resume</span><span className="bn-x">Xpert</span></span>
              <span className="hp-bsub">Smart Resume · Career Edge</span>
            </div>
          </div>
          <div className="hp-nav-r">
            <a href="#features" className="hp-na">Features</a>
            <a href="#demo" className="hp-na" onClick={handleDemoClick}>Live Demo</a>
            <a href="#how" className="hp-na" onClick={handleHowItWorksClick}>How It Works</a>
            <button className="hp-na" style={{ background:"none", border:"none", cursor:"pointer", font:"inherit" }} onClick={onCheckCV}>Check My CV</button>
            <button className="hp-nb" onClick={onGetStarted}>Get Started →</button>
          </div>
        </div>
      </nav>

      <section className="hp-hero">
        <svg className="hp-compass" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="90" stroke="#8a6010" strokeWidth="1"/>
          <circle cx="100" cy="100" r="65" stroke="#8a6010" strokeWidth="1"/>
          <circle cx="100" cy="100" r="40" stroke="#8a6010" strokeWidth=".8"/>
          <circle cx="100" cy="100" r="3" fill="#8a6010"/>
          <path d="M100 100 L100 10 A90 90 0 0 1 163 37 Z" fill="#8a6010" opacity=".22"/>
          <circle cx="100" cy="24" r="3" fill="#8a6010" opacity=".7"/>
          <circle cx="160" cy="130" r="2.4" fill="#8a6010" opacity=".55"/>
          <circle cx="45" cy="150" r="2" fill="#8a6010" opacity=".4"/>
          <circle cx="145" cy="55" r="2" fill="#8a6010" opacity=".5"/>
        </svg>
        <svg className="hp-compass2" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="3" fill="#8a6010"/>
          <path d="M100 78 L106 94 L100 100 L94 94 Z" fill="#8a6010" opacity=".6"/>
          {[[100,40,100,4],[100,160,100,196],[40,100,4,100],[160,100,196,100]].map(([x1,y1,x2,y2],i)=>(
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a6010" strokeWidth="1" strokeDasharray="2 4"/>
          ))}
          <circle cx="100" cy="100" r="30" stroke="#8a6010" strokeWidth=".8"/>
          <circle cx="100" cy="100" r="55" stroke="#8a6010" strokeWidth=".8"/>
          <circle cx="100" cy="100" r="80" stroke="#8a6010" strokeWidth=".6"/>
        </svg>

        {/* Small drifting elements — a résumé, a verified seal, a match score —
            each its own gentle float, independent of the two radar motifs. */}
        <svg className="hp-float hp-float-a" viewBox="0 0 44 44" fill="none">
          <rect x="6" y="4" width="32" height="38" rx="3" stroke="#8a6010" strokeWidth="1.4"/>
          <line x1="13" y1="14" x2="31" y2="14" stroke="#8a6010" strokeWidth="1.3"/>
          <line x1="13" y1="21" x2="31" y2="21" stroke="#8a6010" strokeWidth="1.3"/>
          <line x1="13" y1="28" x2="24" y2="28" stroke="#8a6010" strokeWidth="1.3"/>
        </svg>
        <svg className="hp-float hp-float-b" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="17" stroke="#8a6010" strokeWidth="1.4"/>
          <path d="M12 20 L17 26 L28 13" stroke="#8a6010" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <svg className="hp-float hp-float-c" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="18" stroke="#8a6010" strokeWidth="1.4"/>
          <circle cx="22" cy="22" r="18" stroke="#8a6010" strokeWidth="3" strokeDasharray="80 113" strokeDashoffset="-15" strokeLinecap="round"/>
          <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" fill="#8a6010" fontFamily="inherit">92</text>
        </svg>

        <div className="hp-hero-vig"/>

        <div className="hp-hi">
          <div>
            <Reveal className="hp-seal" as="div">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 4.5v7M4.5 8h7" stroke="currentColor" strokeWidth="1"/></svg>
              Built for real hiring pipelines
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="hp-hero-title">
                Your resume, scored the way <span className="grad">recruiters actually screen it</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="hp-hero-sub">
                Upload your résumé, match it to a real job, and get a clear score plus exactly what to fix.
              </p>
            </Reveal>
            <Reveal delay={0.15} className="hp-hero-cta-row">
              <button className="hp-btn-primary" onClick={onGetStarted}>Start Free Analysis <ArrowRight size={16} strokeWidth={2.5}/></button>
              <button className="hp-btn-ghost" onClick={handleDemoClick}><Play size={15} strokeWidth={2.25}/> See it in action</button>
            </Reveal>
            <Reveal delay={0.18}>
              <button
                onClick={onCheckCV}
                style={{
                  marginTop: 14, background: "none", border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  color: "#8a6010", display: "inline-flex", alignItems: "center", gap: 6,
                  padding: 0, textDecoration: "underline", textUnderlineOffset: "3px",
                }}
              >
              </button>
            </Reveal>
            <Reveal delay={0.2} className="hp-hero-proof">
              <div className="hp-proof-avatars">
                {[0,1,2].map((i)=>(
                  <span className="hp-proof-avatar" key={i}><Users size={13} strokeWidth={2.5}/></span>
                ))}
              </div>
              <span className="hp-proof-text">Built for candidates & recruiters, side by side</span>
            </Reveal>
          </div>

          <Reveal delay={0.15}><HeroMockup /></Reveal>
        </div>
      </section>

      <div className="hp-stats">
        <div className="hp-stats-inner">
          {scoreStats.map(([[val, ref], label], i) => (
            <div className="hp-stat" ref={ref} key={label}>
              <span className="hp-stat-num">{val}</span>
              <span className="hp-stat-label">{label}</span>
            </div>
          ))}
          <div className="hp-stat">
            <span className="hp-stat-num">PDF</span>
            <span className="hp-stat-label">Instant CV Export</span>
          </div>
        </div>
      </div>

      <InteractiveDemo />
      <FeatureGrid />
      <HowItWorks animatedMode={animatedMode} />
      <Audience onGetStarted={onGetStarted} />

      <section className="hp-cta-sec">
        <Reveal className="hp-cta-card">
          <h2 className="hp-cta-h2">Ready to strengthen your resume?</h2>
          <p className="hp-cta-p">Clearer feedback, sharper positioning, before you hit submit.</p>
          <button className="hp-cta-btn" onClick={onGetStarted}>Analyse My Resume <ArrowRight size={17} strokeWidth={2.5}/></button>
          <button
            onClick={onCheckCV}
            style={{
              marginTop: 14, background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              color: "#8a6010", textDecoration: "underline", textUnderlineOffset: "3px",
            }}
          >
                          Try it free, no account needed →
          </button>
        </Reveal>
      </section>

      <footer className="hp-foot">
        <div className="hp-fi">
          <div className="hp-fb">
            <Search size={16} strokeWidth={2.25} color="#8a6010"/>
            <span className="hp-fn">ResumeXpert</span>
          </div>
          <p> ResumeXpert · Smart Resume · Career Edge</p>
        </div>
      </footer>
    </div>
  );
}

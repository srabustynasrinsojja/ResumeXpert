/**
 * ResumeXpert — Shared UI Components
 * Place this file at: src/components/ui.jsx
 *
 * Exports: ScoreRing, VBar, DecoRule, Spinner, FileDropZone,
 *          ErrorNote, BreakdownGrid, StrengthList, ImproveList,
 *          StepsList, EncouragementCard
 */

import { useState, useRef } from "react";
import { FileText, FolderOpen, X, AlertTriangle } from "lucide-react";

/* ─────────────────────────────────────────────
   ScoreRing
   Animated SVG ring showing a 0–100 score.
───────────────────────────────────────────── */
export function ScoreRing({ score, size = 130, stroke = 12 }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(Math.max(score || 0, 0), 100);
  const color =
    pct >= 70 ? "#5ac070" :
    pct >= 45 ? "#c9a84c" :
                "#e07c5a";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(201,168,76,.14)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          transform: "rotate(90deg)",
          transformOrigin: "center",
          fontSize: size * 0.2,
          fontWeight: "bold",
          fill: color,
          fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        {pct.toFixed(0)}
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   VBar
   Horizontal progress bar with label.
───────────────────────────────────────────── */
export function VBar({ value = 0, label, sublabel }) {
  const pct   = Math.min(Math.max(value, 0), 100);
  const color =
    pct >= 70 ? "#5ac070" :
    pct >= 45 ? "#c9a84c" :
                "#e07c5a";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{
          fontSize: 12, fontWeight: "bold",
          color: "rgba(232,220,168,.7)",
          textTransform: "uppercase", letterSpacing: ".07em",
        }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: "bold", color }}>{pct.toFixed(1)}</span>
      </div>
      <div style={{
        height: 6,
        background: "rgba(201,168,76,.12)",
        borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 99,
          animation: "ui-bar .9s ease both",
        }} />
      </div>
      {sublabel && (
        <p style={{ fontSize: 11, color: "rgba(232,220,168,.4)", marginTop: 4 }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   DecoRule
   Decorative divider with centred label.
───────────────────────────────────────────── */
export function DecoRule({ label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      margin: "20px 0 16px",
    }}>
      <span style={{
        flex: 1, height: 1,
        background: "rgba(201,168,76,.16)",
      }} />
      <span style={{
        fontSize: 9, fontWeight: "bold",
        letterSpacing: ".18em", textTransform: "uppercase",
        color: "rgba(201,168,76,.38)", whiteSpace: "nowrap",
      }}>
        {label || "✦"}
      </span>
      <span style={{
        flex: 1, height: 1,
        background: "rgba(201,168,76,.16)",
      }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Spinner
   Loading indicator.
───────────────────────────────────────────── */
export function Spinner({ text = "Analysing your resume…" }) {
  return (
    <>
      <style>{`
        @keyframes ui-spin {
          to { transform: rotate(360deg); }
        }
        .ui-spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid rgba(201,168,76,.18);
          border-top-color: #c9a84c;
          animation: ui-spin .7s linear infinite;
          flex-shrink: 0;
        }
      `}</style>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "18px 0",
        color: "rgba(232,220,168,.55)", fontSize: 13,
      }}>
        <div className="ui-spinner" />
        <span>{text}</span>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   FileDropZone
   Drag-and-drop file input for PDF/DOC/DOCX.
───────────────────────────────────────────── */
export function FileDropZone({ file, onChange }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();

  const onDrop = e => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onChange(f);
  };

  return (
    <>
      <style>{`
        @keyframes ui-bar { from { width: 0; } }
        .ui-dropzone {
          border: 2px dashed rgba(201,168,76,.28);
          border-radius: 12px;
          padding: 28px 20px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all .2s;
          min-height: 120px;
          background: rgba(12,18,8,.55);
        }
        .ui-dropzone:hover {
          border-color: rgba(201,168,76,.5);
          background: rgba(201,168,76,.05);
        }
        .ui-dropzone.over {
          border-color: #c9a84c;
          border-style: solid;
          background: rgba(201,168,76,.08);
        }
        .ui-dropzone.filled {
          border-style: solid;
          border-color: rgba(90,192,112,.35);
          background: rgba(90,192,112,.05);
        }
      `}</style>
      <div
        className={`ui-dropzone${drag ? " over" : ""}${file ? " filled" : ""}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => ref.current.click()}
      >
        <input
          ref={ref} type="file"
          accept=".pdf,.doc,.docx"
          style={{ display: "none" }}
          onChange={e => onChange(e.target.files?.[0] || null)}
        />
        {file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
            <span style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.25)",
            }}><FileText size={19} strokeWidth={2} color="#c9a84c"/></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontWeight: "bold", fontSize: 13,
                color: "rgba(232,220,168,.9)",
                margin: 0, wordBreak: "break-all",
              }}>{file.name}</p>
              <p style={{
                fontSize: 11, color: "rgba(201,168,76,.5)",
                margin: "3px 0 0",
              }}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              style={{
                background: "rgba(220,80,60,.15)",
                border: "1px solid rgba(220,80,60,.3)",
                color: "#f09a72", borderRadius: 6,
                padding: "5px 8px", fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center",
              }}
              onClick={e => { e.stopPropagation(); onChange(null); }}
            ><X size={13} strokeWidth={2.5}/></button>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <span style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 10px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(201,168,76,.1)", border: "1px solid rgba(201,168,76,.22)",
            }}><FolderOpen size={24} strokeWidth={1.75} color="#c9a84c"/></span>
            <p style={{
              fontWeight: "bold", fontSize: 14,
              color: "rgba(232,220,168,.6)", margin: "0 0 4px",
            }}>Drop your résumé here</p>
            <p style={{
              fontSize: 12, color: "rgba(201,168,76,.35)", margin: 0,
            }}>PDF · DOC · DOCX &nbsp;·&nbsp; or click to browse</p>
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   ErrorNote
   Inline error message box.
───────────────────────────────────────────── */
export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <div style={{
      marginTop: 14,
      padding: "12px 16px",
      background: "rgba(220,80,60,.12)",
      border: "1px solid rgba(220,80,60,.3)",
      borderRadius: 8,
      color: "#f09a72",
      fontSize: 13,
      lineHeight: 1.6,
      display: "flex", alignItems: "flex-start", gap: 9,
    }}>
      <AlertTriangle size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}/>
      <span>{message}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   BreakdownGrid
   Grid of labelled score bars for a breakdown object.
   keys: array of keys to render in order.
───────────────────────────────────────────── */
const BREAKDOWN_LABELS = {
  // ATS / score dimensions
  keyword_match:    "Keyword Match",
  skills_match:     "Skills Match",
  experience_match: "Experience",
  semantic_match:   "Semantic Fit",
  format_quality:   "Format Quality",
  section_presence: "Sections",
  // CV quality dimensions
  contact:          "Contact Info",
  sections:         "Sections",
  achievements:     "Achievements",
  readability:      "Readability",
  skills_clarity:   "Skills Clarity",
};
const BREAKDOWN_COLORS = [
  "linear-gradient(90deg,#4caf76,#38d070)",
  "linear-gradient(90deg,#c9a84c,#e8c84a)",
  "linear-gradient(90deg,#5b9bd5,#78b8f0)",
  "linear-gradient(90deg,#e07c5a,#f09a72)",
  "linear-gradient(90deg,#9b7bd5,#b89af0)",
  "linear-gradient(90deg,#5bc4c0,#72e0d8)",
];
const BREAKDOWN_SOLIDS = [
  "#38d070","#c9a84c","#78b8f0","#f09a72","#b89af0","#72e0d8",
];

export function BreakdownGrid({ breakdown = {}, keys }) {
  const entries = keys
    ? keys.map(k => [k, breakdown[k] ?? 0])
    : Object.entries(breakdown);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12, marginBottom: 16,
    }}>
      {entries.map(([key, val], i) => (
        <div key={key} style={{
          background: "rgba(255,255,255,.03)",
          border: "1px solid rgba(201,168,76,.1)",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: "bold",
              color: "rgba(201,168,76,.65)",
              textTransform: "uppercase", letterSpacing: ".08em",
            }}>
              {BREAKDOWN_LABELS[key] || key.replace(/_/g, " ")}
            </span>
            <span style={{
              fontSize: 16, fontWeight: "bold",
              color: BREAKDOWN_SOLIDS[i % BREAKDOWN_SOLIDS.length],
            }}>{val}</span>
          </div>
          <div style={{
            height: 5, background: "rgba(201,168,76,.1)",
            borderRadius: 99, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.min(val, 100)}%`,
              background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
              borderRadius: 99,
              animation: "ui-bar 1.1s ease both",
              animationDelay: `${i * 0.08}s`,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   StrengthList
   Green-checkmark list of strengths.
───────────────────────────────────────────── */
export function StrengthList({ items = [] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "#5ac070", fontWeight: "bold", fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
          <span style={{ fontSize: 13, color: "rgba(232,220,168,.72)", lineHeight: 1.65 }}>
            {typeof item === "string" ? item : item.strength || item.area || JSON.stringify(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────
   ImproveList
   Amber-arrow list of improvement suggestions.
───────────────────────────────────────────── */
export function ImproveList({ items = [] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "#c9a84c", fontWeight: "bold", fontSize: 13, marginTop: 1, flexShrink: 0 }}>→</span>
          <span style={{ fontSize: 13, color: "rgba(232,220,168,.72)", lineHeight: 1.65 }}>
            {typeof item === "string" ? item : item.area || item.suggestion || item.improvement || JSON.stringify(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────
   StepsList
   Numbered action steps list.
───────────────────────────────────────────── */
export function StepsList({ items = [] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%",
            border: "1.5px solid rgba(201,168,76,.4)",
            color: "#c9a84c", fontSize: 11, fontWeight: "bold",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 1,
          }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 13, color: "rgba(232,220,168,.7)", lineHeight: 1.65 }}>
            {typeof item === "string" ? item : item.action || item.step || JSON.stringify(item)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   EncouragementCard
   Warm closing message at the bottom of results.
───────────────────────────────────────────── */
export function EncouragementCard({ text }) {
  if (!text) return null;
  return (
    <div style={{
      marginTop: 22,
      background: "linear-gradient(135deg,rgba(201,168,76,.1),rgba(201,168,76,.05))",
      border: "1px solid rgba(201,168,76,.25)",
      borderRadius: 12,
      padding: "18px 20px",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>✦</span>
      <p style={{
        fontSize: 13,
        color: "rgba(232,220,168,.7)",
        lineHeight: 1.75,
        fontStyle: "italic",
        margin: 0,
      }}>{text}</p>
    </div>
  );
}
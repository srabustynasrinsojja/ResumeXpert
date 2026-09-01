/**
 * premium.jsx — Stripe/Linear/Vercel-inspired component library.
 * Pairs with the --pm- CSS tokens in styles.css. Zero new dependencies —
 * plain React + inline styles + the .pm-* utility classes, so it drops
 * into the existing stack with no build config changes.
 *
 * Import what you need:
 *   import { RadialScore, MatchPill, KeywordTag, SkeletonBlock, PremiumCard } from "../components/premium";
 */
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

/* ── PremiumCard: the base surface every other component sits on ── */
export function PremiumCard({ children, interactive = false, padding = "1.25rem", style = {}, ...rest }) {
  return (
    <div
      className={`pm-card${interactive ? " pm-card--interactive" : ""}`}
      style={{ padding, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── MatchPill: glowing percentage badge, e.g. "94% Match" ──────── */
export function MatchPill({ percent, size = "md" }) {
  const tone = percent >= 80 ? "success" : percent >= 50 ? "warning" : "danger";
  const colors = {
    success: { bg: "var(--pm-success-bg)", fg: "var(--pm-success)", glow: "rgba(90,192,112,.35)" },
    warning: { bg: "var(--pm-warning-bg)", fg: "var(--pm-warning)", glow: "rgba(226,163,61,.3)" },
    danger:  { bg: "var(--pm-danger-bg)",  fg: "var(--pm-danger)",  glow: "rgba(220,80,60,.3)" },
  }[tone];
  const fontSize = size === "sm" ? 11 : 12.5;
  const padding = size === "sm" ? "3px 10px" : "5px 13px";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize, fontWeight: 600, padding, borderRadius: 999,
      background: colors.bg, color: colors.fg,
      boxShadow: `0 0 0 1px ${colors.glow}, 0 2px 8px -2px ${colors.glow}`,
      fontFamily: "var(--pm-font)",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", background: colors.fg,
        boxShadow: `0 0 6px 1px ${colors.glow}`,
      }} />
      {Math.round(percent)}% match
    </span>
  );
}

/* ── KeywordTag: green = found, amber = missing ──────────────────── */
export function KeywordTag({ text, found }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11.5, fontWeight: 500, padding: "4px 11px", borderRadius: 999,
      background: found ? "var(--pm-success-bg)" : "var(--pm-warning-bg)",
      color: found ? "var(--pm-success)" : "var(--pm-warning)",
      fontFamily: "var(--pm-font)",
    }}>
      {found ? <Check size={12} strokeWidth={2.5}/> : <X size={12} strokeWidth={2.5}/>}
      {text}
    </span>
  );
}

/* ── RadialScore: animated SVG progress ring ─────────────────────── */
export function RadialScore({ score, size = 96, stroke = 8, label }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 50); // let mount settle, then animate
    return () => clearTimeout(t);
  }, [score]);

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, animated)) / 100) * circumference;
  const tone = score >= 80 ? "var(--pm-success)" : score >= 50 ? "var(--pm-warning)" : "var(--pm-danger)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pm-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" }}
        />
        <text x="50%" y="50%" dy=".35em" textAnchor="middle"
          style={{ fontSize: size * 0.22, fontWeight: 700, fill: "var(--pm-text)", fontFamily: "var(--pm-font)" }}>
          {Math.round(animated)}
        </text>
      </svg>
      {label && <span style={{ fontSize: 12, color: "var(--pm-text-secondary)", fontFamily: "var(--pm-font)" }}>{label}</span>}
    </div>
  );
}

/* ── SkeletonBlock: shimmering placeholder while a job is running ── */
export function SkeletonBlock({ width = "100%", height = 16, radius }) {
  return (
    <div className="pm-skeleton" style={{ width, height, borderRadius: radius }} />
  );
}

/** A ready-made skeleton for "parsing a resume" — mirrors the shape of
 * the real result (name line, score ring placeholder, tag row) so the
 * transition from loading -> loaded doesn't jump around. */
export function ResumeParsingSkeleton() {
  return (
    <PremiumCard>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div className="pm-skeleton" style={{ width: 96, height: 96, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonBlock width="55%" height={16} />
          <SkeletonBlock width="35%" height={12} />
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <SkeletonBlock width={70} height={22} radius={999} />
            <SkeletonBlock width={90} height={22} radius={999} />
            <SkeletonBlock width={60} height={22} radius={999} />
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}

/* ── Avatar: initials circle for people (candidates, recruiters) ─── */
export function Avatar({ name, size = 40 }) {
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "var(--pm-accent-bg)", color: "var(--pm-accent)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.38, fontFamily: "var(--pm-font)",
    }}>
      {initials}
    </div>
  );
}

/* ── PremiumButton: one accent-filled per screen, others ghost ───── */
export function PremiumButton({ children, variant = "ghost", onClick, disabled, style = {}, ...rest }) {
  const variants = {
    primary: { background: "var(--pm-accent)", color: "var(--pm-accent-on)", border: "1px solid transparent" },
    ghost:   { background: "var(--pm-surface)", color: "var(--pm-text)", border: "1px solid var(--pm-border-strong)" },
    danger:  { background: "var(--pm-danger-bg)", color: "var(--pm-danger)", border: "1px solid transparent" },
  }[variant];
  return (
    <button
      className="pm-pressable pm-focusable"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants, padding: "9px 18px", borderRadius: "var(--pm-radius-sm)",
        fontSize: 13.5, fontWeight: 600, fontFamily: "var(--pm-font)",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? .55 : 1,
        transition: "all .15s ease", ...style,
      }}
      onMouseEnter={e => { if (!disabled && variant === "primary") e.currentTarget.style.background = "var(--pm-accent-hover)"; }}
      onMouseLeave={e => { if (!disabled && variant === "primary") e.currentTarget.style.background = "var(--pm-accent)"; }}
      {...rest}
    >
      {children}
    </button>
  );
}

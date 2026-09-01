/**
 * MyApplications — candidate's own application list with status tracking.
 */
import { useEffect, useState } from "react";
import { Inbox, Video, Calendar } from "lucide-react";
import { myApplications, withdrawApplication } from "../api/client";
import { Spinner, ErrorNote, ScoreRing } from "../components/ui";
import InterviewRoom from "../components/InterviewRoom";

const STATUS_STYLES = {
  applied:             { label: "Applied",             bg: "rgba(201,168,76,.12)", border: "rgba(201,168,76,.3)",  color: "#c9a84c" },
  ai_ranked:           { label: "Ranked",              bg: "rgba(201,168,76,.12)", border: "rgba(201,168,76,.3)",  color: "#c9a84c" },
  reviewed:            { label: "Reviewed",             bg: "rgba(91,155,213,.12)", border: "rgba(91,155,213,.3)",  color: "#78b8f0" },
  interview_scheduled: { label: "Interview scheduled",  bg: "rgba(160,120,220,.14)",border: "rgba(160,120,220,.35)",color: "#c3aef0" },
  hired:               { label: "Hired",                bg: "rgba(90,192,112,.2)",  border: "rgba(90,192,112,.4)",  color: "#8fdb9f" },
  rejected:            { label: "Rejected",             bg: "rgba(220,80,60,.12)",  border: "rgba(220,80,60,.3)",   color: "#f09a72" },
  withdrawn:           { label: "Withdrawn",             bg: "rgba(255,255,255,.06)", border: "rgba(255,255,255,.14)", color: "var(--ink-muted)" },
};
const WITHDRAWABLE = new Set(["ai_ranked", "reviewed", "interview_scheduled"]);

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function formatInterviewTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function ApplicationCard({ app, onWithdraw, onJoinInterview }) {
  const style = STATUS_STYLES[app.status] || STATUS_STYLES.applied;
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleWithdraw() {
    setWithdrawing(true);
    try {
      await withdrawApplication(app.id);
      onWithdraw(app.id);
    } catch (e) {
      setWithdrawing(false);
      setConfirming(false);
      alert(e.message);
    }
  }

  const hasInterview = app.status === "interview_scheduled" && app.interview_datetime && app.interview_room;

  return (
    <div style={{
      background: "var(--pm-surface-sunken)", border: "1px solid var(--pm-border)",
      borderRadius: 14, padding: "18px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <ScoreRing score={app.combined_score} size={56} stroke={6} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: "bold", color: "var(--ink)" }}>
            {app.job_title}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#c9a84c", fontWeight: "bold" }}>
            {app.company_name}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-faded)" }}>
            Applied {timeAgo(app.applied_at)} · Match {app.job_match_score?.toFixed(0)}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: "bold", padding: "5px 14px", borderRadius: 99,
            background: style.bg, border: `1px solid ${style.border}`, color: style.color,
            textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap",
          }}>
            {style.label}
          </span>
          {WITHDRAWABLE.has(app.status) && (
            confirming ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleWithdraw} disabled={withdrawing} style={{
                  fontSize: 10.5, fontWeight: "bold", padding: "4px 10px", borderRadius: 7,
                  background: "rgba(220,80,60,.15)", border: "1px solid rgba(220,80,60,.35)", color: "#f09a72",
                  cursor: "pointer", fontFamily: "inherit",
                }}>{withdrawing ? "…" : "Confirm"}</button>
                <button onClick={() => setConfirming(false)} style={{
                  fontSize: 10.5, fontWeight: "bold", padding: "4px 10px", borderRadius: 7,
                  background: "transparent", border: "1px solid var(--pm-border-strong)", color: "var(--ink-muted)",
                  cursor: "pointer", fontFamily: "inherit",
                }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} style={{
                fontSize: 10.5, fontWeight: "bold", padding: "4px 10px", borderRadius: 7,
                background: "transparent", border: "1px solid var(--pm-border-strong)", color: "var(--ink-muted)",
                cursor: "pointer", fontFamily: "inherit",
              }}>Withdraw</button>
            )
          )}
        </div>
      </div>

      {hasInterview && (
        <div style={{
          marginTop: 14, padding: "12px 16px", borderRadius: 10,
          background: "rgba(160,120,220,.08)", border: "1px solid rgba(160,120,220,.25)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7348c4", fontSize: 12.5, fontWeight: "bold" }}>
            <Calendar size={14} strokeWidth={2.25} />
            Interview: {formatInterviewTime(app.interview_datetime)}
          </div>
          <button onClick={() => onJoinInterview(app)} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#7348c4,#9268e0)", color: "#fff",
            fontWeight: "bold", fontSize: 12.5, fontFamily: "inherit",
          }}><Video size={14} strokeWidth={2.25} /> Join Interview</button>
        </div>
      )}
    </div>
  );
}

export default function MyApplications() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeInterview, setActiveInterview] = useState(null);

  useEffect(() => {
    myApplications()
      .then(d => setApps(d.applications || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner text="Loading your applications…" />;
  if (error) return <ErrorNote message={error} />;

  if (apps.length === 0) {
    return (
      <div style={{
        maxWidth: 800, margin: "0 auto",
        background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
        borderRadius: "var(--pm-radius-lg)", boxShadow: "var(--pm-shadow-md)",
        padding: "60px 24px", textAlign: "center", color: "var(--ink-muted)",
        fontFamily: "var(--pm-font)",
      }}>
        <Inbox size={38} strokeWidth={1.6} color="var(--ink-faded)" style={{ display:"block", margin:"0 auto 8px" }}/>
        <p>You haven't applied to any jobs yet — browse open jobs and apply to see them here.</p>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 820, margin: "0 auto",
      background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
      borderRadius: "var(--pm-radius-lg)", boxShadow: "var(--pm-shadow-md)",
      padding: "26px 28px 30px", fontFamily: "var(--pm-font)",
    }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "var(--ink)" }}>My Applications</h2>
      <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "var(--ink-muted)" }}>
        {apps.length} application{apps.length === 1 ? "" : "s"} in progress
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        {apps.map(app => (
          <ApplicationCard
            key={app.id} app={app}
            onWithdraw={id => setApps(prev => prev.map(a => a.id === id ? { ...a, status: "withdrawn" } : a))}
            onJoinInterview={setActiveInterview}
          />
        ))}
      </div>

      {activeInterview && (
        <InterviewRoom
          room={activeInterview.interview_room}
          title={`Interview — ${activeInterview.job_title} at ${activeInterview.company_name}`}
          onClose={() => setActiveInterview(null)}
        />
      )}
    </div>
  );
}

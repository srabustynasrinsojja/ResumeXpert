import { X, Video } from "lucide-react";

/* Full-screen live interview room. Uses the free public Jitsi Meet
   deployment (meet.jit.si) — no account, API key, or backend signaling
   needed. `room` must be the same string for both participants; the
   backend already generates and stores one per application
   (see database.schedule_interview_db). */
export default function InterviewRoom({ room, title, onClose }) {
  if (!room) return null;
  const src = `https://meet.jit.si/${encodeURIComponent(room)}#config.prejoinPageEnabled=true&config.disableDeepLinking=true`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "#0a0e08", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", background: "#12190d", borderBottom: "1px solid rgba(201,168,76,.2)",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Video size={16} strokeWidth={2.25} color="#deba52" /></span>
          <div>
            <p style={{ margin: 0, color: "#e8dfc8", fontWeight: "bold", fontSize: 14 }}>{title || "Live Interview"}</p>
            <p style={{ margin: 0, color: "rgba(232,223,200,.5)", fontSize: 11 }}>No account needed — camera/mic permission will be asked by the video window</p>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "rgba(220,80,60,.15)", border: "1px solid rgba(220,80,60,.35)",
          color: "#f09a72", borderRadius: 8, padding: "9px 18px", cursor: "pointer",
          fontWeight: "bold", fontSize: 13, display: "flex", alignItems: "center", gap: 6,
        }}><X size={15} strokeWidth={2.5} /> Leave</button>
      </div>
      <iframe
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        style={{ flex: 1, border: "none", width: "100%" }}
        title="Live Interview"
      />
    </div>
  );
}

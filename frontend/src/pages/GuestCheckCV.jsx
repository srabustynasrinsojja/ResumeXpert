import { ArrowLeft, Search } from "lucide-react";
import CheckCV from "./CheckCV";

/* ── Standalone, no-login CV check page, linked from the homepage.
   Reuses the same CheckCV component the logged-in app uses (it already
   calls the guest-safe /candidate/resume-quality/file endpoint), wrapped
   in its own light nav bar so it doesn't need MainApp/auth context. ── */
export default function GuestCheckCV({ onBack, onSignUp }) {
  return (
    <div className="theme-candidate" style={{ minHeight: "100vh" }}>
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--pm-chrome-bg)",
        borderBottom: "1px solid var(--pm-chrome-border)",
        backdropFilter: "blur(16px)",
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "0 clamp(14px,4vw,32px)",
          minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
        }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
              cursor: "pointer", fontFamily: "inherit", color: "var(--pm-chrome-text-secondary)", fontSize: 13.5,
            }}
          >
            <ArrowLeft size={16} strokeWidth={2.25}/> Back to Home
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={17} strokeWidth={2.25} color="#8a6010"/>
            <span style={{ fontWeight: "bold", fontSize: 14, color: "var(--pm-chrome-text-secondary)" }}>ResumeXpert</span>
          </div>
          <button
            onClick={onSignUp}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid var(--pm-chrome-border-strong)",
              background: "var(--pm-accent-bg)", color: "var(--pm-accent-solid)",
              fontWeight: "bold", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Sign Up Free
          </button>
        </div>
      </nav>
      <main style={{ padding: "32px 24px 56px", fontFamily: "var(--pm-font)" }}>
        <CheckCV guestMode onSignUp={onSignUp} />
      </main>
    </div>
  );
}

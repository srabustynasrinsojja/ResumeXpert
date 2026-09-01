import { useEffect, useState } from "react";
import { getToken, getUser, getMe, setUser, logout } from "./api/client";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/Homepage";
import "./pages/Auth.css";
import "./pages/Homepage.css";
import MainApp from "./MainApp";
import OnboardingWizard from "./pages/OnboardingWizard";
import CompanySetup from "./pages/CompanySetup";
import GuestCheckCV from "./pages/GuestCheckCV";

export default function App() {
  const [user, setUserState] = useState(null);
  const [checking, setChecking] = useState(true);
  // "home" | "auth" | "checkcv" | "app"
  const [page, setPage] = useState("home");

  useEffect(() => {
    const token = getToken();
    const cached = getUser();

    if (token && cached) {
      getMe()
        .then((u) => {
          setUser(u);
          setUserState(u);
          setPage("app");
        })
        .catch(() => {
          logout();
          setUserState(null);
          setPage("home");
        })
        .finally(() => setChecking(false));
    } else {
      logout();
      setChecking(false);
      setPage("home");
    }
  }, []);

  function handleAuth(u) {
    setUserState(u);
    setPage("app");
  }

  function handleLogout() {
    logout();
    setUserState(null);
    setPage("home");
  }

  // Loading spinner
  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink)",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 30%, var(--brass2), var(--brass))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: "var(--ink)",
            boxShadow: "0 0 20px rgba(181,134,13,.4)",
          }}
        >
          ✦
        </div>
        <p
          style={{
            color: "var(--parchment3)",
            fontSize: 14,
            letterSpacing: ".06em",
          }}
        >
          Loading…
        </p>
      </div>
    );
  }

  if (page === "home") {
    return (
      <HomePage
        onGetStarted={() => setPage("auth")}
        onCheckCV={() => setPage("checkcv")}
      />
    );
  }

  if (page === "checkcv" && !user) {
    return (
      <GuestCheckCV
        onBack={() => setPage("home")}
        onSignUp={() => setPage("auth")}
      />
    );
  }

  if (page === "auth" && !user) {
    return (
      <AuthPage
        onAuth={handleAuth}
        onBack={() => setPage("home")}
      />
    );
  }

  if (user) {
    // Post-login routing (blueprint Section 1): route to onboarding/company-setup
    // before ever showing the main dashboard, instead of dropping the user onto
    // an empty/broken experience.
    if (user.role === "candidate" && user.profile_complete === false) {
      return (
        <OnboardingWizard
          user={user}
          initialStep={user.onboarding_next_step}
          onComplete={() => {
            const completed = { ...user, profile_complete: true, onboarding_next_step: null };
            setUser(completed);
            setUserState(completed);
          }}
        />
      );
    }
    if (user.role === "recruiter" && user.company_verified === false) {
      return (
        <CompanySetup
          onComplete={(updatedProfile) => {
            const completed = { ...user, ...updatedProfile };
            setUser(completed);
            setUserState(completed);
          }}
        />
      );
    }
    return (
      <MainApp
        user={user}
        onLogout={handleLogout}
      />
    );
  }

  return <HomePage onGetStarted={() => setPage("auth")} />;
}
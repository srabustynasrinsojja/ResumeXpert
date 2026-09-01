import { useEffect, useState } from "react";
import { MapPin, Globe, Facebook, Linkedin, Twitter, Image as ImageIcon, Briefcase, X, CheckCircle2 } from "lucide-react";
import { getCompanyProfile } from "../api/client";
import { Spinner, ErrorNote } from "./ui";

function normalizeUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/* ── Read-only company detail block — map, socials, photos, open jobs.
   Used both on the recruiter's own "Company Profile" tab and on the
   public page a candidate opens from a job listing. ── */
export function CompanyDetailsView({ company, openJobs = [] }) {
  if (!company) return null;
  const socials = [
    { key: "website", Icon: Globe, label: "Website", url: company.website },
    { key: "facebook", Icon: Facebook, label: "Facebook", url: company.facebook },
    { key: "linkedin", Icon: Linkedin, label: "LinkedIn", url: company.linkedin },
    { key: "twitter", Icon: Twitter, label: "Twitter / X", url: company.twitter },
  ].filter(s => s.url);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {company.description && (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-soft)" }}>{company.description}</p>
      )}

      {socials.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {socials.map(s => (
            <a key={s.key} href={normalizeUrl(s.url)} target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8,
              background: "var(--pm-surface-sunken)", border: "1px solid var(--pm-border)",
              color: "var(--ink-soft)", fontSize: 12, fontWeight: "bold", textDecoration: "none",
            }}><s.Icon size={13} strokeWidth={2.25} />{s.label}</a>
          ))}
        </div>
      )}

      {company.photos?.length > 0 && (
        <div>
          <p style={{ fontSize: 11.5, fontWeight: "bold", color: "rgba(201,168,76,.75)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
            Photos
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {company.photos.map((src, i) => (
              <img key={i} src={src} alt="" style={{
                width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10,
                border: "1px solid var(--pm-border)",
              }} />
            ))}
          </div>
        </div>
      )}

      {company.location && (
        <div>
          <p style={{ fontSize: 11.5, fontWeight: "bold", color: "rgba(201,168,76,.75)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={13} strokeWidth={2.25} /> {company.location}
          </p>
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--pm-border)", height: 220 }}>
            <iframe
              title="Company location"
              width="100%" height="100%" style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps?q=${encodeURIComponent(company.location)}&output=embed`}
            />
          </div>
        </div>
      )}

      {openJobs.length > 0 && (
        <div>
          <p style={{ fontSize: 11.5, fontWeight: "bold", color: "rgba(201,168,76,.75)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
            Open Positions ({openJobs.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {openJobs.map(j => (
              <div key={j.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: "var(--pm-surface-sunken)", border: "1px solid var(--pm-border)", borderRadius: 9,
              }}>
                <Briefcase size={14} strokeWidth={2} color="var(--brass)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: "bold", color: "var(--ink)" }}>{j.title}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--ink-faded)" }}>{j.location} · {j.employment_type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Modal a candidate opens by clicking a company name on a job listing ── */
export function CompanyProfileModal({ recruiterId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCompanyProfile(recruiterId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [recruiterId]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 250,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--pm-card-bg)", border: "1px solid var(--pm-border)",
        borderRadius: 18, padding: "26px 30px", maxWidth: 560, width: "100%",
        maxHeight: "85vh", overflowY: "auto", fontFamily: "var(--pm-font)",
        boxShadow: "var(--pm-shadow-lg)",
      }}>
        {loading && <Spinner text="Loading company profile…" />}
        {!loading && error && <ErrorNote message={error} />}
        {!loading && data && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {data.company.avatar ? (
                  <img src={data.company.avatar} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", border: "1px solid var(--pm-border)" }} />
                ) : (
                  <div style={{
                    width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                    background: "linear-gradient(135deg,#c9a84c,#deba52)", color: "#1a1208",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 18,
                  }}><ImageIcon size={20} strokeWidth={2} /></div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, color: "var(--ink)", display: "flex", alignItems: "center", gap: 7 }}>
                    {data.company.name}
                    {data.company.verified && <CheckCircle2 size={15} strokeWidth={2.5} color="var(--forest2)" title="Verified" />}
                  </h3>
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", display: "flex" }}>
                <X size={18} strokeWidth={2.25} />
              </button>
            </div>
            <CompanyDetailsView company={data.company} openJobs={data.open_jobs} />
          </>
        )}
      </div>
    </div>
  );
}

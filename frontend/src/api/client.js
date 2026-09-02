const API = import.meta.env.VITE_API_BASE_URL || "https://resumexpert-dt38.onrender.com";

// ── Token management ────────────────────────────────────────────
export function getToken() { return localStorage.getItem("ats_token"); }
export function setToken(t) { localStorage.setItem("ats_token", t); }
export function clearToken() { localStorage.removeItem("ats_token"); }
export function getUser() {
  try { return JSON.parse(localStorage.getItem("ats_user")); } catch { return null; }
}
export function setUser(u) { localStorage.setItem("ats_user", JSON.stringify(u)); }
export function clearUser() { localStorage.removeItem("ats_user"); }
export function logout() { clearToken(); clearUser(); }

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── JSON requests ───────────────────────────────────────────────
async function jsonReq(method, endpoint, body) {
  const r = await fetch(`${API}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d; try { d = await r.json(); } catch { d = { detail: "Invalid response" }; }
  if (!r.ok) throw new Error(d?.detail || `Request failed (${r.status})`);
  return d;
}

// ── Form requests (file upload) ─────────────────────────────────
async function formReq(endpoint, fd) {
  const r = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  let d; try { d = await r.json(); } catch { d = { detail: "Invalid response" }; }
  if (!r.ok) throw new Error(d?.detail || `Request failed (${r.status})`);
  return d;
}

// ── Auth ────────────────────────────────────────────────────────
export const register = (email, password, full_name, role) =>
  jsonReq("POST", "/auth/register", { email, password, full_name, role });

export const login = (email, password) =>
  jsonReq("POST", "/auth/login", { email, password });

export const getMe = () => jsonReq("GET", "/auth/me");

// ── Health ──────────────────────────────────────────────────────
export const healthCheck = () =>
  fetch(`${API}/health`).then(r => r.json()).catch(() => ({ status: "offline" }));

// ── CV Quality Check (used by CheckCV.jsx) ──────────────────────
export function checkCVQuality(resumeFile) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("prefer_gemini", "true");
  return formReq("/candidate/resume-quality/file", fd);
}

// ── Candidate endpoints ─────────────────────────────────────────
export function scoreFile(resumeFile, jobText) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("job_text", jobText);
  fd.append("prefer_gemini", "true");
  return formReq("/score-file", fd);
}

export function candidateParseUpload(resumeFile, preferGemini = true, profileId = null, saveVersion = false) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("prefer_gemini", String(preferGemini));
  if (profileId) fd.append("profile_id", profileId);
  if (saveVersion) fd.append("save_version", "true");
  return formReq("/candidate/profile/parse-upload", fd);
}

export function candidateResumeQualityFile(resumeFile) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("prefer_gemini", "true");
  return formReq("/candidate/resume-quality/file", fd);
}

export function candidateVersionHistory(profileId) {
  return jsonReq("GET", `/candidate/resume-version/history/${profileId}`);
}

export function candidateVersionCompare(oldResume, newResume) {
  return jsonReq("POST", "/candidate/resume-version/compare", {
    old_resume: oldResume,
    new_resume: newResume,
  });
}

// ── Legacy 3-perspective endpoints ──────────────────────────────
export function postScore(resumeFile, jobText) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("job_text", jobText);
  fd.append("resume_model_name", "gemini-2.5-flash");
  fd.append("job_model_name", "gemini-2.5-flash");
  fd.append("prefer_pdf_vision", "true");
  fd.append("prefer_gemini_job_parser", "true");
  return formReq("/score", fd);
}

export function postReviewInternal(resumeFile, jobText) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("job_text", jobText);
  fd.append("resume_model_name", "gemini-2.5-flash");
  fd.append("job_model_name", "gemini-2.5-flash");
  fd.append("prefer_pdf_vision", "true");
  fd.append("prefer_gemini_job_parser", "true");
  return formReq("/review/internal", fd);
}

export function postReviewCandidate(resumeFile, jobText) {
  const fd = new FormData();
  fd.append("resume_file", resumeFile);
  fd.append("job_text", jobText);
  fd.append("resume_model_name", "gemini-2.5-flash");
  fd.append("job_model_name", "gemini-2.5-flash");
  fd.append("prefer_pdf_vision", "true");
  fd.append("prefer_gemini_job_parser", "true");
  return formReq("/review/candidate", fd);
}

// ── Job Board (candidate-facing) ────────────────────────────────
export function browseJobs(search = "", location = "") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (location) params.set("location", location);
  const qs = params.toString();
  return jsonReq("GET", `/jobs${qs ? `?${qs}` : ""}`);
}

export function getJob(jobId) {
  return jsonReq("GET", `/jobs/${jobId}`);
}

export function verifyCompany() {
  return jsonReq("POST", "/recruiter/verify-company");
}

export function uploadResumeToAccount(file, label = null) {
  const fd = new FormData();
  fd.append("resume_file", file);
  fd.append("prefer_gemini", "true");
  if (label) fd.append("label", label);
  return formReq("/candidate/resume/upload", fd);
}

export function uploadResumeToAccountAsync(file, label = null) {
  const fd = new FormData();
  fd.append("resume_file", file);
  fd.append("prefer_gemini", "true");
  if (label) fd.append("label", label);
  return formReq("/candidate/resume/upload-async", fd);
}

export function getProcessingJob(jobId) {
  return jsonReq("GET", `/processing-jobs/${jobId}`);
}

export function getMyProfile() {
  return jsonReq("GET", "/profile/me");
}

export function updateMyProfile(payload) {
  return jsonReq("PATCH", "/profile/me", payload);
}

export function getApplicantProfile(applicationId) {
  return jsonReq("GET", `/recruiter/candidate-profile/${applicationId}`);
}

export function candidateResumeVersions() {
  return jsonReq("GET", "/candidate/resume-versions");
}

export function previewJobMatch(jobId, resumeVersionId = null) {
  return jsonReq("POST", `/jobs/${jobId}/match-preview`, {
    resume_version_id: resumeVersionId,
    cover_note: null,
  });
}

export function applyToJob(jobId, { resumeVersionId = null, coverNote = null } = {}) {
  return jsonReq("POST", `/jobs/${jobId}/apply`, {
    resume_version_id: resumeVersionId,
    cover_note: coverNote,
  });
}

export function myApplications() {
  return jsonReq("GET", "/candidate/applications");
}

// ── Recruiter job postings ──────────────────────────────────────
export function createJobPosting(payload) {
  return jsonReq("POST", "/recruiter/jobs", payload);
}

export function myJobPostings() {
  return jsonReq("GET", "/recruiter/jobs/mine");
}

export function jobApplicants(jobId) {
  return jsonReq("GET", `/recruiter/jobs/${jobId}/applicants`);
}

export function withdrawApplication(applicationId) {
  return jsonReq("POST", `/candidate/applications/${applicationId}/withdraw`);
}

export function parseJobLive(jobText) {
  const fd = new FormData();
  fd.append("job_text", jobText);
  fd.append("prefer_gemini", "true");
  return formReq("/recruiter/job/parse", fd);
}

export function updateApplicationStatus(applicationId, status) {
  return jsonReq("PATCH", `/recruiter/applications/${applicationId}/status`, { status });
}
export function recruiterScreenFiles(resumeFiles, jobText) {
  const fd = new FormData();
  fd.append("job_text", jobText);
  fd.append("prefer_gemini", "true");
  resumeFiles.forEach(f => fd.append("resume_files", f));
  return formReq("/recruiter/job/screen-files", fd);
}

export function recruiterScreenZip(zipFile, jobText) {
  const fd = new FormData();
  fd.append("job_text", jobText);
  fd.append("zip_file", zipFile);
  fd.append("prefer_gemini", "true");
  return formReq("/recruiter/job/screen-zip", fd);
}

export function recruiterCandidateHistory(profileId) {
  return jsonReq("GET", `/recruiter/candidate/history/${profileId}`);
}
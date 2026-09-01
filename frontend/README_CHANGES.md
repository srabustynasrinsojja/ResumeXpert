# What changed

Drop these files into your `frontend/src/` tree at the matching paths
(they replace the existing files, except `GuestCheckCV.jsx` which is new).

## 1. Guest CV check (no sign-in required)

**Backend:** no changes needed. `/candidate/resume-quality/file` already uses
`get_optional_user`, so it works with or without a login token.

**Frontend:**
- `src/pages/GuestCheckCV.jsx` **(new file)** — a standalone page with its own
  light nav bar ("← Back to Home" / "Sign Up Free") that wraps your existing
  `CheckCV` component. No auth/MainApp context required.
- `src/pages/CheckCV.jsx` — added optional `guestMode` / `onSignUp` props.
  When `guestMode` is true, a "Create Free Account" banner appears under the
  results. Fully backward-compatible — the existing logged-in usage in
  `MainApp.jsx` (`<CheckCV/>`) is untouched.
- `src/pages/Homepage.jsx` — added a `onCheckCV` prop and three entry points:
  the nav bar, a subtext link under the hero CTA, and a link under the
  bottom CTA card.
- `src/App.jsx` — added a `"checkcv"` page state, reachable from the
  homepage without requiring login, rendering `<GuestCheckCV/>`.

## 2. Recruiter can close a job posting

**Backend:** no changes needed. `PATCH /recruiter/jobs/{job_id}/status` was
already implemented (ownership-checked), `/jobs/{job_id}/apply` already
rejects applications once `status != "open"`, and `/jobs` (candidate browse)
already only returns open postings.

⚠️ **Please verify one thing:** I don't have your `utils/job_posting_schema.py`
file (it lives outside the `backend/` folder in your rar, so it wasn't in the
upload). I've assumed the `JobStatus` enum uses the literal values `"open"`
and `"closed"`, since `"open"` is what's used everywhere else in the code I
could see. If your enum actually uses something else (e.g. `"paused"`,
`"filled"`), just update the two `nextStatus = job.status === "open" ?
"closed" : "open"` lines in `RecruiterJobs.jsx` to match.

**Frontend:**
- `src/api/client.js` — added `updateJobStatus(jobId, status)`, calling the
  existing PATCH endpoint.
- `src/pages/RecruiterJobs.jsx`:
  - **My Postings list** — each job card now has a "Close" / "Reopen"
    button next to the status badge (a confirm dialog runs first). The card
    itself was changed from a `<button>` wrapping another button — now a
    `<div role="button">` — to keep the HTML valid.
  - **Applicants panel** — same Close/Reopen control now sits next to the
    job title, so a recruiter can close the posting right after marking
    someone "Hired" without navigating back.
- `src/pages/JobBoard.jsx` — the candidate-facing "Apply now" button now
  disables and reads "Applications Closed" if a candidate has a job detail
  page open when it gets closed underneath them (the `/jobs` list already
  filters closed jobs out server-side, so this only covers stale/deep-linked
  views).

## Verified

Ran `vite build` against your actual `frontend/` bundle (including
`node_modules`) — builds clean with these changes, no errors.

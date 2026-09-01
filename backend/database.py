"""MongoDB Atlas database connection and CRUD operations."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError


# ─── Connection ──────────────────────────────────────────────────────

MONGO_URI = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://ATS_ASSM:capstone_ATS_ASSM@database.13zoepm.mongodb.net/",
)
DB_NAME = os.getenv("MONGODB_DB_NAME", "ats_platform")

_client: Optional[MongoClient] = None


def _get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client


def get_db():
    """Return the ats_platform database instance."""
    return _get_client()[DB_NAME]


def init_db() -> None:
    """Create indexes on collections. Safe to call multiple times."""
    db = get_db()

    # Users
    db.users.create_index("email", unique=True)

    # Resume versions
    db.resume_versions.create_index([("user_id", ASCENDING), ("version_number", ASCENDING)])
    db.resume_versions.create_index("created_at")

    # Screening sessions
    db.screening_sessions.create_index("recruiter_id")
    db.screening_sessions.create_index("created_at")

    # Job descriptions
    db.job_descriptions.create_index("recruiter_id")

    # Job postings (live listings candidates browse/apply to)
    db.job_postings.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    db.job_postings.create_index("recruiter_id")

    # Applications (join between candidate, job, and resume version)
    db.applications.create_index([("job_id", ASCENDING), ("candidate_id", ASCENDING)], unique=True)
    db.applications.create_index("candidate_id")
    db.applications.create_index("recruiter_id")

    # User interactions (view/apply signals — logged for future use, not yet
    # consumed by ranking; current recommendation logic uses skill overlap only)
    db.user_interactions.create_index([("user_id", ASCENDING), ("job_id", ASCENDING)])

    # Background processing jobs (async upload / bulk-screen polling)
    db.processing_jobs.create_index("user_id")
    db.processing_jobs.create_index("created_at")

    # Parsed profiles (for CV Quick Build)
    db.parsed_profiles.create_index("user_id", unique=True)


def close_db() -> None:
    """Close the MongoDB connection."""
    global _client
    if _client is not None:
        _client.close()
        _client = None


# ─── Helpers ─────────────────────────────────────────────────────────

def _serialize(obj: Any) -> Any:
    """Convert Pydantic model or dict to plain dict for MongoDB storage."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, dict):
        return obj
    return {}


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Remove MongoDB _id field, convert to plain dict."""
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


# ─── User CRUD ───────────────────────────────────────────────────────

def create_user(
    email: str,
    password_hash: str,
    full_name: str = "",
    role: str = "candidate",
) -> Dict[str, Any]:
    """Creates an already-verified user directly — used only for internal/admin
    paths. Normal signup goes through create_pending_user + finalize_registration_db
    below, which enforces the OTP step before a password ever becomes usable."""
    now = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid4())
    doc = {
        "id": user_id,
        "email": email.strip().lower(),
        "password_hash": password_hash,
        "full_name": full_name,
        "role": role,
        "company_verified": False,
        "verification_status": "unverified",
        "email_verified": True,
        "otp_hash": None,
        "otp_expires": None,
        "otp_attempts": 0,
        "created_at": now,
        "updated_at": now,
    }
    try:
        get_db().users.insert_one(doc)
    except DuplicateKeyError:
        raise ValueError(f"User with email {email} already exists.")
    return {
        "id": user_id,
        "email": doc["email"],
        "full_name": full_name,
        "role": role,
        "company_verified": False,
        "verification_status": "unverified",
        "email_verified": True,
        "created_at": now,
    }


def create_pending_user(
    email: str,
    full_name: str,
    role: str,
    otp_hash: str,
    otp_expires: str,
) -> Dict[str, Any]:
    """First half of signup: no password yet, not usable to log in. Becomes a
    real account only via finalize_registration_db, once the OTP is confirmed."""
    now = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid4())
    doc = {
        "id": user_id,
        "email": email.strip().lower(),
        "password_hash": None,
        "full_name": full_name,
        "role": role,
        "company_verified": False,
        "verification_status": "unverified",
        "email_verified": False,
        "otp_hash": otp_hash,
        "otp_expires": otp_expires,
        "otp_attempts": 0,
        "avatar": None,
        "documents": [],
        "created_at": now,
        "updated_at": now,
    }
    try:
        get_db().users.insert_one(doc)
    except DuplicateKeyError:
        raise ValueError(f"User with email {email} already exists.")
    return _clean_doc(doc)


def update_pending_registration_db(
    user_id: str,
    full_name: str,
    role: str,
    otp_hash: str,
    otp_expires: str,
) -> None:
    """Re-issues a code for an email stuck mid-signup (new attempt or resend)."""
    get_db().users.update_one(
        {"id": user_id},
        {"$set": {
            "full_name": full_name,
            "role": role,
            "otp_hash": otp_hash,
            "otp_expires": otp_expires,
            "otp_attempts": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )


def increment_otp_attempts_db(user_id: str) -> None:
    get_db().users.update_one({"id": user_id}, {"$inc": {"otp_attempts": 1}})


def finalize_registration_db(user_id: str, password_hash: str) -> None:
    """Second half of signup: OTP confirmed, password set, account now real."""
    get_db().users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": password_hash,
            "email_verified": True,
            "otp_hash": None,
            "otp_expires": None,
            "otp_attempts": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )


def compute_profile_status(user: Dict[str, Any]) -> Dict[str, Any]:
    """Derived, not stored — profile completeness is always computed fresh from the
    actual data (name/phone/resume presence), never a separately-tracked boolean that
    could drift out of sync with reality."""
    if user.get("role") == "recruiter":
        return {
            "company_verified": bool(user.get("company_verified", False)),
            "onboarding_next_step": None if user.get("company_verified") else "company_setup",
        }
    has_basic_info = bool(user.get("full_name")) and bool(user.get("phone"))
    has_resume = get_latest_resume_version_db(user["id"]) is not None
    profile_complete = has_basic_info and has_resume
    next_step = None
    if not has_basic_info:
        next_step = "basic_info"
    elif not has_resume:
        next_step = "resume"
    return {"profile_complete": profile_complete, "onboarding_next_step": next_step}


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    doc = get_db().users.find_one({"email": email.strip().lower()})
    return _clean_doc(doc)


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    doc = get_db().users.find_one({"id": user_id})
    return _clean_doc(doc)


# ─── Resume Version CRUD ────────────────────────────────────────────

def save_resume_version_db(
    user_id: str,
    parsed_resume: Any,
    source_type: str = "uploaded",
    label: Optional[str] = None,
    parent_version_id: Optional[str] = None,
    resume_quality_score: Optional[float] = None,
    score_summary: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    version_id = str(uuid4())

    db = get_db()
    latest = db.resume_versions.find_one(
        {"user_id": user_id},
        sort=[("version_number", DESCENDING)],
    )
    next_num = (latest["version_number"] + 1) if latest else 1

    doc = {
        "id": version_id,
        "user_id": user_id,
        "version_number": next_num,
        "source_type": source_type,
        "label": label,
        "parent_version_id": parent_version_id,
        "parsed_resume": _serialize(parsed_resume),
        "resume_quality_score": resume_quality_score,
        "score_summary": score_summary or {},
        "metadata": metadata or {},
        "created_at": now,
    }
    db.resume_versions.insert_one(doc)

    return {
        "version_id": version_id,
        "user_id": user_id,
        "version_number": next_num,
        "source_type": source_type,
        "label": label,
        "resume_quality_score": resume_quality_score,
        "created_at": now,
    }


def load_resume_versions_db(user_id: str) -> List[Dict[str, Any]]:
    db = get_db()
    docs = db.resume_versions.find(
        {"user_id": user_id},
    ).sort("version_number", ASCENDING)

    return [_clean_doc(doc) for doc in docs]


def get_latest_resume_version_db(user_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    doc = db.resume_versions.find_one(
        {"user_id": user_id},
        sort=[("version_number", DESCENDING)],
    )
    return _clean_doc(doc)


def get_resume_version_by_id_db(user_id: str, version_id: str) -> Optional[Dict[str, Any]]:
    """Fetch one specific resume version, scoped to its owner — prevents a candidate
    from applying with someone else's resume version by guessing an id."""
    doc = get_db().resume_versions.find_one({"user_id": user_id, "id": version_id})
    return _clean_doc(doc)


# ─── Screening Session CRUD ─────────────────────────────────────────

def save_screening_session_db(
    recruiter_id: str,
    job_text: str,
    parsed_job: Any,
    summary: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    skipped_files: List[Dict[str, str]],
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    session_id = str(uuid4())

    doc = {
        "id": session_id,
        "recruiter_id": recruiter_id,
        "job_text": job_text,
        "parsed_job": _serialize(parsed_job),
        "summary": summary,
        "candidates": candidates,
        "skipped_files": skipped_files,
        "created_at": now,
    }
    get_db().screening_sessions.insert_one(doc)

    return {"session_id": session_id, "recruiter_id": recruiter_id, "created_at": now}


def load_screening_sessions_db(recruiter_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    db = get_db()
    docs = db.screening_sessions.find(
        {"recruiter_id": recruiter_id},
    ).sort("created_at", DESCENDING).limit(limit)

    return [_clean_doc(doc) for doc in docs]


def get_screening_session_by_id(session_id: str) -> Optional[Dict[str, Any]]:
    doc = get_db().screening_sessions.find_one({"id": session_id})
    return _clean_doc(doc)


# ─── Parsed Profile CRUD (for CV Quick Build) ───────────────────

def save_parsed_profile(user_id: str, parsed_resume: Any, source: str = "uploaded") -> Dict[str, Any]:
    """Save or update the latest parsed resume profile for a user.
    Each user has ONE active parsed profile (upsert by user_id)."""
    now = datetime.now(timezone.utc).isoformat()
    db = get_db()
    doc = {
        "user_id": user_id,
        "parsed_resume": _serialize(parsed_resume),
        "source": source,
        "updated_at": now,
    }
    db.parsed_profiles.update_one(
        {"user_id": user_id},
        {"$set": doc},
        upsert=True,
    )
    return {"user_id": user_id, "source": source, "updated_at": now}


def verify_company_db(user_id: str) -> Optional[Dict[str, Any]]:
    """Self-attestation verification (capstone-scope, see blueprint 1's honesty note —
    real verification would check business documents / email domain)."""
    get_db().users.update_one(
        {"id": user_id},
        {"$set": {
            "company_verified": True,
            "verification_status": "verified",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return get_user_by_id(user_id)


def update_user_profile_db(user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Only touches whitelisted profile fields — never email/password/role from here."""
    allowed = {
        "phone", "location", "bio", "company_name", "headline", "full_name",
        "company_website", "company_facebook", "company_linkedin", "company_twitter",
    }
    update = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not update:
        return get_user_by_id(user_id)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_db().users.update_one({"id": user_id}, {"$set": update})
    return get_user_by_id(user_id)


def get_resume_version_by_id_only_db(version_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a resume version by id with NO owner check — only safe to call after the
    caller has already verified access another way (e.g. recruiter owns the application
    that references this exact version_id)."""
    doc = get_db().resume_versions.find_one({"id": version_id})
    return _clean_doc(doc)


def get_candidate_stats_db(candidate_id: str) -> Dict[str, Any]:
    apps = list_candidate_applications_db(candidate_id)
    stats = {
        "total_applications": len(apps), "ai_ranked": 0, "reviewed": 0,
        "interview_scheduled": 0, "rejected": 0, "hired": 0, "withdrawn": 0,
    }
    for a in apps:
        status = a.get("status", "ai_ranked")
        if status in stats:
            stats[status] += 1
    return stats


def get_recruiter_stats_db(recruiter_id: str) -> Dict[str, Any]:
    jobs = list_recruiter_job_postings_db(recruiter_id)
    apps = list(get_db().applications.find({"recruiter_id": recruiter_id}))
    return {
        "total_postings": len(jobs),
        "open_postings": sum(1 for j in jobs if j.get("status") == "open"),
        "total_applicants": len(apps),
        "interview_scheduled_count": sum(1 for a in apps if a.get("status") == "interview_scheduled"),
        "hired_count": sum(1 for a in apps if a.get("status") == "hired"),
    }


def get_parsed_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Get the latest parsed resume profile for a user (for Quick Build)."""
    doc = get_db().parsed_profiles.find_one({"user_id": user_id})
    return _clean_doc(doc)


# ─── Job Posting CRUD ────────────────────────────────────────────────

def create_job_posting_db(
    recruiter_id: str,
    title: str,
    company_name: str,
    location: str,
    employment_type: str,
    salary_min: Optional[int],
    salary_max: Optional[int],
    description: str,
    parsed_job: Any,
    status: str = "open",
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    job_id = str(uuid4())
    doc = {
        "id": job_id,
        "recruiter_id": recruiter_id,
        "title": title,
        "company_name": company_name,
        "location": location,
        "employment_type": employment_type,
        "salary_min": salary_min,
        "salary_max": salary_max,
        "description": description,
        "parsed_job": _serialize(parsed_job),
        "status": status,
        "application_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    get_db().job_postings.insert_one(doc)
    return _clean_doc(doc)


def list_open_job_postings_db(
    search: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"status": "open"}
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    docs = get_db().job_postings.find(query).sort("created_at", DESCENDING).limit(limit)
    return [_clean_doc(d) for d in docs]


def get_job_posting_db(job_id: str) -> Optional[Dict[str, Any]]:
    doc = get_db().job_postings.find_one({"id": job_id})
    return _clean_doc(doc)


# ─── Recommendation signals (pure set logic — no ML/embedding files touched) ────

def log_interaction_db(user_id: str, job_id: str, interaction_type: str) -> None:
    """Fire-and-forget interest signal. 'viewed' logs at most once per user/job pair
    (updated, not duplicated) so repeatedly opening the same job doesn't inflate its
    weight; 'applied' always inserts fresh since it's a meaningful, repeatable-in-intent
    action tied 1:1 to a real application anyway."""
    now = datetime.now(timezone.utc).isoformat()
    if interaction_type == "viewed":
        get_db().user_interactions.update_one(
            {"user_id": user_id, "job_id": job_id, "interaction_type": "viewed"},
            {"$set": {"created_at": now}},
            upsert=True,
        )
    else:
        get_db().user_interactions.insert_one({
            "id": str(uuid4()), "user_id": user_id, "job_id": job_id,
            "interaction_type": interaction_type, "created_at": now,
        })


def _skill_set(skills_field: Any) -> set:
    """Normalize a job's or resume's skills into a flat, lowercased set for overlap
    comparison. Handles both the job schema's flat required_skills list and the
    resume schema's nested {technical, tools, soft} shape."""
    if skills_field is None:
        return set()
    if isinstance(skills_field, dict):
        flat = []
        for v in skills_field.values():
            if isinstance(v, list):
                flat.extend(v)
        skills_field = flat
    if not isinstance(skills_field, list):
        return set()
    return {str(s).strip().lower() for s in skills_field if s}


def list_open_job_postings_personalized_db(
    candidate_resume_skills: Any,
    search: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Re-ranks open jobs by skill overlap against the candidate's resume, blended
    with recency so the list doesn't feel stale. Pure Python set math — deliberately
    NOT calling into ats_score_engine/model_loader, so this stays out of the ML
    pipeline entirely per project scope."""
    jobs = list_open_job_postings_db(search=search, location=location, limit=limit)
    resume_skills = _skill_set(candidate_resume_skills)
    if not resume_skills:
        return jobs  # cold start with literally no resume skills yet — fall back to recency

    now = datetime.now(timezone.utc)
    scored = []
    for job in jobs:
        job_skills = _skill_set(job.get("parsed_job", {}).get("required_skills")) \
            or _skill_set(job.get("parsed_job", {}).get("all_skills"))
        overlap = len(resume_skills & job_skills) / len(job_skills) if job_skills else 0.0
        try:
            age_days = (now - datetime.fromisoformat(job["created_at"])).days
        except Exception:
            age_days = 0
        recency_score = max(0.0, 1.0 - age_days / 30.0)  # decays to 0 over ~30 days
        job["_match_score"] = round(overlap, 3)
        scored.append((0.7 * overlap + 0.3 * recency_score, job))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [job for _, job in scored]


def list_recruiter_job_postings_db(recruiter_id: str) -> List[Dict[str, Any]]:
    docs = get_db().job_postings.find({"recruiter_id": recruiter_id}).sort("created_at", DESCENDING)
    return [_clean_doc(d) for d in docs]


def update_job_posting_status_db(job_id: str, recruiter_id: str, status: str) -> Optional[Dict[str, Any]]:
    """Only updates if the posting belongs to the requesting recruiter."""
    result = get_db().job_postings.update_one(
        {"id": job_id, "recruiter_id": recruiter_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        return None
    return get_job_posting_db(job_id)


def increment_job_application_count_db(job_id: str) -> None:
    get_db().job_postings.update_one({"id": job_id}, {"$inc": {"application_count": 1}})


# ─── Application CRUD ────────────────────────────────────────────────

def create_application_db(
    job_id: str,
    job_title: str,
    company_name: str,
    recruiter_id: str,
    candidate_id: str,
    candidate_name: str,
    candidate_email: str,
    resume_version_id: str,
    cover_note: Optional[str],
    job_match_score: float,
    combined_score: float,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    application_id = str(uuid4())
    doc = {
        "id": application_id,
        "job_id": job_id,
        "job_title": job_title,
        "company_name": company_name,
        "recruiter_id": recruiter_id,
        "candidate_id": candidate_id,
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "resume_version_id": resume_version_id,
        "cover_note": cover_note,
        # Starts at "ai_ranked", not "applied" — by the time this document exists,
        # the match score has already been computed synchronously (see apply_to_job),
        # so the AI-ranking step is already done, not a separate pending stage.
        "status": "ai_ranked",
        "job_match_score": job_match_score,
        "combined_score": combined_score,
        "applied_at": now,
        "updated_at": now,
    }
    try:
        get_db().applications.insert_one(doc)
    except DuplicateKeyError:
        raise ValueError("You have already applied to this job.")
    increment_job_application_count_db(job_id)
    return _clean_doc(doc)


def list_candidate_applications_db(candidate_id: str) -> List[Dict[str, Any]]:
    docs = get_db().applications.find({"candidate_id": candidate_id}).sort("applied_at", DESCENDING)
    return [_clean_doc(d) for d in docs]


def list_job_applications_db(job_id: str) -> List[Dict[str, Any]]:
    """Applicants for one job, best match first — this is the recruiter's ranked shortlist."""
    docs = get_db().applications.find({"job_id": job_id}).sort("combined_score", DESCENDING)
    return [_clean_doc(d) for d in docs]


def get_application_db(application_id: str) -> Optional[Dict[str, Any]]:
    return _clean_doc(get_db().applications.find_one({"id": application_id}))


# Enforced state machine — the single source of truth for which status changes are
# legal. Both the recruiter-status endpoint and the candidate-withdraw endpoint check
# against this table, so a UI bug (or a hand-crafted API call) can never put an
# application into a nonsensical state like hired -> applied.
RECRUITER_TRANSITIONS: Dict[str, set] = {
    "ai_ranked": {"reviewed", "rejected"},
    "reviewed": {"interview_scheduled", "rejected"},
    "interview_scheduled": {"hired", "rejected"},
    # hired, rejected, withdrawn: terminal, no outgoing transitions
}
CANDIDATE_WITHDRAWABLE_FROM = {"ai_ranked", "reviewed", "interview_scheduled"}


def update_application_status_db(application_id: str, recruiter_id: str, status: str) -> Optional[Dict[str, Any]]:
    """Only updates if the requesting recruiter owns the underlying job posting AND
    the transition is legal from the application's current status."""
    application = get_application_db(application_id)
    if application is None or application["recruiter_id"] != recruiter_id:
        return None
    current = application["status"]
    if status not in RECRUITER_TRANSITIONS.get(current, set()):
        raise ValueError(f"Cannot move an application from '{current}' to '{status}'.")
    get_db().applications.update_one(
        {"id": application_id, "recruiter_id": recruiter_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return get_application_db(application_id)


def withdraw_application_db(application_id: str, candidate_id: str) -> Optional[Dict[str, Any]]:
    """Candidate-initiated withdrawal — only the owning candidate, only from a
    non-terminal status."""
    application = get_application_db(application_id)
    if application is None or application["candidate_id"] != candidate_id:
        return None
    if application["status"] not in CANDIDATE_WITHDRAWABLE_FROM:
        raise ValueError(f"Cannot withdraw an application that is already '{application['status']}'.")
    get_db().applications.update_one(
        {"id": application_id, "candidate_id": candidate_id},
        {"$set": {"status": "withdrawn", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return get_application_db(application_id)


# ─── Interview scheduling ──────────────────────────────────────────
#
# Deliberately its own action rather than reusing update_application_status_db:
# scheduling always needs a date/time and always generates a video room
# together with the status flip, so it's one atomic write instead of two
# separate calls that could get out of sync.

def schedule_interview_db(application_id: str, recruiter_id: str, interview_datetime: str) -> Optional[Dict[str, Any]]:
    application = get_application_db(application_id)
    if application is None or application["recruiter_id"] != recruiter_id:
        return None
    current = application["status"]
    if "interview_scheduled" not in RECRUITER_TRANSITIONS.get(current, set()):
        raise ValueError(f"Cannot schedule an interview from status '{current}'.")
    # Public Jitsi room (meet.jit.si) — no account or API key needed. The slug
    # only needs to be unique and hard to guess; it doesn't need to be secret,
    # since only the two participants are ever given the link.
    room = f"ResumeXpert-Interview-{application_id.replace('-', '')[:20]}"
    get_db().applications.update_one(
        {"id": application_id, "recruiter_id": recruiter_id},
        {"$set": {
            "status": "interview_scheduled",
            "interview_datetime": interview_datetime,
            "interview_room": room,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return get_application_db(application_id)


# ─── Profile picture + documents ────────────────────────────────────
#
# Stored inline on the user document as base64 — fine at small file sizes
# (enforced server-side in api.py) and for a MongoDB Atlas free/small tier.
# If usage grows, swap these for real object storage (S3/Cloudinary) later —
# every caller here already goes through this one module, so that'd be a
# localized change.

def set_avatar_db(user_id: str, data_url: str) -> None:
    get_db().users.update_one(
        {"id": user_id},
        {"$set": {"avatar": data_url, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


def remove_avatar_db(user_id: str) -> None:
    get_db().users.update_one(
        {"id": user_id},
        {"$set": {"avatar": None, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


def add_document_db(user_id: str, doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    get_db().users.update_one(
        {"id": user_id},
        {"$push": {"documents": doc}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    user = get_user_by_id(user_id)
    return (user or {}).get("documents", [])


def remove_document_db(user_id: str, document_id: str) -> List[Dict[str, Any]]:
    get_db().users.update_one(
        {"id": user_id},
        {"$pull": {"documents": {"id": document_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    user = get_user_by_id(user_id)
    return (user or {}).get("documents", [])


# ─── Company photos (recruiters) ────────────────────────────────────
#
# Same inline-base64 pattern as documents, but stored under their own
# field and — unlike documents — returned WITH the data intact, since
# they're meant to be displayed (<img src="data:...">) on a page a
# candidate can view, not downloaded through an auth-gated route.

def add_company_photo_db(user_id: str, photo: Dict[str, Any]) -> List[Dict[str, Any]]:
    get_db().users.update_one(
        {"id": user_id},
        {"$push": {"company_photos": photo}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    user = get_user_by_id(user_id)
    return (user or {}).get("company_photos", [])


def remove_company_photo_db(user_id: str, photo_id: str) -> List[Dict[str, Any]]:
    get_db().users.update_one(
        {"id": user_id},
        {"$pull": {"company_photos": {"id": photo_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    user = get_user_by_id(user_id)
    return (user or {}).get("company_photos", [])


# ─── Background processing jobs (async upload/bulk-screen polling) ─────────

def create_processing_job_db(user_id: str, job_type: str) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    job_id = str(uuid4())
    doc = {
        "id": job_id,
        "user_id": user_id,
        "job_type": job_type,           # "resume_parse" | "bulk_screen"
        "status": "queued",             # "queued" | "processing" | "done" | "error"
        "progress_pct": 0,
        "result": None,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
    }
    get_db().processing_jobs.insert_one(doc)
    return _clean_doc(doc)


def update_processing_job_db(
    job_id: str,
    status: Optional[str] = None,
    progress_pct: Optional[int] = None,
    result: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
) -> None:
    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if status is not None:
        update["status"] = status
    if progress_pct is not None:
        update["progress_pct"] = progress_pct
    if result is not None:
        update["result"] = _serialize(result)
    if error_message is not None:
        update["error_message"] = error_message
    get_db().processing_jobs.update_one({"id": job_id}, {"$set": update})


def get_processing_job_db(job_id: str) -> Optional[Dict[str, Any]]:
    return _clean_doc(get_db().processing_jobs.find_one({"id": job_id}))

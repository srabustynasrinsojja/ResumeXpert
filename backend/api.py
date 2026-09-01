from __future__ import annotations

import base64
import json
import os
import tempfile
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .ats_score_engine import score_resume_against_job, score_resume_quality_only
from .auth import (
    complete_registration,
    get_current_user,
    get_optional_user,
    login_user,
    require_role,
    resend_registration_otp,
    start_registration,
)
from .cv_generator import generate_resume_pdf, verify_ats_extractability
from .resume_tailor_engine import generate_tailored_edits, apply_edits_to_profile
from .database import (
    init_db, save_resume_version_db, load_resume_versions_db,
    save_screening_session_db, save_parsed_profile, get_parsed_profile,
    create_job_posting_db, list_open_job_postings_db, get_job_posting_db,
    list_recruiter_job_postings_db, update_job_posting_status_db,
    get_latest_resume_version_db, get_resume_version_by_id_db,
    create_application_db, list_candidate_applications_db,
    list_job_applications_db, get_application_db, update_application_status_db,
    update_user_profile_db, get_resume_version_by_id_only_db,
    get_candidate_stats_db, get_recruiter_stats_db, get_user_by_id,
    compute_profile_status, verify_company_db,
    log_interaction_db, list_open_job_postings_personalized_db,
    withdraw_application_db,
    create_processing_job_db, update_processing_job_db, get_processing_job_db,
    schedule_interview_db, set_avatar_db, remove_avatar_db,
    add_document_db, remove_document_db,
    add_company_photo_db, remove_company_photo_db,
)
from .helpers import model_dump_compat as _model_dump_compat
from .parser_bridge import (
    build_resume_from_form,
    derive_parser_mode,
    gemini_key_present,
    parse_job_source,
    parse_resume_source,
    resume_bundle_to_profile,
)
from .resume_feedback_engine import (
    generate_candidate_feedback,
    generate_internal_feedback,
    generate_resume_quality_feedback,
)
from .resume_version_engine import (
    compare_resume_versions,
    get_resume_history_snapshot,
    load_resume_versions,
    save_resume_version,
)
from .shortlist_engine import parse_profile_hints, screen_resume_paths, screen_zip_archive
from utils.resume_schema import ParsedResume, ResumeFormInput
from utils.job_posting_schema import JobPostingCreate, JobStatus
from utils.application_schema import ApplyRequest, ApplicationStatusUpdateRequest

app = FastAPI(title="ATS Matching API", version="3.0.0")

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_env_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [o.strip() for o in _env_origins.split(",") if o.strip()] if _env_origins else _DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# -------------------------------------------------------------------
# Auth endpoints
# -------------------------------------------------------------------

class RegisterStartRequest(BaseModel):
    email: str = Field(..., min_length=3)
    full_name: str = ""
    role: str = Field(default="candidate", pattern="^(candidate|recruiter)$")


class RegisterVerifyRequest(BaseModel):
    email: str = Field(..., min_length=3)
    otp: str = Field(..., min_length=6, max_length=6)
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class ResendOtpRequest(BaseModel):
    email: str = Field(..., min_length=3)


@app.post("/auth/register/start")
def auth_register_start(payload: RegisterStartRequest) -> Dict[str, Any]:
    """Step 1 of signup: sends a 6-digit code to the given email. No password
    yet, and the account isn't usable until /auth/register/verify succeeds."""
    return start_registration(email=payload.email, full_name=payload.full_name, role=payload.role)


@app.post("/auth/register/verify")
def auth_register_verify(payload: RegisterVerifyRequest) -> Dict[str, Any]:
    """Step 2 of signup: confirms the code and sets the password, finishing
    account creation. Logs the user straight in on success."""
    result = complete_registration(email=payload.email, otp=payload.otp, password=payload.password)
    result["user"].update(compute_profile_status(result["user"]))
    return result


@app.post("/auth/register/resend")
def auth_register_resend(payload: ResendOtpRequest) -> Dict[str, Any]:
    resend_registration_otp(payload.email)
    # Always the same response, whether or not the email is mid-signup —
    # avoids leaking which addresses are registered.
    return {"message": "If that email is waiting on a code, a new one has been sent."}


@app.post("/auth/login")
def auth_login(payload: LoginRequest) -> Dict[str, Any]:
    result = login_user(email=payload.email, password=payload.password)
    result["user"].update(compute_profile_status(result["user"]))
    return result


@app.get("/auth/me")
def auth_me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    safe = {k: v for k, v in user.items() if k != "password_hash"}
    safe.update(compute_profile_status(user))
    return safe


# -------------------------------------------------------------------
# Profile — LinkedIn/bdjobs-style "my profile" dashboard for any role
# -------------------------------------------------------------------

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    headline: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=1000)
    company_name: Optional[str] = None  # recruiters only, ignored for candidates
    # Recruiters only — extra company profile detail, shown to candidates.
    # (Company description reuses the existing `bio` field above.)
    company_website: Optional[str] = None
    company_facebook: Optional[str] = None
    company_linkedin: Optional[str] = None
    company_twitter: Optional[str] = None


@app.get("/profile/me")
def get_my_profile(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    base = {k: v for k, v in user.items() if k != "password_hash"}
    base.update(compute_profile_status(user))

    if user["role"] == "recruiter":
        return {
            "profile": base,
            "stats": get_recruiter_stats_db(user["id"]),
        }

    # candidate: pull latest resume version for the profile snapshot, if any
    version = get_latest_resume_version_db(user["id"])
    return {
        "profile": base,
        "resume_summary": version["parsed_resume"] if version else None,
        "resume_quality_score": version.get("resume_quality_score") if version else None,
        "stats": get_candidate_stats_db(user["id"]),
    }


@app.patch("/profile/me")
def update_my_profile(
    payload: ProfileUpdateRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    updated = update_user_profile_db(user["id"], payload.model_dump(exclude_none=True))
    safe = {k: v for k, v in updated.items() if k != "password_hash"}
    safe.update(compute_profile_status(updated))
    return {"message": "Profile updated.", "profile": safe}


# -------------------------------------------------------------------
# Profile picture + documents (candidates and recruiters both get an
# avatar; only candidates get the "important documents" shelf, since
# that's what a recruiter reviews alongside the résumé).
# -------------------------------------------------------------------

MAX_AVATAR_BYTES = 1_500_000     # ~1.5MB raw
MAX_DOCUMENT_BYTES = 3_000_000   # ~3MB raw
MAX_DOCUMENTS = 5


def _strip_document_bytes(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Metadata only — never send the base64 payload in a list response."""
    return [{k: v for k, v in d.items() if k != "data"} for d in documents]


@app.post("/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    content = await file.read()
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Image too large — please use one under 1.5MB.")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")
    data_url = f"data:{file.content_type};base64,{base64.b64encode(content).decode()}"
    set_avatar_db(user["id"], data_url)
    return {"message": "Profile picture updated.", "avatar": data_url}


@app.delete("/profile/avatar")
def delete_avatar(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    remove_avatar_db(user["id"])
    return {"message": "Profile picture removed."}


@app.get("/candidate/profile/documents")
def list_documents(user: Dict[str, Any] = Depends(require_role("candidate"))) -> Dict[str, Any]:
    current = get_user_by_id(user["id"]) or {}
    return {"documents": _strip_document_bytes(current.get("documents", []))}


@app.post("/candidate/profile/documents")
async def upload_document(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    current = get_user_by_id(user["id"]) or {}
    if len(current.get("documents", [])) >= MAX_DOCUMENTS:
        raise HTTPException(status_code=400, detail=f"You can keep up to {MAX_DOCUMENTS} documents — remove one first.")
    content = await file.read()
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="File too large — please use one under 3MB.")
    doc = {
        "id": str(uuid4()),
        "filename": file.filename or "document",
        "content_type": file.content_type or "application/octet-stream",
        "data": base64.b64encode(content).decode(),
        "size": len(content),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    documents = add_document_db(user["id"], doc)
    return {"message": "Document uploaded.", "documents": _strip_document_bytes(documents)}


@app.delete("/candidate/profile/documents/{document_id}")
def delete_document(
    document_id: str,
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    documents = remove_document_db(user["id"], document_id)
    return {"message": "Document removed.", "documents": _strip_document_bytes(documents)}


@app.get("/candidate/profile/documents/{document_id}/download")
def download_own_document(
    document_id: str,
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Response:
    current = get_user_by_id(user["id"]) or {}
    doc = next((d for d in current.get("documents", []) if d["id"] == document_id), None)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    raw = base64.b64decode(doc["data"])
    return Response(content=raw, media_type=doc["content_type"],
                     headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'})


@app.get("/recruiter/applications/{application_id}/candidate-profile")
def recruiter_view_candidate_profile(
    application_id: str,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    """The live candidate profile (avatar + document list), fetched when a
    recruiter opens an applicant's detail view — the application record
    itself only has a name/email snapshot from when they applied."""
    application = get_application_db(application_id)
    if application is None or application["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Application not found.")
    candidate = get_user_by_id(application["candidate_id"])
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return {
        "avatar": candidate.get("avatar"),
        "phone": candidate.get("phone"),
        "location": candidate.get("location"),
        "documents": _strip_document_bytes(candidate.get("documents", [])),
    }


@app.get("/recruiter/applications/{application_id}/documents/{document_id}/download")
def recruiter_download_document(
    application_id: str,
    document_id: str,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Response:
    application = get_application_db(application_id)
    if application is None or application["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Application not found.")
    candidate = get_user_by_id(application["candidate_id"])
    doc = next((d for d in (candidate or {}).get("documents", []) if d["id"] == document_id), None)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    raw = base64.b64decode(doc["data"])
    return Response(content=raw, media_type=doc["content_type"],
                     headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'})


# -------------------------------------------------------------------
# Company profile — photos, and the public view a candidate sees.
# Photos are returned WITH their base64 data (unlike documents), since
# they're meant to be shown inline (<img src="data:...">) rather than
# downloaded through an auth-gated route — including on the public
# company page a candidate opens from a job listing.
# -------------------------------------------------------------------

MAX_PHOTO_BYTES = 2_000_000  # ~2MB raw
MAX_COMPANY_PHOTOS = 6


@app.post("/recruiter/profile/photos")
async def upload_company_photo(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    current = get_user_by_id(user["id"]) or {}
    if len(current.get("company_photos", [])) >= MAX_COMPANY_PHOTOS:
        raise HTTPException(status_code=400, detail=f"You can keep up to {MAX_COMPANY_PHOTOS} photos — remove one first.")
    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Image too large — please use one under 2MB.")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")
    photo = {
        "id": str(uuid4()),
        "data_url": f"data:{file.content_type};base64,{base64.b64encode(content).decode()}",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    photos = add_company_photo_db(user["id"], photo)
    return {"message": "Photo uploaded.", "photos": photos}


@app.delete("/recruiter/profile/photos/{photo_id}")
def delete_company_photo(
    photo_id: str,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    photos = remove_company_photo_db(user["id"], photo_id)
    return {"message": "Photo removed.", "photos": photos}


@app.get("/companies/{recruiter_id}")
def get_company_profile(
    recruiter_id: str,
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """Public-safe company page — what a candidate sees when they click a
    company name on a job listing. No sensitive recruiter account info
    (email, phone) is included here; only what the recruiter chose to add
    to their company profile."""
    company = get_user_by_id(recruiter_id)
    if company is None or company.get("role") != "recruiter":
        raise HTTPException(status_code=404, detail="Company not found.")
    open_jobs = [
        {"id": j["id"], "title": j["title"], "location": j["location"], "employment_type": j["employment_type"]}
        for j in list_recruiter_job_postings_db(recruiter_id) if j["status"] == "open"
    ]
    return {
        "company": {
            "name": company.get("company_name") or company.get("full_name"),
            "avatar": company.get("avatar"),
            "description": company.get("bio"),
            "location": company.get("location"),
            "website": company.get("company_website"),
            "facebook": company.get("company_facebook"),
            "linkedin": company.get("company_linkedin"),
            "twitter": company.get("company_twitter"),
            "photos": [p["data_url"] for p in company.get("company_photos", [])],
            "verified": bool(company.get("company_verified")),
        },
        "open_jobs": open_jobs,
    }


@app.post("/recruiter/verify-company")
def verify_company(user: Dict[str, Any] = Depends(require_role("recruiter"))) -> Dict[str, Any]:
    """Self-attestation verification (see blueprint: real verification is a documented
    future-work item, not faked as fully built)."""
    if not user.get("company_name"):
        raise HTTPException(status_code=400, detail="Set your company name before verifying.")
    updated = verify_company_db(user["id"])
    safe = {k: v for k, v in updated.items() if k != "password_hash"}
    safe.update(compute_profile_status(updated))
    return {"message": "Company verified.", "profile": safe}


@app.get("/recruiter/candidate-profile/{application_id}")
def get_applicant_profile(
    application_id: str,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    """Full candidate profile + resume, but ONLY reachable through an application the
    requesting recruiter actually owns — a recruiter can never browse arbitrary
    candidates, only people who applied to one of their own postings."""
    application = get_application_db(application_id)
    if application is None or application["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Application not found or you don't own the related job.")

    candidate = get_user_by_id(application["candidate_id"])
    version = get_resume_version_by_id_only_db(application["resume_version_id"])

    return {
        "candidate": {
            "id": candidate["id"],
            "full_name": candidate.get("full_name"),
            "email": candidate.get("email"),
            "phone": candidate.get("phone"),
            "location": candidate.get("location"),
            "avatar": candidate.get("avatar"),
            "documents": _strip_document_bytes(candidate.get("documents", [])),
        } if candidate else None,
        "resume": version["parsed_resume"] if version else None,
        "resume_quality_score": version.get("resume_quality_score") if version else None,
        "application": application,
    }


class ScoreTextRequest(BaseModel):
    resume_text: str = Field(..., min_length=1)
    job_text: str = Field(..., min_length=1)
    prefer_gemini: bool = True


class ResumeFormRequest(BaseModel):
    profile_id: Optional[str] = None
    label: Optional[str] = None
    save_version: bool = False
    form_data: ResumeFormInput


class ResumeVersionSaveRequest(BaseModel):
    profile_id: str
    parsed_resume: ParsedResume
    source_type: str = "uploaded"
    label: Optional[str] = None
    parent_version_id: Optional[str] = None
    resume_quality_score: Optional[float] = None
    score_summary: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ResumeVersionCompareRequest(BaseModel):
    old_resume: ParsedResume
    new_resume: ParsedResume
    old_version_id: Optional[str] = None
    new_version_id: Optional[str] = None
    old_score_summary: Dict[str, Any] = Field(default_factory=dict)
    new_score_summary: Dict[str, Any] = Field(default_factory=dict)



def _build_parser_info(*, prefer_gemini: bool, resume_bundle: Dict[str, Any], job_bundle: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    warnings = list(resume_bundle["warnings"])
    job_parser_source = "not_requested"
    if job_bundle is not None:
        warnings.extend(job_bundle["warnings"])
        job_parser_source = job_bundle["source"]
    return {
        "prefer_gemini": prefer_gemini,
        "gemini_key_present": gemini_key_present(),
        "resume_parser_source": resume_bundle["source"],
        "job_parser_source": job_parser_source,
        "warnings": warnings,
    }


def _build_api_response(data: Dict[str, Any], include_parsed: bool = False) -> Dict[str, Any]:
    result = _model_dump_compat(data["result"])
    internal_feedback = _model_dump_compat(data["internal_feedback"])
    candidate_feedback = _model_dump_compat(data["candidate_feedback"])

    response: Dict[str, Any] = {
        "score_summary": result.get("score_summary")
        or {
            "resume_quality_score": result.get("resume_quality_score", 0.0),
            "job_match_score": result.get("job_match_score", 0.0),
            "combined_score": result.get("combined_score", result.get("ats_score", 0.0)),
            "ranking_score": result.get("ranking_score", 0.0),
        },
        "result": result,
        "parser_info": data["parser_info"],
        "recruiter_feedback": internal_feedback,
        "internal_feedback": internal_feedback,
        "candidate_feedback": candidate_feedback,
    }

    if include_parsed:
        response["parsed_resume"] = _model_dump_compat(data["resume_bundle"]["parsed"])
        response["parsed_job"] = _model_dump_compat(data["job_bundle"]["parsed"])

    return response


async def _save_upload_to_temp(resume_file: UploadFile) -> Path:
    suffix = Path(resume_file.filename or "resume.txt").suffix or ".txt"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(await resume_file.read())
    return tmp_path


async def _save_multiple_uploads_to_temp(resume_files: List[UploadFile]) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []
    for resume_file in resume_files:
        tmp_path = await _save_upload_to_temp(resume_file)
        items.append({
            "filename": resume_file.filename or tmp_path.name,
            "path": str(tmp_path),
        })
    return items


async def _build_analysis_from_upload(
    resume_file: UploadFile,
    job_text: str,
    prefer_gemini: bool = True,
) -> Dict[str, Any]:
    tmp_path = await _save_upload_to_temp(resume_file)
    try:
        resume_bundle = parse_resume_source(
            file_path=str(tmp_path),
            prefer_gemini=prefer_gemini,
        )
        job_bundle = parse_job_source(
            job_text,
            prefer_gemini=prefer_gemini,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse inputs: {exc}") from exc
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    parser_mode = derive_parser_mode(resume_bundle["source"], job_bundle["source"])

    result = score_resume_against_job(
        parsed_resume=resume_bundle["parsed"],
        parsed_job=job_bundle["parsed"],
        resume_raw_text=resume_bundle["text"],
        job_raw_text=job_bundle["text"],
        parser_mode=parser_mode,
        parser_sources={
            "resume": resume_bundle["source"],
            "job": job_bundle["source"],
        },
    )

    internal = generate_internal_feedback(
        resume_bundle["parsed"],
        job_bundle["parsed"],
        result,
    )
    candidate = generate_candidate_feedback(
        resume_bundle["parsed"],
        job_bundle["parsed"],
        result,
    )

    return {
        "resume_bundle": resume_bundle,
        "job_bundle": job_bundle,
        "result": result,
        "internal_feedback": internal,
        "candidate_feedback": candidate,
        "parser_info": _build_parser_info(
            prefer_gemini=prefer_gemini,
            resume_bundle=resume_bundle,
            job_bundle=job_bundle,
        ),
    }


def _build_analysis_from_text(
    resume_text: str,
    job_text: str,
    prefer_gemini: bool = True,
) -> Dict[str, Any]:
    resume_bundle = parse_resume_source(
        raw_text=resume_text,
        prefer_gemini=prefer_gemini,
    )
    job_bundle = parse_job_source(
        job_text,
        prefer_gemini=prefer_gemini,
    )
    parser_mode = derive_parser_mode(resume_bundle["source"], job_bundle["source"])

    result = score_resume_against_job(
        parsed_resume=resume_bundle["parsed"],
        parsed_job=job_bundle["parsed"],
        resume_raw_text=resume_bundle["text"],
        job_raw_text=job_bundle["text"],
        parser_mode=parser_mode,
        parser_sources={
            "resume": resume_bundle["source"],
            "job": job_bundle["source"],
        },
    )
    internal = generate_internal_feedback(
        resume_bundle["parsed"],
        job_bundle["parsed"],
        result,
    )
    candidate = generate_candidate_feedback(
        resume_bundle["parsed"],
        job_bundle["parsed"],
        result,
    )

    return {
        "resume_bundle": resume_bundle,
        "job_bundle": job_bundle,
        "result": result,
        "internal_feedback": internal,
        "candidate_feedback": candidate,
        "parser_info": _build_parser_info(
            prefer_gemini=prefer_gemini,
            resume_bundle=resume_bundle,
            job_bundle=job_bundle,
        ),
    }


async def _build_resume_quality_from_upload(
    resume_file: UploadFile,
    prefer_gemini: bool = True,
) -> Dict[str, Any]:
    tmp_path = await _save_upload_to_temp(resume_file)
    try:
        resume_bundle = parse_resume_source(
            file_path=str(tmp_path),
            prefer_gemini=prefer_gemini,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse resume: {exc}") from exc
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    profile = resume_bundle_to_profile(resume_bundle)
    result = score_resume_quality_only(
        parsed_resume=profile,
        resume_raw_text=resume_bundle["text"],
        parser_mode=derive_parser_mode(resume_bundle["source"], "not_requested"),
        parser_sources={"resume": resume_bundle["source"]},
    )
    feedback = generate_resume_quality_feedback(profile, result)
    return {
        "resume_bundle": resume_bundle,
        "profile": profile,
        "result": result,
        "candidate_feedback": feedback,
        "parser_info": _build_parser_info(prefer_gemini=prefer_gemini, resume_bundle=resume_bundle),
    }


def _build_resume_quality_from_form(form_data: ResumeFormInput) -> Dict[str, Any]:
    profile = build_resume_from_form(_model_dump_compat(form_data))
    result = score_resume_quality_only(
        parsed_resume=profile,
        resume_raw_text=None,
        parser_mode="form_builder",
        parser_sources={"resume": "form_builder"},
    )
    feedback = generate_resume_quality_feedback(profile, result)
    return {
        "profile": profile,
        "result": result,
        "candidate_feedback": feedback,
        "parser_info": {
            "prefer_gemini": False,
            "gemini_key_present": gemini_key_present(),
            "resume_parser_source": "form_builder",
            "job_parser_source": "not_requested",
            "warnings": [],
        },
    }


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "message": "ATS Matching API is running",
        "docs": "/docs",
        "health": "/health",
        "version": "2.3.0",
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "gemini_key_present": gemini_key_present(),
    }


@app.post("/score-text")
def score_text(payload: ScoreTextRequest) -> Dict[str, Any]:
    data = _build_analysis_from_text(
        resume_text=payload.resume_text,
        job_text=payload.job_text,
        prefer_gemini=payload.prefer_gemini,
    )
    return _build_api_response(data)


@app.post("/score-file")
async def score_file(
    job_text: str = Form(...),
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
) -> Dict[str, Any]:
    data = await _build_analysis_from_upload(
        resume_file=resume_file,
        job_text=job_text,
        prefer_gemini=prefer_gemini,
    )
    return _build_api_response(data)


# -------------------------------------------------------------------
# Candidate resume-quality + versioning endpoints (Phase 2)
# -------------------------------------------------------------------

@app.post("/candidate/profile/parse-upload")
async def candidate_parse_upload(
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    profile_id: Optional[str] = Form(None),
    save_version: bool = Form(False),
    label: Optional[str] = Form(None),
) -> Dict[str, Any]:
    data = await _build_resume_quality_from_upload(
        resume_file=resume_file,
        prefer_gemini=prefer_gemini,
    )
    response = {
        "message": "Resume parsed into a structured candidate profile.",
        "profile": _model_dump_compat(data["profile"]),
        "score_summary": _model_dump_compat(data["result"].score_summary),
        "resume_quality_result": _model_dump_compat(data["result"]),
        "candidate_feedback": _model_dump_compat(data["candidate_feedback"]),
        "parser_info": data["parser_info"],
    }
    if save_version and profile_id:
        version = save_resume_version(
            profile_id=profile_id,
            parsed_resume=data["profile"],
            source_type="uploaded",
            label=label,
            resume_quality_score=data["result"].resume_quality_score,
            score_summary=_model_dump_compat(data["result"].score_summary),
            metadata={"filename": resume_file.filename},
        )
        response["version_record"] = _model_dump_compat(version)
    return response


@app.post("/candidate/profile/from-form")
def candidate_profile_from_form(payload: ResumeFormRequest) -> Dict[str, Any]:
    data = _build_resume_quality_from_form(payload.form_data)
    response = {
        "message": "Structured profile built from form input.",
        "profile": _model_dump_compat(data["profile"]),
        "score_summary": _model_dump_compat(data["result"].score_summary),
        "resume_quality_result": _model_dump_compat(data["result"]),
        "candidate_feedback": _model_dump_compat(data["candidate_feedback"]),
        "parser_info": data["parser_info"],
    }
    if payload.save_version and payload.profile_id:
        version = save_resume_version(
            profile_id=payload.profile_id,
            parsed_resume=data["profile"],
            source_type="form",
            label=payload.label,
            resume_quality_score=data["result"].resume_quality_score,
            score_summary=_model_dump_compat(data["result"].score_summary),
            metadata={"source": "form_builder"},
        )
        response["version_record"] = _model_dump_compat(version)
    return response


@app.post("/candidate/resume-quality/file")
async def candidate_resume_quality_file(
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    data = await _build_resume_quality_from_upload(resume_file=resume_file, prefer_gemini=prefer_gemini)

    # Auto-save parsed profile for Quick Build
    if user and data.get("profile"):
        try:
            save_parsed_profile(user["id"], data["profile"], source="quality_check")
        except Exception:
            pass

    return {
        "message": "Base resume quality scored successfully.",
        "profile": _model_dump_compat(data["profile"]),
        "score_summary": _model_dump_compat(data["result"].score_summary),
        "resume_quality_result": _model_dump_compat(data["result"]),
        "candidate_feedback": _model_dump_compat(data["candidate_feedback"]),
        "parser_info": data["parser_info"],
    }


@app.post("/candidate/resume-quality/form")
def candidate_resume_quality_form(payload: ResumeFormInput) -> Dict[str, Any]:
    data = _build_resume_quality_from_form(payload)
    return {
        "message": "Base resume quality scored successfully from form data.",
        "profile": _model_dump_compat(data["profile"]),
        "score_summary": _model_dump_compat(data["result"].score_summary),
        "resume_quality_result": _model_dump_compat(data["result"]),
        "candidate_feedback": _model_dump_compat(data["candidate_feedback"]),
        "parser_info": data["parser_info"],
    }


@app.post("/candidate/resume-version/save")
def candidate_resume_version_save(payload: ResumeVersionSaveRequest) -> Dict[str, Any]:
    version = save_resume_version(
        profile_id=payload.profile_id,
        parsed_resume=payload.parsed_resume,
        source_type=payload.source_type,
        label=payload.label,
        parent_version_id=payload.parent_version_id,
        resume_quality_score=payload.resume_quality_score,
        score_summary=payload.score_summary,
        metadata=payload.metadata,
    )
    return {
        "message": "Resume version saved successfully.",
        "version_record": _model_dump_compat(version),
    }


@app.get("/candidate/resume-version/history/{profile_id}")
def candidate_resume_version_history(profile_id: str) -> Dict[str, Any]:
    versions = load_resume_versions(profile_id)
    return {
        "profile_id": profile_id,
        "count": len(versions),
        "versions": [_model_dump_compat(item) for item in versions],
    }


@app.post("/candidate/resume-version/compare")
def candidate_resume_version_compare(payload: ResumeVersionCompareRequest) -> Dict[str, Any]:
    diff = compare_resume_versions(
        payload.old_resume,
        payload.new_resume,
        old_version_id=payload.old_version_id,
        new_version_id=payload.new_version_id,
        old_score_summary=payload.old_score_summary,
        new_score_summary=payload.new_score_summary,
    )
    return {
        "message": "Resume version comparison generated successfully.",
        "diff": _model_dump_compat(diff),
    }


# -------------------------------------------------------------------
# Mode 3: Tailor for Job (legacy-only match for candidates, no ML)
# -------------------------------------------------------------------

@app.post("/candidate/tailor-job")
async def candidate_tailor_job(
    resume_file: UploadFile = File(...),
    job_text: str = Form(...),
    prefer_gemini: bool = Form(True),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """Candidate-facing job tailoring: resume quality + legacy heuristic match only (no ML score).
    Returns actionable tailoring suggestions: keywords to add, skills gaps, summary tweaks."""
    data = await _build_analysis_from_upload(
        resume_file=resume_file,
        job_text=job_text,
        prefer_gemini=prefer_gemini,
    )

    # Auto-save parsed profile for Quick Build
    if user and data.get("resume_bundle"):
        try:
            profile = resume_bundle_to_profile(data["resume_bundle"])
            save_parsed_profile(user["id"], profile, source="tailor_job")
        except Exception:
            pass

    result = data["result"]
    candidate_fb = data["candidate_feedback"]

    # Extract legacy-only scores (no ML)
    legacy_score = result.legacy_ats_score
    resume_quality = result.resume_quality_score
    # Tailoring combined: 45% quality + 55% legacy (no ML)
    tailor_combined = round(0.45 * resume_quality + 0.55 * legacy_score, 2)

    return {
        "message": "Job tailoring analysis completed.",
        "scores": {
            "resume_quality_score": resume_quality,
            "legacy_match_score": legacy_score,
            "tailor_combined_score": tailor_combined,
        },
        "quality_breakdown": {
            k: _model_dump_compat(v) for k, v in result.quality_breakdown.items()
        },
        "match_breakdown": {
            k: _model_dump_compat(v) for k, v in result.match_breakdown.items()
        },
        "matched_required_skills": result.matched_required_skills,
        "missing_required_skills": result.missing_required_skills,
        "matched_preferred_skills": result.matched_preferred_skills,
        "missing_preferred_skills": result.missing_preferred_skills,
        "matched_keywords": result.matched_keywords,
        "missing_keywords": result.missing_keywords,
        "tailoring_suggestions": {
            "summary_focus": candidate_fb.rebuild_focus_areas if hasattr(candidate_fb, 'rebuild_focus_areas') else [],
            "skills_to_add": candidate_fb.suggested_skills if hasattr(candidate_fb, 'suggested_skills') else [],
            "keywords_to_include": candidate_fb.suggested_keywords if hasattr(candidate_fb, 'suggested_keywords') else [],
            "improvement_areas": candidate_fb.job_specific_improvement_areas if hasattr(candidate_fb, 'job_specific_improvement_areas') else [],
            "general_improvements": candidate_fb.general_improvement_areas if hasattr(candidate_fb, 'general_improvement_areas') else [],
            "next_steps": candidate_fb.next_steps if hasattr(candidate_fb, 'next_steps') else [],
            "encouragement": candidate_fb.encouragement if hasattr(candidate_fb, 'encouragement') else "",
        },
        "parser_info": data["parser_info"],
    }


# -------------------------------------------------------------------
# CV Generator endpoint (Phase 5)
# -------------------------------------------------------------------

@app.post("/candidate/generate-cv")
def candidate_generate_cv(payload: ResumeFormInput) -> Response:
    """Generate a professional PDF CV from structured form data."""
    data = _model_dump_compat(payload)
    try:
        pdf_bytes = generate_resume_pdf(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CV generation failed: {exc}") from exc

    # Self-verify: re-extract the PDF we just built and confirm key fields survived
    # the layout pass. Doesn't block the download (a warning shouldn't deny the user
    # their file) but logs loudly so a silent template regression gets caught fast.
    verification = verify_ats_extractability(pdf_bytes, data)
    if not verification["passed"]:
        logging.getLogger("cv_generator").warning(
            "Generated CV failed ATS self-verification: %s", verification["warnings"]
        )

    filename = (data.get("candidate_name") or "resume").replace(" ", "_") + "_CV.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ATS-Verification": "pass" if verification["passed"] else "warning",
        },
    )


@app.get("/candidate/parsed-profile")
def candidate_get_parsed_profile(
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get the user's latest parsed resume profile (auto-saved during CV analysis).
    Used by the frontend Quick Build feature."""
    profile = get_parsed_profile(user["id"])
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="No parsed profile found. Please analyse a CV first in the 'Analyse CV' tab.",
        )
    return {
        "message": "Parsed profile loaded successfully.",
        "parsed_resume": profile.get("parsed_resume", {}),
        "source": profile.get("source", "unknown"),
        "updated_at": profile.get("updated_at", ""),
    }


# -------------------------------------------------------------------
# Recruiter / company-owner endpoints (Phase 3)
# -------------------------------------------------------------------

@app.post("/recruiter/job/parse")
def recruiter_parse_job(
    job_text: str = Form(...),
    prefer_gemini: bool = Form(True),
) -> Dict[str, Any]:
    job_bundle = parse_job_source(job_text, prefer_gemini=prefer_gemini)
    return {
        "message": "Job description parsed successfully.",
        "parsed_job": _model_dump_compat(job_bundle["parsed"]),
        "parser_info": {
            "prefer_gemini": prefer_gemini,
            "gemini_key_present": gemini_key_present(),
            "job_parser_source": job_bundle["source"],
            "warnings": job_bundle["warnings"],
        },
    }


@app.post("/recruiter/jobs")
def create_job_posting(
    payload: JobPostingCreate,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    """Recruiter creates a live job listing. The JD text is parsed once here
    and reused for every future screening/application against this job,
    instead of re-parsing it on every request."""
    job_bundle = parse_job_source(payload.description, prefer_gemini=True)
    parsed_job = _model_dump_compat(job_bundle["parsed"])

    # If the recruiter edited the live skill-suggestion chips, their confirmed list
    # wins over the raw AI guess — the AI is a suggestion engine here, not a black box.
    if payload.confirmed_skills is not None:
        parsed_job["required_skills"] = payload.confirmed_skills

    job = create_job_posting_db(
        recruiter_id=user["id"],
        title=payload.title,
        company_name=payload.company_name,
        location=payload.location,
        employment_type=payload.employment_type.value,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        description=payload.description,
        parsed_job=parsed_job,
    )
    return {"message": "Job posted successfully.", "job": job}


@app.get("/jobs")
def browse_jobs(
    search: Optional[str] = None,
    location: Optional[str] = None,
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """Public listing endpoint — no auth required, mirrors how any real job board works.
    When a candidate IS logged in and has a resume on file, re-ranks by skill overlap
    against their resume (see database.list_open_job_postings_personalized_db) instead
    of plain recency — this is the 'Job Tailor learns from your profile' feature."""
    if user and user.get("role") == "candidate":
        version = get_latest_resume_version_db(user["id"])
        if version:
            jobs = list_open_job_postings_personalized_db(
                candidate_resume_skills=version["parsed_resume"].get("skills"),
                search=search, location=location,
            )
            return {"count": len(jobs), "jobs": jobs, "personalized": True}
    jobs = list_open_job_postings_db(search=search, location=location)
    return {"count": len(jobs), "jobs": jobs, "personalized": False}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, user: Optional[Dict[str, Any]] = Depends(get_optional_user)) -> Dict[str, Any]:
    job = get_job_posting_db(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if user and user.get("role") == "candidate":
        log_interaction_db(user["id"], job_id, "viewed")
    return job


@app.get("/recruiter/jobs/mine")
def my_job_postings(user: Dict[str, Any] = Depends(require_role("recruiter"))) -> Dict[str, Any]:
    return {"jobs": list_recruiter_job_postings_db(user["id"])}


class JobStatusUpdateRequest(BaseModel):
    status: JobStatus


@app.patch("/recruiter/jobs/{job_id}/status")
def update_job_status(
    job_id: str,
    payload: JobStatusUpdateRequest,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    """Ownership-checked: only the recruiter who owns this posting can close/reopen it."""
    job = update_job_posting_status_db(job_id, recruiter_id=user["id"], status=payload.status.value)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or you don't own this posting.")
    return {"message": f"Job status updated to '{payload.status.value}'.", "job": job}


# -------------------------------------------------------------------
# Applications — the join between candidate, job, and resume version
# -------------------------------------------------------------------

def _resolve_resume_version(user_id: str, resume_version_id: Optional[str]) -> Dict[str, Any]:
    """Shared by /apply and /match-preview so both use the exact same
    ownership-scoped lookup — one place to get this right instead of two."""
    if resume_version_id:
        version = get_resume_version_by_id_db(user_id, resume_version_id)
        if version is None:
            raise HTTPException(status_code=404, detail="Resume version not found on your account.")
        return version
    version = get_latest_resume_version_db(user_id)
    if version is None:
        raise HTTPException(
            status_code=400,
            detail="No saved resume found. Upload or build a resume before applying.",
        )
    return version


def _run_resume_parse_job(job_id: str, tmp_path_str: str, prefer_gemini: bool, label: Optional[str], user_id: str) -> None:
    """Runs in a background thread (FastAPI BackgroundTasks executes sync functions
    in a threadpool automatically) — the Gemini call inside parse_resume_source is a
    blocking HTTP request, so keeping this as a plain sync function (not async def)
    is what actually gets it off the event loop, not just off the visible request."""
    update_processing_job_db(job_id, status="processing", progress_pct=10)
    try:
        resume_bundle = parse_resume_source(file_path=tmp_path_str, prefer_gemini=prefer_gemini)
        update_processing_job_db(job_id, progress_pct=45)
        profile = resume_bundle_to_profile(resume_bundle)
        result = score_resume_quality_only(
            parsed_resume=profile,
            resume_raw_text=resume_bundle["text"],
            parser_mode=derive_parser_mode(resume_bundle["source"], "not_requested"),
            parser_sources={"resume": resume_bundle["source"]},
        )
        update_processing_job_db(job_id, progress_pct=80)
        feedback = generate_resume_quality_feedback(profile, result)
        version = save_resume_version_db(
            user_id=user_id,
            parsed_resume=profile,
            source_type="uploaded",
            label=label,
            resume_quality_score=result.resume_quality_score,
            score_summary=_model_dump_compat(result.score_summary),
        )
        update_processing_job_db(
            job_id, status="done", progress_pct=100,
            result={
                "version": version,
                "resume_quality_result": _model_dump_compat(result),
                "candidate_feedback": _model_dump_compat(feedback),
            },
        )
    except Exception as exc:
        update_processing_job_db(job_id, status="error", error_message=str(exc))
    finally:
        try:
            Path(tmp_path_str).unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/candidate/resume/upload-async")
async def candidate_resume_upload_async(
    background_tasks: BackgroundTasks,
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    label: Optional[str] = Form(None),
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """Returns immediately with a job_id instead of blocking on the Gemini parse call —
    poll GET /processing-jobs/{job_id} for status. Prefer this over the synchronous
    /candidate/resume/upload for any UI that wants a responsive 'Processing…' state
    instead of a frozen request."""
    tmp_path = await _save_upload_to_temp(resume_file)
    job = create_processing_job_db(user["id"], "resume_parse")
    background_tasks.add_task(_run_resume_parse_job, job["id"], str(tmp_path), prefer_gemini, label, user["id"])
    return {"job_id": job["id"], "status": "queued"}


@app.get("/processing-jobs/{job_id}")
def get_processing_job(job_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Ownership-checked poll endpoint — a job's status is only visible to the user
    who started it."""
    job = get_processing_job_db(job_id)
    if job is None or job["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Processing job not found.")
    return job


@app.post("/candidate/resume/upload")
async def candidate_resume_upload(
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    label: Optional[str] = Form(None),
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """The authenticated, account-linked resume upload path — this is what actually
    populates resume_versions (Mongo, keyed by user_id), which is what /jobs/{id}/apply,
    /profile/me, and the match-preview flow all read from. (The older
    /candidate/profile/parse-upload endpoint writes to a separate, unauthenticated,
    file-based store used by the legacy Quick Build flow — the two are not the same
    system. This endpoint is the one to use for anything tied to a logged-in account.)"""
    data = await _build_resume_quality_from_upload(resume_file=resume_file, prefer_gemini=prefer_gemini)
    version = save_resume_version_db(
        user_id=user["id"],
        parsed_resume=data["profile"],
        source_type="uploaded",
        label=label,
        resume_quality_score=data["result"].resume_quality_score,
        score_summary=_model_dump_compat(data["result"].score_summary),
    )
    return {
        "message": "Resume uploaded and saved to your account.",
        "version": version,
        "resume_quality_result": _model_dump_compat(data["result"]),
        "candidate_feedback": _model_dump_compat(data["candidate_feedback"]),
    }


@app.post("/candidate/tailor-job/suggest-edits")
async def candidate_suggest_tailored_edits(
    resume_file: UploadFile = File(...),
    job_text: str = Form(...),
    missing_skills: str = Form(""),
    missing_keywords: str = Form(""),
    prefer_gemini: bool = Form(True),
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """Jobsuit-style tailoring: instead of a checklist of missing skills, this
    returns concrete before/after bullet edits the candidate can accept or
    reject individually. Nothing is written to the résumé here — this is a
    preview; /candidate/tailor-job/save-version applies whichever ones the
    candidate actually accepted."""
    data = await _build_resume_quality_from_upload(resume_file=resume_file, prefer_gemini=prefer_gemini)
    profile = data["profile"]
    skills = [s.strip() for s in missing_skills.split(",") if s.strip()]
    keywords = [k.strip() for k in missing_keywords.split(",") if k.strip()]
    edits = generate_tailored_edits(profile, job_text, skills, keywords)
    return {"edits": edits, "profile_snapshot_experience_count": len(profile.get("experience") or [])}


@app.post("/candidate/tailor-job/save-version")
async def candidate_save_tailored_version(
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    label: Optional[str] = Form(None),
    accepted_edits: str = Form("[]"),
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """Saves a résumé upgraded for a specific job: re-parses the uploaded résumé,
    applies only the individual bullet edits the candidate accepted (see
    /candidate/tailor-job/suggest-edits), re-scores, and stores it as a new
    labeled version via the same save_resume_version_db path CV Builder uses —
    so it shows up in résumé history and is selectable later at apply time,
    distinguished by source_type='tailored'. The original version is never
    touched or overwritten; this only ever adds a new one."""
    data = await _build_resume_quality_from_upload(resume_file=resume_file, prefer_gemini=prefer_gemini)
    profile = data["profile"]

    try:
        edits = json.loads(accepted_edits) if accepted_edits else []
        if not isinstance(edits, list):
            edits = []
    except (json.JSONDecodeError, TypeError):
        edits = []

    updated_profile = apply_edits_to_profile(profile, edits) if edits else profile

    # Re-score the upgraded profile so the saved version reflects the accepted
    # edits, not the pre-upgrade score from the original tailoring pass.
    result = score_resume_quality_only(
        parsed_resume=updated_profile,
        resume_raw_text=data["resume_bundle"]["text"],
        parser_mode=derive_parser_mode(data["resume_bundle"]["source"], "not_requested"),
        parser_sources={"resume": data["resume_bundle"]["source"]},
    )

    version = save_resume_version_db(
        user_id=user["id"],
        parsed_resume=updated_profile,
        source_type="tailored",
        label=label or "Tailored version",
        resume_quality_score=result.resume_quality_score,
        score_summary=_model_dump_compat(result.score_summary),
        metadata={"accepted_edit_keywords": [e.get("keyword") for e in edits if e.get("keyword")]},
    )
    return {
        "message": "Tailored version saved to your résumé history. Your original version is unchanged.",
        "version": version,
        "resume_quality_result": _model_dump_compat(result),
    }


@app.post("/candidate/resume-versions/{version_id}/restore")
def candidate_restore_resume_version(
    version_id: str,
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """'Go back to any version' — implemented as creating a new version that's
    a copy of the chosen one, rather than deleting anything after it. This
    keeps the full history intact (nothing is ever lost) while making the
    restored content the active/latest version, since applying to jobs and
    Quick Build both always use the most recent version."""
    old = get_resume_version_by_id_db(user["id"], version_id)
    if old is None:
        raise HTTPException(status_code=404, detail="Résumé version not found.")
    restored = save_resume_version_db(
        user_id=user["id"],
        parsed_resume=old["parsed_resume"],
        source_type="restored",
        label=f"Restored from v{old.get('version_number')}" + (f" — {old['label']}" if old.get("label") else ""),
        resume_quality_score=old.get("resume_quality_score"),
        score_summary=old.get("score_summary"),
        metadata={"restored_from_version_id": version_id, "restored_from_version_number": old.get("version_number")},
    )
    return {"message": "Version restored — it's now your active résumé.", "version": restored}


@app.get("/candidate/resume-versions")
def candidate_resume_versions(user: Dict[str, Any] = Depends(require_role("candidate"))) -> Dict[str, Any]:
    """Lightweight list for the Apply modal's version picker — trims the heavy
    parsed_resume payload down to what the dropdown actually needs to display."""
    versions = load_resume_versions_db(user["id"])
    trimmed = [
        {
            "id": v["id"],
            "version_number": v.get("version_number"),
            "label": v.get("label"),
            "source_type": v.get("source_type"),
            "resume_quality_score": v.get("resume_quality_score"),
            "created_at": v.get("created_at"),
        }
        for v in versions
    ]
    return {"versions": trimmed}


@app.post("/jobs/{job_id}/match-preview")
def preview_job_match(
    job_id: str,
    payload: ApplyRequest,
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """Computes the match score WITHOUT creating an application — lets the
    candidate see their real fit before committing to apply."""
    job = get_job_posting_db(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    version = _resolve_resume_version(user["id"], payload.resume_version_id)
    result = score_resume_against_job(
        parsed_resume=version["parsed_resume"],
        parsed_job=job["parsed_job"],
    )
    return {
        "resume_version_id": version["id"],
        "job_match_score": result.job_match_score,
        "combined_score": result.combined_score,
        "matched_required_skills": result.matched_required_skills,
        "missing_required_skills": result.missing_required_skills,
    }


@app.post("/jobs/{job_id}/apply")
def apply_to_job(
    job_id: str,
    payload: ApplyRequest,
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    job = get_job_posting_db(job_id)
    if job is None or job["status"] != "open":
        raise HTTPException(status_code=404, detail="Job not found or no longer accepting applications.")

    # Resolve which resume version to apply with. Ownership-scoped lookups only —
    # a candidate can never pull another user's resume version, even by guessing an id.
    version = _resolve_resume_version(user["id"], payload.resume_version_id)

    # Score this specific resume against this specific job at apply time.
    # This is the feature bdjobs/somvob don't have: the candidate's real match
    # quality is computed and stored on the application itself, not eyeballed later.
    result = score_resume_against_job(
        parsed_resume=version["parsed_resume"],
        parsed_job=job["parsed_job"],
    )

    try:
        application = create_application_db(
            job_id=job_id,
            job_title=job["title"],
            company_name=job["company_name"],
            recruiter_id=job["recruiter_id"],
            candidate_id=user["id"],
            candidate_name=user.get("full_name") or user.get("email", "Candidate"),
            candidate_email=user["email"],
            resume_version_id=version["id"],
            cover_note=payload.cover_note,
            job_match_score=result.job_match_score,
            combined_score=result.combined_score,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    log_interaction_db(user["id"], job_id, "applied")
    return {"message": "Application submitted successfully.", "application": application}


@app.get("/candidate/applications")
def my_applications(user: Dict[str, Any] = Depends(require_role("candidate"))) -> Dict[str, Any]:
    return {"applications": list_candidate_applications_db(user["id"])}


@app.get("/recruiter/jobs/{job_id}/applicants")
def job_applicants(
    job_id: str,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    job = get_job_posting_db(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You don't own this job posting.")
    return {"job": job, "applicants": list_job_applications_db(job_id)}


@app.patch("/recruiter/applications/{application_id}/status")
def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdateRequest,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    """Ownership-checked via recruiter_id stored on the application itself —
    no lookup-then-trust, the DB query itself enforces it. Also enforces the
    Kanban state machine (database.RECRUITER_TRANSITIONS) — illegal moves like
    hired -> reviewed are rejected with a 400, not silently allowed."""
    try:
        application = update_application_status_db(application_id, recruiter_id=user["id"], status=payload.status.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found or you don't own the related job.")
    return {"message": f"Application status updated to '{payload.status.value}'.", "application": application}


class ScheduleInterviewRequest(BaseModel):
    interview_datetime: str  # ISO 8601, e.g. from <input type="datetime-local">


@app.patch("/recruiter/applications/{application_id}/schedule-interview")
def schedule_interview(
    application_id: str,
    payload: ScheduleInterviewRequest,
    user: Dict[str, Any] = Depends(require_role("recruiter")),
) -> Dict[str, Any]:
    """Moves the application to 'interview_scheduled' and generates a Jitsi
    video room in one action — both the recruiter and the candidate see the
    same room via their own copy of this application record."""
    try:
        application = schedule_interview_db(application_id, recruiter_id=user["id"], interview_datetime=payload.interview_datetime)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found or you don't own the related job.")
    return {"message": "Interview scheduled.", "application": application}


@app.post("/candidate/applications/{application_id}/withdraw")
def withdraw_application(
    application_id: str,
    user: Dict[str, Any] = Depends(require_role("candidate")),
) -> Dict[str, Any]:
    """Candidate-initiated withdrawal — ownership-checked by candidate_id, and only
    legal from a non-terminal status (see database.CANDIDATE_WITHDRAWABLE_FROM)."""
    try:
        application = withdraw_application_db(application_id, candidate_id=user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found or doesn't belong to you.")
    return {"message": "Application withdrawn.", "application": application}


@app.post("/recruiter/job/screen-file")
async def recruiter_screen_file(
    job_text: str = Form(...),
    resume_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    profile_id: Optional[str] = Form(None),
) -> Dict[str, Any]:
    file_items = await _save_multiple_uploads_to_temp([resume_file])
    try:
        profile_hints = {Path(resume_file.filename or "resume").name.lower(): profile_id} if profile_id else {}
        session = screen_resume_paths(
            file_items=file_items,
            job_text=job_text,
            prefer_gemini=prefer_gemini,
            profile_hints=profile_hints,
        )
    finally:
        for item in file_items:
            try:
                Path(item["path"]).unlink(missing_ok=True)
            except Exception:
                pass

    candidate = session["candidates"][0] if session["candidates"] else None
    return {
        "message": "Recruiter screening generated successfully for a single resume.",
        "parsed_job": session["parsed_job"],
        "job_parser_info": session["job_parser_info"],
        "summary": session["summary"],
        "candidate": candidate,
        "skipped_files": session["skipped_files"],
    }


@app.post("/recruiter/job/screen-files")
async def recruiter_screen_files(
    job_text: str = Form(...),
    resume_files: List[UploadFile] = File(...),
    prefer_gemini: bool = Form(True),
    profile_hints_json: Optional[str] = Form(None),
) -> Dict[str, Any]:
    if not resume_files:
        raise HTTPException(status_code=400, detail="At least one resume file is required.")
    file_items = await _save_multiple_uploads_to_temp(resume_files)
    try:
        session = screen_resume_paths(
            file_items=file_items,
            job_text=job_text,
            prefer_gemini=prefer_gemini,
            profile_hints=parse_profile_hints(profile_hints_json),
        )
    finally:
        for item in file_items:
            try:
                Path(item["path"]).unlink(missing_ok=True)
            except Exception:
                pass

    return {
        "message": "Recruiter screening completed for uploaded resumes.",
        **session,
    }


@app.post("/recruiter/job/screen-zip")
async def recruiter_screen_zip(
    job_text: str = Form(...),
    zip_file: UploadFile = File(...),
    prefer_gemini: bool = Form(True),
    profile_hints_json: Optional[str] = Form(None),
) -> Dict[str, Any]:
    suffix = Path(zip_file.filename or "resumes.zip").suffix.lower()
    if suffix != ".zip":
        raise HTTPException(status_code=400, detail="Only .zip archives are supported for bulk screening.")

    zip_path = await _save_upload_to_temp(zip_file)
    try:
        session = screen_zip_archive(
            zip_path=str(zip_path),
            job_text=job_text,
            prefer_gemini=prefer_gemini,
            profile_hints=parse_profile_hints(profile_hints_json),
        )
    finally:
        try:
            zip_path.unlink(missing_ok=True)
        except Exception:
            pass

    return {
        "message": "Recruiter bulk screening completed successfully.",
        **session,
    }


@app.get("/recruiter/candidate/history/{profile_id}")
def recruiter_candidate_history(profile_id: str) -> Dict[str, Any]:
    snapshot = get_resume_history_snapshot(profile_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No resume history found for this profile.")
    versions = load_resume_versions(profile_id)
    return {
        "message": "Candidate resume history loaded successfully.",
        "history_snapshot": snapshot,
        "versions": [_model_dump_compat(item) for item in versions],
    }


# -------------------------------------------------------------------
# Compatibility routes for old frontend (with auto-save parsed profile)
# -------------------------------------------------------------------

@app.post("/score")
async def score_compat(
    resume_file: UploadFile = File(...),
    job_text: str = Form(...),
    resume_model_name: str = Form("gemini-2.5-flash"),
    job_model_name: str = Form("gemini-2.5-flash"),
    prefer_pdf_vision: bool = Form(True),
    prefer_gemini_job_parser: bool = Form(True),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    _ = (resume_model_name, job_model_name)
    prefer_gemini = bool(prefer_pdf_vision or prefer_gemini_job_parser)

    data = await _build_analysis_from_upload(
        resume_file=resume_file,
        job_text=job_text,
        prefer_gemini=prefer_gemini,
    )

    # Auto-save parsed profile to DB for Quick Build
    if user and data.get("resume_bundle"):
        try:
            profile = resume_bundle_to_profile(data["resume_bundle"])
            save_parsed_profile(user["id"], profile, source="score_analysis")
        except Exception:
            pass

    response = _build_api_response(data)
    return {
        "message": "ATS score generated successfully",
        "ats_result": response["result"],
        "score_summary": response["score_summary"],
    }


@app.post("/review/internal")
async def review_internal_compat(
    resume_file: UploadFile = File(...),
    job_text: str = Form(...),
    resume_model_name: str = Form("gemini-2.5-flash"),
    job_model_name: str = Form("gemini-2.5-flash"),
    prefer_pdf_vision: bool = Form(True),
    prefer_gemini_job_parser: bool = Form(True),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    _ = (resume_model_name, job_model_name)
    prefer_gemini = bool(prefer_pdf_vision or prefer_gemini_job_parser)

    data = await _build_analysis_from_upload(
        resume_file=resume_file,
        job_text=job_text,
        prefer_gemini=prefer_gemini,
    )

    # Auto-save parsed profile
    if user and data.get("resume_bundle"):
        try:
            profile = resume_bundle_to_profile(data["resume_bundle"])
            save_parsed_profile(user["id"], profile, source="recruiter_review")
        except Exception:
            pass

    response = _build_api_response(data, include_parsed=True)
    response["message"] = "Internal recruiter review generated successfully"
    return response


@app.post("/review/candidate")
async def review_candidate_compat(
    resume_file: UploadFile = File(...),
    job_text: str = Form(...),
    resume_model_name: str = Form("gemini-2.5-flash"),
    job_model_name: str = Form("gemini-2.5-flash"),
    prefer_pdf_vision: bool = Form(True),
    prefer_gemini_job_parser: bool = Form(True),
    user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    _ = (resume_model_name, job_model_name)
    prefer_gemini = bool(prefer_pdf_vision or prefer_gemini_job_parser)

    data = await _build_analysis_from_upload(
        resume_file=resume_file,
        job_text=job_text,
        prefer_gemini=prefer_gemini,
    )

    # Auto-save parsed profile
    if user and data.get("resume_bundle"):
        try:
            profile = resume_bundle_to_profile(data["resume_bundle"])
            save_parsed_profile(user["id"], profile, source="candidate_review")
        except Exception:
            pass

    response = _build_api_response(data)
    return {
        "message": "Candidate-safe review generated successfully",
        "match_label": response["result"]["match_label"],
        "score_summary": response["score_summary"],
        "candidate_feedback": response["candidate_feedback"],
    }

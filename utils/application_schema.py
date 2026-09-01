from __future__ import annotations

from typing import Optional
from enum import Enum

from pydantic import BaseModel, Field


class ApplicationStatus(str, Enum):
    applied = "applied"                          # just submitted, not yet scored (transient)
    ai_ranked = "ai_ranked"                       # scored by the matching engine, awaiting recruiter review
    reviewed = "reviewed"                         # recruiter has looked at it
    interview_scheduled = "interview_scheduled"   # moving toward a hire
    hired = "hired"                               # terminal
    rejected = "rejected"                         # terminal
    withdrawn = "withdrawn"                       # terminal, candidate-initiated


class ApplyRequest(BaseModel):
    """What a candidate sends when applying to a job.
    resume_version_id is optional — if omitted, the candidate's latest saved
    resume version is used automatically."""
    resume_version_id: Optional[str] = None
    cover_note: Optional[str] = Field(default=None, max_length=2000)


class Application(BaseModel):
    """Persisted application, as stored/returned by the API."""
    id: str
    job_id: str
    job_title: str
    company_name: str
    recruiter_id: str                     # denormalized from the job, for fast ownership checks
    candidate_id: str
    candidate_name: str
    candidate_email: str
    resume_version_id: str
    cover_note: Optional[str] = None
    status: ApplicationStatus = ApplicationStatus.applied
    job_match_score: float = 0.0
    combined_score: float = 0.0
    applied_at: str
    updated_at: str


class ApplicationStatusUpdateRequest(BaseModel):
    status: ApplicationStatus

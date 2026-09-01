from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from enum import Enum

from pydantic import BaseModel, Field

from .job_schema import ParsedJob


class JobStatus(str, Enum):
    draft = "draft"       # recruiter is still editing, not visible to candidates
    open = "open"         # live, candidates can apply
    closed = "closed"     # no longer accepting applications
    filled = "filled"     # position filled


class EmploymentType(str, Enum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"
    internship = "internship"
    remote = "remote"


class JobPostingCreate(BaseModel):
    """What a recruiter submits to create a listing."""
    title: str = Field(..., min_length=2, max_length=150)
    company_name: str = Field(..., min_length=2, max_length=150)
    location: str = Field(default="Remote", max_length=150)
    employment_type: EmploymentType = EmploymentType.full_time
    salary_min: Optional[int] = Field(default=None, ge=0)
    salary_max: Optional[int] = Field(default=None, ge=0)
    description: str = Field(..., min_length=20, description="Raw job description text, will be AI-parsed")
    confirmed_skills: Optional[List[str]] = Field(
        default=None,
        description="Recruiter-approved skill list from the live suggestion UI. If provided, "
                    "overrides the AI parser's required_skills so downstream matching/scoring "
                    "uses what the recruiter actually confirmed, not just the raw AI guess.",
    )


class JobPosting(BaseModel):
    """Persisted job listing, as stored/returned by the API."""
    id: str
    recruiter_id: str                     # owner — used for ownership checks on edit/delete
    title: str
    company_name: str
    location: str
    employment_type: EmploymentType
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    description: str                      # original raw JD text
    parsed_job: ParsedJob                 # AI-extracted structure, reused by ats_score_engine
    status: JobStatus = JobStatus.open
    application_count: int = 0
    created_at: str
    updated_at: str

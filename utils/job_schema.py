from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class JobEducationRequirement(BaseModel):
    level: Optional[str] = Field(
        default=None,
        description="Normalized education level such as diploma, associate, bachelor, master, phd, or high_school.",
    )
    field: Optional[str] = Field(
        default=None,
        description="Preferred degree field such as computer science, business administration, marketing, or finance.",
    )


class ParsedJob(BaseModel):
    title: Optional[str] = Field(default=None, description="Job title or role name")
    summary: Optional[str] = Field(default=None, description="Short summary of the role")
    required_skills: List[str] = Field(default_factory=list, description="Must-have skills for the role")
    preferred_skills: List[str] = Field(default_factory=list, description="Nice-to-have skills for the role")
    tools: List[str] = Field(default_factory=list, description="Tools, platforms, or software explicitly mentioned")
    responsibilities: List[str] = Field(default_factory=list, description="Core job responsibilities")
    keywords: List[str] = Field(default_factory=list, description="Important ATS keywords for lexical matching")
    min_experience_years: Optional[float] = Field(
        default=None,
        description="Minimum years of experience required if inferable from the job description",
    )
    education_requirements: List[JobEducationRequirement] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list, description="Relevant certifications explicitly mentioned")
    raw_text_used: Optional[str] = Field(
        default=None,
        description="A short flag describing what input source was used, for example gemini_job_text or fallback_text",
    )

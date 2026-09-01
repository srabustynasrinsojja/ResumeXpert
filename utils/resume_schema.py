from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ResumeEducation(BaseModel):
    degree: Optional[str] = Field(default=None, description="Degree name, e.g. BSc in Computer Science")
    institution: Optional[str] = Field(default=None, description="School, college, or university name")
    start_date: Optional[str] = Field(default=None, description="Start date as found in the resume")
    end_date: Optional[str] = Field(default=None, description="End date as found in the resume")
    grade: Optional[str] = Field(default=None, description="CGPA, GPA, percentage, or grade if present")


class ResumeExperience(BaseModel):
    job_title: Optional[str] = Field(default=None, description="Job title or role")
    company: Optional[str] = Field(default=None, description="Company or organization name")
    start_date: Optional[str] = Field(default=None, description="Employment start date")
    end_date: Optional[str] = Field(default=None, description="Employment end date or 'present'")
    duration_years: Optional[float] = Field(default=None, description="Approximate duration in years if inferable")
    responsibilities: List[str] = Field(default_factory=list, description="Important responsibilities or achievements")
    technologies: List[str] = Field(default_factory=list, description="Technologies or tools used in the role")


class ResumeProject(BaseModel):
    name: Optional[str] = Field(default=None, description="Project name")
    description: Optional[str] = Field(default=None, description="Short project summary")
    technologies: List[str] = Field(default_factory=list, description="Technologies used in the project")
    link: Optional[str] = Field(default=None, description="Project URL if present")


class ResumeCertification(BaseModel):
    name: Optional[str] = Field(default=None, description="Certification name")
    issuer: Optional[str] = Field(default=None, description="Issuing organization")
    date: Optional[str] = Field(default=None, description="Issue date if present")


class ResumeSkills(BaseModel):
    technical: List[str] = Field(default_factory=list, description="Technical skills, programming languages, frameworks, databases, cloud, etc.")
    tools: List[str] = Field(default_factory=list, description="Tools, platforms, IDEs, BI tools, etc.")
    soft: List[str] = Field(default_factory=list, description="Soft skills such as leadership, communication, teamwork")


class ParsedResume(BaseModel):
    candidate_name: Optional[str] = Field(default=None, description="Candidate full name")
    headline: Optional[str] = Field(default=None, description="Current or target role/headline from the resume")
    email: Optional[str] = Field(default=None, description="Primary email address")
    phone: Optional[str] = Field(default=None, description="Primary phone number")
    location: Optional[str] = Field(default=None, description="City/state/country if present")
    linkedin: Optional[str] = Field(default=None, description="LinkedIn profile URL if present")
    github: Optional[str] = Field(default=None, description="GitHub profile URL if present")
    portfolio: Optional[str] = Field(default=None, description="Portfolio or personal website URL if present")
    summary: Optional[str] = Field(default=None, description="Professional summary extracted from the resume")
    total_experience_years: Optional[float] = Field(default=None, description="Approximate total years of relevant work experience")
    skills: ResumeSkills = Field(default_factory=ResumeSkills)
    education: List[ResumeEducation] = Field(default_factory=list)
    experience: List[ResumeExperience] = Field(default_factory=list)
    projects: List[ResumeProject] = Field(default_factory=list)
    certifications: List[ResumeCertification] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list, description="Natural languages known by the candidate")
    raw_text_used: Optional[str] = Field(default=None, description="A short flag describing what input source was used, e.g. pdf_vision or extracted_text")


class ResumeFormInput(BaseModel):
    candidate_name: Optional[str] = None
    headline: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    summary: Optional[str] = None
    total_experience_years: Optional[float] = None
    skills: ResumeSkills = Field(default_factory=ResumeSkills)
    education: List[ResumeEducation] = Field(default_factory=list)
    experience: List[ResumeExperience] = Field(default_factory=list)
    projects: List[ResumeProject] = Field(default_factory=list)
    certifications: List[ResumeCertification] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)


class ResumeVersionRecord(BaseModel):
    profile_id: str
    version_id: str
    version_number: int
    source_type: str = "uploaded"
    label: Optional[str] = None
    parent_version_id: Optional[str] = None
    created_at: str
    parsed_resume: ParsedResume
    resume_quality_score: Optional[float] = None
    score_summary: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ResumeVersionDiff(BaseModel):
    from_version_id: Optional[str] = None
    to_version_id: Optional[str] = None
    score_delta: float = 0.0
    added_skills: List[str] = Field(default_factory=list)
    removed_skills: List[str] = Field(default_factory=list)
    changed_sections: List[str] = Field(default_factory=list)
    improvement_highlights: List[str] = Field(default_factory=list)
    interview_probe_points: List[str] = Field(default_factory=list)

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ScoreComponent(BaseModel):
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    summary: str = ""
    evidence: List[str] = Field(default_factory=list)
    raw_value: Optional[float] = None


class ParserInfo(BaseModel):
    prefer_gemini: bool = False
    gemini_key_present: bool = False
    resume_parser_source: str = "none"
    job_parser_source: str = "none"
    warnings: List[str] = Field(default_factory=list)


class ScoreSummary(BaseModel):
    score_version: str = "v3_split_quality_match"
    resume_quality_score: float = Field(default=0.0, ge=0.0, le=100.0)
    job_match_score: float = Field(default=0.0, ge=0.0, le=100.0)
    combined_score: float = Field(default=0.0, ge=0.0, le=100.0)
    ranking_score: float = Field(default=0.0, ge=0.0, le=100.0)
    legacy_ats_score: float = Field(default=0.0, ge=0.0, le=100.0)
    ml_score: float = Field(default=0.0, ge=0.0, le=100.0)
    model_ranking_score: float = Field(default=0.0, ge=0.0, le=100.0)


class ATSScoreResult(BaseModel):
    # Backward-compatible legacy fields.
    legacy_ats_score: float = Field(default=0.0, ge=0.0, le=100.0)
    ml_score: float = Field(default=0.0, ge=0.0, le=100.0)
    final_hybrid_score: float = Field(default=0.0, ge=0.0, le=100.0)
    ats_score: float = Field(default=0.0, ge=0.0, le=100.0)
    ranking_score: float = Field(default=0.0, ge=0.0, le=100.0)

    # New split-score fields.
    resume_quality_score: float = Field(default=0.0, ge=0.0, le=100.0)
    job_match_score: float = Field(default=0.0, ge=0.0, le=100.0)
    combined_score: float = Field(default=0.0, ge=0.0, le=100.0)
    model_ranking_score: float = Field(default=0.0, ge=0.0, le=100.0)
    # NEW — HR-facing fields surfaced from the multiclass model
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    needs_review: bool = Field(default=False)
    score_summary: ScoreSummary = Field(default_factory=ScoreSummary)

    match_label: str = "poor_match"
    model_name: str = "unknown"
    parser_mode: str = "local_fallback"
    parser_sources: Dict[str, str] = Field(default_factory=dict)
    class_probabilities: Dict[str, float] = Field(default_factory=dict)

    matched_required_skills: List[str] = Field(default_factory=list)
    missing_required_skills: List[str] = Field(default_factory=list)
    matched_preferred_skills: List[str] = Field(default_factory=list)
    missing_preferred_skills: List[str] = Field(default_factory=list)
    matched_keywords: List[str] = Field(default_factory=list)
    missing_keywords: List[str] = Field(default_factory=list)

    # Backward-compatible combined breakdown.
    breakdown: Dict[str, ScoreComponent] = Field(default_factory=dict)
    # New separated breakdowns.
    quality_breakdown: Dict[str, ScoreComponent] = Field(default_factory=dict)
    match_breakdown: Dict[str, ScoreComponent] = Field(default_factory=dict)

    feature_values: Dict[str, float] = Field(default_factory=dict)
    notes: List[str] = Field(default_factory=list)
    score_version: str = "v3_split_quality_match"


class InternalFeedback(BaseModel):
    summary: str
    match_label: str
    ats_score: float
    resume_quality_score: float = 0.0
    job_match_score: float = 0.0
    combined_score: float = 0.0
    recommendation: str
    decision_bucket: str = "review"
    strengths: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    accept_reasons: List[str] = Field(default_factory=list)
    reject_reasons: List[str] = Field(default_factory=list)
    reviewer_questions: List[str] = Field(default_factory=list)
    interview_probe_points: List[str] = Field(default_factory=list)
    next_actions: List[str] = Field(default_factory=list)
    evidence: Dict[str, Any] = Field(default_factory=dict)


class CandidateFeedback(BaseModel):
    summary: str
    match_label: str
    ats_score: float
    resume_quality_score: float = 0.0
    job_match_score: float = 0.0
    combined_score: float = 0.0
    strengths: List[str] = Field(default_factory=list)
    improvement_areas: List[str] = Field(default_factory=list)
    general_improvement_areas: List[str] = Field(default_factory=list)
    job_specific_improvement_areas: List[str] = Field(default_factory=list)
    suggested_skills: List[str] = Field(default_factory=list)
    suggested_keywords: List[str] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)
    rebuild_focus_areas: List[str] = Field(default_factory=list)
    encouragement: str = ""

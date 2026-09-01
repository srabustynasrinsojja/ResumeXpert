from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from utils.resume_schema import ParsedResume, ResumeVersionDiff, ResumeVersionRecord


STORAGE_ROOT = Path(os.getenv("ATS_RESUME_VERSION_DIR", "data/resume_versions"))


def _ensure_root() -> Path:
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    return STORAGE_ROOT


def _safe_profile_id(profile_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(profile_id or "default").strip())
    return cleaned or "default"


def _normalize_email(email: Optional[str]) -> str:
    return str(email or "").strip().lower()


def _profile_file(profile_id: str) -> Path:
    root = _ensure_root()
    return root / f"{_safe_profile_id(profile_id)}.json"


def _dump(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if isinstance(model, dict):
        return model
    raise TypeError(f"Unsupported model type: {type(model)}")


def _load_records(profile_id: str) -> List[ResumeVersionRecord]:
    path = _profile_file(profile_id)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return [ResumeVersionRecord(**item) for item in data]


def load_resume_versions(profile_id: str) -> List[ResumeVersionRecord]:
    return _load_records(profile_id)


def save_resume_version(
    profile_id: str,
    parsed_resume: ParsedResume,
    *,
    source_type: str = "uploaded",
    label: Optional[str] = None,
    parent_version_id: Optional[str] = None,
    resume_quality_score: Optional[float] = None,
    score_summary: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> ResumeVersionRecord:
    profile_id = _safe_profile_id(profile_id)
    records = _load_records(profile_id)
    next_number = (records[-1].version_number + 1) if records else 1
    version = ResumeVersionRecord(
        profile_id=profile_id,
        version_id=str(uuid4()),
        version_number=next_number,
        source_type=source_type,
        label=label,
        parent_version_id=parent_version_id or (records[-1].version_id if records else None),
        created_at=datetime.now(timezone.utc).isoformat(),
        parsed_resume=parsed_resume,
        resume_quality_score=resume_quality_score,
        score_summary=score_summary or {},
        metadata=metadata or {},
    )
    records.append(version)
    _profile_file(profile_id).write_text(
        json.dumps([_dump(item) for item in records], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return version


def _skill_set(resume: ParsedResume) -> set[str]:
    values: List[str] = []
    values.extend(resume.skills.technical)
    values.extend(resume.skills.tools)
    values.extend(resume.skills.soft)
    return {str(skill).strip().lower() for skill in values if str(skill).strip()}


def _section_presence(resume: ParsedResume) -> Dict[str, bool]:
    return {
        "summary": bool(resume.summary),
        "skills": bool(resume.skills.technical or resume.skills.tools or resume.skills.soft),
        "experience": bool(resume.experience),
        "education": bool(resume.education),
        "projects": bool(resume.projects),
        "certifications": bool(resume.certifications),
        "linkedin": bool(resume.linkedin),
        "github": bool(resume.github),
        "portfolio": bool(resume.portfolio),
    }


def compare_resume_versions(
    old_resume: ParsedResume,
    new_resume: ParsedResume,
    *,
    old_version_id: Optional[str] = None,
    new_version_id: Optional[str] = None,
    old_score_summary: Optional[Dict[str, Any]] = None,
    new_score_summary: Optional[Dict[str, Any]] = None,
) -> ResumeVersionDiff:
    old_skills = _skill_set(old_resume)
    new_skills = _skill_set(new_resume)
    added_skills = sorted(new_skills - old_skills)
    removed_skills = sorted(old_skills - new_skills)

    old_presence = _section_presence(old_resume)
    new_presence = _section_presence(new_resume)
    changed_sections = [key for key in new_presence if old_presence.get(key) != new_presence.get(key)]

    if len(new_resume.experience) != len(old_resume.experience):
        changed_sections.append("experience_entries")
    if len(new_resume.projects) != len(old_resume.projects):
        changed_sections.append("project_entries")
    if len(new_resume.certifications) != len(old_resume.certifications):
        changed_sections.append("certification_entries")

    changed_sections = sorted(set(changed_sections))

    old_quality = float((old_score_summary or {}).get("resume_quality_score") or 0.0)
    new_quality = float((new_score_summary or {}).get("resume_quality_score") or 0.0)
    score_delta = round(new_quality - old_quality, 2)

    improvement_highlights: List[str] = []
    if score_delta > 0:
        improvement_highlights.append(f"Resume quality improved by {score_delta:.2f} points.")
    elif score_delta < 0:
        improvement_highlights.append(f"Resume quality decreased by {abs(score_delta):.2f} points.")
    if added_skills:
        improvement_highlights.append(f"Added skills: {', '.join(added_skills[:8])}.")
    if new_presence.get("linkedin") and not old_presence.get("linkedin"):
        improvement_highlights.append("Added LinkedIn profile visibility.")
    if new_presence.get("github") and not old_presence.get("github"):
        improvement_highlights.append("Added GitHub or code portfolio visibility.")
    if new_presence.get("portfolio") and not old_presence.get("portfolio"):
        improvement_highlights.append("Added portfolio or website visibility.")
    if len(new_resume.projects) > len(old_resume.projects):
        improvement_highlights.append("Expanded project evidence in the resume.")
    if len(new_resume.certifications) > len(old_resume.certifications):
        improvement_highlights.append("Added certification evidence.")
    if not improvement_highlights:
        improvement_highlights.append(
            "Resume content changed, but the biggest ATS gains may still depend on clearer achievements and stronger evidence."
        )

    interview_probe_points: List[str] = []
    for skill in added_skills[:3]:
        interview_probe_points.append(f"Ask for a concrete example showing the newly added skill: {skill}.")
    if len(new_resume.projects) > len(old_resume.projects):
        interview_probe_points.append("Ask which newly added project best reflects current job readiness.")
    if len(new_resume.certifications) > len(old_resume.certifications):
        interview_probe_points.append("Verify practical use of the newly added certification or training.")
    if score_delta >= 8:
        interview_probe_points.append("Ask the candidate which exact improvements they made and why those changes matter.")

    return ResumeVersionDiff(
        from_version_id=old_version_id,
        to_version_id=new_version_id,
        score_delta=score_delta,
        added_skills=added_skills,
        removed_skills=removed_skills,
        changed_sections=changed_sections,
        improvement_highlights=improvement_highlights,
        interview_probe_points=interview_probe_points,
    )


def get_latest_resume_version(profile_id: str) -> Optional[ResumeVersionRecord]:
    records = _load_records(profile_id)
    return records[-1] if records else None


def find_profile_id_by_email(email: Optional[str]) -> Optional[str]:
    target = _normalize_email(email)
    if not target:
        return None
    root = _ensure_root()
    for path in sorted(root.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for item in reversed(data):
            parsed = item.get("parsed_resume") or {}
            current_email = _normalize_email(parsed.get("email"))
            if current_email == target:
                return str(item.get("profile_id") or path.stem)
    return None


def get_resume_history_snapshot(profile_id: Optional[str], limit: int = 3) -> Optional[Dict[str, Any]]:
    if not profile_id:
        return None
    records = _load_records(profile_id)
    if not records:
        return None

    latest = records[-1]
    previous = records[-2] if len(records) >= 2 else None
    diff: Optional[ResumeVersionDiff] = None
    if previous is not None:
        diff = compare_resume_versions(
            previous.parsed_resume,
            latest.parsed_resume,
            old_version_id=previous.version_id,
            new_version_id=latest.version_id,
            old_score_summary=previous.score_summary,
            new_score_summary=latest.score_summary,
        )

    recent_versions = []
    for item in records[-limit:]:
        recent_versions.append(
            {
                "version_id": item.version_id,
                "version_number": item.version_number,
                "source_type": item.source_type,
                "label": item.label,
                "created_at": item.created_at,
                "resume_quality_score": item.resume_quality_score,
            }
        )

    latest_score = float(latest.resume_quality_score or latest.score_summary.get("resume_quality_score") or 0.0)
    previous_score = 0.0
    if previous is not None:
        previous_score = float(previous.resume_quality_score or previous.score_summary.get("resume_quality_score") or 0.0)

    return {
        "profile_id": profile_id,
        "matched_email": latest.parsed_resume.email,
        "version_count": len(records),
        "latest_version_id": latest.version_id,
        "latest_version_number": latest.version_number,
        "latest_resume_quality_score": latest_score,
        "previous_resume_quality_score": previous_score,
        "score_delta_from_previous": round(latest_score - previous_score, 2) if previous is not None else latest_score,
        "latest_label": latest.label,
        "recent_versions": recent_versions,
        "recent_improvement_highlights": diff.improvement_highlights if diff is not None else [],
        "recent_interview_probe_points": diff.interview_probe_points if diff is not None else [],
        "recent_changed_sections": diff.changed_sections if diff is not None else [],
        "recent_added_skills": diff.added_skills if diff is not None else [],
    }

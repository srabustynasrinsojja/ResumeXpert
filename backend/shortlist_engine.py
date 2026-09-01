from __future__ import annotations

import json
import math
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import uuid4

from .ats_score_engine import score_resume_against_job
from .helpers import model_dump_compat as _model_dump_compat
from .parser_bridge import derive_parser_mode, parse_job_source, parse_resume_source, resume_bundle_to_profile
from .resume_feedback_engine import generate_internal_feedback
from .resume_version_engine import find_profile_id_by_email, get_resume_history_snapshot

ALLOWED_RESUME_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _safe_name(filename: str) -> str:
    return Path(filename or "resume").name


def parse_profile_hints(profile_hints_json: Optional[str]) -> Dict[str, str]:
    if not profile_hints_json:
        return {}
    try:
        parsed = json.loads(profile_hints_json)
    except Exception:
        return {}
    if not isinstance(parsed, dict):
        return {}
    normalized: Dict[str, str] = {}
    for key, value in parsed.items():
        if not key or not value:
            continue
        normalized[_safe_name(str(key)).lower()] = str(value)
    return normalized


def _breakdown_score(result: Any, key: str) -> float:
    mapping = getattr(result, "match_breakdown", None) or {}
    component = mapping.get(key)
    if component is None:
        component = getattr(result, "breakdown", {}).get(key)
    return float(component.score) if component is not None else 0.0


def _required_skill_coverage(result: Any) -> float:
    total = len(getattr(result, "matched_required_skills", [])) + len(getattr(result, "missing_required_skills", []))
    if total <= 0:
        return 1.0
    return len(getattr(result, "matched_required_skills", [])) / total


def _hard_filter_status(result: Any) -> str:
    coverage = _required_skill_coverage(result)
    missing_required = len(getattr(result, "missing_required_skills", []))
    experience_score = _breakdown_score(result, "experience")
    education_score = _breakdown_score(result, "education")

    if missing_required >= 4:
        return "fail"
    if coverage < 0.35 and getattr(result, "job_match_score", 0.0) < 55:
        return "fail"
    if coverage < 0.50 or experience_score < 35:
        return "review"
    if education_score < 25 and coverage < 0.70:
        return "review"
    return "pass"


def _final_decision_bucket(result: Any, recruiter_feedback: Any, hard_filter_status: str) -> str:
    bucket = getattr(recruiter_feedback, "decision_bucket", "review")
    if hard_filter_status == "fail":
        return "reject"
    if hard_filter_status == "review" and bucket == "shortlist":
        return "review"
    return bucket


def _bucket_rank(bucket: str) -> int:
    return {"shortlist": 0, "review": 1, "reject": 2}.get(bucket, 3)


def _candidate_name(profile: Any, fallback_filename: str) -> str:
    data = _model_dump_compat(profile)
    return str(data.get("candidate_name") or data.get("headline") or Path(fallback_filename).stem)


def _history_context(profile: Any, explicit_profile_id: Optional[str]) -> Tuple[Optional[str], Optional[Dict[str, Any]], str]:
    data = _model_dump_compat(profile)
    matched_by = "none"
    profile_id = explicit_profile_id
    if profile_id:
        matched_by = "profile_id"
    else:
        email = data.get("email")
        profile_id = find_profile_id_by_email(email)
        if profile_id:
            matched_by = "email"
    snapshot = get_resume_history_snapshot(profile_id) if profile_id else None
    return profile_id, snapshot, matched_by


def screen_single_resume(
    *,
    file_path: str,
    filename: str,
    job_bundle: Dict[str, Any],
    prefer_gemini: bool = True,
    explicit_profile_id: Optional[str] = None,
) -> Dict[str, Any]:
    resume_bundle = parse_resume_source(file_path=file_path, prefer_gemini=prefer_gemini)
    profile = resume_bundle_to_profile(resume_bundle)
    parser_mode = derive_parser_mode(resume_bundle["source"], job_bundle["source"])

    result = score_resume_against_job(
        parsed_resume=profile,
        parsed_job=job_bundle["parsed"],
        resume_raw_text=resume_bundle["text"],
        job_raw_text=job_bundle["text"],
        parser_mode=parser_mode,
        parser_sources={
            "resume": resume_bundle["source"],
            "job": job_bundle["source"],
        },
    )

    recruiter_feedback = generate_internal_feedback(profile, job_bundle["parsed"], result)
    hard_filter_status = _hard_filter_status(result)
    final_bucket = _final_decision_bucket(result, recruiter_feedback, hard_filter_status)

    profile_id, history_snapshot, matched_by = _history_context(profile, explicit_profile_id)
    interview_probe_points = list(getattr(recruiter_feedback, "interview_probe_points", []))
    if history_snapshot:
        for item in history_snapshot.get("recent_interview_probe_points", []):
            if item not in interview_probe_points:
                interview_probe_points.append(item)

    # Pull confidence + needs_review from the result so the dashboard can show them
    # without diving into nested feature_values.
    confidence = float(getattr(result, "confidence", 0.0))
    needs_review = bool(getattr(result, "needs_review", False))
    ranking_score = float(getattr(result, "ranking_score", 0.0))
    match_label = str(getattr(result, "match_label", "moderate_match"))
    class_probabilities = dict(getattr(result, "class_probabilities", {}))

    screening_record = {
        "candidate_name": _candidate_name(profile, filename),
        "filename": _safe_name(filename),
        "profile_id": profile_id,
        "profile_matched_by": matched_by,
        "parsed_resume": _model_dump_compat(profile),
        "score_summary": _model_dump_compat(result.score_summary),
        "result": _model_dump_compat(result),
        # ── NEW: flat HR fields the frontend can read directly ──────────────
        "ranking_score": round(ranking_score, 2),
        "confidence": round(confidence, 4),
        "needs_review": needs_review,
        "match_label": match_label,
        "class_probabilities": class_probabilities,
        # ───────────────────────────────────────────────────────────────────
        "recruiter_feedback": {
            **_model_dump_compat(recruiter_feedback),
            "decision_bucket": final_bucket,
            "interview_probe_points": interview_probe_points,
        },
        "hard_filter_status": hard_filter_status,
        "required_skill_coverage": round(_required_skill_coverage(result), 4),
        "history_snapshot": history_snapshot,
        "parser_info": {
            "resume_parser_source": resume_bundle["source"],
            "job_parser_source": job_bundle["source"],
            "warnings": resume_bundle["warnings"] + job_bundle["warnings"],
        },
    }
    return screening_record


def _sort_candidates(candidates: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Sort priority:
    #   1. decision bucket (shortlist > review > reject)
    #   2. combined_score (higher = better)
    #   3. ranking_score (model-based tie-breaker)
    #   4. confidence (more certain = better)
    #   5. name (stable alphabetical)
    return sorted(
        candidates,
        key=lambda item: (
            _bucket_rank(item["recruiter_feedback"].get("decision_bucket", "review")),
            -float(item.get("score_summary", {}).get("combined_score", 0.0)),
            -float(item.get("ranking_score", item.get("score_summary", {}).get("ranking_score", 0.0))),
            -float(item.get("confidence", 0.0)),
            item.get("candidate_name", "").lower(),
        ),
    )


def _top_missing_skills(candidates: Sequence[Dict[str, Any]], limit: int = 8) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = {}
    for item in candidates:
        for skill in item.get("result", {}).get("missing_required_skills", []):
            counts[skill] = counts.get(skill, 0) + 1
    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]
    return [{"skill": skill, "count": count} for skill, count in ranked]


def build_screening_summary(candidates: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    shortlist = sum(1 for item in candidates if item["recruiter_feedback"].get("decision_bucket") == "shortlist")
    review = sum(1 for item in candidates if item["recruiter_feedback"].get("decision_bucket") == "review")
    reject = sum(1 for item in candidates if item["recruiter_feedback"].get("decision_bucket") == "reject")
    needs_review_count = sum(1 for item in candidates if item.get("needs_review"))
    avg_combined = 0.0
    avg_confidence = 0.0
    if candidates:
        avg_combined = round(
            sum(float(item.get("score_summary", {}).get("combined_score", 0.0)) for item in candidates) / len(candidates),
            2,
        )
        avg_confidence = round(
            sum(float(item.get("confidence", 0.0)) for item in candidates) / len(candidates),
            4,
        )
    return {
        "total_candidates": len(candidates),
        "shortlist_count": shortlist,
        "review_count": review,
        "reject_count": reject,
        "needs_review_count": needs_review_count,
        "average_combined_score": avg_combined,
        "average_confidence": avg_confidence,
        "top_missing_required_skills": _top_missing_skills(candidates),
        "top_candidates": [
            {
                "candidate_name": item.get("candidate_name"),
                "filename": item.get("filename"),
                "combined_score": item.get("score_summary", {}).get("combined_score", 0.0),
                "decision_bucket": item.get("recruiter_feedback", {}).get("decision_bucket"),
            }
            for item in candidates[:5]
        ],
    }


def _extract_zip_entries(zip_path: str, workdir: str) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    extracted: List[Dict[str, str]] = []
    skipped: List[Dict[str, str]] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            filename = _safe_name(member.filename)
            suffix = Path(filename).suffix.lower()
            if suffix not in ALLOWED_RESUME_EXTENSIONS:
                skipped.append({"filename": filename, "reason": f"Unsupported extension: {suffix}"})
                continue
            target_path = Path(workdir) / f"{uuid4().hex[:8]}_{filename}"
            with zf.open(member, "r") as src, open(target_path, "wb") as dst:
                dst.write(src.read())
            extracted.append({"filename": filename, "path": str(target_path)})
    return extracted, skipped


def screen_resume_paths(
    *,
    file_items: Sequence[Dict[str, str]],
    job_text: str,
    prefer_gemini: bool = True,
    profile_hints: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    profile_hints = profile_hints or {}
    job_bundle = parse_job_source(job_text, prefer_gemini=prefer_gemini)

    candidates: List[Dict[str, Any]] = []
    skipped: List[Dict[str, str]] = []
    for item in file_items:
        filename = _safe_name(item.get("filename", "resume"))
        file_path = item.get("path", "")
        explicit_profile_id = profile_hints.get(filename.lower())
        try:
            candidate = screen_single_resume(
                file_path=file_path,
                filename=filename,
                job_bundle=job_bundle,
                prefer_gemini=prefer_gemini,
                explicit_profile_id=explicit_profile_id,
            )
            candidates.append(candidate)
        except Exception as exc:
            skipped.append({"filename": filename, "reason": str(exc)})

    ranked = _sort_candidates(candidates)
    for idx, item in enumerate(ranked, start=1):
        item["rank"] = idx

    return {
        "session_id": f"screen_{uuid4().hex[:12]}",
        "parsed_job": _model_dump_compat(job_bundle["parsed"]),
        "job_parser_info": {
            "job_parser_source": job_bundle["source"],
            "warnings": job_bundle["warnings"],
        },
        "summary": build_screening_summary(ranked),
        "candidates": ranked,
        "skipped_files": skipped,
    }


def screen_zip_archive(
    *,
    zip_path: str,
    job_text: str,
    prefer_gemini: bool = True,
    profile_hints: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="ats_zip_screen_") as tmpdir:
        file_items, skipped = _extract_zip_entries(zip_path, tmpdir)
        result = screen_resume_paths(
            file_items=file_items,
            job_text=job_text,
            prefer_gemini=prefer_gemini,
            profile_hints=profile_hints,
        )
        result["skipped_files"] = skipped + result.get("skipped_files", [])
        return result

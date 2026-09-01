from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from utils.feature_engineering import (
    build_pair_features,
    clipped_similarity,
    contains_phrase,
    keyword_overlap_score,
    match_job_skills_in_resume,
    normalize_text,
    tokenize_words,
)

from .model_loader import (
    compute_embedding_similarity,
    compute_tfidf_similarity,
    ensure_feature_order,
    load_runtime_assets,
    predict_probabilities,
)
from .helpers import model_dump_compat as _model_dump_like, flatten_text as _flatten_text
from .result_models import ATSScoreResult, ScoreComponent, ScoreSummary

LABEL_FALLBACK = {0: "poor_match", 1: "moderate_match", 2: "strong_match"}
ACTION_VERBS = {
    "led",
    "built",
    "created",
    "developed",
    "designed",
    "implemented",
    "improved",
    "optimized",
    "managed",
    "delivered",
    "launched",
    "increased",
    "reduced",
    "analyzed",
    "automated",
    "collaborated",
    "architected",
    "migrated",
    "maintained",
    "deployed",
}
STANDARD_HEADINGS = {
    "summary",
    "professional summary",
    "experience",
    "work experience",
    "education",
    "skills",
    "technical skills",
    "projects",
    "certifications",
}


def _pick(data: Dict[str, Any], candidates: Sequence[str], default: Any = None) -> Any:
    for key in candidates:
        if key in data and data[key] not in (None, "", [], {}):
            return data[key]
    return default


def _dedupe_keep_order(values: Iterable[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in values:
        norm = normalize_text(value)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        result.append(norm)
    return result


def _normalize_skill_list(value: Any) -> List[str]:
    if value is None:
        return []
    items: List[str] = []
    if isinstance(value, str):
        raw = value.replace("\n", ",")
        for part in raw.replace(";", ",").split(","):
            part = normalize_text(part)
            if len(part) >= 2:
                items.append(part)
        if items:
            return _dedupe_keep_order(items)
        return _dedupe_keep_order(tokenize_words(raw)[:20])
    if isinstance(value, dict):
        for inner in value.values():
            items.extend(_normalize_skill_list(inner))
        return _dedupe_keep_order(items)
    if isinstance(value, (list, tuple, set)):
        for entry in value:
            items.extend(_normalize_skill_list(entry))
        return _dedupe_keep_order(items)
    return _normalize_skill_list(str(value))


def _extract_resume_fields(parsed_resume: Any, resume_raw_text: Optional[str]) -> Dict[str, Any]:
    data = _model_dump_like(parsed_resume)
    text = (
        resume_raw_text
        or _pick(data, ["raw_text", "text", "resume_text", "resume", "content"], "")
        or _flatten_text(data)
    )
    category = _pick(data, ["category", "domain", "target_role", "predicted_category", "role"], "")
    skills = _normalize_skill_list(
        _pick(data, ["skills", "technical_skills", "core_skills", "keyword_skills", "skill_set"], [])
    )
    education = _flatten_text(_pick(data, ["education", "education_summary", "degrees", "degree"], ""))
    experience = _flatten_text(_pick(data, ["experience", "experience_summary", "work_experience"], ""))
    projects = _flatten_text(_pick(data, ["projects", "project_summary", "key_projects", "project_experience"], ""))
    certifications = _flatten_text(_pick(data, ["certifications", "licenses", "certificates"], ""))
    summary = _flatten_text(_pick(data, ["summary", "professional_summary", "profile", "objective"], ""))
    return {
        "text": text,
        "category": category,
        "skills": skills,
        "education": education,
        "experience": experience,
        "projects": projects,
        "certifications": certifications,
        "summary": summary,
    }


def _extract_job_fields(parsed_job: Any, job_raw_text: Optional[str]) -> Dict[str, Any]:
    data = _model_dump_like(parsed_job)
    title = _pick(data, ["title", "job_title", "role", "designation", "position"], "")
    text = (
        job_raw_text
        or _pick(data, ["raw_text", "text", "job_text", "description", "job_description"], "")
        or _flatten_text(data)
    )
    qualifications = _flatten_text(
        _pick(data, ["qualifications", "education", "education_requirement", "degree_requirement"], "")
    )
    experience = _flatten_text(
        _pick(data, ["experience", "experience_required", "min_experience", "years_of_experience"], "")
    )
    responsibilities = _flatten_text(_pick(data, ["responsibilities", "duties", "tasks"], ""))

    required_skills = _normalize_skill_list(
        _pick(data, ["required_skills", "must_have_skills", "mandatory_skills", "core_skills"], [])
    )
    preferred_skills = _normalize_skill_list(
        _pick(data, ["preferred_skills", "nice_to_have_skills", "optional_skills"], [])
    )
    generic_skills = _normalize_skill_list(_pick(data, ["skills", "skill_set"], []))

    raw_lines = [line.strip() for line in str(text).splitlines() if line.strip()]
    if not title and raw_lines:
        title = raw_lines[0]

    normalized_text = normalize_text(text)
    if not required_skills:
        match = re.search(r"required skills\s*:\s*([^\n]+)", str(text), flags=re.IGNORECASE)
        if match:
            required_skills = _normalize_skill_list(match.group(1))
    if not preferred_skills:
        match = re.search(r"preferred skills\s*:\s*([^\n]+)", str(text), flags=re.IGNORECASE)
        if match:
            preferred_skills = _normalize_skill_list(match.group(1))
    if not qualifications:
        match = re.search(r"education\s*:\s*([^\n]+)", str(text), flags=re.IGNORECASE)
        if match:
            qualifications = match.group(1).strip()
    if not experience:
        match = re.search(r"experience\s*:\s*([^\n]+)", str(text), flags=re.IGNORECASE)
        if match:
            experience = match.group(1).strip()
        else:
            match = re.search(r"(\d+\+?\s*years?)", normalized_text)
            if match:
                experience = match.group(1)
    if not responsibilities:
        match = re.search(r"responsibilities\s*:\s*([^\n]+)", str(text), flags=re.IGNORECASE)
        if match:
            responsibilities = match.group(1).strip()

    if not required_skills and generic_skills:
        required_skills = generic_skills
    if not title and text:
        title = " ".join(tokenize_words(text)[:4])

    return {
        "title": title,
        "text": text,
        "qualifications": qualifications,
        "experience": experience,
        "responsibilities": responsibilities,
        "required_skills": _dedupe_keep_order(required_skills),
        "preferred_skills": _dedupe_keep_order(preferred_skills),
        "all_skills": _dedupe_keep_order(required_skills + preferred_skills + generic_skills),
    }


def _extract_job_keywords(
    job_title: str,
    job_text: str,
    required_skills: Sequence[str],
    preferred_skills: Sequence[str],
) -> List[str]:
    keywords: List[str] = []
    keywords.extend(list(required_skills)[:10])
    keywords.extend(list(preferred_skills)[:8])
    keywords.extend(tokenize_words(job_title))
    keywords.extend(tokenize_words(job_text)[:25])
    filtered = [keyword for keyword in keywords if len(keyword) >= 2]
    return _dedupe_keep_order(filtered)[:24]


def _component_score(raw_value: float) -> float:
    return round(100.0 * clipped_similarity(raw_value), 2)


def _project_relevance_score(resume_projects: str, resume_text: str, job_text: str) -> float:
    base_text = resume_projects or resume_text
    return clipped_similarity(keyword_overlap_score(base_text, job_text))


def _certification_relevance_score(certifications: str, job_text: str) -> float:
    if not certifications:
        return 0.0
    return clipped_similarity(keyword_overlap_score(certifications, job_text))


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def _compute_resume_quality_score(
    resume_info: Dict[str, Any],
    features_for_model: Dict[str, float],
) -> Tuple[float, Dict[str, ScoreComponent], List[str]]:
    text = resume_info.get("text", "") or ""
    normalized = normalize_text(text)
    words = normalized.split()
    word_count = len(words)
    lines = [line.strip() for line in str(text).splitlines() if line.strip()]
    lower_lines = [normalize_text(line) for line in lines]

    email_present = bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", str(text), flags=re.IGNORECASE))
    phone_present = bool(re.search(r"(?:\+?\d[\d\-\s()]{7,}\d)", str(text)))
    linkedin_present = "linkedin" in normalized
    portfolio_present = any(token in normalized for token in ["github", "portfolio", "behance", "dribbble", "gitlab"])
    contact_score_raw = (
        0.35 * float(email_present)
        + 0.35 * float(phone_present)
        + 0.15 * float(linkedin_present)
        + 0.15 * float(portfolio_present)
    )

    skills_present = bool(resume_info.get("skills"))
    experience_present = bool(resume_info.get("experience"))
    education_present = bool(resume_info.get("education"))
    projects_present = bool(resume_info.get("projects"))
    certifications_present = bool(resume_info.get("certifications"))
    summary_present = bool(resume_info.get("summary"))
    explicit_heading_hits = sum(1 for heading in STANDARD_HEADINGS if any(heading == line for line in lower_lines))
    section_score_raw = (
        0.20 * float(skills_present)
        + 0.25 * float(experience_present)
        + 0.20 * float(education_present)
        + 0.10 * float(projects_present)
        + 0.05 * float(certifications_present)
        + 0.10 * float(summary_present)
        + 0.10 * clipped_similarity(explicit_heading_hits / max(len(STANDARD_HEADINGS), 1) * 2.0)
    )

    bullets = [line for line in lines if line.startswith(("-", "•", "*")) or re.match(r"^\d+[.)]", line)]
    bullet_count = len(bullets)
    bullet_score_raw = clipped_similarity(_safe_ratio(bullet_count, max(6, bullet_count)))
    quantified_lines = [line for line in lines if re.search(r"\d|%|\$|kpi|roi|revenue|growth|reduced|increased", line, flags=re.IGNORECASE)]
    quantified_ratio = _safe_ratio(len(quantified_lines), max(len(bullets) or len(lines), 1))
    action_verb_hits = 0
    for line in bullets[:20]:
        first = normalize_text(line.lstrip("-*•0123456789.) ")).split(" ")
        if first and first[0] in ACTION_VERBS:
            action_verb_hits += 1
    action_verb_ratio = _safe_ratio(action_verb_hits, max(len(bullets), 1)) if bullets else 0.0
    achievement_score_raw = clipped_similarity(0.55 * quantified_ratio + 0.25 * action_verb_ratio + 0.20 * bullet_score_raw)

    if word_count == 0:
        readability_raw = 0.0
    elif word_count < 150:
        readability_raw = 0.45
    elif word_count <= 900:
        readability_raw = 0.95
    elif word_count <= 1200:
        readability_raw = 0.75
    else:
        readability_raw = 0.55
    dense_paragraph_penalty = 0.0
    if lines:
        long_lines = sum(1 for line in lines if len(line.split()) >= 35)
        dense_paragraph_penalty = _safe_ratio(long_lines, len(lines))
    readability_raw = clipped_similarity(readability_raw - 0.20 * dense_paragraph_penalty)

    unique_skills = len(resume_info.get("skills", []))
    skills_clarity_raw = clipped_similarity(0.65 * _safe_ratio(unique_skills, 12.0) + 0.35 * float(skills_present))

    quality_raw = (
        0.18 * contact_score_raw
        + 0.24 * section_score_raw
        + 0.22 * achievement_score_raw
        + 0.18 * readability_raw
        + 0.10 * skills_clarity_raw
        + 0.08 * float(features_for_model.get("resume_word_count", 0) > 120)
    )
    resume_quality_score = round(100.0 * clipped_similarity(quality_raw), 2)

    missing_sections: List[str] = []
    if not skills_present:
        missing_sections.append("skills")
    if not experience_present:
        missing_sections.append("experience")
    if not education_present:
        missing_sections.append("education")
    if not summary_present:
        missing_sections.append("summary")

    quality_breakdown = {
        "contact": ScoreComponent(
            score=round(100.0 * clipped_similarity(contact_score_raw), 2),
            summary="Availability of core contact information and professional links.",
            evidence=[
                f"Email present: {email_present}",
                f"Phone present: {phone_present}",
                f"LinkedIn present: {linkedin_present}",
                f"Portfolio/GitHub present: {portfolio_present}",
            ],
            raw_value=contact_score_raw,
        ),
        "sections": ScoreComponent(
            score=round(100.0 * clipped_similarity(section_score_raw), 2),
            summary="Presence of ATS-friendly core resume sections.",
            evidence=[
                f"Skills section detected: {skills_present}",
                f"Experience section detected: {experience_present}",
                f"Education section detected: {education_present}",
                f"Projects section detected: {projects_present}",
                f"Summary section detected: {summary_present}",
            ],
            raw_value=section_score_raw,
        ),
        "achievements": ScoreComponent(
            score=round(100.0 * clipped_similarity(achievement_score_raw), 2),
            summary="Quality of bullets, quantified impact, and action-oriented writing.",
            evidence=[
                f"Bullet count: {bullet_count}",
                f"Quantified lines: {len(quantified_lines)}",
                f"Action-verb bullet ratio: {action_verb_ratio:.3f}",
            ],
            raw_value=achievement_score_raw,
        ),
        "readability": ScoreComponent(
            score=round(100.0 * clipped_similarity(readability_raw), 2),
            summary="Resume length and line density suited for ATS readability.",
            evidence=[
                f"Word count: {word_count}",
                f"Dense line ratio: {dense_paragraph_penalty:.3f}",
            ],
            raw_value=readability_raw,
        ),
        "skills_clarity": ScoreComponent(
            score=round(100.0 * clipped_similarity(skills_clarity_raw), 2),
            summary="Clarity and explicitness of the skills inventory.",
            evidence=[f"Unique parsed skills: {unique_skills}"],
            raw_value=skills_clarity_raw,
        ),
    }

    notes = []
    if missing_sections:
        notes.append(f"Missing or weak sections detected: {', '.join(missing_sections)}")
    if not email_present or not phone_present:
        notes.append("Core contact information appears incomplete.")
    if bullet_count < 4:
        notes.append("Resume has few explicit bullet points; ATS and recruiter readability may suffer.")
    return resume_quality_score, quality_breakdown, notes


def _compute_job_match_score(
    *,
    assets: Dict[str, Any],
    parser_mode: str,
    parser_sources: Optional[Dict[str, str]],
    resume_info: Dict[str, Any],
    job_info: Dict[str, Any],
    features_for_model: Dict[str, float],
    embedding_similarity: float,
    tfidf_similarity: float,
    matched_required: List[str],
    missing_required: List[str],
    matched_preferred: List[str],
    missing_preferred: List[str],
    matched_keywords: List[str],
    missing_keywords: List[str],
    required_skills: Sequence[str],
    preferred_skills: Sequence[str],
    probs: Sequence[float],
) -> Tuple[
    float,
    float,
    float,
    float,
    str,
    Dict[str, ScoreComponent],
    List[str],
    Dict[str, float],
]:
    label_map = assets.get("label_map") or LABEL_FALLBACK
    prob_values = list(probs) if probs is not None else []
    pred_idx = int(max(range(len(prob_values)), key=lambda i: prob_values[i])) if len(prob_values) > 0 else 1
    match_label = label_map.get(pred_idx, LABEL_FALLBACK.get(pred_idx, "moderate_match"))

    prob_poor = float(prob_values[0]) if len(prob_values) > 0 else 0.0
    prob_moderate = float(prob_values[1]) if len(prob_values) > 1 else 0.0
    prob_strong = float(prob_values[2]) if len(prob_values) > 2 else 0.0

    # NEW: model confidence = highest class probability
    # NEW: needs_review = True when confidence is low (HR should manually review)
    confidence = round(max(prob_poor, prob_moderate, prob_strong), 4)
    needs_review = bool(confidence < 0.60)

    ml_score = round(100.0 * prob_strong, 2)
    model_ranking_score = round(100.0 * (0.70 * prob_strong + 0.30 * prob_moderate), 2)

    required_coverage = float(features_for_model.get("required_skill_coverage", 0.0))
    preferred_coverage = float(features_for_model.get("preferred_skill_coverage", 0.0))
    missing_required_ratio = float(features_for_model.get("missing_required_skill_ratio", 0.0))
    semantic_blend = clipped_similarity(0.55 * embedding_similarity + 0.45 * tfidf_similarity)
    project_relevance = float(features_for_model.get("project_relevance_score", 0.0))
    certification_relevance = float(features_for_model.get("certification_relevance_score", 0.0))
    experience_score = float(features_for_model.get("experience_match_score", 0.0))
    education_score = float(features_for_model.get("education_match_score", 0.0))

    legacy_raw = (
        0.35 * required_coverage
        + 0.15 * preferred_coverage
        + 0.15 * experience_score
        + 0.10 * education_score
        + 0.10 * project_relevance
        + 0.10 * semantic_blend
        + 0.05 * certification_relevance
        - 0.08 * missing_required_ratio
    )
    legacy_ats_score = round(100.0 * clipped_similarity(legacy_raw), 2)

    if parser_mode == "parser_enhanced_gemini":
        legacy_weight = 0.40
    elif parser_mode == "parser_enhanced_local_fallback":
        legacy_weight = 0.35
    else:
        legacy_weight = 0.25
    ml_weight = 1.0 - legacy_weight
    job_match_score = round(legacy_weight * legacy_ats_score + ml_weight * ml_score, 2)

    skills_component = round(
        100.0 * (0.60 * required_coverage + 0.20 * preferred_coverage + 0.20 * (1.0 - missing_required_ratio)),
        2,
    )
    experience_component = _component_score(experience_score)
    education_component = _component_score(education_score)
    keyword_component = round(
        100.0
        * clipped_similarity(
            0.70 * float(features_for_model.get("keyword_overlap", 0.0))
            + 0.30 * float(features_for_model.get("title_match_score", 0.0))
        ),
        2,
    )
    semantic_component = round(100.0 * semantic_blend, 2)
    projects_component = round(100.0 * clipped_similarity(0.75 * project_relevance + 0.25 * certification_relevance), 2)

    breakdown = {
        "skills": ScoreComponent(
            score=skills_component,
            summary="Required and preferred skill coverage derived from parsed fields plus resume text evidence.",
            evidence=matched_required[:8] + ([f"Missing: {', '.join(missing_required[:5])}"] if missing_required else []),
            raw_value=required_coverage,
        ),
        "experience": ScoreComponent(
            score=experience_component,
            summary="Experience alignment derived from parsed experience fields and heuristic year extraction.",
            evidence=[
                f"Resume years detected: {int(features_for_model.get('resume_years_detected', 0))}",
                f"Minimum required years: {int(features_for_model.get('job_min_years', 0))}",
            ],
            raw_value=experience_score,
        ),
        "education": ScoreComponent(
            score=education_component,
            summary="Education alignment derived from parsed education fields and job qualifications.",
            evidence=[
                f"Resume education rank: {int(features_for_model.get('resume_education_rank', 0))}",
                f"Job education rank: {int(features_for_model.get('job_education_rank', 0))}",
            ],
            raw_value=education_score,
        ),
        "keywords": ScoreComponent(
            score=keyword_component,
            summary="Keyword overlap between resume, job title, and job description.",
            evidence=matched_keywords[:10],
            raw_value=float(features_for_model.get("keyword_overlap", 0.0)),
        ),
        "semantic": ScoreComponent(
            score=semantic_component,
            summary="Hybrid semantic similarity using embedding-style and TF-IDF similarity.",
            evidence=[
                f"Embedding similarity: {embedding_similarity:.3f}",
                f"TF-IDF similarity: {tfidf_similarity:.3f}",
            ],
            raw_value=semantic_blend,
        ),
        "projects": ScoreComponent(
            score=projects_component,
            summary="Project and certification relevance against the role description.",
            evidence=[
                f"Project relevance: {project_relevance:.3f}",
                f"Certification relevance: {certification_relevance:.3f}",
            ],
            raw_value=clipped_similarity(0.75 * project_relevance + 0.25 * certification_relevance),
        ),
    }

    note_lines = [
        f"Model used: {assets['model_name']}",
        f"Parser mode: {parser_mode}",
        f"Legacy job-match score: {legacy_ats_score:.2f}",
        f"ML strong-match score: {ml_score:.2f}",
        f"Model ranking score: {model_ranking_score:.2f}",
        f"Hybrid weight split -> legacy: {legacy_weight:.2f}, ml: {ml_weight:.2f}",
    ]
    if parser_sources:
        note_lines.append(f"Resume parser source: {parser_sources.get('resume', 'unknown')}")
        note_lines.append(f"Job parser source: {parser_sources.get('job', 'unknown')}")
    if missing_required:
        note_lines.append("Critical missing required skills may reduce recruiter confidence.")
    if not required_skills:
        note_lines.append(
            "Parsed job did not expose explicit required skills, so semantic and lexical evidence carried more weight."
        )

    class_probabilities = {
        "poor_match": round(prob_poor, 6),
        "moderate_match": round(prob_moderate, 6),
        "strong_match": round(prob_strong, 6),
    }

    return (
        legacy_ats_score,
        ml_score,
        job_match_score,
        model_ranking_score,
        match_label,
        breakdown,
        note_lines,
        class_probabilities,
        confidence,
        needs_review,
    )


def _compute_combined_score(resume_quality_score: float, job_match_score: float) -> float:
    return round(0.45 * resume_quality_score + 0.55 * job_match_score, 2)


# Backward-compatible main entry point.
def score_resume_against_job(
    parsed_resume: Any,
    parsed_job: Any,
    resume_raw_text: Optional[str] = None,
    job_raw_text: Optional[str] = None,
    parser_mode: str = "local_fallback",
    parser_sources: Optional[Dict[str, str]] = None,
) -> ATSScoreResult:
    assets = load_runtime_assets()

    resume_info = _extract_resume_fields(parsed_resume, resume_raw_text)
    job_info = _extract_job_fields(parsed_job, job_raw_text)

    resume_text = resume_info["text"]
    job_text = job_info["text"]
    required_skills = job_info["required_skills"] or job_info["all_skills"]
    preferred_skills = job_info["preferred_skills"]

    embedding_similarity = compute_embedding_similarity(resume_text, job_text)
    tfidf_similarity = compute_tfidf_similarity(resume_text, job_text)

    resume_row = {
        "category": resume_info.get("category", ""),
        "resume": resume_text,
        "clean_resume": normalize_text(resume_text),
        "resume_word_count": len(normalize_text(resume_text).split()),
    }
    job_row = {
        "title": job_info.get("title", ""),
        "job": job_text,
        "full_job": normalize_text(job_text),
        "qualifications": job_info.get("qualifications", ""),
        "experience": job_info.get("experience", ""),
        "skills": ", ".join(required_skills),
        "job_word_count": len(normalize_text(job_text).split()),
    }

    features = build_pair_features(
        resume_row=resume_row,
        job_row=job_row,
        embedding_similarity=embedding_similarity,
        tfidf_similarity=tfidf_similarity,
    )

    resume_match_text = " ".join(
        [
            resume_text,
            " ".join(resume_info.get("skills", [])),
            resume_info.get("projects", ""),
            resume_info.get("certifications", ""),
        ]
    ).strip()

    matched_required, missing_required = match_job_skills_in_resume(resume_match_text, required_skills)
    matched_preferred, missing_preferred = match_job_skills_in_resume(resume_match_text, preferred_skills)
    required_coverage = (
        len(matched_required) / len(required_skills)
        if required_skills
        else float(features.get("required_skill_coverage", 0.0))
    )
    preferred_coverage = len(matched_preferred) / len(preferred_skills) if preferred_skills else 0.0
    missing_required_ratio = (
        len(missing_required) / len(required_skills)
        if required_skills
        else float(features.get("missing_required_skill_ratio", 0.0))
    )

    job_keywords = _extract_job_keywords(job_info["title"], job_text, required_skills, preferred_skills)
    matched_keywords = [keyword for keyword in job_keywords if contains_phrase(resume_match_text, keyword)]
    missing_keywords = [keyword for keyword in job_keywords if keyword not in matched_keywords]

    features_for_model = dict(features)
    features_for_model["embedding_similarity"] = embedding_similarity
    features_for_model["tfidf_similarity"] = tfidf_similarity
    features_for_model["required_skill_coverage"] = required_coverage
    features_for_model["preferred_skill_coverage"] = preferred_coverage
    features_for_model["missing_required_skill_ratio"] = missing_required_ratio
    features_for_model["missing_required_skill_count"] = len(missing_required)

    project_relevance = _project_relevance_score(resume_info.get("projects", ""), resume_text, job_text)
    certification_relevance = _certification_relevance_score(resume_info.get("certifications", ""), job_text)
    features_for_model["project_relevance_score"] = round(project_relevance, 6)
    features_for_model["certification_relevance_score"] = round(certification_relevance, 6)

    feature_matrix = ensure_feature_order(features_for_model, assets["feature_columns"])
    probs = predict_probabilities(feature_matrix)

    resume_quality_score, quality_breakdown, quality_notes = _compute_resume_quality_score(
        resume_info=resume_info,
        features_for_model=features_for_model,
    )

    (
        legacy_ats_score,
        ml_score,
        job_match_score,
        model_ranking_score,
        match_label,
        match_breakdown,
        note_lines,
        class_probabilities,
        confidence,
        needs_review,
    ) = _compute_job_match_score(
        assets=assets,
        parser_mode=parser_mode,
        parser_sources=parser_sources,
        resume_info=resume_info,
        job_info=job_info,
        features_for_model=features_for_model,
        embedding_similarity=embedding_similarity,
        tfidf_similarity=tfidf_similarity,
        matched_required=matched_required,
        missing_required=missing_required,
        matched_preferred=matched_preferred,
        missing_preferred=missing_preferred,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
        required_skills=required_skills,
        preferred_skills=preferred_skills,
        probs=probs,
    )

    combined_score = _compute_combined_score(resume_quality_score, job_match_score)

    # Keep legacy fields for old frontend/backend references.
    final_hybrid_score = job_match_score
    ats_score = combined_score
    ranking_score = model_ranking_score

    feature_snapshot = {
        key: float(value)
        for key, value in features_for_model.items()
        if isinstance(value, (int, float))
    }
    feature_snapshot["resume_quality_score"] = round(resume_quality_score, 6)
    feature_snapshot["job_match_score"] = round(job_match_score, 6)
    feature_snapshot["combined_score"] = round(combined_score, 6)
    feature_snapshot["confidence"] = confidence
    feature_snapshot["needs_review"] = float(needs_review)

    note_lines.extend(quality_notes)
    note_lines.append(f"Resume quality score: {resume_quality_score:.2f}")
    note_lines.append(f"Job match score: {job_match_score:.2f}")
    note_lines.append(f"Combined score: {combined_score:.2f}")
    note_lines.append(f"Model confidence: {confidence:.2%}")
    if needs_review:
        note_lines.append("Low model confidence — HR review recommended for this candidate.")

    combined_breakdown = dict(match_breakdown)
    combined_breakdown.update({f"quality_{key}": value for key, value in quality_breakdown.items()})

    score_summary = ScoreSummary(
        resume_quality_score=resume_quality_score,
        job_match_score=job_match_score,
        combined_score=combined_score,
        ranking_score=ranking_score,
        legacy_ats_score=legacy_ats_score,
        ml_score=ml_score,
        model_ranking_score=model_ranking_score,
    )

    return ATSScoreResult(
        legacy_ats_score=legacy_ats_score,
        ml_score=ml_score,
        final_hybrid_score=final_hybrid_score,
        ats_score=ats_score,
        ranking_score=ranking_score,
        resume_quality_score=resume_quality_score,
        job_match_score=job_match_score,
        combined_score=combined_score,
        model_ranking_score=model_ranking_score,
        confidence=confidence,
        needs_review=needs_review,
        score_summary=score_summary,
        match_label=match_label,
        model_name=str(assets["model_name"]),
        parser_mode=parser_mode,
        parser_sources=parser_sources or {},
        class_probabilities=class_probabilities,
        matched_required_skills=matched_required,
        missing_required_skills=missing_required,
        matched_preferred_skills=matched_preferred,
        missing_preferred_skills=missing_preferred,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
        breakdown=combined_breakdown,
        quality_breakdown=quality_breakdown,
        match_breakdown=match_breakdown,
        feature_values=feature_snapshot,
        notes=note_lines,
    )



def score_resume_quality_only(
    parsed_resume: Any,
    resume_raw_text: Optional[str] = None,
    parser_mode: str = "resume_only",
    parser_sources: Optional[Dict[str, str]] = None,
) -> ATSScoreResult:
    resume_info = _extract_resume_fields(parsed_resume, resume_raw_text)
    resume_text = resume_info.get("text", "")
    features_for_model = {
        "resume_word_count": len(normalize_text(resume_text).split()),
    }

    resume_quality_score, quality_breakdown, quality_notes = _compute_resume_quality_score(
        resume_info=resume_info,
        features_for_model=features_for_model,
    )

    score_summary = ScoreSummary(
        resume_quality_score=resume_quality_score,
        job_match_score=0.0,
        combined_score=resume_quality_score,
        ranking_score=0.0,
        legacy_ats_score=0.0,
        ml_score=0.0,
        model_ranking_score=0.0,
    )

    notes = ["Resume-only scoring mode. No job description was provided."] + quality_notes

    return ATSScoreResult(
        legacy_ats_score=0.0,
        ml_score=0.0,
        final_hybrid_score=0.0,
        ats_score=resume_quality_score,
        ranking_score=0.0,
        resume_quality_score=resume_quality_score,
        job_match_score=0.0,
        combined_score=resume_quality_score,
        model_ranking_score=0.0,
        score_summary=score_summary,
        match_label="resume_only",
        model_name="resume_quality_only",
        parser_mode=parser_mode,
        parser_sources=parser_sources or {},
        class_probabilities={},
        matched_required_skills=[],
        missing_required_skills=[],
        matched_preferred_skills=[],
        missing_preferred_skills=[],
        matched_keywords=[],
        missing_keywords=[],
        breakdown={f"quality_{key}": value for key, value in quality_breakdown.items()},
        quality_breakdown=quality_breakdown,
        match_breakdown={},
        feature_values={"resume_word_count": float(features_for_model["resume_word_count"])},
        notes=notes,
    )

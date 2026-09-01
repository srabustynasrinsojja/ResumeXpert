from __future__ import annotations

import inspect
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.feature_engineering import (
    COMMON_TECH_TERMS,
    EDUCATION_RANK,
    contains_phrase,
    extract_min_experience_required,
    extract_years_of_experience_from_resume,
    normalize_text,
    tokenize_words,
)
from utils.resume_schema import (
    ParsedResume,
    ResumeCertification,
    ResumeEducation,
    ResumeExperience,
    ResumeProject,
    ResumeSkills,
)
from .helpers import model_dump_compat as _model_dump_like, flatten_text as _flatten_text


def _load_dotenv_if_available() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except Exception:
        pass


_load_dotenv_if_available()


EMAIL_REGEX = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_REGEX = re.compile(r"(?:\+?\d[\d\-\s()]{7,}\d)")
LINKEDIN_REGEX = re.compile(r"https?://(?:www\.)?linkedin\.com/[^\s]+", re.IGNORECASE)
GITHUB_REGEX = re.compile(r"https?://(?:www\.)?github\.com/[^\s]+", re.IGNORECASE)
URL_REGEX = re.compile(r"https?://[^\s]+", re.IGNORECASE)


def gemini_key_present() -> bool:
    keys = [
        os.getenv("GEMINI_API_KEY"),
        os.getenv("GOOGLE_API_KEY"),
        os.getenv("GOOGLE_GENERATIVE_AI_API_KEY"),
    ]
    return any(bool(k and str(k).strip()) for k in keys)


def _safe_import(module_name: str) -> Any:
    try:
        return __import__(module_name, fromlist=["*"])
    except Exception:
        return None


def _safe_call(func: Any, **kwargs: Any) -> Any:
    sig = inspect.signature(func)
    accepted = {}
    for name, param in sig.parameters.items():
        if name in kwargs:
            accepted[name] = kwargs[name]
        elif param.kind == inspect.Parameter.VAR_KEYWORD:
            accepted.update(kwargs)
            break
    return func(**accepted)


def _extract_skills_from_text(text: str, limit: int = 25) -> List[str]:
    norm = normalize_text(text)
    skills = [skill for skill in sorted(COMMON_TECH_TERMS) if contains_phrase(norm, skill)]
    if skills:
        return skills[:limit]
    tokens = tokenize_words(norm)
    fallback = [tok for tok in tokens if tok in COMMON_TECH_TERMS]
    seen = []
    for tok in fallback:
        if tok not in seen:
            seen.append(tok)
    return seen[:limit]


def _education_text(text: str) -> str:
    norm = normalize_text(text)
    found = [k for k in EDUCATION_RANK if k in norm]
    return ", ".join(sorted(found, key=lambda x: EDUCATION_RANK[x], reverse=True))


def _projects_text(text: str) -> str:
    lines = [line.strip() for line in str(text).splitlines() if line.strip()]
    project_lines = [ln for ln in lines if any(k in ln.lower() for k in ["project", "built", "developed", "implemented", "created"])]
    return " ".join(project_lines[:12])


def _infer_title_from_job(text: str) -> str:
    raw_lines = [line.strip() for line in str(text).splitlines() if line.strip()]
    if raw_lines:
        first = raw_lines[0]
        if len(first.split()) <= 12:
            return first
    tokens = tokenize_words(text)
    return " ".join(tokens[:5]) if tokens else "job role"


def _local_resume_parse(text: str) -> Dict[str, Any]:
    text = text or ""
    return {
        "raw_text": text,
        "skills": _extract_skills_from_text(text),
        "education": _education_text(text),
        "experience": f"{extract_years_of_experience_from_resume(text)} years" if extract_years_of_experience_from_resume(text) else "",
        "projects": _projects_text(text),
        "source": "local_structured_fallback",
    }


def _local_job_parse(job_text: str) -> Dict[str, Any]:
    job_text = job_text or ""
    skills = _extract_skills_from_text(job_text)
    return {
        "title": _infer_title_from_job(job_text),
        "raw_text": job_text,
        "required_skills": skills,
        "preferred_skills": [],
        "qualifications": _education_text(job_text),
        "experience": f"{extract_min_experience_required(job_text)} years" if extract_min_experience_required(job_text) else "",
        "responsibilities": job_text,
        "source": "local_structured_fallback",
    }


def _extract_text_with_existing_util(file_path: str) -> str:
    module = _safe_import("utils.text_extract")
    if module is not None:
        for name in ["extract_text_from_file", "extract_text", "read_text_from_file"]:
            func = getattr(module, name, None)
            if callable(func):
                try:
                    return str(_safe_call(func, file_path=file_path, path=file_path, pdf_path=file_path))
                except Exception:
                    continue
    path = Path(file_path)
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _first_nonempty(data: Dict[str, Any], keys: List[str], default: Any = None) -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, "", [], {}):
            return value
    return default


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _as_str_list(value: Any) -> List[str]:
    items: List[str] = []
    for item in _as_list(value):
        if item in (None, ""):
            continue
        if isinstance(item, str):
            text = item.strip()
            if text:
                items.append(text)
        elif isinstance(item, dict):
            flat = _flatten_text(item).strip()
            if flat:
                items.append(flat)
        else:
            text = str(item).strip()
            if text:
                items.append(text)
    seen: List[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


def _extract_first_match(pattern: re.Pattern[str], text: str) -> Optional[str]:
    match = pattern.search(text or "")
    return match.group(0).strip() if match else None


def _extract_portfolio_url(text: str) -> Optional[str]:
    for url in URL_REGEX.findall(text or ""):
        if "linkedin.com" in url.lower() or "github.com" in url.lower():
            continue
        return url.strip()
    return None


def _normalize_skills(value: Any, raw_text: str) -> ResumeSkills:
    if isinstance(value, dict):
        return ResumeSkills(
            technical=_as_str_list(value.get("technical") or value.get("technical_skills") or value.get("core")),
            tools=_as_str_list(value.get("tools") or value.get("platforms")),
            soft=_as_str_list(value.get("soft") or value.get("soft_skills")),
        )
    skill_list = _as_str_list(value)
    if not skill_list and raw_text:
        skill_list = _extract_skills_from_text(raw_text)
    return ResumeSkills(technical=skill_list)


def _normalize_education(value: Any) -> List[ResumeEducation]:
    items: List[ResumeEducation] = []
    for item in _as_list(value):
        if isinstance(item, ResumeEducation):
            items.append(item)
        elif isinstance(item, dict):
            items.append(
                ResumeEducation(
                    degree=item.get("degree") or item.get("name") or item.get("title"),
                    institution=item.get("institution") or item.get("school") or item.get("university"),
                    start_date=item.get("start_date") or item.get("from"),
                    end_date=item.get("end_date") or item.get("to"),
                    grade=item.get("grade") or item.get("cgpa") or item.get("gpa"),
                )
            )
        elif isinstance(item, str) and item.strip():
            items.append(ResumeEducation(degree=item.strip()))
    return items


def _normalize_experience(value: Any) -> List[ResumeExperience]:
    items: List[ResumeExperience] = []
    for item in _as_list(value):
        if isinstance(item, ResumeExperience):
            items.append(item)
        elif isinstance(item, dict):
            items.append(
                ResumeExperience(
                    job_title=item.get("job_title") or item.get("title") or item.get("role"),
                    company=item.get("company") or item.get("organization"),
                    start_date=item.get("start_date") or item.get("from"),
                    end_date=item.get("end_date") or item.get("to"),
                    duration_years=item.get("duration_years") or item.get("duration"),
                    responsibilities=_as_str_list(item.get("responsibilities") or item.get("achievements") or item.get("bullets")),
                    technologies=_as_str_list(item.get("technologies") or item.get("tools") or item.get("skills")),
                )
            )
        elif isinstance(item, str) and item.strip():
            items.append(ResumeExperience(responsibilities=[item.strip()]))
    return items


def _normalize_projects(value: Any) -> List[ResumeProject]:
    items: List[ResumeProject] = []
    for item in _as_list(value):
        if isinstance(item, ResumeProject):
            items.append(item)
        elif isinstance(item, dict):
            items.append(
                ResumeProject(
                    name=item.get("name") or item.get("title"),
                    description=item.get("description") or item.get("summary"),
                    technologies=_as_str_list(item.get("technologies") or item.get("tools") or item.get("skills")),
                    link=item.get("link") or item.get("url"),
                )
            )
        elif isinstance(item, str) and item.strip():
            items.append(ResumeProject(description=item.strip()))
    return items


def _normalize_certifications(value: Any) -> List[ResumeCertification]:
    items: List[ResumeCertification] = []
    for item in _as_list(value):
        if isinstance(item, ResumeCertification):
            items.append(item)
        elif isinstance(item, dict):
            items.append(
                ResumeCertification(
                    name=item.get("name") or item.get("title"),
                    issuer=item.get("issuer") or item.get("organization"),
                    date=item.get("date") or item.get("issued_at"),
                )
            )
        elif isinstance(item, str) and item.strip():
            items.append(ResumeCertification(name=item.strip()))
    return items


def normalize_parsed_resume(parsed_resume: Any, raw_text: Optional[str] = None, source: str = "unknown") -> ParsedResume:
    data = _model_dump_like(parsed_resume)
    text = raw_text or _first_nonempty(data, ["raw_text", "text", "resume_text", "content"], "") or _flatten_text(data)

    candidate_name = _first_nonempty(data, ["candidate_name", "name", "full_name"]) 
    headline = _first_nonempty(data, ["headline", "title", "role", "target_role", "category"])
    email = _first_nonempty(data, ["email", "mail"]) or _extract_first_match(EMAIL_REGEX, text)
    phone = _first_nonempty(data, ["phone", "mobile", "contact_number"]) or _extract_first_match(PHONE_REGEX, text)
    location = _first_nonempty(data, ["location", "address", "city"])
    linkedin = _first_nonempty(data, ["linkedin", "linkedin_url"]) or _extract_first_match(LINKEDIN_REGEX, text)
    github = _first_nonempty(data, ["github", "github_url"]) or _extract_first_match(GITHUB_REGEX, text)
    portfolio = _first_nonempty(data, ["portfolio", "website", "portfolio_url"]) or _extract_portfolio_url(text)
    summary = _first_nonempty(data, ["summary", "professional_summary", "objective", "profile"])

    skills_value = _first_nonempty(data, ["skills", "technical_skills", "skill_set", "core_skills"], [])
    education_value = _first_nonempty(data, ["education", "degrees", "education_summary"], [])
    experience_value = _first_nonempty(data, ["experience", "work_experience", "experience_summary"], [])
    project_value = _first_nonempty(data, ["projects", "project_summary", "key_projects"], [])
    certification_value = _first_nonempty(data, ["certifications", "licenses", "certificates"], [])

    total_exp = _first_nonempty(data, ["total_experience_years", "years_of_experience"])
    if total_exp in (None, ""):
        try:
            total_exp = float(extract_years_of_experience_from_resume(text) or 0) or None
        except Exception:
            total_exp = None

    normalized = ParsedResume(
        candidate_name=candidate_name,
        headline=headline,
        email=email,
        phone=phone,
        location=location,
        linkedin=linkedin,
        github=github,
        portfolio=portfolio,
        summary=summary,
        total_experience_years=total_exp,
        skills=_normalize_skills(skills_value, text),
        education=_normalize_education(education_value),
        experience=_normalize_experience(experience_value),
        projects=_normalize_projects(project_value),
        certifications=_normalize_certifications(certification_value),
        languages=_as_str_list(_first_nonempty(data, ["languages", "spoken_languages"], [])),
        raw_text_used=source,
    )
    return normalized


def build_resume_from_form(form_data: Dict[str, Any]) -> ParsedResume:
    form_data = dict(form_data or {})
    text = _flatten_text(form_data)
    return normalize_parsed_resume(form_data, raw_text=text, source="form_builder")


def resume_bundle_to_profile(resume_bundle: Dict[str, Any]) -> ParsedResume:
    return normalize_parsed_resume(
        resume_bundle.get("parsed"),
        raw_text=resume_bundle.get("text"),
        source=resume_bundle.get("source", "unknown"),
    )


def parse_resume_source(
    file_path: Optional[str] = None,
    raw_text: Optional[str] = None,
    prefer_gemini: bool = True,
) -> Dict[str, Any]:
    warnings: List[str] = []
    source = "raw_text_only"
    text = raw_text or ""
    if not text and file_path:
        text = _extract_text_with_existing_util(file_path)

    parsed: Optional[Any] = None
    module = _safe_import("utils.gemini_resume_parser")
    key_ok = gemini_key_present()
    used_gemini = False

    if prefer_gemini and module is not None and key_ok:
        for name in ["parse_resume_file", "parse_resume", "parse_resume_text", "extract_resume_info"]:
            func = getattr(module, name, None)
            if not callable(func):
                continue
            try:
                if file_path and "file" in name:
                    parsed = _safe_call(func, file_path=file_path, path=file_path, prefer_gemini=True)
                else:
                    parsed = _safe_call(func, text=text, resume_text=text, raw_text=text, file_path=file_path, path=file_path, prefer_gemini=True)
                if parsed is not None:
                    source = "gemini_resume_parser"
                    used_gemini = True
                    break
            except Exception as exc:
                warnings.append(f"Resume parser failed via {name}: {exc}")

    if parsed is None:
        if prefer_gemini and not key_ok:
            warnings.append("Gemini API key not found; using local structured fallback for resume.")
        if prefer_gemini and module is None:
            warnings.append("gemini_resume_parser module not importable; using local structured fallback.")
        parsed = _local_resume_parse(text)
        source = _model_dump_like(parsed).get("source", "local_structured_fallback")

    return {
        "parsed": parsed,
        "text": text,
        "source": source,
        "warnings": warnings,
        "gemini_requested": prefer_gemini,
        "gemini_key_present": key_ok,
        "used_gemini": used_gemini,
    }


def parse_job_source(job_text: str, prefer_gemini: bool = True) -> Dict[str, Any]:
    warnings: List[str] = []
    parsed: Optional[Any] = None
    source = "raw_text_only"
    module = _safe_import("utils.gemini_job_parser")
    key_ok = gemini_key_present()
    used_gemini = False

    if prefer_gemini and module is not None and key_ok:
        for name in ["parse_job_description", "parse_job", "parse_job_text", "extract_job_info"]:
            func = getattr(module, name, None)
            if not callable(func):
                continue
            try:
                parsed = _safe_call(func, job_text=job_text, text=job_text, raw_text=job_text, prefer_gemini=True)
                if parsed is not None:
                    source = "gemini_job_parser"
                    used_gemini = True
                    break
            except Exception as exc:
                warnings.append(f"Job parser failed via {name}: {exc}")

    if parsed is None:
        if prefer_gemini and not key_ok:
            warnings.append("Gemini API key not found; using local structured fallback for job.")
        if prefer_gemini and module is None:
            warnings.append("gemini_job_parser module not importable; using local structured fallback.")
        parsed = _local_job_parse(job_text)
        source = _model_dump_like(parsed).get("source", "local_structured_fallback")

    return {
        "parsed": parsed,
        "text": job_text,
        "source": source,
        "warnings": warnings,
        "gemini_requested": prefer_gemini,
        "gemini_key_present": key_ok,
        "used_gemini": used_gemini,
    }


def derive_parser_mode(resume_source: str, job_source: str) -> str:
    if "gemini" in resume_source or "gemini" in job_source:
        return "parser_enhanced_gemini"
    if "local_structured" in resume_source or "local_structured" in job_source:
        return "parser_enhanced_local_fallback"
    return "raw_text_only"

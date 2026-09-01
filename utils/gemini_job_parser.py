from __future__ import annotations

import os
import re
from typing import Iterable, Optional

from dotenv import load_dotenv
from pydantic import ValidationError

try:
    from google import genai
except Exception:  # pragma: no cover
    genai = None

try:
    from utils.job_schema import ParsedJob, JobEducationRequirement
except ImportError:
    from job_schema import ParsedJob, JobEducationRequirement


DEFAULT_MODEL = "gemini-2.5-flash"

load_dotenv()


SKILL_SYNONYMS = {
    "js": "javascript",
    "ts": "typescript",
    "node.js": "nodejs",
    "node js": "nodejs",
    "react": "reactjs",
    "react.js": "reactjs",
    "next.js": "nextjs",
    "next js": "nextjs",
    "vue.js": "vuejs",
    "vue js": "vuejs",
    "angular.js": "angular",
    "c sharp": "c#",
    "dot net": ".net",
    "asp.net": ".net",
    "postgres": "postgresql",
    "mongo": "mongodb",
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "gen ai": "generative ai",
    "llms": "llm",
    "nlp": "natural language processing",
    "powerbi": "power bi",
    "microsoft excel": "excel",
    "ms excel": "excel",
    "google cloud": "gcp",
}

COMMON_SKILLS = {
    "python", "java", "javascript", "typescript", "c++", "c#", ".net",
    "sql", "mysql", "postgresql", "mongodb", "oracle", "sqlite",
    "html", "css", "reactjs", "angular", "vuejs", "nextjs", "nodejs",
    "django", "flask", "fastapi", "spring boot", "laravel",
    "aws", "gcp", "azure", "docker", "kubernetes", "linux", "git", "jira",
    "tableau", "power bi", "excel", "figma",
    "machine learning", "deep learning", "natural language processing",
    "computer vision", "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy",
    "data analysis", "data engineering", "etl", "spark", "hadoop", "airflow",
    "rest api", "graphql", "microservices",
    "seo", "sem", "social media marketing", "content marketing", "email marketing",
    "salesforce", "hubspot", "adobe photoshop", "illustrator",
    "project management", "agile", "scrum", "communication", "leadership",
    "recruitment", "human resources", "payroll", "employee relations",
}

TOOL_SKILLS = {
    "git", "jira", "excel", "power bi", "tableau", "figma",
    "aws", "azure", "gcp", "docker", "kubernetes", "linux",
    "salesforce", "hubspot", "adobe photoshop", "illustrator",
}

DEGREE_PATTERNS = {
    "phd": [r"\bphd\b", r"doctorate", r"doctoral"],
    "master": [r"\bmaster\b", r"\bmba\b", r"\bmsc\b", r"\bms\b", r"\bm\.tech\b", r"m tech"],
    "bachelor": [r"\bbachelor\b", r"\bbsc\b", r"\bbs\b", r"\bbe\b", r"\bbtech\b", r"b tech", r"\bbca\b"],
    "associate": [r"associate"],
    "diploma": [r"diploma", r"certificate"],
    "high_school": [r"high school", r"hsc", r"ssc"],
}

FIELD_PATTERNS = {
    "computer science": [r"computer science", r"software engineering", r"information technology", r"information systems", r"data science"],
    "business administration": [r"business administration", r"business management"],
    "marketing": [r"marketing", r"digital marketing"],
    "finance": [r"finance", r"accounting"],
    "human resources": [r"human resources", r"hr management"],
}


def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not found in .env or environment variables.")
    if genai is None:
        raise ImportError("google-genai package is not installed.")
    return genai.Client(api_key=api_key)


def normalize_text(text: str) -> str:
    text = str(text or "").lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[_/\\|]", " ", text)
    text = re.sub(r"[^a-z0-9+#.\s-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def canonicalize_skill(skill: str) -> str:
    skill = normalize_text(skill)
    return SKILL_SYNONYMS.get(skill, skill)


def extract_skills(text: str) -> list[str]:
    text_norm = f" {normalize_text(text)} "
    found = set()

    for raw, canonical in SKILL_SYNONYMS.items():
        if f" {normalize_text(raw)} " in text_norm:
            found.add(canonical)

    for skill in COMMON_SKILLS:
        pattern = rf"(?<![a-z0-9]){re.escape(skill)}(?![a-z0-9])"
        if re.search(pattern, text_norm):
            found.add(skill)

    return sorted(found)


def extract_min_experience_years(text: str) -> Optional[float]:
    text_norm = normalize_text(text)
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s*(?:years|year|yrs|yr)\s+(?:of\s+)?experience",
        r"minimum\s+of\s+(\d+(?:\.\d+)?)\s*(?:years|year|yrs|yr)",
        r"at least\s+(\d+(?:\.\d+)?)\s*(?:years|year|yrs|yr)",
        r"(\d+(?:\.\d+)?)\+?\s*(?:years|year|yrs|yr)\s+in",
    ]
    years = []
    for pattern in patterns:
        for match in re.finditer(pattern, text_norm):
            try:
                years.append(float(match.group(1)))
            except Exception:
                continue
    return max(years) if years else None


def _extract_education_requirements(text: str) -> list[JobEducationRequirement]:
    text_norm = normalize_text(text)
    levels = []
    fields = []

    for level, patterns in DEGREE_PATTERNS.items():
        if any(re.search(p, text_norm) for p in patterns):
            levels.append(level)

    for field, patterns in FIELD_PATTERNS.items():
        if any(re.search(p, text_norm) for p in patterns):
            fields.append(field)

    if not levels and not fields:
        return []
    if levels and fields:
        return [JobEducationRequirement(level=levels[0], field=fields[0])]
    if levels:
        return [JobEducationRequirement(level=level, field=None) for level in levels]
    return [JobEducationRequirement(level=None, field=field) for field in fields]


def _extract_responsibilities(text: str, limit: int = 8) -> list[str]:
    pieces = re.split(r"[\n\r•;]+|\.\s+", str(text))
    cleaned = []
    for piece in pieces:
        piece = re.sub(r"\s+", " ", piece).strip(" -:")
        if len(piece.split()) >= 5:
            cleaned.append(piece)
    return cleaned[:limit]


def _top_keywords(text: str, extracted_skills: Iterable[str], limit: int = 15) -> list[str]:
    stopwords = {
        "the", "and", "for", "with", "this", "that", "you", "your", "our", "from", "into", "will",
        "are", "is", "be", "as", "of", "to", "in", "on", "or", "by", "an", "a", "at", "we",
        "role", "job", "candidate", "work", "team", "teams", "ability", "experience", "years",
        "required", "preferred", "must", "have", "using", "ensure", "responsible", "support",
    }

    tokens = re.findall(r"[a-zA-Z][a-zA-Z+#.-]{2,}", normalize_text(text))
    counts = {}
    for token in tokens:
        if token in stopwords:
            continue
        counts[token] = counts.get(token, 0) + 1

    ranked = [word for word, _ in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]
    keywords = ranked[:limit]
    for skill in extracted_skills:
        if skill not in keywords and len(keywords) < limit:
            keywords.append(skill)
    return keywords[:limit]


def build_job_prompt(job_text: str) -> str:
    return f"""
You are an ATS job description parsing engine.

Extract structured hiring requirements from the job description below.
Rules:
1. Return only schema-compliant JSON.
2. Do not invent facts.
3. Normalize skills to lowercase canonical forms where possible.
4. Put must-have items inside required_skills.
5. Put nice-to-have items inside preferred_skills.
6. Put platforms, software, and tools inside tools.
7. min_experience_years must be numeric only if reasonably inferable.
8. education_requirements.level must be one of: diploma, associate, bachelor, master, phd, high_school.
9. keywords must be concise ATS-relevant terms.
10. responsibilities must be short bullet-like statements.

Job description:
--------------------
{job_text}
--------------------
""".strip()


def basic_job_fallback(job_text: str, source_flag: str = "fallback_text") -> ParsedJob:
    lines = [line.strip() for line in str(job_text).splitlines() if line.strip()]
    title = lines[0] if lines else None
    summary = lines[1] if len(lines) > 1 else None

    all_skills = extract_skills(job_text)
    tools = sorted([skill for skill in all_skills if skill in TOOL_SKILLS])
    required_skills = [skill for skill in all_skills if skill not in tools]

    return ParsedJob(
        title=title,
        summary=summary,
        required_skills=required_skills[:20],
        preferred_skills=[],
        tools=tools[:10],
        responsibilities=_extract_responsibilities(job_text),
        keywords=_top_keywords(job_text, required_skills + tools),
        min_experience_years=extract_min_experience_years(job_text),
        education_requirements=_extract_education_requirements(job_text),
        certifications=[],
        raw_text_used=source_flag,
    )


def _dedupe_skill_list(values: Iterable[str]) -> list[str]:
    out = []
    seen = set()
    for value in values or []:
        cleaned = canonicalize_skill(str(value).strip())
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


def _dedupe_text_list(values: Iterable[str]) -> list[str]:
    out = []
    seen = set()
    for value in values or []:
        cleaned = normalize_text(str(value).strip())
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


def _postprocess(parsed: ParsedJob, source_flag: str) -> ParsedJob:
    parsed.required_skills = _dedupe_skill_list(parsed.required_skills)
    parsed.preferred_skills = _dedupe_skill_list(parsed.preferred_skills)
    parsed.tools = _dedupe_skill_list(parsed.tools)
    parsed.keywords = _dedupe_text_list(parsed.keywords)
    parsed.responsibilities = _dedupe_text_list(parsed.responsibilities)
    parsed.certifications = _dedupe_text_list(parsed.certifications)
    parsed.raw_text_used = source_flag

    if parsed.min_experience_years is None:
        combined_text = " ".join(
            [
                parsed.title or "",
                parsed.summary or "",
                " ".join(parsed.responsibilities or []),
                " ".join(parsed.keywords or []),
            ]
        )
        parsed.min_experience_years = extract_min_experience_years(combined_text)

    return parsed


def parse_job_description_with_gemini(job_text: str, model_name: str = DEFAULT_MODEL) -> ParsedJob:
    client = get_gemini_client()
    prompt = build_job_prompt(job_text)
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_json_schema": ParsedJob.model_json_schema(),
        },
    )

    try:
        parsed = ParsedJob.model_validate_json(response.text)
        return _postprocess(parsed, source_flag="gemini_job_text")
    except ValidationError:
        return _postprocess(basic_job_fallback(job_text), source_flag="fallback_text")


def parse_job_description(
    job_text: str,
    model_name: str = DEFAULT_MODEL,
    prefer_gemini: bool = True,
) -> ParsedJob:
    job_text = str(job_text or "").strip()
    if not job_text:
        raise ValueError("Job description text is empty.")

    if prefer_gemini:
        try:
            return parse_job_description_with_gemini(job_text, model_name=model_name)
        except Exception:
            pass

    return _postprocess(basic_job_fallback(job_text), source_flag="fallback_text")

from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence, Tuple

WORD_RE = re.compile(r"[a-z0-9][a-z0-9+#./-]*")
YEAR_RE = re.compile(r"(\d{1,2})(?:\s*[-to]{1,3}\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)", re.IGNORECASE)

EDUCATION_RANK: Dict[str, int] = {
    "phd": 5,
    "doctorate": 5,
    "doctoral": 5,
    "masters": 4,
    "master": 4,
    "msc": 4,
    "m.sc": 4,
    "mtech": 4,
    "mba": 4,
    "bachelors": 3,
    "bachelor": 3,
    "bsc": 3,
    "b.sc": 3,
    "btech": 3,
    "bs": 3,
    "ba": 3,
    "associate": 2,
    "diploma": 2,
    "certificate": 1,
    "certification": 1,
}

COMMON_TECH_TERMS = {
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "golang", "rust",
    "php", "ruby", "scala", "kotlin", "swift", "sql", "mysql", "postgresql", "postgres", "sqlite",
    "mongodb", "redis", "elasticsearch", "dynamodb", "oracle", "fastapi", "django", "flask",
    "spring", "spring boot", "node", "nodejs", "node.js", "express", "react", "nextjs", "next.js",
    "vue", "angular", "svelte", "html", "css", "tailwind", "bootstrap", "rest api", "rest",
    "graphql", "microservices", "docker", "kubernetes", "k8s", "aws", "azure", "gcp", "linux",
    "git", "github", "github actions", "gitlab", "gitlab ci", "ci cd", "jenkins", "terraform",
    "ansible", "airflow", "spark", "hadoop", "pandas", "numpy", "scikit learn", "sklearn", "pytorch",
    "tensorflow", "llm", "nlp", "machine learning", "deep learning", "data analysis", "data engineering",
    "power bi", "tableau", "excel", "jira", "agile", "scrum", "oop", "api", "apis",
    "pytest", "unittest", "selenium", "playwright", "grpc", "celery", "rabbitmq", "kafka",
    "serverless", "lambda", "ec2", "s3", "rds", "cloudwatch", "devops", "backend", "frontend",
    "full stack", "fullstack", "software engineering", "computer vision", "nltk", "langchain", "openai",
}

DEFAULT_FEATURE_COLUMNS = [
    "embedding_similarity",
    "tfidf_similarity",
    "semantic_hint",
    "keyword_overlap",
    "title_match_score",
    "resume_word_count",
    "job_word_count",
    "length_ratio",
    "resume_years_detected",
    "job_min_years",
    "experience_match_score",
    "resume_education_rank",
    "job_education_rank",
    "education_match_score",
    "required_skill_coverage",
    "preferred_skill_coverage",
    "missing_required_skill_ratio",
    "missing_required_skill_count",
    "skill_match_count",
    "project_relevance_score",
    "certification_relevance_score",
    "job_skill_count",
]

# Alias — used by create_multiclass_dataset.ipynb
FEATURE_COLUMNS = DEFAULT_FEATURE_COLUMNS


# ── Text helpers ──────────────────────────────────────────────────────────────

def clipped_similarity(value: Any) -> float:
    try:
        numeric = float(value)
    except Exception:
        numeric = 0.0
    if numeric < 0.0:
        return 0.0
    if numeric > 1.0:
        return 1.0
    return numeric


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.replace("\u00a0", " ")
    value = value.replace("&", " and ")
    value = re.sub(r"[\r\n\t]+", " ", value)
    value = value.lower()
    value = re.sub(r"[^a-z0-9+#./\-\s]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _normalize_token(token: str) -> str:
    token = normalize_text(token).strip(" .-_/\\")
    if len(token) > 3 and token.endswith("es"):
        token = token[:-2]
    elif len(token) > 2 and token.endswith("s") and not token.endswith("ss"):
        token = token[:-1]
    return token


def tokenize_words(text: Any) -> List[str]:
    normalized = normalize_text(text)
    return [_normalize_token(tok) for tok in WORD_RE.findall(normalized) if _normalize_token(tok)]


def _token_set(text: Any) -> set:
    return {tok for tok in tokenize_words(text) if tok}


def contains_phrase(text: Any, phrase: Any) -> bool:
    base_text = normalize_text(text)
    base_phrase = normalize_text(phrase)
    if not base_text or not base_phrase:
        return False
    escaped = re.escape(base_phrase).replace(r"\ ", r"\s+")
    boundary_pattern = rf"(?<![a-z0-9+#./-]){escaped}(?![a-z0-9+#./-])"
    if re.search(boundary_pattern, base_text):
        return True
    text_tokens = tokenize_words(base_text)
    phrase_tokens = tokenize_words(base_phrase)
    if not phrase_tokens:
        return False
    plen = len(phrase_tokens)
    for idx in range(len(text_tokens) - plen + 1):
        window = text_tokens[idx : idx + plen]
        if window == phrase_tokens:
            return True
    text_set = set(text_tokens)
    return all(tok in text_set for tok in phrase_tokens)


def keyword_overlap_score(text_a: Any, text_b: Any) -> float:
    tokens_a = _token_set(text_a)
    tokens_b = _token_set(text_b)
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    if union <= 0:
        return 0.0
    return clipped_similarity(overlap / union)


def match_job_skills_in_resume(
    resume_text: Any, skills: Sequence[str]
) -> Tuple[List[str], List[str]]:
    normalized_resume = normalize_text(resume_text)
    resume_tokens = _token_set(normalized_resume)
    matched: List[str] = []
    missing: List[str] = []
    seen: set = set()
    for skill in skills or []:
        skill_text = normalize_text(skill)
        if not skill_text or skill_text in seen:
            continue
        seen.add(skill_text)
        skill_tokens = tokenize_words(skill_text)
        skill_hit = contains_phrase(normalized_resume, skill_text)
        if not skill_hit and skill_tokens:
            skill_hit = all(tok in resume_tokens for tok in skill_tokens)
        if skill_hit:
            matched.append(skill_text)
        else:
            missing.append(skill_text)
    return matched, missing


def _best_education_rank(text: Any) -> int:
    normalized = normalize_text(text)
    best = 0
    for phrase, rank in EDUCATION_RANK.items():
        if contains_phrase(normalized, phrase):
            best = max(best, rank)
    return best


def extract_min_experience_required(text: Any) -> int:
    normalized = normalize_text(text)
    values: List[int] = []
    for match in YEAR_RE.finditer(normalized):
        try:
            first = int(match.group(1))
            second = int(match.group(2)) if match.group(2) else None
        except Exception:
            continue
        values.append(first)
        if second is not None:
            values.append(second)
    values = [value for value in values if 0 <= value <= 50]
    if not values:
        return 0
    return max(values)


def extract_years_of_experience_from_resume(text: Any) -> int:
    return extract_min_experience_required(text)


# ── Main feature builder ──────────────────────────────────────────────────────

def build_pair_features(
    resume_row: Dict[str, Any],
    job_row: Dict[str, Any],
    embedding_similarity: float,
    tfidf_similarity: float,
) -> Dict[str, Any]:
    """
    Build the full feature dict for one (resume, job) pair.

    Returns all DEFAULT_FEATURE_COLUMNS values plus three extra keys:
        job_skill_count          — total required skills in job posting
        matched_required_skills  — list of matched skill strings
        missing_required_skills  — list of missing skill strings

    create_multiclass_dataset.ipynb pops the two list keys before
    writing the row so the CSV stays numeric. job_skill_count stays
    as a numeric column in the CSV.
    """
    resume_text = resume_row.get("clean_resume") or normalize_text(
        resume_row.get("resume", "")
    )
    job_text = job_row.get("full_job") or normalize_text(job_row.get("job", ""))

    resume_word_count = float(
        resume_row.get("resume_word_count") or len(tokenize_words(resume_text))
    )
    job_word_count = float(
        job_row.get("job_word_count") or len(tokenize_words(job_text))
    )

    keyword_overlap = keyword_overlap_score(resume_text, job_text)

    job_title = normalize_text(job_row.get("title", ""))
    resume_title_hint = normalize_text(resume_row.get("category", ""))
    title_match_score = max(
        keyword_overlap_score(resume_title_hint, job_title),
        1.0 if job_title and contains_phrase(resume_text, job_title) else 0.0,
    )

    required_skills = [
        part.strip()
        for part in str(job_row.get("skills", "")).split(",")
        if part.strip()
    ]
    matched_required, missing_required = match_job_skills_in_resume(
        resume_text, required_skills
    )
    n_required     = len(required_skills)
    n_matched      = len(matched_required)
    n_missing      = len(missing_required)

    required_skill_coverage = (
        n_matched / n_required if n_required else keyword_overlap
    )
    missing_required_skill_ratio = (
        n_missing / n_required if n_required else 0.0
    )

    resume_years_detected = float(
        extract_years_of_experience_from_resume(resume_row.get("resume", ""))
    )
    job_min_years = float(
        extract_min_experience_required(job_row.get("experience") or job_text)
    )
    if job_min_years <= 0:
        experience_match_score = 1.0 if resume_years_detected > 0 else 0.75
    elif resume_years_detected <= 0:
        experience_match_score = 0.0
    else:
        experience_match_score = clipped_similarity(
            resume_years_detected / job_min_years
        )

    resume_education_rank = float(
        _best_education_rank(resume_row.get("resume", ""))
    )
    job_education_rank = float(
        _best_education_rank(job_row.get("qualifications") or job_text)
    )
    if job_education_rank <= 0:
        education_match_score = 1.0 if resume_education_rank > 0 else 0.75
    elif resume_education_rank <= 0:
        education_match_score = 0.0
    elif resume_education_rank >= job_education_rank:
        education_match_score = 1.0
    else:
        education_match_score = clipped_similarity(
            resume_education_rank / job_education_rank
        )

    smaller = min(resume_word_count, job_word_count)
    larger  = max(resume_word_count, job_word_count, 1.0)
    length_ratio = smaller / larger
    semantic_hint = clipped_similarity(
        0.55 * float(embedding_similarity) + 0.45 * float(tfidf_similarity)
    )

    return {
        # ── numeric features ──────────────────────────────────────────────
        "embedding_similarity":          clipped_similarity(embedding_similarity),
        "tfidf_similarity":              clipped_similarity(tfidf_similarity),
        "semantic_hint":                 semantic_hint,
        "keyword_overlap":               keyword_overlap,
        "title_match_score":             clipped_similarity(title_match_score),
        "resume_word_count":             resume_word_count,
        "job_word_count":                job_word_count,
        "length_ratio":                  clipped_similarity(length_ratio),
        "resume_years_detected":         resume_years_detected,
        "job_min_years":                 job_min_years,
        "experience_match_score":        clipped_similarity(experience_match_score),
        "resume_education_rank":         resume_education_rank,
        "job_education_rank":            job_education_rank,
        "education_match_score":         clipped_similarity(education_match_score),
        "required_skill_coverage":       clipped_similarity(required_skill_coverage),
        "preferred_skill_coverage":      0.0,
        "missing_required_skill_ratio":  clipped_similarity(missing_required_skill_ratio),
        "missing_required_skill_count":  float(n_missing),
        "skill_match_count":             float(n_matched),
        "project_relevance_score":       0.0,
        "certification_relevance_score": 0.0,
        "job_skill_count":               float(n_required),   # total skills in job
        # ── list fields — popped by create_multiclass_dataset.ipynb ──────
        "matched_required_skills":       matched_required,
        "missing_required_skills":       missing_required,
    }


# ── Label scoring ─────────────────────────────────────────────────────────────

def hybrid_label_score(feature_dict: Dict[str, Any]) -> float:
    """
    Compute a silver label score (0-1) from a feature dict
    returned by build_pair_features().

    Called by create_multiclass_dataset.ipynb for every resume-job pair
    to decide the initial label before bucket-aware recalibration.
    """
    return clipped_similarity(
        0.25 * clipped_similarity(feature_dict.get("embedding_similarity", 0.0))
        + 0.28 * clipped_similarity(feature_dict.get("required_skill_coverage", 0.0))
        + 0.15 * clipped_similarity(feature_dict.get("tfidf_similarity", 0.0))
        + 0.12 * clipped_similarity(feature_dict.get("experience_match_score", 0.0))
        + 0.10 * clipped_similarity(feature_dict.get("education_match_score", 0.0))
        + 0.10 * clipped_similarity(feature_dict.get("keyword_overlap", 0.0))
    )


def assign_multiclass_label(
    silver_score: float,
    retrieval_bucket: str = "mid",
) -> Tuple[int, str]:
    """
    Convert a hybrid silver score + retrieval bucket into a
    (label_int, label_name) pair.

    Called by create_multiclass_dataset.ipynb for every resume-job pair.
    
    Thresholds tightened to reduce overlap between moderate and 
    neighbouring classes — fixes the 69% ambiguity problem.
    """
    if retrieval_bucket == "high":
        if silver_score >= 0.60:       # was 0.55 — raised to reduce moderate/strong overlap
            return 2, "strong_match"
        if silver_score >= 0.30:       # added lower bound — removes ambiguous poor/moderate
            return 1, "moderate_match"
        return 0, "poor_match"
    elif retrieval_bucket == "mid":
        if silver_score >= 0.45:       # was 0.40 — raised to reduce moderate/poor overlap
            return 1, "moderate_match"
        return 0, "poor_match"
    else:  # low bucket
        if silver_score >= 0.65:       # was 0.60 — raised for cleaner boundary
            return 1, "moderate_match"
        return 0, "poor_match"
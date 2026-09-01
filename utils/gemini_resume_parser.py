from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import ValidationError

try:
    from utils.resume_schema import ParsedResume
    from utils.text_extract import extract_text_from_file, clean_extracted_text
except ImportError:
    from resume_schema import ParsedResume
    from text_extract import extract_text_from_file, clean_extracted_text


DEFAULT_MODEL = "gemini-2.5-flash"


load_dotenv()


def get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not found. Put it in your .env file or environment variables.")
    return genai.Client(api_key=api_key)


def build_resume_prompt(raw_text: str) -> str:
    return f"""You are an ATS resume parsing engine.

Extract ALL structured candidate information from the resume content below.

You MUST extract these fields if they exist in the resume:
1. candidate_name, headline, email, phone, location, linkedin, github, portfolio
2. summary - professional summary or objective statement
3. total_experience_years - approximate numeric value if inferable
4. skills.technical - ALL programming languages, frameworks, databases, cloud services, APIs
5. skills.tools - ALL tools, platforms, IDEs, CI/CD, version control
6. skills.soft - soft skills (leadership, communication, teamwork, etc.)
7. experience - EVERY job with job_title, company, start_date, end_date, responsibilities (concise bullets), technologies
8. education - EVERY degree with degree, institution, start_date, end_date, grade
9. projects - EVERY project with name, description, technologies, link
10. certifications - EVERY certification with name, issuer, date
11. languages - spoken/written languages ONLY (not programming languages)

CRITICAL RULES:
- Extract EVERYTHING present. Do NOT return empty arrays if data exists in the text.
- Do not invent facts. If a field is genuinely missing, use null or empty list.
- Keep skills normalized, lowercase, and deduplicated.
- For dates, keep as strings exactly as found.
- For current roles, end_date can be 'present'.
- responsibilities should be concise action-verb bullet statements.
- Return only schema-compliant JSON.

Resume content:
--------------------
{raw_text}
--------------------
""".strip()


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?[\d\s-]{6,}\d")
LINKEDIN_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/[^\s]+", re.I)
GITHUB_RE = re.compile(r"https?://(?:www\.)?github\.com/[^\s]+", re.I)
URL_RE = re.compile(r"https?://[^\s]+", re.I)


COMMON_NAME_STOPWORDS = {
    "resume", "curriculum vitae", "cv", "profile", "summary", "contact", "education",
    "experience", "skills", "projects", "certifications"
}


def basic_resume_fallback(raw_text: str, source_flag: str = "fallback_text") -> ParsedResume:
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    candidate_name = None

    for ln in lines[:8]:
        low = ln.lower()
        if low in COMMON_NAME_STOPWORDS:
            continue
        if EMAIL_RE.search(ln) or LINKEDIN_RE.search(ln) or GITHUB_RE.search(ln):
            continue
        if len(ln.split()) <= 5 and not any(ch.isdigit() for ch in ln):
            candidate_name = ln
            break

    email_match = EMAIL_RE.search(raw_text)
    phone_match = PHONE_RE.search(raw_text)
    linkedin_match = LINKEDIN_RE.search(raw_text)
    github_match = GITHUB_RE.search(raw_text)

    all_urls = URL_RE.findall(raw_text)
    portfolio = None
    for u in all_urls:
        ul = u.lower()
        if "linkedin.com" not in ul and "github.com" not in ul:
            portfolio = u
            break

    return ParsedResume(
        candidate_name=candidate_name,
        email=email_match.group(0) if email_match else None,
        phone=phone_match.group(0).strip() if phone_match else None,
        linkedin=linkedin_match.group(0) if linkedin_match else None,
        github=github_match.group(0) if github_match else None,
        portfolio=portfolio,
        summary=None,
        raw_text_used=source_flag,
    )


def _postprocess(parsed: ParsedResume, source_flag: str) -> ParsedResume:
    def _clean_list(values):
        out = []
        seen = set()
        for v in values or []:
            if v is None:
                continue
            x = str(v).strip()
            if not x:
                continue
            key = x.lower()
            if key not in seen:
                seen.add(key)
                out.append(key)
        return out

    parsed.skills.technical = _clean_list(parsed.skills.technical)
    parsed.skills.tools = _clean_list(parsed.skills.tools)
    parsed.skills.soft = _clean_list(parsed.skills.soft)
    parsed.languages = _clean_list(parsed.languages)
    parsed.raw_text_used = source_flag
    return parsed


def parse_resume_text_with_gemini(
    raw_text: str,
    model_name: str = DEFAULT_MODEL,
) -> ParsedResume:
    raw_text = clean_extracted_text(raw_text)
    if not raw_text:
        raise ValueError("Resume text is empty after cleaning.")

    client = get_gemini_client()
    prompt = build_resume_prompt(raw_text)

    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_json_schema": ParsedResume.model_json_schema(),
        },
    )

    try:
        parsed = ParsedResume.model_validate_json(response.text)
        return _postprocess(parsed, source_flag="extracted_text")
    except ValidationError:
        return basic_resume_fallback(raw_text, source_flag="fallback_text")


def parse_resume_pdf_with_gemini_vision(
    pdf_path: str | Path,
    model_name: str = DEFAULT_MODEL,
) -> ParsedResume:
    pdf_path = Path(pdf_path)
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("parse_resume_pdf_with_gemini_vision expects a .pdf file")

    client = get_gemini_client()
    prompt = """You are an ATS resume parsing engine.

Parse this resume PDF into structured JSON. Extract ALL of the following:
1. candidate_name - full name of the candidate
2. headline - current role or target role
3. email, phone, location, linkedin, github, portfolio
4. summary - professional summary or objective
5. total_experience_years - approximate numeric value
6. skills.technical - ALL programming languages, frameworks, databases, cloud services mentioned
7. skills.tools - ALL tools, platforms, IDEs, CI/CD tools mentioned
8. skills.soft - soft skills like leadership, communication, teamwork
9. experience - EVERY job listed with job_title, company, start_date, end_date, responsibilities (as bullet points), technologies
10. education - EVERY degree with degree name, institution, start_date, end_date, grade/CGPA
11. projects - EVERY project with name, description, technologies, link
12. certifications - EVERY certification with name, issuer, date
13. languages - spoken/written languages (NOT programming languages)

CRITICAL RULES:
- Extract EVERYTHING you can see. Do not skip any section.
- If a field is genuinely missing from the resume, use null or empty list.
- Do NOT return empty lists for skills/experience/education if they exist in the resume.
- Keep skill names lowercase and normalized.
- Return only valid JSON matching the schema."""

    response = client.models.generate_content(
        model=model_name,
        contents=[
            types.Part.from_bytes(data=pdf_path.read_bytes(), mime_type="application/pdf"),
            prompt,
        ],
        config={
            "response_mime_type": "application/json",
            "response_json_schema": ParsedResume.model_json_schema(),
        },
    )

    try:
        parsed = ParsedResume.model_validate_json(response.text)
        return _postprocess(parsed, source_flag="pdf_vision")
    except ValidationError:
        fallback_text = extract_text_from_file(pdf_path)
        return basic_resume_fallback(fallback_text, source_flag="fallback_pdf_text")


def parse_resume_file(
    file_path: str | Path,
    model_name: str = DEFAULT_MODEL,
    prefer_pdf_vision: bool = True,
) -> ParsedResume:
    file_path = Path(file_path)
    ext = file_path.suffix.lower()

    if ext == ".pdf" and prefer_pdf_vision:
        try:
            return parse_resume_pdf_with_gemini_vision(file_path, model_name=model_name)
        except Exception:
            extracted_text = extract_text_from_file(file_path)
            return parse_resume_text_with_gemini(extracted_text, model_name=model_name)

    extracted_text = extract_text_from_file(file_path)
    try:
        return parse_resume_text_with_gemini(extracted_text, model_name=model_name)
    except Exception:
        return basic_resume_fallback(extracted_text, source_flag="fallback_text")


def save_parsed_resume_json(parsed_resume: ParsedResume, output_path: str | Path) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(parsed_resume.model_dump_json(indent=2), encoding="utf-8")


if __name__ == "__main__":
    sample_path = Path("../data/test_resumes/sample_resume.pdf")
    result = parse_resume_file(sample_path)
    print(result.model_dump_json(indent=2))

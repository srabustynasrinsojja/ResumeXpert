"""Generates specific, individually-acceptable résumé edit suggestions —
either a rewritten existing bullet or a new bullet — that naturally work a
missing keyword/skill into the candidate's real experience. Mirrors the
"accept or reject each suggested edit" UX of tools like Jobsuit AI, rather
than a vague "here are some skills you're missing" checklist: every
suggestion is a concrete before/after the candidate can approve.

Uses Gemini when GEMINI_API_KEY is configured; falls back to a plain
template-based generator (no LLM) so the feature still works without one,
consistent with the rest of the app's "Gemini + local fallback" pattern
(see parser_bridge.py).

Deliberately does not invent employers, dates, or job titles — it only
ever proposes wording changes to bullets under an experience entry the
candidate already listed, and only becomes part of their résumé once they
explicitly accept it.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger("resume_tailor_engine")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"')
_MODEL_NAME = "gemini-2.5-flash"
MAX_EDITS = 8


def _gemini_available() -> bool:
    return bool(GEMINI_API_KEY)


def _get_bullets(exp: Dict[str, Any]) -> List[str]:
    """responsibilities is the real field (see ResumeSummaryView in Profile.jsx);
    the others are defensive fallbacks in case a given parse used a variant."""
    for key in ("responsibilities", "bullets", "highlights", "description"):
        val = exp.get(key)
        if isinstance(val, list) and val:
            return val
        if isinstance(val, str) and val.strip():
            return [b.strip(" \u2022-") for b in val.split("\n") if b.strip()]
    return []


def _set_bullets(exp: Dict[str, Any], bullets: List[str]) -> None:
    # Write back under whichever key already exists; default to responsibilities.
    for key in ("responsibilities", "bullets", "highlights"):
        if key in exp:
            exp[key] = bullets
            return
    exp["responsibilities"] = bullets


def _extract_bullets(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for ei, exp in enumerate(profile.get("experience") or []):
        for bi, b in enumerate(_get_bullets(exp)):
            out.append({
                "experience_index": ei, "bullet_index": bi, "text": b,
                "role": exp.get("title") or exp.get("role") or "",
                "company": exp.get("company") or "",
            })
    return out


def _fallback_edits(profile: Dict[str, Any], missing_skills: List[str]) -> List[Dict[str, Any]]:
    """No-LLM fallback: one new bullet per missing skill, attached to the
    candidate's most recent experience entry with a plain, honest template
    the candidate is expected to edit or reject if it doesn't fit."""
    experience = profile.get("experience") or []
    if not experience:
        return []
    role = experience[0].get("title") or experience[0].get("role") or "this role"
    edits = []
    for kw in missing_skills[:MAX_EDITS]:
        edits.append({
            "id": str(uuid4()),
            "type": "add_bullet",
            "experience_index": 0,
            "bullet_index": None,
            "original_text": None,
            "suggested_text": f"Used {kw} as part of {role}, contributing directly to team and project outcomes.",
            "keyword": kw,
        })
    return edits


def _build_prompt(job_text: str, missing_skills: List[str], missing_keywords: List[str], bullets: List[Dict[str, Any]]) -> str:
    bullets_desc = "\n".join(
        f"[{b['experience_index']}:{b['bullet_index']}] ({b['role']} at {b['company']}): {b['text']}"
        for b in bullets[:20]
    ) or "(no existing bullet points found)"
    return f"""You are helping a job candidate tailor their r\u00e9sum\u00e9 to one specific job, WITHOUT inventing experience they didn't have.

JOB DESCRIPTION:
{job_text[:3000]}

MISSING SKILLS: {", ".join(missing_skills[:10]) or "none"}
MISSING KEYWORDS: {", ".join(missing_keywords[:10]) or "none"}

CANDIDATE'S CURRENT EXPERIENCE BULLETS (format [experience_index:bullet_index] (role at company): text):
{bullets_desc}

Propose up to 6 specific edits that naturally work the missing skills/keywords into the r\u00e9sum\u00e9. Each edit is one of:
- "modify_bullet": rewrite ONE existing bullet (reference it by its exact [experience_index:bullet_index]) to naturally include a missing keyword, staying truthful and close to the original meaning \u2014 do not fabricate new responsibilities, just phrase the existing one to surface the keyword.
- "add_bullet": a plausible NEW bullet under a given experience_index (pick the most relevant existing role) that a person who did that job could reasonably have done.

Return ONLY a valid JSON array, no markdown fences, no explanation:
[{{"type":"modify_bullet"|"add_bullet","experience_index":<int>,"bullet_index":<int or null>,"original_text":<string or null>,"suggested_text":<string>,"keyword":<string>}}]
"""


def generate_tailored_edits(
    profile: Dict[str, Any],
    job_text: str,
    missing_skills: Optional[List[str]] = None,
    missing_keywords: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    missing_skills = missing_skills or []
    missing_keywords = missing_keywords or []
    bullets = _extract_bullets(profile)

    if not _gemini_available():
        return _fallback_edits(profile, missing_skills)

    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(_MODEL_NAME)
        prompt = _build_prompt(job_text, missing_skills, missing_keywords, bullets)
        resp = model.generate_content(prompt)
        text = (resp.text or "").strip()
        text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
        raw = json.loads(text)
        edits: List[Dict[str, Any]] = []
        experience = profile.get("experience") or []
        for item in raw:
            if not isinstance(item, dict) or not item.get("suggested_text"):
                continue
            ei = item.get("experience_index")
            if not isinstance(ei, int) or ei < 0 or ei >= len(experience):
                continue
            edits.append({
                "id": str(uuid4()),
                "type": item.get("type") if item.get("type") in ("modify_bullet", "add_bullet") else "add_bullet",
                "experience_index": ei,
                "bullet_index": item.get("bullet_index"),
                "original_text": item.get("original_text"),
                "suggested_text": item.get("suggested_text"),
                "keyword": item.get("keyword") or "",
            })
        if edits:
            return edits[:MAX_EDITS]
    except Exception:
        logger.exception("Gemini tailored-edit generation failed \u2014 using local fallback")

    return _fallback_edits(profile, missing_skills)


def apply_edits_to_profile(profile: Dict[str, Any], accepted_edits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Applies only the edits the candidate explicitly accepted, to a COPY of
    the parsed profile \u2014 never mutates the original."""
    updated = copy.deepcopy(profile)
    experience = updated.get("experience") or []

    for edit in accepted_edits:
        ei = edit.get("experience_index")
        if not isinstance(ei, int) or ei < 0 or ei >= len(experience):
            continue
        exp = experience[ei]
        bullets = _get_bullets(exp)
        suggested = edit.get("suggested_text")
        if not suggested:
            continue
        bi = edit.get("bullet_index")
        if edit.get("type") == "modify_bullet" and isinstance(bi, int) and 0 <= bi < len(bullets):
            bullets[bi] = suggested
        else:
            bullets.append(suggested)
        _set_bullets(exp, bullets)

    updated["experience"] = experience
    return updated

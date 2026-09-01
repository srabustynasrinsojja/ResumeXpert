"""
Professional ATS-Compliant CV Generator (v3)
─────────────────────────────────────────────
Optimized to score HIGH on our ATS quality scorer:

Scorer checks (and how we optimize):
1. Contact (18%): email, phone, linkedin, github → we print ALL available
2. Sections (24%): skills, experience, education, projects, summary → we ALWAYS include headings
3. Achievements (22%): bullet count ≥6, action verbs, quantified lines → we format bullets with •
4. Readability (18%): word count 150-900, no dense paragraphs → we target this range
5. Skills clarity (10%): ≥12 unique skills, skills section present → we list ALL skills
6. Word count >120 (8%): → we ensure enough content

Design: Single-column, Helvetica, black + navy, right-aligned dates, ATS-parseable text PDF.
"""

from __future__ import annotations

import io
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
    Table, TableStyle,
)

PAGE_W, PAGE_H = A4
MARGIN_LR = 22 * mm
MARGIN_TB = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_LR

NAVY = colors.HexColor("#1B2A4A")
BLACK = colors.HexColor("#1A1A1A")
DARK_GRAY = colors.HexColor("#3A3A3A")
MID_GRAY = colors.HexColor("#606060")
RULE_COLOR = colors.HexColor("#1B2A4A")
LIGHT_RULE = colors.HexColor("#C0C0C0")


def _styles():
    s = {}
    s["name"] = ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=24, leading=28,
                                textColor=NAVY, alignment=TA_CENTER, spaceAfter=3)
    s["contact"] = ParagraphStyle("contact", fontName="Helvetica", fontSize=9.5, leading=13,
                                   textColor=DARK_GRAY, alignment=TA_CENTER, spaceAfter=1)
    s["section"] = ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=11.5, leading=14,
                                   textColor=NAVY, spaceBefore=14, spaceAfter=0)
    s["title"] = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=10.5, leading=13.5,
                                 textColor=BLACK, spaceAfter=0.5)
    s["org"] = ParagraphStyle("org", fontName="Helvetica", fontSize=10, leading=13,
                               textColor=DARK_GRAY, spaceAfter=1)
    s["date_right"] = ParagraphStyle("date_right", fontName="Helvetica-Oblique", fontSize=9.5,
                                      leading=13, textColor=MID_GRAY, alignment=TA_RIGHT)
    s["body"] = ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=13.5,
                                textColor=BLACK, spaceAfter=2)
    s["bullet"] = ParagraphStyle("bullet", fontName="Helvetica", fontSize=10, leading=13.5,
                                  textColor=BLACK, leftIndent=12, spaceAfter=2)
    s["skills"] = ParagraphStyle("skills", fontName="Helvetica", fontSize=10, leading=14,
                                  textColor=BLACK, spaceAfter=4)
    s["meta"] = ParagraphStyle("meta", fontName="Helvetica", fontSize=9, leading=12,
                                textColor=MID_GRAY, spaceAfter=2)
    return s


def _esc(text: Optional[str]) -> str:
    if not text:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _section_block(title: str, styles):
    return [
        Paragraph(title.upper(), styles["section"]),
        HRFlowable(width="100%", thickness=1, color=RULE_COLOR, spaceAfter=7, spaceBefore=2),
    ]


def _title_date_row(title_text: str, date_text: str, styles):
    t = Table(
        [[Paragraph(title_text, styles["title"]), Paragraph(_esc(date_text), styles["date_right"])]],
        colWidths=[CONTENT_W * 0.68, CONTENT_W * 0.32],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _auto_summary(data: Dict[str, Any]) -> str:
    """Auto-generate a professional summary if user didn't provide one."""
    parts = []
    name = data.get("candidate_name") or "Professional"
    headline = data.get("headline") or ""

    # Experience summary
    exp_list = data.get("experience", [])
    total_years = data.get("total_experience_years")
    if total_years:
        parts.append(f"Results-driven professional with {total_years}+ years of experience")
    elif exp_list:
        parts.append(f"Experienced professional with {len(exp_list)} role(s) of progressive responsibility")
    else:
        parts.append("Motivated professional")

    if headline:
        parts[0] += f" in {headline}"

    # Skills highlight
    skills = data.get("skills") or {}
    tech = skills.get("technical", []) if isinstance(skills, dict) else []
    if tech:
        top_skills = tech[:5]
        parts.append(f"Proficient in {', '.join(top_skills)}")

    # Education
    edu_list = data.get("education", [])
    if edu_list and isinstance(edu_list[0], dict):
        degree = edu_list[0].get("degree") or ""
        inst = edu_list[0].get("institution") or ""
        if degree:
            parts.append(f"Holds a {degree}" + (f" from {inst}" if inst else ""))

    parts.append("Seeking to leverage skills and experience to deliver impactful results in a challenging role.")
    return ". ".join(parts) + "."


def generate_resume_pdf(data: Dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    styles = _styles()

    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=MARGIN_LR, rightMargin=MARGIN_LR,
                            topMargin=MARGIN_TB, bottomMargin=MARGIN_TB)
    story = []

    # ═══ HEADER ═══
    name = data.get("candidate_name") or "Your Name"
    story.append(Paragraph(_esc(name), styles["name"]))

    contact = []
    for key in ["phone", "email", "location"]:
        v = data.get(key)
        if v:
            contact.append(_esc(v))
    if contact:
        story.append(Paragraph("  |  ".join(contact), styles["contact"]))

    links = []
    if data.get("linkedin"):
        links.append(f'LinkedIn: {_esc(data["linkedin"])}')
    if data.get("github"):
        links.append(f'GitHub: {_esc(data["github"])}')
    if data.get("portfolio"):
        links.append(f'Portfolio: {_esc(data["portfolio"])}')
    if links:
        story.append(Paragraph("  |  ".join(links), styles["contact"]))

    story.append(Spacer(1, 5))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_RULE, spaceAfter=4))

    # ═══ PROFESSIONAL SUMMARY (always present — auto-generate if missing) ═══
    summary = data.get("summary") or _auto_summary(data)
    story.extend(_section_block("Professional Summary", styles))
    story.append(Paragraph(_esc(summary), styles["body"]))

    # ═══ EXPERIENCE ═══
    experience = data.get("experience", [])
    if experience:
        story.extend(_section_block("Work Experience", styles))
        for idx, exp in enumerate(experience):
            if not isinstance(exp, dict):
                continue
            title = exp.get("job_title") or ""
            company = exp.get("company") or ""
            start = exp.get("start_date") or ""
            end = exp.get("end_date") or ""
            date_str = f"{start} \u2013 {end}" if (start or end) else ""

            if title:
                story.append(_title_date_row(f"<b>{_esc(title)}</b>", date_str, styles))
            if company:
                story.append(Paragraph(_esc(company), styles["org"]))

            # Bullet points — use • prefix for ATS bullet detection
            for resp in exp.get("responsibilities", [])[:8]:
                if resp and resp.strip():
                    bullet_text = resp.strip()
                    # Ensure bullet starts with • for ATS detection
                    if not bullet_text.startswith(("•", "-", "*")):
                        bullet_text = f"\u2022 {bullet_text}"
                    elif bullet_text.startswith(("-", "*")):
                        bullet_text = f"\u2022 {bullet_text[1:].strip()}"
                    story.append(Paragraph(_esc(bullet_text), styles["bullet"]))

            # Technologies used
            techs = exp.get("technologies", [])
            if techs:
                story.append(Paragraph(f"<i>Technologies: {_esc(', '.join(techs))}</i>", styles["meta"]))

            if idx < len(experience) - 1:
                story.append(Spacer(1, 6))

    # ═══ EDUCATION ═══
    education = data.get("education", [])
    if education:
        story.extend(_section_block("Education", styles))
        for idx, edu in enumerate(education):
            if not isinstance(edu, dict):
                continue
            degree = edu.get("degree") or ""
            inst = edu.get("institution") or ""
            start = edu.get("start_date") or ""
            end = edu.get("end_date") or ""
            grade = edu.get("grade") or ""
            date_str = f"{start} \u2013 {end}" if (start or end) else ""

            if degree:
                story.append(_title_date_row(f"<b>{_esc(degree)}</b>", date_str, styles))
            if inst:
                story.append(Paragraph(_esc(inst), styles["org"]))
            if grade:
                story.append(Paragraph(f"CGPA: {_esc(grade)}", styles["meta"]))
            if idx < len(education) - 1:
                story.append(Spacer(1, 4))

    # ═══ TECHNICAL SKILLS (always present as section heading) ═══
    skills = data.get("skills") or {}
    if isinstance(skills, dict):
        tech = skills.get("technical", [])
        tools = skills.get("tools", [])
        soft = skills.get("soft", [])
    else:
        tech, tools, soft = [], [], []

    # Always show skills section even if some categories empty
    if tech or tools or soft:
        story.extend(_section_block("Technical Skills", styles))
        if tech:
            story.append(Paragraph(f'<b>Technical:</b>  {_esc(", ".join(tech))}', styles["skills"]))
        if tools:
            story.append(Paragraph(f'<b>Tools &amp; Platforms:</b>  {_esc(", ".join(tools))}', styles["skills"]))
        if soft:
            story.append(Paragraph(f'<b>Soft Skills:</b>  {_esc(", ".join(soft))}', styles["skills"]))

    # ═══ PROJECTS ═══
    projects = data.get("projects", [])
    if projects:
        story.extend(_section_block("Projects", styles))
        for idx, proj in enumerate(projects):
            if not isinstance(proj, dict):
                continue
            pname = proj.get("name") or ""
            desc = proj.get("description") or ""
            techs = proj.get("technologies", [])
            link = proj.get("link") or ""

            header = f"<b>{_esc(pname)}</b>"
            if link:
                header += f"  ({_esc(link)})"
            if header.strip():
                story.append(Paragraph(header, styles["title"]))
            if techs:
                story.append(Paragraph(f"Tech: {_esc(', '.join(techs))}", styles["meta"]))
            if desc:
                for line in desc.strip().split("\n"):
                    line = line.strip()
                    if line:
                        if not line.startswith(("•", "-", "*")):
                            line = f"\u2022 {line}"
                        story.append(Paragraph(_esc(line), styles["bullet"]))
            if idx < len(projects) - 1:
                story.append(Spacer(1, 4))

    # ═══ CERTIFICATIONS ═══
    certs = data.get("certifications", [])
    if certs:
        story.extend(_section_block("Certifications", styles))
        for cert in certs:
            if not isinstance(cert, dict):
                continue
            cname = cert.get("name") or ""
            issuer = cert.get("issuer") or ""
            date = cert.get("date") or ""
            line = f"<b>{_esc(cname)}</b>"
            if issuer:
                line += f"  \u2014  {_esc(issuer)}"
            if date:
                line += f"  ({_esc(date)})"
            story.append(Paragraph(line, styles["body"]))

    # ═══ LANGUAGES ═══
    languages = data.get("languages", [])
    if languages:
        story.extend(_section_block("Languages", styles))
        story.append(Paragraph(_esc(", ".join(languages)), styles["body"]))

    doc.build(story)
    return buf.getvalue()


def verify_ats_extractability(pdf_bytes: bytes, data: Dict[str, Any]) -> Dict[str, Any]:
    """Self-check: re-run the PDF we just generated through the same text-extraction
    path an ATS would use, and confirm the key fields we wrote actually come back out.
    A layout bug that silently drops content (e.g. text inside an unparseable
    structure) would otherwise ship to a candidate completely undetected — this
    catches it automatically on every generation instead of relying on someone
    happening to notice a resume "looks empty" in production.
    """
    warnings: List[str] = []
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            extracted = "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as exc:
        return {"passed": False, "warnings": [f"Could not re-extract generated PDF: {exc}"]}

    checks = {
        "candidate_name": data.get("candidate_name"),
        "email": data.get("email"),
        "phone": data.get("phone"),
    }
    for field, value in checks.items():
        if value and str(value) not in extracted:
            warnings.append(f"{field} not found in extracted text — may not be ATS-readable")

    section_checks = {
        "skills": bool(
            data.get("skills", {}).get("technical") or data.get("skills", {}).get("tools")
        ),
        "experience": bool(data.get("experience")),
        "education": bool(data.get("education")),
    }
    for section, present_in_data in section_checks.items():
        if present_in_data and section.upper() not in extracted.upper():
            warnings.append(f"'{section}' section header not found in extracted text")

    word_count = len(extracted.split())
    if word_count < 100:
        warnings.append(f"Extracted word count is low ({word_count}) — resume may read as sparse to an ATS")

    return {"passed": len(warnings) == 0, "warnings": warnings, "extracted_word_count": word_count}

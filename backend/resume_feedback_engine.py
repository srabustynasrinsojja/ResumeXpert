from __future__ import annotations

from typing import Any, List

from .result_models import ATSScoreResult, CandidateFeedback, InternalFeedback


def _dump_model(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return obj


def _safe_breakdown_score(result: ATSScoreResult, key: str, source: str = "match_breakdown") -> float:
    mapping = getattr(result, source, None) or {}
    component = mapping.get(key)
    if component is None:
        component = result.breakdown.get(key)
    return component.score if component else 0.0


def _top_strengths(result: ATSScoreResult) -> List[str]:
    strengths: List[str] = []
    if result.matched_required_skills:
        strengths.append(f"Matched required skills: {', '.join(result.matched_required_skills[:6])}")
    if result.matched_preferred_skills:
        strengths.append(f"Matched preferred skills: {', '.join(result.matched_preferred_skills[:6])}")
    if _safe_breakdown_score(result, "semantic") >= 70:
        strengths.append("High semantic similarity with the target role.")
    if _safe_breakdown_score(result, "experience") >= 70:
        strengths.append("Experience alignment appears strong.")
    if _safe_breakdown_score(result, "projects") >= 60:
        strengths.append("Projects or certifications reinforce the role match.")
    if result.class_probabilities.get("strong_match", 0.0) >= 0.60:
        strengths.append("Model confidence for strong-match class is high.")
    if result.resume_quality_score >= 70:
        strengths.append("Resume quality is already in a solid ATS-readable range.")
    return strengths or ["The profile shows some relevant overlap with the job."]


def _top_risks(result: ATSScoreResult) -> List[str]:
    risks: List[str] = []
    if result.missing_required_skills:
        risks.append(f"Missing required skills: {', '.join(result.missing_required_skills[:6])}")
    if _safe_breakdown_score(result, "experience") < 50:
        risks.append("Experience requirement looks partially unmet.")
    if _safe_breakdown_score(result, "education") < 50:
        risks.append("Education alignment appears weak or unclear.")
    if _safe_breakdown_score(result, "keywords") < 40:
        risks.append("Important role keywords are underrepresented in the resume.")
    if result.resume_quality_score < 55:
        risks.append("Resume quality is low enough that formatting or evidence clarity may reduce ATS performance.")
    if result.parser_mode != "parser_enhanced_gemini":
        risks.append("Parser enhancement fell back from Gemini, so some structured fields may be approximate.")
    return risks or ["No major risks detected from the current feature set."]


def _decision_bucket(result: ATSScoreResult) -> str:
    if result.combined_score >= 78 and len(result.missing_required_skills) <= 1:
        return "shortlist"
    if result.combined_score >= 55:
        return "review"
    return "reject"


def _accept_reasons(result: ATSScoreResult) -> List[str]:
    reasons: List[str] = []
    if result.matched_required_skills:
        reasons.append(f"Required skill evidence found for: {', '.join(result.matched_required_skills[:5])}")
    if result.job_match_score >= 70:
        reasons.append("Overall job match is strong.")
    if result.resume_quality_score >= 65:
        reasons.append("Resume quality is good enough for confident recruiter review.")
    if _safe_breakdown_score(result, "experience") >= 65:
        reasons.append("Experience evidence aligns with the role expectations.")
    return reasons


def _reject_reasons(result: ATSScoreResult) -> List[str]:
    reasons: List[str] = []
    if result.missing_required_skills:
        reasons.append(f"Critical missing skills: {', '.join(result.missing_required_skills[:5])}")
    if result.job_match_score < 50:
        reasons.append("Job match score is currently low.")
    if result.resume_quality_score < 50:
        reasons.append("Resume quality needs improvement before reliable screening.")
    if _safe_breakdown_score(result, "keywords") < 40:
        reasons.append("Role-specific keyword coverage is weak.")
    return reasons


def _reviewer_questions(result: ATSScoreResult) -> List[str]:
    questions: List[str] = []
    if result.missing_required_skills:
        questions.append("Ask whether the candidate has hands-on exposure to the missing required skills.")
    if _safe_breakdown_score(result, "projects") >= 55:
        questions.append("Ask the candidate to explain one project that best matches this role.")
    if _safe_breakdown_score(result, "experience") < 60:
        questions.append("Clarify role scope, years of experience, and level of ownership.")
    if result.resume_quality_score < 60:
        questions.append("Probe whether omitted achievements exist but were not written clearly in the resume.")
    return questions or ["Validate the strongest matched skills with a recent example."]


def _interview_probe_points(result: ATSScoreResult) -> List[str]:
    probes: List[str] = []
    for skill in result.matched_required_skills[:3]:
        probes.append(f"Ask for a concrete example demonstrating {skill} in a recent project.")
    if result.missing_required_skills:
        probes.append(
            f"Verify actual exposure to missing skills such as {', '.join(result.missing_required_skills[:3])}."
        )
    if _safe_breakdown_score(result, "semantic") >= 70 and _safe_breakdown_score(result, "keywords") < 55:
        probes.append(
            "Candidate language aligns semantically; ask whether stronger domain keywords were intentionally omitted."
        )
    return probes[:5]


def generate_internal_feedback(parsed_resume: Any, parsed_job: Any, result: ATSScoreResult) -> InternalFeedback:
    _ = (parsed_resume, parsed_job)
    strengths = _top_strengths(result)
    risks = _top_risks(result)
    decision_bucket = _decision_bucket(result)
    accept_reasons = _accept_reasons(result)
    reject_reasons = _reject_reasons(result)
    reviewer_questions = _reviewer_questions(result)
    interview_probe_points = _interview_probe_points(result)

    if decision_bucket == "shortlist":
        recommendation = "Prioritize for shortlist or recruiter review."
        next_actions = ["Move to shortlist.", "Schedule recruiter call."]
    elif decision_bucket == "review":
        recommendation = "Consider after manual review of missing skills and recent role alignment."
        next_actions = ["Manual review by recruiter.", "Compare against top-ranked candidates."]
    else:
        recommendation = "Do not prioritize unless the role is flexible or the candidate pool is limited."
        next_actions = ["Keep as backup candidate.", "Re-evaluate only for related roles."]

    summary = (
        f"Candidate classified as {result.match_label}. Resume quality is {result.resume_quality_score:.2f}, "
        f"job match is {result.job_match_score:.2f}, and combined score is {result.combined_score:.2f}. "
        f"Legacy score is {result.legacy_ats_score:.2f}, ML score is {result.ml_score:.2f}, "
        f"and parser mode is {result.parser_mode}."
    )

    evidence = {
        "score_summary": _dump_model(result.score_summary),
        "class_probabilities": result.class_probabilities,
        "parser_mode": result.parser_mode,
        "parser_sources": result.parser_sources,
        "matched_required_skills": result.matched_required_skills,
        "missing_required_skills": result.missing_required_skills,
        "matched_keywords": result.matched_keywords,
        "quality_breakdown": {key: _dump_model(value) for key, value in result.quality_breakdown.items()},
        "match_breakdown": {key: _dump_model(value) for key, value in result.match_breakdown.items()},
    }

    return InternalFeedback(
        summary=summary,
        match_label=result.match_label,
        ats_score=result.ats_score,
        resume_quality_score=result.resume_quality_score,
        job_match_score=result.job_match_score,
        combined_score=result.combined_score,
        recommendation=recommendation,
        decision_bucket=decision_bucket,
        strengths=strengths,
        risks=risks,
        accept_reasons=accept_reasons,
        reject_reasons=reject_reasons,
        reviewer_questions=reviewer_questions,
        interview_probe_points=interview_probe_points,
        next_actions=next_actions,
        evidence=evidence,
    )


def generate_candidate_feedback(parsed_resume: Any, parsed_job: Any, result: ATSScoreResult) -> CandidateFeedback:
    _ = (parsed_resume, parsed_job)
    strengths: List[str] = []
    if result.matched_required_skills:
        strengths.append(f"You already match these important skills: {', '.join(result.matched_required_skills[:6])}")
    if result.matched_preferred_skills:
        strengths.append(f"You also match these preferred skills: {', '.join(result.matched_preferred_skills[:6])}")
    if _safe_breakdown_score(result, "semantic") >= 70:
        strengths.append("Your resume language is closely aligned with the job description.")
    if _safe_breakdown_score(result, "experience") >= 70:
        strengths.append("Your experience level appears well aligned with the role.")
    if _safe_breakdown_score(result, "projects") >= 60:
        strengths.append("Your projects or certifications reinforce your profile.")
    if result.resume_quality_score >= 70:
        strengths.append("Your resume already has a decent ATS foundation.")
    if not strengths:
        strengths.append("Your resume shows some transferable alignment with the job.")

    general_improvement_areas: List[str] = []
    if result.resume_quality_score < 60:
        general_improvement_areas.append(
            "Improve overall ATS readability by making skills, experience, and education easier to detect."
        )
    if _safe_breakdown_score(result, "experience") < 50:
        general_improvement_areas.append("Clarify years of experience and similar responsibilities more explicitly.")
    if _safe_breakdown_score(result, "projects") < 45:
        general_improvement_areas.append("Add stronger project bullets with outcomes, tools, and measurable impact.")
    if _safe_breakdown_score(result, "education") < 50:
        general_improvement_areas.append("Mention relevant degree, coursework, or certifications more clearly.")
    if not general_improvement_areas:
        general_improvement_areas.append(
            "Focus on quantifying outcomes and tightening section clarity to make the resume stronger overall."
        )

    job_specific_improvement_areas: List[str] = []
    if result.missing_required_skills:
        job_specific_improvement_areas.append(
            f"Add evidence for these missing required skills if you truly have them: {', '.join(result.missing_required_skills[:6])}"
        )
    if result.missing_keywords:
        job_specific_improvement_areas.append(
            f"Include more role-specific keywords such as: {', '.join(result.missing_keywords[:8])}"
        )
    if not job_specific_improvement_areas:
        job_specific_improvement_areas.append("This job is already reasonably aligned; minor tailoring should be enough.")

    improvement_areas = general_improvement_areas + job_specific_improvement_areas
    suggested_skills = result.missing_required_skills[:8] or result.missing_preferred_skills[:8]
    suggested_keywords = result.missing_keywords[:10]

    rebuild_focus_areas: List[str] = []
    if result.resume_quality_score < 60:
        rebuild_focus_areas.append("Base ATS resume quality")
    if result.missing_required_skills:
        rebuild_focus_areas.append("Evidence for missing required skills")
    if result.missing_keywords:
        rebuild_focus_areas.append("Role-specific keyword coverage")
    if not rebuild_focus_areas:
        rebuild_focus_areas.append("Achievement quantification")

    next_steps = [
        "Strengthen the base resume first so it works across multiple jobs.",
        "Then tailor the summary and top skills section for this specific role.",
        "Quantify achievements with metrics wherever possible.",
    ]
    if suggested_skills:
        next_steps.append("Highlight projects or coursework that prove the missing skills.")

    if result.match_label == "strong_match":
        encouragement = "You are already a strong fit. A little tailoring can make the application even stronger."
    elif result.match_label == "moderate_match":
        encouragement = "You have a solid base. Addressing a few gaps could noticeably improve your score."
    else:
        encouragement = (
            "This role may be a stretch right now, but improving the base resume and adding proof of relevant skills can help."
        )

    summary = (
        f"Your base resume quality score is {result.resume_quality_score:.2f}, this job match score is {result.job_match_score:.2f}, "
        f"and the combined screening score is {result.combined_score:.2f}."
    )

    return CandidateFeedback(
        summary=summary,
        match_label=result.match_label,
        ats_score=result.ats_score,
        resume_quality_score=result.resume_quality_score,
        job_match_score=result.job_match_score,
        combined_score=result.combined_score,
        strengths=strengths,
        improvement_areas=improvement_areas,
        general_improvement_areas=general_improvement_areas,
        job_specific_improvement_areas=job_specific_improvement_areas,
        suggested_skills=suggested_skills,
        suggested_keywords=suggested_keywords,
        next_steps=next_steps,
        rebuild_focus_areas=rebuild_focus_areas,
        encouragement=encouragement,
    )



def generate_resume_quality_feedback(parsed_resume: Any, result: ATSScoreResult) -> CandidateFeedback:
    _ = parsed_resume
    strengths: List[str] = []
    if result.resume_quality_score >= 75:
        strengths.append("Your resume is already in a strong ATS-friendly range.")
    if result.quality_breakdown.get("contact") and result.quality_breakdown["contact"].score >= 75:
        strengths.append("Contact information is clearly visible.")
    if result.quality_breakdown.get("sections") and result.quality_breakdown["sections"].score >= 70:
        strengths.append("Core resume sections are present and easier for ATS systems to detect.")
    if result.quality_breakdown.get("achievements") and result.quality_breakdown["achievements"].score >= 60:
        strengths.append("Achievement writing is reasonably strong.")
    if not strengths:
        strengths.append("Your resume has a workable base, but it can be strengthened further.")

    general_improvement_areas: List[str] = []
    if result.quality_breakdown.get("contact") and result.quality_breakdown["contact"].score < 70:
        general_improvement_areas.append("Add clear contact details such as email, phone, LinkedIn, or portfolio.")
    if result.quality_breakdown.get("sections") and result.quality_breakdown["sections"].score < 70:
        general_improvement_areas.append("Make core sections like summary, skills, experience, and education easier to detect.")
    if result.quality_breakdown.get("achievements") and result.quality_breakdown["achievements"].score < 60:
        general_improvement_areas.append("Rewrite bullets using action verbs and measurable outcomes.")
    if result.quality_breakdown.get("readability") and result.quality_breakdown["readability"].score < 60:
        general_improvement_areas.append("Improve readability with cleaner formatting, shorter dense paragraphs, and balanced length.")
    if result.quality_breakdown.get("skills_clarity") and result.quality_breakdown["skills_clarity"].score < 60:
        general_improvement_areas.append("Add a clearer skills section near the top of the resume.")
    if not general_improvement_areas:
        general_improvement_areas.append("Focus on quantifying achievements and polishing layout for an even stronger ATS profile.")

    next_steps = [
        "Keep one strong base resume version in the system.",
        "After improving the base resume, tailor it only when a specific job description is available.",
        "Save each improved version so you can track score changes over time.",
    ]

    encouragement = (
        "Your base resume is improving. Keep refining evidence and clarity so it performs well across many jobs."
        if result.resume_quality_score >= 60
        else "Start by fixing structure, contact info, and measurable bullets. Small changes can improve ATS performance quickly."
    )

    return CandidateFeedback(
        summary=f"Your base resume quality score is {result.resume_quality_score:.2f}.",
        match_label=result.match_label,
        ats_score=result.ats_score,
        resume_quality_score=result.resume_quality_score,
        job_match_score=0.0,
        combined_score=result.resume_quality_score,
        strengths=strengths,
        improvement_areas=general_improvement_areas,
        general_improvement_areas=general_improvement_areas,
        job_specific_improvement_areas=[],
        suggested_skills=[],
        suggested_keywords=[],
        next_steps=next_steps,
        rebuild_focus_areas=["Base ATS resume quality", "Achievement clarity", "Section completeness"],
        encouragement=encouragement,
    )

# ATS Resume Screening Platform

AI-powered resume screening system with dual scoring (resume quality + job match), candidate feedback, HR shortlisting, and resume version tracking.

## Features

**For Candidates (Users):**
- Upload CV or fill form to build a structured resume profile
- Get ATS quality score with detailed breakdown (contact, sections, achievements, readability, skills)
- Get improvement feedback with suggested skills and keywords
- Match resume against a specific job description (optional)
- Track resume versions and compare improvements over time

**For HR / Recruiters:**
- Upload multiple CVs (or a zip file) with a job description
- Auto-rank candidates: shortlist / review / reject
- Get accept/reject reasons for each candidate
- View interview probe points for viva preparation
- See candidate improvement history across resume versions

## Tech Stack

- **Backend:** Python, FastAPI, Pydantic v2
- **ML:** scikit-learn, sentence-transformers, TF-IDF
- **Parsing:** Gemini AI (with local fallback), pdfplumber, python-docx
- **Frontend:** React, Vite, Tailwind CSS (in progress)

## Setup

### Backend

```bash
# Clone the repo
git clone <repo-url>
cd myproject

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Copy env file and add your Gemini API key
cp .env.example .env

# Run the server
uvicorn backend.main:app --reload --port 8000
```

### Frontend (coming soon)

```bash
cd frontend
npm install
npm run dev
```

## API Docs

Once the backend is running, visit: `http://localhost:8000/docs`

## Scoring System

The platform uses a dual-score approach:
- **Resume Quality Score (0-100):** How well-structured is the resume for ATS systems
- **Job Match Score (0-100):** How well does the resume match a specific job description
- **Combined Score:** 45% quality + 55% match
- **Ranking Score:** ML model confidence for candidate ranking

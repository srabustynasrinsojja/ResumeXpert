from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from utils.feature_engineering import clipped_similarity, keyword_overlap_score, normalize_text

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIRS = [PROJECT_ROOT / "models" / "saved", PROJECT_ROOT / "models"]


DEFAULT_FEATURE_COLUMNS = [
    "title_match_score",
    "keyword_overlap",
    "required_skill_coverage",
    "preferred_skill_coverage",
    "missing_required_skill_ratio",
    "resume_years_detected",
    "job_min_years",
    "experience_match_score",
    "resume_education_rank",
    "job_education_rank",
    "education_match_score",
    "resume_word_count",
    "job_word_count",
    "length_ratio",
    "embedding_similarity",
    "tfidf_similarity",
    "project_relevance_score",
    "certification_relevance_score",
]


class _HeuristicFallbackModel:
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        rows = np.asarray(X, dtype=float)
        if rows.ndim == 1:
            rows = rows.reshape(1, -1)

        probs = []
        for row in rows:
            values = row.tolist()
            named = {
                name: float(values[idx]) if idx < len(values) else 0.0
                for idx, name in enumerate(DEFAULT_FEATURE_COLUMNS)
            }
            strong = clipped_similarity(
                0.28 * named.get("required_skill_coverage", 0.0)
                + 0.10 * named.get("preferred_skill_coverage", 0.0)
                + 0.16 * named.get("experience_match_score", 0.0)
                + 0.10 * named.get("education_match_score", 0.0)
                + 0.14 * named.get("embedding_similarity", 0.0)
                + 0.10 * named.get("tfidf_similarity", 0.0)
                + 0.07 * named.get("project_relevance_score", 0.0)
                + 0.05 * named.get("certification_relevance_score", 0.0)
                - 0.10 * named.get("missing_required_skill_ratio", 0.0)
            )
            poor = clipped_similarity(0.80 - strong)
            moderate = clipped_similarity(1.0 - abs(strong - 0.52) * 1.9)
            raw = np.asarray([poor, moderate, strong], dtype=float)
            total = float(raw.sum())
            if total <= 0:
                raw = np.asarray([0.2, 0.6, 0.2], dtype=float)
                total = float(raw.sum())
            probs.append(raw / total)
        return np.asarray(probs, dtype=float)


def _fallback_bundle() -> Dict[str, Any]:
    return {
        "model": _HeuristicFallbackModel(),
        "model_name": "heuristic_fallback_model",
        "feature_columns": list(DEFAULT_FEATURE_COLUMNS),
        "label_map": {0: "poor_match", 1: "moderate_match", 2: "strong_match"},
        "scaler": None,
    }


def _first_existing(relative_name: str) -> Optional[Path]:
    for base in MODEL_DIRS:
        candidate = base / relative_name
        if candidate.exists():
            return candidate
    return None


def _load_json(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_model_bundle(bundle_path: Optional[str] = None) -> Dict[str, Any]:
    path = Path(bundle_path) if bundle_path else _first_existing("best_model_bundle.joblib")
    if path is None or not path.exists():
        return _fallback_bundle()
    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or "model" not in bundle:
        raise ValueError("Model bundle must be a dict containing at least a 'model' key.")
    return bundle


@lru_cache(maxsize=1)
def load_feature_columns() -> List[str]:
    bundle = load_model_bundle()
    cols = bundle.get("feature_columns") or bundle.get("feature_cols")
    if cols:
        return list(cols)
    json_path = _first_existing("feature_columns.json")
    if json_path is not None:
        return list(_load_json(json_path))
    return list(DEFAULT_FEATURE_COLUMNS)


@lru_cache(maxsize=1)
def load_label_map() -> Dict[int, str]:
    bundle = load_model_bundle()
    raw = bundle.get("label_map") or {0: "poor_match", 1: "moderate_match", 2: "strong_match"}
    label_map: Dict[int, str] = {}
    for key, value in raw.items():
        try:
            label_map[int(key)] = str(value)
        except Exception:
            continue
    return dict(sorted(label_map.items(), key=lambda x: x[0]))


@lru_cache(maxsize=1)
def load_scaler() -> Any:
    bundle = load_model_bundle()
    return bundle.get("scaler")


@lru_cache(maxsize=1)
def load_tfidf_vectorizer() -> Optional[Any]:
    path = _first_existing("tfidf_vectorizer.pkl")
    if path is None:
        return None
    try:
        return joblib.load(path)
    except Exception:
        return None


@lru_cache(maxsize=1)
def load_embedding_config() -> Dict[str, Any]:
    path = _first_existing("embedding_config.json")
    if path is None:
        return {}
    try:
        return _load_json(path)
    except Exception:
        return {}


@lru_cache(maxsize=1)
def load_sentence_transformer() -> Any:
    cfg = load_embedding_config()
    model_name = (
        cfg.get("model_name")
        or cfg.get("embedding_model_name")
        or cfg.get("sentence_transformer_model")
        or cfg.get("model")
        or cfg.get("local_model_path")
    )
    if not model_name:
        return None
    try:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(model_name)
    except Exception:
        return None


@lru_cache(maxsize=1)
def load_runtime_assets() -> Dict[str, Any]:
    bundle = load_model_bundle()
    return {
        "bundle": bundle,
        "model": bundle["model"],
        "model_name": bundle.get("model_name", bundle["model"].__class__.__name__),
        "feature_columns": load_feature_columns(),
        "label_map": load_label_map(),
        "scaler": load_scaler(),
        "tfidf_vectorizer": load_tfidf_vectorizer(),
        "embedding_model": load_sentence_transformer(),
        "embedding_config": load_embedding_config(),
    }


def ensure_feature_order(feature_dict: Dict[str, Any], feature_columns: List[str]) -> np.ndarray:
    row = []
    for col in feature_columns:
        value = feature_dict.get(col, 0.0)
        if isinstance(value, bool):
            value = float(value)
        try:
            row.append(float(value))
        except Exception:
            row.append(0.0)
    return np.asarray(row, dtype=float).reshape(1, -1)


def compute_tfidf_similarity(text_a: str, text_b: str) -> float:
    text_a = normalize_text(text_a)
    text_b = normalize_text(text_b)
    if not text_a or not text_b:
        return 0.0

    vectorizer = load_tfidf_vectorizer()
    try:
        if vectorizer is not None:
            mat = vectorizer.transform([text_a, text_b])
            score = cosine_similarity(mat[0], mat[1])[0, 0]
            return clipped_similarity(float(score))
    except Exception:
        pass

    fallback = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    mat = fallback.fit_transform([text_a, text_b])
    score = cosine_similarity(mat[0], mat[1])[0, 0]
    return clipped_similarity(float(score))


def _fallback_embedding_similarity(text_a: str, text_b: str) -> float:
    text_a = normalize_text(text_a)
    text_b = normalize_text(text_b)
    if not text_a or not text_b:
        return 0.0
    lexical = keyword_overlap_score(text_a, text_b)
    char_vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1)
    mat = char_vec.fit_transform([text_a, text_b])
    char_score = cosine_similarity(mat[0], mat[1])[0, 0]
    return clipped_similarity(0.55 * lexical + 0.45 * float(char_score))


def compute_embedding_similarity(text_a: str, text_b: str) -> float:
    text_a = normalize_text(text_a)
    text_b = normalize_text(text_b)
    if not text_a or not text_b:
        return 0.0

    model = load_sentence_transformer()
    if model is not None:
        try:
            embeddings = model.encode([text_a, text_b], normalize_embeddings=True)
            score = float(np.dot(embeddings[0], embeddings[1]))
            return clipped_similarity(score)
        except Exception:
            pass

    return _fallback_embedding_similarity(text_a, text_b)


def predict_probabilities(feature_matrix: np.ndarray) -> np.ndarray:
    assets = load_runtime_assets()
    model = assets["model"]
    scaler = assets.get("scaler")

    X = feature_matrix
    if scaler is not None:
        try:
            X = scaler.transform(X)
        except Exception:
            pass

    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)
        return np.asarray(probs[0], dtype=float)

    if hasattr(model, "decision_function"):
        scores = np.asarray(model.decision_function(X), dtype=float)
        if scores.ndim == 1:
            scores = np.vstack([-scores, scores]).T
        scores = scores[0]
        shifted = scores - np.max(scores)
        exp_scores = np.exp(shifted)
        probs = exp_scores / np.sum(exp_scores)
        return np.asarray(probs, dtype=float)

    pred = model.predict(X)
    label_map = load_label_map()
    n_classes = len(label_map)
    probs = np.zeros(n_classes, dtype=float)
    try:
        probs[int(pred[0])] = 1.0
    except Exception:
        probs[0] = 1.0
    return probs

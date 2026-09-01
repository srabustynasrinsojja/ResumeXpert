"""Shared helper utilities used across backend modules."""

from __future__ import annotations

from typing import Any, Dict, List


def model_dump_compat(obj: Any) -> Dict[str, Any]:
    """Convert a Pydantic model, dict, or arbitrary object to a plain dict."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    if isinstance(obj, dict):
        return obj
    # Fallback: extract public non-callable attributes.
    data: Dict[str, Any] = {}
    for attr in dir(obj):
        if attr.startswith("_"):
            continue
        try:
            value = getattr(obj, attr)
        except Exception:
            continue
        if callable(value):
            continue
        data[attr] = value
    return data


def flatten_text(value: Any) -> str:
    """Recursively flatten a nested structure into a single space-joined string."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        return " ".join(flatten_text(v) for v in value.values() if v not in (None, "", [], {}))
    if isinstance(value, (list, tuple, set)):
        return " ".join(flatten_text(v) for v in value if v not in (None, "", [], {}))
    return str(value)

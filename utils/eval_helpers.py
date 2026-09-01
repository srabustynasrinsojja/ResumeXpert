from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.preprocessing import label_binarize


def ensure_parent_dir(path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def evaluate_multiclass_metrics(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    y_prob: Optional[np.ndarray] = None,
    labels: Sequence[int] = (0, 1, 2),
    target_names: Sequence[str] = ("poor_match", "moderate_match", "strong_match"),
) -> Dict[str, object]:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    metrics: Dict[str, object] = {
        "accuracy": accuracy_score(y_true, y_pred),
        "precision_macro": precision_score(y_true, y_pred, average="macro", zero_division=0),
        "recall_macro": recall_score(y_true, y_pred, average="macro", zero_division=0),
        "f1_macro": f1_score(y_true, y_pred, average="macro", zero_division=0),
        "precision_weighted": precision_score(y_true, y_pred, average="weighted", zero_division=0),
        "recall_weighted": recall_score(y_true, y_pred, average="weighted", zero_division=0),
        "f1_weighted": f1_score(y_true, y_pred, average="weighted", zero_division=0),
    }

    if y_prob is not None:
        y_true_bin = label_binarize(y_true, classes=list(labels))
        metrics["roc_auc_ovr_macro"] = roc_auc_score(y_true_bin, y_prob, multi_class="ovr", average="macro")
        metrics["roc_auc_ovr_weighted"] = roc_auc_score(y_true_bin, y_prob, multi_class="ovr", average="weighted")
    else:
        metrics["roc_auc_ovr_macro"] = np.nan
        metrics["roc_auc_ovr_weighted"] = np.nan

    metrics["confusion_matrix"] = confusion_matrix(y_true, y_pred, labels=list(labels))
    metrics["classification_report"] = classification_report(
        y_true,
        y_pred,
        labels=list(labels),
        target_names=list(target_names),
        output_dict=True,
        zero_division=0,
    )
    return metrics


def plot_confusion_matrix(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    labels: Sequence[int] = (0, 1, 2),
    display_labels: Sequence[str] = ("poor_match", "moderate_match", "strong_match"),
    title: str = "Confusion Matrix",
    save_path: Optional[str | Path] = None,
):
    fig, ax = plt.subplots(figsize=(6, 5))
    ConfusionMatrixDisplay.from_predictions(
        y_true,
        y_pred,
        labels=list(labels),
        display_labels=list(display_labels),
        cmap="Blues",
        ax=ax,
        colorbar=False,
    )
    ax.set_title(title)
    plt.tight_layout()
    if save_path is not None:
        ensure_parent_dir(save_path)
        fig.savefig(save_path, dpi=300, bbox_inches="tight")
    return fig


def plot_model_comparison(
    results_df: pd.DataFrame,
    metric_col: str,
    title: str,
    save_path: Optional[str | Path] = None,
):
    ordered = results_df.sort_values(metric_col, ascending=False)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(ordered["model_name"], ordered[metric_col])
    ax.set_title(title)
    ax.set_ylabel(metric_col)
    ax.set_xlabel("Model")
    ax.tick_params(axis="x", rotation=20)
    for idx, row in ordered.reset_index(drop=True).iterrows():
        ax.text(idx, row[metric_col] + 0.01, f"{row[metric_col]:.3f}", ha="center", va="bottom", fontsize=9)
    ax.set_ylim(0, min(1.05, max(0.1, ordered[metric_col].max() + 0.12)))
    plt.tight_layout()
    if save_path is not None:
        ensure_parent_dir(save_path)
        fig.savefig(save_path, dpi=300, bbox_inches="tight")
    return fig


def plot_multiclass_roc(
    y_true: Sequence[int],
    y_prob: np.ndarray,
    labels: Sequence[int] = (0, 1, 2),
    display_labels: Sequence[str] = ("poor_match", "moderate_match", "strong_match"),
    title: str = "Multiclass ROC Curve (OvR)",
    save_path: Optional[str | Path] = None,
):
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    y_true_bin = label_binarize(y_true, classes=list(labels))

    fig, ax = plt.subplots(figsize=(7, 6))
    for i, label_name in enumerate(display_labels):
        fpr, tpr, _ = roc_curve(y_true_bin[:, i], y_prob[:, i])
        auc_val = roc_auc_score(y_true_bin[:, i], y_prob[:, i])
        ax.plot(fpr, tpr, label=f"{label_name} (AUC={auc_val:.3f})")
    ax.plot([0, 1], [0, 1], linestyle="--", linewidth=1)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title(title)
    ax.legend(loc="lower right")
    plt.tight_layout()
    if save_path is not None:
        ensure_parent_dir(save_path)
        fig.savefig(save_path, dpi=300, bbox_inches="tight")
    return fig


def save_classification_report(report_dict: Dict[str, object], save_path: str | Path) -> pd.DataFrame:
    report_df = pd.DataFrame(report_dict).T
    save_path = ensure_parent_dir(save_path)
    report_df.to_csv(save_path)
    return report_df


def get_feature_importance_dataframe(model, X: pd.DataFrame, y: Sequence[int], feature_names: Sequence[str]) -> pd.DataFrame:
    if hasattr(model, "feature_importances_"):
        importances = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, "coef_"):
        coef = np.asarray(model.coef_, dtype=float)
        if coef.ndim == 2:
            importances = np.mean(np.abs(coef), axis=0)
        else:
            importances = np.abs(coef)
    else:
        perm = permutation_importance(model, X, y, n_repeats=8, random_state=42, scoring="f1_macro")
        importances = perm.importances_mean

    feat_df = pd.DataFrame({"feature": list(feature_names), "importance": importances})
    feat_df = feat_df.sort_values("importance", ascending=False).reset_index(drop=True)
    return feat_df


def plot_feature_importance(
    importance_df: pd.DataFrame,
    top_n: int = 12,
    title: str = "Feature Importance",
    save_path: Optional[str | Path] = None,
):
    data = importance_df.head(top_n).sort_values("importance")
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.barh(data["feature"], data["importance"])
    ax.set_title(title)
    ax.set_xlabel("Importance")
    plt.tight_layout()
    if save_path is not None:
        ensure_parent_dir(save_path)
        fig.savefig(save_path, dpi=300, bbox_inches="tight")
    return fig

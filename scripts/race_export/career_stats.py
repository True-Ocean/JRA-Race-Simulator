"""馬ごとの格付けレース実績と class_index / stamina_efficiency。"""

from __future__ import annotations

import math

import pandas as pd

from .config import (
    CAREER_CLASS_WEIGHTS,
    CAREER_FINISH_SPAN,
    CAREER_GRADED_EXPERIENCE_RUNS,
    CAREER_STAMINA_EFFICIENCY_EXPERIENCE_WEIGHT,
    CAREER_STAMINA_EFFICIENCY_QUALITY_WEIGHT,
    CLASS_INDEX_MAX_DELTA_SEC,
    GOAL_CLASS_G1_BLEND,
    LAST_3F_MAX,
    LAST_3F_MIN,
)
from .grade import GRADED_BUCKETS, bucket_grade


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _finish_score(avg_finish: float) -> float:
    return _clamp01(1.0 - (avg_finish - 1.0) / CAREER_FINISH_SPAN)


def _bucket_stats(records: pd.DataFrame, bucket: str) -> dict:
    subset = records[records["grade_bucket"] == bucket]
    finishes = subset["着順"].dropna().astype(float)
    runs = int(len(finishes))
    if runs == 0:
        return {"runs": 0, "wins": 0, "top3": 0, "avg_finish": None}

    wins = int((finishes == 1).sum())
    top3 = int(((finishes >= 1) & (finishes <= 3)).sum())
    return {
        "runs": runs,
        "wins": wins,
        "top3": top3,
        "avg_finish": round(float(finishes.mean()), 2),
    }


def _g1_class_score(graded: dict) -> float | None:
    g1 = graded.get("G1", {})
    runs = g1.get("runs", 0)
    if runs <= 0:
        return None
    avg_finish = g1.get("avg_finish")
    finish_sc = _finish_score(avg_finish) if avg_finish is not None else 0.45
    win_bonus = min(g1.get("wins", 0), 2) * 0.1
    confidence = min(runs / 2.0, 1.0)
    return _clamp01((finish_sc * 0.8 + win_bonus) * confidence)


def _bucket_component(bucket_stat: dict, weight: float) -> tuple[float, float]:
    runs = bucket_stat["runs"]
    if runs <= 0:
        return 0.0, 0.0

    avg_finish = bucket_stat["avg_finish"]
    finish_score = _finish_score(avg_finish) if avg_finish is not None else 0.45
    win_bonus = min(bucket_stat["wins"], 2) * 0.08
    confidence = min(runs / 2.0, 1.0)
    score = (finish_score * 0.75 + win_bonus) * confidence
    return score * weight, weight


def aggregate_career(records: pd.DataFrame) -> dict:
    if records.empty:
        empty_graded = {b: _bucket_stats(records, b) for b in GRADED_BUCKETS}
        return {
            "runs_all": 0,
            "win_rate": 0.0,
            "top3_rate": 0.0,
            "peak_grade": None,
            "class_index": 0.5,
            "g1_class_score": None,
            "goal_class_index": 0.5,
            "stamina_efficiency": 0.5,
            "graded": empty_graded,
        }

    work = records.copy()
    if "クラス名" in work.columns:
        work["grade_bucket"] = work["クラス名"].apply(bucket_grade)
    else:
        work["grade_bucket"] = "OTHER"

    graded = {b: _bucket_stats(work, b) for b in GRADED_BUCKETS}
    finishes_all = work["着順"].dropna().astype(float)
    runs_all = int(len(finishes_all))
    wins_all = int((finishes_all == 1).sum()) if runs_all else 0
    top3_all = int(((finishes_all >= 1) & (finishes_all <= 3)).sum()) if runs_all else 0

    win_rate = wins_all / runs_all if runs_all else 0.0
    top3_rate = top3_all / runs_all if runs_all else 0.0

    score_sum = 0.0
    weight_sum = 0.0
    for bucket in ("G1", "G2", "G3"):
        component, weight = _bucket_component(graded[bucket], CAREER_CLASS_WEIGHTS[bucket])
        score_sum += component
        weight_sum += weight

    class_index = score_sum / weight_sum if weight_sum > 0 else 0.5
    class_index = _clamp01(class_index)

    graded_runs = sum(graded[b]["runs"] for b in GRADED_BUCKETS)
    graded_top3 = sum(graded[b]["top3"] for b in GRADED_BUCKETS)
    graded_top3_rate = graded_top3 / graded_runs if graded_runs else top3_rate
    experience = min(graded_runs / CAREER_GRADED_EXPERIENCE_RUNS, 1.0)
    quality = 0.5 * class_index + 0.5 * _clamp01(graded_top3_rate)
    stamina_efficiency = _clamp01(
        CAREER_STAMINA_EFFICIENCY_EXPERIENCE_WEIGHT * experience
        + CAREER_STAMINA_EFFICIENCY_QUALITY_WEIGHT * quality
    )

    peak_grade = None
    for bucket in ("G1", "G2", "G3", "OP"):
        if graded[bucket]["runs"] > 0:
            peak_grade = bucket
            break

    g1_class_score = _g1_class_score(graded)
    if g1_class_score is not None:
        goal_class_index = _clamp01(
            GOAL_CLASS_G1_BLEND * g1_class_score + (1 - GOAL_CLASS_G1_BLEND) * class_index
        )
    else:
        goal_class_index = class_index

    return {
        "runs_all": runs_all,
        "win_rate": round(win_rate, 3),
        "top3_rate": round(top3_rate, 3),
        "peak_grade": peak_grade,
        "class_index": round(class_index, 3),
        "g1_class_score": round(g1_class_score, 3) if g1_class_score is not None else None,
        "goal_class_index": round(goal_class_index, 3),
        "stamina_efficiency": round(stamina_efficiency, 3),
        "graded": graded,
    }


def apply_class_index_to_last3f(last_3f_raw: float | None, class_index: float) -> float | None:
    if last_3f_raw is None or (isinstance(last_3f_raw, float) and math.isnan(last_3f_raw)):
        return None
    delta = CLASS_INDEX_MAX_DELTA_SEC * _clamp01(class_index)
    adjusted = float(last_3f_raw) - delta
    return round(max(LAST_3F_MIN, min(LAST_3F_MAX, adjusted)), 1)

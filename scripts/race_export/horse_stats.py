from collections import Counter
from statistics import median

import pandas as pd

from .career_stats import aggregate_career, apply_class_index_to_last3f
from .config import (
    DEFAULT_AVE_3F,
    DEFAULT_LAST_3F,
    DEFAULT_STYLE,
    DEFAULT_TOP3_RATE,
    DEFAULT_WIN_RATE,
    KESSHI_TO_STYLE,
    MAX_RECENT_RUNS,
    MIN_GOOD_RUNS,
)


def kesshi_to_style(kesshi) -> str:
    if kesshi is None or (isinstance(kesshi, float) and pd.isna(kesshi)):
        return DEFAULT_STYLE
    text = str(kesshi).strip()
    return KESSHI_TO_STYLE.get(text, DEFAULT_STYLE)


def _distance_sort_key(distance, target_distance: int) -> tuple:
    if distance is None or (isinstance(distance, float) and pd.isna(distance)):
        return (10**9, 0)
    try:
        d = int(distance)
    except (TypeError, ValueError):
        return (10**9, 0)
    return (abs(d - target_distance), -d)


def _rank_records_by_distance(records: pd.DataFrame, target_distance: int) -> pd.DataFrame:
    if records.empty or target_distance <= 0:
        return records.sort_values("日付", ascending=False)

    work = records.copy()
    if "距離" not in work.columns:
        return work.sort_values("日付", ascending=False)

    work["_dist_key"] = work["距離"].apply(
        lambda d: _distance_sort_key(d, target_distance)[0]
    )
    work["_dist_tie"] = work["距離"].apply(
        lambda d: _distance_sort_key(d, target_distance)[1]
    )
    ranked = work.sort_values(
        ["_dist_key", "日付"],
        ascending=[True, False],
    ).drop(columns=["_dist_key", "_dist_tie"])
    return ranked


def _select_runs(records: pd.DataFrame, target_distance: int = 0) -> pd.DataFrame:
    if records.empty:
        return records

    ranked = _rank_records_by_distance(records, target_distance)
    pool = ranked.head(max(MAX_RECENT_RUNS * 2, MAX_RECENT_RUNS))
    good = pool[pool["着順"].notna() & (pool["着順"] <= 3)]
    if len(good) >= MIN_GOOD_RUNS:
        selected = good.head(MAX_RECENT_RUNS)
    else:
        selected = pool.head(MAX_RECENT_RUNS)
    return selected


def _stat_range(series: pd.Series) -> dict | None:
    values = series.dropna().astype(float)
    if values.empty:
        return None
    return {
        "min": round(float(values.min()), 1),
        "max": round(float(values.max()), 1),
        "avg": round(float(values.mean()), 1),
    }


def _pair_aggregate(selected: pd.DataFrame) -> tuple[dict | None, dict | None, float | None]:
    """同一走集合から Ave / 上りをペアとして平均。距離乖離の参考値も返す。"""
    if selected.empty:
        return None, None, None

    pairs = selected[["Ave-3F", "上り3F"]].dropna(how="all")
    if pairs.empty:
        return None, None, None

    ave_range = _stat_range(selected["Ave-3F"])
    last_range = _stat_range(selected["上り3F"])
    dist_bias = None
    if "距離" in selected.columns:
        dists = selected["距離"].dropna()
        if not dists.empty and "距離" in selected.columns:
            try:
                dist_bias = round(float(dists.astype(float).mean()), 0)
            except (TypeError, ValueError):
                dist_bias = None

    return ave_range, last_range, dist_bias


def _resolve_style(records: pd.DataFrame) -> str:
    if records.empty:
        return DEFAULT_STYLE

    ordered = records.sort_values("日付", ascending=False)
    styles = [kesshi_to_style(v) for v in ordered["決手"]]
    counts = Counter(styles)
    max_count = max(counts.values())
    candidates = {style for style, count in counts.items() if count == max_count}
    for style in styles:
        if style in candidates:
            return style
    return DEFAULT_STYLE


def _build_results(records: pd.DataFrame) -> list[int]:
    ordered = records.sort_values("日付", ascending=False)
    results = []
    for finish in ordered["着順"]:
        if pd.isna(finish):
            continue
        finish_int = int(finish)
        results.append(finish_int if finish_int <= 3 else 0)
    return results


def aggregate_horse_stats(
    horse_records_df: pd.DataFrame,
    target_distance: int = 0,
    warnings: list[str] | None = None,
) -> dict[str, dict]:
    if horse_records_df.empty:
        return {}

    warn = warnings if warnings is not None else []
    grouped: dict[str, dict] = {}

    for horse_name, group in horse_records_df.groupby("馬名", sort=False):
        career = aggregate_career(group)
        selected = _select_runs(group, target_distance)
        ave_range, last_range, dist_bias = _pair_aggregate(selected)
        last_3f_raw = last_range["avg"] if last_range else None
        last_3f_effective = apply_class_index_to_last3f(
            last_3f_raw,
            career["class_index"],
        )

        if (
            ave_range
            and last_range
            and ave_range["min"] <= ave_range["avg"] <= ave_range["min"] + 0.35
            and last_range["min"] <= last_range["avg"] <= last_range["min"] + 0.35
            and len(selected) >= 2
        ):
            warn.append(
                f"{horse_name}: ave/last both near best-of-selected "
                f"(check distance pairing)"
            )

        grouped[str(horse_name)] = {
            "has_records": True,
            "records_used": int(len(selected)),
            "style": _resolve_style(selected),
            "ave_3f": ave_range["avg"] if ave_range else None,
            "last_3f": last_3f_effective if last_3f_effective is not None else None,
            "last_3f_raw": last_3f_raw,
            "ave_3f_range": ave_range,
            "last_3f_range": last_range,
            "results": _build_results(selected),
            "distance_bias_m": dist_bias,
            "career": career,
        }

    return grouped


def apply_fallbacks(entries: list[dict], warnings: list[str]) -> list[dict]:
    ave_values = [
        e["horse"]["ave_3f"]
        for e in entries
        if e["horse"].get("has_records") and e["horse"].get("ave_3f") is not None
    ]
    last_values = [
        e["horse"]["last_3f"]
        for e in entries
        if e["horse"].get("has_records") and e["horse"].get("last_3f") is not None
    ]

    fallback_ave = median(ave_values) if ave_values else DEFAULT_AVE_3F
    fallback_last = median(last_values) if last_values else DEFAULT_LAST_3F

    win_rates = [e["jockey"]["win_rate"] for e in entries if e["jockey"].get("win_rate") is not None]
    top3_rates = [e["jockey"]["top3_rate"] for e in entries if e["jockey"].get("top3_rate") is not None]
    fallback_win = median(win_rates) if win_rates else DEFAULT_WIN_RATE
    fallback_top3 = median(top3_rates) if top3_rates else DEFAULT_TOP3_RATE

    for entry in entries:
        horse = entry["horse"]
        jockey = entry["jockey"]

        if not horse.get("has_records"):
            horse["has_records"] = False
            horse["records_used"] = 0
            horse["style"] = DEFAULT_STYLE
            horse["ave_3f"] = round(float(fallback_ave), 1)
            horse["last_3f"] = round(float(fallback_last), 1)
            horse["last_3f_raw"] = horse["last_3f"]
            horse["results"] = []
            horse["career"] = {
                "class_index": 0.5,
                "stamina_efficiency": 0.5,
                "runs_all": 0,
                "win_rate": 0.0,
                "top3_rate": 0.0,
                "peak_grade": None,
                "graded": {},
            }
            warnings.append(f"HorseRecords missing: {horse['name']} (fallback applied)")

        if jockey.get("win_rate") is None or jockey.get("top3_rate") is None:
            jockey["win_rate"] = round(float(fallback_win), 2)
            jockey["top3_rate"] = round(float(fallback_top3), 2)
            warnings.append(f"Jockey stats missing: {jockey.get('name', '?')} (fallback applied)")

    return entries

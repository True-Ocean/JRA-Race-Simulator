from collections import Counter
from statistics import median

import pandas as pd

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


def _select_runs(records: pd.DataFrame) -> pd.DataFrame:
    if records.empty:
        return records

    recent = records.sort_values("日付", ascending=False).head(MAX_RECENT_RUNS)
    good = recent[recent["着順"].notna() & (recent["着順"] <= 3)]
    if len(good) >= MIN_GOOD_RUNS:
        return good
    return recent


def _stat_range(series: pd.Series) -> dict | None:
    values = series.dropna().astype(float)
    if values.empty:
        return None
    return {
        "min": round(float(values.min()), 1),
        "max": round(float(values.max()), 1),
        "avg": round(float(values.mean()), 1),
    }


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


def aggregate_horse_stats(horse_records_df: pd.DataFrame) -> dict[str, dict]:
    if horse_records_df.empty:
        return {}

    grouped: dict[str, dict] = {}
    for horse_name, group in horse_records_df.groupby("馬名", sort=False):
        selected = _select_runs(group)
        ave_range = _stat_range(selected["Ave-3F"])
        last_range = _stat_range(selected["上り3F"])

        grouped[str(horse_name)] = {
            "has_records": True,
            "records_used": int(len(selected)),
            "style": _resolve_style(selected),
            "ave_3f": ave_range["avg"] if ave_range else None,
            "last_3f": last_range["avg"] if last_range else None,
            "ave_3f_range": ave_range,
            "last_3f_range": last_range,
            "results": _build_results(selected),
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
            horse["results"] = []
            warnings.append(f"HorseRecords missing: {horse['name']} (fallback applied)")

        if jockey.get("win_rate") is None or jockey.get("top3_rate") is None:
            jockey["win_rate"] = round(float(fallback_win), 2)
            jockey["top3_rate"] = round(float(fallback_top3), 2)
            warnings.append(f"Jockey stats missing: {jockey.get('name', '?')} (fallback applied)")

    return entries

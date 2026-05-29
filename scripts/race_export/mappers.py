import re
from datetime import date, datetime

import pandas as pd

from .config import VENUE_SUFFIX


def normalize_date(value) -> str:
    if value is None:
        raise ValueError("RaceInfo 日付 is empty")
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return text
    if re.match(r"^\d{8}$", text):
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    raise ValueError(f"Unsupported date format: {value!r}")


def date_to_race_id(date_str: str) -> int:
    return int(date_str.replace("-", ""))


def normalize_venue(venue: str) -> str:
    venue = (venue or "").strip()
    if not venue:
        return venue
    if venue.endswith(VENUE_SUFFIX):
        return venue
    return f"{venue}{VENUE_SUFFIX}"


def normalize_grade(grade: str) -> str:
    if not grade:
        return grade
    text = str(grade).strip()
    text = text.translate(str.maketrans("Ｇ１２３", "G123"))
    text = re.sub(r"\s+", "", text)
    match = re.match(r"^G(\d)$", text, re.IGNORECASE)
    if match:
        return f"G{match.group(1)}"
    return text


def build_race_info(row) -> dict:
    date_str = normalize_date(row["日付"])
    distance = int(row["距離"])

    return {
        "race_id": date_to_race_id(date_str),
        "race_info": {
            "date": date_str,
            "venue": normalize_venue(row["競馬場"]),
            "grade": normalize_grade(row["クラス"]),
            "age_condition": str(row["年齢"]).strip(),
            "race_name": str(row["レース名"]).strip(),
            "track": str(row["TD"]).strip(),
            "distance": distance,
            "condition": str(row["状態"]).strip(),
        },
    }


def build_sex_age(sex, age) -> str:
    return f"{str(sex).strip()}{int(age)}"


def percent_to_rate(value) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return round(float(value) / 100.0, 2)
    except (TypeError, ValueError):
        return None

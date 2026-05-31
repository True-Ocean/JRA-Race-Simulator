"""レース格（クラス名）の正規化とグレードバケット分類。"""

import re

import pandas as pd

from .mappers import normalize_grade

GRADED_BUCKETS = ("G1", "G2", "G3", "OP")


def bucket_grade(class_name) -> str:
    if class_name is None or (isinstance(class_name, float) and pd.isna(class_name)):
        return "OTHER"

    text = str(class_name).strip()
    if not text:
        return "OTHER"

    normalized = normalize_grade(text)
    if normalized in ("G1", "G2", "G3"):
        return normalized

    compact = text.translate(str.maketrans("ＧｇＯｏＰｐ", "GgOoPp")).upper()
    compact = re.sub(r"\s+", "", compact)
    if "OPEN" in compact or "ｵｰﾌﾟﾝ" in text or re.search(r"\bOP\b", compact):
        return "OP"

    return "OTHER"

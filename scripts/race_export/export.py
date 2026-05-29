import json
import sys
from pathlib import Path

import pandas as pd

from .config import (
    AVE_3F_MAX,
    AVE_3F_MIN,
    LAST_3F_MAX,
    LAST_3F_MIN,
    OUTPUT_RACE_ENTRIES,
    OUTPUT_RACE_INFO,
)
from .db import create_db_engine
from .horse_stats import aggregate_horse_stats, apply_fallbacks
from .mappers import (
    build_race_info,
    build_sex_age,
    percent_to_rate,
)


SQL_RACE_INFO = 'SELECT * FROM "RaceInfo"'
SQL_RACE_TABLE = """
SELECT rt."番", rt."馬名", rt."性別", rt."年齢", rt."斤量", rt."騎手",
       j."勝率", j."複勝率"
FROM "RaceTable" rt
LEFT JOIN "Jockey" j ON j."騎手" = rt."騎手"
ORDER BY rt."番"
"""
SQL_HORSE_RECORDS = """
SELECT "馬名", "日付", "Ave-3F", "上り3F", "着順", "決手"
FROM "HorseRecords"
ORDER BY "馬名", "日付" DESC
"""


def load_tables(engine) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    race_info = pd.read_sql(SQL_RACE_INFO, engine)
    race_table = pd.read_sql(SQL_RACE_TABLE, engine)
    horse_records = pd.read_sql(SQL_HORSE_RECORDS, engine)
    return race_info, race_table, horse_records


def build_entries(race_table: pd.DataFrame, horse_stats_by_name: dict) -> list[dict]:
    entries = []
    for _, row in race_table.iterrows():
        horse_name = str(row["馬名"]).strip()
        stats = horse_stats_by_name.get(horse_name)

        horse = {
            "name": horse_name,
            "sex_age": build_sex_age(row["性別"], row["年齢"]),
            "weight": int(row["斤量"]),
        }

        if stats:
            horse.update(
                {
                    "has_records": True,
                    "records_used": stats["records_used"],
                    "style": stats["style"],
                    "ave_3f": stats["ave_3f"],
                    "last_3f": stats["last_3f"],
                    "results": stats["results"],
                    "ave_3f_range": stats["ave_3f_range"],
                    "last_3f_range": stats["last_3f_range"],
                }
            )
        else:
            horse["has_records"] = False

        jockey_name = str(row["騎手"]).strip() if pd.notna(row["騎手"]) else ""
        win_rate = percent_to_rate(row["勝率"])
        top3_rate = percent_to_rate(row["複勝率"])

        jockey = {"name": jockey_name}
        if win_rate is not None:
            jockey["win_rate"] = win_rate
        if top3_rate is not None:
            jockey["top3_rate"] = top3_rate

        entries.append(
            {
                "gate": int(row["番"]),
                "horse": horse,
                "jockey": jockey,
            }
        )

    return entries


def validate(
    race_info_payload: dict,
    entries_payload: dict,
    race_info_df: pd.DataFrame,
    race_table_df: pd.DataFrame,
    entries: list[dict],
    warnings: list[str],
) -> None:
    if len(race_info_df) != 1:
        raise ValueError(f"RaceInfo must have exactly 1 row, got {len(race_info_df)}")

    if race_info_payload["race_id"] != entries_payload["race_id"]:
        raise ValueError(
            f"race_id mismatch: info={race_info_payload['race_id']} "
            f"entries={entries_payload['race_id']}"
        )

    if len(entries) == 0:
        raise ValueError("No entries in RaceTable")

    if len(entries) != len(race_table_df):
        raise ValueError(
            f"Entry count mismatch: built={len(entries)} RaceTable={len(race_table_df)}"
        )

    for entry in entries:
        horse = entry["horse"]
        for key in ("ave_3f", "last_3f"):
            value = horse.get(key)
            if value is None:
                continue
            lo, hi = (AVE_3F_MIN, AVE_3F_MAX) if key == "ave_3f" else (LAST_3F_MIN, LAST_3F_MAX)
            if not (lo <= value <= hi):
                warnings.append(
                    f"{horse['name']}: {key}={value} outside expected range [{lo}, {hi}]"
                )


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def run_export() -> dict:
    warnings: list[str] = []
    engine = create_db_engine()

    race_info_df, race_table_df, horse_records_df = load_tables(engine)

    if len(race_info_df) != 1:
        raise ValueError(f"RaceInfo must have exactly 1 row, got {len(race_info_df)}")

    race_info_payload = build_race_info(race_info_df.iloc[0])
    horse_stats_by_name = aggregate_horse_stats(horse_records_df)
    entries = build_entries(race_table_df, horse_stats_by_name)
    entries = apply_fallbacks(entries, warnings)

    entries_payload = {
        "race_id": race_info_payload["race_id"],
        "entries": entries,
    }

    validate(race_info_payload, entries_payload, race_info_df, race_table_df, entries, warnings)

    write_json(OUTPUT_RACE_INFO, race_info_payload)
    write_json(OUTPUT_RACE_ENTRIES, entries_payload)

    return {
        "race_id": race_info_payload["race_id"],
        "race_name": race_info_payload["race_info"]["race_name"],
        "field_size": len(entries),
        "warnings": warnings,
        "output_race_info": str(OUTPUT_RACE_INFO),
        "output_race_entries": str(OUTPUT_RACE_ENTRIES),
    }


def main() -> int:
    try:
        result = run_export()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"Exported race_id={result['race_id']} ({result['race_name']})")
    print(f"  entries: {result['field_size']}")
    print(f"  wrote: {result['output_race_info']}")
    print(f"  wrote: {result['output_race_entries']}")

    if result["warnings"]:
        print(f"Warnings ({len(result['warnings'])}):", file=sys.stderr)
        for warning in result["warnings"]:
            print(f"  - {warning}", file=sys.stderr)

    return 0

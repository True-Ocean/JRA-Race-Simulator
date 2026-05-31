from pathlib import Path

# Fixed paths (no CLI override)
DOTENV_PATH = Path("/Users/trueocean/Desktop/Python_Code/Project_Key/.env")
REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_RACE_INFO = REPO_ROOT / "src" / "data" / "race-info.json"
OUTPUT_RACE_ENTRIES = REPO_ROOT / "src" / "data" / "race-entries.json"

# HorseRecords aggregation
MAX_RECENT_RUNS = 6
MIN_GOOD_RUNS = 2  # use top-3 filter only if at least this many good runs

# Fallback defaults when no field data available
DEFAULT_AVE_3F = 36.5
DEFAULT_LAST_3F = 33.5
DEFAULT_WIN_RATE = 0.15
DEFAULT_TOP3_RATE = 0.42
DEFAULT_STYLE = "差し"

# Valid ranges for warnings
AVE_3F_MIN = 30.0
AVE_3F_MAX = 40.0
LAST_3F_MIN = 30.0
LAST_3F_MAX = 40.0

# Career / class_index（実効上り3F・スタミナ効率）
CLASS_INDEX_MAX_DELTA_SEC = 0.9
CAREER_FINISH_SPAN = 8.0
CAREER_GRADED_EXPERIENCE_RUNS = 6.0
CAREER_STAMINA_EFFICIENCY_EXPERIENCE_WEIGHT = 0.35
CAREER_STAMINA_EFFICIENCY_QUALITY_WEIGHT = 0.65
CAREER_CLASS_WEIGHTS = {
    "G1": 1.0,
    "G2": 0.65,
    "G3": 0.40,
}
# ゴールシーン速度: G1 着順スコアの寄与（残りは class_index）
GOAL_CLASS_G1_BLEND = 0.72

# 決手 → style
KESSHI_TO_STYLE = {
    "逃げ": "逃げ",
    "先行": "先行",
    "差し": "差し",
    "追込": "追込",
    "中団": "差し",
    "後方": "追込",
}

# venue short name → full name
VENUE_SUFFIX = "競馬場"

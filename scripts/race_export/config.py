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

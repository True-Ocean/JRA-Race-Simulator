#!/usr/bin/env python3
"""Export PRISM_SCENE race tables to src/data/race-info.json and race-entries.json."""

import sys
from pathlib import Path

# Allow running as: python scripts/export_race_json.py
sys.path.insert(0, str(Path(__file__).resolve().parent))

from race_export.export import main

if __name__ == "__main__":
    raise SystemExit(main())

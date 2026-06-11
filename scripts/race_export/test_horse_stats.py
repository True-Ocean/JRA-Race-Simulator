import unittest

import pandas as pd

from race_export.horse_stats import _select_runs, aggregate_horse_stats


class HorseStatsTest(unittest.TestCase):
    def _sample_records(self):
        return pd.DataFrame([
            {"馬名": "A", "日付": "2026-01-01", "距離": 1600, "Ave-3F": 36.0, "上り3F": 34.0, "着順": 1, "決手": "逃げ"},
            {"馬名": "A", "日付": "2026-02-01", "距離": 2400, "Ave-3F": 35.5, "上り3F": 33.5, "着順": 2, "決手": "差し"},
            {"馬名": "A", "日付": "2026-03-01", "距離": 2200, "Ave-3F": 35.8, "上り3F": 33.8, "着順": 3, "決手": "差し"},
        ])

    def test_select_runs_prefers_closer_distance(self):
        selected = _select_runs(self._sample_records(), target_distance=2400)
        distances = list(selected["距離"].astype(int))
        self.assertIn(2400, distances)
        if 1600 in distances:
            self.assertLess(distances.index(2400), distances.index(1600))

    def test_aggregate_includes_distance_bias(self):
        stats = aggregate_horse_stats(self._sample_records(), target_distance=2400)
        self.assertGreaterEqual(stats["A"]["records_used"], 1)
        self.assertIsNotNone(stats["A"]["distance_bias_m"])

    def test_aggregate_excludes_zero_3f_from_overseas_runs(self):
        """海外レース等で 0 になっている Ave-3F / 上り3F は集計から除外する。"""
        records = pd.DataFrame([
            {
                "馬名": "海外馬", "日付": "2026-01-01", "距離": 2400,
                "Ave-3F": 0.0, "上り3F": 0.0, "着順": 1, "決手": "差し", "クラス名": "G1",
            },
            {
                "馬名": "海外馬", "日付": "2026-02-01", "距離": 2400,
                "Ave-3F": 36.5, "上り3F": 34.0, "着順": 2, "決手": "差し", "クラス名": "G1",
            },
            {
                "馬名": "海外馬", "日付": "2026-03-01", "距離": 2400,
                "Ave-3F": 37.0, "上り3F": 33.8, "着順": 3, "決手": "差し", "クラス名": "G1",
            },
        ])
        warnings: list[str] = []
        stats = aggregate_horse_stats(records, target_distance=2400, warnings=warnings)

        ave_range = stats["海外馬"]["ave_3f_range"]
        last_range = stats["海外馬"]["last_3f_range"]
        self.assertEqual(ave_range["min"], 36.5)
        self.assertEqual(ave_range["max"], 37.0)
        self.assertEqual(ave_range["avg"], 36.8)
        self.assertEqual(last_range["min"], 33.8)
        self.assertEqual(last_range["max"], 34.0)
        self.assertGreater(ave_range["min"], 0)
        self.assertTrue(any("excluded invalid 3F" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()

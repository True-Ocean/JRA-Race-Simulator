import unittest

import pandas as pd

from race_export.career_stats import aggregate_career, apply_class_index_to_last3f
from race_export.grade import bucket_grade


class CareerStatsTest(unittest.TestCase):
    def test_bucket_grade(self):
        self.assertEqual(bucket_grade("Ｇ１"), "G1")
        self.assertEqual(bucket_grade("Ｇ２"), "G2")
        self.assertEqual(bucket_grade("OP(L)"), "OP")

    def test_g1_winner_has_higher_class_index_than_g2_only(self):
        g1_winner = pd.DataFrame([
            {"クラス名": "Ｇ１", "着順": 1},
            {"クラス名": "Ｇ１", "着順": 2},
        ])
        g2_only = pd.DataFrame([
            {"クラス名": "Ｇ２", "着順": 1},
        ])
        c1 = aggregate_career(g1_winner)
        c2 = aggregate_career(g2_only)
        self.assertGreater(c1["class_index"], c2["class_index"])

    def test_apply_class_index_reduces_last3f(self):
        high = apply_class_index_to_last3f(34.5, 0.9)
        low = apply_class_index_to_last3f(34.5, 0.2)
        self.assertLess(high, low)

    def test_g1_avg_finish_improves_goal_class_index(self):
        good_g1 = pd.DataFrame([
            {"クラス名": "Ｇ１", "着順": 1},
            {"クラス名": "Ｇ１", "着順": 1},
        ])
        weak_g1 = pd.DataFrame([
            {"クラス名": "Ｇ１", "着順": 10},
        ])
        good = aggregate_career(good_g1)
        weak = aggregate_career(weak_g1)
        self.assertGreater(good["g1_class_score"], weak["g1_class_score"])
        self.assertGreater(good["goal_class_index"], weak["goal_class_index"])


if __name__ == "__main__":
    unittest.main()

import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from report_rebate import report_rebate

class ReportRebateTests(unittest.TestCase):
    def test_signed_adjustment_and_rounding(self):
        for winnings, rake, expected in [(80000, 20000, -10000), (-120000, 20000, 10000), (-10000, 20000, -1000), (-20000, 20000, 0), (0.05, 0, -0.01), (-0.05, 0, 0.01)]:
            with self.subTest(winnings=winnings, rake=rake):
                base = winnings + rake
                metrics = report_rebate(base, "2026-10-19")
                self.assertEqual(metrics["rebate"], expected)
                self.assertEqual(metrics["rebateAmount"], abs(expected))
                self.assertEqual(metrics["rebateBase"], base)
                self.assertEqual(metrics["rebatePercent"], 10)
    def test_closed_week_is_unchanged(self):
        self.assertEqual(report_rebate(-100000, "2026-10-12"), {})
    def test_persists_for_future_weeks(self):
        self.assertEqual(report_rebate(-100000, "2027-01-04")["rebate"], 10000)

if __name__ == "__main__":
    unittest.main()

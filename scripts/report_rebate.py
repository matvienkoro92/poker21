"""Signed settlement adjustment; never apply the new rule to closed historical weeks."""
from decimal import Decimal, ROUND_HALF_UP

REBATE_START_DATE = "2026-10-19"

def report_rebate(balance, start_date):
    if start_date < REBATE_START_DATE:
        return {}
    base = Decimal(str(balance)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    amount = (abs(base) * Decimal("0.10")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    adjustment = amount if base < 0 else -amount
    return {"rebatePercent": 10, "rebateBase": float(base), "rebateAmount": float(amount), "rebate": float(adjustment) if adjustment else 0.0}

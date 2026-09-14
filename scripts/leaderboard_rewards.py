"""Read actual positive Reward rows, with dates and fund reconciliation."""
import re
from datetime import datetime
from decimal import Decimal


def extract_leaderboard_rewards(workbook, start_date, end_date, source_name):
    result = {"startDate": start_date, "endDate": end_date,
              "source": source_name, "sheet": "Club Rankings",
              "available": "Club Rankings" in workbook.sheetnames,
              "leaderboards": [], "total": 0, "payoutCount": 0}
    if not result["available"]:
        return result
    current = None
    total = Decimal(0)

    def finish():
        nonlocal total
        if current is None:
            return
        paid = sum((Decimal(str(r["reward"])) for r in current["payouts"]), Decimal(0))
        if paid != Decimal(str(current["declaredReward"])):
            raise ValueError(f"Club Rankings row {current['sourceRow']}: rewards {paid} differ from fund {current['declaredReward']}")
        current["total"] = float(paid)
        if start_date <= current["endsAt"][:10] <= end_date:
            result["leaderboards"].append(current)
            result["payoutCount"] += len(current["payouts"])
            total += paid

    for number, row in enumerate(workbook["Club Rankings"].iter_rows(values_only=True), 1):
        label = str(row[0] or "")
        if "Rank Type" in label:
            finish()
            text = label.replace("：", ":").replace("，", ",")
            match = re.fullmatch(r"Supper Rank Type:\s*([^,]+),(.*),Time:\s*(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})-(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}),Reward:\s*([\d.]+)\s*", text)
            if not match:
                raise ValueError(f"Unrecognized Club Rankings header at row {number}")
            kind, title, begins, ends, fund = match.groups()
            current = {"type": kind.strip(), "title": title.strip(),
                       "startsAt": datetime.strptime(begins, "%Y/%m/%d %H:%M:%S").isoformat(),
                       "endsAt": datetime.strptime(ends, "%Y/%m/%d %H:%M:%S").isoformat(),
                       "declaredReward": float(Decimal(fund)), "sourceRow": number, "payouts": []}
        elif isinstance(row[0], (int, float)):
            if current is None or len(row) < 5 or not isinstance(row[3], (int, float)):
                raise ValueError(f"Invalid ranking row {number}")
            reward = Decimal(str(row[3]))
            if reward < 0 or reward != reward.quantize(Decimal(".01")):
                raise ValueError(f"Invalid reward at row {number}")
            if reward > 0:
                current["payouts"].append({"rank": int(row[0]), "playerId": str(int(row[1])),
                                           "nick": str(row[2] or row[1]), "reward": float(reward),
                                           "score": row[4], "sourceRow": number})
    finish()
    result["leaderboards"].sort(key=lambda board: board["endsAt"])
    result["total"] = float(total)
    return result

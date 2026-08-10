#!/usr/bin/env python3
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def add_value(target, key, value):
    if isinstance(value, (int, float)) and value:
        target[key] = target.get(key, 0) + float(value)


def top(rows, field, reverse=True, count=10):
    return sorted(rows, key=lambda row: row[field], reverse=reverse)[:count]


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-union-bot-data.py INPUT.xlsx OUTPUT_DIR")
    source = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    workbook = load_workbook(source, read_only=True, data_only=True)

    union = workbook["Union Data"]
    meta = str(union.cell(2, 1).value or "")
    period = re.search(r"Range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})", meta)
    if not period:
        raise ValueError("Report period was not found in Union Data!A2")
    start_date, end_date = period.groups()
    base = {"startDate": start_date, "endDate": end_date}

    union_headers = [cell.value for cell in next(union.iter_rows(min_row=4, max_row=4))]
    club_metrics = {}
    for row in union.iter_rows(min_row=5, values_only=True):
        if not isinstance(row[1], (int, float)):
            continue
        values = dict(zip(union_headers, row))
        club_id = str(int(row[1]))
        club_metrics[club_id] = {
            "id": club_id,
            "name": str(row[0]),
            "profits": values.get("Profits") or 0,
            "winnings": values.get("Winnings") or 0,
            "rake": values.get("Total Fee") or 0,
            "cashRake": values.get("Ring Game Fee") or 0,
            "mttRake": values.get("MTT Fee") or 0,
            "sngRake": values.get("SNG Fee") or 0,
            "insurance": values.get("Insurance") or 0,
            "regularJackpotFee": values.get("Jackpot Fee") or 0,
            "regularJackpotPayout": values.get("Jackpot Payout") or 0,
            "jackpot21Fee": values.get("Jackpot Fee 21") or 0,
            "jackpot21Payout": values.get("Jackpot Payout 21") or 0,
            "games": values.get("Games") or 0,
            "hands": values.get("Hands") or 0,
        }

    members = workbook["Union Member Statistics"]
    member_headers = [cell.value for cell in next(members.iter_rows(min_row=5, max_row=5))]
    players = {}
    club_players = defaultdict(dict)
    member_club_ids = set()
    active_ids = defaultdict(set)
    member_hands = defaultdict(float)
    for row in members.iter_rows(min_row=6, values_only=True):
        if not isinstance(row[0], (int, float)) or not isinstance(row[2], (int, float)):
            continue
        club_id = str(int(row[0]))
        player_id = str(int(row[2]))
        member_club_ids.add(club_id)
        nick = str(row[4] or "").strip() or player_id
        player = players.setdefault(player_id, {
            "id": player_id, "nick": nick, "aliases": set(), "clubs": set(), "agents": set(),
            "winnings": 0.0, "cashRake": 0.0, "mttRake": 0.0, "sngRake": 0.0,
            "insurance": 0.0, "jackpotFee": 0.0, "jackpotPayout": 0.0, "hands": 0.0,
            "winGames": {}, "rakeGames": {},
        })
        player["nick"] = nick
        player["aliases"].add(nick)
        player["clubs"].add(club_id)
        agent_name = str(row[6] or "").strip()
        agent_id = str(int(row[7])) if isinstance(row[7], (int, float)) else ""
        if agent_name or agent_id:
            player["agents"].add(f"{agent_name} ({agent_id})" if agent_name and agent_id else agent_name or agent_id)
        player["winnings"] += float(row[9] or 0)
        player["cashRake"] += float(row[30] or 0)
        player["mttRake"] += float(row[44] or 0)
        player["sngRake"] += float(row[49] or 0)
        player["insurance"] += float(row[53] or 0)
        player["jackpotFee"] += float(row[59] or 0)
        player["jackpotPayout"] += float(row[60] or 0)
        player["hands"] += float(row[61] or 0)
        member_hands[club_id] += float(row[61] or 0)
        if any(float(row[index] or 0) != 0 for index in [9, 30, 44, 49, 53, 59, 60, 61]):
            active_ids[club_id].add(player_id)
        for index in range(10, 30):
            add_value(player["winGames"], str(member_headers[index]), row[index])
        for index in list(range(31, 44)) + list(range(45, 49)) + list(range(50, 53)):
            add_value(player["rakeGames"], str(member_headers[index]), row[index])
        club_player = club_players[club_id].setdefault(player_id, {"id": player_id, "nick": nick, "winnings": 0.0, "rake": 0.0})
        club_player["nick"] = nick
        club_player["winnings"] += float(row[9] or 0)
        club_player["rake"] += float(row[30] or 0) + float(row[44] or 0) + float(row[49] or 0)

    for club_id, club in club_metrics.items():
        rows = list(club_players.get(club_id, {}).values())
        club["jackpotFee"] = club.pop("regularJackpotFee") + club.pop("jackpot21Fee")
        club["jackpotPayout"] = club.pop("regularJackpotPayout") + club.pop("jackpot21Payout")
        club["players"] = len(rows)
        club["topRake"] = top(rows, "rake", True, 5)
        club["topPlus"] = top([row for row in rows if row["winnings"] > 0], "winnings", True, 5)
        club["topMinus"] = top([row for row in rows if row["winnings"] < 0], "winnings", False, 5)

    player_rows = []
    for player in players.values():
        player["aliases"] = sorted(player["aliases"])
        player["clubs"] = sorted(player["clubs"])
        player["agents"] = sorted(player["agents"])
        player["rake"] = player["cashRake"] + player["mttRake"] + player["sngRake"]
        player["winGames"] = sorted(player["winGames"].items(), key=lambda item: -abs(item[1]))
        player["rakeGames"] = sorted(player["rakeGames"].items(), key=lambda item: -item[1])
        player_rows.append(player)
    write_json(output_dir / "union-directory.json", {
        **base,
        "clubs": sorted(club_metrics.values(), key=lambda club: club["name"].casefold()),
        "players": sorted(player_rows, key=lambda player: int(player["id"])),
    })

    rake_clubs = [club_metrics[club_id] for club_id in member_club_ids if club_id in club_metrics]
    write_json(output_dir / "union-member-rake-summary.json", {
        **base,
        "clubs": [{"club": club["name"], "clubId": club["id"], "rake": club["rake"]} for club in top(rake_clubs, "rake") + sorted(rake_clubs, key=lambda club: -club["rake"])[10:]],
    })

    games_sheet = workbook["Union Game Statistics"]
    game_headers = [cell.value for cell in next(games_sheet.iter_rows(min_row=5, max_row=5))]
    type_index = game_headers.index("Game Type")
    name_index = game_headers.index("Game Name")
    fee_index = game_headers.index("Fee")
    overlay_index = game_headers.index("Overlay")
    game_rake = defaultdict(float)
    overlays = []
    for row in games_sheet.iter_rows(min_row=6, values_only=True):
        if row[type_index] is not None and isinstance(row[fee_index], (int, float)):
            game_rake[str(row[type_index])] += float(row[fee_index])
        if isinstance(row[overlay_index], (int, float)) and row[overlay_index] != 0:
            overlays.append({"name": str(row[name_index] or "Без названия").strip(), "overlay": float(row[overlay_index])})
    write_json(output_dir / "union-game-rake-summary.json", {**base, "games": [{"name": name, "rake": value} for name, value in sorted(game_rake.items(), key=lambda item: -item[1])]})
    write_json(output_dir / "union-overlay-summary.json", {**base, "tournaments": sorted(overlays, key=lambda row: -row["overlay"])})

    raw_union_rows = []
    for row in union.iter_rows(min_row=5, values_only=True):
        if isinstance(row[1], (int, float)):
            raw_union_rows.append(dict(zip(union_headers, row)))
    write_json(output_dir / "union-jackpot-summary.json", {
        **base,
        "regularFee": sum(float(row.get("Jackpot Fee") or 0) for row in raw_union_rows),
        "regularPayout": sum(float(row.get("Jackpot Payout") or 0) for row in raw_union_rows),
        "jackpot21Fee": sum(float(row.get("Jackpot Fee 21") or 0) for row in raw_union_rows),
        "jackpot21Payout": sum(float(row.get("Jackpot Payout 21") or 0) for row in raw_union_rows),
    })

    write_json(output_dir / "union-player-tops.json", {
        **base,
        "rake": [{"playerId": row["id"], "nick": row["nick"], "clubs": [club_metrics[cid]["name"] for cid in row["clubs"] if cid in club_metrics], "value": row["rake"]} for row in top(player_rows, "rake")],
        "minus": [{"playerId": row["id"], "nick": row["nick"], "clubs": [club_metrics[cid]["name"] for cid in row["clubs"] if cid in club_metrics], "value": row["winnings"]} for row in top([row for row in player_rows if row["winnings"] < 0], "winnings", False)],
        "plus": [{"playerId": row["id"], "nick": row["nick"], "clubs": [club_metrics[cid]["name"] for cid in row["clubs"] if cid in club_metrics], "value": row["winnings"]} for row in top([row for row in player_rows if row["winnings"] > 0], "winnings")],
    })

    activity_rows = []
    for club_id, club in club_metrics.items():
        row = {
            "club": club["name"], "clubId": club_id, "rake": club["rake"], "games": club["games"],
            "hands": member_hands[club_id], "activePlayers": len(active_ids[club_id]),
        }
        if row["rake"] or row["games"] or row["hands"] or row["activePlayers"]:
            row["rakePerPlayer"] = round(row["rake"] / row["activePlayers"], 2) if row["activePlayers"] else 0
            activity_rows.append(row)
    write_json(output_dir / "union-activity-summary.json", {
        **base,
        "activeClubs": len(activity_rows),
        "activePlayers": sum(row["activePlayers"] for row in activity_rows),
        "games": sum(row["games"] for row in activity_rows),
        "hands": sum(row["hands"] for row in activity_rows),
        "topPlayers": top(activity_rows, "activePlayers"),
        "topGames": top(activity_rows, "games"),
        "topHands": top(activity_rows, "hands"),
        "topRakePerPlayer": top(activity_rows, "rakePerPlayer"),
    })
    print(json.dumps({"period": [start_date, end_date], "clubs": len(club_metrics), "memberClubs": len(member_club_ids), "players": len(player_rows), "overlays": len(overlays)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

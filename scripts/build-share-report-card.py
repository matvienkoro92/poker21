#!/usr/bin/env python3
import json
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


RULES = [
    ("club", "384445", "Клуб 384445", 8), ("league", "184691", "Anti-Reg", 8),
    ("league", "0", "Anti-Reg (0)", 8), ("league", "259822", "PPCUNION", 5),
    ("league", "556801", "3-BET", 10), ("league", "393100", "Jokers", 5),
    ("league", "592389", "Casino Dreamer", 8), ("league", "840346", "Ginger", 5),
    ("league", "184285", "Off Cheats", 8), ("league", "319222", "RELAX", 8),
    ("league", "729923", "Bambuk", 6), ("league", "375194", "Sibiria Gold", 6),
    ("league", "715066", "СССР", 8), ("league", "854851", "Rbpoker", 5),
    ("league", "537272", "WHITE", 7), ("league", "806449", "B&R UNION", 6),
    ("league", "150442", "M&R UNION", 6), ("league", "524236", "BEAST", 6),
    ("league", "77777", "AQUARIUM", 6), ("league", "859570", "VAULT 13", 6),
    ("league", "398790", "ONLYSTARS", 5), ("league", "935974", "QUASAR", 5),
    ("league", "287920", "BRAZIL", 5), ("league", "685702", "BG Union", 8),
    ("league", "538879", "Bro Poker", 5), ("league", "993268", "Poker 2025", 10),
    ("league", "596499", "AF UNION", 5),
]

def font(size, bold=False):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def money(value):
    return f"{float(value):,.2f}".replace(",", " ").replace(".", ",")


def round_money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def right(draw, x, y, text, selected_font, fill):
    box = draw.textbbox((0, 0), text, font=selected_font)
    draw.text((x - (box[2] - box[0]), y), text, font=selected_font, fill=fill)


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: build-share-report-card.py JACKPOT.json DIRECTORY.json OUTPUT.png")
    jackpot = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    directory = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    leagues = {str(row.get("leagueId")): row for row in jackpot.get("leagues", [])}
    clubs = {str(row.get("id")): row for row in directory.get("clubs", [])}
    rows = []
    for kind, item_id, label, percent in RULES:
        source = clubs.get(item_id) if kind == "club" else leagues.get(item_id)
        rake = float((source or {}).get("rake", 0)) if kind == "club" else float((source or {}).get("feeTotal", 0)) * float((source or {}).get("exchangeRate", 1))
        amount = round_money(Decimal(str(rake)) * Decimal(str(percent)) / 100)
        if rake != 0 or amount != 0:
            rows.append((percent, label, rake, amount))
    total_rake = round_money(sum((Decimal(str(row[2])) for row in rows), Decimal("0")))
    total = round_money(sum((row[3] for row in rows), Decimal("0")))

    image_height = 502 + len(rows) * 48
    image = Image.new("RGB", (1200, image_height), "#071A16")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 30, 1165, image_height - 30), radius=34, fill="#0D2922", outline="#2DD4A3", width=3)
    title, header, body, body_bold, total_font = font(48, True), font(25, True), font(23), font(23, True), font(32, True)
    draw.text((75, 65), "Доля", font=title, fill="#F8FAFC")
    draw.text((75, 135), f"{jackpot['startDate']} — {jackpot['endDate']}", font=font(24), fill="#94A3B8")
    y = 205
    draw.rounded_rectangle((60, y - 10, 1140, y + 42), radius=10, fill="#123C32")
    draw.text((78, y), "%", font=header, fill="#D7E3DF")
    draw.text((165, y), "Союз", font=header, fill="#D7E3DF")
    right(draw, 850, y, "Рейк", header, "#D7E3DF")
    right(draw, 1120, y, "Сумма", header, "#D7E3DF")
    y += 58
    for percent, label, rake, amount in rows:
        draw.text((78, y), f"{percent:g}%", font=body_bold, fill="#6EE7B7")
        draw.text((165, y), label, font=body, fill="#F8FAFC")
        right(draw, 850, y, money(rake), body, "#D7E3DF")
        right(draw, 1120, y, money(amount), body_bold, "#6EE7B7")
        y += 48
    draw.line((75, y + 5, 1125, y + 5), fill="#2DD4A3", width=3)
    y += 28
    draw.text((78, y), "ИТОГО", font=total_font, fill="#F8FAFC")
    right(draw, 850, y, money(total_rake), total_font, "#F8FAFC")
    right(draw, 1120, y, money(total), total_font, "#6EE7B7")
    y += 58
    draw.text((78, y), f"60% Джеку = {money(round_money(total * Decimal('0.60')))}", font=body_bold, fill="#D7E3DF")

    output = Path(sys.argv[3])
    output.parent.mkdir(parents=True, exist_ok=True)
    image.quantize(colors=16, method=Image.Quantize.MEDIANCUT).save(output, format="PNG", optimize=True)
    print(output)


if __name__ == "__main__":
    main()

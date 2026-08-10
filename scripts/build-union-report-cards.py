#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size, bold=False):
    names = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for name in names:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def money(value):
    return f"{float(value):,.2f}".replace(",", " ").replace(".", ",")


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-union-report-cards.py INPUT.json PUBLIC_DIR")
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    public_dir = Path(sys.argv[2])
    title_font = font(46, True)
    period_font = font(25)
    label_font = font(27)
    value_font = font(28, True)
    total_font = font(34, True)
    for report in payload.get("reports", []):
        image = Image.new("RGB", (1200, 1080), "#071A16")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((40, 35, 1160, 1045), radius=34, fill="#0D2922", outline="#2DD4A3", width=3)
        draw.text((80, 72), report["league"], font=title_font, fill="#F8FAFC")
        period = f"{report['startDate']} — {report['endDate']}"
        draw.text((82, 137), period, font=period_font, fill="#94A3B8")
        draw.line((80, 190, 1120, 190), fill="#245B4D", width=2)
        metrics = report["metrics"]
        rows = [
            ("Выигрыш", metrics["winnings"]),
            ("Комиссия кэш + MTT", metrics["commission"]),
            ("Баланс (выигрыш + комиссия)", metrics["balance"]),
            ("Штрафы мошенников", metrics["fraud"]),
            ("Overly", metrics["overly"]),
            ("Баланс итог", metrics["balanceFinal"]),
            ("Акция", metrics["promo"]),
            (f"Обслуживание {metrics['servicePercent']}%", metrics["service"]),
            ("Возврат джекпота", metrics["jackpotRefund"]),
        ]
        y = 225
        for index, (label, value) in enumerate(rows):
            if index in (2, 5):
                draw.rounded_rectangle((65, y - 10, 1135, y + 50), radius=12, fill="#123C32")
            draw.text((85, y), label, font=label_font, fill="#D7E3DF")
            value_text = f"+{money(value)}" if label == "Возврат джекпота" and float(value) > 0 else money(value)
            value_box = draw.textbbox((0, 0), value_text, font=value_font)
            color = "#6EE7B7" if float(value) >= 0 else "#FB7185"
            draw.text((1115 - (value_box[2] - value_box[0]), y), value_text, font=value_font, fill=color)
            y += 73
        draw.line((80, 900, 1120, 900), fill="#2DD4A3", width=3)
        draw.text((85, 936), "Итого к расчёту", font=total_font, fill="#F8FAFC")
        total_text = money(metrics["total"])
        total_box = draw.textbbox((0, 0), total_text, font=total_font)
        total_color = "#6EE7B7" if float(metrics["total"]) >= 0 else "#FB7185"
        draw.text((1115 - (total_box[2] - total_box[0]), 936), total_text, font=total_font, fill=total_color)
        target = public_dir / report["imagePath"].lstrip("/").removeprefix("assets/")
        target.parent.mkdir(parents=True, exist_ok=True)
        image.quantize(colors=64, method=Image.Quantize.MEDIANCUT).save(target, format="PNG", optimize=True)
        print(target)


if __name__ == "__main__":
    main()

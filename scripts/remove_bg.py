#!/usr/bin/env python3
"""Убирает однородный фон с изображения, делая его прозрачным (PNG)."""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Установите Pillow: pip install Pillow")
    sys.exit(1)


def remove_background_simple(input_path: str, output_path: str, tolerance: int = 40) -> None:
    """Делает прозрачными пиксели, близкие к цвету в углах (фон)."""
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    w, h = img.size

    # Берём цвет фона из углов (усредняем 4 угла)
    corners = [
        data[0], data[w - 1], data[(h - 1) * w], data[h * w - 1]
    ]
    r = sum(c[0] for c in corners) // 4
    g = sum(c[1] for c in corners) // 4
    b = sum(c[2] for c in corners) // 4

    new_data = []
    for i, (pr, pg, pb, pa) in enumerate(data):
        if abs(pr - r) <= tolerance and abs(pg - g) <= tolerance and abs(pb - b) <= tolerance:
            new_data.append((pr, pg, pb, 0))
        else:
            new_data.append((pr, pg, pb, pa))

    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Сохранено: {output_path}")


if __name__ == "__main__":
    assets = Path(__file__).resolve().parent.parent / "assets"
    for name in ("plasterer-smile", "plasterer-sad", "plasterer-happy"):
        inp = assets / f"{name}.png"
        if not inp.exists():
            print(f"Пропуск (нет файла): {inp}")
            continue
        remove_background_simple(str(inp), str(inp), tolerance=55)

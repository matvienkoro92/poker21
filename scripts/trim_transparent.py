#!/usr/bin/env python3
"""Обрезает прозрачные поля по краям изображения (только персонаж, без отступов)."""
import sys
from pathlib import Path
from typing import Optional

try:
    from PIL import Image
except ImportError:
    print("Установите Pillow: pip install Pillow")
    sys.exit(1)


def trim_by_alpha(img: Image.Image, alpha_threshold: int) -> Optional[tuple]:
    """Возвращает bbox по альфа-каналу."""
    r, g, b, a = img.split()
    mask = a.point(lambda x: 255 if x > alpha_threshold else 0, "L")
    return mask.getbbox()


def trim_by_not_background(img: Image.Image, tolerance: int = 45) -> Optional[tuple]:
    """Возвращает bbox пикселей, не совпадающих с цветом углов (фон)."""
    data = list(img.getdata())
    w, h = img.size
    corners = [data[0], data[w - 1], data[(h - 1) * w], data[h * w - 1]]
    cr = sum(c[0] for c in corners) // 4
    cg = sum(c[1] for c in corners) // 4
    cb = sum(c[2] for c in corners) // 4
    left, top, right, bottom = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            i = y * w + x
            pr, pg, pb, pa = data[i]
            if pa < 15:
                continue
            if abs(pr - cr) > tolerance or abs(pg - cg) > tolerance or abs(pb - cb) > tolerance:
                left = min(left, x)
                top = min(top, y)
                right = max(right, x + 1)
                bottom = max(bottom, y + 1)
    if left >= right or top >= bottom:
        return None
    return (left, top, right, bottom)


def trim_transparent(path: str, alpha_threshold: int = 25) -> None:
    """Обрезает прозрачные/пустые поля сверху, снизу, слева и справа."""
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    total = w * h
    bbox = trim_by_alpha(img, alpha_threshold)
    # Не используем слишком маленькую обрезку по альфе (могли срезать персонажа)
    if bbox:
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        if area < total * 0.15:
            bbox = None
    # Если по альфе не вышло или обрезка = весь кадр — пробуем по «не-фону»
    if not bbox or (bbox[2] - bbox[0], bbox[3] - bbox[1]) == (w, h):
        bbox2 = trim_by_not_background(img, 45)
        if bbox2:
            area2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
            if area2 >= total * 0.15:
                bbox = bbox2
    if not bbox:
        print(f"Пропуск (нет видимых пикселей): {path}")
        return
    img_cropped = img.crop(bbox)
    img_cropped.save(path, "PNG")
    print(f"Обрезано: {path} -> {bbox}")


if __name__ == "__main__":
    assets = Path(__file__).resolve().parent.parent / "assets"
    for name in ("plasterer-smile", "plasterer-sad", "plasterer-happy"):
        p = assets / f"{name}.png"
        if p.exists():
            trim_transparent(str(p))
        else:
            print(f"Нет файла: {p}")

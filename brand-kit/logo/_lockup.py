# -*- coding: utf-8 -*-
"""生成图标 + 标准字组合排版示意（横版 / 竖版），透明底 PNG。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "png")
os.makedirs(OUT, exist_ok=True)

PINE = (30, 107, 90)
GREY = (140, 154, 148)

# 复用主图标
import importlib.util
spec = importlib.util.spec_from_file_location("v2", os.path.join(HERE, "_v2.py"))
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)
maker = pr.draw_nest

def find_font():
    cands = [
        "C:/Windows/Fonts/Inter.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/msyh.ttc",
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    return None


FONT = find_font()


def font(sz):
    if FONT:
        try:
            return ImageFont.truetype(FONT, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def wordmark(draw, xy, size, anchor="lm"):
    """画 L&L 标准字：L 实心，& 用次级灰，字距收紧。"""
    x, y = xy
    fL = font(size)
    fA = font(int(size * 0.72))
    d = draw
    d.text((x, y), "L", font=fL, fill=PINE + (255,), anchor=anchor)
    wL = d.textlength("L", font=fL)
    x2 = x + wL + size * 0.02
    d.text((x2, y + size * 0.06), "&", font=fA, fill=GREY + (255,), anchor=anchor)
    wA = d.textlength("&", font=fA)
    x3 = x2 + wA + size * 0.02
    d.text((x3, y), "L", font=fL, fill=PINE + (255,), anchor=anchor)
    wL2 = d.textlength("L", font=fL)
    return (x3 + wL2) - x


def lockup_horizontal():
    W, H = 1520, 480
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    icon = maker(264, transparent=True)
    img.alpha_composite(icon, (72, (H - 264) // 2))
    d = ImageDraw.Draw(img)
    wordmark(d, (72 + 264 + 72, H // 2), 150)
    img.save(os.path.join(OUT, "lockup-horizontal.png"), "PNG")
    print("OK lockup-horizontal.png", img.size)


def lockup_vertical():
    W, H = 720, 920
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    icon = maker(300, transparent=True)
    img.alpha_composite(icon, ((W - 300) // 2, 96))
    d = ImageDraw.Draw(img)
    f = font(128)
    fA = font(92)
    total = d.textlength("L", font=f) + 4 + d.textlength("&", font=fA) + 4 + d.textlength("L", font=f)
    x = (W - total) / 2
    y = 96 + 300 + 96
    d.text((x, y), "L", font=f, fill=PINE + (255,), anchor="la")
    x += d.textlength("L", font=f) + 4
    d.text((x, y + 8), "&", font=fA, fill=GREY + (255,), anchor="la")
    x += d.textlength("&", font=fA) + 4
    d.text((x, y), "L", font=f, fill=PINE + (255,), anchor="la")
    # 副标语
    d.text((W / 2, y + 190), "T R A V E L   C O M P A N I O N S",
           font=font(30), fill=GREY + (255,), anchor="ma")
    img.save(os.path.join(OUT, "lockup-vertical.png"), "PNG")
    print("OK lockup-vertical.png", img.size)


if __name__ == "__main__":
    print("font:", FONT)
    lockup_horizontal()
    lockup_vertical()

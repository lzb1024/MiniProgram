# -*- coding: utf-8 -*-
"""
L&L 小程序图标 · 三方案导出。
几何与 _pil_render.draw_primary（定稿）完全一致：双 L 对望 + 共享基线。
差异只在「图标本体」层面：满幅底色 + 足够的安全边距，供微信裁圆角使用。
  paper  纸白底 + 青绿→雪峰蓝渐变笔画（主方案，与 Logo 同底）
  dark   深松底 #101A19 + 白→薄荷渐变笔画（深色场景）
  grad   青绿→雪峰蓝渐变满幅底 + 纸白笔画（最抢眼的头像方案）
输出：png/icon/ 下圆角多尺寸 + 每方案一张 512 满幅直角（上传微信用）。
"""
import os
from PIL import Image, ImageDraw
from _pil_render import bar, lerp, SS, PINE, SKY, PAPER, INK, WHITE, MINT

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "png", "icon")
os.makedirs(OUT, exist_ok=True)
S = 512
F = S * SS

# ---- 定稿几何（与 _pil_render.draw_primary 完全一致，勿改） ----
W = 52 * SS
BASE_Y = 380 * SS
GFROM, GTO = (110 * SS, 130 * SS), (402 * SS, 400 * SS)


def sf(v):
    return v * SS


def draw_marks(d, c1, c2, solid=None):
    if solid is not None:
        c1 = c2 = solid
    # 左 L：竖笔（高）+ 底笔向右，止于中线
    bar(d, (sf(132), sf(150)), (sf(132), BASE_Y), W, c1, c2, GFROM, GTO)
    bar(d, (sf(132), BASE_Y), (sf(256), BASE_Y), W, c1, c2, GFROM, GTO)
    # 右 L：镜像，竖笔略矮，底笔向左，两条底笔在中央交会
    bar(d, (sf(380), sf(198)), (sf(380), BASE_Y), W, c1, c2, GFROM, GTO)
    bar(d, (sf(380), BASE_Y), (sf(256), BASE_Y), W, c1, c2, GFROM, GTO)


def grad_square(c1, c2):
    """对角渐变满幅底：先在小图逐像素算好再放大，平滑且快。"""
    g = Image.new("RGB", (129, 129))
    px = g.load()
    for y in range(129):
        for x in range(129):
            px[x, y] = lerp(c1, c2, (x + y) / 256.0)
    return g.resize((F, F), Image.BILINEAR).convert("RGBA")


def render(variant):
    img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    layer = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    if variant == "paper":
        ImageDraw.Draw(img).rectangle([0, 0, F - 1, F - 1], fill=PAPER + (255,))
        draw_marks(ImageDraw.Draw(layer), PINE, SKY)
    elif variant == "dark":
        ImageDraw.Draw(img).rectangle([0, 0, F - 1, F - 1], fill=INK + (255,))
        draw_marks(ImageDraw.Draw(layer), WHITE, MINT)
    elif variant == "grad":
        img = grad_square(PINE, SKY)
        draw_marks(ImageDraw.Draw(layer), PAPER, PAPER, solid=PAPER)
    else:
        raise ValueError(variant)
    img.alpha_composite(layer)
    return img


def rounded(img, radius=112):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius * SS, fill=255
    )
    out = img.copy()
    out.putalpha(mask)
    return out


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG")
    print("OK", name, img.size, os.path.getsize(p), "b")


if __name__ == "__main__":
    for v in ("paper", "dark", "grad"):
        full = render(v)
        for size in (512, 144, 120, 96, 64, 32):
            save(rounded(full).resize((size, size), Image.LANCZOS),
                 "icon-%s-%d.png" % (v, size))
        # 满幅直角版：上传微信头像用，圆角由微信自己裁
        save(full.resize((512, 512), Image.LANCZOS),
             "icon-%s-fullbleed-512.png" % v)

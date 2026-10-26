# -*- coding: utf-8 -*-
"""
L&L 标识 v2 · 圆润亲和方向

构图：两个 L 并排、共用中间竖笔（镜像拼合）。
  ┌─────┐   ┌─────┐
  │ L   │ + │   L │   →  两个 L 背靠背，中间竖笔合二为一
  └─────┘   └─────┘
结果轮廓：左竖 + 中竖（共用）+ 右竖，两条底笔各自向外延伸。
中间竖笔比两侧略矮，形成「肩」的层次，避免呆板。

笔法：等粗笔画 + 大圆角收笔（round cap / join），体量大、留白足。
"""
import os
import math
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "png")
os.makedirs(OUT, exist_ok=True)
SS = 4

PINE = (30, 107, 90)
SKY = (46, 110, 149)
PAPER = (247, 245, 239)
INK = (16, 26, 25)
WHITE = (255, 255, 255)
MINT = (216, 237, 230)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def grad_color(p, a, b, c1, c2):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2
    return lerp(c1, c2, max(0.0, min(1.0, t)))


def bar(d, p1, p2, w, c1, c2, gf, gt):
    """渐变色圆头粗线：用短线段+圆端堆叠，间距足够密才不会出现齿。"""
    x1, y1 = p1
    x2, y2 = p2
    dist = math.hypot(x2 - x1, y2 - y1)
    n = max(2, int(dist / 1.5))
    r = w / 2
    for i in range(n + 1):
        t = i / n
        x = x1 + (x2 - x1) * t
        y = y1 + (y2 - y1) * t
        col = grad_color((x, y), gf, gt, c1, c2) + (255,)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)


# ============================================================
# 主方案 v3：双 L 嵌套 —— 大 L 为骨，小 L 缩进其内，像回响/陪伴
#            圆润亲和，两个 L 一目了然，小尺寸不糊
# ============================================================
def draw_nest(size, bg=PAPER, transparent=False, dark=False):
    S, f = 512, SS
    img = Image.new("RGBA", (S * f, S * f), (0, 0, 0, 0))
    if not transparent:
        ImageDraw.Draw(img).rounded_rectangle(
            [0, 0, S * f - 1, S * f - 1], radius=112 * f, fill=bg + (255,))

    c1, c2 = (WHITE, MINT) if dark else (PINE, SKY)
    gf, gt = (110 * f, 120 * f), (402 * f, 402 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def sf(v):
        return v * f

    # 外层大 L —— 转角用大圆角，圆润亲和
    W1 = sf(74)
    bar(d, (sf(138), sf(132)), (sf(138), sf(378)), W1, c1, c2, gf, gt)
    bar(d, (sf(138), sf(378)), (sf(386), sf(378)), W1, c1, c2, gf, gt)

    # 内层小 L —— 缩进且同比例，构成第二枚 L
    W2 = sf(50)
    bar(d, (sf(228), sf(196)), (sf(228), sf(300)), W2, c1, c2, gf, gt)
    bar(d, (sf(228), sf(300)), (sf(340), sf(300)), W2, c1, c2, gf, gt)

    img.alpha_composite(layer)
    return img.resize((size, size), Image.LANCZOS)


# ============================================================
# 主方案：双 L 背靠背，共用中间竖笔
# ============================================================
def draw_mark(size, bg=PAPER, transparent=False, dark=False):
    S, f = 512, SS
    img = Image.new("RGBA", (S * f, S * f), (0, 0, 0, 0))
    if not transparent:
        ImageDraw.Draw(img).rounded_rectangle(
            [0, 0, S * f - 1, S * f - 1], radius=112 * f, fill=bg + (255,))

    c1, c2 = (WHITE, MINT) if dark else (PINE, SKY)
    gf, gt = (120 * f, 130 * f), (392 * f, 392 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def sf(v):
        return v * f

    W = sf(72)                   # 笔画加粗，圆润感更足
    base_y = sf(368)
    lx, mx, rx = sf(146), sf(256), sf(366)
    top_side = sf(180)
    top_mid = sf(252)            # 中间竖笔明显更矮，避免读成 W

    bar(d, (lx, top_side), (lx, base_y), W, c1, c2, gf, gt)
    bar(d, (lx, base_y), (mx, base_y), W, c1, c2, gf, gt)
    bar(d, (rx, top_side), (rx, base_y), W, c1, c2, gf, gt)
    bar(d, (rx, base_y), (mx, base_y), W, c1, c2, gf, gt)
    bar(d, (mx, top_mid), (mx, base_y), W, c1, c2, gf, gt)

    img.alpha_composite(layer)
    return img.resize((size, size), Image.LANCZOS)


# ============================================================
# 备选 D：单 L 双线 —— 一枚大 L + 内侧描出第二枚，像回声
# ============================================================
def draw_D(size, bg=PAPER, transparent=False):
    S, f = 512, SS
    img = Image.new("RGBA", (S * f, S * f), (0, 0, 0, 0))
    if not transparent:
        ImageDraw.Draw(img).rounded_rectangle(
            [0, 0, S * f - 1, S * f - 1], radius=112 * f, fill=PAPER + (255,))
    c1, c2 = PINE, SKY
    gf, gt = (110 * f, 120 * f), (402 * f, 400 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def sf(v):
        return v * f

    W = sf(58)
    # 外层大 L
    bar(d, (sf(136), sf(128)), (sf(136), sf(384)), W, c1, c2, gf, gt)
    bar(d, (sf(136), sf(384)), (sf(384), sf(384)), W, c1, c2, gf, gt)
    # 内层小 L（缩进，形成「第二个 L」的回声）
    W2 = sf(38)
    bar(d, (sf(216), sf(190)), (sf(216), sf(318)), W2, c1, c2, gf, gt)
    bar(d, (sf(216), sf(318)), (sf(330), sf(318)), W2, c1, c2, gf, gt)

    img.alpha_composite(layer)
    return img.resize((size, size), Image.LANCZOS)


# ============================================================
# 备选 E：圆润连接体 —— 两个 L 的底笔连成一整条圆弧托底
# ============================================================
def draw_E(size, bg=PAPER, transparent=False):
    S, f = 512, SS
    img = Image.new("RGBA", (S * f, S * f), (0, 0, 0, 0))
    if not transparent:
        ImageDraw.Draw(img).rounded_rectangle(
            [0, 0, S * f - 1, S * f - 1], radius=112 * f, fill=PAPER + (255,))
    c1, c2 = PINE, SKY
    gf, gt = (110 * f, 120 * f), (402 * f, 400 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def sf(v):
        return v * f

    W = sf(62)
    # 两根竖笔
    bar(d, (sf(150), sf(140)), (sf(150), sf(300)), W, c1, c2, gf, gt)
    bar(d, (sf(362), sf(140)), (sf(362), sf(300)), W, c1, c2, gf, gt)
    # 底部一整条大圆弧托底（两枚 L 的底笔连成一体）
    pts = []
    N = 90
    for i in range(N + 1):
        ang = math.radians(180 - 180 * i / N)
        pts.append((sf(256 + 128 * math.cos(ang)), sf(300 + 92 * math.sin(ang))))
    for i in range(N):
        bar(d, pts[i], pts[i + 1], W, c1, c2, gf, gt)
    # 中央小圆点（& 的暗示）
    d.ellipse([sf(256 - 34), sf(238 - 34), sf(256 + 34), sf(238 + 34)],
              fill=lerp(PINE, SKY, 0.5) + (255,))

    img.alpha_composite(layer)
    return img.resize((size, size), Image.LANCZOS)


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG")
    print("OK", name, img.size, os.path.getsize(p), "b")


if __name__ == "__main__":
    # 主方案：嵌套双 L
    save(draw_nest(512), "v2-mark-512.png")
    save(draw_nest(128), "v2-mark-128.png")
    save(draw_nest(64), "v2-mark-64.png")
    save(draw_nest(32), "v2-mark-32.png")
    save(draw_nest(512, transparent=True), "v2-mark-transparent-512.png")
    save(draw_nest(64, transparent=True), "v2-mark-transparent-64.png")
    save(draw_nest(512, bg=INK, dark=True), "v2-mark-dark-512.png")
    save(draw_nest(64, bg=INK, dark=True), "v2-mark-dark-64.png")
    # 备选：共用中竖
    save(draw_mark(512), "v2-B-512.png")
    save(draw_mark(64), "v2-B-64.png")
    # 备选：圆润连接体
    save(draw_E(512), "v2-E-512.png")
    save(draw_E(64), "v2-E-64.png")

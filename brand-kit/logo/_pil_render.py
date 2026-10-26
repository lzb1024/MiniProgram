# -*- coding: utf-8 -*-
"""
L&L 标识 · 定稿几何绘制。
核心思路：两枚 L 面对面（左 L 正常、右 L 水平镜像），
两条底笔在中线交会形成共享基线，两条竖笔一高一低形成呼应，
中间的负形空隙自然读作「&」的连接枢纽。
4 倍超采样抗锯齿，输出透明 PNG。
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


def grad_along(p, a, b, c1, c2):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2
    return lerp(c1, c2, max(0.0, min(1.0, t)))


def bar(d, p1, p2, width, c1, c2, gfrom, gto):
    """渐变色圆头粗线段。"""
    x1, y1 = p1
    x2, y2 = p2
    n = max(2, int(math.hypot(x2 - x1, y2 - y1) / 2))
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        ax, ay = x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0
        bx, by = x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1
        col = grad_along(((ax + bx) / 2, (ay + by) / 2), gfrom, gto, c1, c2)
        d.line([ax, ay, bx, by], fill=col + (255,), width=int(width))
        r = width / 2
        d.ellipse([ax - r, ay - r, ax + r, ay + r], fill=col + (255,))


def ring(d, cx, cy, rad, width, c1, c2, gfrom, gto):
    """画渐变色圆环：按角度细分，用实心扇面填充带宽，避免圆头帽叠加出锯齿。"""
    seg = 240
    half = width / 2
    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        # 该扇区的颜色取中角
        am = (a0 + a1) / 2
        col = grad_along((cx + rad * math.cos(am), cy + rad * math.sin(am)),
                         gfrom, gto, c1, c2)
        # 外弧两个点 + 内弧两个点，构成一段环带
        poly = [
            (cx + (rad + half) * math.cos(a0), cy + (rad + half) * math.sin(a0)),
            (cx + (rad + half) * math.cos(a1), cy + (rad + half) * math.sin(a1)),
            (cx + (rad - half) * math.cos(a1), cy + (rad - half) * math.sin(a1)),
            (cx + (rad - half) * math.cos(a0), cy + (rad - half) * math.sin(a0)),
        ]
        d.polygon(poly, fill=col + (255,))


def new_canvas(size, bg=None, radius=112):
    S = 512
    img = Image.new("RGBA", (S * SS, S * SS), (0, 0, 0, 0))
    if bg is not None:
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, S * SS - 1, S * SS - 1], radius=radius * SS, fill=bg + (255,))
    return img


def finish(img, size):
    return img.resize((size, size), Image.LANCZOS)


# ============================================================
# 主方案：双 L 对望 + 负形 &
# ============================================================
def draw_primary(size, bg=PAPER, transparent=False, dark=False):
    S, f = 512, SS
    img = new_canvas(size, None if transparent else bg, 112)

    c1, c2 = (WHITE, MINT) if dark else (PINE, SKY)
    gfrom, gto = (110 * f, 130 * f), (402 * f, 400 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    W = 52 * f          # 笔画粗细
    base_y = 380 * f    # 基线
    lx = 132 * f        # 左竖位置
    rx = 380 * f        # 右竖位置
    mid = 256 * f

    def sf(v):
        return v * f

    # 左 L：竖笔（高） + 底笔向右
    bar(d, (sf(132), sf(150)), (sf(132), base_y), W, c1, c2, gfrom, gto)
    bar(d, (sf(132), base_y), (mid, base_y), W, c1, c2, gfrom, gto)

    # 右 L：镜像，竖笔（略矮） + 底笔向左，两条底笔在中央交会
    bar(d, (sf(380), sf(198)), (sf(380), base_y), W, c1, c2, gfrom, gto)
    bar(d, (sf(380), base_y), (mid, base_y), W, c1, c2, gfrom, gto)

    img.alpha_composite(layer)
    return finish(img, size)


# ============================================================
# 备选 B：闭合环抱 —— 两枚 L 的底笔向外上卷成弧，缺口朝上
#          整体形成「双括号 / 拥抱」轮廓，顶梁缺失，靠留白呼吸
# ============================================================
def draw_B(size, bg=PAPER, transparent=False):
    S, f = 512, SS
    img = new_canvas(size, None if transparent else bg, 112)
    c1, c2 = PINE, SKY
    gfrom, gto = (110 * f, 130 * f), (402 * f, 400 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    W = 54 * f

    def sf(v):
        return v * f

    # 左侧：竖笔 + 底笔，底笔末端向上微翘（像一只手托住）
    bar(d, (sf(140), sf(146)), (sf(140), sf(322)), W, c1, c2, gfrom, gto)
    bar(d, (sf(140), sf(322)), (sf(196), sf(378)), W, c1, c2, gfrom, gto)

    # 右侧：镜像
    bar(d, (sf(372), sf(146)), (sf(372), sf(322)), W, c1, c2, gfrom, gto)
    bar(d, (sf(372), sf(322)), (sf(316), sf(378)), W, c1, c2, gfrom, gto)

    # 中央：一个方形枢纽把两侧连起来，负形读作 &
    d.rounded_rectangle([sf(214), sf(212), sf(298), sf(300)],
                        radius=sf(24), fill=lerp(c1, c2, 0.5) + (255,))
    # 枢纽中挖一个圆孔，强化 & 的「环」
    d.ellipse([sf(238), sf(238), sf(274), sf(274)], fill=(0, 0, 0, 0))

    img.alpha_composite(layer)
    return finish(img, size)


# ============================================================
# 备选 C：共用笔画 —— 两枚 L 的竖笔与「&」的斜杠共用同一根笔画
#          造型为两根等粗笔画构成的「K 字反转」结构，最抽象最轻奢
# ============================================================
def draw_C(size, bg=PAPER, transparent=False):
    S, f = 512, SS
    img = new_canvas(size, None if transparent else bg, 112)
    c1, c2 = PINE, SKY
    gfrom, gto = (110 * f, 130 * f), (402 * f, 400 * f)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    W = 52 * f

    def sf(v):
        return v * f

    # 共享基线
    bar(d, (sf(120), sf(384)), (sf(392), sf(384)), W, c1, c2, gfrom, gto)
    # 左竖
    bar(d, (sf(160), sf(152)), (sf(160), sf(384)), W, c1, c2, gfrom, gto)
    # 右竖
    bar(d, (sf(352), sf(152)), (sf(352), sf(384)), W, c1, c2, gfrom, gto)
    # 中央斜杠：从左上到右下，与两竖共同cut出 & 的负形
    bar(d, (sf(232), sf(190)), (sf(280), sf(330)), W, c1, c2, gfrom, gto)
    # 斜杠末端的小横，补全 & 的尾笔
    bar(d, (sf(280), sf(330)), (sf(320), sf(330)), W, c1, c2, gfrom, gto)

    img.alpha_composite(layer)
    return finish(img, size)


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG")
    print("OK", name, img.size, os.path.getsize(p), "b")


if __name__ == "__main__":
    save(draw_primary(512), "mark-512.png")
    save(draw_primary(256), "mark-256.png")
    save(draw_primary(128), "mark-128.png")
    save(draw_primary(64), "mark-64.png")
    save(draw_primary(512, bg=INK, dark=True), "mark-dark-512.png")
    save(draw_primary(64, bg=INK, dark=True), "mark-dark-64.png")
    save(draw_primary(512, transparent=True), "mark-transparent-512.png")
    save(draw_primary(64, transparent=True), "mark-transparent-64.png")

    save(draw_B(512), "B-512.png")
    save(draw_B(64), "B-64.png")
    save(draw_C(512), "C-512.png")
    save(draw_C(64), "C-64.png")

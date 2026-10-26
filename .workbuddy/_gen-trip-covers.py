# -*- coding: utf-8 -*-
"""生成两张行程封面（static/cover-chuanxi.png / cover-changsha.png）。

风格：山野手账浅色系 + 品牌渐变打底（松林青 #1E6B5A → 雪峰蓝 #2E6E95），
上面压一层低透明度的白色剪影，所以卡片上盖的白字仍然读得清。
封面在页面里是 height:260rpx 的 aspectFill，输出 1200x490（约 2.45:1）。
"""

import os
from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'static')
W, H = 1200, 490

PINE = (30, 107, 90)
SKY = (46, 110, 149)
SAND = (255, 205, 150)


def diagonal_gradient(c1, c2):
    """c1 在左上、c2 在右下。做法：大正方形线性渐变旋转 45 度后裁中心，避免插值发灰。"""
    big = 2000
    g = Image.linear_gradient('L').resize((big, big), Image.BICUBIC)
    g = g.rotate(45, resample=Image.BICUBIC)
    left = (big - W) // 2
    top = (big - H) // 2
    g = g.crop((left, top, left + W, top + H))
    return ImageOps.colorize(g, black=c1, white=c2).convert('RGBA')


def layer(img, draw_fn):
    """在独立透明层上画完再整层合回 —— 每个元素才能有各自的透明度。"""
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(lay))
    img.alpha_composite(lay)


def cover_chuanxi():
    img = diagonal_gradient(PINE, SKY)
    w = (255, 255, 255)

    # 远山三层折线，越近越亮，制造纵深
    ridges = [
        ([(0, 386), (170, 316), (330, 362), (460, 262), (610, 352),
          (790, 274), (940, 344), (1090, 300), (1200, 336), (1200, H), (0, H)], 15),
        ([(0, 424), (200, 372), (370, 412), (560, 344), (760, 406),
          (920, 356), (1070, 402), (1200, 370), (1200, H), (0, H)], 25),
        ([(0, 460), (230, 424), (430, 456), (640, 414), (860, 460),
          (1040, 428), (1200, 452), (1200, H), (0, H)], 36),
    ]
    for pts, alpha in ridges:
        layer(img, lambda d, p=pts, a=alpha: d.polygon(p, fill=w + (a,)))

    # 雪线：以主峰为顶点的小三角，压在峰顶而不是浮在上面
    caps = [
        ((460, 262), 24, 40),
        ((790, 274), 21, 34),
    ]
    for (px, py), half, height in caps:
        pts = [(px, py), (px + half, py + height), (px + half * 0.35, py + height * 0.72),
               (px - half * 0.2, py + height * 0.9), (px - half, py + height)]
        layer(img, lambda d, p=pts: d.polygon(p, fill=w + (68,)))

    # 右上一轮淡月
    layer(img, lambda d: d.ellipse((930, 58, 1034, 162), fill=w + (28,)))
    return img


def cover_changsha():
    img = diagonal_gradient((36, 96, 140), PINE)
    w = (255, 255, 255)

    # 暖月：长沙这张用一点陶土暖调，和川西的冷色拉开
    layer(img, lambda d: d.ellipse((122, 62, 222, 162), fill=(SAND[0], SAND[1], SAND[2], 48)))

    # 江面
    layer(img, lambda d: d.rectangle((0, 440, W, H), fill=w + (12,)))
    layer(img, lambda d: d.rectangle((0, 452, W, 454), fill=w + (30,)))

    # 桥：一条桥面 + 三个半圆拱 + 四根桥墩（橘子洲大桥那种连续拱）
    layer(img, lambda d: d.rectangle((100, 350, 700, 357), fill=w + (44,)))
    for x0 in (100, 300, 500):
        layer(img, lambda d, x=x0: d.arc((x, 350, x + 200, 450), 180, 360, fill=w + (30,), width=6))
    for px in (100, 300, 500, 700):
        layer(img, lambda d, p=px: d.rectangle((p - 3, 357, p + 3, 452), fill=w + (34,)))

    # 拱在水里的倒影：更淡、更短
    for x0 in (100, 300, 500):
        layer(img, lambda d, x=x0: d.arc((x, 454, x + 200, 522), 0, 180, fill=w + (13,), width=5))

    # 天际线：落在江面上，高低错落
    towers = [
        (740, 316, 56), (806, 268, 42), (858, 334, 66), (934, 286, 50),
        (994, 244, 38), (1042, 318, 60), (1112, 278, 46),
    ]
    for x, top, tw in towers:
        layer(img, lambda d, a=x, b=top, c=tw: d.rectangle((a, b, a + c, 452), fill=w + (24,)))
    for x, top, tw in towers:
        layer(img, lambda d, a=x, b=top, c=tw: d.rectangle((a + c // 2 - 4, b - 13, a + c // 2 + 4, b), fill=w + (38,)))
    return img


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    for name, fn in (('cover-chuanxi.png', cover_chuanxi), ('cover-changsha.png', cover_changsha)):
        path = os.path.join(OUT, name)
        fn().convert('RGB').save(path, 'PNG', optimize=True)
        print('%-24s %6.1f KB  %dx%d' % (name, os.path.getsize(path) / 1024.0, W, H))


if __name__ == '__main__':
    main()

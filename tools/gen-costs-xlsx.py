# -*- coding: utf-8 -*-
"""川西 9 日行程消费明细 —— xlsxwriter 直写

为什么用 xlsxwriter 而不是 openpyxl：
  本机既无 LibreOffice 也无 formulas 引擎，openpyxl 只写公式字符串、不带缓存值，
  预览器（微信/邮件附件、data_only 读取）会显示空白。xlsxwriter 的 write_formula
  可同时写公式和缓存结果，一步到位。

布局锚点（0-based 行号）
  消费明细：0 标题 / 1 表头 / 2~12 数据(11 笔) / 13 合计
  分类汇总：0 标题 / 1 表头 / 2~8 数据(7 大类) / 9 合计 / 11 分摊人数 / 12 人均分摊
"""

import datetime
import os

try:
    import xlsxwriter
except ImportError:
    import subprocess
    import sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "xlsxwriter>=3.2.0"])
    import xlsxwriter

# ---------------------------------------------------------------- 常量

HEAD_BG = "#1E6B5A"
PAPER = "#F7F5EF"
SUBBG = "#FBFAF6"
LINE = "#E4E1D5"
TEXT = "#22302E"
SUB = "#5A6B66"
MUTE = "#8C9A94"
CLAY = "#B4552D"

FONT = "微软雅黑"
MONEY_FMT = "¥#,##0.00"
PCT_FMT = "0.00%"

TITLE = "川西 9 日行程消费明细"
CATS = ["机票", "高铁", "当地交通", "门票", "住宿", "餐饮", "其他"]
SHARE = 2  # 与小程序 mock 的 costs.shareCount 一致

# (用途, 分类, 金额, 备注) —— 按分类分组，组内金额降序
ROWS = [
    ("厦门-成都", "机票", 1480, ""),
    ("成都-厦门", "机票", 1380, ""),
    ("29号-1号 九寨沟民宿", "住宿", 567, ""),
    ("1号-3号酒店", "住宿", 547, ""),
    ("26号-28号 四姑娘山民宿", "住宿", 516, ""),
    ("25号晚酒店", "住宿", 195, ""),
    ("28号晚酒店", "住宿", 174, ""),
    ("四姑娘山门票", "门票", 400, ""),
    ("熊猫基地", "门票", 170, ""),
    ("成都-四姑娘山大巴", "当地交通", 248, "分类为推断：按小程序说明，大巴归「当地交通」"),
    ("pocket租赁", "其他", 262, ""),
]

# ------------------------------------------------------- 先把缓存值算出来

N = len(ROWS)
DATA_ROW, DATA_END = 2, 2 + N - 1          # 2 ~ 12
TOTAL_ROW = DATA_END + 1                   # 13
SUM_ROW = TOTAL_ROW + 1                    # 14（Excel 1-based 的合计行号）

TOTAL = sum(r[2] for r in ROWS)
CAT_SUM = {c: sum(r[2] for r in ROWS if r[1] == c) for c in CATS}
CAT_CNT = {c: sum(1 for r in ROWS if r[1] == c) for c in CATS}

M = len(CATS)
D2_ROW, D2_END = 2, 2 + M - 1              # 汇总表数据区 2 ~ 8
T2_ROW = D2_END + 1                        # 9 合计
T2_EXCEL = T2_ROW + 1                      # 10（Excel 1-based）
S_ROW = T2_ROW + 2                         # 11 分摊人数
S2_ROW = S_ROW + 1                         # 12 人均分摊

TITLE_FMT = None  # 占位，稍后按 workbook 创建

# 输出到仓库根目录（脚本在 tools/ 下，所以往上退一层）。用相对路径而非硬编码绝对路径，
# 换机器也能跑。
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "川西消费明细.xlsx")
if os.path.exists(OUT):
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    OUT = OUT[:-5] + f"_{stamp}.xlsx"

wb = xlsxwriter.Workbook(OUT, {"default_date_format": "yyyy-mm-dd"})
wb.set_properties({"title": TITLE, "comments": "照此逐笔录入小程序「花费统计」"})

# ---------------------------------------------------------------- 格式

f_title = wb.add_format({"font_name": FONT, "font_size": 14, "bold": True,
                         "font_color": HEAD_BG, "bg_color": PAPER, "align": "left",
                         "valign": "vcenter", "bottom": 1, "bottom_color": LINE})
f_head = wb.add_format({"font_name": FONT, "font_size": 11, "bold": True,
                        "font_color": "#FFFFFF", "bg_color": HEAD_BG, "align": "center",
                        "valign": "vcenter", "border": 1, "border_color": HEAD_BG})
f_idx = wb.add_format({"font_name": FONT, "font_size": 11, "font_color": TEXT,
                       "align": "center", "valign": "vcenter",
                       "border": 1, "border_color": LINE})
f_text = wb.add_format({"font_name": FONT, "font_size": 11, "font_color": TEXT,
                        "align": "left", "valign": "vcenter",
                        "border": 1, "border_color": LINE})
f_money = wb.add_format({"font_name": FONT, "font_size": 11, "font_color": TEXT,
                         "num_format": MONEY_FMT, "align": "right", "valign": "vcenter",
                         "border": 1, "border_color": LINE})
f_note = wb.add_format({"font_name": FONT, "font_size": 10, "font_color": SUB,
                        "align": "left", "valign": "vcenter", "text_wrap": True,
                        "border": 1, "border_color": LINE})
f_sum_lbl = wb.add_format({"font_name": FONT, "font_size": 11, "bold": True,
                           "font_color": HEAD_BG, "bg_color": PAPER, "align": "right",
                           "valign": "vcenter", "top": 2, "top_color": HEAD_BG,
                           "border": 1, "border_color": LINE})
f_sum_money = wb.add_format({"font_name": FONT, "font_size": 12, "bold": True,
                             "font_color": CLAY, "bg_color": PAPER, "num_format": MONEY_FMT,
                             "align": "right", "valign": "vcenter",
                             "top": 2, "top_color": HEAD_BG,
                             "border": 1, "border_color": LINE})
f_sum_txt = wb.add_format({"font_name": FONT, "font_size": 11, "bold": True,
                           "font_color": HEAD_BG, "bg_color": PAPER, "align": "left",
                           "valign": "vcenter", "top": 2, "top_color": HEAD_BG,
                           "border": 1, "border_color": LINE})
f_sum_center = wb.add_format({"font_name": FONT, "font_size": 11, "bold": True,
                              "font_color": HEAD_BG, "bg_color": PAPER, "align": "center",
                              "valign": "vcenter", "top": 2, "top_color": HEAD_BG,
                              "border": 1, "border_color": LINE})
f_pct = wb.add_format({"font_name": FONT, "font_size": 11, "font_color": TEXT,
                       "num_format": PCT_FMT, "align": "right", "valign": "vcenter",
                       "border": 1, "border_color": LINE})
f_pct_sum = wb.add_format({"font_name": FONT, "font_size": 11, "bold": True,
                           "font_color": HEAD_BG, "bg_color": PAPER,
                           "num_format": PCT_FMT, "align": "right", "valign": "vcenter",
                           "top": 2, "top_color": HEAD_BG,
                           "border": 1, "border_color": LINE})
f_mute = wb.add_format({"font_name": FONT, "font_size": 11, "font_color": MUTE,
                        "num_format": MONEY_FMT, "align": "right", "valign": "vcenter",
                        "border": 1, "border_color": LINE})
f_key = wb.add_format({"font_name": FONT, "font_size": 11, "bold": True,
                       "font_color": HEAD_BG, "bg_color": SUBBG, "align": "center",
                       "valign": "vcenter", "border": 1, "border_color": LINE})
f_val = wb.add_format({"font_name": FONT, "font_size": 11, "font_color": TEXT,
                       "bg_color": SUBBG, "align": "center", "valign": "vcenter",
                       "border": 1, "border_color": LINE})
f_val_money = wb.add_format({"font_name": FONT, "font_size": 12, "bold": True,
                             "font_color": CLAY, "bg_color": SUBBG, "num_format": MONEY_FMT,
                             "align": "right", "valign": "vcenter",
                             "border": 1, "border_color": LINE})
f_hint = wb.add_format({"font_name": FONT, "font_size": 10, "font_color": SUB,
                        "bg_color": SUBBG, "align": "left", "valign": "vcenter"})

# ================================================== Sheet 1 · 消费明细

ws = wb.add_worksheet("消费明细")
ws.set_row(0, 26)
ws.set_row(1, 22)

ws.merge_range(0, 0, 0, 4, TITLE, f_title)
for col, name in zip(range(5), ["序号", "用途", "分类", "金额（元）", "备注"]):
    ws.write(1, col, name, f_head)

for i, (note, cat, amount, remark) in enumerate(ROWS):
    r = DATA_ROW + i
    ws.write_number(r, 0, i + 1, f_idx)
    ws.write_string(r, 1, note, f_text)
    ws.write_string(r, 2, cat, f_text)
    ws.write_number(r, 3, amount, f_money)
    ws.write_string(r, 4, remark, f_note)

ws.merge_range(TOTAL_ROW, 0, TOTAL_ROW, 2, "合计", f_sum_lbl)
ws.write_formula(TOTAL_ROW, 3, f"=SUM(D{DATA_ROW + 1}:D{DATA_END + 1})", f_sum_money, TOTAL)
ws.write_string(TOTAL_ROW, 4, f"共 {N} 笔", f_sum_txt)

# 分类下拉：与小程序「花费统计」的 7 大类完全同源
ws.data_validation(DATA_ROW, 2, DATA_END, 2, {
    "validate": "list",
    "source": CATS,
    "error_type": "stop",
    "error_title": "分类不合法",
    "error_message": "只能选小程序里的 7 大类",
})

ws.autofilter(1, 0, DATA_END, 4)
for col, w in zip(range(5), [6, 26, 12, 14, 34]):
    ws.set_column(col, col, w)

# ================================================== Sheet 2 · 分类汇总

ws2 = wb.add_worksheet("分类汇总")
ws2.set_row(0, 26)
ws2.set_row(1, 22)

ws2.merge_range(0, 0, 0, 3, "分类小计与人均分摊", f_title)
for col, name in zip(range(4), ["分类", "金额（元）", "笔数", "占比"]):
    ws2.write(1, col, name, f_head)

DET_C = f"'消费明细'!$C${DATA_ROW + 1}:$C${DATA_END + 1}"
DET_D = f"'消费明细'!$D${DATA_ROW + 1}:$D${DATA_END + 1}"

for i, cat in enumerate(CATS):
    r = D2_ROW + i
    amount = CAT_SUM[cat]
    ws2.write_string(r, 0, cat, f_text)
    ws2.write_formula(r, 1, f"=SUMIF({DET_C},A{r + 1},{DET_D})",
                      f_mute if amount == 0 else f_money, amount)
    ws2.write_formula(r, 2, f"=COUNTIF({DET_C},A{r + 1})", f_idx, CAT_CNT[cat])
    ratio = amount / TOTAL if TOTAL else 0
    ws2.write_formula(r, 3, f'=IF(OR($B${T2_EXCEL}="",$B${T2_EXCEL}=0),"",B{r + 1}/$B${T2_EXCEL})',
                      f_pct, ratio)

ws2.write_string(T2_ROW, 0, "合计", f_sum_lbl)
ws2.write_formula(T2_ROW, 1, f"=SUM(B{D2_ROW + 1}:B{D2_END + 1})", f_sum_money, TOTAL)
ws2.write_formula(T2_ROW, 2, f"=SUM(C{D2_ROW + 1}:C{D2_END + 1})", f_sum_center, N)
ws2.write_formula(T2_ROW, 3, f'=IF(OR($B${T2_EXCEL}="",$B${T2_EXCEL}=0),"",SUM(D{D2_ROW + 1}:D{D2_END + 1}))',
                  f_pct_sum, 1.0)

# 分摊区
ws2.write_string(S_ROW, 0, "分摊人数", f_key)
ws2.write_number(S_ROW, 1, SHARE, f_val)
ws2.merge_range(S_ROW, 2, S_ROW, 3, "人（与小程序 costs.shareCount 一致）", f_hint)

ws2.write_string(S2_ROW, 0, "人均分摊", f_key)
ws2.write_formula(S2_ROW, 1, f'=IF(OR(B{S_ROW + 1}="",B{S_ROW + 1}=0,B{T2_EXCEL}=""),"",'
                              f'ROUND(B{T2_EXCEL}/B{S_ROW + 1},2))',
                  f_val_money, round(TOTAL / SHARE, 2))
ws2.merge_range(S2_ROW, 2, S2_ROW, 3, "元 / 人", f_hint)

# 未记账的分类置灰（对应小程序「未记账显示 ¥0 并置灰」）
ws2.conditional_format(D2_ROW, 1, D2_END, 1, {
    "type": "cell", "criteria": "==", "value": 0,
    "format": wb.add_format({"font_name": FONT, "font_size": 11, "font_color": MUTE,
                             "num_format": MONEY_FMT, "align": "right", "valign": "vcenter",
                             "border": 1, "border_color": LINE}),
})

for col, w in zip(range(4), [14, 14, 8, 10]):
    ws2.set_column(col, col, w)

wb.close()
print("SAVED", OUT)
print("TOTAL", TOTAL, "AVG", round(TOTAL / SHARE, 2))

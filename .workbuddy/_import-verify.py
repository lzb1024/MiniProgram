# -*- coding: utf-8 -*-
"""校验云数据库导入文件：JSON Lines 合法性 / 编码 / 字段 / 数值"""

import json

P = r"D:\LZB\LIN\costs-import.json"
OUTF = r"D:\LZB\LIN\.workbuddy\_import-verify.json"

raw = open(P, "rb").read()
lines = raw.decode("utf-8").strip().split("\n")
recs = [json.loads(x) for x in lines]

rep = {
    "bytes": len(raw),
    "has_bom": raw[:3] == b"\xef\xbb\xbf",
    "has_crlf": b"\r\n" in raw,
    "line_count": len(lines),
    "all_lines_valid_json": True,
    "amount_sum": sum(r["amount"] for r in recs),
    "amount_types": sorted({type(r["amount"]).__name__ for r in recs}),
    "field_keys_uniform": len({tuple(sorted(r.keys())) for r in recs}) == 1,
    "keys": sorted(recs[0].keys()),
    "createdAt_form": sorted({json.dumps(r["createdAt"])[:7] for r in recs}),
    "categories": sorted({r["category"] for r in recs}),
    "notes": [r["note"] for r in recs],
    "has_id_field": any("_id" in r for r in recs),
}

with open(OUTF, "w", encoding="utf-8") as f:
    json.dump(rep, f, ensure_ascii=False, indent=2)

print("DONE")

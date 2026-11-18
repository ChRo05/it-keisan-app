"""マスター（xlsx）を読んで、アプリが使う形に直す。

check.py と build.py の両方がここを使う。読み方を1か所にまとめるため。
決まりは 03_AI作業／1118_実装計画.md の5章。
"""
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "data" / "master.xlsx"

CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
KANA = ["ア", "イ", "ウ", "エ"]


def _rows(wb, name):
    ws = wb[name]
    out = []
    for r in ws.iter_rows(values_only=True):
        if any(c is not None and str(c).strip() != "" for c in r):
            out.append(["" if c is None else c for c in r])
    return out


def _table(wb, name):
    rows = _rows(wb, name)
    head = [str(h).strip() for h in rows[0]]
    return head, [dict(zip(head, r)) for r in rows[1:]]


def _s(v):
    """セルの値を文字にする。1.0 のような整数の小数は 1 にする。"""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def parse_fields(text):
    """段階2_欄 を欄に分ける（5-1）。

    返り値：[{name, answers:[...], unit, choices:[...] or None}]
    読めないときは ValueError。
    """
    text = _s(text)
    if not text:
        raise ValueError("段階2_欄が空")
    if text[0] in CIRCLED:
        parts = re.split("[" + CIRCLED + "]", text)
        parts = [p.strip() for p in parts if p.strip()]
    else:
        parts = [text]
    fields = []
    for p in parts:
        cols = p.split("｜")
        if len(cols) != 3:
            raise ValueError(f"「｜」で3つに分けられない：{p}")
        name, ans, third = (c.strip() for c in cols)
        answers = [a.strip() for a in ans.split("／") if a.strip()]
        if not name or not answers:
            raise ValueError(f"欄の名前か答えが空：{p}")
        choices = None
        unit = ""
        if third.startswith("語群："):
            choices = re.findall(r"「([^」]+)」", third)
            if not choices:
                raise ValueError(f"語群の選択肢が読めない：{p}")
        elif third != "なし":
            unit = third
        fields.append({"name": name, "answers": answers, "unit": unit, "choices": choices})
    return fields


def parse_steps(text):
    """手順を「1. 〜 2. 〜」で1手ずつに分ける（5-4）。"""
    text = _s(text)
    if not text:
        return []
    pieces = re.split(r"(?:^|\s)(\d+)\.\s", " " + text)
    # pieces = ['', '1', '本文', '2', '本文', ...]
    steps = []
    for i in range(1, len(pieces) - 1, 2):
        steps.append({"no": int(pieces[i]), "text": pieces[i + 1].strip()})
    return steps


def parse_guide(text):
    """案内先「1→IT-01-P04、3→IT-01-P04」を {手の番号: ID} にする。"""
    text = _s(text)
    out = {}
    if not text:
        return out
    for part in text.split("、"):
        m = re.fullmatch(r"\s*(\d+)→(IT-\d\d-P\d\d)\s*", part)
        if not m:
            raise ValueError(f"案内先が読めない：{part}")
        out[int(m.group(1))] = m.group(2)
    return out


def parse_stuck(text):
    text = _s(text)
    if not text:
        return []
    return [int(x) for x in re.split("[、,]", text) if x.strip()]


def load():
    wb = openpyxl.load_workbook(MASTER, read_only=True, data_only=True)
    _, q = _table(wb, "01_問題")
    _, e = _table(wb, "02_解説")
    _, f = _table(wb, "03_公式")
    _, p = _table(wb, "04_前提の算数")
    _, t = _table(wb, "05_用語・単位")
    _, c = _table(wb, "08_章")
    rubric_rows = _rows(wb, "09_ルーブリック")
    return {"q": q, "e": e, "f": f, "p": p, "t": t, "c": c, "rubric_rows": rubric_rows}

"""マスター → JSON → index.html（リポジトリ直下。GitHub Pages でそのまま配る）（1118_実装計画.md の4章・5章）。

使い方：
  python3 build/build.py            全章で作る
  python3 build/build.py --ch 8     8章だけで作る（試しの区切り用）

check.py が合格しないと作らない。同じマスターなら同じHTMLになる。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from master import KANA, ROOT, _s, load, parse_fields, parse_guide, parse_steps, parse_stuck

SRC = ROOT / "src"


def split_list(text):
    return [x.strip() for x in re.split("[、,]", _s(text)) if x.strip()]


def chapter_no(v):
    return int(float(_s(v)))


def build_data(chapters_only=None):
    m = load()
    exp = {_s(r["問題ID"]): r for r in m["e"]}

    chapters = []
    for r in sorted(m["c"], key=lambda r: chapter_no(r["章"])):
        no = chapter_no(r["章"])
        if chapters_only and no not in chapters_only:
            continue
        chapters.append({
            "no": no,
            "name": _s(r["章名"]),
            "field": _s(r["分野"]),
            "fieldDetail": _s(r["分野_詳細"]),
            "meaning": [_s(r["意味の問い_" + k]) for k in KANA],
            "goal": _s(r["到達目標"]),
        })
    keep = {c["no"] for c in chapters}

    questions = []
    for r in sorted(m["q"], key=lambda r: _s(r["問題ID"])):
        no = chapter_no(r["章"])
        if no not in keep:
            continue
        pid = _s(r["問題ID"])
        e = exp[pid]
        questions.append({
            "id": pid,
            "ch": no,
            "topic": _s(r["論点"]),
            "goal": _s(r["学習目標"]),
            "level": _s(r["難易度"]),
            "text": _s(r["問題文"]),
            "opts": [_s(r["選択肢" + k]) for k in KANA],
            "a1": KANA.index(_s(r["段階1_正解"])),
            "fields": parse_fields(r["段階2_欄"]),
            "meaning": KANA.index(_s(r["意味の問い_正解"])),
            "round": "" if _s(r["丸め"]) == "なし" else _s(r["丸め"]),
            "exams": _s(r["対象試験"]).split("・"),
            "j1": _s(r["情報Iの単元"]),
            "past": _s(r["出典区分"]).startswith("過去問"),
            "src": _s(r["出典"]),
            "pre": split_list(r["前提の算数"]),
            "x": {
                "makura": _s(e["まくら"]),
                "what": _s(e["何を求めるか"]),
                "steps": [s["text"] for s in parse_steps(e["手順"])],
                "wrong": _s(e["よくある誤答"]),
                "why": _s(e["誤答の理由"]),
                "sage": _s(e["サゲ"]),
                "next": _s(e["次にやること"]),
                "stuck": parse_stuck(e["止まった手_選択肢"]),
                "guide": {str(k): v for k, v in parse_guide(e["案内先"]).items()},
            },
        })

    formulas = {}
    for r in m["f"]:
        no = chapter_no(r["章"])
        if no in keep:
            formulas.setdefault(str(no), []).append({"item": _s(r["項目"]), "expr": _s(r["式"])})

    pre = {}
    for r in m["p"]:
        pid = _s(r["ID"])
        if int(pid[3:5]) in keep:
            pre[pid] = {"q": _s(r["ミニ問題"]), "a": _s(r["答え"])}

    terms = [{"term": _s(r["用語"]), "how": _s(r["書き方"]), "use": _s(r["使う問題"])} for r in m["t"]]

    rubric = parse_rubric(m["rubric_rows"])
    return {"chapters": chapters, "questions": questions, "formulas": formulas,
            "pre": pre, "terms": terms, "rubric": rubric}


def parse_rubric(rows):
    """09_ルーブリック を読む。表の形は 1118_マスター（確定）.xlsx のとおり。"""
    views, stages, notes = [], [], {}
    mode = "view"
    for r in rows[1:]:
        a = _s(r[0])
        if a == "段階":
            mode = "stage"
            continue
        if mode == "view" and a in ("取り組み", "到達", "定着"):
            views.append({"name": a, "what": _s(r[1]),
                          "th": [float(r[3]), float(r[4]), float(r[5])], "next": _s(r[6])})
        elif mode == "stage" and re.fullmatch(r"\d+", a):
            stages.append({"no": int(a), "name": _s(r[1]), "cond": _s(r[2]), "word": _s(r[3])})
        else:
            notes[a] = _s(r[1])
            mode = "note"
    if len(views) != 3 or len(stages) != 5:
        raise SystemExit("09_ルーブリックの形が読めない")
    return {"views": views, "stages": stages, "notes": notes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ch", help="作る章（カンマ区切り）。省くと全章")
    ap.add_argument("--out", default=str(ROOT / "index.html"), help="書き出す先")
    ap.add_argument("--skip-check", action="store_true", help="点検を省く（使わない）")
    args = ap.parse_args()

    if not args.skip_check:
        r = subprocess.run([sys.executable, str(Path(__file__).with_name("check.py"))])
        if r.returncode != 0:
            raise SystemExit("点検が不合格なので、HTMLは作らない")

    only = {int(x) for x in args.ch.split(",")} if args.ch else None
    data = build_data(only)

    tpl = (SRC / "template.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = (SRC / "app.js").read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (tpl.replace("/*STYLE*/", css)
               .replace("/*DATA*/", payload)
               .replace("/*APP*/", js))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"作った：{out}（{len(data['chapters'])}章・{len(data['questions'])}問・{out.stat().st_size // 1024}KB）")


if __name__ == "__main__":
    main()

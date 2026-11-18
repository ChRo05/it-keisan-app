"""マスターの自動点検（1118_実装計画.md の7-1）。

1つでも不合格なら終了コード1で止まる。build.py はこれが通ってから動く。
使い方：python3 build/check.py
"""
import re
import sys
from collections import Counter, defaultdict

from master import KANA, load, parse_fields, parse_guide, parse_steps, parse_stuck, _s

# よくある名字（2文字以上）。1文字の名字は普通の語とぶつかるので入れない
SURNAMES = (
    "佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 "
    "清水 山崎 森田 池田 橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 長谷川 藤田 後藤 近藤 "
    "村上 遠藤 青木 坂本 斉藤 斎藤 福田 太田 西村 藤井 金子 岡本 藤原 中野 三浦 原田 松田 竹内 "
    "小野 田村 中山 和田 石田 森本 上田 原 柴田 酒井 工藤 横山 宮崎 宮本 内田 高木 安藤 島田 "
    "谷口 大野 高田 丸山 今井 河野 藤本 村田 武田 上野 杉山 増田 小山 大塚 平野 菅原 久保 松井 "
    "千葉 岩崎 桜井 木下 野口 松尾 菊地 菊池 野村 新井 渡部"
).split()
NAME_RE = re.compile("|".join(s for s in SURNAMES if len(s) >= 2))
# 「一様」「お客さん」「皆さん」は人名ではないので除く
HONORIFIC_RE = re.compile(r"(?<!お)(?<![客皆])[一-龥ァ-ヶー]{1,4}(?<![客皆])(さん|くん|君|氏)")


def main():
    m = load()
    errors = []

    def err(pid, what):
        errors.append(f"{pid}：{what}")

    qids = [_s(r["問題ID"]) for r in m["q"]]
    eids = [_s(r["問題ID"]) for r in m["e"]]
    pids = {_s(r["ID"]) for r in m["p"]}

    # 問題IDのつながり・重複
    for pid, n in Counter(qids).items():
        if n > 1:
            err(pid, f"01_問題でIDが{n}回出る")
    for pid, n in Counter(eids).items():
        if n > 1:
            err(pid, f"02_解説でIDが{n}回出る")
    for pid in set(qids) - set(eids):
        err(pid, "02_解説にない")
    for pid in set(eids) - set(qids):
        err(pid, "01_問題にない")
    for pid in qids:
        if not re.fullmatch(r"IT-\d\d-(\d{3}|K\d\d)", pid):
            err(pid, "IDの形が決まりと違う")

    exp = {_s(r["問題ID"]): r for r in m["e"]}
    chapters = {int(float(_s(r["章"]))) for r in m["c"]}

    for r in m["q"]:
        pid = _s(r["問題ID"])
        ch = int(float(_s(r["章"])))
        if ch not in chapters:
            err(pid, f"章 {ch} が08_章にない")
        if not pid.startswith(f"IT-{ch:02d}-"):
            err(pid, f"IDの章と「章」の列（{ch}）が違う")
        # 段階1
        if _s(r["段階1_正解"]) not in KANA:
            err(pid, f"段階1_正解が ア〜エ でない：{_s(r['段階1_正解'])}")
        for k in KANA:
            if not _s(r["選択肢" + k]):
                err(pid, f"選択肢{k}が空")
        if len({_s(r['選択肢' + k]) for k in KANA}) < 4:
            err(pid, "選択肢に同じものがある")
        # 意味の問い
        if _s(r["意味の問い_正解"]) not in KANA:
            err(pid, f"意味の問い_正解が ア〜エ でない：{_s(r['意味の問い_正解'])}")
        # 段階2
        try:
            fields = parse_fields(r["段階2_欄"])
            for f in fields:
                if f["choices"] is not None:
                    for a in f["answers"]:
                        if a not in f["choices"]:
                            err(pid, f"語群の答え「{a}」が語群にない（欄：{f['name']}）")
            form = _s(r["形式"])
            has_choice = any(f["choices"] for f in fields)
            has_num = any(f["choices"] is None for f in fields)
            want = {"4択＋数値入力": (False, True), "4択＋語群": (True, False),
                    "4択＋数値入力・語群": (True, True)}.get(form)
            if want is None:
                err(pid, f"形式が決まりにない：{form}")
            elif (has_choice, has_num) != want:
                err(pid, f"形式「{form}」と段階2_欄の中身が合わない")
        except ValueError as ex:
            err(pid, f"段階2_欄が読めない：{ex}")
        # 前提の算数
        pre = _s(r["前提の算数"])
        if pre:
            for x in re.split("[、,]", pre):
                if x.strip() and x.strip() not in pids:
                    err(pid, f"前提の算数 {x.strip()} が04_前提の算数にない")
        # 対象試験
        exams = _s(r["対象試験"]).split("・")
        if not exams or any(x not in ("IP", "FE", "AP", "情報I") for x in exams):
            err(pid, f"対象試験が読めない：{_s(r['対象試験'])}")
        # 過去問の出典
        if _s(r["出典区分"]).startswith("過去問") and not _s(r["出典"]):
            err(pid, "過去問なのに出典がない")
        # 解説
        e = exp.get(pid)
        if e is None:
            continue
        steps = parse_steps(e["手順"])
        if not steps:
            err(pid, "手順が分けられない")
        nos = [s["no"] for s in steps]
        if nos != list(range(1, len(nos) + 1)):
            err(pid, f"手順の番号が1から順に並んでいない：{nos}")
        for col in ("まくら", "何を求めるか", "サゲ", "次にやること"):
            if not _s(e[col]):
                err(pid, f"02_解説の{col}が空")
        try:
            guide = parse_guide(e["案内先"])
            stuck = parse_stuck(e["止まった手_選択肢"])
            for no in stuck:
                if no not in nos:
                    err(pid, f"止まった手 {no} が手順にない")
            for no, gid in guide.items():
                if gid not in pids:
                    err(pid, f"案内先 {gid} が04_前提の算数にない")
                if no not in stuck:
                    err(pid, f"案内先の手 {no} が止まった手_選択肢にない")
        except ValueError as ex:
            err(pid, str(ex))
        # 人名
        text = " ".join(_s(x) for x in [r["問題文"], *[r["選択肢" + k] for k in KANA],
                                         e["まくら"], e["手順"], e["誤答の理由"], e["サゲ"]])
        for rx, label in ((NAME_RE, "名字"), (HONORIFIC_RE, "敬称")):
            hit = rx.search(text)
            if hit:
                err(pid, f"人名のおそれ（{label}）：{hit.group(0)}")

    # 章ごとの正解の位置（本問だけ。ID順）
    by_ch = defaultdict(list)
    for r in sorted(m["q"], key=lambda r: _s(r["問題ID"])):
        if re.fullmatch(r"IT-\d\d-\d{3}", _s(r["問題ID"])):
            by_ch[int(float(_s(r["章"])))].append(_s(r["段階1_正解"]))
    for ch, seq in sorted(by_ch.items()):
        cnt = Counter(seq)
        if max(cnt.values()) - min(cnt.get(k, 0) for k in KANA) > 1:
            err(f"{ch}章", f"正解の位置がそろっていない：{dict(cnt)}")
        for i in range(len(seq) - 2):
            if seq[i] == seq[i + 1] == seq[i + 2]:
                err(f"{ch}章", f"同じ記号が3問続く（{i + 1}〜{i + 3}問目：{seq[i]}）")
                break

    # 04_前提の算数
    for r in m["p"]:
        if not _s(r["ミニ問題"]) or not _s(r["答え"]):
            err(_s(r["ID"]), "ミニ問題か答えが空")
    # 08_章
    for r in m["c"]:
        for col in ("章名", "分野", "意味の問い_ア", "意味の問い_イ", "意味の問い_ウ", "意味の問い_エ", "到達目標"):
            if not _s(r[col]):
                err(f"{_s(r['章'])}章", f"08_章の{col}が空")

    print(f"01_問題 {len(qids)}問／02_解説 {len(eids)}問／04_前提の算数 {len(pids)}問／08_章 {len(chapters)}章")
    if errors:
        print(f"不合格 {len(errors)}件")
        for x in errors:
            print("  ×", x)
        sys.exit(1)
    print("合格：すべての点検を通った")


if __name__ == "__main__":
    main()

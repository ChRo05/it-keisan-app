"""操作マニュアル（1枚のHTML）を作る。画面写真・図・QRコードを中に埋め込み、通信なしで読める。
使い方：python3 make_manual.py  → manual.html
"""
import base64
import io
from pathlib import Path

import qrcode
import qrcode.image.svg
from PIL import Image

HERE = Path(__file__).parent
IMG = HERE / "img"
APP_URL = "https://chro05.github.io/it-keisan-app/"
VERSION = "第1版（2026-11-18）"


def shot(name, alt, cap=None, w=300):
    im = Image.open(IMG / f"{name}.png").convert("RGB")
    W, H = im.size
    im = im.resize((int(W * 0.75), int(H * 0.75)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True)
    assert len(alt) <= 80, (name, len(alt))
    src = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    c = f"<figcaption>{cap}</figcaption>" if cap else ""
    return f'<figure class="shot" style="max-width:{w}px"><img src="{src}" alt="{alt}" loading="lazy">{c}</figure>'


def qr_svg(url):
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    svg = img.to_string(encoding="unicode")
    return svg.replace("<svg ", '<svg role="img" aria-label="アプリを開くQRコード（URLは右に書いてあります）" ', 1)


# 図（SVG）。色は見た目の決まりの値。文字は図の中に書き、ALTは aria-label に入れる
FLOW = """<svg viewBox="0 0 640 300" role="img" aria-label="1問の流れの図。まくら、問題、何を求める問題？、解く、判定、手順を1手ずつ、誤答とつまり、次へ、の順に進む。×のときは、手順のあとで止まった手を選び、前提の算数へ。">
<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#4A5D6C"/></marker></defs>
<g font-size="15" text-anchor="middle" fill="#14283A">
<g>{boxes}</g>
</g></svg>"""


def flow_svg():
    steps = ["まくら", "問題を読む", "何を求める\n問題？", "解く", "判定\n○×", "手順を\n1手ずつ", "誤答と\nつまり", "次の問題へ"]
    out = []
    xs = [20, 175, 330, 485]
    for i, s in enumerate(steps):
        row = i // 4
        col = i % 4 if row == 0 else 3 - (i % 4)
        x, y = xs[col], 30 + row * 130
        accent = s.startswith("解く") or s.startswith("判定")
        fill = "#0B5CAD" if accent else "#FFFFFF"
        ink = "#FFFFFF" if accent else "#14283A"
        out.append(f'<rect x="{x}" y="{y}" width="135" height="64" rx="12" fill="{fill}" stroke="#0B5CAD" stroke-width="2"/>')
        lines = s.split("\n")
        for j, ln in enumerate(lines):
            ty = y + 37 + (j - (len(lines) - 1) / 2) * 19
            out.append(f'<text x="{x + 67}" y="{ty}" fill="{ink}" font-weight="bold">{ln}</text>')
        out.append(f'<text x="{x + 10}" y="{y - 6}" font-size="12" text-anchor="start" fill="#4A5D6C">{i + 1}</text>')
    # 矢印
    a = []
    for c in range(3):
        a.append(f'<line x1="{xs[c] + 137}" y1="62" x2="{xs[c + 1] - 4}" y2="62" stroke="#4A5D6C" stroke-width="2" marker-end="url(#ar)"/>')
    a.append(f'<path d="M{xs[3] + 67} 96 V156" stroke="#4A5D6C" stroke-width="2" fill="none" marker-end="url(#ar)"/>')
    for c in range(3, 0, -1):
        a.append(f'<line x1="{xs[c] - 2}" y1="192" x2="{xs[c - 1] + 139}" y2="192" stroke="#4A5D6C" stroke-width="2" marker-end="url(#ar)"/>')
    # 間違えたとき
    a.append('<path d="M397 226 V244" stroke="#B3261E" stroke-width="2" stroke-dasharray="5 3" fill="none" marker-end="url(#ar)"/>')
    a.append('<rect x="250" y="248" width="294" height="44" rx="10" fill="#FFE873"/>')
    a.append('<text x="397" y="276" font-weight="bold">× のとき：止まった手 → 前提の算数</text>')
    return FLOW.replace("{boxes}", "".join(out + a))


STAGE = """<svg viewBox="0 0 640 220" role="img" aria-label="段階の図。はじめは4択。正解すると次は入力。入力で正解すると定着し、1・3・7・14・30日後にまた出る。間違えると4択に戻る。">
<defs><marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0B5CAD"/></marker>
<marker id="ar3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#B3261E"/></marker></defs>
<g font-size="16" text-anchor="middle" fill="#14283A" font-weight="bold">
<rect x="20" y="40" width="150" height="70" rx="12" fill="#FFFFFF" stroke="#0B5CAD" stroke-width="2"/><text x="95" y="72">① 4択で選ぶ</text><text x="95" y="96" font-size="13" font-weight="normal">はじめはここから</text>
<rect x="245" y="40" width="150" height="70" rx="12" fill="#FFFFFF" stroke="#0B5CAD" stroke-width="2"/><text x="320" y="72">② 答えを入れる</text><text x="320" y="96" font-size="13" font-weight="normal">数字や言葉で</text>
<rect x="470" y="40" width="150" height="70" rx="12" fill="#0B5CAD"/><text x="545" y="72" fill="#FFFFFF">③ 定着</text><text x="545" y="96" font-size="13" font-weight="normal" fill="#FFFFFF">日をあけて復習</text>
<line x1="172" y1="75" x2="241" y2="75" stroke="#0B5CAD" stroke-width="3" marker-end="url(#ar2)"/><text x="207" y="64" font-size="13">○</text>
<line x1="397" y1="75" x2="466" y2="75" stroke="#0B5CAD" stroke-width="3" marker-end="url(#ar2)"/><text x="432" y="64" font-size="13">○</text>
<path d="M320 112 V160 H95 V114" stroke="#B3261E" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ar3)"/>
<path d="M545 112 V180 H95 V160" stroke="#B3261E" stroke-width="2" stroke-dasharray="6 4" fill="none"/>
<text x="330" y="205" font-size="14" fill="#B3261E">× のときは ① の4択に戻る（責めません。解き直せば戻ります）</text>
<text x="545" y="140" font-size="12" font-weight="normal">1→3→7→14→30日後</text>
</g></svg>"""

TABS = """<svg viewBox="0 0 640 120" role="img" aria-label="画面の下のタブ4つ。ホームは始める、章は章と公式、記録はいまの現在地、設定は試験や文字の大きさ。">
<g font-size="15" text-anchor="middle" fill="#14283A">
<rect x="0" y="10" width="640" height="100" rx="12" fill="#FFFFFF" stroke="#C3D0D8"/>
<text x="80" y="48" font-size="24">⌂</text><text x="80" y="74" font-weight="bold">ホーム</text><text x="80" y="96" font-size="12">5問で今日のひと区切り</text>
<text x="240" y="48" font-size="24">≡</text><text x="240" y="74" font-weight="bold">章</text><text x="240" y="96" font-size="12">到達目標・公式・算数</text>
<text x="400" y="48" font-size="24">▤</text><text x="400" y="74" font-weight="bold">記録</text><text x="400" y="96" font-size="12">いまの現在地・書き出し</text>
<text x="560" y="48" font-size="24">⚙</text><text x="560" y="74" font-weight="bold">設定</text><text x="560" y="96" font-size="12">試験・文字・授業用URL</text>
</g></svg>"""


def main():
    css = (HERE / "manual.css").read_text(encoding="utf-8")
    body = f"""
<header class="hd">
  <div class="badge" role="img" aria-label="学習教材コンテンツ事務局"><svg viewBox="0 0 24 20" aria-hidden="true"><path d="M1 3c3-1.6 6.5-1.6 10 .6V19c-3.5-2.2-7-2.2-10-.6z M13 3.6c3.5-2.2 7-2.2 10-.6v15.4c-3-1.6-6.5-1.6-10 .6z" fill="currentColor"/></svg><span class="bar" aria-hidden="true"></span><span aria-hidden="true">学習教材コンテンツ事務局</span></div>
  <h1>IT計算問題アプリ 操作マニュアル</h1>
  <p class="sub">{VERSION}　対象：ITパスポート・基本情報・応用情報の受験者、高校「情報I」を学ぶ人、授業で使う先生</p>
</header>

<section class="open">
  <div class="qr">{qr_svg(APP_URL)}</div>
  <div>
    <h2 class="h0">スマホのカメラで読むと、アプリが開きます</h2>
    <p class="url"><a href="{APP_URL}">{APP_URL}</a></p>
    <p>無料。登録も通信もいりません。記録はあなたの端末の中だけに残ります。</p>
  </div>
</section>

<nav class="toc" aria-label="目次"><h2>目次</h2><ol>
<li><a href="#s1">はじめに：3つだけ</a></li><li><a href="#s2">画面の全体</a></li><li><a href="#s3">1問の流れ</a></li>
<li><a href="#s4">4択から入力へ（段階）</a></li><li><a href="#s5">答えの入れ方</a></li><li><a href="#s6">つまずいたとき</a></li>
<li><a href="#s7">いまの現在地</a></li><li><a href="#s8">記録を消さないために</a></li><li><a href="#s9">試験の選び方と発展</a></li>
<li><a href="#s10">先生へ：授業モード</a></li><li><a href="#s11">よくある質問</a></li><li><a href="#s12">出典</a></li></ol></nav>

<section id="s1"><h2>1. はじめに：3つだけ</h2>
<ol class="big">
<li><b>受ける試験を選ぶ</b>（あとで変えられます）</li>
<li><b>「5問を始める」を押す</b>（5問で5分ほど）</li>
<li><b>同じURLから、また開く</b>（ブックマークかホーム画面に追加）</li>
</ol>
<div class="pair">{shot("01_試験を選ぶ", "試験を選ぶ画面。ITパスポート、基本情報、応用情報、情報Iの4つのボタンと、それぞれ誰向けかの説明。", "最初に開いたとき")}
{shot("02_ホーム", "ホーム画面。上に事務局バッジ、5問で今日のひと区切りと5問を始めるボタン、その下に今日の回答などの数字。", "ホーム")}</div>
</section>

<section id="s2"><h2>2. 画面の全体</h2>
<p>画面の下にタブが4つあります。問題を解いている間は、タブは隠れます（1画面に1問だけ）。</p>
<div class="fig">{TABS}</div>
<p>出題を自分で決めたいときは、ホームの「出題を自分で選ぶ」を開きます。</p>
<table><thead><tr><th scope="col">項目</th><th scope="col">選べるもの</th></tr></thead><tbody>
<tr><td>出題形式</td><td>通し（章の順）／ランダム／精選（復習の時期が来た問題 → 間違えた問題 → まだ解いていない問題）</td></tr>
<tr><td>出題範囲</td><td>章を選ぶ（押すたびに入る・外れる）</td></tr>
<tr><td>出題数</td><td>5・10・20・50・すべて</td></tr>
<tr><td>オプション</td><td>発展の問題もまぜる／最初から入力で解く</td></tr></tbody></table>
{shot("03_出題を自分で選ぶ", "出題を自分で選ぶを開いた画面。出題形式、出題範囲の章、出題数、オプション、この設定で始めるボタン。", None, 280)}
</section>

<section id="s3"><h2>3. 1問の流れ</h2>
<p>どの章も同じ順番です。前の段を終えると、次の段が開きます。</p>
<div class="fig">{flow_svg()}</div>
<div class="grid">
{shot("04_演習_まくらと問題", "演習画面の上。中断ボタン、何問目か、章名。その下にまくらの1文と問題文。", "1・2 まくらと問題")}
{shot("05_何を求める問題", "何を求める問題？の4択。アを選んで正解と出て、この問題で求めるものが1行で出ている。", "3 何を求める問題？（式の前に意味をつかむ）")}
{shot("06_解く_4択", "解くの4択。イを選び、○正解、正解はイ：0.9、次は答えを入れて解きます、と出ている。", "4・5 解く・判定")}
{shot("07_手順を1手ずつ", "手順の解説。1手目と2手目が開き、次の手を見るボタンがある。", "6 手順は1手ずつ開く")}
{shot("08_誤答とサゲと次へ", "よくある誤答と理由、つまり（1行のまとめ）、次にやること、次の問題へボタン。", "7・8 誤答・つまり・次へ")}
</div>
<p class="note">「← 中断」で、いつでもやめられます。次に開くと、ホームのいちばん上に「続きから」が出ます。</p>
</section>

<section id="s4"><h2>4. 4択から入力へ（段階）</h2>
<div class="fig">{STAGE}</div>
<ul>
<li>はじめての問題は4択で解きます。正解すると、次にその問題が出たときは答えを入れて解きます。</li>
<li>入力でも正解すると「定着」です。1日・3日・7日・14日・30日と、日をあけてまた出ます。</li>
<li>間違えたら4択に戻ります。何度でもやり直せます。</li>
<li>自信がある人は、ホームの「最初から入力で解く」をオンにします。</li>
</ul>
</section>

<section id="s5"><h2>5. 答えの入れ方</h2>
{shot("11_解く_入力", "答えを入れる画面。稼働率の欄に90%と入れ、欄の下と全体に○正解、稼働率：0.9と出ている。", None, 280)}
<table><thead><tr><th scope="col">こう入れても</th><th scope="col">正解になります</th></tr></thead><tbody>
<tr><td>0.9 でも 90% でも</td><td>小数と％のどちらでもよい</td></tr>
<tr><td>９０（全角）</td><td>全角・半角どちらでもよい</td></tr>
<tr><td>87.6時間</td><td>単位は付けても付けなくてもよい</td></tr>
<tr><td>8,760</td><td>3けたごとのカンマはあってもなくてもよい</td></tr>
<tr><td>2×10^9（2×10の9乗）</td><td>大きな数は「^」で何乗かを書ける</td></tr>
<tr><td>1/2</td><td>分数の答えは分数で入れる</td></tr></tbody></table>
<p>答えが2つ以上ある問題は、欄が答えの数だけ出ます。言葉を選ぶ欄は、ボタンを押して選びます。丸め方（小数第3位まで など）がある問題は、問題文の下に書いてあります。</p>
<p class="note">電卓はアプリに付けていません。ITパスポート・基本情報の試験は電卓を使えないためです。メモには「計算メモ」（保存しません）を使ってください。</p>
</section>

<section id="s6"><h2>6. つまずいたとき</h2>
<div class="pair">{shot("09_どの手で止まった", "どの手で止まった？で1手目を選んだ画面。黄色の帯に、1手目で使う算数を練習できる、この算数に戻るボタン。", "間違えたら「どの手で止まった？」")}
{shot("10_前提の算数", "前提の算数の画面。0.9×0.9は？に0.81と入れて正解、答え合わせ、答えを見る、元の問題に戻るボタン。", "前提の算数（ミニ問題1問）")}</div>
<ul><li>間違えた問題では、手順の番号から「止まった手」を選びます。その手で使う算数（かけ算、割合、累乗など）に戻れます。</li>
<li>わからなければ「答えを見る」で答えが出ます。解いたら「元の問題に戻る」。</li>
<li>公式は、問題の「公式を見る」か、章タブの「公式」で見られます。<b>試験には持ち込めません。</b>式の意味を確かめるために使ってください。</li></ul>
<div class="pair">{shot("14_章", "章タブ。テクノロジの章の一覧に、到達目標、到達率、この章を解く、公式、前提の算数のボタン。", "章タブ")}
{shot("15_公式", "8章の公式の画面。上に試験には持ち込めませんの帯、稼働率や直列・並列の式の一覧。", "公式")}</div>
</section>

<section id="s7"><h2>7. いまの現在地（到達目標と到達度）</h2>
<p>記録タブのいちばん上に出ます。自分の力と、次に何をすればよいかが分かります。</p>
{shot("12_いまの現在地", "いまの現在地のカード。取り組み、到達、定着の3つに、段階、進み具合の棒、次の段階まであと何問、次にやるボタン。", None, 300)}
<table><thead><tr><th scope="col">観点</th><th scope="col">見るもの</th><th scope="col">段階2</th><th scope="col">段階3</th><th scope="col">段階4</th></tr></thead><tbody>
<tr><td>取り組み</td><td>解いたことのある問題の割合</td><td>30％</td><td>70％</td><td>100％</td></tr>
<tr><td>到達</td><td>いま正解している問題の割合</td><td>50％</td><td>70％</td><td>90％</td></tr>
<tr><td>定着</td><td>入力で正解して定着した問題の割合</td><td>10％</td><td>30％</td><td>60％</td></tr></tbody></table>
<ul><li>数えるのは、受ける試験の基本の問題です。発展の問題は別に数えます。</li>
<li>総合は、3つのうちいちばん低い段階です。</li>
<li>到達が下がっても、間違えた問題を解き直せば戻ります。</li>
<li>学習の記録から出す目安です。成績や合格の保証ではありません。</li></ul>
</section>

<section id="s8"><h2>8. 記録を消さないために</h2>
<p>記録は、あなたの端末のブラウザの中だけにあります。どこにも送りません。タブやアプリを閉じても消えません。</p>
<div class="warn"><b>消えるのは、こんなとき</b><ul>
<li>ブラウザの閲覧データ（履歴・サイトデータ）を消したとき</li>
<li>プライベートブラウズ（シークレットモード）で開いたとき</li>
<li>別の端末・別のブラウザで開いたとき</li>
<li>iPhone・iPadのSafariで、このアプリを開かないまま7日間Safariを使ったとき</li></ul></div>
<h3>やっておくこと</h3>
<ol class="steps">
<li><b>ブックマークする。</b>毎回同じURL（{APP_URL}）から開きます。</li>
<li><b>iPhone・iPadはホーム画面に追加する。</b>Safariでアプリを開く → 画面の下の共有ボタン（四角から上向きの矢印が出たマーク）を押す → 「ホーム画面に追加」を押す → 右上の「追加」を押す。ホーム画面のアイコンから開きます。</li>
<li><b>Androidは、Chromeの右上の「︙」→「ホーム画面に追加」。</b></li>
<li><b>ときどき書き出す。</b>記録タブの「記録を書き出す」で、ファイル（.json）に保存します。機種変更のときは、新しい端末で「記録を読み込む」を押して、そのファイルを選びます。</li></ol>
{shot("13_データ管理", "記録タブのデータ管理。記録を書き出す、記録を読み込む、記録をすべて消すのボタン。", None, 280)}
<p class="note">最後の書き出しから14日たつと、記録タブに「書き出しておくと戻せます」と1行出ます。iPhone・iPadのSafariで初めて開いたときは、ホーム画面への追加を1回だけ案内します。</p>
</section>

<section id="s9"><h2>9. 試験の選び方と「発展」</h2>
<table><thead><tr><th scope="col">選ぶ試験</th><th scope="col">基本の問題</th><th scope="col">発展（オンにしたときだけ）</th></tr></thead><tbody>
<tr><td>ITパスポート</td><td>224問</td><td>基本情報・応用情報の問題 434問</td></tr>
<tr><td>基本情報</td><td>564問</td><td>応用情報の問題 94問</td></tr>
<tr><td>応用情報</td><td>658問（全部）</td><td>なし</td></tr>
<tr><td>情報I</td><td>188問</td><td>ITパスポートの問題 143問</td></tr></tbody></table>
<p>発展の問題には「◆ 発展（基本情報）」のように印が付きます。試験は設定タブでいつでも変えられ、記録は残ります。</p>
<p>過去問は、IPA（情報処理推進機構）が公表した問題の数値や場面を変えて作り直した問題（改変）です。問題文の下に出典を書いています。</p>
</section>

<section id="s10"><h2>10. 先生へ：授業モード</h2>
<p>URLの後ろに章と問題数を書いて配ると、全員に同じ問題を出せます。生徒は自分の速さで進めます。結果を集めて送る機能はありません。</p>
<ol class="steps"><li>設定タブの「授業用のURLを作る」で、試験・章・問題数・順番・解き方を選ぶ</li>
<li>「URLをコピー」を押し、Google Classroom などで配る</li>
<li>生徒がURLを開くと「先生が用意した問題です」の画面が出る。「始める」で演習に入る</li></ol>
<div class="pair">{shot("16_授業用のURL", "授業用のURLを作る画面。試験、章、問題数、順番、解き方を選ぶボタンと、できたURL、URLをコピーボタン。", "設定タブ：授業用のURLを作る")}
{shot("18_授業モードの確認画面", "授業モードの確認画面。先生が用意した問題です（基本情報・8章・5問）と、始めるボタン。", "生徒の画面")}</div>
<table><thead><tr><th scope="col">項目</th><th scope="col">書ける値</th><th scope="col">例</th></tr></thead><tbody>
<tr><td>ex（試験）</td><td>IP／FE／AP／J1（情報I）</td><td>ex=FE</td></tr>
<tr><td>ch（章）</td><td>1〜31。カンマで複数</td><td>ch=7,9</td></tr>
<tr><td>n（問題数）</td><td>5／10／20／50／all</td><td>n=10</td></tr>
<tr><td>ord（順番）</td><td>seq（章の順）／rand（ランダム）</td><td>ord=rand</td></tr>
<tr><td>seed（ランダムの種）</td><td>1〜9999。付けると全員同じ順</td><td>seed=12</td></tr>
<tr><td>st（解き方）</td><td>choice（4択から）／input（入力から）</td><td>st=input</td></tr></tbody></table>
<p class="code">例：{APP_URL}#lesson&amp;ex=FE&amp;ch=7,9&amp;n=10&amp;ord=seq</p>
<p class="note">URLに名前・出席番号・メールアドレスは書けません。「#」より後ろはサーバーに送られません（MDN「URI fragment」）。授業の記録は、ふだんの記録と分けて残り、記録タブの「授業の記録」に出ます。</p>
</section>

<section id="s11"><h2>11. よくある質問</h2>
<dl class="faq">
<dt>インターネットにつながっていなくても使えますか？</dt><dd>はい。1度開いたページは、アプリの中に問題がすべて入っているので、通信しません。ファイル（index.html）を保存して、ブラウザで開いても動きます。</dd>
<dt>正解なのに×になりました。</dt><dd>単位の書き方や丸め方を確かめてください。それでも×なら、誤り報告のフォームから問題番号（問題の上の「IT-08-001」など）を添えて知らせてください。</dd>
<dt>文字が小さい・画面がまぶしい。</dt><dd>設定タブで文字の大きさ（標準・大・特大）と、明るい画面・暗い画面を変えられます。</dd>
<dt>キーボードで操作できますか？</dt><dd>はい。Tabで移動、Enterで決定。4択は 1〜4 のキーでも選べます。</dd>
<dt>記録を全部消したい。</dt><dd>記録タブの「記録をすべて消す」→「すべて消す」。元に戻せないので、先に書き出しておくと安心です。</dd>
</dl>
</section>

<section id="s12"><h2>12. 出典</h2>
<ul class="src">
<li>IPA 情報処理推進機構「試験に関するよくある質問」（過去問題の使用と出典の書き方） https://www.ipa.go.jp/shiken/faq.html</li>
<li>IPA「過去問題の使用方法」 https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html</li>
<li>WebKit blog「Full Third-Party Cookie Blocking and More」（Safariの7日間の決まり） https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/</li>
<li>MDN「URI fragment」（#より後ろはサーバーに送られない） https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment</li>
</ul>
<p class="sub">配布元：学習教材コンテンツ事務局　制作：個人開発　このアプリは非公式の教材です。試験の主催者とは関係ありません。</p>
</section>
"""
    html = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>IT計算問題アプリ 操作マニュアル</title><style>{css}</style></head>
<body><main>{body}</main></body></html>"""
    out = HERE / "index.html"
    out.write_text(html, encoding="utf-8")
    print(out, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()

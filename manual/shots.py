"""操作マニュアル用の画面を撮る（全章版 index.html、スマホの幅）。"""
from pathlib import Path
from playwright.sync_api import sync_playwright
HTML = Path(__file__).parent.parent / "index.html".read_text(encoding="utf-8")
URL = "https://chro05.github.io/it-keisan-app/"   # 手元のファイルを公開先のURLとして見せる（通信はしない）
OUT = Path(__file__).parent / "img"
def el(page, sel, name, nth=0):
    page.evaluate("() => { const s = document.createElement('style'); s.id = 'hidetabs'; s.textContent = '.tabs{display:none!important}'; document.head.append(s); }")
    page.locator(sel).nth(nth).screenshot(path=str(OUT / f"{name}.png"))
    page.evaluate("() => document.getElementById('hidetabs').remove()")
def vp(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=2, reduced_motion="reduce")
    page.route("https://chro05.github.io/**", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=HTML))
    page.goto(URL)
    vp(page, "01_試験を選ぶ")
    page.get_by_role("button", name="基本情報技術者試験").click()
    vp(page, "02_ホーム")
    # 8章で通す
    page.get_by_text("出題を自分で選ぶ").click()
    for c in page.locator("details .row").nth(1).get_by_role("button").all():
        if c.get_attribute("aria-pressed") == "true" and c.inner_text() != "8章": c.click()
    page.get_by_role("button", name="5問", exact=True).click()
    el(page, "details.card", "03_出題を自分で選ぶ")
    page.get_by_role("button", name="この設定で始める").click()
    page.evaluate("window.scrollTo(0,0)")
    vp(page, "04_演習_まくらと問題")
    page.locator("#ms .opt").nth(0).click()
    el(page, "#ms", "05_何を求める問題")
    page.locator("#solve .opt").nth(1).click()
    el(page, "#solve", "06_解く_4択")
    page.locator("#nextStep").click(); page.locator("#nextStep").click()
    el(page, "#steps", "07_手順を1手ずつ")
    page.locator("#nextStep").click()
    page.locator("#goNext").scroll_into_view_if_needed()
    vp(page, "08_誤答とサゲと次へ")
    page.locator("#goNext").click()
    # 2問目：わざと間違えて「どの手で止まった？」
    page.locator("#ms .opt").nth(0).click()
    page.locator("#solve .opt").nth(0).click()
    while page.locator("#nextStep").count(): page.locator("#nextStep").click()
    page.get_by_role("button", name="1手目").click()
    el(page, "#stuck", "09_どの手で止まった")
    page.get_by_role("button", name="この算数に戻る").click()
    page.locator("#pin").fill("0.81"); page.get_by_role("button", name="答え合わせ").click()
    vp(page, "10_前提の算数")
    page.get_by_role("button", name="元の問題に戻る").click()
    page.locator("#goNext").click()
    page.get_by_role("button", name="← 中断").click()
    # 1問目を入力で
    page.evaluate("""() => { const S = JSON.parse(localStorage.getItem('itkeisan.v1')); S.resume = {ids:['IT-08-001'], i:0, startAt:Date.now(), results:[], qp:null}; localStorage.setItem('itkeisan.v1', JSON.stringify(S)); }""")
    page.reload()
    page.get_by_role("button", name="続きから").click()
    page.locator("#ms .opt").nth(0).click()
    page.locator("#f0").fill("90%")
    page.get_by_role("button", name="答え合わせ").click()
    el(page, "#solve", "11_解く_入力")
    page.get_by_role("button", name="← 中断").click()
    # ルーブリックの見本：基本の問題の4割を解き、3割が正解、1割が定着した記録を入れる
    page.evaluate("""() => { const S = JSON.parse(localStorage.getItem('itkeisan.v1'));
      const ids = JSON.parse(document.getElementById('data').textContent).questions.filter(q => q.exams.includes('FE')).map(q => q.id);
      ids.forEach((id, i) => { if (i % 10 < 4) S.q[id] = {st: i % 10 < 3 ? 'input' : 'choice', seen: true, mastered: i % 10 < 1, ok: 1, ng: 0, last: i % 10 < 3 ? 'ok' : 'ng', box: 0, due: '2099-01-01'}; });
      localStorage.setItem('itkeisan.v1', JSON.stringify(S)); }""")
    page.reload()
    page.get_by_role("button", name="記録", exact=True).click()
    el(page, "section.card", "12_いまの現在地", 0)
    el(page, "section.card:has-text('データ管理')", "13_データ管理")
    page.get_by_role("button", name="章", exact=True).click()
    vp(page, "14_章")
    page.get_by_role("button", name="公式").first.click()
    vp(page, "15_公式")
    page.get_by_role("button", name="設定", exact=True).click()
    el(page, "#lessonMake", "16_授業用のURL")
    el(page, "section.card", "17_設定", 0)
    page.goto(URL + "#lesson&ex=FE&ch=8&n=5&ord=seq")
    vp(page, "18_授業モードの確認画面")
    b.close()
print(sorted(x.name for x in OUT.iterdir()))

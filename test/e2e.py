"""画面の動きを通して確かめる（8章）。使い方：python3 test/e2e.py"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "test" / "ch8" / "index.html").as_uri()  # python3 build/build.py --ch 8 --out test/ch8/index.html
SHOT = ROOT / "test" / "shots"
SHOT.mkdir(exist_ok=True)
errors = []

def shot(page, name):
    page.screenshot(path=str(SHOT / f"{name}.png"), full_page=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    shot(page, "01_試験を選ぶ")
    page.get_by_role("button", name="ITパスポート試験").click()
    shot(page, "02_ホーム")
    page.get_by_text("出題を自分で選ぶ").click()
    page.get_by_role("button", name="5問", exact=True).click()
    page.get_by_role("button", name="この設定で始める").click()
    # 1問目：IT-08-001 正解はイ、意味の問いはア
    page.get_by_role("button", name="ア 装置やシステムが動いている割合（稼働率）").click()
    shot(page, "03_意味の問い")
    page.locator("#solve .opt").nth(1).click()
    for _ in range(3):
        page.locator("#nextStep").click()
    shot(page, "04_1問目_正解と解説")
    page.locator("#goNext").click()
    # 2問目：わざと間違える
    page.locator("#ms .opt").nth(1).click()
    page.locator("#solve .opt").nth(0).click()
    while page.locator("#nextStep").count():
        page.locator("#nextStep").click()
    page.get_by_role("button", name="1手目").click()
    shot(page, "05_2問目_不正解と止まった手")
    page.get_by_role("button", name="この算数に戻る").click()
    page.locator("#pin").fill("0.81")
    page.get_by_role("button", name="答え合わせ").click()
    shot(page, "06_前提の算数")
    page.get_by_role("button", name="元の問題に戻る").click()
    assert page.locator("#goNext").count() == 1, "元の問題に戻れない"
    page.locator("#goNext").click()
    # 3問目以降は飛ばして結果へ（中断→続きから）
    page.get_by_role("button", name="← 中断").click()
    shot(page, "07_続きから")
    page.get_by_role("button", name="続きから").click()
    for _ in range(3):
        page.locator("#ms .opt").nth(0).click()
        page.locator("#solve .opt").nth(0).click()
        while page.locator("#nextStep").count():
            page.locator("#nextStep").click()
        page.locator("#goNext").click()
    shot(page, "08_結果")
    # 1問目をもう一度：今度は入力で解く
    page.get_by_role("button", name="ホームへ").click()   # 「出題を自分で選ぶ」は開いたまま
    page.get_by_role("button", name="5問", exact=True).click()
    page.get_by_role("button", name="この設定で始める").click()
    page.locator("#ms .opt").nth(0).click()
    page.locator("#f0").fill("９０％")
    page.get_by_role("button", name="答え合わせ").click()
    shot(page, "09_入力で正解")
    page.get_by_role("button", name="← 中断").click()
    page.get_by_role("button", name="記録").click()
    shot(page, "10_記録_ルーブリック")
    page.get_by_role("button", name="章").first.click()
    shot(page, "11_章")
    page.get_by_role("button", name="公式").first.click()
    shot(page, "12_公式")
    page.get_by_role("button", name="設定", exact=True).click()
    page.get_by_role("button", name="暗い", exact=True).click()
    page.get_by_role("button", name="特大").click()
    page.get_by_role("button", name="ホーム").click()
    page.get_by_role("button", name="続きから").click()
    shot(page, "13_暗い画面_特大")
    page.goto(URL + "#lesson&ex=FE&ch=8,40&n=5&ord=rand&seed=12")
    shot(page, "14_授業モードの確認画面")
    page.get_by_role("button", name="始める（5問）").click()
    assert "授業" in page.locator("#exbar").inner_text()
    page.get_by_role("button", name="← 中断").click()
    page.get_by_role("button", name="設定", exact=True).click()
    shot(page, "15_設定_授業用URL")
    b.close()

print("コンソールのエラー：", errors or "なし")
sys.exit(1 if errors else 0)

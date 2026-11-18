"""一度開いたあと、通信を切っても開けるかを確かめる（localhost で配る）。
使い方：python3 -m http.server 8765 をリポジトリ直下で動かしてから python3 test/offline_test.py"""
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8765/"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context()
    page = ctx.new_page()
    page.goto(BASE)
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload()
    ok_app = page.get_by_text("受ける試験を選んでください").count() == 1
    page.goto(BASE + "manual/")
    ok_man = page.get_by_text("通信のない所で使う").count() >= 1
    print("通信なしでアプリ：", ok_app, "／マニュアル：", ok_man)
    b.close()

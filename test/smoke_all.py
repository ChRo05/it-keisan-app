"""全658問を画面で1問ずつ通す（授業モードURLを使う）。
1回目：4択で解き、手順をすべて開いて次へ。2回目：入力で正しい答えを入れ、〇になるかを見る。
ボタンは画面の中のスクリプトで押す（速くするため）。
使い方：python3 test/smoke_all.py"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
fields = {q["id"]: q["fields"] for q in json.loads((ROOT / "test" / "fields.json").read_text(encoding="utf-8"))}
errors = []

LOOP = """
async ({st, fields}) => {
  const fails = [], seen = [];
  const sleep = () => new Promise(r => setTimeout(r, 0));
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", {bubbles: true})); };
  for (let k = 0; k < 2000; k++) {
    const qh = document.getElementById("qh");
    if (!qh) break;
    const qid = qh.textContent.trim().split(/\\s+/)[1];
    seen.push(qid);
    document.querySelector("#ms .opt").click(); await sleep();
    if (st === "choice") { document.querySelector("#solve .opt").click(); }
    else {
      fields[qid].forEach((f, i) => {
        if (f.choices) {
          const box = document.querySelectorAll("#solve .field")[i];
          [...box.querySelectorAll("button")].find(b => b.textContent === f.answers[0]).click();
        } else setVal(document.getElementById("f" + i), f.answers[0]);
      });
      [...document.querySelectorAll("#solve button")].find(b => b.textContent === "答え合わせ").click();
      await sleep();
      const v = document.querySelector("#solve .verdict");
      if (!v || !v.textContent.includes("○ 正解")) fails.push(qid);
    }
    await sleep();
    while (document.getElementById("nextStep")) { document.getElementById("nextStep").click(); await sleep(); }
    const s = document.getElementById("steps");
    if (!s || !s.querySelectorAll("li").length) fails.push(qid + "（手順なし）");
    document.getElementById("goNext").click(); await sleep();
  }
  return {fails, n: seen.length, uniq: new Set(seen).size, result: !!document.querySelector("h2") && document.querySelector("h2").textContent};
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 390, "height": 844})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL)
    page.get_by_role("button", name="応用情報技術者試験").click()
    allfails = []
    for st in ("choice", "input"):
        page.goto(URL + f"#lesson&ex=AP&n=all&ord=seq&st={st}")
        page.get_by_role("button", name="始める（658問）").click()
        r = page.evaluate(LOOP, {"st": st, "fields": fields})
        print(st, f"{r['n']}問（重複なし {r['uniq']}）", "最後の画面：", r["result"], "合わない：", r["fails"] or "なし")
        allfails += r["fails"]
    b.close()
print("エラー：", errors or "なし")
sys.exit(1 if (errors or allfails) else 0)

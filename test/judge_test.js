// 判定の決まり（実装計画 5-2・7-2）を、全問の段階2の欄で確かめる
// 使い方：python3 build/dump_fields.py > test/fields.json && node test/judge_test.js
const { judgeField, judgePre } = require("../src/app.js");
const qs = require("./fields.json");
const toFull = s => s.replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
let n = 0, bad = [];
function expect(id, what, got, want) { n++; if (got !== want) bad.push(`${id} ${what}`); }
for (const q of qs) for (const f of q.fields) {
  if (f.choices) {
    for (const a of f.answers) expect(q.id, `語群 正解 ${a}`, judgeField(f, a), true);
    for (const c of f.choices) if (!f.answers.includes(c)) expect(q.id, `語群 誤答 ${c}`, judgeField(f, c), false);
    continue;
  }
  for (const a of f.answers) {
    expect(q.id, `正解の入力 ${a}`, judgeField(f, a), true);
    expect(q.id, `全角 ${a}`, judgeField(f, toFull(a)), true);
    if (f.unit) expect(q.id, `単位つき ${a}${f.unit}`, judgeField(f, a + f.unit), true);
    const m = a.match(/^(-?\d+(?:\.\d+)?)$/);
    if (m && !f.answers.some(x => /[％%]/.test(x))) {
      const v = parseFloat(m[1]);
      if (v > 0 && v < 1 && f.unit === "") expect(q.id, `％で入れた ${a}`, judgeField(f, String(+(v * 100).toFixed(10)) + "%"), true);
    }
    const num = parseFloat(a.replace(/[,，％%]/g, ""));
    if (!isNaN(num) && /^[\d.,％%−-]+$/.test(a)) expect(q.id, `誤答 ${num + 7}`, judgeField(f, String(num + 7)), false);
  }
  expect(q.id, "空", judgeField(f, ""), false);
}
// 指数の書き方
const big = { name: "x", answers: ["2×10⁹", "2000000000"], unit: "回", choices: null };
for (const [v, want] of [["2×10^9", true], ["2*10^9", true], ["2,000,000,000回", true], ["２×１０＾９", true], ["2×10^8", false]]) expect("指数", v, judgeField(big, v), want);
// 前提の算数（04_前提の算数の答えの形）
for (const [v, ans, want] of [["0.9", "0.9", true], ["０．９", "0.9", true], ["12あまり1", "12 あまり1", true], ["1%", "1％", true], ["0.01", "1％", true], ["2", "1％", false]]) expect("前提", `${v}→${ans}`, judgePre(v, ans), want);
console.log(`確かめた数 ${n}、合わない ${bad.length}`);
bad.slice(0, 40).forEach(b => console.log("  ×", b));
process.exit(bad.length ? 1 : 0);

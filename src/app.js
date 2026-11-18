"use strict";
/* IT計算問題アプリ 本体
   決まりの出どころ：00_design.md v0.14（09〜12章）、05_UI設計／1114_UI仕様.md 第3版、
   01_見た目の決まり.md 第3版、03_AI作業／1118_実装計画.md 第4版
   通信はしない。記録はこの端末のブラウザの中だけ（localStorage）。 */

/* ===== 1. 判定（実装計画 5-2） ===== */
const MINUS = /[−‐–—－]/g;
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
function norm(s) {
  // 2×10⁹ のような指数は「2×10^9」の形にそろえてから半角にする
  return String(s == null ? "" : s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => "^" + [...m].map(c => SUP[c]).join("")).normalize("NFKC").replace(MINUS, "-")
    .replace(/\s+/g, "").replace(/,/g, "");
}
function stripUnit(s, unit) {
  const u = norm(unit);
  if (u && s.length > u.length && s.endsWith(u)) return s.slice(0, -u.length);
  return s;
}
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(%?)$/;
const FRAC_RE = /^[+-]?\d+\/\d+$/;
const POW_RE = /^(?:([+-]?\d+\.?\d*)[×x*])?10\^([+-]?\d+)$/i;
function numCandidates(s) {
  const p = s.match(POW_RE);
  if (p) return [(p[1] ? parseFloat(p[1]) : 1) * Math.pow(10, parseInt(p[2], 10))];
  const m = s.match(NUM_RE);
  if (!m) return null;
  const v = parseFloat(s.replace("%", ""));
  return m[2] ? [v, v / 100] : [v];
}
function close(a, b) { return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)); }
function matchOne(input, accepted, unit) {
  const a = stripUnit(norm(input), unit);
  const b = stripUnit(norm(accepted), unit);
  if (!a) return false;
  if (a === b) return true;
  if (FRAC_RE.test(b)) return false;            // 分数は分数の形のまま合っているときだけ
  const na = numCandidates(a), nb = numCandidates(b);
  if (na && nb) return na.some(x => nb.some(y => close(x, y)));
  if (/[A-F]/i.test(b) && /^[0-9A-F]+$/i.test(b)) return a.toUpperCase() === b.toUpperCase(); // 16進
  return false;
}
function judgeField(field, value) {
  if (field.choices) return field.answers.includes(value);
  return field.answers.some(ans => matchOne(value, ans, field.unit));
}
function judgePre(input, answer) { return matchOne(input, answer, ""); }

if (typeof module !== "undefined") module.exports = { norm, matchOne, judgeField, judgePre };

/* ===== 2. データと記録 ===== */
if (typeof document !== "undefined") (function () {
const DATA = JSON.parse(document.getElementById("data").textContent);
const KANA = ["ア", "イ", "ウ", "エ"];
const EXAMS = [
  { id: "IP", name: "ITパスポート", full: "ITパスポート試験", who: "ITの資格をはじめて受ける人" },
  { id: "FE", name: "基本情報", full: "基本情報技術者試験", who: "ITの仕事の基本を固めたい人" },
  { id: "AP", name: "応用情報", full: "応用情報技術者試験", who: "基本情報の次に進む人" },
  { id: "J1", name: "情報I", full: "高校「情報I」", who: "授業・定期考査・共通テストに向けて学ぶ高校生" },
];
const EXAM_KEY = { IP: "IP", FE: "FE", AP: "AP", J1: "情報I" };
const FIELDS = ["テクノロジ", "マネジメント", "ストラテジ"];
const INTERVALS = [1, 3, 7, 14, 30]; // 定着したあと、次に出すまでの日数
const QBY = Object.fromEntries(DATA.questions.map(q => [q.id, q]));
const CBY = Object.fromEntries(DATA.chapters.map(c => [c.no, c]));
const STORE_KEY = "itkeisan.v1";
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScJ5SWiet8DPegAOERjejbaxEV-Qj34smFsM0lnfbqa3cr7pQ/viewform"; // 誤り報告・感想フォーム（事務局）

function today(d) {
  const t = d || new Date();
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
}
function addDays(ymd, n) { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + n); return today(d); }

function blank() {
  return { v: 1, settings: { exam: null, size: "m", theme: "auto", mixAdv: false, startInput: false },
    q: {}, days: {}, wrongLog: [], resume: null, ui: {}, lesson: { q: {}, days: {}, runs: [] } };
}
let S = blank();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const o = JSON.parse(raw); if (o && o.v === 1) S = Object.assign(blank(), o); }
  } catch (e) { /* 読めなくても動かす */ }
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できなくても止めない */ } }

/* 受ける試験で出す問題を決める（設計書11章・未決13、1118_実装メモ 4章の決定）
   基本：対象試験に選んだ試験がある問題。情報Iは「情報Iの単元」が書いてある問題も基本にする
   発展：基本の1つ上の試験の問題。IP→FE・APの問題、FE→APの問題、情報I→ITパスポートの問題。
         初期設定では出さず、「発展の問題もまぜる」で出す */
function examKey() { return EXAM_KEY[S.settings.exam] || "IP"; }
function hasJ1Unit(q) { return !!q.j1 && q.j1 !== "―"; }
function inExam(q) {
  if (S.settings.exam === "J1") return q.exams.includes("情報I") || hasJ1Unit(q);
  return q.exams.includes(examKey());
}
function isAdv(q) {
  if (inExam(q)) return false;
  const ex = S.settings.exam;
  if (ex === "J1") return q.exams.includes("IP");
  if (ex === "IP") return q.exams.includes("FE") || q.exams.includes("AP");
  if (ex === "FE") return q.exams.includes("AP");
  return false;
}
function advLabel(q) {
  const ex = S.settings.exam;
  if (ex === "J1") return "発展（ITパスポート）";
  if (ex === "IP" && q.exams.includes("FE")) return "発展（基本情報）";
  return "発展（応用情報）";
}
function pool(withAdv) { return DATA.questions.filter(q => inExam(q) || (withAdv && isAdv(q))); }
function baseSet() { return DATA.questions.filter(inExam); }
/* 授業モードの間は、ふだんの記録とは別の場所に書く（UI仕様5章） */
let lessonOn = false;
function QS() { return lessonOn ? S.lesson.q : S.q; }
function DAYS() { return lessonOn ? S.lesson.days : S.days; }
function rec(id) { const Q = QS(); return Q[id] || (Q[id] = { st: "choice", seen: false, mastered: false, ok: 0, ng: 0, last: "", box: 0, due: "" }); }
function peek(id) { return QS()[id] || null; }

/* 段階の上げ下げ（設計書11章） */
function record(q, stage, ok) {
  const r = rec(q.id);
  r.seen = true;
  if (ok) {
    r.ok++; r.last = "ok";
    if (stage === "choice") { r.st = "input"; }
    else {
      if (r.mastered) r.box = Math.min(r.box + 1, INTERVALS.length - 1);
      r.mastered = true;
      r.due = addDays(today(), INTERVALS[r.box]);
    }
  } else {
    r.ng++; r.last = "ng"; r.st = "choice"; r.mastered = false; r.box = 0; r.due = "";
    if (!lessonOn) S.wrongLog.unshift({ id: q.id, at: today() });
    if (!lessonOn) S.wrongLog = S.wrongLog.slice(0, 30);
  }
  const D = DAYS();
  const d = D[today()] || (D[today()] = { n: 0, ok: 0 });
  d.n++; if (ok) d.ok++;
  if (!S.ui.firstAt) S.ui.firstAt = today();
  save();
}

/* ===== 3. ルーブリック（09_ルーブリック、UI仕様9章） ===== */
function rubric() {
  const base = baseSet();
  const N = base.length;
  const R = DATA.rubric;
  const cnt = [0, 0, 0];
  let any = false;
  for (const q of base) {
    const r = peek(q.id);
    if (!r || !r.seen) continue;
    any = true;
    cnt[0]++;
    if (r.last === "ok") cnt[1]++;
    if (r.mastered) cnt[2]++;
  }
  const views = R.views.map((v, i) => {
    const ratio = N ? cnt[i] / N : 0;
    let st = !any ? 0 : ratio >= v.th[2] ? 4 : ratio >= v.th[1] ? 3 : ratio >= v.th[0] ? 2 : 1;
    const nextTh = st >= 4 ? null : st <= 1 ? v.th[0] : v.th[st - 1];
    const left = st >= 4 ? 0 : st === 0 ? 1 : Math.max(1, Math.ceil(nextTh * N - 1e-9) - cnt[i]);
    return { name: v.name, what: v.what, next: v.next, count: cnt[i], ratio, stage: st, nextTh, left };
  });
  const overall = Math.min(...views.map(v => v.stage));
  let advSolved = 0, advOk = 0;
  for (const q of DATA.questions) if (isAdv(q)) { const r = peek(q.id); if (r && r.seen) { advSolved++; if (r.last === "ok") advOk++; } }
  return { N, views, overall, stage: R.stages[overall], advSolved, advOk };
}

/* ===== 4. 画面の部品 ===== */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const $main = document.getElementById("main");
const $tabs = document.getElementById("tabs");
const $exbar = document.getElementById("exbar");
const $live = document.getElementById("live");
function say(t) { $live.textContent = ""; setTimeout(() => { $live.textContent = t; }, 30); }
function pct(x) { return Math.round(x * 100) + "％"; }
function examName() { const e = EXAMS.find(e => e.id === S.settings.exam); return e ? e.name : ""; }

function applyLook() {
  const root = document.documentElement;
  root.dataset.size = S.settings.size;
  if (S.settings.theme === "auto") delete root.dataset.theme; else root.dataset.theme = S.settings.theme;
}

let view = "home";
let viewArg = null;
const TABS = [
  { id: "home", label: "ホーム", ic: "⌂" },
  { id: "chapters", label: "章", ic: "≡" },
  { id: "records", label: "記録", ic: "▤" },
  { id: "settings", label: "設定", ic: "⚙" },
];
function renderTabs() {
  $tabs.replaceChildren(...TABS.map(t => h("button", {
    type: "button", "aria-current": view === t.id ? "page" : null, onclick: () => go(t.id),
  }, h("span", { class: "ic", "aria-hidden": "true" }, t.ic), t.label)));
}
let reachDropped = false;
function go(v, arg) {
  if (v !== "exercise") lessonOn = false;
  if (v === "records" && S.settings.exam) {   // 前に記録タブを開いたときと比べる（UI仕様9-2）
    const reach = rubric().views[1].stage;
    reachDropped = S.ui.prevReach != null && reach < S.ui.prevReach;
    S.ui.prevReach = reach; save();
  }
  view = v; viewArg = arg == null ? null : arg;
  const exercising = v === "exercise";
  document.body.classList.toggle("exercising", exercising);
  $exbar.hidden = !exercising;
  render();
  window.scrollTo(0, 0);
  $main.focus({ preventScroll: true });
}
function render() {
  renderTabs();
  if (!S.settings.exam && view !== "pickExam" && view !== "lesson") { view = "pickExam"; }
  const f = {
    pickExam: vPickExam, lesson: vLesson, home: vHome, chapters: vChapters, records: vRecords, settings: vSettings,
    exercise: vExercise, result: vResult, formula: vFormula, pre: vPre,
  }[view] || vHome;
  $main.replaceChildren(f(viewArg));
}

/* ===== 5. 試験を選ぶ ===== */
function vPickExam() {
  return h("section", { class: "card stack" },
    h("h2", null, "受ける試験を選んでください"),
    h("p", null, "選んだ試験に出る問題だけを出します。あとで設定から変えられます。記録は変えても残ります。"),
    h("div", { class: "stack" }, EXAMS.map(e => h("button", {
      type: "button", class: "btn wide", style: "text-align:left;display:block", onclick: () => { S.settings.exam = e.id; homeSel.chs = null; save(); go("home"); },
    }, h("span", { style: "font-weight:bold;display:block" }, e.full), h("span", { class: "sub" }, e.who)))));
}

/* ===== 6. ホーム ===== */
function streak() {
  let n = 0, d = today();
  if (!S.days[d]) d = addDays(d, -1);
  while (S.days[d]) { n++; d = addDays(d, -1); }
  return n;
}
function dueList() {
  const t = today();
  return pool(S.settings.mixAdv).filter(q => { const r = peek(q.id); return r && r.mastered && r.due && r.due <= t; });
}
let homeSel = { mode: "seq", chs: null, n: 10 };
let homeOpen = false;
function vHome() {
  const d = S.days[today()] || { n: 0, ok: 0 };
  let all = 0, ok = 0;
  for (const k in S.days) { all += S.days[k].n; ok += S.days[k].ok; }
  const chs = DATA.chapters.filter(c => pool(S.settings.mixAdv).some(q => q.ch === c.no));
  if (!homeSel.chs) homeSel.chs = chs.map(c => c.no);

  const box = h("div");
  if (iosBandNeeded()) box.append(iosBand());
  if (S.resume && S.resume.ids && S.resume.i < S.resume.ids.length) {
    box.append(h("div", { class: "card" },
      h("p", null, `途中でやめた問題があります（${S.resume.i + 1}／${S.resume.ids.length}問目）`),
      h("button", { type: "button", class: "btn primary wide", onclick: () => go("exercise") }, "続きから")));
  }
  // 今日のひと区切り（用語暗記アプリと同じ入口。初日は設定を選ばずに始められる。設計書12章 CX）
  const quick = pickIds({ mode: "pick", chs: chs.map(c => c.no), n: 5 });
  box.append(h("section", { class: "card stack", "aria-labelledby": "qkH" },
    h("h2", { id: "qkH" }, h("span", { style: "font-size:1.6em" }, "5"), " 問で今日のひと区切り"),
    h("p", { class: "sub" }, d.n ? `今日は ${d.n}問 解きました。もうひと区切りいけます。` : "5問で5分ほど。まず1問からでも大丈夫です。"),
    h("button", { type: "button", class: "btn primary wide", disabled: quick.length ? null : true,
      onclick: () => startSession(null, quick) }, "5問を始める"),
    h("p", { class: "sub" }, "復習の時期が来た問題 → 間違えた問題 → まだ解いていない問題の順に出します。")));
  box.append(h("div", { class: "mini-cards", role: "list" },
    mini("今日の回答", d.n + "問"), mini("連続学習", streak() + "日"),
    mini("正答率", all ? pct(ok / all) : "―"), mini("復習の対象", dueList().length + "問")));

  const modeBtns = [["seq", "通し"], ["rand", "ランダム"], ["pick", "精選"]].map(([k, l]) =>
    h("button", { type: "button", class: "btn small", "aria-pressed": String(homeSel.mode === k), onclick: () => { homeSel.mode = k; render(); } }, l));
  const nBtns = [5, 10, 20, 50, "all"].map(n =>
    h("button", { type: "button", class: "btn small", "aria-pressed": String(homeSel.n === n), onclick: () => { homeSel.n = n; render(); } }, n === "all" ? "すべて" : n + "問"));
  const chBtns = chs.map(c => h("button", {
    type: "button", class: "btn small", "aria-pressed": String(homeSel.chs.includes(c.no)),
    onclick: () => { const s = new Set(homeSel.chs); s.has(c.no) ? s.delete(c.no) : s.add(c.no); homeSel.chs = [...s].sort((a, b) => a - b); render(); },
  }, c.no + "章"));

  box.append(h("details", { class: "card stack", open: homeOpen ? true : null, ontoggle: e => { homeOpen = e.target.open; } },
    h("summary", { style: "min-height:48px;display:flex;align-items:center;cursor:pointer;font-weight:bold;font-size:1.1em" }, "出題を自分で選ぶ"),
    h("p", { class: "sub" }, `受ける試験：${examName()}`),
    h("div", null, h("h3", null, "出題形式"), h("div", { class: "row" }, modeBtns),
      h("p", { class: "sub" }, { seq: "章の順に出します。", rand: "順番を混ぜて出します。", pick: "復習の時期が来た問題 → 間違えた問題 → まだ解いていない問題の順に出します。" }[homeSel.mode])),
    h("div", null, h("h3", null, "出題範囲"), h("div", { class: "row" }, chBtns)),
    h("div", null, h("h3", null, "出題数"), h("div", { class: "row" }, nBtns)),
    h("div", null, h("h3", null, "オプション"),
      toggle("発展の問題もまぜる（" + advWhat() + "）", S.settings.mixAdv, v => { S.settings.mixAdv = v; homeSel.chs = null; save(); render(); }),
      toggle("最初から入力で解く（4択をとばす）", S.settings.startInput, v => { S.settings.startInput = v; save(); render(); })),
    h("button", { type: "button", class: "btn primary wide", onclick: () => startSession(homeSel) }, "この設定で始める")));
  return box;
}
function advWhat() { return { IP: "基本情報・応用情報の問題", FE: "応用情報の問題", J1: "ITパスポートの問題" }[S.settings.exam] || ""; }
function mini(l, n) { return h("div", { class: "mini", role: "listitem" }, h("div", { class: "n" }, n), h("div", { class: "l" }, l)); }
function toggle(label, on, fn) {
  return h("button", { type: "button", class: "btn small", "aria-pressed": String(!!on), onclick: () => fn(!on), style: "margin:4px 8px 4px 0" },
    (on ? "✓ " : "") + label);
}

/* ===== 7. 出題の並べ方（出題モード） ===== */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickIds(sel) {
  const t = today();
  let qs = pool(S.settings.mixAdv).filter(q => sel.chs.includes(q.ch));
  if (sel.mode === "rand") shuffle(qs);
  if (sel.mode === "pick") {
    const due = [], wrong = [], unseen = [], rest = [];
    for (const q of qs) {
      const r = peek(q.id);
      if (r && r.mastered && r.due && r.due <= t) due.push(q);
      else if (r && r.last === "ng") wrong.push(q);
      else if (!r || !r.seen) unseen.push(q);
      else if (!r.mastered) rest.push(q);
    }
    qs = [...due, ...wrong, ...unseen, ...rest];
  }
  if (sel.only) qs = qs.filter(sel.only);
  const n = sel.n === "all" ? qs.length : sel.n;
  return qs.slice(0, n).map(q => q.id);
}
function startSession(sel, ids) {
  ids = ids || pickIds(sel);
  if (!ids.length) { say("出せる問題がありません。範囲を変えてください"); alertBand("出せる問題がありません。出題範囲か出題形式を変えてください。"); return; }
  S.resume = { ids, i: 0, startAt: Date.now(), results: [], qp: null, lesson: sel && sel.lesson ? sel.lesson : null, st: sel && sel.st || null };
  save();
  go("exercise");
}
function alertBand(t) { const b = h("p", { class: "band", role: "status" }, t); $main.prepend(b); }

/* ===== 8. 演習（1問の型。UI仕様4章、設計書10章） ===== */
function newQp(q) {
  const r = rec(q.id);
  const forced = S.resume && S.resume.st;
  const stage = forced ? forced : (S.settings.startInput || r.st === "input" ? "input" : "choice");
  return { id: q.id, stage, meaning: null, pick: null, vals: q.fields.map(() => ""), done: null, steps: 0, stuck: null, memo: false };
}
function vExercise() {
  const R = S.resume;
  if (!R || R.i >= R.ids.length) { view = "home"; document.body.classList.remove("exercising"); $exbar.hidden = true; renderTabs(); return vHome(); }
  lessonOn = !!R.lesson;
  const q = QBY[R.ids[R.i]];
  if (!q) { R.i++; save(); return vExercise(); }
  if (!R.qp || R.qp.id !== q.id) { R.qp = newQp(q); save(); }
  const qp = R.qp;
  const ch = CBY[q.ch];

  $exbar.replaceChildren(h("div", { class: "exbar-in" },
    h("button", { type: "button", class: "btn small", onclick: () => go("home") }, "← 中断"),
    h("span", { class: "count", "aria-label": `${R.ids.length}問中 ${R.i + 1}問目` }, `${R.i + 1}／${R.ids.length}`),
    h("span", { class: "chname" }, (R.lesson ? "授業　" : "") + `${q.ch}章 ${ch.name}`)));

  const wrap = h("div", { onkeydown: keyPick });

  // 1 まくら
  wrap.append(h("section", { class: "step" },
    h("p", { class: "step-h" }, "まくら"), h("p", { class: "makura" }, q.x.makura)));

  // 2 問題文（過去問は出典をすぐ下に1行）
  const tags = [];
  if (isAdv(q)) tags.push(h("span", { class: "tag" }, "◆ " + advLabel(q)));
  const qsec = h("section", { class: "step", "aria-labelledby": "qh" },
    h("p", { class: "step-h", id: "qh" }, `問題 ${q.id}`, tags),
    h("p", { class: "qtext" }, q.text));
  if (q.round) qsec.append(h("p", { class: "sub" }, `答えの書き方：${q.round}`));
  if (q.past) qsec.append(h("p", { class: "src" }, q.src,
    kaihenNote(q) ? h("span", { class: "sub" }, "（改変＝数値や場面を変えて作り直した問題）") : null));
  wrap.append(qsec);

  // 3 意味の問い
  const msec = h("section", { class: "step", "aria-labelledby": "mh" },
    h("h2", { class: "step-h", id: "mh" }, "何を求める問題？"));
  msec.append(h("div", { class: "opts", role: "group", "aria-labelledby": "mh" }, ch.meaning.map((t, i) => {
    const chosen = qp.meaning === i;
    return h("button", {
      type: "button", class: "btn opt" + (chosen ? " chosen" : "") + (qp.meaning != null && i === q.meaning ? " right" : ""),
      "aria-pressed": String(chosen), disabled: qp.meaning != null ? true : null,
      "data-pick": qp.meaning == null ? "meaning" : null,
      onclick: () => { qp.meaning = i; save(); say(i === q.meaning ? "正解" : "不正解。正解は" + KANA[q.meaning]); rerender("ms"); },
    }, h("span", { class: "k" }, KANA[i]), h("span", null, t));
  })));
  if (qp.meaning != null) {
    const okm = qp.meaning === q.meaning;
    msec.append(h("p", { class: "verdict " + (okm ? "ok" : "ng") }, okm ? "○ 正解" : `× 不正解　正解は ${KANA[q.meaning]}`),
      h("p", null, "この問題で求めるのは：", q.x.what));
  }
  msec.id = "ms";
  wrap.append(msec);
  if (qp.meaning == null) return wrap;

  // 4 解く
  const ssec = h("section", { class: "step", id: "solve", "aria-labelledby": "sh" },
    h("h2", { class: "step-h", id: "sh" }, qp.stage === "choice" ? "解く（4択から選ぶ）" : "解く（答えを入れる）"));
  if (qp.stage === "choice") {
    ssec.append(h("div", { class: "opts", role: "group", "aria-labelledby": "sh" }, q.opts.map((t, i) => {
      const chosen = qp.pick === i;
      return h("button", {
        type: "button", class: "btn opt" + (chosen ? " chosen" : "") + (qp.done && i === q.a1 ? " right" : ""),
        "aria-pressed": String(chosen), disabled: qp.done ? true : null, "data-pick": qp.done ? null : "solve",
        onclick: () => answerChoice(q, qp, i),
      }, h("span", { class: "k" }, KANA[i]), h("span", null, t));
    })));
  } else {
    q.fields.forEach((f, fi) => ssec.append(fieldUI(q, qp, f, fi)));
    if (!qp.done) ssec.append(h("button", { type: "button", class: "btn primary wide", onclick: () => answerInput(q, qp) }, "答え合わせ"));
  }
  const memo = h("details", { class: "memo", open: qp.memo ? true : null, ontoggle: e => { qp.memo = e.target.open; } },
    h("summary", { class: "sub", style: "min-height:48px;display:flex;align-items:center;cursor:pointer" }, "計算メモ（保存しません）"),
    h("textarea", { "aria-label": "計算メモ" }));
  ssec.append(h("div", { class: "row", style: "margin-top:10px" },
    h("button", { type: "button", class: "btn small", onclick: () => go("formula", { ch: q.ch, back: "exercise" }) }, "公式を見る")), memo);

  // 5 判定
  if (qp.done) {
    const v = qp.done.ok;
    const right = qp.stage === "choice" ? `正解は ${KANA[q.a1]}：${q.opts[q.a1]}`
      : q.fields.map(f => `${f.name}：${f.answers[0]}${f.unit && !f.unit.startsWith("語群") ? f.unit : ""}`).join("　");
    ssec.append(h("p", { class: "verdict " + (v ? "ok" : "ng"), role: "status" }, v ? "○ 正解" : "× 不正解"),
      h("p", null, right));
    if (v && qp.stage === "choice") ssec.append(h("p", { class: "sub" }, "次にこの問題が出たときは、答えを入れて解きます。"));
    if (v && qp.stage === "input") ssec.append(h("p", { class: "sub" }, "定着しました。日をあけてもう一度出します。"));
    if (!v) ssec.append(h("p", { class: "sub" }, "次にこの問題が出たときは、4択から解き直します。"));
  }
  wrap.append(ssec);
  if (!qp.done) return wrap;

  // 6 手順の解説（1手ずつ）
  const steps = q.x.steps;
  const xsec = h("section", { class: "step", id: "steps", "aria-labelledby": "xh" },
    h("h2", { class: "step-h", id: "xh" }, `手順の解説（${Math.min(qp.steps, steps.length)}／${steps.length}手）`),
    h("ol", { class: "steps-list" }, steps.slice(0, qp.steps).map((t, i) =>
      h("li", { class: i === qp.steps - 1 ? "reveal" : null }, h("span", { class: "no" }, (i + 1) + "."), t))));
  if (qp.steps < steps.length) {
    xsec.append(h("button", { type: "button", class: qp.steps === 0 ? "btn primary wide" : "btn wide", id: "nextStep",
      onclick: () => { qp.steps++; save(); say(steps[qp.steps - 1]); rerender("nextStep", "steps"); } }, qp.steps === 0 ? "1手目を見る" : "次の手を見る"));
  }
  wrap.append(xsec);
  if (qp.steps < steps.length) return wrap;

  // ※ 間違えたとき：どの手で止まった？
  if (!qp.done.ok && q.x.stuck.length) {
    const st = h("section", { class: "step stuck", id: "stuck", "aria-labelledby": "kh" },
      h("h2", { class: "step-h", id: "kh" }, "どの手で止まった？"),
      h("div", { class: "chips", role: "group", "aria-labelledby": "kh" },
        q.x.stuck.map(no => h("button", { type: "button", class: "btn small", "aria-pressed": String(qp.stuck === no),
          onclick: () => { qp.stuck = no; save(); rerender("stuck"); } }, no + "手目")),
        h("button", { type: "button", class: "btn small", "aria-pressed": String(qp.stuck === 0),
          onclick: () => { qp.stuck = 0; save(); rerender("stuck"); } }, "止まっていない")));
    if (qp.stuck) {
      const gid = q.x.guide[String(qp.stuck)];
      if (gid && DATA.pre[gid]) {
        st.append(h("div", { class: "pre-band" },
          h("p", null, `${qp.stuck}手目で使う算数を、1問だけ練習できます。`),
          h("button", { type: "button", class: "btn", onclick: () => go("pre", { id: gid, back: "exercise" }) }, "この算数に戻る")));
      } else {
        st.append(h("p", { class: "band" }, `${qp.stuck}手目は、上の手順の解説をもう一度読んでみよう。公式も見られます。`));
      }
    }
    wrap.append(st);
  }

  // 7 よくある誤答と理由
  const wrongs = q.x.wrong.split("、").map(s => s.trim()).filter(Boolean);
  const mine = mineWrong(q, qp);
  wrap.append(h("section", { class: "step", "aria-labelledby": "wh" },
    h("h2", { class: "step-h", id: "wh" }, "よくある誤答と理由"),
    h("ul", { class: "wrong-list" }, wrongs.map(w => h("li", { class: mine && norm(w).includes(norm(mine)) ? "mine" : null },
      w, mine && norm(w).includes(norm(mine)) ? "（あなたの答え）" : ""))),
    h("p", null, q.x.why)));

  // 8 サゲ / 9 次にやること
  wrap.append(h("section", { class: "step" }, h("p", { class: "step-h" }, "つまり"), h("p", { class: "sage" }, q.x.sage)));
  const last = R.i + 1 >= R.ids.length;
  wrap.append(h("section", { class: "step" },
    h("p", { class: "step-h" }, "次にやること"), h("p", null, nextText(q.x.next)),
    h("button", { type: "button", class: "btn primary wide", id: "goNext", onclick: nextQuestion }, last ? "結果を見る" : "次の問題へ")));
  return wrap;
}
function nextText(t) {
  const m = t.match(/^(IT-\d\d-(?:\d{3}|K\d\d))(?:（(.*)）)?$/);
  if (m) { const name = m[2] || (QBY[m[1]] ? QBY[m[1]].topic : ""); return `次は「${name}」の問題で確かめよう。`; }
  return t.replace("03_公式で式を見直す", "「公式を見る」で式を見直そう。");  // シート名は学ぶ人に見せない
}
/* 「改変」の言い換えは初めて出た過去問にだけ添える（設計書12章） */
function kaihenNote(q) { if (!S.ui.kaihenId) { S.ui.kaihenId = q.id; save(); } return S.ui.kaihenId === q.id; }
function mineWrong(q, qp) {
  if (!qp.done || qp.done.ok) return "";
  if (qp.stage === "choice") return q.opts[qp.pick];
  const bad = q.fields.findIndex((f, i) => !qp.done.each[i]);
  return bad >= 0 ? qp.vals[bad] : "";
}
function fieldUI(q, qp, f, fi) {
  const id = `f${fi}`;
  const res = qp.done ? qp.done.each[fi] : null;
  const box = h("div", { class: "field" });
  if (f.choices) {
    box.append(h("p", { id: id + "l", style: "margin:0 0 4px;font-size:15px" }, f.name),
      h("div", { class: "chips", role: "group", "aria-labelledby": id + "l" }, f.choices.map(c => h("button", {
        type: "button", class: "btn small", "aria-pressed": String(qp.vals[fi] === c), disabled: qp.done ? true : null,
        onclick: () => { qp.vals[fi] = c; save(); rerender(); },
      }, c))));
  } else {
    const frac = f.answers.some(a => a.includes("/"));
    const isNum = f.answers.every(a => /^[\d.,％%／/−\-]+$/.test(a));
    box.append(h("label", { for: id }, f.name),
      h("div", { class: "inwrap" },
        h("input", { id, type: "text", inputmode: isNum && !frac ? "decimal" : "text", autocomplete: "off", value: qp.vals[fi],
          disabled: qp.done ? true : null, "aria-describedby": f.unit ? id + "u" : null,
          oninput: e => { qp.vals[fi] = e.target.value; save(); },
          onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); answerInput(q, qp); } } }),
        f.unit ? h("span", { class: "unit", id: id + "u" }, f.unit) : null));
  }
  if (res != null) box.append(h("p", { class: "fv " + (res ? "ok" : "ng") }, res ? "○ 正解" : `× 不正解　正解：${f.answers[0]}${f.unit}`));
  return box;
}
function answerChoice(q, qp, i) {
  if (qp.done) return;
  qp.pick = i;
  const ok = i === q.a1;
  qp.done = { ok };
  finishAnswer(q, qp, ok);
}
function answerInput(q, qp) {
  if (qp.done) return;
  const empty = q.fields.findIndex((f, i) => !String(qp.vals[i]).trim());
  if (empty >= 0) { say(`${q.fields[empty].name} が入っていません`); const el = document.getElementById("f" + empty); if (el) el.focus(); return; }
  const each = q.fields.map((f, i) => judgeField(f, qp.vals[i]));
  const ok = each.every(Boolean);
  qp.done = { ok, each };
  finishAnswer(q, qp, ok);
}
function finishAnswer(q, qp, ok) {
  record(q, qp.stage, ok);
  S.resume.results = (S.resume.results || []).filter(r => r.id !== q.id).concat([{ id: q.id, ok }]);
  save();
  say(ok ? "正解" : "不正解");
  rerender("nextStep", "solve");
}
function nextQuestion() {
  S.resume.i++; S.resume.qp = null; save();
  if (S.resume.i >= S.resume.ids.length) {
    const r = S.resume; S.resume = null; S.lastResult = r;
    if (r.lesson) { S.lesson.runs.unshift({ at: today(), label: r.lesson.label, n: r.results.length, ok: r.results.filter(x => x.ok).length }); S.lesson.runs = S.lesson.runs.slice(0, 30); }
    lessonOn = false; save(); go("result"); return;
  }
  go("exercise");
}
function rerender(focusId, scrollId) {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  const el = focusId && document.getElementById(focusId);
  if (el) el.focus({ preventScroll: true });
  const s = scrollId && document.getElementById(scrollId);
  if (s) s.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function keyPick(e) {
  if (!/^[1-4]$/.test(e.key) || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const list = [...document.querySelectorAll('[data-pick]')];
  const group = list.length ? list[0].dataset.pick : null;
  const btns = list.filter(b => b.dataset.pick === group);
  const b = btns[Number(e.key) - 1];
  if (b) { e.preventDefault(); b.click(); }
}

/* ===== 9. 結果 ===== */
function vResult() {
  const r = S.lastResult;
  if (!r) return vHome();
  const res = r.results || [];
  const okN = res.filter(x => x.ok).length;
  const sec = Math.round((Date.now() - r.startAt) / 1000);
  const wrong = res.filter(x => !x.ok).map(x => x.id);
  return h("section", { class: "card stack" },
    h("h2", null, "結果"),
    h("p", { style: "font-size:1.3em;font-weight:bold" }, `${res.length}問中 ${okN}問 正解`),
    h("p", { class: "sub" }, `かかった時間：${Math.floor(sec / 60)}分${sec % 60}秒`),
    wrong.length ? h("div", null, h("h3", null, "間違えた問題"),
      h("ul", null, wrong.map(id => h("li", null, `${id}（${QBY[id].topic}）`)))) : h("p", null, "全問正解です。"),
    wrong.length ? h("button", { type: "button", class: "btn primary wide", onclick: () => startSession(r.lesson ? { lesson: r.lesson } : null, wrong) }, "間違えた問題だけもう一度") : null,
    h("button", { type: "button", class: "btn wide", onclick: () => go("home") }, "ホームへ"));
}

/* ===== 10. 章 ===== */
function chapterRate(no) {
  const qs = baseSet().filter(q => q.ch === no);
  if (!qs.length) return null;
  return qs.filter(q => { const r = peek(q.id); return r && r.last === "ok"; }).length / qs.length;
}
function vChapters() {
  const box = h("div", null, h("h2", { style: "margin-top:12px" }, "章"),
    h("p", { class: "sub" }, `受ける試験：${examName()}。到達率は「いま正解している問題」の割合です。`));
  for (const f of FIELDS) {
    const chs = DATA.chapters.filter(c => c.field === f && pool(true).some(q => q.ch === c.no));
    if (!chs.length) continue;
    box.append(h("details", { class: "field-group", open: true },
      h("summary", null, `${f}（${chs.length}章）`),
      chs.map(c => {
        const rate = chapterRate(c.no);
        const hasAdv = DATA.questions.some(q => q.ch === c.no && isAdv(q));
        const preIds = Object.keys(DATA.pre).filter(id => id.startsWith(`IT-${String(c.no).padStart(2, "0")}-`));
        return h("div", { class: "chap" },
          h("h3", null, `${c.no}章 ${c.name}`, hasAdv ? h("span", { class: "tag" }, "◆ 発展あり") : null),
          h("p", null, "到達目標：", c.goal),
          h("p", { class: "sub" }, rate == null ? "この試験の基本の問題はありません" : `到達率 ${pct(rate)}`),
          h("div", { class: "row" },
            h("button", { type: "button", class: "btn primary small", onclick: () => startSession({ mode: "seq", chs: [c.no], n: "all" }) }, "この章を解く"),
            h("button", { type: "button", class: "btn small", onclick: () => go("formula", { ch: c.no, back: "chapters" }) }, "公式"),
            preIds.length ? h("button", { type: "button", class: "btn small", onclick: () => go("pre", { id: preIds[0], back: "chapters", list: preIds }) }, "前提の算数") : null));
      })));
  }
  return box;
}

/* ===== 11. 公式・前提の算数 ===== */
function vFormula(arg) {
  const c = CBY[arg.ch];
  return h("section", { class: "card stack" },
    h("p", { class: "band mark" }, "試験には持ち込めません。式の意味を確かめるために使ってください。"),
    h("h2", null, `${c.no}章 ${c.name}の公式`),
    h("dl", { class: "formula-list" }, (DATA.formulas[c.no] || []).flatMap(f => [h("dt", null, f.item), h("dd", null, f.expr)])),
    h("button", { type: "button", class: "btn primary wide", onclick: () => go(arg.back) }, arg.back === "exercise" ? "問題に戻る" : "章の一覧に戻る"));
}
let preState = {};
function vPre(arg) {
  const p = DATA.pre[arg.id];
  if (!preState[arg.id]) preState[arg.id] = { v: "", res: null, shown: false };
  const st = preState[arg.id];
  const list = arg.list || null;
  const idx = list ? list.indexOf(arg.id) : -1;
  return h("section", { class: "card stack", "aria-labelledby": "ph" },
    h("p", { class: "step-h" }, "前提の算数"),
    h("h2", { id: "ph" }, p.q),
    h("div", { class: "inwrap" },
      h("input", { id: "pin", type: "text", inputmode: "text", "aria-labelledby": "ph", value: st.v, autocomplete: "off",
        oninput: e => { st.v = e.target.value; },
        onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); checkPre(); } } })),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn primary", onclick: checkPre }, "答え合わせ"),
      h("button", { type: "button", class: "btn", onclick: () => { st.shown = true; rerender(); } }, "答えを見る")),
    st.res != null ? h("p", { class: "verdict " + (st.res ? "ok" : "ng"), role: "status" }, st.res ? "○ 正解" : "× もう一度。わからなければ「答えを見る」") : null,
    st.shown || st.res ? h("p", null, "答え：", p.a) : null,
    list && idx < list.length - 1 ? h("button", { type: "button", class: "btn wide", onclick: () => go("pre", { id: list[idx + 1], back: arg.back, list }) }, "次の算数") : null,
    h("button", { type: "button", class: "btn wide", onclick: () => go(arg.back) }, arg.back === "exercise" ? "元の問題に戻る" : "章の一覧に戻る"));
  function checkPre() { st.res = judgePre(st.v, p.a); say(st.res ? "正解" : "不正解"); rerender(); }
}

/* ===== 12. 記録 ===== */
function vRecords() {
  const box = h("div");
  if (exportBandNeeded()) box.append(exportBand());
  box.append(rubricCard());
  let all = 0, ok = 0;
  for (const k in S.days) { all += S.days[k].n; ok += S.days[k].ok; }
  const seen = Object.values(S.q).filter(r => r.seen).length;
  const mastered = Object.values(S.q).filter(r => r.mastered).length;
  box.append(h("div", { class: "mini-cards", role: "list" },
    mini("のべ回答数", all + "問"), mini("正答率", all ? pct(ok / all) : "―"),
    mini("学習した問題", seen + "問"), mini("定着した問題", mastered + "問")));

  const rows = DATA.chapters.map(c => [c, chapterRate(c.no)]).filter(([, r]) => r != null);
  box.append(h("section", { class: "card" }, h("h2", null, "章別の到達率"),
    h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", { scope: "col" }, "章"), h("th", { scope: "col" }, "到達率"))),
      h("tbody", null, rows.map(([c, r]) => h("tr", null, h("td", null, `${c.no}章 ${c.name}`), h("td", null, pct(r))))))));

  const cal = [];
  for (let i = 27; i >= 0; i--) { const d = addDays(today(), -i); const n = (S.days[d] || {}).n || 0;
    cal.push(h("div", { class: n ? "on" : null, title: `${d}：${n}問` }, h("span", { class: "sr" }, `${d} ${n}問`), d.slice(8))); }
  box.append(h("section", { class: "card" }, h("h2", null, "学習カレンダー（4週間）"),
    h("p", { class: "sub" }, `連続学習 ${streak()}日。色のついた日は1問以上解いた日です。`),
    h("div", { class: "calendar" }, cal)));

  const runs = (S.lesson && S.lesson.runs) || [];
  if (runs.length) box.append(h("section", { class: "card" }, h("h2", null, "授業の記録"),
    h("p", { class: "sub" }, "授業モードで解いた記録です。ふだんの記録とは別に数えています。"),
    h("ul", null, runs.slice(0, 10).map(r => h("li", null, `${r.at}　授業（${r.label}）　${r.n}問中 ${r.ok}問 正解`)))));
  const wl = S.wrongLog.filter(w => QBY[w.id]).slice(0, 10);
  box.append(h("section", { class: "card" }, h("h2", null, "直近の誤答"),
    wl.length ? h("ul", null, wl.map(w => h("li", null, `${w.at}　${w.id}（${QBY[w.id].topic}）`))) : h("p", { class: "sub" }, "まだありません。"),
    wl.length ? h("button", { type: "button", class: "btn wide", onclick: () => startSession(null, [...new Set(wl.map(w => w.id))]) }, "直近の誤答を解き直す") : null));

  box.append(h("section", { class: "card stack" }, h("h2", null, "データ管理"),
    h("p", { class: "sub" }, "記録はこの端末のブラウザの中だけにあります。機種変更の前は書き出しておいてください。"),
    h("button", { type: "button", class: "btn wide", onclick: exportData }, "記録を書き出す"),
    h("label", { class: "btn wide", style: "display:flex;align-items:center;justify-content:center" }, "記録を読み込む",
      h("input", { type: "file", accept: "application/json", class: "sr", onchange: importData })),
    h("button", { type: "button", class: "btn wide", onclick: clearData }, "記録をすべて消す")));
  return box;
}
function rubricCard() {
  const rb = rubric();
  const dropped = reachDropped;
  const R = DATA.rubric;
  const card = h("section", { class: "card", "aria-labelledby": "rbh" }, h("h2", { id: "rbh" }, "いまの現在地"),
    h("p", { class: "sub" }, `数える問題：${examName()}の基本の問題 ${rb.N}問`));
  card.append(h("div", { class: "rub-views" }, rb.views.map((v, i) => {
    const sname = R.stages[v.stage].name;
    const spoken = `${v.name}、段階${v.stage}、${sname}。いま${Math.round(v.ratio * 100)}パーセント。` +
      (v.stage >= 4 ? "この観点は到達" : `次の段階まで、あと${v.left}問`);
    const go2 = [() => startSession({ mode: "seq", chs: DATA.chapters.map(c => c.no), n: 10, only: q => { const r = peek(q.id); return !r || !r.seen; } }),
      () => startSession({ mode: "pick", chs: DATA.chapters.map(c => c.no), n: 10, only: q => { const r = peek(q.id); return r && r.last === "ng"; } }),
      () => startSession({ mode: "pick", chs: DATA.chapters.map(c => c.no), n: 10, only: q => { const r = peek(q.id); return r && r.seen && (!r.mastered || (r.due && r.due <= today())); } })][i];
    return h("div", { class: "rub", role: "group", "aria-label": spoken },
      h("h3", null, `${v.name}　段階${v.stage} ${sname}`),
      h("div", { class: "bar", "aria-hidden": "true" },
        h("div", { class: "fill", style: `width:${Math.min(100, v.ratio * 100)}%` }),
        v.nextTh != null ? h("div", { class: "th", style: `left:calc(${v.nextTh * 100}% - 1px)` }) : null),
      h("p", { class: "nums", "aria-hidden": "true" }, `いま ${Math.round(v.ratio * 100)}％` + (v.nextTh != null ? `／次は ${Math.round(v.nextTh * 100)}％` : "")),
      h("p", { class: "left", "aria-hidden": "true" }, v.stage >= 4 ? "この観点は到達" : `次の段階まで あと${v.left}問`),
      i === 1 && dropped ? h("div", { class: "band mark" }, h("p", null, "間違えた問題を解き直すと戻ります。"),
        h("button", { type: "button", class: "btn", onclick: go2 }, "間違えた問題を解き直す")) : null,
      h("button", { type: "button", class: "btn small wide", onclick: go2 }, v.next));
  })));
  card.append(h("p", { class: "overall" }, `総合：段階${rb.overall} ${rb.stage.name}`), h("p", null, rb.stage.word));
  if (rb.advSolved) card.append(h("p", null, `発展（${advWhat()}）は別に数えています：解いた${rb.advSolved}問・正解${rb.advOk}問`));
  card.append(h("p", { class: "sub" }, "学習記録から自動で出す目安です。成績や合格の保証ではありません。記録はこの端末の中だけで計算し、どこにも送りません。"));
  return card;
}
function exportData() {
  try {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `IT計算_記録_${today()}.json` });
    document.body.append(a); a.click(); a.remove();
    S.ui.exportAt = today(); S.ui.exportBandClosedAt = null; save(); say("記録を書き出しました"); render();
  } catch (e) { say("書き出せませんでした"); }
}
function importData(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  f.text().then(t => {
    const o = JSON.parse(t);
    if (!o || o.v !== 1 || typeof o.q !== "object") throw new Error("形が違う");
    S = Object.assign(blank(), o); save(); applyLook(); say("記録を読み込みました"); render();
  }).catch(() => { say("読み込めませんでした。このアプリで書き出したファイルを選んでください"); });
}
function clearData() {
  const b = document.getElementById("clearConfirm");
  if (!b) {
    const box = h("div", { class: "band mark", id: "clearConfirm", role: "alert" },
      h("p", null, "記録をすべて消します。元に戻せません。消す前に書き出しておくと戻せます。"),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn", onclick: () => { const s = S.settings; S = blank(); S.settings = s; save(); say("記録を消しました"); render(); } }, "すべて消す"),
        h("button", { type: "button", class: "btn", onclick: () => render() }, "やめる")));
    $main.querySelector("section:last-of-type").append(box);
    box.querySelector("button").focus();
  }
}

/* 記録を残す使い方の知らせ（UI仕様11章） */
function isIOSSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}
function iosBandNeeded() { return isIOSSafari() && !S.ui.iosBandClosed; }
function iosBand() {
  return h("div", { class: "band" }, h("p", null, "ホーム画面に追加すると、記録が消えにくくなります。"),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn small", onclick: () => go("settings", "howto") }, "やり方"),
      h("button", { type: "button", class: "btn small", onclick: () => { S.ui.iosBandClosed = true; save(); render(); } }, "閉じる")));
}
function exportBandNeeded() {
  const from = S.ui.exportBandClosedAt || S.ui.exportAt || S.ui.firstAt;
  return !!from && addDays(from, 14) <= today();
}
function exportBand() {
  return h("div", { class: "band" }, h("p", null, "記録を書き出しておくと、機種変更や消えたときに戻せます。"),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn small", onclick: exportData }, "書き出す"),
      h("button", { type: "button", class: "btn small", onclick: () => { S.ui.exportBandClosedAt = today(); save(); render(); } }, "閉じる")));
}

/* ===== 13. 設定 ===== */
function vSettings(arg) {
  const seg = (label, key, opts) => h("div", null, h("h3", null, label), h("div", { class: "row" }, opts.map(([v, l]) =>
    h("button", { type: "button", class: "btn small", "aria-pressed": String(S.settings[key] === v),
      onclick: () => { S.settings[key] = v; if (key === "exam") homeSel.chs = null; save(); applyLook(); render(); } }, l))));
  const box = h("div", null,
    h("section", { class: "card stack" }, h("h2", null, "設定"),
      seg("受ける試験", "exam", EXAMS.map(e => [e.id, e.name])),
      h("p", { class: "sub" }, "試験を変えても、記録は残ります。"),
      seg("文字の大きさ", "size", [["m", "標準"], ["l", "大"], ["xl", "特大"]]),
      seg("画面の明るさ", "theme", [["light", "明るい"], ["dark", "暗い"], ["auto", "端末に合わせる"]])),
    h("section", { class: "card stack", id: "howto" }, h("h2", null, "記録を残す使い方"),
      h("ul", null,
        h("li", null, "ブックマークして、毎回同じURLから開いてください。"),
        h("li", null, "iPhone・iPadは、Safariの共有ボタン（四角から矢印が出たマーク）→「ホーム画面に追加」で、ホーム画面から開いてください。"),
        h("li", null, "記録タブの「記録を書き出す」で、ファイルに残せます。別の端末では「記録を読み込む」で戻せます。")),
      h("p", { class: "sub" }, "記録はこの端末のブラウザの中だけにあります。どこにも送りません。")),
    h("section", { class: "card stack", id: "report" }, h("h2", null, "誤り報告・感想"),
      h("p", null, "問題のまちがいや、使いにくいところを教えてください。1〜2分で終わります。名前は書きません。"),
      h("p", { class: "sub" }, "まちがいの報告には、問題の上にある番号（例：IT-08-001）を書いてください。フォームはGoogleフォームで開きます（通信が必要です）。"),
      h("a", { class: "btn primary wide", href: FORM_URL, target: "_blank", rel: "noopener", style: "display:flex;align-items:center;justify-content:center;text-decoration:none" }, "フォームを開く")),
    lessonUrlCard());
  if (arg === "howto") setTimeout(() => { const el = document.getElementById("howto"); if (el) el.scrollIntoView(); }, 0);
  return box;
}

/* ===== 14. 授業モード（UI仕様5章） =====
   例：index.html#lesson&ex=FE&ch=7,9&n=10&ord=seq
   「#」より後ろはサーバーに送られない。名前などを書く項目は置かない。 */
function parseLesson(hash) {
  const parts = hash.replace(/^#/, "").split("&").filter(Boolean);
  if (parts[0] !== "lesson") return null;
  const kv = {};
  for (const p of parts.slice(1)) { const i = p.indexOf("="); if (i > 0) kv[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1)); }
  const bad = [];
  const L = { ex: null, chs: null, n: 10, ord: "seq", seed: null, st: "choice" };
  if (kv.ex != null) { if (EXAM_KEY[kv.ex]) L.ex = kv.ex; else bad.push("試験"); }
  if (kv.ch != null) {
    const list = kv.ch.split(",").map(x => Number(x));
    if (list.length && list.every(x => Number.isInteger(x) && CBY[x])) L.chs = list; else bad.push("章");
  }
  if (kv.n != null) { if (kv.n === "all") L.n = "all"; else if (["5", "10", "20", "50"].includes(kv.n)) L.n = Number(kv.n); else bad.push("問題数"); }
  if (kv.ord != null) { if (kv.ord === "seq" || kv.ord === "rand") L.ord = kv.ord; else bad.push("順番"); }
  if (kv.seed != null) { const v = Number(kv.seed); if (Number.isInteger(v) && v >= 1 && v <= 9999) L.seed = v; else bad.push("ランダムの種"); }
  if (kv.st != null) { if (kv.st === "choice" || kv.st === "input") L.st = kv.st; else bad.push("解き方"); }
  L.bad = bad;
  return L;
}
function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function lessonIds(L) {
  const prevExam = S.settings.exam;
  if (L.ex) S.settings.exam = L.ex;
  let qs = DATA.questions.filter(q => inExam(q) && (!L.chs || L.chs.includes(q.ch)));
  S.settings.exam = prevExam;
  if (L.ord === "rand") {
    const rnd = L.seed ? seeded(L.seed) : Math.random;
    for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
  }
  return qs.slice(0, L.n === "all" ? qs.length : L.n).map(q => q.id);
}
function lessonLabel(L) {
  const ex = EXAMS.find(e => e.id === (L.ex || S.settings.exam));
  const chs = L.chs ? L.chs.map(c => c + "章").join("と") : "全部の章";
  return `${ex ? ex.name : ""}・${chs}・${L.n === "all" ? "すべて" : L.n + "問"}`;
}
function vLesson(L) {
  const ids = lessonIds(L);
  const label = lessonLabel(L);
  return h("section", { class: "card stack", "aria-labelledby": "lh" },
    h("h2", { id: "lh" }, "先生が用意した問題です"),
    h("p", { style: "font-size:1.1em;font-weight:bold" }, `（${label}）`),
    L.bad.length ? h("p", { class: "band" }, `${L.bad.join("・")}は読めなかったので、ふだんの設定で出します。`) : null,
    h("p", { class: "sub" }, "この記録は、ふだんの記録とは分けて残します。結果はどこにも送りません。"),
    ids.length ? h("button", { type: "button", class: "btn primary wide", onclick: () => {
      history.replaceState(null, "", location.pathname + location.search);
      startSession({ lesson: { label }, st: L.st === "input" ? "input" : null }, ids);
    } }, `始める（${ids.length}問）`) : h("p", { class: "band" }, "この組み合わせで出せる問題がありません。先生に伝えてください。"),
    h("button", { type: "button", class: "btn wide", onclick: () => { history.replaceState(null, "", location.pathname + location.search); go("home"); } }, "ふだんの画面へ"));
}
let lessonMake = { ex: null, chs: [], n: 10, ord: "seq", seed: "", st: "choice" };
function lessonUrlCard() {
  const M = lessonMake;
  if (!M.ex) M.ex = S.settings.exam;
  const parts = ["lesson", "ex=" + M.ex];
  if (M.chs.length) parts.push("ch=" + M.chs.join(","));
  parts.push("n=" + M.n, "ord=" + M.ord);
  if (M.ord === "rand" && M.seed) parts.push("seed=" + M.seed);
  if (M.st === "input") parts.push("st=input");
  const url = location.href.split("#")[0] + "#" + parts.join("&");
  const seg = (label, key, opts, multi) => h("div", null, h("h3", null, label), h("div", { class: "row" }, opts.map(([v, l]) =>
    h("button", { type: "button", class: "btn small", "aria-pressed": String(multi ? M[key].includes(v) : M[key] === v),
      onclick: () => { if (multi) { const s = new Set(M[key]); s.has(v) ? s.delete(v) : s.add(v); M[key] = [...s].sort((a, b) => a - b); } else M[key] = v;
        if (key === "ord" && v === "rand" && !M.seed) M.seed = String(1 + Math.floor(Math.random() * 9999)); rerender(); } }, l))));
  return h("section", { class: "card stack", id: "lessonMake" }, h("h2", null, "授業用のURLを作る"),
    h("p", { class: "sub" }, "選んだ内容をURLに書きます。名前や出席番号は入りません。"),
    seg("試験", "ex", EXAMS.map(e => [e.id, e.name])),
    seg("章（選ばなければ全部）", "chs", DATA.chapters.map(c => [c.no, c.no + "章"]), true),
    seg("問題数", "n", [[5, "5問"], [10, "10問"], [20, "20問"], [50, "50問"], ["all", "すべて"]]),
    seg("順番", "ord", [["seq", "章の順"], ["rand", "ランダム（全員同じ順）"]]),
    seg("解き方", "st", [["choice", "4択から"], ["input", "入力から"]]),
    h("label", { for: "lessonUrl", class: "sub" }, "できたURL"),
    h("input", { id: "lessonUrl", type: "text", readonly: true, value: url, style: "width:100%;height:48px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:var(--paper);color:var(--ink);font:inherit;font-size:14px" }),
    h("button", { type: "button", class: "btn primary wide", onclick: () => {
      const done = () => say("URLをコピーしました");
      try { navigator.clipboard.writeText(url).then(done, () => { document.getElementById("lessonUrl").select(); document.execCommand("copy"); done(); }); }
      catch (e) { document.getElementById("lessonUrl").select(); document.execCommand("copy"); done(); }
    } }, "URLをコピー"));
}

/* ===== 15. はじめる ===== */
document.getElementById("themeBtn").addEventListener("click", () => {
  const dark = S.settings.theme === "dark" || (S.settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  S.settings.theme = dark ? "light" : "dark"; save(); applyLook();
});
load();
applyLook();
function boot() {
  const L = parseLesson(location.hash);
  if (L) { go("lesson", L); return; }
  go(S.settings.exam ? "home" : "pickExam");
}
window.addEventListener("hashchange", boot);
boot();
/* 一度開けば、通信のない所でも開けるようにする（GitHub Pages で開いたときだけ。保存したファイルで開いたときは使わない） */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* 使えなくてもアプリは動く */ });
}
})();

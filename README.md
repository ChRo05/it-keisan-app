# it-keisan-app（IT計算問題アプリ）

ITパスポート・基本情報技術者・応用情報技術者の計算問題と、高校「情報I」の計算を、1手ずつ解く練習アプリ。
配るのはリポジトリ直下の `index.html` の1枚だけ（GitHub Pages：https://chro05.github.io/it-keisan-app/ ）。通信なし・Webフォントなしで動き、記録は端末のブラウザの中だけに残る。

操作マニュアル：https://chro05.github.io/it-keisan-app/manual/ （`manual/` で作る：`python3 manual/shots.py && python3 manual/make_manual.py`）

配布元：学習教材コンテンツ事務局

## 作り方

```
pip install openpyxl
python3 build/check.py          # マスターの自動点検（不合格なら止まる）
python3 build/build.py          # 点検 → index.html を作る
python3 build/build.py --ch 8   # 8章だけで作る（試しの区切り用）
```

作るときは、Drive の 02_正データ にある確定マスターを `data/master.xlsx` として置く。マスターは制作用で配布しないため、リポジトリには入れない（.gitignore）。直すときは Drive 側を直して承認をもらい、写し直す。

## テスト

```
python3 build/dump_fields.py > test/fields.json
node test/judge_test.js         # 入力の判定（全問の段階2の欄・全角・単位・％・指数）
python3 test/smoke_all.py       # 全658問を画面で通す（4択で1周、入力で1周）
python3 build/build.py --ch 8 --out test/ch8/index.html && python3 test/e2e.py   # 8章で1問の型を通し、画面を撮る
```

画面のテストには Playwright と Google Chrome を使う。

## 中身

| 場所 | 中身 |
|---|---|
| build/master.py | マスターの読み方（段階2_欄・手順・案内先の分け方） |
| build/check.py | 自動点検（実装計画 7-1） |
| build/build.py | マスター → JSON → 1枚のHTML |
| src/template.html | 画面の骨組み |
| src/style.css | 見た目（01_見た目の決まり.md の値） |
| src/app.js | 判定・出題・記録・ルーブリック・授業モード |
| test/ | 判定のテスト、画面のテスト |

## 決まりの出どころ

- 00_design.md（v0.14）09〜12章
- 05_UI設計／1114_UI仕様.md（第3版）、01_見た目の決まり.md（第3版）
- 03_AI作業／1118_実装計画.md（第4版）

## 秘密の情報・個人情報

APIキー・パスワードは使わない。万一要るときは `.env` に置き、リポジトリに入れない。
名前・メールなど人を特定できる情報は集めない・送らない。授業モードのURLにも書けない。

"""テスト用：全問の段階2の欄をJSONで出す（test/judge_test.js が読む）。"""
import json
from master import _s, load, parse_fields

m = load()
print(json.dumps([{"id": _s(r["問題ID"]), "fields": parse_fields(r["段階2_欄"])} for r in m["q"]], ensure_ascii=False))

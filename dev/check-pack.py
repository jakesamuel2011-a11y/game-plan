#!/usr/bin/env python3
# Developer check for practice packs and their syllabus topics (no app code uses this).
#   python3 dev/check-pack.py revision/packs/<id>.json [topics.json]
# topics.json (optional) = list of {id, unit, name, points[], pack, packUnit}: checks every
# packUnit exists in the pack and every pack unit has a topic.
import json, sys

def fail(msg):
    print("FAIL:", msg); sys.exit(1)

p = json.load(open(sys.argv[1]))
for k in ["id", "subject", "title", "sub", "units", "flashcards"]:
    if not p.get(k): fail(f"missing {k}")
units = [u["key"] for u in p["units"]]
if len(set(units)) != len(units): fail("duplicate unit keys")
for u in p["units"]:
    if not u.get("name"): fail(f"unit {u} has no name")
    if "::" in u["key"] or "+" in u["key"]: fail(f"unit key {u['key']} must not contain :: or +")
counts = {u: {"cards": 0, "quiz": 0, "exam": 0} for u in units}
def unit_ok(x, where):
    if x.get("unit") not in units: fail(f"{where}: unit {x.get('unit')!r} not in units")
for i, c in enumerate(p["flashcards"]):
    unit_ok(c, f"flashcard {i}")
    if not c.get("front") or not c.get("back"): fail(f"flashcard {i} needs front and back")
    counts[c["unit"]]["cards"] += 1
for i, q in enumerate(p.get("quiz", [])):
    unit_ok(q, f"quiz {i}")
    if len(q.get("options", [])) != 4: fail(f"quiz {i}: needs exactly 4 options")
    if q.get("answer") not in (0, 1, 2, 3): fail(f"quiz {i}: answer must be 0-3")
    if len(set(q["options"])) != 4: fail(f"quiz {i}: duplicate options")
    if not q.get("q") or not q.get("why"): fail(f"quiz {i}: needs q and why")
    counts[q["unit"]]["quiz"] += 1
for i, q in enumerate(p.get("exam", [])):
    unit_ok(q, f"exam {i}")
    if not isinstance(q.get("marks"), int) or q["marks"] < 1: fail(f"exam {i}: marks must be a positive int")
    if not (q.get("points") or q.get("model")): fail(f"exam {i}: needs points (mark scheme) or model (model answer)")
    counts[q["unit"]]["exam"] += 1
for i, e in enumerate(p.get("timeline", [])):
    unit_ok(e, f"timeline {i}")
    if not isinstance(e.get("year"), int): fail(f"timeline {i}: year must be an int")
for i, d in enumerate(p.get("debates", [])):
    unit_ok(d, f"debate {i}")
    for k in ["q", "for", "against", "judgement"]:
        if not d.get(k): fail(f"debate {i}: missing {k}")
for u, c in counts.items():
    if c["cards"] < 4 or c["exam"] < 1: fail(f"unit {u} is thin: {c}")
if len(sys.argv) > 2:
    topics = json.load(open(sys.argv[2]))
    mine = [t for t in topics if t.get("pack") == p["id"]]
    for t in mine:
        for k in ["id", "unit", "name", "points", "pack", "packUnit"]:
            if not t.get(k): fail(f"topic {t.get('id')}: missing {k}")
        if t["packUnit"] not in units: fail(f"topic {t['id']}: packUnit {t['packUnit']} not in pack units")
    missing = set(units) - {t["packUnit"] for t in mine}
    if missing: fail(f"pack units with no topic: {missing}")
print("OK", p["id"], {u: f"{c['cards']} cards, {c['quiz']} quiz, {c['exam']} exam" for u, c in counts.items()})

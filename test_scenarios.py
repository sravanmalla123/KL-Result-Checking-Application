import requests

base = {
    'filename': 'report.pdf',
    'text': 'methodology results experiment analysis conclusion',
    'images': [],
    'engine': 'gemini'
}

tests = [
    ('ai', 0.0, None),
    ('household', 0.0, None),
    ('valid', None, None),
    ('valid', 0.0, "Abstract: We generated the diagram using midjourney."),
    ('valid', 0.0, "Abstract: This is a photo of my family in the backyard.")
]

print("=== VeriReport AI Detection Tests ===\n")
all_pass = True
for scenario, expected_score, override_text in tests:
    payload = {**base, 'simulationScenario': scenario}
    if override_text:
        payload['text'] = override_text
    r = requests.post('http://127.0.0.1:8000/api/grade', json=payload, timeout=15)
    d = r.json()
    score = d.get('score')
    images = d.get('images', [])
    has_ai = any(i.get('isAI') for i in images)
    has_household = any(i.get('isHousehold') for i in images)

    if expected_score is not None:
        passed = abs(score - expected_score) < 0.01
    else:
        passed = score is not None and score > 0

    status = "PASS" if passed else "FAIL"
    if not passed:
        all_pass = False

    print(f"[{status}] simulationScenario='{scenario}', text_override={override_text is not None}")
    print(f"       score={score} | images flagged={len(images)} | isAI={has_ai} | isHousehold={has_household}")
    print(f"       summary: {d.get('summary','')[:90]}...\n")


# Compare All test
print("=== Compare All Engines Test (ai scenario) ===\n")
payload_cmp = {**base, 'engine': 'compare', 'simulationScenario': 'ai'}
r = requests.post('http://127.0.0.1:8000/api/grade', json=payload_cmp, timeout=30)
d = r.json()
for eng in ['gemini', 'chatgpt', 'claude', 'blackbox']:
    score = d['comparison'][eng]['score']
    passed = abs(score - 0.0) < 0.01
    if not passed:
        all_pass = False
    print(f"  [{('PASS' if passed else 'FAIL')}] {eng}: score={score}")

print()
print("=== OVERALL:", "ALL TESTS PASSED [OK]" if all_pass else "SOME TESTS FAILED [FAIL]")

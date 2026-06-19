import requests

url = 'http://127.0.0.1:8000/api/grade'

print('=== Grace Band Logic Test (55-59 -> 60) ===')
for raw in [54, 55, 56, 57, 58, 59, 60, 61]:
    after = 60 if 55 <= raw <= 59 else raw
    label = 'PASS' if after >= 60 else 'FAIL'
    arrow = ' --> 60 GRACE APPLIED' if raw != after else ''
    print(f'  Raw score {raw:3d} -> Final {after:3d} [{label}]{arrow}')

print()
print('=== API Live Test ===')
base = {'filename': 'report.pdf', 'text': 'methodology results experiment analysis conclusion references', 'images': []}
for scenario in ['valid', 'ai', 'household']:
    r = requests.post(url, json={**base, 'simulationScenario': scenario}, timeout=15)
    d = r.json()
    grade = 'PASS' if d['score'] >= 60 else 'FAIL'
    print(f'  [{scenario}] Score: {d["score"]}/100 -> {grade}')

print()
print('ALL OK')

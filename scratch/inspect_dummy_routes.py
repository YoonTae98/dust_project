import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('data/daegu_routes.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

print(f"Total routes: {len(d['routes'])}")
for r in d['routes']:
    rid = r.get('id')
    zid = r.get('zone_id')
    name = r.get('name')
    pts = len(r.get('points', []))
    km = r.get('length_km')
    print(f"{rid} | Zone {zid} | {name} | pts={pts} | {km}km")

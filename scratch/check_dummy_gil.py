import json
import sys
import math
import os

sys.stdout.reconfigure(encoding='utf-8')

# 1. 모든 zone_nodes 로드
zone_nodes = {}
for zid in range(1, 14):
    path = f'data/zone_nodes/zone{zid}.json'
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            zone_nodes[zid] = json.load(f)

# 2. daegu_routes.json 로드
with open('data/daegu_routes.json', 'r', encoding='utf-8') as f:
    daegu_data = json.load(f)

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

print("Checking routes for '길' in points near road nodes...")
gil_routes_summary = []

for r in daegu_data['routes']:
    rid = r.get('id')
    zid = int(r.get('zone_id', 1))
    nodes = zone_nodes.get(zid, [])
    if not nodes:
        continue
    
    pts = r.get('points', [])
    matched_roads = set()
    gil_roads = set()
    
    # 샘플링 (10개 포인트마다 또는 전체)
    sample_pts = pts[::max(1, len(pts)//50)]
    for pt in sample_pts:
        plat, plon = pt[0], pt[1]
        best_dist = 999
        best_node = None
        for n in nodes:
            d = haversine(plat, plon, n['lat'], n['lng'])
            if d < best_dist:
                best_dist = d
                best_node = n
        if best_node and best_dist < 0.3: # 300m 이내
            rname = best_node.get('road_name', '')
            if rname:
                matched_roads.add(rname)
                if '길' in rname or '골목' in rname:
                    gil_roads.add(rname)
                    
    if gil_roads:
        gil_routes_summary.append((rid, zid, r.get('name'), list(gil_roads)[:5]))

print(f"Total routes inspected: {len(daegu_data['routes'])}")
print(f"Routes passing through '길': {len(gil_routes_summary)}")
for rid, zid, name, gils in gil_routes_summary[:15]:
    print(f"  [{rid}] {name} (Zone {zid}): {gils}")

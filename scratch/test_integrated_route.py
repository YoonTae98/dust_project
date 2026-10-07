import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import collector, route_optimizer, single_route, math
e = route_optimizer

zone_id = 1
raw = e.collector.crawl_all_stations_pm10()
raw, _ = single_route.observation_context(raw)

valid_p10 = [(float(s['lat']), float(s['lng']), float(s['pm10']), s) for s in raw.values() if s.get('pm10') is not None]
valid_p25 = [(float(s['lat']), float(s['lng']), float(s['pm25']), s) for s in raw.values() if s.get('pm25') is not None and str(s.get('pm25')) not in ('-', 'None', '')]

def predict_idw(lat, lng, valid_list, power=1.5, k=20):
    samples = sorted((e.haversine_km(lat, lng, a, b), val) for a, b, val, _ in valid_list)[:k]
    if samples[0][0] == 0: return samples[0][1]
    weights = [1 / d ** power for d, _ in samples]
    return sum(w * s[1] for w, s in zip(weights, samples)) / sum(weights)

budget_mult = 1.0
_, lengths, depot_candidates = single_route.baseline_budget(e.collector.get_routes(), zone_id, multiplier=budget_mult)
budget = round(sum(lengths) / 3 * budget_mult, 2)

raw_zone_nodes = e.get_zone_candidate_nodes(zone_id)
highway_keywords = getattr(e, 'HIGHWAY_EXCLUDE_KEYWORDS', ())
depot_points = {(round(d['point'][0], 6), round(d['point'][1], 6)) for d in depot_candidates}

all_raw_nodes, seen = [], set()
for node in raw_zone_nodes:
    if any(k in node.get('road_name', '') for k in highway_keywords): continue
    lat, lng = node['lat'], node['lng']
    coord = (round(lat, 6), round(lng, 6))
    if coord in seen or coord in depot_points: continue
    if not e.point_in_zone_polygon(lat, lng, e.ZONE_POLYGONS[zone_id]): continue
    seen.add(coord)
    
    p10 = predict_idw(lat, lng, valid_p10)
    p25 = predict_idw(lat, lng, valid_p25)
    severity = max(p10, p25 * (80.0 / 35.0))
    all_raw_nodes.append(dict(node, local_pm10=p10, local_pm25=p25, severity_pm=severity))

sorted_nodes = sorted(all_raw_nodes, key=lambda n: n['severity_pm'], reverse=True)
needed_candidates = max(24, min(len(all_raw_nodes), min(42, int(budget * 1.1) + 4)))
nodes = sorted_nodes[:needed_candidates]

concentrations = [0] + [n['severity_pm'] for n in nodes]
background = math.fsum(concentrations[1:]) / len(nodes)
rewards = [0] + [max(0.0, pm - background) for pm in concentrations[1:]]
if max(rewards) <= 1e-9: rewards = concentrations[:]
for node, reward in zip(nodes, rewards[1:]):
    node['visit_reward'] = reward

print(f"=== Candidate nodes ({len(nodes)} total) ===")
for n in nodes[:15]:
    print(f"  {n['id']} ({n.get('dong')}) {n.get('road_name')}: Severity={n['severity_pm']:.1f}, Reward={n['visit_reward']:.2f}")

for d in depot_candidates:
    start = d['point']
    coords = [start] + [(n['lat'], n['lng']) for n in nodes]
    table = single_route.osrm('table', coords, 'annotations=distance')
    matrix = table.get('distances')
    distances = [[float(x) / 1000 if x is not None else math.inf for x in row] for row in matrix]
    seq = single_route.solve_orienteering(distances, rewards, budget, concentrations)
    chosen = [nodes[i-1] for i in seq[1:-1]]
    dongs = [n.get('dong') for n in chosen]
    score = sum(rewards[i] for i in seq[1:-1])
    print(f"\nDepot {d['course_code']} ({d['name']}): Score={score:.2f}, Visited {len(chosen)} nodes")
    print(f"  Visited Dongs: {set(dongs)}")

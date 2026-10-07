import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import collector, route_optimizer, single_route, math
e = route_optimizer

raw = e.collector.crawl_all_stations_pm10()
raw, _ = single_route.observation_context(raw)

valid_p10 = [(float(s['lat']), float(s['lng']), float(s['pm10']), s) for s in raw.values() if s.get('pm10') is not None]
valid_p25 = [(float(s['lat']), float(s['lng']), float(s['pm25']), s) for s in raw.values() if s.get('pm25') is not None and str(s.get('pm25')) not in ('-', 'None', '')]

def predict_idw(lat, lng, valid_list, power=1.5, k=20):
    samples = sorted((e.haversine_km(lat, lng, a, b), val) for a, b, val, _ in valid_list)[:k]
    if samples[0][0] == 0: return samples[0][1]
    weights = [1 / d ** power for d, _ in samples]
    return sum(w * s[1] for w, s in zip(weights, samples)) / sum(weights)

nodes = e.get_zone_candidate_nodes(1)
print("=== Top 20 Nodes with Combined Air Quality (PM10 + PM2.5) ===")
scored_nodes = []
for n in nodes:
    p10 = predict_idw(n['lat'], n['lng'], valid_p10)
    p25 = predict_idw(n['lat'], n['lng'], valid_p25)
    # 80/35 = 2.2857 (나쁨 기준 일치)
    combined = max(p10, p25 * (80.0 / 35.0))
    scored_nodes.append((combined, p10, p25, n))

scored_nodes.sort(key=lambda x: x[0], reverse=True)
for c, p10, p25, n in scored_nodes[:20]:
    print(f"  {n['id']} ({n.get('dong')}) {n.get('road_name')}: Severity={c:.1f}, PM10={p10:.1f}, PM2.5={p25:.1f}")

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import route_optimizer, single_route

e = route_optimizer
raw = e.collector.crawl_all_stations_pm10()
raw, _ = single_route.observation_context(raw)
valid = [(float(s['lat']), float(s['lng']), float(s['pm10']), s) 
         for s in raw.values() if s.get('pm10') is not None and s.get('network') == '도시대기']

print("Valid stations used for IDW in single_route:")
for v in valid:
    print(f"  {v[3]['station_name']} ({v[3]['network']}) PM10={v[2]} lat/lng: {v[0]}, {v[1]}")

def predict(lat, lng):
    samples = sorted((e.haversine_km(lat, lng, a, b), value) for a, b, value, _ in valid)[:20]
    if samples[0][0] == 0: return samples[0][1]
    weights = [1 / d ** 1.5 for d, _ in samples]
    return sum(w * sample[1] for w, sample in zip(weights, samples)) / sum(weights)

nodes = e.get_zone_candidate_nodes(1)
print("\nTop 20 Node predicted PM10 values:")
sorted_nodes = sorted(nodes, key=lambda x: predict(x['lat'], x['lng']), reverse=True)
for n in sorted_nodes[:20]:
    p = predict(n['lat'], n['lng'])
    print(f"  {n['id']} {n.get('dong')} {n.get('road_name')}: PM10={p:.1f}")

print("\nBottom 20 Node predicted PM10 values:")
for n in sorted_nodes[-20:]:
    p = predict(n['lat'], n['lng'])
    print(f"  {n['id']} {n.get('dong')} {n.get('road_name')}: PM10={p:.1f}")

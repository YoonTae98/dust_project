import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import collector
import route_optimizer
import single_route
import math

e = route_optimizer

for zone_id in [1, 2, 3, 11, 12]:
    routes = collector.get_routes()
    selected = [r for r in routes if int(r.get('zone_id', 0)) == zone_id and r.get('course_code') in ('A', 'B', 'C')]
    by_course = {r['course_code']: r for r in selected}
    lengths = [float(by_course[c]['length_km']) for c in 'ABC']
    avg_km = sum(lengths) / 3
    budget = round(avg_km, 2)
    
    # Nodes
    raw = e.collector.crawl_all_stations_pm10()
    raw, _ = single_route.observation_context(raw)
    valid = [(float(s['lat']), float(s['lng']), float(s['pm10']), s) 
             for s in raw.values() if s.get('pm10') is not None and s.get('network') == '도시대기']
    
    def predict(lat, lng):
        samples = sorted((e.haversine_km(lat, lng, a, b), value) for a, b, value, _ in valid)[:20]
        if samples[0][0] == 0: return samples[0][1]
        weights = [1 / d ** 1.5 for d, _ in samples]
        return sum(w * sample[1] for w, sample in zip(weights, samples)) / sum(weights)

    highway_keywords = getattr(e, 'HIGHWAY_EXCLUDE_KEYWORDS', (
        '고속도로', '고속국도', '경부고속', '중앙고속', '순환고속', '대구외곽순환',
        'IC', 'JC', 'TG', '분기점', '나들목', '톨게이트'
    ))

    raw_zone_nodes = e.get_zone_candidate_nodes(zone_id)
    all_raw_nodes, seen = [], set()
    for node in raw_zone_nodes:
        if any(k in node.get('road_name', '') for k in highway_keywords): continue
        lat, lng = node['lat'], node['lng']
        coord = (round(lat, 6), round(lng, 6))
        if coord in seen: continue
        if not e.point_in_zone_polygon(lat, lng, e.ZONE_POLYGONS[zone_id]): continue
        seen.add(coord)
        all_raw_nodes.append(dict(node, local_pm10=predict(lat, lng)))

    sorted_nodes = sorted(all_raw_nodes, key=lambda n: n['local_pm10'], reverse=True)
    needed_candidates = max(24, min(len(all_raw_nodes), min(42, int(budget * 1.1) + 4)))
    nodes = sorted_nodes[:needed_candidates]

    concentrations = [0] + [n['local_pm10'] for n in nodes]
    background = math.fsum(concentrations[1:]) / len(nodes)
    rewards = [0] + [max(0.0, pm - background) for pm in concentrations[1:]]
    if max(rewards) <= 1e-9: rewards = concentrations[:]

    print(f"\n=================== ZONE {zone_id} (Budget: {budget} km) ===================")
    for code in ('A', 'B', 'C'):
        start = by_course[code]['points'][0]
        try:
            start_snap = single_route.osrm('nearest', [start], 'number=1')
            wp = start_snap.get('waypoints', [{}])[0]
            start_road = wp.get('name', '')
            if not start_road or any(k in start_road for k in highway_keywords):
                closest_node = min(nodes, key=lambda n: e.haversine_km(start[0], start[1], n['lat'], n['lng']))
                start = [closest_node['lat'], closest_node['lng']]
        except Exception:
            start = [nodes[0]['lat'], nodes[0]['lng']]

        coords = [start] + [(n['lat'], n['lng']) for n in nodes]
        table = single_route.osrm('table', coords, 'annotations=distance')
        matrix = table.get('distances')
        distances = [[float(x) / 1000 if x is not None else math.inf for x in row] for row in matrix]
        
        seq = single_route.solve_orienteering(distances, rewards, budget, concentrations)
        chosen = [nodes[i-1] for i in seq[1:-1]]
        score = sum(rewards[i] for i in seq[1:-1])
        avg_pm10 = sum(n['local_pm10'] for n in chosen) / len(chosen) if chosen else 0
        est_len = single_route.route_length(seq, distances)
        print(f"Course {code} Depot: visited {len(chosen)} nodes, PM10 reward score = {score:.2f}, avg PM10 = {avg_pm10:.2f}, est_dist = {est_len:.2f}km")

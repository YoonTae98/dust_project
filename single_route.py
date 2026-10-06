"""Single-route, distance-budget orienteering prototype.
Model reference: Vansteenwegen et al. (2011), doi:10.1016/j.ejor.2010.03.045.
The heuristic and PM10 proxy below are project adaptations, not that paper's algorithm.
"""
import json
import hashlib
import math
import os
import re
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo


_CACHED_DONG_POLYS = None

def get_dong_polygons():
    global _CACHED_DONG_POLYS
    if _CACHED_DONG_POLYS is not None:
        return _CACHED_DONG_POLYS
    geojson_path = os.path.join(os.path.dirname(__file__), 'static', 'data', 'daegu_dong.geojson')
    polys = []
    if os.path.exists(geojson_path):
        from shapely.geometry import shape
        with open(geojson_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for feat in data.get('features', []):
            props = feat.get('properties', {})
            geom = shape(feat.get('geometry', {}))
            dist = props.get('district', '')
            dong = props.get('dong', '')
            key = f"{dist}_{dong}"
            polys.append({
                'key': key,
                'name': f"{dist} {dong}",
                'district': dist,
                'dong': dong,
                'geom': geom,
                'bounds': geom.bounds  # (min_lng, min_lat, max_lng, max_lat)
            })
    _CACHED_DONG_POLYS = polys
    return _CACHED_DONG_POLYS


def find_passed_dongs(points):
    from shapely.geometry import Point
    polys = get_dong_polygons()
    passed = {}
    for pt in points:
        lat, lng = pt[0], pt[1]
        for d in polys:
            b = d['bounds']
            if b[0] <= lng <= b[2] and b[1] <= lat <= b[3]:
                if d['key'] not in passed and d['geom'].contains(Point(lng, lat)):
                    passed[d['key']] = d
    return passed


def finite_number(value):
    try:
        x = float(value)
        return x if math.isfinite(x) and x >= 0 else None
    except (TypeError, ValueError):
        return None


def baseline_budget(routes, zone_id, multiplier=1.0):
    selected = [r for r in routes if int(r.get('zone_id', 0)) == zone_id
                and r.get('course_code') in ('A', 'B', 'C')]
    by_course = {r['course_code']: r for r in selected}
    if len(selected) != 3 or set(by_course) != {'A', 'B', 'C'}:
        raise ValueError('이 구역의 기존 A·B·C 경로 3개가 필요합니다.')
    lengths = [finite_number(by_course[c].get('length_km')) for c in 'ABC']
    if any(x is None or x <= 0 for x in lengths):
        raise ValueError('기존 경로 거리 정보가 유효하지 않습니다.')
    avg_len = sum(lengths) / 3
    return avg_len * multiplier, lengths, by_course['A']


def route_length(sequence, distances):
    return sum(distances[a][b] for a, b in zip(sequence, sequence[1:]))


def weighted_arrival_distance(sequence, distances, rewards):
    """Sum PM10_i * distance traveled before first visiting i (not clock time)."""
    arrival = 0.0
    terms = []
    for a, b in zip(sequence, sequence[1:]):
        arrival += distances[a][b]
        if b != 0:
            terms.append(rewards[b] * arrival)
    return math.fsum(terms)


def improve_visit_order(sequence, distances, rewards, budget):
    """Directed reversal local search; same selected nodes, smaller weighted arrival.
    Numerical tolerance below is only for floating-point comparisons.
    """
    sequence = list(sequence)
    cost = weighted_arrival_distance(sequence, distances, rewards)
    while True:
        improved = None
        best_cost = cost
        for i in range(1, len(sequence) - 2):
            for j in range(i + 1, len(sequence) - 1):
                candidate = sequence[:i] + list(reversed(sequence[i:j+1])) + sequence[j+1:]
                if route_length(candidate, distances) > budget:
                    continue
                candidate_cost = weighted_arrival_distance(candidate, distances, rewards)
                if candidate_cost < best_cost - 1e-9:
                    best_cost, improved = candidate_cost, candidate
        if improved is None:
            return sequence
        sequence, cost = improved, best_cost


def solve_orienteering(distances, rewards, budget, coverage_rewards=None):
    """Multi-start reward/insertion-cost heuristic on a directed distance matrix.
    Index 0 is fixed start/return point; reward counted once per selected node.
    No scientific claim is attached to the choice of this heuristic.
    """
    coverage_rewards = coverage_rewards or rewards
    n = len(rewards)
    best = None
    seeds = sorted(range(1, n), key=lambda i: (rewards[i], coverage_rewards[i]), reverse=True)[:min(10, n - 1)]
    for seed in seeds:
        seq = [0, seed, 0]
        length = route_length(seq, distances)
        if not math.isfinite(length) or length > budget:
            continue
        remaining = set(range(1, n)) - {seed}
        while remaining:
            candidates = []
            for node in sorted(remaining):
                for pos in range(1, len(seq)):
                    a, b = seq[pos - 1], seq[pos]
                    delta = distances[a][node] + distances[node][b] - distances[a][b]
                    if not math.isfinite(delta) or length + delta > budget:
                        continue
                    ratio = (math.inf if rewards[node] > 0 else 0) if delta <= 0 else rewards[node] / delta
                    coverage_ratio = math.inf if delta <= 0 else coverage_rewards[node] / delta
                    candidates.append((ratio, coverage_ratio, rewards[node], -delta, -node, -pos))
            if not candidates:
                break
            _, _, _, _, neg_node, neg_pos = max(candidates)
            node, pos = -neg_node, -neg_pos
            seq.insert(pos, node)
            remaining.remove(node)
            length = route_length(seq, distances)
        score = math.fsum(rewards[i] for i in seq[1:-1])
        latency = weighted_arrival_distance(seq, distances, rewards)
        coverage = math.fsum(coverage_rewards[i] for i in seq[1:-1])
        key = (score, coverage, -latency, length)
        if best is None or key > best[0]:
            best = (key, seq)
    if best is None:
        raise ValueError('평균 거리 예산 안에서 출발점으로 돌아오는 경로가 없습니다.')
    return improve_visit_order(best[1], distances, rewards, budget)


def osrm(service, coords, options):
    # Keep this adapter name for compatibility with existing callers/tests.
    # Public OSRM does not support exclude=motorway; validate Valhalla roads.
    from road_routing import calculate
    return calculate(service, coords, options)


def observation_context(raw, date_str=None, hour_str=None):
    today = datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d')
    date_str = date_str or today
    datetime.strptime(date_str, '%Y-%m-%d')
    hour = str(hour_str).split(':')[0].zfill(2) if hour_str and hour_str != 'all' else None
    if hour is not None and (not hour.isdigit() or not 0 <= int(hour) <= 23):
        raise ValueError('조회 시간은 00~23시여야 합니다.')
    historical = date_str != today
    filtered = {}
    for code, station in raw.items():
        stamp = str(station.get('time', ''))
        normalized = re.sub(r'[./]', '-', stamp)
        if historical or hour:
            match = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', normalized)
            measured_date = '-'.join([match[1], match[2].zfill(2), match[3].zfill(2)]) if match else None
            if measured_date != date_str:
                continue
            if hour:
                measured_hour = re.search(r'(\d{1,2}):\d{2}', normalized)
                if not measured_hour or measured_hour[1].zfill(2) != hour:
                    continue
        filtered[code] = station
    if not filtered:
        raise ValueError(f'{date_str}의 요청한 대기 데이터가 없습니다. 현재 데이터로 대체하지 않습니다.')
    period = 'hour' if hour else ('day' if historical else 'latest')
    suffix = f'{hour}:00 기준' if hour else ('일평균 기준' if historical else '최신 관측 기준')
    return filtered, dict(date=date_str, hour=hour, period=period, is_demo=historical,
                         label=f'{date_str} {suffix}',
                         source_times=sorted({str(s.get('time', '')) for s in filtered.values()}))


def generate(engine, zone_id, date_str=None, hour_str=None):
    try:
        return _generate(engine, int(zone_id), date_str, hour_str)
    except Exception as exc:
        return {'success': False, 'message': f'단일 추천 경로 생성 실패: {exc}'}


def _generate(e, zone_id, date_str, hour_str):
    if zone_id not in e.ZONE_POLYGONS:
        raise ValueError('지원하지 않는 구역입니다.')
    _, lengths, baseline = baseline_budget(e.collector.get_routes(), zone_id, multiplier=1.0)
    avg_baseline_km = sum(lengths) / 3
    start = baseline.get('points', [])
    if not start:
        raise ValueError('기존 A 경로의 출발 좌표가 없습니다.')
    start = start[0]
    raw = e.collector.crawl_all_stations_pm10(date_str=date_str, hour_str=hour_str)
    raw, observation = observation_context(raw, date_str, hour_str)
    valid = []
    for s in raw.values():
        pm = finite_number(s.get('pm10'))
        lat, lng = s.get('lat'), s.get('lng')
        if pm is not None and lat is not None and lng is not None and s.get('network') == '도시대기':
            valid.append((float(lat), float(lng), pm, s))
    if not valid:
        raise ValueError('유효한 도시대기 PM10 관측값이 없습니다. 대체 농도를 넣지 않습니다.')

    # Retain existing dong PM10 IDW parameters. They are provisional here;
    # the uploaded project contains no validation results supporting them.
    def predict(lat, lng):
        samples = sorted((e.haversine_km(lat, lng, a, b), value)
                         for a, b, value, _ in valid)[:20]
        if samples[0][0] == 0:
            return samples[0][1]
        weights = [1 / d ** 1.5 for d, _ in samples]
        return sum(w * sample[1] for w, sample in zip(weights, samples)) / sum(weights)

    highway_keywords = getattr(e, 'HIGHWAY_EXCLUDE_KEYWORDS', (
        '고속도로', '고속국도', '경부고속', '중앙고속', '순환고속', '대구외곽순환',
        'IC', 'JC', 'TG', '분기점', '나들목', '톨게이트'
    ))

    raw_zone_nodes = e.get_zone_candidate_nodes(zone_id)

    all_raw_nodes, seen = [], set()
    for node in raw_zone_nodes:
        if any(k in node.get('road_name', '') for k in highway_keywords):
            continue
        lat, lng = node['lat'], node['lng']
        coord = (round(lat, 6), round(lng, 6))
        if coord in seen or coord == (round(start[0], 6), round(start[1], 6)):
            continue
        if not e.point_in_zone_polygon(lat, lng, e.ZONE_POLYGONS[zone_id]):
            continue
        seen.add(coord)
        all_raw_nodes.append(dict(node, local_pm10=predict(lat, lng)))
    if not all_raw_nodes:
        raise ValueError('구역 내 유효한 도로 후보 거점이 없습니다.')

    zone_mean_pm10 = sum(n['local_pm10'] for n in all_raw_nodes) / len(all_raw_nodes)

    # 거리 예산 배율: 기존 A·B·C 평균 거리의 1.0배(100%) 이내로 엄격 고정
    budget_mult = 1.0
    budget = round(avg_baseline_km * budget_mult, 2)
    sorted_nodes = sorted(all_raw_nodes, key=lambda n: n['local_pm10'], reverse=True)
    # 거리 예산(budget)에 비례하여 충분한 고농도 거점 풀(최대 42개)을 제공하여 빠른 연산속도와 높은 거리 활용도 동시 확보
    needed_candidates = max(24, min(len(all_raw_nodes), min(42, int(budget * 1.1) + 4)))
    nodes = sorted_nodes[:needed_candidates]

    # 출발점(start)이 고속도로/IC/전용도로 램프에 걸려있거나 유효 도로명이 아닐 경우 구역 내 일반 간선도로 거점으로 안전 스냅
    try:
        start_snap = osrm('nearest', [start], 'number=1')
        wp = start_snap.get('waypoints', [{}])[0]
        start_road = wp.get('name', '')
        if not start_road or any(k in start_road for k in highway_keywords):
            closest_node = min(nodes, key=lambda n: e.haversine_km(start[0], start[1], n['lat'], n['lng']))
            start = [closest_node['lat'], closest_node['lng']]
    except Exception:
        if nodes:
            start = [nodes[0]['lat'], nodes[0]['lng']]

    # PM10 효과 평가용 후보군 (구역 내 행정동별 후보 거점 기준)
    effect_nodes, effect_seen = [], set()
    for node in raw_zone_nodes:
        try:
            lat, lng = float(node['lat']), float(node['lng'])
        except (KeyError, TypeError, ValueError):
            continue
        if not str(node.get('dong') or '').strip():
            continue
        coord = (round(lat, 6), round(lng, 6))
        if coord in effect_seen:
            continue
        effect_seen.add(coord)
        effect_nodes.append(dict(node, lat=lat, lng=lng, local_pm10=predict(lat, lng)))
    if not effect_nodes:
        raise ValueError('PM10 효과 평가용 행정동 도로 후보 거점이 없습니다.')
    coords = [start] + [(n['lat'], n['lng']) for n in nodes]
    table = osrm('table', coords, 'annotations=distance')
    matrix = table.get('distances')
    if not matrix or len(matrix) != len(coords) or any(len(row) != len(coords) for row in matrix):
        raise ValueError('도로 거리행렬을 가져오지 못했습니다.')
    distances = [[float(x) / 1000 if x is not None else math.inf for x in row] for row in matrix]
    concentrations = [0] + [n['local_pm10'] for n in nodes]
    background = math.fsum(concentrations[1:]) / len(nodes)
    # Project policy: prioritise local excess, not the common background rewarded
    # once for every node. This is not a health threshold or a paper-derived formula.
    rewards = [0] + [max(0.0, pm - background) for pm in concentrations[1:]]
    uniform = max(rewards) <= 1e-9
    if uniform:
        rewards = concentrations[:]
    for node, reward in zip(nodes, rewards[1:]):
        node['visit_reward'] = reward
    sequence = solve_orienteering(distances, rewards, budget, concentrations)

    # Routing may differ from pairwise table costs. Validate actual full route,
    # removing visits until the true distance satisfies budget and no motorway steps are used.
    for _ in range(5):
        if len(sequence) <= 2:
            break
        result = osrm('route', [coords[i] for i in sequence],
                      'overview=full&geometries=geojson&steps=true&continue_straight=false')
        route = result['routes'][0]
        actual = float(route['distance']) / 1000
        # 고속도로/자동차전용도로를 경유하는 leg 검출
        highway_leg_idx = None
        for leg_i, leg in enumerate(route.get('legs', [])):
            for step in leg.get('steps', []):
                sname = (step.get('name', '') or '') + ' ' + (step.get('ref', '') or '')
                if any(k in sname for k in highway_keywords):
                    highway_leg_idx = leg_i
                    break
            if highway_leg_idx is not None:
                break

        # 거리 예산을 만족하고 고속도로/전용도로 스텝이 전혀 없으면 경로 확정
        if actual <= budget and highway_leg_idx is None:
            break

        # 고속도로를 유발한 구간의 노드를 우선 배제, 없으면 최저 리워드 노드 적응형 제거
        if highway_leg_idx is not None and 1 <= highway_leg_idx + 1 < len(sequence) - 1:
            sequence.pop(highway_leg_idx + 1)
        elif highway_leg_idx is not None and 0 < highway_leg_idx < len(sequence) - 1:
            sequence.pop(highway_leg_idx)
        else:
            excess_km = actual - budget
            pop_count = min(len(sequence) - 2, max(1, int(excess_km / 2.0)))
            candidates_to_remove = sorted(range(1, len(sequence) - 1), key=lambda j: rewards[sequence[j]])[:pop_count]
            for idx in sorted(candidates_to_remove, reverse=True):
                sequence.pop(idx)
    else:
        result = osrm('route', [coords[i] for i in sequence],
                      'overview=full&geometries=geojson&steps=true&continue_straight=false')
        route = result['routes'][0]
        actual = float(route['distance']) / 1000
    points = [[lat, lng] for lng, lat in route['geometry']['coordinates']]
    chosen = [nodes[i-1] for i in sequence[1:-1]]
    if not chosen:
        raise ValueError('거리 예산 내에서 순회 가능한 경로를 구성하지 못했습니다.')
    avg = sum(n['local_pm10'] for n in chosen) / len(chosen)
    score = math.fsum(n['visit_reward'] for n in chosen)
    input_values = sorted((str(n['id']), n['local_pm10']) for n in nodes)
    input_id = hashlib.sha256(json.dumps(input_values).encode()).hexdigest()[:12]
    sequence_ids = [n['id'] for n in chosen]
    route_id = hashlib.sha256(json.dumps(sequence_ids).encode()).hexdigest()[:12]
    actual_arrival = 0.0
    arrival_terms = []
    for node, leg in zip(chosen, route.get('legs', [])):
        actual_arrival += float(leg['distance']) / 1000
        arrival_terms.append(node['visit_reward'] * actual_arrival)
    pm25 = None
    title = f'{zone_id}구간 단일 추천 경로'
    color = '#06b6d4'
    stops = []
    for idx, node in enumerate(chosen, 1):
        stops.append(dict(node, node_id=node['id'], seq=idx, seq_label=str(idx), global_seq=idx,
                          vehicle_id=f'Z{zone_id:02d}-SINGLE', vehicle_num=1, vehicle_name=title,
                          vehicle_color=color, local_pm10=round(node['local_pm10'], 1), local_pm25=None,
                          priority_score=round(node['visit_reward'], 3), urgency='추천 거점',
                          urgency_code='normal', badge_color=color, is_start=False, is_end=False,
                          is_depot=False, action_mode='고농도 지역 우선 방문 · 청소 효과 미검증',
                          desc=node.get('desc', '')))
    grade = (('좋음', '#3b82f6', 1) if avg <= 30 else ('보통', '#10b981', 2) if avg <= 80
             else ('나쁨', '#f59e0b', 3) if avg <= 150 else ('매우나쁨', '#ef4444', 4))
    station_slots = []
    for *_, s in sorted(valid, key=lambda t: e.haversine_km(start[0], start[1], t[0], t[1]))[:2]:
        station_slots.append(dict(code=s.get('sttn_cd'), name=s.get('station_name'),
                                  pm10=s['pm10'], pm25=s.get('pm25', '-')))
    air = dict(grade_text=grade[0], grade_color=grade[1], grade_level=grade[2],
               zone_avg_pm10=round(avg, 1), zone_avg_pm25=pm25,
               primary_station=station_slots[0], secondary_station=station_slots[-1])
    distance = round(actual, 2)
    minutes = round(route['duration'] / 60, 1)
    badge = f"{observation['label']} · 추천 1개 · 고속도로 제외"
    description = '기존 평균 거리 이내 구역 후보 평균 대비 초과 PM10 방문 점수 우선. 동점이면 PM10 합, 조기 방문 순. 출발점 복귀 포함.'
    item = dict(vehicle_id=f'Z{zone_id:02d}-SINGLE', vehicle_num=1, vehicle_name=title,
                role_title='거리 예산 기반 고농도 거점 방문', zone_area=e.ZONE_NAMES[zone_id],
                color=color, route_title=title, total_dist_km=distance,
                max_dist_limit_km=budget, is_within_limit=True,
                headroom_pct=round((budget-actual)/budget*100, 1), est_work_min=minutes,
                avg_target_pm10=round(avg, 1), avg_target_pm25=None, points=points, stops=stops,
                estimated_dust_kg=None, efficiency_kg_per_km=None,
                reward_score=round(score, 2), road_steps=[s for leg in route['legs'] for s in leg.get('steps', [])])

    # 행정동별 후보 청소거점 커버리지에 43.3%를 비례 적용하는 PM10 대리지표 시뮬레이션.
    # 도시대기 IDW와 도로재비산먼지 PM10은 동일 지표가 아니므로 실제 대기농도 예측으로 표시하지 않는다.
    effect_comparison = None
    effect_error = None
    try:
        from pm10_effect_model import evaluate_proxy_routes
        effect_comparison = evaluate_proxy_routes(
            e.collector.get_routes(), zone_id, points, distance, effect_nodes, observation['label'])
    except Exception as exc:
        effect_error = str(exc)

    ai_effect = (effect_comparison or {}).get('routes', {}).get('AI', {})
    baseline_effect = {
        k: (effect_comparison or {}).get('routes', {}).get(k, {}) for k in ('A', 'B', 'C')
    }

    return dict(success=True, observation_context=observation, zone_id=zone_id, zone_name=e.ZONE_NAMES[zone_id],
                zone_code=f'Z{zone_id:02d}', generated_at=datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M:%S'),
                depot=dict(lat=start[0], lng=start[1], name='기존 A 경로 시작점 (임시 출발·복귀점)'),
                air_status=air, fleet_routes=[item], routes=[item],
                fleet_summary=dict(active_vehicles_count=1, total_fleet_dist_km=distance,
                    total_fleet_work_min=minutes, max_vehicle_dist_limit_km=budget,
                    all_within_limit=True, strategy_badge=badge, strategy_desc=description,
                    is_emergency=False, total_fleet_dust_kg=None, fleet_efficiency=None),
                dynamic_route=dict(item, id=f'SINGLE-Z{zone_id:02d}', name=title,
                    active_vehicles_count=1, strategy_badge=badge, strategy_desc=description,
                    hotspots_count=len(stops),
                    predicted_pm10_after=ai_effect.get('after_pm10_proxy'),
                    predicted_pm10_after_proxy=ai_effect.get('after_pm10_proxy'),
                    pm10_reduction_pct=ai_effect.get('reduction_pct'),
                    pm10_effect_status=(effect_comparison or {}).get('status'),
                    pm10_effect_label=(effect_comparison or {}).get('display_name')),
                static_comparison=dict(static_name='기존 A·B·C 평균 (데모 노선)', total_dist_km=round(budget, 2),
                    baseline_lengths_km=lengths,
                    abc_mean_distance_km=(effect_comparison or {}).get('abc_mean_distance_km', round(budget, 2)),
                    abc_mean_reduction_pct=(effect_comparison or {}).get('abc_mean_reduction_pct'),
                    ai_improvement_pct=(effect_comparison or {}).get('ai_improvement_pct'),
                    ai_difference_percentage_points=(effect_comparison or {}).get('ai_difference_percentage_points'),
                    route_effects=baseline_effect, efficiency_gain_pct=None, dust_gain_kg=None),
                effect_comparison=effect_comparison,
                effect_error=effect_error,
                methodology=dict(model='Orienteering Problem', solver='multi-start insertion + weighted arrival distance local search',
                    optimality_proven=False, input_id=input_id, route_id=route_id,
                    road_policy=route.get('road_policy'),
                    reward_model='local_excess_pm10_v1',
                    background_pm10=round(background, 3), uniform_field_fallback=uniform,
                    candidate_pm10_min=round(min(concentrations[1:]), 2),
                    candidate_pm10_max=round(max(concentrations[1:]), 2),
                    candidate_values=[dict(node_id=n['id'], name=n['name'], pm10=n['local_pm10']) for n in nodes],
                    visit_order=sequence_ids, all_candidates_visited=len(chosen)==len(nodes),
                    weighted_arrival_distance=round(math.fsum(arrival_terms), 3),
                    ordering_reference='https://www.sciencedirect.com/science/article/pii/S0020019000001022',
                    target_distance_km=budget, actual_distance_km=actual,
                    distance_gap_km=budget-actual, budget_use_pct=round(actual/budget*100, 1),
                    reward_score=round(score, 2), candidate_count=len(nodes), visited_count=len(chosen),
                    effect_candidate_count=len(effect_nodes),
                    idw=dict(power=1.5, k=20, network='도시대기', status='기존 설정 유지 · 검증 필요'),
                    effect_model=dict(beta=0.433,
                        source='환경부·한국환경공단 2023-04-26 분진흡입 청소차 평균 43.3%',
                        status='도시대기 IDW를 사용한 대리지표 시뮬레이션 · 실제 대기농도 예측 아님'),
                    reference='https://doi.org/10.1016/j.ejor.2010.03.045',
                    note='대기 PM10 기반 방문 점수이며 제거량이 아님. 효과 비교는 경로가 영향을 준 행정동의 후보 청소거점 커버리지에 43.3%를 비례 적용한 조건부 대리지표 시뮬레이션. 전역 최적 보장 없음.'))

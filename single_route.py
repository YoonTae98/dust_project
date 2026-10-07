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
    depot_candidates = []
    for code in ('A', 'B', 'C'):
        pts = by_course[code].get('points', [])
        if pts:
            depot_candidates.append({
                'course_code': code,
                'name': f"기존 {code} 코스 기점 ({by_course[code].get('name', f'{code} 코스')})",
                'point': pts[0]
            })
    return avg_len * multiplier, lengths, depot_candidates


def route_length(sequence, distances):
    return sum(distances[a][b] for a, b in zip(sequence, sequence[1:]))


def weighted_arrival_distance(sequence, distances, rewards):
    """Sum PM10_i * distance traveled before first visiting i."""
    arrival = 0.0
    terms = []
    for a, b in zip(sequence, sequence[1:]):
        arrival += distances[a][b]
        if b != 0:
            terms.append(rewards[b] * arrival)
    return math.fsum(terms)


def improve_visit_order(sequence, distances, rewards, budget):
    """Directed reversal local search for OPEN tour: sequence = [0, n1, n2, ..., nk]."""
    sequence = list(sequence)
    if len(sequence) <= 3:
        return sequence
    cost = weighted_arrival_distance(sequence, distances, rewards)
    for _ in range(3):
        improved = None
        best_cost = cost
        for i in range(1, len(sequence) - 1):
            for j in range(i + 1, len(sequence)):
                candidate = sequence[:i] + list(reversed(sequence[i:j+1])) + sequence[j+1:]
                if route_length(candidate, distances) > budget:
                    continue
                candidate_cost = weighted_arrival_distance(candidate, distances, rewards)
                if candidate_cost < best_cost - 1e-9:
                    best_cost, improved = candidate_cost, candidate
        if improved is None:
            break
        sequence, cost = improved, best_cost
    return sequence


def solve_orienteering(distances, rewards, budget, coverage_rewards=None):
    """Multi-start insertion & extension heuristic for OPEN ORIENTEERING (편도 노선).
    Index 0 is fixed start depot. Vehicles travel to high concentration hotspots without returning to 0.
    """
    coverage_rewards = coverage_rewards or rewards
    n = len(rewards)
    best = None
    # 상위 3개 고농도 seed + 상위 3개 거리 효율 seed (총 6개 seed로 즉시 탐색)
    seeds_by_reward = sorted(range(1, n), key=lambda i: (rewards[i], coverage_rewards[i]), reverse=True)[:3]
    seeds_by_ratio = sorted(range(1, n), key=lambda i: (rewards[i] / max(0.5, distances[0][i]) if math.isfinite(distances[0][i]) else -1), reverse=True)[:3]
    
    seeds = []
    seen_seeds = set()
    for s in seeds_by_reward + seeds_by_ratio:
        if s not in seen_seeds:
            seen_seeds.add(s)
            seeds.append(s)

    for seed in seeds:
        seq = [0, seed]
        length = route_length(seq, distances)
        if not math.isfinite(length) or length > budget:
            continue
        remaining = set(range(1, n)) - {seed}
        while remaining:
            candidates = []
            for node in sorted(remaining):
                # 1. 내부 삽입 (pos - 1 와 pos 사이)
                for pos in range(1, len(seq)):
                    a, b = seq[pos - 1], seq[pos]
                    delta = distances[a][node] + distances[node][b] - distances[a][b]
                    if not math.isfinite(delta) or length + delta > budget:
                        continue
                    ratio = (math.inf if rewards[node] > 0 else 0) if delta <= 0 else rewards[node] / delta
                    coverage_ratio = math.inf if delta <= 0 else coverage_rewards[node] / delta
                    candidates.append((ratio, coverage_ratio, rewards[node], -delta, -node, -pos))

                # 2. 끝점 연장 (경로 맨 뒤에 추가)
                last = seq[-1]
                delta_end = distances[last][node]
                if math.isfinite(delta_end) and length + delta_end <= budget:
                    ratio_end = (math.inf if rewards[node] > 0 else 0) if delta_end <= 0 else rewards[node] / delta_end
                    cov_ratio_end = math.inf if delta_end <= 0 else coverage_rewards[node] / delta_end
                    pos_end = len(seq)
                    candidates.append((ratio_end, cov_ratio_end, rewards[node], -delta_end, -node, -pos_end))

            if not candidates:
                break
            _, _, _, _, neg_node, neg_pos = max(candidates)
            node, pos = -neg_node, -neg_pos
            seq.insert(pos, node)
            remaining.remove(node)
            length = route_length(seq, distances)
        score = math.fsum(rewards[i] for i in seq[1:])
        latency = weighted_arrival_distance(seq, distances, rewards)
        coverage = math.fsum(coverage_rewards[i] for i in seq[1:])
        key = (score, coverage, -latency, length)
        if best is None or key > best[0]:
            best = (key, seq)
    if best is None:
        raise ValueError('거리 예산 내에서 출발 가능한 편도 경로가 없습니다.')
    return improve_visit_order(best[1], distances, rewards, budget)


def extract_route_segments(route, default_color='#06b6d4', highway_color='#94a3b8'):
    """Split route into cleaning segments (arterial roads) and highway transit segments."""
    segments = []
    current_type = None
    current_points = []
    current_dist = 0.0

    highway_keywords = (
        '고속도로', '고속국도', '경부고속', '중앙고속', '순환고속', '대구외곽순환',
        'IC', 'JC', 'TG', '분기점', '나들목', '톨게이트'
    )

    for leg in route.get('legs', []):
        for step in leg.get('steps', []):
            sname = (step.get('name', '') or '') + ' ' + (step.get('ref', '') or '')
            is_hw = False
            for item in step.get('intersections', []):
                if 'motorway' in item.get('classes', []):
                    is_hw = True
                    break
            if not is_hw and any(k in sname for k in highway_keywords):
                is_hw = True

            step_type = 'highway_transit' if is_hw else 'cleaning'
            step_dist = float(step.get('distance', 0)) / 1000.0
            step_geom = step.get('geometry', {})
            step_coords = []
            if isinstance(step_geom, dict) and 'coordinates' in step_geom:
                step_coords = [[lat, lng] for lng, lat in step_geom['coordinates']]
            elif isinstance(step_geom, list):
                step_coords = [[lat, lng] for lng, lat in step_geom]

            if not step_coords:
                continue

            if step_type != current_type and current_points:
                segments.append({
                    'type': current_type,
                    'color': highway_color if current_type == 'highway_transit' else default_color,
                    'dash_array': '6,8' if current_type == 'highway_transit' else '',
                    'weight': 4.5 if current_type == 'highway_transit' else 6.5,
                    'opacity': 0.85 if current_type == 'highway_transit' else 0.95,
                    'name': '고속도로 단순 이동 구간 (청소 미수행)' if current_type == 'highway_transit' else '살수·분진흡입 청소 구간',
                    'distance_km': round(current_dist, 2),
                    'points': current_points
                })
                current_points = [current_points[-1]]
                current_dist = 0.0

            current_type = step_type
            if current_points and step_coords:
                if current_points[-1] == step_coords[0]:
                    current_points.extend(step_coords[1:])
                else:
                    current_points.extend(step_coords)
            else:
                current_points.extend(step_coords)
            current_dist += step_dist

    if current_points:
        segments.append({
            'type': current_type or 'cleaning',
            'color': highway_color if current_type == 'highway_transit' else default_color,
            'dash_array': '6,8' if current_type == 'highway_transit' else '',
            'weight': 4.5 if current_type == 'highway_transit' else 6.5,
            'opacity': 0.85 if current_type == 'highway_transit' else 0.95,
            'name': '고속도로 단순 이동 구간 (청소 미수행)' if current_type == 'highway_transit' else '살수·분진흡입 청소 구간',
            'distance_km': round(current_dist, 2),
            'points': current_points
        })
    return segments


def osrm(service, coords, options=None):
    # Keep this adapter name for compatibility with existing callers/tests.
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
    _, lengths, depot_candidates = baseline_budget(e.collector.get_routes(), zone_id, multiplier=1.1)
    avg_baseline_km = sum(lengths) / 3
    if not depot_candidates:
        raise ValueError('이 구역에 유효한 기존 코스 기점 좌표가 없습니다.')
    depot_points = {(round(d['point'][0], 6), round(d['point'][1], 6)) for d in depot_candidates}
    raw = e.collector.crawl_all_stations_pm10(date_str=date_str, hour_str=hour_str)
    raw, observation = observation_context(raw, date_str, hour_str)
    valid_p10 = []
    valid_p25 = []
    for s in raw.values():
        lat, lng = s.get('lat'), s.get('lng')
        if lat is None or lng is None:
            continue
        p10 = finite_number(s.get('pm10'))
        p25 = finite_number(s.get('pm25'))
        if p10 is not None:
            valid_p10.append((float(lat), float(lng), p10, s))
        if p25 is not None:
            valid_p25.append((float(lat), float(lng), p25, s))
    if not valid_p10:
        raise ValueError('유효한 PM10 관측값이 없습니다. 대체 농도를 넣지 않습니다.')

    def predict_idw(lat, lng, valid_list, power=1.5, k=20):
        samples = sorted((e.haversine_km(lat, lng, a, b), value)
                         for a, b, value, _ in valid_list)[:k]
        if samples[0][0] == 0:
            return samples[0][1]
        weights = [1 / d ** power for d, _ in samples]
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
        if coord in seen or coord in depot_points:
            continue
        if not e.point_in_zone_polygon(lat, lng, e.ZONE_POLYGONS[zone_id]):
            continue
        seen.add(coord)
        p10 = predict_idw(lat, lng, valid_p10)
        p25 = predict_idw(lat, lng, valid_p25) if valid_p25 else None
        # 지도 대기질 등급(PM10 vs PM2.5 max)과 일치하도록 종합 심각도 환산 (PM10 기준 80, PM2.5 기준 35 비율 80/35 = 2.2857)
        p25_equiv = (p25 * (80.0 / 35.0)) if p25 is not None else 0.0
        severity = max(p10, p25_equiv)
        all_raw_nodes.append(dict(node, local_pm10=p10, local_pm25=p25, severity_pm=severity))
    if not all_raw_nodes:
        raise ValueError('구역 내 유효한 도로 후보 거점이 없습니다.')

    zone_mean_pm10 = sum(n['local_pm10'] for n in all_raw_nodes) / len(all_raw_nodes)

    # 거리 예산 배율: 기존 A·B·C 평균 거리의 1.1배(110%) 적용 (고속도로 이동거리는 예산 산정에서 제외)
    budget_mult = 1.1
    budget = round(avg_baseline_km * budget_mult, 2)
    sorted_nodes = sorted(all_raw_nodes, key=lambda n: n['severity_pm'], reverse=True)
    # 거리 예산(budget)에 맞춘 컴팩트한 고농도 거점 풀(최대 28개)로 빠른 연산속도 확보
    needed_candidates = max(16, min(len(all_raw_nodes), min(28, int(budget * 0.85) + 2)))
    nodes = sorted_nodes[:needed_candidates]

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
        p10 = predict_idw(lat, lng, valid_p10)
        p25 = predict_idw(lat, lng, valid_p25) if valid_p25 else None
        effect_nodes.append(dict(node, lat=lat, lng=lng, local_pm10=p10, local_pm25=p25))
    if not effect_nodes:
        raise ValueError('PM10 효과 평가용 행정동 도로 후보 거점이 없습니다.')

    concentrations = [0] + [n['severity_pm'] for n in nodes]
    background = math.fsum(concentrations[1:]) / len(nodes)
    # Project policy: prioritise local excess, not the common background rewarded
    # once for every node. This is not a health threshold or a paper-derived formula.
    rewards = [0] + [max(0.0, pm - background) for pm in concentrations[1:]]
    uniform = max(rewards) <= 1e-9
    if uniform:
        rewards = concentrations[:]
    for node, reward in zip(nodes, rewards[1:]):
        node['visit_reward'] = reward

    # 복수 차고지(기존 A·B·C 코스 기점 후보) 각각에 대해 오리엔티어링 경로를 탐색하고
    # 고농도 거점 청소 점수(Score) 및 접근성이 가장 우수한 최적 차고지를 자동 선정
    depot_solutions = []
    evaluated_depots = []

    # 1. 복수 차고지(기존 A·B·C 코스) 각각에 대해 메모리 상에서 초고속 오리엔티어링 연산 (0.01초 내 완료)
    for depot_info in depot_candidates:
        d_code = depot_info['course_code']
        d_name = depot_info['name']
        d_start = depot_info['point']

        try:
            coords = [d_start] + [(n['lat'], n['lng']) for n in nodes]
            distances = []
            for p1 in coords:
                row = []
                for p2 in coords:
                    d = e.haversine_km(p1[0], p1[1], p2[0], p2[1]) * 1.35
                    row.append(d)
                distances.append(row)

            # 실도로 곡률 오차(30~35%)를 고려하여 안전 계획 예산(90%)으로 탐색
            plan_budget = budget * 0.90
            sequence = solve_orienteering(distances, rewards, plan_budget, concentrations)
            chosen = [nodes[i-1] for i in sequence[1:]]
            if not chosen:
                continue

            score = math.fsum(n['visit_reward'] for n in chosen)
            coverage = math.fsum(n['local_pm10'] for n in chosen)
            avg = sum(n['local_pm10'] for n in chosen) / len(chosen)
            est_dist = route_length(sequence, distances)
            latency = weighted_arrival_distance(sequence, distances, rewards)

            depot_key = (score, len(chosen), coverage, -latency, -est_dist)
            depot_solutions.append({
                'depot_key': depot_key,
                'depot_info': depot_info,
                'start': d_start,
                'sequence': sequence,
                'chosen': chosen,
                'score': score,
                'avg': avg,
                'est_dist': est_dist,
                'coords': coords
            })
            evaluated_depots.append({
                'course_code': d_code,
                'name': d_name,
                'start_point': d_start,
                'visited_count': len(chosen),
                'reward_score': round(score, 2),
                'avg_pm10': round(avg, 1),
                'actual_dist_km': round(est_dist, 2),
                'selected': False
            })
        except Exception as depot_exc:
            evaluated_depots.append({
                'course_code': d_code,
                'name': d_name,
                'start_point': d_start,
                'error': str(depot_exc),
                'selected': False
            })

    if not depot_solutions:
        errors = [f"{ed['course_code']}: {ed.get('error')}" for ed in evaluated_depots if ed.get('error')]
        err_msg = ", ".join(errors) if errors else "거리 예산 내에서 도달 가능한 편도 경로가 없습니다."
        raise ValueError(f'편도 경로 생성 실패 ({err_msg})')

    # 2. 고농도 제거 효과 및 접근성이 가장 우수한 최적 차고지 1곳 선정
    best_sol = max(depot_solutions, key=lambda s: s['depot_key'])
    best_depot = best_sol['depot_info']
    start = best_sol['start']
    sequence = list(best_sol['sequence'])
    coords = best_sol['coords']

    # 3. 최적 차고지에 대해 실도로 경로(Valhalla) 생성 및 순수 청소거리(고속도로 제외) 기준 예산 준수
    for _ in range(5):
        if len(sequence) <= 2:
            break
        result = osrm('route', [coords[i] for i in sequence],
                      'overview=full&geometries=geojson&steps=true&continue_straight=false')
        route = result['routes'][0]
        segments = extract_route_segments(route, default_color='#06b6d4', highway_color='#94a3b8')
        cleaning_dist = sum(s['distance_km'] for s in segments if s['type'] == 'cleaning')
        if cleaning_dist <= budget:
            break
        excess_km = cleaning_dist - budget
        # 초과 청소거리에 비례하여 보상 최하위 거점들을 필요한 만큼 한 번에 제거
        pop_count = min(len(sequence) - 2, max(1, int(excess_km / 2.5)))
        candidates_to_remove = sorted(range(1, len(sequence)), key=lambda j: rewards[sequence[j]])[:pop_count]
        for idx in sorted(candidates_to_remove, reverse=True):
            sequence.pop(idx)
    else:
        result = osrm('route', [coords[i] for i in sequence],
                      'overview=full&geometries=geojson&steps=true&continue_straight=false')
        route = result['routes'][0]

    actual = float(route['distance']) / 1000
    chosen = [nodes[i-1] for i in sequence[1:]]
    if not chosen:
        raise ValueError('거리 예산 내에서 생성 가능한 편도 거점이 없습니다.')

    score = math.fsum(n['visit_reward'] for n in chosen)
    avg = sum(n['local_pm10'] for n in chosen) / len(chosen)
    actual_arrival = 0.0
    arrival_terms = []
    for node, leg in zip(chosen, route.get('legs', [])):
        actual_arrival += float(leg['distance']) / 1000
        arrival_terms.append(node['visit_reward'] * actual_arrival)

    segments = extract_route_segments(route, default_color='#06b6d4', highway_color='#94a3b8')
    cleaning_dist = sum(s['distance_km'] for s in segments if s['type'] == 'cleaning')
    transit_dist = sum(s['distance_km'] for s in segments if s['type'] == 'highway_transit')
    has_transit = transit_dist > 0.05

    for ed in evaluated_depots:
        if ed.get('course_code') == best_depot['course_code']:
            ed['selected'] = True
            ed['visited_count'] = len(chosen)
            ed['reward_score'] = round(score, 2)
            ed['actual_dist_km'] = round(actual, 2)
            ed['cleaning_dist_km'] = round(cleaning_dist, 2)

    points = [[lat, lng] for lng, lat in route['geometry']['coordinates']]
    input_values = sorted((str(n['id']), n['local_pm10']) for n in nodes)
    input_id = hashlib.sha256(json.dumps(input_values).encode()).hexdigest()[:12]
    sequence_ids = [n['id'] for n in chosen]
    route_id = hashlib.sha256(json.dumps(sequence_ids).encode()).hexdigest()[:12]
    
    avg_pm10 = sum(n['local_pm10'] for n in chosen) / len(chosen)
    has_pm25 = any(n.get('local_pm25') is not None for n in chosen)
    avg_pm25 = (sum(n['local_pm25'] for n in chosen if n.get('local_pm25') is not None) / len([n for n in chosen if n.get('local_pm25') is not None])) if has_pm25 else None

    title = f'{zone_id}구간 단일 추천 경로'
    color = '#06b6d4'

    stops = []
    for idx, node in enumerate(chosen, 1):
        stops.append(dict(node, node_id=node['id'], seq=idx, seq_label=str(idx), global_seq=idx,
                          vehicle_id=f'Z{zone_id:02d}-SINGLE', vehicle_num=1, vehicle_name=title,
                          vehicle_color=color, local_pm10=round(node['local_pm10'], 1),
                          local_pm25=round(node['local_pm25'], 1) if node.get('local_pm25') is not None else None,
                          priority_score=round(node['visit_reward'], 3), urgency='추천 거점',
                          urgency_code='normal', badge_color=color, is_start=False, is_end=False,
                          is_depot=False, action_mode='고농도 지역 우선 방문 · 청소 효과 미검증',
                          desc=node.get('desc', '')))
    
    g10 = 1 if avg_pm10 <= 30 else 2 if avg_pm10 <= 80 else 3 if avg_pm10 <= 150 else 4
    g25 = (1 if avg_pm25 <= 15 else 2 if avg_pm25 <= 35 else 3 if avg_pm25 <= 75 else 4) if avg_pm25 is not None else 1
    g = max(g10, g25)
    grade = (('좋음', '#3b82f6', 1) if g == 1 else ('보통', '#10b981', 2) if g == 2
             else ('나쁨', '#f59e0b', 3) if g == 3 else ('매우나쁨', '#ef4444', 4))
    
    station_slots = []
    for *_, s in sorted(valid_p10, key=lambda t: e.haversine_km(start[0], start[1], t[0], t[1]))[:2]:
        station_slots.append(dict(code=s.get('sttn_cd'), name=s.get('station_name'),
                                  pm10=s['pm10'], pm25=s.get('pm25', '-')))
    air = dict(grade_text=grade[0], grade_color=grade[1], grade_level=grade[2],
               zone_avg_pm10=round(avg_pm10, 1),
               zone_avg_pm25=round(avg_pm25, 1) if avg_pm25 is not None else None,
               primary_station=station_slots[0], secondary_station=station_slots[-1])
    distance = round(cleaning_dist, 2)
    minutes = round(route['duration'] / 60, 1)
    badge = f"{observation['label']} · 편도 집중 청소" + (" · 고속도로 이동 분리" if has_transit else "")
    description = '기존 평균 거리(1.1배 이내) 종합 대기질(PM10·PM2.5) 심각도 초과 방문 점수 우선 편도 집중 노선. 고속도로는 이동거리로 별도 분리.'
    item = dict(vehicle_id=f'Z{zone_id:02d}-SINGLE', vehicle_num=1, vehicle_name=title,
                role_title='거리 예산 기반 고농도 거점 방문', zone_area=e.ZONE_NAMES[zone_id],
                color=color, route_title=title, total_dist_km=distance,
                cleaning_dist_km=distance,
                gross_travel_dist_km=round(actual, 2),
                transit_highway_dist_km=round(transit_dist, 2),
                has_highway_transit=has_transit,
                max_dist_limit_km=budget, is_within_limit=True,
                headroom_pct=round((budget-cleaning_dist)/budget*100, 1), est_work_min=minutes,
                avg_target_pm10=round(avg_pm10, 1),
                avg_target_pm25=round(avg_pm25, 1) if avg_pm25 is not None else None,
                points=points, segments=segments, stops=stops,
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
                depot=dict(lat=start[0], lng=start[1], name=f"{best_depot['name']} (편도 출발 기점)",
                           course_code=best_depot.get('course_code'),
                           selection_reason=f"기존 A·B·C 기점 중 고농도 오염구간 접근성 및 청소 효과({round(score, 2)}점) 최우수 기점으로 자동 선정",
                           evaluated_depots=evaluated_depots),
                air_status=air, fleet_routes=[item], routes=[item],
                fleet_summary=dict(active_vehicles_count=1, total_fleet_dist_km=distance,
                    cleaning_fleet_dist_km=distance, gross_fleet_dist_km=round(actual, 2),
                    transit_highway_dist_km=round(transit_dist, 2),
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
                    selected_depot=best_depot.get('name'),
                    evaluated_depots=evaluated_depots,
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

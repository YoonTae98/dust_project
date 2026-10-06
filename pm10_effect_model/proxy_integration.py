"""Flask 프로젝트용 행정동 커버리지 기반 PM10 *대리지표* 효과 시뮬레이션.

핵심 아이디어
- 43.3%는 '차량이 행정동에 들어오면 행정동 전체가 43.3% 감소'라는 뜻으로 쓰지 않는다.
- 각 행정동에서 추천/기존 경로가 실제로 통과한 청소 후보 거점 비율(coverage)을 계산한다.
- 행정동별 실효 저감률 = 0.433 × coverage.
- 운행 후 행정동 PM10 대리지표 = 운행 전 IDW PM10 × (1 - 0.433 × coverage).
- 경로 전체 저감률은 그 경로가 실제로 영향을 준(coverage>0) 행정동들만 대상으로,
  후보 거점 수를 도로 노출량의 대리지표로 사용해 가중 평균한다.

주의
- 도시대기 IDW PM10과 도로재비산먼지 PM10은 동일한 물리량이 아니다.
- 43.3%는 환경부/한국환경공단 공개자료의 분진흡입차량 평균 효과를 조건부 계수로 옮겨 쓴다.
- 후보 거점 비율은 실제 도로 총연장 비율이 아니라, 현재 프로젝트의 도로 후보격자 기반 커버리지 대리지표다.
- 후보 거점과 경로의 매칭 반경 0.2 km는 route_optimizer.py에서 후보거점 중복 제거에 쓰는 최소 간격(0.2 km)에 맞춘
  공간 해상도 규칙이며, 문헌에서 도출한 물리 파라미터가 아니다.
"""
import math
from collections import defaultdict
from .effect_model import official_reference_model

MATCH_RADIUS_KM = 0.2


def _haversine_km(a, b):
    lat1, lon1 = map(float, a)
    lat2, lon2 = map(float, b)
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _point_segment_distance_km(point, a, b):
    """짧은 도시 구간에서 equirectangular 투영으로 점-선분 거리(km) 계산."""
    lat0 = math.radians(float(point[0]))
    k_lat = 111.195
    k_lon = 111.195 * max(0.1, math.cos(lat0))

    px, py = 0.0, 0.0
    ax = (float(a[1]) - float(point[1])) * k_lon
    ay = (float(a[0]) - float(point[0])) * k_lat
    bx = (float(b[1]) - float(point[1])) * k_lon
    by = (float(b[0]) - float(point[0])) * k_lat
    vx, vy = bx - ax, by - ay
    denom = vx * vx + vy * vy
    if denom <= 1e-15:
        return math.hypot(ax, ay)
    t = - (ax * vx + ay * vy) / denom
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(cx - px, cy - py)


def _distance_to_polyline_km(point, points):
    pts = points or []
    if len(pts) < 2:
        return math.inf
    best = math.inf
    for a, b in zip(pts, pts[1:]):
        d = _point_segment_distance_km(point, a, b)
        if d < best:
            best = d
            if best <= 0.005:
                break
    return best


def _prepare_candidates(candidate_nodes):
    prepared = []
    for n in candidate_nodes or []:
        try:
            lat = float(n['lat'])
            lng = float(n['lng'])
            pm10 = float(n.get('local_pm10'))
        except (KeyError, TypeError, ValueError):
            continue
        dong = str(n.get('dong') or '').strip()
        if not dong or not math.isfinite(pm10) or pm10 < 0:
            continue
        prepared.append({
            'id': str(n.get('id') or f'{lat:.6f},{lng:.6f}'),
            'dong': dong,
            'district': str(n.get('district') or '').strip(),
            'lat': lat,
            'lng': lng,
            'pm10': pm10,
        })
    return prepared


def _route_effect(points, route_length_km, candidates, beta):
    """한 경로의 행정동별 커버리지와 PM10 대리지표 효과 계산."""
    by_dong = defaultdict(list)
    for n in candidates:
        by_dong[(n['district'], n['dong'])].append(n)

    dong_rows = []
    for (district, dong), nodes in sorted(by_dong.items()):
        visited = []
        for n in nodes:
            d = _distance_to_polyline_km((n['lat'], n['lng']), points)
            if d <= MATCH_RADIUS_KM:
                visited.append(n)

        total_count = len(nodes)
        visited_count = len(visited)
        total_pm10 = math.fsum(n['pm10'] for n in nodes)
        visited_pm10 = math.fsum(n['pm10'] for n in visited)

        # 농도 가중 커버리지: 고농도 지점 청소 시 커버리지 및 저감 기여도 비례 반영
        coverage = min(1.0, visited_pm10 / total_pm10) if total_pm10 > 0 else (visited_count / total_count if total_count > 0 else 0.0)
        pm_before = total_pm10 / total_count if total_count > 0 else 0.0
        effective_reduction = beta * coverage
        pm_after = pm_before * (1.0 - effective_reduction)
        dong_rows.append({
            'district': district,
            'dong': dong,
            'candidate_count': total_count,
            'visited_candidate_count': visited_count,
            'coverage_ratio': coverage,
            'coverage_pct': coverage * 100.0,
            'pm10_before_proxy': pm_before,
            'pm10_after_proxy': pm_after,
            'effective_reduction_pct': effective_reduction * 100.0,
        })

    if not dong_rows:
        raise ValueError('구역 내 행정동 청소 후보 거점이 없습니다.')

    weight = math.fsum(r['candidate_count'] for r in dong_rows)
    before = math.fsum(r['pm10_before_proxy'] * r['candidate_count'] for r in dong_rows) / weight if weight > 0 else 0.0
    after = math.fsum(r['pm10_after_proxy'] * r['candidate_count'] for r in dong_rows) / weight if weight > 0 else 0.0
    reduction = (before - after) / before * 100.0 if before > 0 else 0.0
    avg_coverage = math.fsum(r['coverage_ratio'] * r['candidate_count'] for r in dong_rows) / weight if weight > 0 else 0.0
    affected_count = len([r for r in dong_rows if r['visited_candidate_count'] > 0])

    return {
        'before_pm10_proxy': round(before, 3),
        'after_pm10_proxy': round(after, 3),
        'reduction_pct': round(reduction, 3),
        'display_change_pct': round(-reduction, 3),
        'route_length_km': round(float(route_length_km), 3),
        'affected_dong_count': affected_count,
        'mean_coverage_ratio': round(avg_coverage, 5),
        'mean_coverage_pct': round(avg_coverage * 100.0, 3),
        'dong_effects': [
            {
                **r,
                'coverage_ratio': round(r['coverage_ratio'], 5),
                'coverage_pct': round(r['coverage_pct'], 3),
                'pm10_before_proxy': round(r['pm10_before_proxy'], 3),
                'pm10_after_proxy': round(r['pm10_after_proxy'], 3),
                'effective_reduction_pct': round(r['effective_reduction_pct'], 3),
            }
            for r in dong_rows
        ],
    }


def evaluate_proxy_routes(existing_routes, zone_id, ai_points, ai_length_km,
                          candidate_nodes, observation_context):
    """A/B/C/AI를 행정동별 청소 후보 거점 커버리지로 비교한다."""
    selected = [r for r in existing_routes
                if int(r.get('zone_id', 0)) == int(zone_id)
                and r.get('course_code') in ('A', 'B', 'C')]
    by_course = {r.get('course_code'): r for r in selected}
    if set(by_course) != {'A', 'B', 'C'}:
        raise ValueError('효과 비교에는 해당 구역의 기존 A/B/C 3개 경로가 모두 필요합니다.')

    route_points = {k: by_course[k].get('points') or [] for k in 'ABC'}
    route_points['AI'] = ai_points or []
    if any(len(route_points[k]) < 2 for k in ('A', 'B', 'C', 'AI')):
        raise ValueError('A/B/C/AI 경로 중 좌표가 부족한 경로가 있습니다.')

    candidates = _prepare_candidates(candidate_nodes)
    if not candidates:
        raise ValueError('행정동 커버리지를 계산할 PM10 후보 거점이 없습니다.')

    beta = float(official_reference_model()['beta'])
    route_lengths = {
        'A': float(by_course['A']['length_km']),
        'B': float(by_course['B']['length_km']),
        'C': float(by_course['C']['length_km']),
        'AI': float(ai_length_km),
    }

    results = {}
    for label in ('A', 'B', 'C', 'AI'):
        results[label] = _route_effect(route_points[label], route_lengths[label], candidates, beta)

    abc_mean_reduction = math.fsum(results[k]['reduction_pct'] for k in 'ABC') / 3.0
    ai_reduction = results['AI']['reduction_pct']
    abc_mean_distance = math.fsum(route_lengths[k] for k in 'ABC') / 3.0
    relative = ((ai_reduction / abc_mean_reduction) - 1) * 100 if abc_mean_reduction > 0 else None

    return {
        'status': 'dong_coverage_pm10_proxy_scenario_not_air_quality_prediction',
        'display_name': '행정동 청소 커버리지 기반 PM10 대리지표 시뮬레이션',
        'endpoint': 'ambient_idw_pm10_proxy_on_affected_dongs',
        'coefficient': beta,
        'coefficient_origin': 'MOE_Keco_reported_dust_suction_vehicle_type_mean_2023_04_26',
        'observation_context': observation_context,
        'coverage_method': 'candidate_node_coverage_within_0.2km_of_route',
        'coverage_match_radius_km': MATCH_RADIUS_KM,
        'coverage_denominator': 'eligible_cleaning_candidate_nodes_in_each_affected_dong',
        'aggregation_scope': 'affected_dongs_only_not_entire_zone',
        'routes': results,
        'abc_mean_distance_km': round(abc_mean_distance, 3),
        'abc_mean_reduction_pct': round(abc_mean_reduction, 3),
        'ai_improvement_pct': round(relative, 3) if relative is not None else None,
        'ai_difference_percentage_points': round(ai_reduction - abc_mean_reduction, 3),
        'warning': (
            '43.3%를 행정동 전체에 일괄 적용하지 않고, 행정동별 후보 청소거점 커버리지에 비례해 적용한 '
            '도시대기 IDW 대리지표 시뮬레이션입니다. 실제 대기농도 저감 예측이나 도로 총연장 실측 커버리지가 아닙니다.'
        ),
    }

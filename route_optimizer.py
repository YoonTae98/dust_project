"""
route_optimizer.py
대구광역시 1~13 전 구간 (13개 도심 생활·산단 권역)
실시간 대기현황(air.daegu.go.kr) 기반 분진흡입차량 동적 최적 노선 생성 진입점 및 지리 공간 엔진
"""

import json
import math
import os
import sys
import urllib.request
import urllib.parse
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import collector
import single_route

# ==============================================================================
# 1~13 전 구간 지리적 경계 폴리곤 로드 및 공간 연산
# ==============================================================================
ZONE_BOUNDARY_GEOJSON_PATH = os.path.join(os.path.dirname(__file__), 'static', 'data', 'daegu_15_urban_zones.geojson')
ZONE1_BOUNDARY_GEOJSON_PATH = ZONE_BOUNDARY_GEOJSON_PATH  # 하위 호환 별칭
ZONE_POLYGONS = {}      # zone_id(int) -> 외곽 링 [[lng, lat], ...]
ZONE_NAMES = {}         # zone_id(int) -> 구간명

try:
    if os.path.exists(ZONE_BOUNDARY_GEOJSON_PATH):
        with open(ZONE_BOUNDARY_GEOJSON_PATH, 'r', encoding='utf-8') as f:
            _gj = json.load(f)
        for _feat in _gj.get('features', []):
            _props = _feat.get('properties', {})
            _geom = _feat.get('geometry', {})
            _ring = []
            if _geom.get('type') == 'Polygon':
                _ring = _geom.get('coordinates', [[]])[0]
            elif _geom.get('type') == 'MultiPolygon':
                _ring = _geom.get('coordinates', [[[]]])[0][0]
            try:
                _zid = int(_props.get('zone_id'))
            except (TypeError, ValueError):
                continue
            ZONE_POLYGONS[_zid] = _ring
            ZONE_NAMES[_zid] = _props.get('name', f"{_zid}구간")
        print(f"[RouteOptimizer] 구간 경계 폴리곤 로드 성공: {len(ZONE_POLYGONS)}개 구간")
except Exception as _e:
    print(f"[RouteOptimizer] 구간 경계 폴리곤 로드 실패 ({_e})")


def polygon_centroid_anchor(poly):
    """폴리곤 내부 안전 앵커(lat, lng): 버텍스 평균에 가장 가까운 내부 격자점"""
    if not poly:
        return 35.8480, 128.5020
    c_lat = sum(p[1] for p in poly) / len(poly)
    c_lng = sum(p[0] for p in poly) / len(poly)
    if point_in_zone_polygon(c_lat, c_lng, poly):
        return c_lat, c_lng
    min_lng = min(p[0] for p in poly); max_lng = max(p[0] for p in poly)
    min_lat = min(p[1] for p in poly); max_lat = max(p[1] for p in poly)
    best, best_d = (c_lat, c_lng), float('inf')
    for i in range(41):
        for j in range(41):
            la = min_lat + (max_lat - min_lat) * i / 40.0
            ln = min_lng + (max_lng - min_lng) * j / 40.0
            d = (la - c_lat) ** 2 + (ln - c_lng) ** 2
            if d < best_d and point_in_zone_polygon(la, ln, poly):
                best, best_d = (la, ln), d
    return best


def point_in_zone_polygon(lat, lng, poly):
    """점 (lat, lng)이 지정 폴리곤 내부인지 판별 (Ray Casting)"""
    if not poly:
        return True  # 폴리곤 미로드 시 허용
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if lat > min(p1y, p2y):
            if lat <= max(p1y, p2y):
                if lng <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (lat - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or lng <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# 하위 호환 별칭
point_in_zone1_polygon = point_in_zone_polygon


def haversine_km(lat1, lon1, lat2, lon2):
    """두 좌표 간 구면 직선거리 계산 (km)"""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ==============================================================================
# 1~13 전 구간 폴리곤 기반 격자 도로 거점 자동 생성 및 캐싱
# ==============================================================================
ZONE_NODES_DIR = os.path.join(os.path.dirname(__file__), 'data', 'zone_nodes')
GENERIC_NODE_MAX = 66
GENERIC_NODE_MIN = 15
_ZONE_NODE_LOCK = threading.Lock()
_ZONE_NODE_MEM = {}
_DONG_CENTROIDS = None


def _nearest_dong(lat, lng):
    global _DONG_CENTROIDS
    if _DONG_CENTROIDS is None:
        try:
            _DONG_CENTROIDS = collector.load_dong_centroids() or []
        except Exception:
            _DONG_CENTROIDS = []
    best, best_d = None, float('inf')
    for d in _DONG_CENTROIDS:
        dd = (d['lat'] - lat) ** 2 + ((d['lng'] - lng) * 0.82) ** 2
        if dd < best_d:
            best, best_d = d, dd
    return (best['dong'], best.get('district', '')) if best else ('', '')


def _grid_nodes_in_polygon(poly, scale):
    min_lng = min(p[0] for p in poly); max_lng = max(p[0] for p in poly)
    min_lat = min(p[1] for p in poly); max_lat = max(p[1] for p in poly)
    step_lat, step_lng = 0.0036 * scale, 0.0044 * scale
    pts = []
    lat = min_lat + step_lat / 2
    while lat <= max_lat:
        lng = min_lng + step_lng / 2
        while lng <= max_lng:
            if all(point_in_zone_polygon(lat + dy, lng + dx, poly)
                   for dy, dx in ((0, 0), (0.0012, 0), (-0.0012, 0), (0, 0.0012), (0, -0.0012))):
                pts.append((round(lat, 6), round(lng, 6)))
            lng += step_lng
        lat += step_lat
    return pts


def _osrm_nearest(lat, lng):
    url = f"http://router.project-osrm.org/nearest/v1/driving/{lng},{lat}?number=1"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=8) as r:
        wp = json.loads(r.read().decode('utf-8'))['waypoints'][0]
    return {'lng': wp['location'][0], 'lat': wp['location'][1],
            'dist': wp.get('distance', 9999), 'road': wp.get('name', '')}


def build_generic_zone_nodes(zone_id):
    """구간 폴리곤 내부 격자 → OSRM 실제 도로 스냅 → 산/고속도로/경계근접/중복 제거"""
    poly = ZONE_POLYGONS.get(zone_id)
    if not poly:
        return None
    scale = 1.0
    pts = _grid_nodes_in_polygon(poly, scale)
    for _ in range(25):
        if len(pts) > GENERIC_NODE_MAX * 1.6:
            scale *= 1.18
        elif len(pts) < GENERIC_NODE_MIN and scale > 0.4:
            scale *= 0.85
        else:
            break
        pts = _grid_nodes_in_polygon(poly, scale)

    def _snap(p):
        for _ in range(2):
            try:
                return _osrm_nearest(p[0], p[1])
            except Exception:
                continue
        return None

    with ThreadPoolExecutor(max_workers=6) as ex:
        snaps = list(ex.map(_snap, pts))
    if snaps and sum(1 for s in snaps if s is None) > len(snaps) * 0.3:
        return None

    kept = []
    for s in snaps:
        if s is None or s['dist'] > 180:
            continue
        # 고속도로 / 자동차전용도로 / 램프 배제
        if any(k in s.get('road', '') for k in HIGHWAY_EXCLUDE_KEYWORDS):
            continue
        # 경계선 끝자락에서 외부 시외/타 구역 교차로로 나가는 유턴 이탈을 원천 차단하기 위한 250m 안전 버퍼
        if not all(point_in_zone_polygon(s['lat'] + dy, s['lng'] + dx, poly)
                   for dy, dx in ((0, 0), (0.0025, 0), (-0.0025, 0), (0, 0.0030), (0, -0.0030),
                                  (0.0018, 0.0020), (0.0018, -0.0020), (-0.0018, 0.0020), (-0.0018, -0.0020))):
            continue
        if any(haversine_km(s['lat'], s['lng'], k['lat'], k['lng']) < 0.2 for k in kept):
            continue
        kept.append(s)

    nodes = []
    for i, s in enumerate(kept, 1):
        dong, district = _nearest_dong(s['lat'], s['lng'])
        road = s.get('road') or ''
        nodes.append({
            'id': f"Z{zone_id}-G{i:03d}",
            'name': f"{dong} {road}".strip() if road else f"{dong} 생활도로",
            'lat': round(s['lat'], 6), 'lng': round(s['lng'], 6),
            'dong': dong, 'district': district,
            'type': 'urban_grid',
            'road_name': road or f"{dong} 생활도로",
            'traffic_factor': 1.30 if '대로' in road else 1.15,
            'vulnerability_factor': 1.20,
            'preferred_station': 'idw',
            'zone_generic': True,
            'desc': f"{zone_id}구간 도로망 격자 순회 거점"
        })
    return nodes


def get_zone_candidate_nodes(zone_id):
    """1~13 전 구간 공통 후보 거점 목록 반환 (폴리곤 격자 자동생성 + 파일 캐시)."""
    zone_id = int(zone_id)
    with _ZONE_NODE_LOCK:
        if zone_id in _ZONE_NODE_MEM:
            return _ZONE_NODE_MEM[zone_id]
        path = os.path.join(ZONE_NODES_DIR, f"zone{zone_id}.json")
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    nodes = json.load(f)
                _ZONE_NODE_MEM[zone_id] = nodes
                return nodes
            except Exception:
                pass
        nodes = build_generic_zone_nodes(zone_id)
        if nodes:
            try:
                os.makedirs(ZONE_NODES_DIR, exist_ok=True)
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(nodes, f, ensure_ascii=False)
            except Exception:
                pass
            _ZONE_NODE_MEM[zone_id] = nodes
        return nodes or []


# ==============================================================================
# 도로 필터링 헬퍼 & 고속도로/자동차전용도로 제외 규칙
# ==============================================================================
HIGHWAY_EXCLUDE_KEYWORDS = (
    '고속', '고속도로', '고속국도', '도시고속', '순환고속',
    '신천대로', '앞산순환', '신천동로', '대구외곽',
    'IC', 'JC', 'TG', '분기점', '나들목', '톨게이트', '램프'
)


def _is_major_road(road_name):
    """
    간선·보조간선 도로인 '~~대로' 및 '~~로'만 허용하고 좁은 골목 '~~길' 및 고속도로는 완전 배제
    """
    if not road_name:
        return False
    rn = road_name.strip()

    # 1. 좁은 골목 '길' 배제
    if '길' in rn:
        return False

    # 2. 고속도로 및 자동차전용도로/IC 배제
    if any(k in rn for k in HIGHWAY_EXCLUDE_KEYWORDS):
        return False

    # 3. 비정형 골목/소로 배제
    if any(k in rn for k in ('골목', '생활도로', '마을도로', '이면도로', '소로')):
        return False

    segments = [s.strip() for s in rn.split('/')]
    for seg in segments:
        words = seg.split()
        if not words:
            continue
        filtered_words = [w for w in words if w not in ('동부', '서부', '남부', '북부', '중부', '중심', '내부연결로', '서측', '동측', '남측', '북측')]
        if not filtered_words:
            filtered_words = words
        last_word = filtered_words[-1]
        if last_word in ('도로', '통행로'):
            continue
        if last_word.endswith('대로') or last_word.endswith('로'):
            return True

    return False


# ==============================================================================
# 실시간 동적 노선 생성 진입점 (single_route 위임)
# ==============================================================================
def generate_dynamic_zone_route(zone_id=1, date_str=None, hour_str=None):
    """논문 OP 구조를 적용한 단일 경로 진입점 (single_route.py 위임)"""
    return single_route.generate(sys.modules[__name__], zone_id, date_str, hour_str)


def generate_dynamic_zone1_route(date_str=None, hour_str=None):
    """하위 호환: 1구간 전용 진입점"""
    return generate_dynamic_zone_route(1, date_str=date_str, hour_str=hour_str)


if __name__ == '__main__':
    target_zid = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(f"=== [RouteOptimizer] {target_zid}구간 실시간 동적 최적 노선 생성 테스트 ===")
    res = generate_dynamic_zone_route(target_zid)
    if res.get('success'):
        print(f"[성공] 구간명: {res['zone_name']}")
        print(f"       생성시각: {res.get('generated_at')}")
        fs = res.get('fleet_summary', {})
        meth = res.get('methodology', {})
        print(f"       총 주행거리: {fs.get('total_fleet_dist_km')}km (거리 예산: {meth.get('target_distance_km')}km)")
        print(f"       방문 거점수: {meth.get('visited_count')} / {meth.get('candidate_count')}개 거점")
        print(f"       방문 점수(Reward): {meth.get('reward_score')}점")
    else:
        print(f"[실패] {res.get('message')}")

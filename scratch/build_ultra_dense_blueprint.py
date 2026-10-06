import json
import urllib.request
import os
import math

def get_osrm_route(p1, p2):
    """OSRM 라우팅으로 실제 도로 궤적 추출 (실패 시 선형 보간)"""
    url = f"http://router.project-osrm.org/route/v1/driving/{p1[1]},{p1[0]};{p2[1]},{p2[0]}?overview=full&geometries=geojson"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as res:
            d = json.loads(res.read().decode('utf-8'))
            if d.get('routes') and len(d['routes']) > 0:
                coords = d['routes'][0]['geometry']['coordinates']
                return [[round(c[1], 6), round(c[0], 6)] for c in coords]
    except Exception:
        pass
    # 선형 분할 보간 (부드러운 라인)
    steps = 4
    pts = []
    for s in range(steps + 1):
        t = s / float(steps)
        lat = p1[0] + (p2[0] - p1[0]) * t
        lng = p1[1] + (p2[1] - p1[1]) * t
        pts.append([round(lat, 6), round(lng, 6)])
    return pts

def build_dense_multiline(segment_tuples):
    multiline = []
    for p1, p2 in segment_tuples:
        seg_coords = get_osrm_route(p1, p2)
        multiline.append(seg_coords)
    return multiline

def flatten_multiline(multiline):
    flat = []
    for line in multiline:
        if not flat:
            flat.extend(line)
        else:
            flat.extend(line[1:])
    return flat

print("1. Generating ULTRA-DENSE Grid Network for Blueprint Route...")

# ==============================================================================
# 1. D노선 (74.4km, 녹색 #10b981) - 성서1차 호림동 초밀집 바둑판 격자망
# ==============================================================================
# 가로선 9개, 세로선 6개로 아주 촘촘한 사각 바둑판 격자 구현
d_lats = [35.8455, 35.8440, 35.8425, 35.8410, 35.8395, 35.8380, 35.8365, 35.8350, 35.8335]
d_lngs = [128.4865, 128.4882, 128.4900, 128.4918, 128.4932, 128.4945]

d_segments = []
# 가로선들
for lat in d_lats:
    d_segments.append(((lat, d_lngs[0]), (lat, d_lngs[-1])))
# 세로선들
for lng in d_lngs:
    d_segments.append(((d_lats[0], lng), (d_lats[-1], lng)))
# 외곽 테두리 강조선
d_segments.append(((35.8455, 128.4865), (35.8335, 128.4865))) # 서측 호산동로
d_segments.append(((35.8335, 128.4865), (35.8335, 128.4945))) # 남측 호림남로
d_segments.append(((35.8335, 128.4945), (35.8455, 128.4945))) # 동측 달서대로 서편
d_segments.append(((35.8455, 128.4945), (35.8455, 128.4865))) # 북측 공단북로


# ==============================================================================
# 2. E노선 (78.8km, 자주색 #d946ef) - 성서2차 갈산동 초밀집 격자 + 대천·월암 연장선
# ==============================================================================
e_lats = [35.8475, 35.8455, 35.8435, 35.8415, 35.8395, 35.8375, 35.8355]
e_lngs = [128.4975, 128.5005, 128.5035, 128.5065, 128.5095, 128.5125, 128.5150]

e_segments = []
# 갈산동 가로선들
for lat in e_lats:
    e_segments.append(((lat, e_lngs[0]), (lat, e_lngs[-1])))
# 갈산동 세로선들
for lng in e_lngs:
    e_segments.append(((e_lats[0], lng), (e_lats[-1], lng)))

# 남부 대천·월암 3차 산단 연장망 (도면 하단 핑크색 사다리꼴/격자 연장선)
e_south_lats = [35.8330, 35.8290, 35.8250, 35.8210, 35.8160]
e_south_lngs = [128.4980, 128.5040, 128.5080, 128.5130]

# 남부 가로선
for slat in e_south_lats:
    e_segments.append(((slat, e_south_lngs[0]), (slat, e_south_lngs[-1])))
# 남부 세로 관통선 (성서로 남부 연장대로 & 달서대로 남부 연장대로)
e_segments.append(((35.8355, 128.5080), (35.8160, 128.5080))) # 성서남로 메인
e_segments.append(((35.8355, 128.4980), (35.8210, 128.4980))) # 서측 관통선
e_segments.append(((35.8355, 128.5130), (35.8210, 128.5130))) # 동측 관통선
# 남서 경사 회차선 (도면 하단 쐐기형 선로)
e_segments.append(((35.8160, 128.5080), (35.8260, 128.4940)))
e_segments.append(((35.8260, 128.4940), (35.8355, 128.4980)))


# ==============================================================================
# 3. C노선 (67.5km, 보라색 #8b5cf6) - 신당·이곡 주거격자 + 집중관리구역 + 용산 블록
# ==============================================================================
c_segments = []

# (1) 집중관리구역 (계명대역 앞 노란 빗금 영역)
c_segments.append(((35.8540, 128.4900), (35.8525, 128.5040))) # 달구벌대로 메인
c_segments.append(((35.8505, 128.4900), (35.8505, 128.4980))) # 남단 횡단선
c_segments.append(((35.8540, 128.4900), (35.8505, 128.4900))) # 서단 종단선
c_segments.append(((35.8530, 128.4945), (35.8490, 128.4945))) # 달서대로 북단
c_segments.append(((35.8520, 128.4980), (35.8490, 128.4980))) # 중간 종단선

# (2) 신당동 / 이곡동 북부 촘촘한 가로세로망
c_north_lats = [35.8545, 35.8570, 35.8595, 35.8620, 35.8645]
c_north_lngs = [128.4920, 128.4965, 128.5015, 128.5065, 128.5115, 128.5160]

for clat in c_north_lats:
    c_segments.append(((clat, c_north_lngs[0]), (clat, c_north_lngs[-1])))
for clng in c_north_lngs:
    c_segments.append(((c_north_lats[0], clng), (c_north_lats[-1], clng)))

# (3) 우측 용산동 사각 격자 블록 (도면 우측 보라색 바둑판 블록)
# 외곽 루프
c_segments.append(((35.8565, 128.5190), (35.8565, 128.5265))) # 북단
c_segments.append(((35.8565, 128.5265), (35.8475, 128.5265))) # 동단
c_segments.append(((35.8475, 128.5265), (35.8475, 128.5190))) # 남단
c_segments.append(((35.8475, 128.5190), (35.8565, 128.5190))) # 서단
# 내부 촘촘한 십자 및 격자선
c_segments.append(((35.8520, 128.5190), (35.8520, 128.5265))) # 중간 가로 1
c_segments.append(((35.8495, 128.5190), (35.8495, 128.5265))) # 중간 가로 2
c_segments.append(((35.8545, 128.5190), (35.8545, 128.5265))) # 중간 가로 3
c_segments.append(((35.8565, 128.5228), (35.8475, 128.5228))) # 중간 세로 1


# ==============================================================================
# 4. 간선축 노선 (62.3km, 파란색 #2563eb) - 달서대로 종단선 & 성서공단로 횡단선
# ==============================================================================
blue_segments = [
    # 달서대로 메인 종단축 (신당네거리 ~ 계명대 ~ 호림 ~ 유천교)
    ((35.8580, 128.4942), (35.8440, 128.4942)),
    ((35.8440, 128.4942), (35.8340, 128.4942)),
    ((35.8340, 128.4942), (35.8200, 128.4942)),
    # 성서공단로 동서 횡단축 (호림서단 ~ 달서대로 ~ 갈산중앙 ~ 장동대로)
    ((35.8430, 128.4850), (35.8430, 128.4942)),
    ((35.8430, 128.4942), (35.8430, 128.5065)),
    ((35.8430, 128.5065), (35.8430, 128.5180)),
    # 남부 횡단 보조간선축 (성서남로)
    ((35.8380, 128.4870), (35.8380, 128.5150)),
]


# ==============================================================================
# 5. 세천 지선 노선 (64.0km, 빨간색 #ef4444) - 금호강 너머 세천산단 순환 회랑
# ==============================================================================
red_segments = [
    ((35.8540, 128.4908), (35.8620, 128.4820)), # 다사로 북서 진입
    ((35.8620, 128.4820), (35.8680, 128.4730)), # 세천교 통과
    ((35.8680, 128.4730), (35.8750, 128.4710)), # 세천로 북단
    ((35.8750, 128.4710), (35.8760, 128.4630)), # 세천산단 북서단
    ((35.8760, 128.4630), (35.8690, 128.4640)), # 세천서로 남하
    ((35.8690, 128.4640), (35.8640, 128.4680)), # 다사체육공원 축
    ((35.8640, 128.4680), (35.8590, 128.4670)), # 대실역 방면
    ((35.8590, 128.4670), (35.8540, 128.4760)), # 강창교 통과 회차
    ((35.8540, 128.4760), (35.8540, 128.4908)), # 계명대로 복귀
]

print(f"D segments: {len(d_segments)}, E segments: {len(e_segments)}, C segments: {len(c_segments)}")
print("Building multiline polylines via OSRM...")

d_lines = build_dense_multiline(d_segments)
e_lines = build_dense_multiline(e_segments)
c_lines = build_dense_multiline(c_segments)
blue_lines = build_dense_multiline(blue_segments)
red_lines = build_dense_multiline(red_segments)

blueprint_data = {
    'D': {
        'code': 'D',
        'name': '1구간 D노선 (성서1차 호림동 바둑판 격자망)',
        'length_km': 74.4,
        'color': '#10b981',
        'multi_lines': d_lines,
        'flat': flatten_multiline(d_lines)
    },
    'E': {
        'code': 'E',
        'name': '1구간 E노선 (성서2차 갈산동 바둑판 격자 및 대천 연장망)',
        'length_km': 78.8,
        'color': '#d946ef',
        'multi_lines': e_lines,
        'flat': flatten_multiline(e_lines)
    },
    'C': {
        'code': 'C',
        'name': '1구간 C노선 (신당·이곡 주거격자 및 집중관리구역)',
        'length_km': 67.5,
        'color': '#8b5cf6',
        'multi_lines': c_lines,
        'flat': flatten_multiline(c_lines)
    },
    'BLUE': {
        'code': '간선축',
        'name': '1구간 중심간선망 (달서대로 관통선 및 공단로 횡단선)',
        'length_km': 62.3,
        'color': '#2563eb',
        'multi_lines': blue_lines,
        'flat': flatten_multiline(blue_lines)
    },
    'RED': {
        'code': '세천지선',
        'name': '1구간 세천산단순회선 (성서5차 세천·다사 회랑망)',
        'length_km': 64.0,
        'color': '#ef4444',
        'multi_lines': red_lines,
        'flat': flatten_multiline(red_lines)
    }
}

os.makedirs('data', exist_ok=True)
with open('data/zone1_blueprint_routes.json', 'w', encoding='utf-8') as f:
    json.dump(blueprint_data, f, ensure_ascii=False, indent=2)

print("Saved ultra-dense blueprint data to data/zone1_blueprint_routes.json!")

# daegu_routes.json에 바로 반영
with open('data/daegu_routes.json', 'r', encoding='utf-8') as f:
    routes_json = json.load(f)

# 1구간 관련 노선 업데이트
# 기존 routes 목록에서 1구간 노선들(ZR-01-D, E, C, BLUE, RED)을 새 데이터로 교체
other_routes = [r for r in routes_json['routes'] if not str(r.get('zone_id', '')) == '1']

zone1_new_routes = [
    {
        "id": "ZR-01-D",
        "zone_id": 1,
        "zone_code": "Z01-D",
        "name": blueprint_data['D']['name'],
        "course_code": "D",
        "district": "달서구",
        "length_km": 74.4,
        "color": "#10b981",
        "traffic_level": "매우혼잡",
        "pm10_before": 78,
        "pm10_after_clean": 48,
        "points": blueprint_data['D']['flat'],
        "multi_lines": blueprint_data['D']['multi_lines'],
        "description": "성서산단 1차 호림동 가로 9열 × 세로 6열 초밀집 직사각형 바둑판 격자 노선"
    },
    {
        "id": "ZR-01-E",
        "zone_id": 1,
        "zone_code": "Z01-E",
        "name": blueprint_data['E']['name'],
        "course_code": "E",
        "district": "달서구",
        "length_km": 78.8,
        "color": "#d946ef",
        "traffic_level": "혼잡",
        "pm10_before": 84,
        "pm10_after_clean": 51,
        "points": blueprint_data['E']['flat'],
        "multi_lines": blueprint_data['E']['multi_lines'],
        "description": "성서산단 2차 갈산동 가로 7열 × 세로 7열 바둑판 격자 및 남부 대천·월암동 3차 산단 순회망"
    },
    {
        "id": "ZR-01-C",
        "zone_id": 1,
        "zone_code": "Z01-C",
        "name": blueprint_data['C']['name'],
        "course_code": "C",
        "district": "달서구",
        "length_km": 67.5,
        "color": "#8b5cf6",
        "traffic_level": "원활",
        "pm10_before": 72,
        "pm10_after_clean": 45,
        "points": blueprint_data['C']['flat'],
        "multi_lines": blueprint_data['C']['multi_lines'],
        "description": "신당동·이곡동 가로 5열 × 세로 6열 초밀집 주거격자 및 계명대앞 집중관리구역, 용산 사각격자망"
    },
    {
        "id": "ZR-01-MAIN",
        "zone_id": 1,
        "zone_code": "Z01-MAIN",
        "name": blueprint_data['BLUE']['name'],
        "course_code": "간선",
        "district": "달서구",
        "length_km": 62.3,
        "color": "#2563eb",
        "traffic_level": "혼잡",
        "pm10_before": 76,
        "pm10_after_clean": 46,
        "points": blueprint_data['BLUE']['flat'],
        "multi_lines": blueprint_data['BLUE']['multi_lines'],
        "description": "달서대로 남북 관통 축 및 성서공단로 동서 횡단 축"
    },
    {
        "id": "ZR-01-SECHEON",
        "zone_id": 1,
        "zone_code": "Z01-SECHEON",
        "name": blueprint_data['RED']['name'],
        "course_code": "세천",
        "district": "달서구",
        "length_km": 64.0,
        "color": "#ef4444",
        "traffic_level": "보통",
        "pm10_before": 68,
        "pm10_after_clean": 42,
        "points": blueprint_data['RED']['flat'],
        "multi_lines": blueprint_data['RED']['multi_lines'],
        "description": "금호강 건너 다사읍~세천산단 북서 순환 회랑 노선"
    }
]

routes_json['routes'] = zone1_new_routes + other_routes

with open('data/daegu_routes.json', 'w', encoding='utf-8') as f:
    json.dump(routes_json, f, ensure_ascii=False, indent=2)

print("Successfully injected ULTRA-DENSE blueprint routes into data/daegu_routes.json!")

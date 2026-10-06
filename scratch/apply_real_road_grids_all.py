import json
import math
from test_real_road_grid import build_real_road_grid

# 1. daegu_routes.json 로드
with open('data/daegu_routes.json', 'r', encoding='utf-8') as f:
    daegu_data = json.load(f)

# 2. 1구간 노선들은 도면 기반 5개 격자 노선 그대로 보존
zone1_routes = [r for r in daegu_data['routes'] if str(r.get('zone_id')) == '1']
print(f"Preserving {len(zone1_routes)} Zone 1 blueprint routes.")

# 3. 2~13구간 노선 정보 가져오기 (이름, 색상, 관제구 등)
existing_routes = {int(r.get('zone_id', 0)): r for r in daegu_data['routes'] if str(r.get('zone_id')) != '1'}

# 12개 구간 권역 메타 정보 매핑
ZONE_METAS = {
    2: {"name": "2구간 고정노선 (서대구·염색산단 및 평리·비산 바둑판 도로망)", "district": "서구", "color": "#fb7185", "course": "Z02"},
    3: {"name": "3구간 고정노선 (칠곡 메가주거지구 및 팔거천 순회 도로망)", "district": "북구", "color": "#38bdf8", "course": "Z03"},
    4: {"name": "4구간 고정노선 (검단일반산단·종합유통단지·산격 바둑판 도로망)", "district": "북구", "color": "#eab308", "course": "Z04"},
    5: {"name": "5구간 고정노선 (제3공단·침산·원도심 가로세로 도로망)", "district": "중구/북구", "color": "#ec4899", "course": "Z05"},
    6: {"name": "6구간 고정노선 (동대구역세권·신암·공항·이시아폴리스 도로망)", "district": "동구", "color": "#8b5cf6", "course": "Z06"},
    7: {"name": "7구간 고정노선 (신서혁신도시·안심·율하지구 사각 도로망)", "district": "동구", "color": "#06b6d4", "course": "Z07"},
    8: {"name": "8구간 고정노선 (달구벌대로·범어·만촌·수성알파시티 도로망)", "district": "수성구", "color": "#f97316", "course": "Z08"},
    9: {"name": "9구간 고정노선 (대명·봉덕 주거격자 및 지산·범물 도로망)", "district": "남구/수성구", "color": "#6366f1", "course": "Z09"},
    10: {"name": "10구간 고정노선 (월배신도시·진천·상인·대곡2 도로망)", "district": "달서구", "color": "#a855f7", "course": "Z10"},
    11: {"name": "11구간 고정노선 (달성북부 다사·대실·세천산단 순환 도로망)", "district": "달성군", "color": "#3b82f6", "course": "Z11"},
    12: {"name": "12구간 고정노선 (논공일반산단 공단격자 및 화원·옥포 도로망)", "district": "달성군", "color": "#0284c7", "course": "Z12"},
    13: {"name": "13구간 고정노선 (유가테크노폴리스 & 대구국가산단 도로망)", "district": "달성군", "color": "#14b8a6", "course": "Z13"}
}

new_routes = list(zone1_routes)

for zid in range(2, 14):
    grid_info = build_real_road_grid(zid)
    meta = ZONE_METAS.get(zid, {})
    old_r = existing_routes.get(zid, {})

    route_name = meta.get('name') or old_r.get('name', f"{zid}구간 고정노선")
    route_color = meta.get('color') or old_r.get('color', '#a855f7')
    district = meta.get('district') or old_r.get('district', '대구광역시')
    course_code = meta.get('course', f"Z{zid:02d}")

    route_obj = {
        "id": f"ZR-{zid:02d}",
        "zone_id": zid,
        "zone_code": f"Z{zid:02d}",
        "name": route_name,
        "course_code": course_code,
        "district": district,
        "length_km": grid_info['total_km'],
        "color": route_color,
        "traffic_level": old_r.get('traffic_level', '보통'),
        "pm10_before": old_r.get('pm10_before', 70),
        "pm10_after_clean": old_r.get('pm10_after_clean', 42),
        "points": grid_info['flat_points'],
        "multi_lines": grid_info['multi_lines'],
        "description": f"{district} 실제 주요 도로망({grid_info['h_count']}개 가로축, {grid_info['v_count']}개 세로축)을 따라 촘촘하게 순회하는 정기 고정 노선"
    }
    new_routes.append(route_obj)
    print(f"Updated Zone {zid:02d}: {route_name} ({grid_info['total_km']}km, {len(grid_info['multi_lines'])}개 실제 도로 세그먼트)")

daegu_data['routes'] = new_routes

with open('data/daegu_routes.json', 'w', encoding='utf-8') as f:
    json.dump(daegu_data, f, ensure_ascii=False, indent=2)

print("\nSuccessfully updated data/daegu_routes.json with real road grids for all zones!")

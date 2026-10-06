import sys
import io
import json
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
import route_optimizer
from route_optimizer import _is_major_road

print("================================================================================")
print("  [더미 노선 데이터 전수 갱신] '~~길' 100% 배제 및 '~~대로/~~로' 간선 정기 고정노선 생성")
print("================================================================================")

# 1. 기존 daegu_routes.json 로드
with open('data/daegu_routes.json', 'r', encoding='utf-8') as f:
    daegu_data = json.load(f)

date_demo = '2026-03-24'
hour_demo = '14'

DISTRICT_MAP = {
    1: '달서구', 2: '서구', 3: '북구', 4: '북구', 5: '중구/북구',
    6: '동구', 7: '동구', 8: '수성구', 9: '남구/수성구', 10: '달서구',
    11: '달성군', 12: '달성군', 13: '달성군'
}

COURSE_CONFIG = {
    1: {'code': 'A', 'color': '#ef4444', 'label': '더미데이터 A'},
    2: {'code': 'B', 'color': '#f97316', 'label': '더미데이터 B'},
    3: {'code': 'C', 'color': '#a855f7', 'label': '더미데이터 C'}
}

new_routes = []
total_gil_detected = 0

for zid in range(1, 14):
    print(f"\n▶ [{zid}구간 더미데이터 생성 및 검증]")
    res = route_optimizer.generate_dynamic_zone_route(zid, date_str=date_demo, hour_str=hour_demo)
    if not res.get('success'):
        print(f"  ❌ {zid}구간 생성 실패: {res.get('message')}")
        continue

    district = DISTRICT_MAP.get(zid, '대구광역시')
    fleet_routes = res.get('fleet_routes', [])
    zone_name = res.get('zone_name', f'{zid}구간')

    for v_idx, v_route in enumerate(fleet_routes[:3]):
        v_num = v_idx + 1
        cfg = COURSE_CONFIG.get(v_num, {'code': 'A', 'color': '#ef4444', 'label': f'더미데이터 {v_num}'})
        
        # 도로명 '길' 포함 여부 전수 체크
        stops = v_route.get('stops', [])
        road_names = [s.get('road_name', '') for s in stops]
        gil_in_stops = [r for r in road_names if '길' in r or '골목' in r]
        
        if gil_in_stops:
            print(f"  ⚠️ {zid}구간 {cfg['code']}코스 '길' 발견: {gil_in_stops}")
            total_gil_detected += len(gil_in_stops)
        else:
            print(f"  ✅ {zid}구간 {cfg['label']} ({len(stops)}개 거점, {v_route.get('total_dist_km')}km) -> 100% '~~대로/~~로' 통과")

        dist_km = v_route.get('total_dist_km', 0.0)
        pts = v_route.get('points', [])
        pm10_before = int(round(v_route.get('avg_target_pm10', 65)))
        pm10_after = int(round(pm10_before * 0.52))

        route_item = {
            "id": f"DEMO-ZR-{zid:02d}-V{v_num}",
            "zone_id": zid,
            "zone_code": f"Z{zid:02d}",
            "name": f"{zid}구간 {cfg['label']}",
            "course_code": cfg['code'],
            "district": district,
            "length_km": dist_km,
            "color": cfg['color'],
            "traffic_level": "보통",
            "pm10_before": pm10_before,
            "pm10_after_clean": pm10_after,
            "points": pts,
            "description": f"2026-03-24 대기 데모 기준 {zid}구간 {cfg['label']} (거리: {dist_km}km)"
        }
        new_routes.append(route_item)

print(f"\n================================================================================")
print(f"  총 생성된 더미 노선: {len(new_routes)}개 (기존 39개와 100% 매칭)")
print(f"  경유지 중 '길' 검출 건수: {total_gil_detected}건")
print("================================================================================")

if total_gil_detected == 0 and len(new_routes) == 39:
    daegu_data['routes'] = new_routes
    with open('data/daegu_routes.json', 'w', encoding='utf-8') as f:
        json.dump(daegu_data, f, ensure_ascii=False, indent=2)
    print("✨ data/daegu_routes.json 파일에 '~~길' 배제 정제 노선이 성공적으로 저장되었습니다!")
else:
    print("❌ 검증에 실패하여 파일을 저장하지 않았습니다.")

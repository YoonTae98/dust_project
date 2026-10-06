import json
import os

with open(r'c:\Users\lgiht\Documents\VacuumsweeperPath\data\zone1_blueprint_routes.json', 'r', encoding='utf-8') as f:
    bp = json.load(f)

with open(r'c:\Users\lgiht\Documents\VacuumsweeperPath\data\daegu_routes.json', 'r', encoding='utf-8') as f:
    daegu = json.load(f)

# 도면 기반 1구간 촘촘한 정기 청소 격자망 노선 (총 연장 347km)
# 1. D노선 (74.4km, 녹색) - 성서1차 호림동 가로세로 바둑판 격자망
d_route = {
    "id": "ZR-01-D",
    "zone_id": 1,
    "zone_code": "Z01-D",
    "name": "1구간 D노선 (성서1차 호림동 바둑판 격자망)",
    "course_code": "D",
    "district": "달서구",
    "length_km": 74.4,
    "color": "#10b981", # 녹색
    "traffic_level": "매우혼잡",
    "pm10_before": 78,
    "pm10_after_clean": 48,
    "points": bp['d_flat'],
    "multi_lines": bp['d_lines'],
    "desc": "호림공원 주변 가로세로 바둑판 격자 도로망을 빈틈없이 촘촘하게 주기 순회하는 고정 경로"
}

# 2. E노선 (78.8km, 자주색/핫핑크) - 성서2차 갈산동 바둑판 격자망 & 남부 연장
e_route = {
    "id": "ZR-01-E",
    "zone_id": 1,
    "zone_code": "Z01-E",
    "name": "1구간 E노선 (성서2차 갈산동 격자망 & 남부 대천·월암 회랑)",
    "course_code": "E",
    "district": "달서구",
    "length_km": 78.8,
    "color": "#d946ef", # 자주색
    "traffic_level": "매우혼잡",
    "pm10_before": 76,
    "pm10_after_clean": 46,
    "points": bp['e_flat'],
    "multi_lines": bp['e_lines'],
    "desc": "갈산공원 주변 가로세로 바둑판 격자 및 남부 월암교·대천동 방면 종단 고정 순회 경로"
}

# 3. C노선 (67.5km, 보라색) - 신당·이곡 주거격자망 & 용산 사각격자
c_route = {
    "id": "ZR-01-C",
    "zone_id": 1,
    "zone_code": "Z01-C",
    "name": "1구간 C노선 (계명대 집중관리구역·신당·이곡·용산 주거격자망)",
    "course_code": "C",
    "district": "달서구",
    "length_km": 67.5,
    "color": "#8b5cf6", # 보라색
    "traffic_level": "보통",
    "pm10_before": 72,
    "pm10_after_clean": 45,
    "points": bp['c_flat'],
    "multi_lines": bp['c_lines'],
    "desc": "계명대 앞 집중관리구역 및 신당동·이곡동·용산동 주거단지 사각 격자 고정 순회 경로"
}

# 4. 간선 중심축 (파란색) - 달서대로 종단선 & 성서공단로 횡단선
blue_route = {
    "id": "ZR-01-MAIN",
    "zone_id": 1,
    "zone_code": "Z01-간선",
    "name": "1구간 간선축 (달서대로 중심 종단선 & 공단로 횡단선)",
    "course_code": "간선",
    "district": "달서구",
    "length_km": 62.3,
    "color": "#2563eb", # 파란색
    "traffic_level": "원활",
    "pm10_before": 68,
    "pm10_after_clean": 42,
    "points": bp['blue_flat'],
    "multi_lines": bp['blue_lines'],
    "desc": "신당네거리~호림~유천네거리를 남북으로 관통하는 달서대로 및 성서공단로 메인 동서 연결축"
}

# 5. 세천산단 순회축 (빨간색) - 다사·세천 성서5차산단 북서축
red_route = {
    "id": "ZR-01-SECHEON",
    "zone_id": 1,
    "zone_code": "Z01-세천",
    "name": "1구간 세천지선 (다사·세천성서5차산단 순회선)",
    "course_code": "세천",
    "district": "달서구",
    "length_km": 64.0,
    "color": "#ef4444", # 빨간색
    "traffic_level": "보통",
    "pm10_before": 70,
    "pm10_after_clean": 44,
    "points": bp['red_flat'],
    "multi_lines": bp['red_lines'],
    "desc": "금호강을 건너 세천일반산단 및 다사 대단지 주거지구를 잇는 북서방면 정기 순회 지선"
}

# 1구간 총 연장 347km의 전체 코스 등록
new_routes = [d_route, e_route, c_route, blue_route, red_route]

for r in daegu['routes']:
    if int(r.get('zone_id', 0)) != 1:
        new_routes.append(r)

daegu['routes'] = new_routes

with open(r'c:\Users\lgiht\Documents\VacuumsweeperPath\data\daegu_routes.json', 'w', encoding='utf-8') as f:
    json.dump(daegu, f, indent=2, ensure_ascii=False)

print("Updated daegu_routes.json with all 5 blueprint grid components (Total 347km network)!")

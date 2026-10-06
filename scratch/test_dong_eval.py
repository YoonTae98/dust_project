import os, sys, json
sys.path.insert(0, os.getcwd())
from shapely.geometry import shape, Point
sys.stdout.reconfigure(encoding='utf-8')

import collector
from route_optimizer import generate_dynamic_zone_route

# 1. Load Dong Polygons
with open('static/data/daegu_dong.geojson', 'r', encoding='utf-8') as f:
    dong_data = json.load(f)

dong_polys = []
for feat in dong_data['features']:
    props = feat.get('properties', {})
    geom = shape(feat['geometry'])
    dist = props.get('district', '')
    dong = props.get('dong', '')
    key = f"{dist}_{dong}"
    dong_polys.append({
        'key': key,
        'name': f"{dist} {dong}",
        'district': dist,
        'dong': dong,
        'geom': geom,
        'bounds': geom.bounds
    })

def get_passed_dongs(points):
    passed = {}
    for pt in points:
        lat, lng = pt[0], pt[1]
        for d in dong_polys:
            b = d['bounds']
            if b[0] <= lng <= b[2] and b[1] <= lat <= b[3]:
                if d['key'] not in passed and d['geom'].contains(Point(lng, lat)):
                    passed[d['key']] = d
    return passed

# 2. Get Realtime Dong IDW Air Data
all_stations = collector.crawl_all_stations_pm10()
dong_air = collector.get_dong_idw_air(all_stations)

# 3. Test Zone 1
routes = collector.get_routes()
zone_id = 1
baseline_route = next(r for r in routes if int(r.get('zone_id', 0)) == zone_id and r.get('course_code') == 'A')
baseline_dongs = get_passed_dongs(baseline_route['points'])

# 4. Generate Dynamic Route
dyn_res = generate_dynamic_zone_route(zone_id)
dyn_route = dyn_res['dynamic_route']
dyn_dongs = get_passed_dongs(dyn_route['points'])

# 5. Calculate Reductions (PM10 * 0.43)
def calc_reduction(dongs_dict):
    total_pm10 = 0.0
    dong_details = []
    for k, d in dongs_dict.items():
        pm10 = dong_air.get(k, {}).get('pm10', 50.0)
        red = pm10 * 0.43
        total_pm10 += red
        dong_details.append({'name': d['name'], 'pm10': pm10, 'reduced': round(red, 2)})
    return round(total_pm10, 2), dong_details

base_total_red, base_details = calc_reduction(baseline_dongs)
dyn_total_red, dyn_details = calc_reduction(dyn_dongs)

diff_red = round(dyn_total_red - base_total_red, 2)
pct_gain = round((diff_red / base_total_red) * 100, 1) if base_total_red > 0 else 0.0

print(f"=== [Zone {zone_id} 비교 결과] ===")
print(f"1. 기존 A노선 ({baseline_route['name']}):")
print(f"   - 주행거리: {baseline_route.get('length_km')}km")
print(f"   - 경유 행정동({len(baseline_dongs)}개): {[d['name'] for d in base_details]}")
print(f"   - 총 PM10 흡입 저감량: {base_total_red}")

print(f"\n2. 실시간 생성 노선 ({dyn_route.get('name')}):")
print(f"   - 주행거리: {dyn_route.get('total_dist_km')}km")
print(f"   - 경유 행정동({len(dyn_dongs)}개): {[d['name'] for d in dyn_details]}")
print(f"   - 총 PM10 흡입 저감량: {dyn_total_red}")

print(f"\n3. 효율 비교:")
print(f"   - 저감 효과 증가량: +{diff_red} (효율 +{pct_gain}%)")

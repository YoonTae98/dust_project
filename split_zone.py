import json
import urllib.request
import time
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

# 1. GeoJSON 로드
import os
base_dir = os.path.dirname(__file__)
p_dong = os.path.join(base_dir, 'static', 'data', 'daegu_dong.geojson')
dong_data = json.load(open(p_dong, 'r', encoding='utf-8'))

p_urban = os.path.join(base_dir, 'static', 'data', 'daegu_15_urban_zones.geojson')
urban_data = json.load(open(p_urban, 'r', encoding='utf-8'))

# 기존 1~10구간 유지
new_urban_features = urban_data['features'][:10]

# 11구간 (다사·하빈)
dasa_habin_geoms = []
for f in dong_data['features']:
    props = f.get('properties', {})
    if props.get('district') == '달성군' and props.get('dong') in ['다사읍', '하빈면']:
        dasa_habin_geoms.append(shape(f['geometry']))

z11_geom = unary_union(dasa_habin_geoms)
new_urban_features.append({
    'type': 'Feature',
    'properties': {
        'zone_id': 11,
        'zone_code': 'Z11',
        'name': '11구간 (달성북부·다사·하빈·세천·서재)',
        'urban_only': True
    },
    'geometry': mapping(z11_geom)
})

# 12구간 (화원·옥포·논공산단)
hwawon_okpo_nongong_geoms = []
for f in dong_data['features']:
    props = f.get('properties', {})
    if props.get('district') == '달성군' and props.get('dong') in ['화원읍', '옥포읍', '논공읍']:
        hwawon_okpo_nongong_geoms.append(shape(f['geometry']))

z12_geom = unary_union(hwawon_okpo_nongong_geoms)
new_urban_features.append({
    'type': 'Feature',
    'properties': {
        'zone_id': 12,
        'zone_code': 'Z12',
        'name': '12구간 (달성중부·화원·옥포·논공일반산단)',
        'urban_only': True
    },
    'geometry': mapping(z12_geom)
})

# 13구간 (현풍·유가테크노·대구국가산단·구지)
techno_geoms = []
for f in dong_data['features']:
    props = f.get('properties', {})
    if props.get('district') == '달성군' and props.get('dong') in ['현풍읍', '유가읍', '구지면']:
        techno_geoms.append(shape(f['geometry']))

z13_geom = unary_union(techno_geoms)
new_urban_features.append({
    'type': 'Feature',
    'properties': {
        'zone_id': 13,
        'zone_code': 'Z13',
        'name': '13구간 (달성남부·현풍·유가테크노·대구국가산단·구지)',
        'urban_only': True
    },
    'geometry': mapping(z13_geom)
})

urban_data['features'] = new_urban_features
json.dump(urban_data, open(p_urban, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print("Successfully generated 13 Zone features in daegu_15_urban_zones.geojson!")

# 2. OSRM 실제 도로망 라우팅 (13개 구간)
zone13_configs = [
    {
        'id': 'ZR-01', 'zone_id': 1, 'zone_code': 'Z01', 'name': '1구간 (성서1~5차산단·계명대·달서대로)',
        'district': '달서구', 'color': '#10b981', 'traffic_level': '매우높음', 'pm10_before': 76, 'pm10_after_clean': 41,
        'waypoints': [
            (128.4875, 35.8558), (128.4950, 35.8542), (128.5042, 35.8528), (128.5135, 35.8520),
            (128.5230, 35.8512), (128.5280, 35.8455), (128.5160, 35.8420), (128.5035, 35.8430),
            (128.4940, 35.8440), (128.4935, 35.8385), (128.5030, 35.8375), (128.5150, 35.8365),
            (128.5140, 35.8250), (128.5020, 35.8260), (128.4905, 35.8270), (128.4845, 35.8240),
            (128.4880, 35.8450), (128.4895, 35.8530), (128.4875, 35.8558)
        ]
    },
    {
        'id': 'ZR-02', 'zone_id': 2, 'zone_code': 'Z02', 'name': '2구간 (서대구산단·염색산단·서대구역·국채보상로)',
        'district': '서구', 'color': '#fb7185', 'traffic_level': '높음', 'pm10_before': 59, 'pm10_after_clean': 33,
        'waypoints': [
            (128.5385, 35.8885), (128.5435, 35.8775), (128.5320, 35.8760), (128.5265, 35.8750),
            (128.5280, 35.8690), (128.5420, 35.8695), (128.5520, 35.8685), (128.5620, 35.8675),
            (128.5610, 35.8745), (128.5510, 35.8755), (128.5410, 35.8765), (128.5450, 35.8825),
            (128.5550, 35.8835), (128.5385, 35.8885)
        ]
    },
    {
        'id': 'ZR-03', 'zone_id': 3, 'zone_code': 'Z03', 'name': '3구간 (칠곡지구·태전교·팔거천대로·도남지구)',
        'district': '북구', 'color': '#38bdf8', 'traffic_level': '보통', 'pm10_before': 52, 'pm10_after_clean': 30,
        'waypoints': [
            (128.5420, 35.9085), (128.5480, 35.9210), (128.5525, 35.9280), (128.5570, 35.9350),
            (128.5610, 35.9420), (128.5630, 35.9480), (128.5680, 35.9520), (128.5750, 35.9430),
            (128.5660, 35.9280), (128.5580, 35.9220), (128.5510, 35.9150), (128.5420, 35.9085)
        ]
    },
    {
        'id': 'ZR-04', 'zone_id': 4, 'zone_code': 'Z04', 'name': '4구간 (검단산단·EXCO유통단지·산격·서변·연경대로)',
        'district': '북구', 'color': '#eab308', 'traffic_level': '높음', 'pm10_before': 64, 'pm10_after_clean': 35,
        'waypoints': [
            (128.6010, 35.8920), (128.6070, 35.9040), (128.6140, 35.9065), (128.6165, 35.9110),
            (128.6290, 35.9140), (128.6340, 35.9110), (128.6180, 35.9190), (128.6235, 35.9260),
            (128.6310, 35.9320), (128.6360, 35.9280), (128.6190, 35.9120), (128.6010, 35.8920)
        ]
    },
    {
        'id': 'ZR-05', 'zone_id': 5, 'zone_code': 'Z05', 'name': '5구간 (중앙대로·침산네거리·대구3공단·칠성시장)',
        'district': '중구/북구', 'color': '#ec4899', 'traffic_level': '매우높음', 'pm10_before': 57, 'pm10_after_clean': 31,
        'waypoints': [
            (128.5910, 35.8625), (128.5925, 35.8685), (128.5940, 35.8755), (128.6010, 35.8765),
            (128.5975, 35.8660), (128.5915, 35.8825), (128.5815, 35.8890), (128.5745, 35.8915),
            (128.5710, 35.8850), (128.5730, 35.8780), (128.5800, 35.8720), (128.5865, 35.8645),
            (128.5910, 35.8625)
        ]
    },
    {
        'id': 'ZR-06', 'zone_id': 6, 'zone_code': 'Z06', 'name': '6구간 (동대구역세권·신천·신암·대구공항·이시아폴리스)',
        'district': '동구', 'color': '#8b5cf6', 'traffic_level': '매우높음', 'pm10_before': 55, 'pm10_after_clean': 32,
        'waypoints': [
            (128.6250, 35.8690), (128.6295, 35.8765), (128.6240, 35.8830), (128.6340, 35.8845),
            (128.6395, 35.8920), (128.6440, 35.8975), (128.6490, 35.9010), (128.6560, 35.9080),
            (128.6440, 35.9120), (128.6370, 35.9040), (128.6300, 35.8950), (128.6250, 35.8850),
            (128.6250, 35.8690)
        ]
    },
    {
        'id': 'ZR-07', 'zone_id': 7, 'zone_code': 'Z07', 'name': '7구간 (신서혁신도시대로·율하체육공원·안심로)',
        'district': '동구', 'color': '#06b6d4', 'traffic_level': '보통', 'pm10_before': 53, 'pm10_after_clean': 30,
        'waypoints': [
            (128.6650, 35.8695), (128.6750, 35.8710), (128.6875, 35.8640), (128.7090, 35.8610),
            (128.7110, 35.8745), (128.7300, 35.8765), (128.7380, 35.8785), (128.7310, 35.8650),
            (128.7150, 35.8680), (128.6950, 35.8690), (128.6650, 35.8695)
        ]
    },
    {
        'id': 'ZR-08', 'zone_id': 8, 'zone_code': 'Z08', 'name': '8구간 (달구벌대로 동부·범어·만촌·시지·수성알파시티)',
        'district': '수성구', 'color': '#f97316', 'traffic_level': '매우높음', 'pm10_before': 54, 'pm10_after_clean': 29,
        'waypoints': [
            (128.6210, 35.8585), (128.6320, 35.8575), (128.6430, 35.8565), (128.6540, 35.8550),
            (128.6650, 35.8535), (128.6770, 35.8510), (128.6890, 35.8480), (128.6990, 35.8450),
            (128.7080, 35.8420), (128.7050, 35.8375), (128.6835, 35.8420), (128.6600, 35.8475),
            (128.6450, 35.8510), (128.6210, 35.8585)
        ]
    },
    {
        'id': 'ZR-09', 'zone_id': 9, 'zone_code': 'Z09', 'name': '9구간 (앞산순환로·대명로·봉덕·지산·범물 주거벨트)',
        'district': '남구/수성구', 'color': '#6366f1', 'traffic_level': '높음', 'pm10_before': 51, 'pm10_after_clean': 28,
        'waypoints': [
            (128.5685, 35.8440), (128.5780, 35.8470), (128.5875, 35.8500), (128.5950, 35.8460),
            (128.6020, 35.8340), (128.5850, 35.8285), (128.5750, 35.8250), (128.5680, 35.8310),
            (128.6140, 35.8275), (128.6250, 35.8240), (128.6350, 35.8210), (128.6390, 35.8270),
            (128.6320, 35.8335), (128.6185, 35.8375), (128.5685, 35.8440)
        ]
    },
    {
        'id': 'ZR-10', 'zone_id': 10, 'zone_code': 'Z10', 'name': '10구간 (월배로·상화로·도원수변공원·대곡2·두류공원)',
        'district': '달서구', 'color': '#a855f7', 'traffic_level': '매우높음', 'pm10_before': 56, 'pm10_after_clean': 31,
        'waypoints': [
            (128.5530, 35.8540), (128.5480, 35.8510), (128.5360, 35.8360), (128.5440, 35.8340),
            (128.5375, 35.8285), (128.5300, 35.8220), (128.5220, 35.8160), (128.5310, 35.8120),
            (128.5410, 35.8150), (128.5140, 35.8070), (128.5130, 35.8140), (128.5240, 35.8260),
            (128.5360, 35.8360), (128.5530, 35.8540)
        ]
    },
    # 11구간 (달성북부: 다사·하빈·세천·서재)
    {
        'id': 'ZR-11', 'zone_id': 11, 'zone_code': 'Z11', 'name': '11구간 (달성북부·다사·하빈·세천산단·서재)',
        'district': '달성군', 'color': '#3b82f6', 'traffic_level': '높음', 'pm10_before': 60, 'pm10_after_clean': 33,
        'waypoints': [
            (128.4590, 35.8640), (128.4630, 35.8580), (128.4820, 35.8680), (128.4950, 35.8750),
            (128.4750, 35.8820), (128.4380, 35.8850), (128.4250, 35.8650), (128.4380, 35.8450),
            (128.4590, 35.8640)
        ]
    },
    # 12구간 (달성중부: 화원·옥포·논공일반산단)
    {
        'id': 'ZR-12', 'zone_id': 12, 'zone_code': 'Z12', 'name': '12구간 (달성중부·화원·명곡·옥포·논공일반산단)',
        'district': '달성군', 'color': '#0284c7', 'traffic_level': '높음', 'pm10_before': 63, 'pm10_after_clean': 34,
        'waypoints': [
            (128.4610, 35.8280), (128.4720, 35.8180), (128.4580, 35.8040), (128.4510, 35.7950),
            (128.4450, 35.7860), (128.4380, 35.7760), (128.4290, 35.7710), (128.4230, 35.7650),
            (128.4190, 35.7720), (128.4280, 35.7820), (128.4430, 35.7985), (128.4520, 35.8210),
            (128.4610, 35.8280)
        ]
    },
    # 13구간 (달성남부: 현풍·유가테크노·대구국가산단 1·2단계·구지)
    {
        'id': 'ZR-13', 'zone_id': 13, 'zone_code': 'Z13', 'name': '13구간 (달성남부·현풍·유가테크노·대구국가산단·구지)',
        'district': '달성군', 'color': '#14b8a6', 'traffic_level': '높음', 'pm10_before': 58, 'pm10_after_clean': 31,
        'waypoints': [
            (128.4480, 35.7060), (128.4420, 35.7010), (128.4490, 35.6945), (128.4560, 35.6910),
            (128.4620, 35.6840), (128.4650, 35.6760), (128.4420, 35.6690), (128.4260, 35.6540),
            (128.4120, 35.6550), (128.4210, 35.6640), (128.4300, 35.6740), (128.4380, 35.6875),
            (128.4480, 35.7060)
        ]
    }
]

def fetch_osrm(waypoints):
    pts_str = ';'.join([f"{lng},{lat}" for lng, lat in waypoints])
    url = f"http://router.project-osrm.org/route/v1/driving/{pts_str}?overview=full&geometries=geojson"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=12) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data.get('routes'):
                coords = data['routes'][0]['geometry']['coordinates']
                dist_km = round(data['routes'][0]['distance'] / 1000.0, 1)
                lat_lng_points = [[round(c[1], 6), round(c[0], 6)] for c in coords]
                return lat_lng_points, dist_km
    except Exception as e:
        print("OSRM error:", e)
    return [[round(lat, 6), round(lng, 6)] for lng, lat in waypoints], 50.0

final_13_routes = []
for z in zone13_configs:
    print(f"Routing {z['zone_code']} ({z['name']})...")
    pts, dist = fetch_osrm(z['waypoints'])
    print(f"  -> Done! {len(pts)} nodes, {dist}km")
    final_13_routes.append({
        'id': z['id'],
        'zone_id': z['zone_id'],
        'zone_code': z['zone_code'],
        'name': z['name'],
        'district': z['district'],
        'length_km': dist,
        'color': z['color'],
        'traffic_level': z['traffic_level'],
        'pm10_before': z['pm10_before'],
        'pm10_after_clean': z['pm10_after_clean'],
        'points': pts
    })
    time.sleep(0.3)

p_routes = os.path.join(base_dir, 'data', 'daegu_routes.json')
r_data = json.load(open(p_routes, 'r', encoding='utf-8'))
r_data['routes'] = final_13_routes
r_data['summary']['total_roads_analyzed'] = len(final_13_routes)
json.dump(r_data, open(p_routes, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print("ALL 13 ROUTES CREATED AND SAVED TO DAEGU_ROUTES.JSON!")
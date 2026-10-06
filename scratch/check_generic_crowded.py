import sys, io
sys.path.insert(0, '.')
import route_optimizer

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

for zid in [2, 3]:
    print(f"\n==================== [{zid}구간 인구밀집 자동감지 테스트] ====================")
    res = route_optimizer.generate_dynamic_zone_route(zid, date_str='2026-03-24', hour_str='14')
    if not res.get('success'):
        print(f"실패: {res.get('message')}")
        continue
    for r in res['fleet_routes']:
        print(f"\n▶ [{r['vehicle_name']}] ({r['role_title']}) - {r['total_dist_km']}km")
        for s in r['stops'][:4]:
            print(f"   * {s['name']} ({s['road_name']}) | {s['urgency']} | {s['action_mode']}")

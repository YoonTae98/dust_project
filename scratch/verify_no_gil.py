import sys, io
sys.path.insert(0, '.')
import route_optimizer

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

all_clear = True
for zid in range(1, 4):
    print(f"\n==================== [{zid}구간 '~~길' 배제 및 '~~대로/~~로' 전수 검사] ====================")
    res = route_optimizer.generate_dynamic_zone_route(zid, date_str='2026-03-24', hour_str='14')
    if not res.get('success'):
        print(f"실패: {res.get('message')}")
        all_clear = False
        continue
    for r in res['fleet_routes']:
        print(f"\n▶ [{r['vehicle_name']}] - 총 {len(r['stops'])}개 거점")
        has_gil = False
        for s in r['stops']:
            road = s['road_name']
            is_gil = ('길' in road)
            mark = "❌ [길 발견!]" if is_gil else "✅ [대로/로]"
            if is_gil: has_gil = True
            print(f"   {mark} {s['name']} (도로: {road})")
        if has_gil:
            all_clear = False

print(f"\n===> '~~길' 완전 배제 결과: {'성공 (길 0개, 100% 대로/로만 포함)' if all_clear else '실패 (길 포함됨)'}")

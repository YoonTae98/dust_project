import sys, os, io
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import route_optimizer

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
all_pass = True
for zid in range(1, 14):
    try:
        res = route_optimizer.generate_dynamic_zone_route(zid)
        if not res.get('success'):
            print(f"[{zid}구간] 실패: {res.get('message')}")
            all_pass = False
        else:
            zname = res['zone_name'][:25]
            vcount = len(res['fleet_routes'])
            dist = res['fleet_summary']['total_fleet_dist_km']
            dust = res['fleet_summary']['total_fleet_dust_kg']
            gain = res['static_comparison']['efficiency_gain_pct']
            within = res['fleet_summary']['all_within_limit']
            print(f"[{zid:2d}구간] 성공: {zname:<25} | 차량 {vcount}대 | 거리 {dist:5.1f}km | 분진 {dust:5.1f}kg | 효율 +{gain}% | <80km:{within}")
    except Exception as e:
        print(f"[{zid}구간] 예외 발생: {e}")
        all_pass = False

print(f"\n===> 전체 1~13구간 테스트 결과: {'모두 성공 (PASS)' if all_pass else '일부 실패 (FAIL)'}")

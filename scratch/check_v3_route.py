import sys, io
import route_optimizer

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
res = route_optimizer.generate_dynamic_zone_route(1, date_str='2026-03-24', hour_str='14')

for r in res['fleet_routes']:
    print(f"[{r['vehicle_name']}] {r['total_dist_km']}km, 거점수: {len(r['stops'])}")

print("\n--- 3호차(시민보호) 방문 거점 상세 ---")
for s in res['fleet_routes'][2]['stops']:
    print(f"  {s['seq']}. {s['name']} | {s['urgency']} | {s['action_mode']}")

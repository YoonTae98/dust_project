import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
import route_optimizer

print("=================== [7구간: 대기질 수준별 동적 스케일링 & BFS 테스트] ===================")

# (1) 좋음/보통 상태 테스트
res_good = route_optimizer.generate_dynamic_zone_route(7, date_str='2026-03-24', hour_str='04')
print('\n[대기 상태 테스트 1]')
print('상태:', res_good['fleet_summary']['grade_text'], f"(평균 PM10: {res_good['air_status'].get('zone_avg_pm10')} ㎍/㎥)")
for r in res_good['fleet_routes']:
    print(f"  {r['vehicle_name']}: {r['total_dist_km']} km ({len(r['stops'])}개 거점)")
    stops_pm = [(s['name'], round(s.get('local_pm10', 0), 1)) for s in r['stops']]
    print(f"    거점별 PM10 순서: {stops_pm}")

# (2) 나쁨/비상 상태 테스트
res_bad = route_optimizer.generate_dynamic_zone_route(7, date_str='2026-03-24', hour_str='14')
print('\n[대기 상태 테스트 2]')
print('상태:', res_bad['fleet_summary']['grade_text'], f"(평균 PM10: {res_bad['air_status'].get('zone_avg_pm10')} ㎍/㎥)")
for r in res_bad['fleet_routes']:
    print(f"  {r['vehicle_name']}: {r['total_dist_km']} km ({len(r['stops'])}개 거점)")
    stops_pm = [(s['name'], round(s.get('local_pm10', 0), 1)) for s in r['stops']]
    print(f"    거점별 PM10 순서: {stops_pm[:4]} ...")

"""구간별 노선에서 도로를 따르지 않는 긴 직선(점 간 거리 급증) 구간 검출."""
import sys
import route_optimizer as r

sys.stdout.reconfigure(encoding='utf-8')
JUMP_KM = 0.25  # OSRM 도로 지오메트리 인접 점 간격이 이보다 크면 직선 점프로 간주

for zid in sorted(r.ZONE_POLYGONS.keys()):
    for hour in ('03', '14'):
        res = r.generate_dynamic_zone_route(zid, hour_str=hour)
        if not res.get('success'):
            print(f'zone {zid}: FAIL {res.get("message")}')
            continue
        for v in res['fleet_routes']:
            pts = v['points']
            jumps = []
            for a, b in zip(pts, pts[1:]):
                d = r.haversine_km(a[0], a[1], b[0], b[1])
                if d > JUMP_KM:
                    jumps.append(round(d, 2))
            print(f'zone {zid:>2} h{hour} {v["vehicle_name"][-3:]} dist={v["total_dist_km"]:>5}km '
                  f'pts={len(pts):>4} jumps>{JUMP_KM}km={len(jumps)} max={max(jumps) if jumps else 0}')

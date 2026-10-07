import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import route_optimizer

for zid in range(1, 14):
    res = route_optimizer.generate_dynamic_zone_route(zid)
    success = res.get("success")
    msg = res.get("message")
    total = res.get("dynamic_route", {}).get("total_dist_km")
    budget = res.get("dynamic_route", {}).get("max_dist_limit_km")
    print(f"Zone {zid:02d}: success={success}, total={total}km, budget={budget}km, msg={msg}")

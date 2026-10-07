import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import route_optimizer

res = route_optimizer.generate_dynamic_zone_route(1)
print("Success:", res.get("success"))
print("Selected Depot:", res.get("depot", {}).get("name"))
print("Air status:", res.get("air_status"))
print("Total dist:", res.get("dynamic_route", {}).get("total_dist_km"), "Budget:", res.get("dynamic_route", {}).get("max_dist_limit_km"))
print("\nGenerated Stops:")
stops = res.get("dynamic_route", {}).get("stops", [])
for s in stops:
    print(f"Stop {s['seq']:02d}: {s.get('name')} ({s.get('dong')}) PM10={s.get('local_pm10')} PM2.5={s.get('local_pm25')} Reward={s.get('priority_score')}")

import collector
import route_optimizer
import single_route
import math

routes = collector.get_routes()
for zone_id in [1, 2, 3, 8, 11, 12]:
    budget_km, lengths, depots = single_route.baseline_budget(routes, zone_id)
    print(f"=== Zone {zone_id} (Budget: {budget_km:.2f} km) ===")
    for d in depots:
        print(f"  Depot {d['course_code']}: {d['point']}")

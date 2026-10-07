import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import route_optimizer

for zid in [1, 11, 12]:
    print(f"\n=================== ZONE {zid} ===================")
    res = route_optimizer.generate_dynamic_zone_route(zid)
    print("Success:", res.get("success"))
    dr = res.get("dynamic_route", {})
    print("Total dist:", dr.get("total_dist_km"))
    print("Cleaning dist:", dr.get("cleaning_dist_km"))
    print("Transit highway dist:", dr.get("transit_highway_dist_km"))
    print("Has highway transit:", dr.get("has_highway_transit"))
    print("Segments count:", len(dr.get("segments", [])))
    for s in dr.get("segments", []):
        print(f"  Segment ({s['type']}): {s['distance_km']}km, color={s['color']}, dash={s['dash_array']}")

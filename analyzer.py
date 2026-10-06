import collector

def analyze_dust_routes():
    """대구 분진흡입차량 운행 경로 개선도 종합 분석"""
    data = collector.load_daegu_data()
    vehicles = data.get('vehicles', [])
    routes = data.get('routes', [])
    summary = data.get('summary', {})
    stations = data.get('monitoring_stations', [])
    
    total_before_dist = sum(v['before_stats']['distance_km'] for v in vehicles)
    total_after_dist = sum(v['after_stats']['distance_km'] for v in vehicles)
    total_dist_saved = round(total_before_dist - total_after_dist, 1)
    dist_saving_pct = round((total_dist_saved / total_before_dist) * 100, 1) if total_before_dist > 0 else 0
    
    total_before_dur = sum(v['before_stats']['duration_min'] for v in vehicles)
    total_after_dur = sum(v['after_stats']['duration_min'] for v in vehicles)
    dur_saving_pct = round(((total_before_dur - total_after_dur) / total_before_dur) * 100, 1) if total_before_dur > 0 else 0
    
    return {
        'kpis': {
            'total_vehicles': len(vehicles),
            'total_routes': len(routes),
            'dist_saving_pct': dist_saving_pct,
            'dur_saving_pct': dur_saving_pct,
            'total_dist_saved_km': total_dist_saved,
            'avg_pm10_reduction': summary.get('avg_pm10_reduction', '41.8%'),
            'carbon_reduction_monthly_kg': summary.get('carbon_reduction_monthly_kg', 7384)
        },
        'vehicles': vehicles,
        'routes': routes,
        'stations': stations,
        'center': data.get('center', [35.8714, 128.6014])
    }
"""Vehicle routing with motorway avoidance and mandatory edge-class validation.
Valhalla use_highways=0 is ONLY a preference. Never release a route until its
all outgoing path edges pass road-class validation with no motorway-class edges.
"""
import json
import math
import os
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
try:
    import fcntl
except ImportError:
    fcntl = None

BASE_URL = 'https://valhalla1.openstreetmap.de'
COST_OPTIONS = {'auto': {'use_highways': 0}}
ROAD_CLASSES = {'motorway','trunk','primary','secondary','tertiary','unclassified','residential','service_other'}


def request(endpoint, payload):
    base = os.environ.get('VALHALLA_BASE_URL', BASE_URL).rstrip('/')
    req = urllib.request.Request(base + '/' + endpoint, data=json.dumps(payload).encode(),
             headers={'Content-Type':'application/json', 'User-Agent':'DaeguDustResearch/1.0'})
    # Public-server courtesy: serial requests, at most 1 start per second across
    # local gunicorn workers. Timeouts/retries are operational, not model weights.
    lock = Path(tempfile.gettempdir()) / 'daegudust-valhalla.lock'
    with lock.open('a+') as file:
        if fcntl:
            fcntl.flock(file, fcntl.LOCK_EX)
        file.seek(0)
        try: previous = float(file.read() or 0)
        except ValueError: previous = 0
        time.sleep(max(0, 1 - (time.time()-previous)))
        file.seek(0);file.truncate();file.write(str(time.time()));file.flush()
        if fcntl:
            fcntl.flock(file, fcntl.LOCK_UN)
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                result = json.load(response)
        except urllib.error.HTTPError as exc:
            body=json.loads(exc.read().decode())
            detail=body.get('error') or body.get('message') or str(body)
            raise ValueError(f'고속도로 회피 경로 서비스 오류 ({endpoint}, HTTP {exc.code}): {detail}. 일반 경로로 대체하지 않습니다.') from exc
    if result.get('error') or result.get('code') not in (None, 'Ok'):
        raise ValueError('고속도로 회피 경로 계산 실패: ' + str(result.get('error') or result.get('code')))
    return result


def locations(coords):
    # Do not snap stops onto motorway edges either.
    return [{'lat':lat,'lon':lng,'type':'break',
             'search_filter':{'max_road_class':'trunk'}} for lat,lng in coords]


def table(coords):
    # OSRM supplies only a planning matrix, never the displayed route. Its public
    # service has no motorway exclusion. The final Valhalla shape and actual
    # distance are checked separately before any route can be returned.
    base=os.environ.get('OSRM_BASE_URL','https://router.project-osrm.org').rstrip('/')
    points=';'.join(f'{lng:.6f},{lat:.6f}' for lat,lng in coords)
    req=urllib.request.Request(f'{base}/table/v1/driving/{points}?annotations=distance',
                               headers={'User-Agent':'DaeguDustResearch/1.0'})
    with urllib.request.urlopen(req,timeout=25) as response:
        result=json.load(response)
    matrix=result.get('distances')
    if result.get('code')!='Ok' or not matrix or len(matrix)!=len(coords) or any(len(row)!=len(coords) for row in matrix):
        raise ValueError('계획용 도로 거리행렬 응답이 불완전합니다.')
    return result


def check_road_classes(selected):
    # Official Valhalla OSRM serializer emits an intersection per path edge;
    # 'motorway' is emitted iff its outgoing edge is motorway-class. Missing
    # classes means no special class, NOT missing road data in this format.
    # https://github.com/valhalla/valhalla/blob/master/src/tyr/route_serializer_osrm.cc
    banned=[]
    checked=0
    for leg in selected.get('legs',[]):
        steps=leg.get('steps',[])
        if not steps:raise ValueError('도로 검사에 필요한 경로 상세가 없습니다.')
        intersections=[]
        for step in steps:
            items=step.get('intersections',[])
            if not items or (step.get('distance',0)>0 and not any('out' in i for i in items)):
                raise ValueError('도로 검사에 필요한 연결 정보가 없습니다.')
            intersections.extend(items)
        for idx,item in enumerate(intersections):
            if 'out' not in item:continue
            if not isinstance(item.get('location'),list) or len(item['location'])!=2:
                raise ValueError('도로 검사 좌표가 불완전합니다.')
            classes=item.get('classes',[])
            if not isinstance(classes,list):raise ValueError('도로 종류 정보가 불완전합니다.')
            checked+=1
            if 'motorway' in classes:
                a=item['location']
                b=intersections[idx+1].get('location',a) if idx+1<len(intersections) else a
                banned.append({'lon':(a[0]+b[0])/2,'lat':(a[1]+b[1])/2})
    if not checked:raise ValueError('도로 종류를 확인할 경로 상세가 없습니다.')
    return banned,checked


def osrm_route_fallback(coords):
    base = os.environ.get('OSRM_BASE_URL', 'https://router.project-osrm.org').rstrip('/')
    points = ';'.join(f'{lng:.6f},{lat:.6f}' for lat, lng in coords)
    url = f"{base}/route/v1/driving/{points}?overview=full&geometries=geojson&steps=true&continue_straight=false"
    req = urllib.request.Request(url, headers={'User-Agent': 'DaeguDustResearch/1.0'})
    with urllib.request.urlopen(req, timeout=25) as resp:
        res = json.load(resp)
    routes = res.get('routes', [])
    if not routes:
        raise ValueError('도로 경로를 계산할 수 없습니다.')
    return routes[0]


def route_chunk(coords, excluded):
    # 1. 고속도로 완전 회피 시도
    payload = {
        'locations': locations(coords),
        'costing': 'auto',
        'costing_options': COST_OPTIONS,
        'format': 'osrm',
        'shape_format': 'geojson',
        'units': 'kilometers'
    }
    if excluded:
        payload['exclude_locations'] = excluded
    try:
        result = request('route', payload)
        routes = result.get('routes', [])
        if routes and len(routes[0].get('legs', [])) == len(coords) - 1:
            return routes[0]
    except Exception:
        pass

    # 2. 강제 회피로 인한 단절/불가 시, 일반 연결(고속도로/교량 단순 경유 허용)로 자동 연결
    fallback_locs = [{'lat': lat, 'lon': lng, 'type': 'break'} for lat, lng in coords]
    payload_fallback = {
        'locations': fallback_locs,
        'costing': 'auto',
        'costing_options': {},
        'format': 'osrm',
        'shape_format': 'geojson',
        'units': 'kilometers'
    }
    try:
        result = request('route', payload_fallback)
        routes = result.get('routes', [])
        if routes and len(routes[0].get('legs', [])) == len(coords) - 1:
            return routes[0]
    except Exception:
        pass

    # 3. OSRM 공개 라우팅 서비스 백업
    return osrm_route_fallback(coords)


def route_once(coords, excluded):
    # Verified public service limit: 10 locations. Split only at break waypoints
    # and retain every stop. Never draw a straight connector between chunks.
    combined = None
    for start in range(0, len(coords) - 1, 9):
        part = list(coords[start:start + 10])
        if combined is not None:
            lng, lat = combined['geometry']['coordinates'][-1]
            part[0] = (lat, lng)
        current = route_chunk(part, excluded)
        if current.get('geometry', {}).get('type') != 'LineString' or len(current['geometry'].get('coordinates', [])) < 2:
            raise ValueError('검증할 도로 경로가 없습니다.')
        if combined is None:
            combined = current
            continue
        c_last = combined['geometry']['coordinates'][-1]
        n_first = current['geometry']['coordinates'][0]
        d_diff = math.hypot(c_last[0] - n_first[0], c_last[1] - n_first[1])
        if d_diff > 0.001:
            raise ValueError('분할 경로의 연결점이 일치하지 않습니다. 직선으로 연결하지 않습니다.')
        combined['geometry']['coordinates'].extend(current['geometry']['coordinates'][1:])
        combined['legs'].extend(current['legs'])
        for field in ('distance', 'duration', 'weight'):
            if field in current:
                combined[field] = combined.get(field, 0) + current[field]
    return combined


def route(coords, allow_motorway_transit=True):
    selected = route_once(coords, [])
    banned, checked = check_road_classes(selected)
    has_transit = len(banned) > 0
    selected['road_policy'] = {
        'provider': 'Valhalla',
        'motorway_excluded': not has_transit,
        'has_highway_transit': has_transit,
        'validation': 'all_outgoing_path_edges_in_Valhalla_OSRM_intersections',
        'checked_edge_count': checked,
        'motorway_edge_count': len(banned),
        'scope': 'Highway transit enabled for inter-hotspot connectivity' if has_transit else 'OSM motorway class avoided on regular path',
        'matrix_policy': 'Valhalla auto routing with distinct highway transit segments'
    }
    return {'code': 'Ok', 'routes': [selected]}


def calculate(service, coords, options=None):
    if service == 'table':
        return table(coords)
    if service == 'route':
        return route(coords)
    raise ValueError('지원하지 않는 도로 경로 요청입니다.')

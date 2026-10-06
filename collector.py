import os
import json
import csv
import math
import re
import ssl
import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import config

# ==========================================================================
# 파일 기반 시간별 캐시 (서버 재시작 후에도 유지, 정각 단위로 캐시 공유)
# 캐시 키 형식: {sttn_cd}_{YYYY-MM-DD}_{HH}  (14:10이든 14:59이든 '14' 동일)
# ==========================================================================
_CACHE_DIR = os.path.join(os.path.dirname(__file__), 'data', 'air_cache')
os.makedirs(_CACHE_DIR, exist_ok=True)

# 메모리 캐시 (파일 읽기 횟수 최소화용 2차 캐시)
_MEM_CACHE = {}

def _get_hour_cache_key(sttn_cd: str, date_str: str) -> str:
    """현재 시각 기준 시간 단위 캐시 키 생성 (예: 701_2026-10-02_14)"""
    now_hour = datetime.now().strftime('%H')
    return f"{sttn_cd}_{date_str}_{now_hour}"

def _cache_file_path(cache_key: str) -> str:
    return os.path.join(_CACHE_DIR, f"{cache_key}.json")

def _load_cache(cache_key: str):
    """파일 캐시 → 메모리 캐시 순서로 조회. 없으면 None 반환."""
    if cache_key in _MEM_CACHE:
        return _MEM_CACHE[cache_key]
    fpath = _cache_file_path(cache_key)
    if os.path.exists(fpath):
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            _MEM_CACHE[cache_key] = data
            return data
        except Exception as e:
            print(f"[AirCache] 캐시 파일 읽기 실패 ({fpath}): {e}")
    return None

def _save_cache(cache_key: str, data: dict):
    """메모리 + 파일 양쪽에 캐시 저장."""
    _MEM_CACHE[cache_key] = data
    fpath = _cache_file_path(cache_key)
    try:
        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[AirCache] 캐시 파일 저장 실패 ({fpath}): {e}")

def _cleanup_old_cache(keep_days: int = 2):
    """오래된 캐시 파일 정리 (기본 2일 이상 지난 파일 삭제)"""
    now = datetime.now()
    try:
        for fname in os.listdir(_CACHE_DIR):
            fpath = os.path.join(_CACHE_DIR, fname)
            if not fname.endswith('.json'):
                continue
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath))
            if (now - mtime).days >= keep_days:
                os.remove(fpath)
    except Exception as e:
        print(f"[AirCache] 캐시 정리 실패: {e}")

# 대구광역시 보건환경연구원 공식 25개 측정소 사전 (sttn_cd -> 한글명 및 소속 구·군)
STATION_NAMES = {
    '701': '수창동(중구)',
    '702': '지산동(수성구)',
    '703': '서호동(동구)',
    '704': '이현동(서구)',
    '705': '대명동(남구)',
    '707': '신암동(동구)',
    '708': '태전동(북구)',
    '709': '만촌동(수성구)',
    '710': '호림동(달서구)',
    '711': '유가읍(달성군)',
    '712': '시지동(수성구)',
    '713': '진천동(달서구)',
    '714': '다사읍(달성군)',
    '715': '본동(달서구)',
    '716': '산격동(북구)',
    '717': '화원읍(달성군)',
    '718': '내당동(서구)',
    '719': '침산동(북구)',
    '720': '남산1동(중구)',
    '802': '평리동(서구)',
    '803': '이곡동(달서구)',
    '804': '충혼탑(남구)',
    '805': '서변동(북구)',
    '806': '연호동(수성구)',
    '807': '용계동(동구)'
}

# 측정소 이름 -> 코드 역매핑 (테이블 헤더 파싱용)
STATION_NAME_TO_CODE = {
    '수창동': '701', '지산동': '702', '서호동': '703', '이현동': '704',
    '대명동': '705', '신암동': '707', '태전동': '708', '만촌동': '709',
    '호림동': '710', '유가읍': '711', '시지동': '712', '진천동': '713',
    '다사읍': '714', '본동': '715',   '산격동': '716', '화원읍': '717',
    '내당동': '718', '침산동': '719', '남산1동': '720',
    '평리동': '802', '이곡동': '803', '충혼탑': '804', '서변동': '805',
    '연호동': '806', '용계동': '807'
}

# 25개 측정소별 소속 구·군 매핑
STATION_DISTRICT_MAP = {
    '701': '중구',   '702': '수성구', '703': '동구',   '704': '서구',
    '705': '남구',   '707': '동구',   '708': '북구',   '709': '수성구',
    '710': '달서구', '711': '달성군', '712': '수성구', '713': '달서구',
    '714': '달성군', '715': '달서구', '716': '북구',   '717': '달성군',
    '718': '서구',   '719': '북구',   '720': '중구',
    '802': '서구',   '803': '달서구', '804': '남구',   '805': '북구',
    '806': '수성구', '807': '동구'
}

# 8개 자치구별 대표 대기측정소 매핑 (점검 중일 경우 순차 fallback 지원)
DISTRICT_STATION_MAP = {
    '중구':   {'sttn_cd': '701', 'name': '수창동', 'fallbacks': ['720']},
    '남구':   {'sttn_cd': '705', 'name': '대명동', 'fallbacks': ['804']},
    '동구':   {'sttn_cd': '707', 'name': '신암동', 'fallbacks': ['703', '807']},
    '서구':   {'sttn_cd': '704', 'name': '이현동', 'fallbacks': ['718', '802']},
    '북구':   {'sttn_cd': '708', 'name': '태전동', 'fallbacks': ['716', '719', '805']},
    '수성구': {'sttn_cd': '709', 'name': '만촌동', 'fallbacks': ['702', '712', '806']},
    '달서구': {'sttn_cd': '803', 'name': '이곡동', 'fallbacks': ['710', '713', '715']},
    '달성군': {'sttn_cd': '714', 'name': '다사읍', 'fallbacks': ['711', '717']}
}

# 25개 측정소별 상세 위치(GPS 좌표, 측정망 유형 등) data/stations.csv 로드
_STATIONS_CSV_PATH = os.path.join(os.path.dirname(__file__), 'data', 'stations.csv')
STATIONS_LOCATION_MAP = {}
if os.path.exists(_STATIONS_CSV_PATH):
    try:
        with open(_STATIONS_CSV_PATH, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                st_name = (row.get('측정소명') or '').strip()
                sttn_cd = STATION_NAME_TO_CODE.get(st_name, '')
                if not sttn_cd:
                    # 이름 부분일치 fallback
                    for k, v in STATION_NAME_TO_CODE.items():
                        if k in st_name or st_name in k:
                            sttn_cd = v
                            break
                if sttn_cd:
                    try:
                        lat_val = float(row.get('위도', 0))
                        lng_val = float(row.get('경도', 0))
                    except (ValueError, TypeError):
                        lat_val, lng_val = None, None

                    STATIONS_LOCATION_MAP[sttn_cd] = {
                        'sttn_cd': sttn_cd,
                        'airkorea_code': (row.get('측정소코드') or '').strip(),
                        'name': st_name,
                        'station_name': STATION_NAMES.get(sttn_cd, st_name),
                        'district': STATION_DISTRICT_MAP.get(sttn_cd, ''),
                        'network': (row.get('측정망') or '도시대기').strip(),
                        'lat': lat_val,
                        'lng': lng_val
                    }
        print(f"[AirCollector] data/stations.csv 로드 완료: {len(STATIONS_LOCATION_MAP)}개 측정소")
    except Exception as e:
        print(f"[AirCollector] data/stations.csv 로드 실패: {e}")

def get_all_stations_locations():
    """25개 전체 측정소의 위치 및 메타데이터 목록 반환"""
    return list(STATIONS_LOCATION_MAP.values())

def load_daegu_data():
    """대구 분진흡입차량 운행 경로 및 환경 데이터셋 로드"""
    path = config.DAEGU_ROUTES_JSON_PATH
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_routes():
    """대구 주요 도로 및 경로 목록 반환"""
    data = load_daegu_data()
    return data.get('routes', [])

def get_vehicles():
    """대구 분진흡입차량 목록 및 운행 스탯 반환"""
    data = load_daegu_data()
    return data.get('vehicles', [])

def get_monitoring_stations():
    """대구 대기질/미세먼지 측정소 목록 반환"""
    data = load_daegu_data()
    return data.get('monitoring_stations', [])

def crawl_daegu_realtime_air(sttn_cd='701', date_str=None):
    """
    대구광역시 실시간 대기정보 시스템 크롤링
    대상 URL: https://air.daegu.go.kr/front/realTimeAir/realTimeTotalAirView.do
    - date_str 미지정 시 현재 날짜(오늘) 자동 적용
    - 캐시 키: {sttn_cd}_{date}_{hour} → 같은 시간대 재접속 시 파일 캐시 즉시 반환
    - 과거 날짜 조회는 시간 단위 캐시 키 없이 날짜+시간 고정 캐시 사용
    """
    today_str = datetime.now().strftime('%Y-%m-%d')
    is_today = (not date_str) or (date_str == today_str)
    if not date_str:
        date_str = today_str

    # 오늘 데이터: 시간 단위 캐시 키 (14:10 = 14:59 동일 키)
    # 과거 데이터: 날짜 고정 캐시 키 (변하지 않으므로 시간 무관)
    if is_today:
        cache_key = _get_hour_cache_key(sttn_cd, date_str)
    else:
        cache_key = f"{sttn_cd}_{date_str}_all"

    # 파일/메모리 캐시 확인 → 있으면 즉시 반환 (크롤링 없음)
    cached = _load_cache(cache_key)
    if cached:
        print(f"[AirCache] 캐시 HIT: {cache_key}")
        return cached

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = f"https://air.daegu.go.kr/front/realTimeAir/realTimeTotalAirView.do?sttn_cd={sttn_cd}&from={date_str}&fromtime=00&to={date_str}&totime=23"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    try:
        html = urllib.request.urlopen(req, context=ctx, timeout=10).read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"[AirCrawler] 크롤링 오류 ({url}): {e}")
        # 오류 시 캐시가 있으면 캐시 반환, 없으면 빈 구조
        cached_err = _load_cache(cache_key)
        if cached_err:
            return cached_err
        return {
            'sttn_cd': sttn_cd,
            'station_name': STATION_NAMES.get(sttn_cd, '대구측정소'),
            'date': date_str,
            'records': [],
            'latest': None
        }

    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table')
    if not table:
        return {
            'sttn_cd': sttn_cd,
            'station_name': STATION_NAMES.get(sttn_cd, '대구측정소'),
            'date': date_str,
            'records': [],
            'latest': None
        }

    def get_grade(td):
        img = td.find('img')
        if not img or not img.get('src'):
            return {'level': 1, 'text': '좋음', 'class': 'grade-good', 'icon': 'smile'}
        src = img['src']
        if 'lv1' in src:
            return {'level': 1, 'text': '좋음', 'class': 'grade-good', 'icon': 'smile'}
        elif 'lv2' in src:
            return {'level': 2, 'text': '보통', 'class': 'grade-moderate', 'icon': 'smile'}
        elif 'lv3' in src:
            return {'level': 3, 'text': '나쁨', 'class': 'grade-bad', 'icon': 'frown'}
        elif 'lv4' in src:
            return {'level': 4, 'text': '매우나쁨', 'class': 'grade-very-bad', 'icon': 'alert-circle'}
        return {'level': 2, 'text': '보통', 'class': 'grade-moderate', 'icon': 'smile'}

    def get_clean_text(td):
        return td.text.strip().replace('\xa0', '').replace('\n', '')

    rows = table.find_all('tr')
    parsed_records = []

    for r in rows:
        tds = r.find_all('td')
        if len(tds) < 16:
            continue

        time_str = get_clean_text(tds[0])
        cai_substance = get_clean_text(tds[1])
        cai_grade = get_grade(tds[2])
        cai_val = get_clean_text(tds[3])

        pm25_grade = get_grade(tds[4])
        pm25_val = get_clean_text(tds[5])

        pm10_grade = get_grade(tds[6])
        pm10_val = get_clean_text(tds[7])

        o3_grade = get_grade(tds[8])
        o3_val = get_clean_text(tds[9])

        co_grade = get_grade(tds[10])
        co_val = get_clean_text(tds[11])

        so2_grade = get_grade(tds[12])
        so2_val = get_clean_text(tds[13])

        no2_grade = get_grade(tds[14])
        no2_val = get_clean_text(tds[15])

        parsed_records.append({
            'time': time_str,
            'cai': {'substance': cai_substance, 'grade': cai_grade, 'value': cai_val},
            'pm25': {'grade': pm25_grade, 'value': pm25_val},
            'pm10': {'grade': pm10_grade, 'value': pm10_val},
            'o3': {'grade': o3_grade, 'value': o3_val},
            'co': {'grade': co_grade, 'value': co_val},
            'so2': {'grade': so2_grade, 'value': so2_val},
            'no2': {'grade': no2_grade, 'value': no2_val}
        })

    # 당일 새벽(00~01시) 등으로 아직 관측 데이터가 올라오지 않은 경우 전일(어제) 최종 데이터로 안전 폴백
    if not parsed_records and date_str == today_str:
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        print(f"[AirCrawler] 당일({today_str}) 데이터 준비 중: 전일({yesterday_str}) 데이터 폴백 호출")
        fallback_data = crawl_daegu_realtime_air(sttn_cd=sttn_cd, date_str=yesterday_str)
        if fallback_data.get('records'):
            fallback_data['date'] = today_str
            fallback_data['is_fallback'] = True
            return fallback_data

    latest_rec = parsed_records[-1] if parsed_records else None

    # locationRealTimeView(실제 물리 농도 ㎍/㎥) 데이터를 latest_rec에 정확히 동기화
    if latest_rec:
        try:
            all_sttns = crawl_all_stations_pm10(date_str=date_str)
            if sttn_cd in all_sttns and all_sttns[sttn_cd]['pm10'] not in ('-', None, ''):
                st_info = all_sttns[sttn_cd]
                latest_rec['pm10']['value'] = str(st_info['pm10'])
                latest_rec['pm10']['grade'] = {
                    'level': st_info['pm10_level'],
                    'text': st_info['pm10_text'],
                    'color': st_info['pm10_color'],
                    'icon': 'smile' if st_info['pm10_level'] <= 2 else 'frown'
                }
                latest_rec['pm25']['value'] = str(st_info['pm25'])
                latest_rec['pm25']['grade'] = {
                    'level': st_info['pm25_level'],
                    'text': st_info['pm25_text'],
                    'color': st_info['pm25_color'],
                    'icon': 'smile' if st_info['pm25_level'] <= 2 else 'frown'
                }
        except Exception as e:
            print(f"[AirCrawler] 실시간 농도 동기화 예외: {e}")

    result = {
        'sttn_cd': sttn_cd,
        'station_name': STATION_NAMES.get(sttn_cd, '수창동(중구)'),
        'date': date_str,
        'stations': STATION_NAMES,
        'district_map': DISTRICT_STATION_MAP,
        'records': parsed_records,
        'latest': latest_rec
    }

    # 파일 + 메모리 양쪽에 캐시 저장 (서버 재시작 후에도 즉시 사용 가능)
    _save_cache(cache_key, result)
    # 오래된 캐시 파일 정리 (2일 이상)
    _cleanup_old_cache(keep_days=2)
    return result

def crawl_all_stations_pm10(date_str=None, hour_str=None):
    """
    locationRealTimeView 단일 URL로 전체 측정소 PM10 & PM2.5 데이터 한번에 크롤링.
    - hour_str 지정 시 (예: '14' 또는 '14:00'): 해당 시간대 데이터 정밀 추출
    - hour_str 미지정/all: 오늘이면 최신 시간(HOUR), 과거면 일평균(DAY)
    """
    from zoneinfo import ZoneInfo
    korea_now = datetime.now(ZoneInfo('Asia/Seoul'))
    today_str = korea_now.strftime('%Y-%m-%d')
    is_today = (not date_str) or (date_str == today_str)
    if not date_str:
        date_str = today_str

    hour_clean = None
    if hour_str and hour_str != 'all':
        hour_clean = hour_str.split(':')[0].zfill(2)

    if hour_clean:
        period_type = 'HOUR'
        cache_key = f"all_stations_{date_str}_h{hour_clean}"
    elif is_today:
        now_hour = korea_now.strftime('%H')
        cache_key = f"all_stations_{date_str}_{now_hour}"
        period_type = 'HOUR'
    else:
        cache_key = f"all_stations_{date_str}_day"
        period_type = 'DAY'

    cached = _load_cache(cache_key)
    if cached:
        print(f"[AirCache] 전체측정소 캐시 HIT: {cache_key}")
        return cached

    sttn_params = '&'.join(f'sttn_cd={cd}' for cd in STATION_NAME_TO_CODE.values())
    url = (
        f"https://air.daegu.go.kr/index.do?period_type={period_type}"
        f"&menu_id=00000741"
        f"&menu_link=%2Ffront%2FrealTime%2FlocationRealTimeView.do"
        f"&ntw=1%2C2&{sttn_params}"
        f"&from={date_str}&fromtime=00&to={date_str}&totime=23&itm=7&itm=8"
    )

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    try:
        html = urllib.request.urlopen(req, context=ctx, timeout=15).read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"[AirCrawler] 전체측정소 크롤링 오류: {e}")
        return {}

    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if len(tables) < 2:
        return {}

    t = tables[1]
    rows = t.find_all('tr')
    if len(rows) < 3:
        return {}

    # 1. 첫 번째 행(헤더)에서 측정소 이름 목록 추출 (0번 '일자' 제외)
    th_stations = [th.get_text(strip=True) for th in rows[0].find_all(['th', 'td'])][1:]
    if not th_stations:
        return {}

    # 2. 데이터 행 찾기
    latest_row = None
    if hour_clean:
        # 특정 시간(예: '14:00') 검색
        target_suffix = f"{hour_clean}:00"
        for r in rows[2:]:
            tds = [td.get_text(strip=True) for td in r.find_all(['th', 'td'])]
            if len(tds) > 1 and tds[0].endswith(target_suffix):
                latest_row = tds
                break
        # 선택한 시간이 없으면 다른 시간으로 대체하지 않음
    elif period_type == 'DAY':
        for r in rows[2:]:
            tds = [td.get_text(strip=True) for td in r.find_all(['th', 'td'])]
            stamp = re.sub(r'[./]', '-', tds[0]) if tds else ''
            match = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', stamp)
            row_date = '-'.join([match[1], match[2].zfill(2), match[3].zfill(2)]) if match else None
            if row_date == date_str and len(tds) > 1 and any(v not in ('', '-', '점검중') for v in tds[1:]):
                latest_row = tds
                break
    else:
        for r in reversed(rows[2:]):
            tds = [td.get_text(strip=True) for td in r.find_all(['th', 'td'])]
            if len(tds) > 1 and any(v not in ('', '-', '점검중') for v in tds[1:]):
                latest_row = tds
                break

    if not latest_row:
        return {}

    time_str = latest_row[0]
    raw_cells = latest_row[1:]

    def _pm10_grade(val):
        if val <= 30:   return {'level': 1, 'text': '좋음',    'color': '#3b82f6'}
        elif val <= 80: return {'level': 2, 'text': '보통',    'color': '#10b981'}
        elif val <= 150:return {'level': 3, 'text': '나쁨',    'color': '#f59e0b'}
        else:           return {'level': 4, 'text': '매우나쁨', 'color': '#ef4444'}

    def _pm25_grade(val):
        if val <= 15:   return {'level': 1, 'text': '좋음',    'color': '#3b82f6'}
        elif val <= 35: return {'level': 2, 'text': '보통',    'color': '#10b981'}
        elif val <= 75: return {'level': 3, 'text': '나쁨',    'color': '#f59e0b'}
        else:           return {'level': 4, 'text': '매우나쁨', 'color': '#ef4444'}

    result = {}
    for i, st_name in enumerate(th_stations):
        sttn_cd = STATION_NAME_TO_CODE.get(st_name)
        if not sttn_cd:
            continue
        c_idx = i * 4
        if c_idx + 3 >= len(raw_cells):
            continue

        raw_pm10 = raw_cells[c_idx + 1]
        raw_pm25 = raw_cells[c_idx + 3]

        try:
            val10 = int(raw_pm10)
        except (ValueError, TypeError):
            val10 = None

        try:
            val25 = int(raw_pm25)
        except (ValueError, TypeError):
            val25 = None

        g10 = _pm10_grade(val10) if val10 is not None else {'level': 2, 'text': '보통', 'color': '#10b981'}
        g25 = _pm25_grade(val25) if val25 is not None else {'level': 2, 'text': '보통', 'color': '#10b981'}

        # 미세먼지(PM10)와 초미세먼지(PM2.5) 중 더 높은(심각한) 등급을 종합 등급으로 채택 (환경부 CAI 기준)
        overall_grade = g25 if g25['level'] > g10['level'] else g10

        loc_info = STATIONS_LOCATION_MAP.get(sttn_cd, {})
        result[sttn_cd] = {
            'sttn_cd': sttn_cd,
            'station_name': st_name,
            'district': STATION_DISTRICT_MAP.get(sttn_cd, ''),
            'address': loc_info.get('address', ''),
            'network': loc_info.get('network', '도시대기'),
            'year': loc_info.get('year', ''),
            'lat': loc_info.get('lat'),
            'lng': loc_info.get('lng'),
            'pm10': val10 if val10 is not None else '-',
            'pm10_level': g10['level'],
            'pm10_text': g10['text'],
            'pm10_color': g10['color'],
            'pm25': val25 if val25 is not None else '-',
            'pm25_level': g25['level'],
            'pm25_text': g25['text'],
            'pm25_color': g25['color'],
            # 초미세먼지 등급을 함께 고려한 종합 대기등급
            'level': overall_grade['level'],
            'text': overall_grade['text'],
            'color': overall_grade['color'],
            'time': time_str
        }

    print(f"[AirCrawler] 전체측정소 크롤링 완료: {len(result)}개 ({time_str}, {period_type})")
    _save_cache(cache_key, result)
    _cleanup_old_cache(keep_days=2)
    return result


def get_all_districts_air_summary(date_str=None, hour_str=None):
    """
    8개 자치구 대표 측정소 PM10 & PM2.5 등급 종합 반환.
    대표 측정소가 점검 중('-')인 경우 같은 자치구의 예비(fallback) 측정소 값 자동 채택.
    """
    data = load_daegu_data()
    stations_data = {s['district']: s['pm10'] for s in data.get('monitoring_stations', [])}

    all_stations = crawl_all_stations_pm10(date_str=date_str, hour_str=hour_str)

    results = {}
    for dist, sttn_info in DISTRICT_STATION_MAP.items():
        base_pm10 = stations_data.get(dist, 65)
        primary_cd = sttn_info['sttn_cd']
        candidates = [primary_cd] + sttn_info.get('fallbacks', [])

        chosen_data = None
        for cd in candidates:
            cand = all_stations.get(cd)
            if cand and cand['pm10'] not in ('-', None, ''):
                chosen_data = cand
                break

        if not chosen_data:
            chosen_data = all_stations.get(primary_cd)

        if chosen_data and chosen_data['pm10'] not in ('-', None, ''):
            results[dist] = {
                'district': dist,
                'sttn_cd': chosen_data['sttn_cd'],
                'sttn_name': chosen_data['station_name'],
                'pm10': chosen_data['pm10'],
                'pm25': chosen_data['pm25'],
                'level': chosen_data['level'],
                'text': chosen_data['text'],
                'color': chosen_data['color'],
                'pm10_text': chosen_data['pm10_text'],
                'pm25_text': chosen_data['pm25_text'],
                'time': chosen_data.get('time', '')
            }
        else:
            val = base_pm10
            def _grade(v):
                if v <= 30:   return 1, '좋음',    '#3b82f6'
                elif v <= 80: return 2, '보통',    '#10b981'
                elif v <= 150:return 3, '나쁨',    '#f59e0b'
                else:         return 4, '매우나쁨', '#ef4444'
            level, text, color = _grade(val)

            results[dist] = {
                'district': dist,
                'sttn_cd': primary_cd,
                'sttn_name': sttn_info['name'],
                'pm10': val,
                'pm25': int(val * 0.7),
                'level': level,
                'text': text,
                'color': color,
                'pm10_text': text,
                'pm25_text': text,
                'time': ''
            }

    return results


# ==========================================================================
# 142개 읍·면·동 IDW(역거리 가중법) 공간 보간 대기질 연산 모듈
# (daegu_dust2.ipynb 규격 기반)
# ==========================================================================

_CACHED_DONGS = None

def load_dong_centroids(geojson_path=None):
    """142개 읍·면·동 GeoJSON 로드 및 대표 중심점(위경도) 계산"""
    if geojson_path is None:
        geojson_path = os.path.join(os.path.dirname(__file__), 'static', 'data', 'daegu_dong.geojson')
    dongs = []
    if not os.path.exists(geojson_path):
        return dongs
    try:
        with open(geojson_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for feat in data.get('features', []):
            props = feat.get('properties', {})
            geom = feat.get('geometry', {})
            dist = props.get('district', '')
            dong = props.get('dong', '')
            full_name = props.get('fullName', f"대구광역시 {dist} {dong}")
            
            coords = geom.get('coordinates', [])
            gtype = geom.get('type', '')
            all_pts = []
            if gtype == 'Polygon':
                for ring in coords:
                    all_pts.extend(ring)
            elif gtype == 'MultiPolygon':
                for poly in coords:
                    for ring in poly:
                        all_pts.extend(ring)
            
            if all_pts:
                avg_lng = sum(p[0] for p in all_pts) / len(all_pts)
                avg_lat = sum(p[1] for p in all_pts) / len(all_pts)
            else:
                avg_lng, avg_lat = 128.6014, 35.8714
            
            dongs.append({
                'district': dist,
                'dong': dong,
                'fullName': full_name,
                'lat': avg_lat,
                'lng': avg_lng
            })
    except Exception as e:
        print(f"[AirCollector] GeoJSON 중심점 로드 실패: {e}")
    return dongs

def haversine_km(lat1, lon1, lat2, lon2):
    """Haversine 거리 공식 (km 단위)"""
    R = 6371.0  # 지구 반지름 (km)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_dong_idw_air(station_values_map, stations_info, dong_list):
    """
    IDW 공간 보간 알고리즘 (daegu_dust2.ipynb 규격)
    - PM10: 도시대기 측정망 우선 (k=20, power=1.5)
    - PM2.5: 전체 측정망 (k=15, power=1.5)
    """
    results = {}
    
    valid_pm10_stations = []
    valid_pm25_stations = []
    
    for s in stations_info:
        name = s['name']
        v = station_values_map.get(name) or {}
        p10 = v.get('pm10')
        p25 = v.get('pm25')
        
        # PM10: 도시대기 위주
        if p10 is not None and str(p10) not in ('-', '', 'None'):
            try:
                num_p10 = float(p10)
                if s.get('network') == '도시대기':
                    valid_pm10_stations.append((s['lat'], s['lng'], num_p10, name))
            except ValueError:
                pass
        
        # PM2.5: 전체 측정망
        if p25 is not None and str(p25) not in ('-', '', 'None'):
            try:
                num_p25 = float(p25)
                valid_pm25_stations.append((s['lat'], s['lng'], num_p25, name))
            except ValueError:
                pass
    
    # fallback: 도시대기만으로 부족하면 전체 측정소 사용
    if len(valid_pm10_stations) < 3:
        for s in stations_info:
            name = s['name']
            v = station_values_map.get(name) or {}
            p10 = v.get('pm10')
            if p10 is not None and str(p10) not in ('-', '', 'None'):
                try:
                    num_p10 = float(p10)
                    valid_pm10_stations.append((s['lat'], s['lng'], num_p10, name))
                except ValueError:
                    pass

    def _idw(target_lat, target_lng, train_data, power=1.5, k=20):
        if not train_data:
            return None, None
        
        dist_list = []
        for (lat, lng, val, name) in train_data:
            d = haversine_km(target_lat, target_lng, lat, lng)
            dist_list.append((d, val, name))
        
        dist_list.sort(key=lambda x: x[0])
        actual_k = min(k, len(dist_list))
        top_k = dist_list[:actual_k]
        
        for (d, val, name) in top_k:
            if d < 0.05:  # 50m 이내
                return val, dist_list[0]
        
        weights = [1.0 / (d ** power) for (d, val, name) in top_k]
        sum_w = sum(weights)
        if sum_w == 0:
            return top_k[0][1], dist_list[0]
        
        pred = sum(w * v for w, (d, v, name) in zip(weights, top_k)) / sum_w
        return pred, dist_list[0]

    for d in dong_list:
        dist = d['district']
        dong = d['dong']
        key = f"{dist}_{dong}"
        
        pred_pm10, nearest_pm10 = _idw(d['lat'], d['lng'], valid_pm10_stations, power=1.5, k=20)
        pred_pm25, nearest_pm25 = _idw(d['lat'], d['lng'], valid_pm25_stations, power=1.5, k=15)
        
        final_pm10 = round(pred_pm10, 1) if pred_pm10 is not None else 65.0
        final_pm25 = round(pred_pm25, 1) if pred_pm25 is not None else 32.0
        
        def _get_grade(v10, v25):
            if v10 <= 30:   g10 = 1, '좋음',    '#3b82f6'
            elif v10 <= 80: g10 = 2, '보통',    '#10b981'
            elif v10 <= 150:g10 = 3, '나쁨',    '#f59e0b'
            else:           g10 = 4, '매우나쁨', '#ef4444'
            
            if v25 <= 15:   g25 = 1, '좋음',    '#3b82f6'
            elif v25 <= 35: g25 = 2, '보통',    '#10b981'
            elif v25 <= 75: g25 = 3, '나쁨',    '#f59e0b'
            else:           g25 = 4, '매우나쁨', '#ef4444'
            
            return g25 if g25[0] > g10[0] else g10
        
        lvl, txt, color = _get_grade(final_pm10, final_pm25)
        
        nearest_sttn_name = nearest_pm10[2] if nearest_pm10 else '대구측정소'
        nearest_dist_km = round(nearest_pm10[0], 2) if nearest_pm10 else 0.0
        
        results[key] = {
            'district': dist,
            'dong': dong,
            'fullName': d['fullName'],
            'lat': d['lat'],
            'lng': d['lng'],
            'pm10': final_pm10,
            'pm25': final_pm25,
            'level': lvl,
            'text': txt,
            'color': color,
            'nearest_station': nearest_sttn_name,
            'nearest_dist_km': nearest_dist_km
        }
    
    # CSV 저장 (daegu_dust2.ipynb 규격)
    save_idw_to_csv(results)
    return results

def save_idw_to_csv(dong_idw_results, out_dir=None, out_filename='daegu_dong_realtime_idw.csv'):
    """행정동별 IDW 보간 결과를 CSV로 저장"""
    if out_dir is None:
        out_dir = os.path.join(os.path.dirname(__file__), 'data', 'realtime_idw')
    try:
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, out_filename)
        fieldnames = ['district', 'dong', 'fullName', 'lat', 'lng', 'PM10', 'PM2.5', 'level', 'text', 'color', 'nearest_station', 'nearest_dist_km']
        with open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for k, r in dong_idw_results.items():
                writer.writerow({
                    'district': r['district'],
                    'dong': r['dong'],
                    'fullName': r['fullName'],
                    'lat': r['lat'],
                    'lng': r['lng'],
                    'PM10': r['pm10'],
                    'PM2.5': r['pm25'],
                    'level': r['level'],
                    'text': r['text'],
                    'color': r['color'],
                    'nearest_station': r['nearest_station'],
                    'nearest_dist_km': r['nearest_dist_km']
                })
        print(f"[AirCollector] {len(dong_idw_results)}개 행정동 IDW CSV 저장 완료 -> {out_path}")
    except Exception as e:
        print(f"[AirCollector] IDW CSV 저장 실패: {e}")

def get_dong_idw_air(station_crawl_results):
    """
    크롤링한 25개 측정소 데이터를 받아 142개 읍·면·동별 IDW 대기질 산출
    """
    global _CACHED_DONGS
    if _CACHED_DONGS is None:
        _CACHED_DONGS = load_dong_centroids()
    
    stations_info = get_all_stations_locations()
    
    sttn_vals = {}
    for sttn_cd, info in station_crawl_results.items():
        st_name = info.get('station_name') or info.get('name') or ''
        clean_name = re.sub(r'\(.*?\)', '', st_name).strip()
        sttn_vals[clean_name] = {
            'pm10': info.get('pm10'),
            'pm25': info.get('pm25')
        }
    
    return calculate_dong_idw_air(sttn_vals, stations_info, _CACHED_DONGS)
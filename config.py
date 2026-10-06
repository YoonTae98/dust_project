import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# 데이터 저장 디렉터리 보장
os.makedirs(DATA_DIR, exist_ok=True)

# 대구 분진흡입차량 경로 및 도로 데이터 파일 경로
DAEGU_ROUTES_JSON_PATH = os.path.join(DATA_DIR, 'daegu_routes.json')

# 대구시 기본 지도 설정 (중심 좌표 및 줌 레벨)
DAEGU_MAP_CENTER = {
    'lat': 35.8714,
    'lng': 128.6014,
    'default_zoom': 13,
    'min_zoom': 10,
    'max_zoom': 18
}

# 대구 행정구역(8개 구·군)
DAEGU_DISTRICTS = [
    '중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군'
]
/**
 * 대구광역시 분진흡입차량 15개 권역(구간) 지리적 연속 단일 영역(Contiguous Polygons) 관제 모듈
 * (1구간 ~ 15구간, 총 2,872.6km 네트워크)
 * - 15개 구간 모두 분리되지 않고 100% 지리적으로 인접한 '단일 연속 영역'으로 재설계
 * - 15구간: 수성구 동부 (시지·고산·신매·사월·알파시티·연호) 단일 연속 권역
 * - 6구간: 달성군 서부 (다사·하빈·화원 - 계명문화대 앞 집중관리구역 4.5km 포함)
 * - 13구간: 달성군 남부 (유가읍 테크노폴리스 & 구지면 국가산단 & 현풍·논공·옥포)
 * - 가창면: 산악 지형 제외
 * - 대구 25개 공식 대기측정소 완벽 매핑
 */

const DAEGU_15_ZONES = [
  {
    id: 1,
    zoneCode: 'Z01',
    name: '1구간 (성서산단·이곡·용산·장기)',
    district: '달서구',
    lengthKm: 27.1,
    totalRoadNetKm: 252.0,
    color: '#10b981', // 에메랄드 그린
    type: 'polygon',
    matchDistricts: ['달서구'],
    matchKeywords: ['신당', '이곡', '호림', '갈산', '파호', '대천', '월암', '용산', '장기', '장동'],
    dongs: ['신당동', '이곡1동', '이곡2동', '호림동', '갈산동', '파호동', '대천동', '월암동', '용산1동', '용산2동', '장기동'],
    stations: ['710 호림동', '803 이곡동'],
    stationCodes: ['710', '803'],
    centroid: [35.850, 128.505],
    vehicle: { id: 'DS-01', name: '대구분진 1호차 (성서산단 전담)', model: '16톤 고압분진흡입차', driver: '정성서' },
    stats: { beforePm10: 76, afterPm10: 41, reductionPct: 46.1, dustKg: 125.0 },
    description: '대구 최대 성서1~5차 일반산업단지 및 주거벨트. 대형 화물차량 분진 집중 정화 구역.'
  },
  {
    id: 2,
    zoneCode: 'Z02',
    name: '2구간 (서대구산단·평리·비산·내당·원대)',
    district: '서구',
    lengthKm: 37.2,
    totalRoadNetKm: 215.3,
    color: '#fb7185', // 살몬 로즈
    type: 'polygon',
    matchDistricts: ['서구'],
    matchKeywords: ['이현', '평리', '비산', '원대', '상중이', '내당'],
    dongs: ['이현동', '평리1동', '평리2동', '평리3동', '평리4동', '평리5동', '평리6동', '비산1동', '비산2·3동', '비산4동', '비산5동', '비산6동', '비산7동', '원대동', '상중이동', '내당1동', '내당2·3동', '내당4동'],
    stations: ['704 이현동', '802 평리동', '718 내당동'],
    stationCodes: ['704', '802', '718'],
    centroid: [35.875, 128.545],
    vehicle: { id: 'DS-02', name: '대구분진 2호차 (서대구역·비산 전담)', model: '10톤 친환경분진차', driver: '강평리' },
    stats: { beforePm10: 59, afterPm10: 33, reductionPct: 44.1, dustKg: 76.8 },
    description: '서대구산단, 염색산단 및 서대구KTX역사 연결 간선도로망 집중 관리 구역.'
  },
  {
    id: 3,
    zoneCode: 'Z03',
    name: '3구간 (칠곡지구·태전·구암·국우·도남)',
    district: '북구',
    lengthKm: 18.0,
    totalRoadNetKm: 209.6,
    color: '#38bdf8', // 스카이 블루
    type: 'polygon',
    matchDistricts: ['북구'],
    matchKeywords: ['태전', '구암', '관음', '읍내', '동천', '국우', '관문', '매천', '팔달', '학정', '도남'],
    dongs: ['태전1동', '태전2동', '구암동', '관음동', '읍내동', '동천동', '국우동', '관문동', '매천동', '팔달동', '학정동', '도남동'],
    stations: ['709 태전동'],
    stationCodes: ['709'],
    centroid: [35.928, 128.550],
    vehicle: { id: 'DS-03', name: '대구분진 3호차 (칠곡강북 전담)', model: '10톤 친환경분진차', driver: '최칠곡' },
    stats: { beforePm10: 52, afterPm10: 30, reductionPct: 42.3, dustKg: 64.5 },
    description: '금호강 북부 칠곡 메가 주거지구 및 도남 공공주택지구 집중 정화 구역.'
  },
  {
    id: 4,
    zoneCode: 'Z04',
    name: '4구간 (검단산단·유통단지·산격·서변·연경)',
    district: '북구',
    lengthKm: 42.8,
    totalRoadNetKm: 224.5,
    color: '#eab308', // 골드 옐로우
    type: 'polygon',
    matchDistricts: ['북구'],
    matchKeywords: ['산격', '복현', '검단', '무태조야', '서변', '동변', '연경'],
    dongs: ['산격1동', '산격2동', '산격3동', '산격4동', '복현1동', '복현2동', '검단동', '무태조야동', '서변동', '동변동', '연경동'],
    stations: ['716 산격동'],
    stationCodes: ['716'],
    centroid: [35.905, 128.610],
    vehicle: { id: 'DS-04', name: '대구분진 4호차 (검단·유통단지 전담)', model: '10톤 친환경분진차', driver: '박유통' },
    stats: { beforePm10: 64, afterPm10: 35, reductionPct: 45.3, dustKg: 82.3 },
    description: '검단일반산단, 엑스코종합유통단지, 서변·연경 신도시를 잇는 금호강 북부 핵심 회랑.'
  },
  {
    id: 5,
    zoneCode: 'Z05',
    name: '5구간 (대구도심·침산·3공단·칠성·원도심)',
    district: '중구/북구',
    lengthKm: 16.4,
    totalRoadNetKm: 187.1,
    color: '#ec4899', // 핑크
    type: 'polygon',
    matchDistricts: ['중구', '북구'],
    matchKeywords: ['동인', '삼덕', '성내', '대봉', '남산', '침산', '노원', '칠성', '고성', '대현'],
    dongs: ['동인동', '삼덕동', '성내1동', '성내2동', '성내3동', '대봉1동', '대봉2동', '남산1동', '남산2동', '남산3동', '남산4동', '침산1동', '침산2동', '침산3동', '노원동', '칠성동', '고성동', '대현동'],
    stations: ['703 수창동', '801 만경관', '702 노원동'],
    stationCodes: ['703', '801', '702'],
    centroid: [35.875, 128.585],
    vehicle: { id: 'DS-05', name: '대구분진 5호차 (원도심·침산 전담)', model: '10톤 친환경분진차', driver: '윤도심' },
    stats: { beforePm10: 57, afterPm10: 31, reductionPct: 45.6, dustKg: 69.4 },
    description: '대구 원도심 행정·상업 중심축 및 대구제3공단, 침산·노원 주거복합벨트.'
  },
  {
    id: 6,
    zoneCode: 'Z06',
    name: '6구간 (동대구역세권·신천·신암·공항·불로)',
    district: '동구',
    lengthKm: 24.8,
    totalRoadNetKm: 218.4,
    color: '#8b5cf6', // 바이올렛
    type: 'polygon',
    matchDistricts: ['동구'],
    matchKeywords: ['신암', '신천', '효목', '지저', '불로', '봉무'],
    dongs: ['신암1동', '신암2동', '신암3동', '신암4동', '신암5동', '신천1·2동', '신천3동', '신천4동', '효목1동', '효목2동', '지저동', '불로·봉무동'],
    stations: ['707 신암동'],
    stationCodes: ['707'],
    centroid: [35.885, 128.635],
    vehicle: { id: 'DS-06', name: '대구분진 6호차 (동대구·공항 전담)', model: '10톤 친환경분진차', driver: '김동대구' },
    stats: { beforePm10: 55, afterPm10: 32, reductionPct: 41.8, dustKg: 71.0 },
    description: '동대구KTX 복합환승센터 교통 요충지 및 대구국제공항, 이시아폴리스 진출입로 (팔공산 산림지역 제외).'
  },
  {
    id: 7,
    zoneCode: 'Z07',
    name: '7구간 (신서혁신도시·안심·율하·동촌)',
    district: '동구',
    lengthKm: 34.2,
    totalRoadNetKm: 198.6,
    color: '#06b6d4', // 시안
    type: 'polygon',
    matchDistricts: ['동구'],
    matchKeywords: ['동촌', '방촌', '해안', '안심', '율하', '신서', '혁신'],
    dongs: ['동촌동', '방촌동', '해안동', '안심1동', '안심2동', '안심3·4동', '율하동', '신서동', '혁신동'],
    stations: ['715 율하동', '708 서호동'],
    stationCodes: ['715', '708'],
    centroid: [35.865, 128.710],
    vehicle: { id: 'DS-07', name: '대구분진 7호차 (혁신도시·안심 전담)', model: '10톤 친환경분진차', driver: '이혁신' },
    stats: { beforePm10: 53, afterPm10: 30, reductionPct: 43.4, dustKg: 66.8 },
    description: '신서공공기관혁신도시 및 안심·율하 대단지 주거지구 정화 권역.'
  },
  {
    id: 8,
    zoneCode: 'Z08',
    name: '8구간 (달구벌대로·범어·만촌·시지·알파시티)',
    district: '수성구',
    lengthKm: 50.2,
    totalRoadNetKm: 215.2,
    color: '#f97316', // 오렌지
    type: 'polygon',
    matchDistricts: ['수성구'],
    matchKeywords: ['범어', '만촌', '황금', '고산', '시지', '신매', '매호', '사월', '알파', '연호', '노변'],
    dongs: ['범어1동', '범어2동', '범어3동', '범어4동', '만촌1동', '만촌2동', '만촌3동', '황금1동', '황금2동', '고산1동', '고산2동', '고산3동', '시지동', '신매동', '사월동', '연호동'],
    stations: ['705 만촌동', '804 범어동', '714 시지동'],
    stationCodes: ['705', '804', '714'],
    centroid: [35.850, 128.665],
    vehicle: { id: 'DS-08', name: '대구분진 8호차 (달구벌대로·시지 전담)', model: '10톤 친환경분진차', driver: '한수성' },
    stats: { beforePm10: 54, afterPm10: 29, reductionPct: 46.3, dustKg: 78.5 },
    description: '대구 최장 달구벌대로 동부 간선축(범어~만촌~연호~시지~알파시티)을 단일 통일한 고효율 권역.'
  },
  {
    id: 9,
    zoneCode: 'Z09',
    name: '9구간 (앞산·대명·봉덕·이천·지산·범물)',
    district: '남구/수성구',
    lengthKm: 33.1,
    totalRoadNetKm: 245.8,
    color: '#6366f1', // 인디고
    type: 'polygon',
    matchDistricts: ['남구', '수성구'],
    matchKeywords: ['대명', '봉덕', '이천', '두산', '지산', '범물', '상동', '중동', '수성동'],
    dongs: ['대명1동', '대명2동', '대명3동', '대명4동', '대명5동', '대명6동', '대명9동', '대명10동', '대명11동', '봉덕1동', '봉덕2동', '봉덕3동', '이천동', '두산동', '지산1동', '지산2동', '범물1동', '범물2동', '상동', '중동', '수성1가동', '수성2·3가동', '수성4가동'],
    stations: ['701 대명동', '805 대명2동', '717 지산동'],
    stationCodes: ['701', '805', '717'],
    centroid: [35.835, 128.600],
    vehicle: { id: 'DS-09', name: '대구분진 9호차 (남구·지산범물 전담)', model: '10톤 친환경분진차', driver: '조앞산' },
    stats: { beforePm10: 51, afterPm10: 28, reductionPct: 45.1, dustKg: 74.2 },
    description: '앞산순환로, 신천대로 남부 및 대명·봉덕·지산·범물 주거벨트 집중 정화.'
  },
  {
    id: 10,
    zoneCode: 'Z10',
    name: '10구간 (월배·상인·도원·대곡2·진천·두류)',
    district: '달서구',
    lengthKm: 27.0,
    totalRoadNetKm: 268.0,
    color: '#a855f7', // 퍼플
    type: 'polygon',
    matchDistricts: ['달서구'],
    matchKeywords: ['월성', '진천', '상인', '도원', '대곡', '유천', '두류', '본리', '감삼', '죽전', '송현', '본동'],
    dongs: ['월성1동', '월성2동', '진천동', '상인1동', '상인2동', '상인3동', '도원동', '대곡동', '유천동', '두류1·2동', '두류3동', '본리동', '감삼동', '죽전동', '송현1동', '송현2동', '본동'],
    stations: ['712 진천동', '713 대곡동'],
    stationCodes: ['712', '713'],
    centroid: [35.825, 128.535],
    vehicle: { id: 'DS-10', name: '대구분진 10호차 (월배·대곡·두류 전담)', model: '16톤 고압분진흡입차', driver: '배월배' },
    stats: { beforePm10: 56, afterPm10: 31, reductionPct: 44.6, dustKg: 91.5 },
    description: '대곡2지구, 월배신도시, 상인·도원 대단지 및 두류공원 주변 간선도로망.'
  },
  {
    id: 11,
    zoneCode: 'Z11',
    name: '11구간 (달성북부·다사·하빈·세천산단·서재)',
    district: '달성군',
    lengthKm: 35.9,
    totalRoadNetKm: 142.5,
    color: '#3b82f6', // 코발트 블루
    type: 'polygon',
    isDalseongSpecial: true,
    matchDistricts: ['달성군'],
    matchKeywords: ['다사', '하빈', '세천', '서재', '문양', '대실', '매곡', '죽곡', '박곡'],
    dongs: ['다사읍', '하빈면'],
    stations: ['706 다사읍'],
    stationCodes: ['706'],
    centroid: [35.865, 128.460],
    vehicle: { id: 'DS-11', name: '대구분진 11호차 (다사·세천산단 전담)', model: '16톤 고압분진흡입차', driver: '권다사' },
    stats: { beforePm10: 60, afterPm10: 33, reductionPct: 45.0, dustKg: 78.6 },
    description: '금호강 연접 다사 대단지 주거지구 및 세천성서5차산단, 서재·하빈 북부 도로망.'
  },
  {
    id: 12,
    zoneCode: 'Z12',
    name: '12구간 (달성중부·화원·옥포·논공일반산단)',
    district: '달성군',
    lengthKm: 46.4,
    totalRoadNetKm: 156.0,
    color: '#0284c7', // 스카이 다크블루
    type: 'polygon',
    isDalseongSpecial: true,
    matchDistricts: ['달성군'],
    matchKeywords: ['화원', '옥포', '논공', '명곡', '설화', '교항', '본리', '남리', '북리'],
    dongs: ['화원읍', '옥포읍', '논공읍'],
    stations: ['719 화원읍', '720 논공읍'],
    stationCodes: ['719', '720'],
    centroid: [35.795, 128.450],
    vehicle: { id: 'DS-12', name: '대구분진 12호차 (화원·논공산단 전담)', model: '16톤 고압분진흡입차', driver: '이논공' },
    stats: { beforePm10: 63, afterPm10: 34, reductionPct: 46.0, dustKg: 88.4 },
    description: '화원명곡·옥포 주거축 및 논공일반산업단지 대형 화물차량 비산먼지 정화 구역.'
  },
  {
    id: 13,
    zoneCode: 'Z13',
    name: '13구간 (달성남부·현풍·유가테크노·대구국가산단·구지)',
    district: '달성군',
    lengthKm: 24.7,
    totalRoadNetKm: 219.6,
    color: '#14b8a6', // 틸 에메랄드
    type: 'polygon',
    isDalseongSpecial: true,
    matchDistricts: ['달성군'],
    matchKeywords: ['유가', '구지', '현풍'],
    dongs: ['유가읍', '구지면', '현풍읍'],
    stations: ['711 유가읍'],
    stationCodes: ['711'],
    centroid: [35.680, 128.445],
    vehicle: { id: 'DS-13', name: '대구분진 13호차 (테크노·국가산단 전담)', model: '16톤 고압분진흡입차', driver: '송구지' },
    stats: { beforePm10: 58, afterPm10: 31, reductionPct: 46.5, dustKg: 89.2 },
    description: '대구국가산업단지 1·2단계 및 유가 테크노폴리스 첨단 산학연 거점 전담 정화 권역.'
  }
];

// 차량 운행 총 연장 거리 (1~13구간 공식 운행 노선 합계: 417.8km)
const DAEGU_TOTAL_ZONE_KM = 417.8;

// 전역 레이어 관리 객체
let zonePolygonLayerGroup = null;
let zoneLabelLayerGroup = null;
let zoneCorridorGroup = null;
let selectedZoneId = null;
let hoveredZoneId = null;
let isZoneOverlayVisible = false;

/**
 * 142개 동 중 특정 동이 속한 구간 정보 반환 (가창면 제외)
 */
function findZoneForDong(distName, dongName) {
  distName = (distName || '').trim();
  dongName = (dongName || '').trim();

  // 산악 지형인 가창면은 분진차량 운행구간에서 완전 제외
  if (dongName === '가창면') return null;

  for (let z of DAEGU_15_ZONES) {
    if (z.matchDistricts && z.matchDistricts.includes(distName)) {
      if (z.matchKeywords && z.matchKeywords.some(kw => dongName.includes(kw))) {
        return z;
      }
    }
  }
  return null;
}

/**
 * Feature 객체에서 해당하는 구간 정보 검색 (urban zone GeoJSON & 일반 행정동 GeoJSON 동시 지원)
 */
function findZoneForFeature(feature) {
  if (!feature || !feature.properties) return null;
  if (feature.properties.zone_id) {
    return DAEGU_15_ZONES.find(z => z.id === feature.properties.zone_id) || null;
  }
  const dist = (feature.properties.district || '').trim();
  const dong = (feature.properties.dong || '').trim();
  return findZoneForDong(dist, dong);
}

let daegu15UrbanZonesData = null;
let selectedZoneHighlightLayer = null;

/**
 * 선택된 운행구간의 실제 SVG 경계선 전용 최상단 네온 하이라이트 오버레이 (행정구역과 동일한 방식)
 * 내부는 100% 투명하게 유지하여 구간의 기존 투명도를 완벽히 보존하고, 테두리만 또렷하게 강조합니다.
 */
function updateZoneHighlightOverlay(zoneId) {
  const map = window.leafletMapInstance || (typeof leafletMapInstance !== 'undefined' ? leafletMapInstance : null);
  if (!map) return;

  // 기존 하이라이트 오버레이 제거
  if (selectedZoneHighlightLayer && map.hasLayer(selectedZoneHighlightLayer)) {
    map.removeLayer(selectedZoneHighlightLayer);
    selectedZoneHighlightLayer = null;
  }

  if (!zoneId || (typeof isZoneOverlayVisible !== 'undefined' && !isZoneOverlayVisible)) return;

  const geojson = daegu15UrbanZonesData || window.daeguDongGeoJsonData;
  if (!geojson || !geojson.features) return;

  const targetFeatures = geojson.features.filter(f => {
    if (!f.properties) return false;
    const z = findZoneForFeature(f);
    return z && z.id === zoneId;
  });

  if (targetFeatures.length > 0) {
    selectedZoneHighlightLayer = L.geoJSON(targetFeatures, {
      style: {
        fill: false,
        fillOpacity: 0, // 내부는 100% 투명하게 하여 이전 투명도(0.35) 완벽 보존
        color: '#ffffff', // 선명한 화이트 네온 외곽선
        weight: 3.5, // 또렷하고 깔끔한 외곽선 두께
        opacity: 1,
        dashArray: '',
        className: 'selected-zone-neon-path'
      },
      interactive: false // 마우스 이벤트는 아래 레이어로 통과
    });

    selectedZoneHighlightLayer.addTo(map);
    selectedZoneHighlightLayer.bringToFront();
  }
}


/**
 * 15개 구간 지도 시각화 초기화 (산림/임야 제외된 도심 생활권·도로 기반 GeoJSON Polygon 영역 렌더링)
 */
async function init15ZoneVisualization() {
  const map = window.leafletMapInstance || (typeof leafletMapInstance !== 'undefined' ? leafletMapInstance : null);

  if (!map) {
    renderZoneDashboardCard();
    setTimeout(init15ZoneVisualization, 200);
    return;
  }

  // 레이어 그룹 생성
  if (!zonePolygonLayerGroup) zonePolygonLayerGroup = L.featureGroup();
  if (!zoneLabelLayerGroup) zoneLabelLayerGroup = L.featureGroup();
  if (!zoneCorridorGroup) zoneCorridorGroup = L.featureGroup();

  zonePolygonLayerGroup.clearLayers();
  zoneLabelLayerGroup.clearLayers();
  zoneCorridorGroup.clearLayers();

  // 1. 산림이 제외된 15개 운행구간 전용 GeoJSON 데이터 로드
  if (!daegu15UrbanZonesData) {
    try {
      const res = await fetch('/static/data/daegu_15_urban_zones.geojson?v=' + Date.now());
      if (res.ok) {
        daegu15UrbanZonesData = await res.json();
      }
    } catch (err) {
      console.warn('daegu_15_urban_zones.geojson 로드 실패, 기본 행정동으로 대체:', err);
    }
  }

  const geojsonToRender = daegu15UrbanZonesData || window.daeguDongGeoJsonData;
  if (!geojsonToRender) {
    renderZoneDashboardCard();
    setTimeout(init15ZoneVisualization, 200);
    return;
  }

  // 15개 구간별 색상 및 영역 바인딩
  const zoneGeoJsonLayer = L.geoJSON(geojsonToRender, {
    style: getZoneDongPolygonStyle,
    onEachFeature: onEachZoneFeature
  });

  zonePolygonLayerGroup.addLayer(zoneGeoJsonLayer);

  // 2. 각 구간 영역 중심에 깔끔한 "구간 번호 & 연장 거리(km)" 텍스트 배지 라벨 배치 (핀 마커 대체)
  DAEGU_15_ZONES.forEach(zone => {
    const labelHtml = `
      <div class="zone-area-label" id="zone-label-${zone.id}" style="--zone-color: ${zone.color};" onclick="selectZone(${zone.id})" title="${zone.name}">
        <span class="zal-num">${zone.id}구간</span>
      </div>
    `;

    const labelIcon = L.divIcon({
      html: labelHtml,
      className: 'zone-area-label-icon',
      iconSize: [84, 34],
      iconAnchor: [42, 17]
    });

    const labelMarker = L.marker(zone.centroid, { icon: labelIcon, zIndexOffset: 850 });
    labelMarker.zoneData = zone;
    labelMarker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectZone(zone.id);
    });

    zoneLabelLayerGroup.addLayer(labelMarker);

    // 3. 간선/코리더형 구간(5, 6, 12구간 등) 고속 광역 도로 밴드 생성
    if (zone.points && zone.points.length > 0) {
      const polyline = L.polyline(zone.points, {
        color: zone.color,
        weight: zone.id === 6 ? 7.5 : 5.5,
        opacity: 0.92,
        lineJoin: 'round',
        lineCap: 'round',
        className: `zone-corridor-line zone-corridor-${zone.id}`
      });

      polyline.zoneData = zone;
      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectZone(zone.id);
      });

      zoneCorridorGroup.addLayer(polyline);
    }

    // 4. 6구간 계명문화대 앞 집중관리구역 (4.5km) 특별 콜아웃 배지
    if (zone.isIntensive && zone.intensiveCoords) {
      const intensiveHtml = `
        <div class="intensive-zone-callout" onclick="selectZone(6)" title="계명문화대 앞 분진흡입 집중관리구역 (4.5km)">
          <span class="iz-pulse"></span>
          <span class="iz-tag">집중관리구역</span>
          <span class="iz-dist">(4.5km)</span>
        </div>
      `;
      const intensiveIcon = L.divIcon({
        html: intensiveHtml,
        className: 'intensive-custom-icon',
        iconSize: [170, 38],
        iconAnchor: [85, 42]
      });
      const intensiveMarker = L.marker(zone.intensiveCoords, { icon: intensiveIcon, zIndexOffset: 950 });
      intensiveMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectZone(6);
      });
      zoneLabelLayerGroup.addLayer(intensiveMarker);
    }
  });

  // 지도에 레이어 추가
  if (isZoneOverlayVisible) {
    zonePolygonLayerGroup.addTo(map);
    zoneCorridorGroup.addTo(map);
    zoneLabelLayerGroup.addTo(map);
  }

  // 15구간 컨트롤 UI 동기화
  renderZoneDashboardCard();
}

/**
 * 전역 배지 운행거리 업데이트 헬퍼
 */
function updateZoneLabelDriveKm(zoneId, driveKm) {
  const labelEl = document.getElementById(`zone-label-${zoneId}`);
  if (labelEl) {
    labelEl.setAttribute('title', `${zoneId}구간`);
  }
}
window.updateZoneLabelDriveKm = updateZoneLabelDriveKm;

/**
 * 15개 구간별 도심/도로 폴리곤 영역 스타일링 (산림 제외)
 */
function getZoneDongPolygonStyle(feature) {
  if (!feature || !feature.properties) return {};

  const dist = (feature.properties.district || '').trim();
  const dong = (feature.properties.dong || '').trim();

  // 가창면 및 공산동·도평동 산악지역은 분진차량 구간에서 제외 (투명/비활성 처리)
  if (dong === '가창면' || dong === '공산동' || dong === '도평동') {
    return {
      fillColor: '#1e293b',
      fillOpacity: 0.1,
      color: '#475569',
      weight: 1,
      opacity: 0.35,
      dashArray: '3'
    };
  }

  const zone = findZoneForFeature(feature);
  if (!zone) {
    return {
      fillColor: '#475569',
      fillOpacity: 0.15,
      color: '#64748b',
      weight: 1,
      opacity: 0.5
    };
  }

  const isSelected = selectedZoneId === zone.id;
  const isHovered = hoveredZoneId === zone.id;

  // [핵심] 행정구역과 동일한 원칙: 클릭/선택 시에도 투명도는 절대 변하지 않고, 오직 테두리만 강조!
  // 배경 도로 및 지도가 맑고 깨끗하게 보이도록 기본 농도를 0.20으로 은은하게 조정
  const BASE_ZONE_FILL_OPACITY = 0.20;

  if (selectedZoneId) {
    if (isSelected) {
      // 선택된 구간: 내부는 기본 투명도(0.35) 완벽 유지 + 테두리만 또렷한 화이트 강조
      return {
        fillColor: zone.color,
        fillOpacity: BASE_ZONE_FILL_OPACITY,
        color: '#ffffff',
        weight: 3.5,
        opacity: 1,
        dashArray: ''
      };
    } else {
      // 비선택 구간: 투명도가 옅어지지 않고 원래 기본 투명도(0.35) 그대로 유지
      return {
        fillColor: zone.color,
        fillOpacity: BASE_ZONE_FILL_OPACITY,
        color: zone.color,
        weight: 1.5,
        opacity: 0.75,
        dashArray: ''
      };
    }
  }

  if (isHovered) {
    // 호버 시에도 투명도는 동일하게 유지하고 테두리만 살짝 강조
    return {
      fillColor: zone.color,
      fillOpacity: BASE_ZONE_FILL_OPACITY,
      color: '#ffffff',
      weight: 2.5,
      opacity: 0.95,
      dashArray: ''
    };
  }

  // 기본 상태: 15개 구간별 고유 색상 및 기본 테두리
  return {
    fillColor: zone.color,
    fillOpacity: BASE_ZONE_FILL_OPACITY,
    color: zone.color,
    weight: 1.5,
    opacity: 0.75,
    dashArray: ''
  };
}

/**
 * 각 구간 영역(폴리곤) 마우스 이벤트 바인딩
 */
function onEachZoneFeature(feature, layer) {
  const zone = findZoneForFeature(feature);
  if (!zone) return;

  layer.on({
    mouseover: function (e) {
      if (typeof patrolNavActive !== 'undefined' && patrolNavActive) return;
      if (document.body.classList.contains('nav-active')) return;
      if (hoveredZoneId !== zone.id) {
        hoveredZoneId = zone.id;
        refreshZonePolygonStyles();
      }
      const activeLabel = document.getElementById(`zone-label-${zone.id}`);
      if (activeLabel) activeLabel.classList.add('hovered');
    },
    mouseout: function (e) {
      if (hoveredZoneId === zone.id) {
        hoveredZoneId = null;
        refreshZonePolygonStyles();
      }
      const activeLabel = document.getElementById(`zone-label-${zone.id}`);
      if (activeLabel && selectedZoneId !== zone.id) activeLabel.classList.remove('hovered');
    },
    click: function (e) {
      if (typeof patrolNavActive !== 'undefined' && patrolNavActive) return;
      if (document.body.classList.contains('nav-active')) return;
      L.DomEvent.stopPropagation(e);
      selectZone(zone.id);
    }
  });
}

/**
 * 모든 구간 폴리곤 레이어 스타일 실시간 리프레시
 */
function refreshZonePolygonStyles() {
  if (!zonePolygonLayerGroup) return;
  zonePolygonLayerGroup.eachLayer(layer => {
    if (typeof layer.setStyle === 'function') {
      layer.setStyle(getZoneDongPolygonStyle);
    }
    if (layer.eachLayer) {
      layer.eachLayer(child => {
        if (typeof child.setStyle === 'function') {
          child.setStyle(getZoneDongPolygonStyle(child.feature));
        }
        if (child.feature) {
          const zone = findZoneForFeature(child.feature);
          if (zone && zone.id === selectedZoneId && typeof child.bringToFront === 'function') {
            child.bringToFront();
          }
        }
      });
    }
  });
}

/**
 * 우측 하단 15개 분진흡입 운행구간 전용 대시보드 카드 렌더링
 * (1~15구간 순환 네비게이터 지원)
 */
function renderZoneDashboardCard(selectedZone = null) {
  const card = document.getElementById('zone-dashboard-card');
  if (!card) return;

  // 기본값: 1구간
  if (!selectedZone) {
    selectedZone = DAEGU_15_ZONES.find(z => z.id === selectedZoneId) || DAEGU_15_ZONES[0];
  }

  const currentId = selectedZone.id;
  const totalZones = DAEGU_15_ZONES.length || 13;
  const prevId = currentId === 1 ? totalZones : currentId - 1;
  const nextId = currentId === totalZones ? 1 : currentId + 1;

  // 1. 드롭다운 빠른 이동 옵션 HTML (1~13구간 표출)
  let optionsHtml = '';
  DAEGU_15_ZONES.forEach(z => {
    const isSelected = selectedZone.id === z.id ? 'selected' : '';
    optionsHtml += `<option value="${z.id}" ${isSelected}>${z.id}구간 - ${z.name.replace(/^\d+구간\s*\(/, '').replace(/\)$/, '')}</option>`;
  });

  // 2. 일체형 스마트 네비게이터 바 (좌우 넘김 버튼 + 중앙 드롭다운 통합)
  const integratedNavBarHtml = `
    <div class="zone-integrated-nav-bar">
      <button class="zone-pager-nav-btn prev-btn" onclick="navigateZone(-1)" title="${prevId}구간으로 이동">
        <i data-lucide="chevron-left"></i>
      </button>

      <select id="zone-quick-select" class="custom-select zone-integrated-select" onchange="selectZone(Number(this.value));">
        ${optionsHtml}
      </select>

      <button class="zone-pager-nav-btn next-btn" onclick="navigateZone(1)" title="${nextId}구간으로 이동">
        <i data-lucide="chevron-right"></i>
      </button>
    </div>
  `;

  // 3. 내용 렌더링
  const dongsPreview = selectedZone.dongs.slice(0, 8).join(', ') + (selectedZone.dongs.length > 8 ? ` 외 ${selectedZone.dongs.length - 8}개동` : '');

  // 1~13 전 구간 실시간 대기반응형 동적 노선 액션 바 (우측 하단)
  let dynamicActionHtml = '';
  const isCurrentZoneActive = window.currentDynamicRouteData && window.currentDynamicRouteData.zone_id === selectedZone.id;
  if (isCurrentZoneActive) {
    dynamicActionHtml = `
      <div class="zdc-dynamic-container">
        <div class="zdc-dynamic-btn-row">
          <button class="btn-generate-dynamic-route" id="btn-gen-dynamic-z1" onclick="generateAndDisplayDynamicRoute(${selectedZone.id})" title="${selectedZone.id}구간 선택한 날짜의 대기현황 기반 노선 다시 생성">
            <i data-lucide="zap" style="width: 14px; height: 14px;"></i>
            <span>${selectedZone.id}구간 노선 재생성</span>
          </button>
          <button class="zdc-btn-detail" onclick="openDynamicRoutePanel()" title="상세 작업지시서 및 함대 관제 모달 열기">
            <i data-lucide="clipboard-list" style="width: 14px; height: 14px;"></i>
            <span>추천 경로 상세</span>
          </button>
        </div>
      </div>
    `;
  } else {
    dynamicActionHtml = `
      <div class="zdc-dynamic-action-row">
        <button class="btn-generate-dynamic-route" id="btn-gen-dynamic-z1" onclick="generateAndDisplayDynamicRoute(${selectedZone.id})" title="${selectedZone.id}구간(${selectedZone.district}) 선택한 날짜의 대기현황 기반 추천경로 생성">
          <i data-lucide="zap" style="width: 15px; height: 15px;"></i>
          <span>${selectedZone.id}구간 추천 경로 생성</span>
        </button>
      </div>
    `;
  }

  const hasDynEff = isCurrentZoneActive && window.currentDynamicRouteData &&
    (window.currentDynamicRouteData.static_comparison?.efficiency_gain_pct != null ||
      window.currentDynamicRouteData.fleet_summary?.efficiency_gain_pct != null);

  const effPct = hasDynEff
    ? (window.currentDynamicRouteData.static_comparison?.efficiency_gain_pct ?? window.currentDynamicRouteData.fleet_summary?.efficiency_gain_pct)
    : selectedZone.stats.reductionPct;

  const effSubText = hasDynEff
    ? `(A노선 대비)`
    : `(${selectedZone.stats.beforePm10}→${selectedZone.stats.afterPm10})`;

  const effPrefix = hasDynEff ? '+' : '-';

  const displayDriveKm = (isCurrentZoneActive && window.currentDynamicRouteData && window.currentDynamicRouteData.dynamic_route)
    ? window.currentDynamicRouteData.dynamic_route.total_dist_km
    : null;

  // 행정동별 후보 청소거점 커버리지에 43.3% 기준효율을 비례 적용한 대리지표.
  const currentEffect = isCurrentZoneActive ? window.currentDynamicRouteData?.effect_comparison : null;
  const aiEffect = currentEffect?.routes?.AI || null;
  const avgDistanceHtml = (displayDriveKm !== null && displayDriveKm !== undefined && Number.isFinite(Number(displayDriveKm)))
    ? `${Number(displayDriveKm).toFixed(2)} km`
    : `-- <span class="metric-sub-val">(경로 생성 대기)</span>`;
  const improve = currentEffect?.ai_improvement_pct;
  const compareMetricHtml = (improve !== null && improve !== undefined && Number.isFinite(Number(improve)))
    ? `${Number(improve) >= 0 ? '+' : ''}${Number(improve).toFixed(1)}% <span class="metric-sub-val">(기존 평균 -${Number(currentEffect.abc_mean_reduction_pct).toFixed(1)}%)</span>`
    : `-- <span class="metric-sub-val">(비교 계산 대기)</span>`;

  card.innerHTML = `
    <div class="zdc-header">
      <div class="zdc-tag" style="background: ${selectedZone.color}25; color: ${selectedZone.color}; border-color: ${selectedZone.color}60;">
        [${selectedZone.id}구간] ${selectedZone.district} 관제 영역 ${selectedZone.isIntensive ? '⚡집중관리' : ''}
      </div>
    </div>

    <!-- 일체형 네비게이터 (아이콘 버튼 + 드롭다운) -->
    ${integratedNavBarHtml}

    <div class="metric-grid">
      <div class="metric-item">
        <span class="metric-label">평균 운행 거리</span>
        <strong class="metric-val" style="color: ${selectedZone.color};">${avgDistanceHtml}</strong>
      </div>
      <div class="metric-item">
        <span class="metric-label">기존경로 성능비교</span>
        <strong class="metric-val" style="color:#fbbf24;">${compareMetricHtml}</strong>
      </div>
    </div>

    ${dynamicActionHtml}
  `;

  if (isCurrentZoneActive && typeof window.updateZoneLabelDriveKm === 'function') {
    window.updateZoneLabelDriveKm(selectedZone.id, displayDriveKm);
  }

  card.style.display = 'block';
  if (window.lucide) lucide.createIcons();
}

/**
 * 좌우 넘기기 탐색 함수 (-1: 이전, +1: 다음) - 1~16구간 순환
 */
function navigateZone(direction) {
  const total = DAEGU_15_ZONES.length || 16;
  const currentId = selectedZoneId || 1;
  let nextId = currentId + direction;
  if (nextId > total) nextId = 1;
  if (nextId < 1) nextId = total;

  selectZone(nextId);
}

function focusZoneSelect() {
  const sel = document.getElementById('zone-quick-select');
  if (sel) sel.focus();
}

/**
 * 특정 구간 선택 시 하이라이트 & 줌 & 우측 하단 대시보드 카드 표출
 */
function selectZone(zoneId, shouldZoom = false) {
  const zone = DAEGU_15_ZONES.find(z => z.id === zoneId);
  if (!zone) return;

  selectedZoneId = zoneId;

  // 0. 행정구역 하이라이트/선택 상태가 남아있다면 즉시 제거
  const map = window.leafletMapInstance || (typeof leafletMapInstance !== 'undefined' ? leafletMapInstance : null);
  if (typeof updateDongHighlightOverlay === 'function') {
    updateDongHighlightOverlay(null);
  }
  if (map && window.selectedDongHighlightLayer && map.hasLayer(window.selectedDongHighlightLayer)) {
    map.removeLayer(window.selectedDongHighlightLayer);
    window.selectedDongHighlightLayer = null;
  }
  if (typeof selectedDistrict !== 'undefined') selectedDistrict = null;
  if (typeof selectedDongName !== 'undefined') selectedDongName = null;

  // 1. 라벨 상태 갱신
  document.querySelectorAll('.zone-area-label').forEach(m => m.classList.remove('active'));
  const activeLabel = document.getElementById(`zone-label-${zoneId}`);
  if (activeLabel) activeLabel.classList.add('active');

  // 2. 15개 구간 폴리곤 영역 스타일 갱신 (투명도 불변, 테두리만 강조)
  refreshZonePolygonStyles();

  // 2-2. 행정구역 방식: 최상단 외곽선 전용 네온 오버레이 생성
  updateZoneHighlightOverlay(zoneId);

  // 3. 간선 코리더 라인 강조
  if (zoneCorridorGroup) {
    zoneCorridorGroup.eachLayer(layer => {
      if (layer.zoneData) {
        if (layer.zoneData.id === zoneId) {
          layer.setStyle({ weight: 9.5, opacity: 1, color: '#ffffff' });
          layer.bringToFront();
        } else {
          layer.setStyle({ weight: 4, opacity: 0.35, color: layer.zoneData.color });
        }
      }
    });
  }

  // 3-2. 기존 더미 노선이 켜져 있을 때만 해당 구간 도로망 노선 스타일 갱신 및 강조
  const routePolys = window.leafletRoutePolylines || (typeof leafletRoutePolylines !== 'undefined' ? leafletRoutePolylines : null);
  if (routePolys && routePolys.length > 0 && window.isDummyRoutesVisible) {
    routePolys.forEach(poly => {
      if (poly.routeData) {
        const color = poly.routeData.color || '#a855f7';
        if (poly.routeData.zone_id === zoneId) {
          poly.setStyle({ weight: 7.5, opacity: 1, color: color });
          poly.bringToFront();
        } else {
          // [사용자 요청]: 더미 노선 투명도 낮게 한 것 풀고 또렷하게 고정 (0.88)
          poly.setStyle({ weight: 5.0, opacity: 0.88, color: color });
        }
      }
    });
  }

  // 이미 생성된 동적 최적 노선 데이터가 있는 경우 해당 구간 선택 시 활성화 보장
  if (window.currentDynamicRouteData && window.currentDynamicRouteData.zone_id === zoneId && typeof window.ensureDynamicRouteLoadedAndVisible === 'function') {
    window.ensureDynamicRouteLoadedAndVisible(false);
  }

  // 4. 지도 화면 해당 구간 영역 줌/이동 (사용자 요청: 클릭 시 캔버스 사이즈/뷰 자동조정 비활성화)
  if (shouldZoom) {
    const map = window.leafletMapInstance || (typeof leafletMapInstance !== 'undefined' ? leafletMapInstance : null);
    if (map) {
      if (zone.isDalseongSpecial) {
        map.setView(zone.centroid, 12, { animate: true });
      } else if (zone.id === 6) {
        map.setView([35.855, 128.460], 12, { animate: true });
      } else {
        map.setView(zone.centroid, 13, { animate: true });
      }
    }
  }

  // 5. 우측 하단 대시보드 카드에 선택 구간 정보 표출
  renderZoneDashboardCard(zone);
}

/**
 * 전체 구간 조망으로 복귀
 */
function resetZoneSelection() {
  selectedZoneId = null;
  hoveredZoneId = null;

  document.querySelectorAll('.zone-area-label').forEach(m => m.classList.remove('active'));

  refreshZonePolygonStyles();
  updateZoneHighlightOverlay(null);

  if (zoneCorridorGroup) {
    zoneCorridorGroup.eachLayer(layer => {
      if (layer.zoneData) {
        layer.setStyle({ weight: layer.zoneData.id === 6 ? 7.5 : 5.5, opacity: 0.92, color: layer.zoneData.color });
      }
    });
  }

  // 도로망 노선 스타일 원복
  const routePolys = window.leafletRoutePolylines || (typeof leafletRoutePolylines !== 'undefined' ? leafletRoutePolylines : null);
  if (routePolys && routePolys.length > 0) {
    routePolys.forEach(poly => {
      if (poly.routeData) {
        poly.setStyle({ weight: 4.8, opacity: 0.9, color: poly.routeData.color || '#a855f7' });
      }
    });
  }

  const map = window.leafletMapInstance || (typeof leafletMapInstance !== 'undefined' ? leafletMapInstance : null);
  if (map) {
    map.setView([35.8714, 128.6014], 12, { animate: true });
  }

  // 우측 하단 대시보드 카드를 전체 조망 상태로 갱신
  renderZoneDashboardCard(null);
}

// 하위 호환성 및 안전 별칭 등록
function render15ZonePanelUI(selectedZone = null) {
  renderZoneDashboardCard(selectedZone);
}

// 전역 함수 노출
window.DAEGU_15_ZONES = DAEGU_15_ZONES;
window.init15ZoneVisualization = init15ZoneVisualization;
window.selectZone = selectZone;
window.resetZoneSelection = resetZoneSelection;
window.refreshZonePolygonStyles = refreshZonePolygonStyles;
window.updateZoneHighlightOverlay = updateZoneHighlightOverlay;
window.renderZoneDashboardCard = renderZoneDashboardCard;
window.render15ZonePanelUI = renderZoneDashboardCard;

// DOM 로드 즉시 우측 하단 카드 렌더링 및 초기화 보장
document.addEventListener('DOMContentLoaded', () => {
  renderZoneDashboardCard(null);
  setTimeout(init15ZoneVisualization, 100);
});

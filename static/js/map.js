// ==========================================================================
// 대구 분진흡입차량 운행 분석 & 실시간 대기정보(air.daegu.go.kr) 관제 JS
// 네이버 지도 스타일 통합 맵 엔진 (일반지도 ↔ 위성사진, 행정구역 & 도로망 오버레이)
// ==========================================================================

let allVehicles = [];
let allRoutes = [];
let selectedDistrict = null;
let selectedDongName = null;
let selectedRouteId = null;
let routeContextRevision = 0;
let routeGenerationRequestId = 0;
let currentAirDate = null; // null이면 현재 실시간(오늘) 날짜 자동 사용
let currentMasterView = 'clean'; // 'clean' (일반/다크 도로 지도), 'satellite' (고해상도 위성사진)
let currentNaverBaseMap = 'clean'; // 'clean' 또는 'satellite'
let currentStationCode = '701'; // 기본: 수창동(중구)

// 네이버 지도 스타일 오버레이 토글 상태
let isDistrictOverlayOn = true;
let isRoutesOverlayOn = true;
let isStationsOverlayOn = true;

// Leaflet 레이어 참조
let leafletMapInstance = null;
let darkOSMTileLayer = null;
let esriSatelliteTileLayer = null;
let leafletDongLayer = null;
let selectedDongHighlightLayer = null; // 선택된 동 전용 최상단 네온 SVG 하이라이트 레이어
let leafletRouteLayerGroup = null;
let leafletStationLayerGroup = null; // 대기 측정소 핀 마커 레이어 그룹
let leafletRoutePolylines = [];
let daeguDongGeoJsonData = null;
let currentlyHoveredDongLayer = null;
let allStationsList = [];
let currentAirDataObj = null;

// 마우스 드래그 & 클릭 판별 제어 상태 변수
let isMapMouseDown = false;
let isMapDragging = false;
let mapMouseDownTime = 0;
let mapMouseDownPos = null;
let lastDragEndTime = 0;
let justClickedDong = false; // 동 클릭 시 맵 전역 초기화 이벤트 방지 플래그

function dismissAllTooltipsAndHovers() {
  if (currentlyHoveredDongLayer) {
    if (currentlyHoveredDongLayer.feature) {
      currentlyHoveredDongLayer.setStyle(getDongStyle(currentlyHoveredDongLayer.feature));
    } else if (leafletDongLayer) {
      leafletDongLayer.resetStyle(currentlyHoveredDongLayer);
    }
    currentlyHoveredDongLayer.closeTooltip();
    currentlyHoveredDongLayer = null;
  }
  if (leafletMapInstance) {
    leafletMapInstance.eachLayer(l => {
      if (l.closeTooltip) l.closeTooltip();
    });
  }
}

// 영문 ID <-> 한글 구·군 이름 매핑
const districtIdToName = {
  'junggu': '중구',
  'donggu': '동구',
  'seogu': '서구',
  'namgu': '남구',
  'bukgu': '북구',
  'suseonggu': '수성구',
  'dalseogu': '달서구',
  'dalseonggun': '달성군'
};

const districtNameToId = {
  '중구': 'junggu',
  '동구': 'donggu',
  '서구': 'seogu',
  '남구': 'namgu',
  '북구': 'bukgu',
  '수성구': 'suseonggu',
  '달서구': 'dalseogu',
  '달성군': 'dalseonggun'
};

// 자치구별 대표 대기측정소 기본 매핑
const districtToStation = {
  '중구': '701',    // 수창동
  '남구': '705',    // 대명동
  '수성구': '709',  // 만촌동
  '동구': '707',    // 신암동
  '북구': '708',    // 태전동
  '서구': '704',    // 이현동
  '달서구': '803',  // 이곡동
  '달성군': '714'   // 다사읍
};

// 동·읍·면별 가장 가까운 실제 26개 대기측정소 정밀 매핑 사전 (대구 142개 행정동 100% 매핑)
const dongToStationMap = {
  // 1. 동구 (혁신도시/안심 -> 서호동 703, 용계/율하/방촌/해안 -> 용계동 807, 신암/신천/효목/공산/불로 -> 신암동 707)
  '혁신동': '703',
  '안심1동': '703', '안심2동': '703', '안심3동': '703', '안심4동': '703', '안심동': '703',
  '서호동': '703', '신서동': '703', '동호동': '703', '각산동': '703', '괴전동': '703', '숙천동': '703', '사복동': '703',
  '방촌동': '807', '해안동': '807', '용계동': '807', '율하동': '807', '신기동': '807', '율암동': '807',
  '신암1동': '707', '신암2동': '707', '신암3동': '707', '신암4동': '707', '신암5동': '707', '신암동': '707',
  '신천1·2동': '707', '신천3동': '707', '신천4동': '707', '신천동': '707',
  '효목1동': '707', '효목2동': '707', '효목동': '707',
  '불로·봉무동': '707', '지저동': '707', '동촌동': '707', '도평동': '707', '공산동': '707',

  // 2. 수성구 (시지/고산 -> 시지동 712, 지산/범물/황금/두산/파동 -> 지산동 702, 연호 -> 연호동 806, 만촌/범어/수성 -> 만촌동 709)
  '고산1동': '712', '고산2동': '712', '고산3동': '712',
  '시지동': '712', '노변동': '712', '신매동': '712', '매호동': '712', '사월동': '712', '욱수동': '712', '고산동': '712', '가천동': '712',
  '지산1동': '702', '지산2동': '702', '지산동': '702',
  '범물1동': '702', '범물2동': '702', '범물동': '702',
  '두산동': '702', '황금1동': '702', '황금2동': '702', '황금동': '702', '상동': '702', '중동': '702', '파동': '702',
  '연호동': '806', '이천동': '806', '삼덕동': '806',
  '만촌1동': '709', '만촌2동': '709', '만촌3동': '709', '만촌동': '709',
  '범어1동': '709', '범어2동': '709', '범어3동': '709', '범어4동': '709', '범어동': '709',
  '수성1가동': '709', '수성2·3가동': '709', '수성4가동': '709', '수성동': '709',

  // 3. 달서구 (월배/진천/상인/도원/대곡 -> 진천동 713, 본동/본리/송현/성당/감삼/죽전/두류/용산 -> 본동 715, 월성/호림/공단 -> 호림동 710, 성서/이곡/신당/장기 -> 이곡동 803)
  '진천동': '713', '유천동': '713', '상인1동': '713', '상인2동': '713', '상인3동': '713', '상인동': '713', '도원동': '713', '대곡동': '713',
  '본동': '715', '본리동': '715', '송현1동': '715', '송현2동': '715', '송현동': '715',
  '성당동': '715', '감삼동': '715', '죽전동': '715', '두류1,2동': '715', '두류3동': '715', '두류동': '715',
  '용산1동': '715', '용산2동': '715', '용산동': '715',
  '월성1동': '710', '월성2동': '710', '월성동': '710',
  '호림동': '710', '갈산동': '710', '파호동': '710', '호산동': '710', '대천동': '710', '월암동': '710',
  '이곡1동': '803', '이곡2동': '803', '이곡동': '803', '신당동': '803', '장기동': '803', '장동': '803',

  // 4. 서구 (평리/비산/원대 -> 평리동 802, 내당 -> 내당동 718, 상중이동/이현/중리 -> 이현동 704)
  '평리1동': '802', '평리2동': '802', '평리3동': '802', '평리4동': '802', '평리5동': '802', '평리6동': '802', '평리동': '802',
  '비산1동': '802', '비산2·3동': '802', '비산4동': '802', '비산5동': '802', '비산6동': '802', '비산7동': '802', '비산동': '802',
  '원대동': '802',
  '내당1동': '718', '내당2·3동': '718', '내당4동': '718', '내당동': '718',
  '상중이동': '704', '이현동': '704', '중리동': '704', '상리동': '704',

  // 5. 북구 (칠곡/태전/구암/관음/읍내/동천/국우/관문 -> 태전동 708, 무태조야/서변/동변/연경 -> 서변동 805, 침산/고성/노원/칠성 -> 침산동 719, 산격/복현/대현/검단 -> 산격동 716)
  '태전1동': '708', '태전2동': '708', '태전동': '708',
  '구암동': '708', '관음동': '708', '읍내동': '708', '동천동': '708', '국우동': '708', '관문동': '708', '학정동': '708', '매천동': '708', '팔달동': '708',
  '무태조야동': '805', '서변동': '805', '동변동': '805', '연경동': '805', '조야동': '805', '노곡동': '805',
  '침산1동': '719', '침산2동': '719', '침산3동': '719', '침산동': '719',
  '고성동': '719', '노원동': '719', '칠성동': '719',
  '산격1동': '716', '산격2동': '716', '산격3동': '716', '산격4동': '716', '산격동': '716',
  '복현1동': '716', '복현2동': '716', '복현동': '716', '대현동': '716', '검단동': '716',

  // 6. 남구 (봉덕/이천 -> 충혼탑 804, 대명 -> 대명동 705)
  '봉덕1동': '804', '봉덕2동': '804', '봉덕3동': '804', '봉덕동': '804',
  '이천동': '804',
  '대명1동': '705', '대명2동': '705', '대명3동': '705', '대명4동': '705', '대명5동': '705',
  '대명6동': '705', '대명9동': '705', '대명10동': '705', '대명11동': '705', '대명동': '705',

  // 7. 달성군 (현풍/구지/유가 -> 유가읍 711, 화원/옥포/논공/가창 -> 화원읍 717, 다사/하빈 -> 다사읍 714)
  '현풍읍': '711', '구지면': '711', '유가읍': '711',
  '화원읍': '717', '옥포읍': '717', '논공읍': '717', '가창면': '717',
  '다사읍': '714', '하빈면': '714',

  // 8. 중구 (남산/대봉/동인/삼덕 -> 남산1동 720, 성내/대신/수창 -> 수창동 701)
  '남산1동': '720', '남산2동': '720', '남산3동': '720', '남산4동': '720', '남산동': '720',
  '대봉1동': '720', '대봉2동': '720', '대봉동': '720', '동인동': '720', '삼덕동': '720', '봉산동': '720',
  '성내1동': '701', '성내2동': '701', '성내3동': '701', '대신동': '701',
  '수창동': '701', '포정동': '701', '북성로': '701', '서성로': '701', '동성로': '701', '교동': '701', '태평로': '701', '달성동': '701'
};

function getStationForDong(district, dong = null) {
  if (dong) {
    const cleanDong = dong.trim();
    // 1. 142개 행정동 이름 직접 정확 일치
    if (dongToStationMap[cleanDong]) return dongToStationMap[cleanDong];

    // 2. 특수기호/숫자 정규화 후 검색 (예: '신천1·2동' -> '신천동', '두류1,2동' -> '두류동')
    const baseDong = cleanDong.replace(/[0-9·,동읍면가]/g, '');
    for (const [k, code] of Object.entries(dongToStationMap)) {
      if (cleanDong === k || cleanDong.includes(k) || (baseDong.length >= 2 && k.includes(baseDong))) {
        return code;
      }
    }
  }
  return districtToStation[district] || '701';
}


// ==========================================================================
// 대기질 4단계 등급별 공식 색상 정의 (AirKorea / 대구 실시간 대기정보 기준)
// ==========================================================================
const airGradeColors = {
  good: '#3b82f6',       // 1단계 좋음: 파랑 (0 ~ 30 ㎍/㎥)
  moderate: '#10b981',   // 2단계 보통: 초록 (31 ~ 80 ㎍/㎥)
  bad: '#f59e0b',        // 3단계 나쁨: 주황 (81 ~ 150 ㎍/㎥)
  veryBad: '#ef4444'     // 4단계 매우나쁨: 빨강 (151 ㎍/㎥ ~)
};

// 자치구별 미세먼지(PM10) 대기질 기본 데이터 및 실시간 동기화 상태
const defaultDistrictAirData = {
  '중구': { pm10: 67, level: 2, text: '보통', color: '#10b981' },
  '남구': { pm10: 63, level: 2, text: '보통', color: '#10b981' },
  '수성구': { pm10: 74, level: 2, text: '보통', color: '#10b981' },
  '동구': { pm10: 79, level: 2, text: '보통', color: '#10b981' },
  '북구': { pm10: 85, level: 3, text: '나쁨', color: '#f59e0b' },
  '서구': { pm10: 91, level: 3, text: '나쁨', color: '#f59e0b' },
  '달서구': { pm10: 88, level: 3, text: '나쁨', color: '#f59e0b' },
  '달성군': { pm10: 58, level: 2, text: '보통', color: '#10b981' }
};

let currentDistrictAirData = { ...defaultDistrictAirData };
let currentDongAirData = {};

// PM10 및 PM2.5 수치 기반 4단계 통합 대기질 등급 (환경부 CAI 방식: 둘 중 더 나쁜 등급 적용)
function getAirGrade(pm10, pm25 = null) {
  let g10 = null;
  if (pm10 !== null && pm10 !== undefined && pm10 !== '' && pm10 !== '-') {
    const v10 = Number(pm10);
    if (!isNaN(v10)) {
      if (v10 <= 30) g10 = { level: 1, text: '좋음', color: '#3b82f6', bgClass: 'bg-air-good' };
      else if (v10 <= 80) g10 = { level: 2, text: '보통', color: '#10b981', bgClass: 'bg-air-moderate' };
      else if (v10 <= 150) g10 = { level: 3, text: '나쁨', color: '#f59e0b', bgClass: 'bg-air-bad' };
      else g10 = { level: 4, text: '매우나쁨', color: '#ef4444', bgClass: 'bg-air-very-bad' };
    }
  }

  let g25 = null;
  if (pm25 !== null && pm25 !== undefined && pm25 !== '' && pm25 !== '-') {
    const v25 = Number(pm25);
    if (!isNaN(v25)) {
      if (v25 <= 15) g25 = { level: 1, text: '좋음', color: '#3b82f6', bgClass: 'bg-air-good' };
      else if (v25 <= 35) g25 = { level: 2, text: '보통', color: '#10b981', bgClass: 'bg-air-moderate' };
      else if (v25 <= 75) g25 = { level: 3, text: '나쁨', color: '#f59e0b', bgClass: 'bg-air-bad' };
      else g25 = { level: 4, text: '매우나쁨', color: '#ef4444', bgClass: 'bg-air-very-bad' };
    }
  }

  if (g10 && g25) {
    return g25.level > g10.level ? g25 : g10;
  }
  return g25 || g10 || { level: 2, text: '보통', color: '#10b981', bgClass: 'bg-air-moderate' };
}

function getAirGradeFromPm10(pm10) {
  return getAirGrade(pm10, null);
}

const stationCodeToDistrict = {
  '701': '중구',   // 수창동
  '702': '수성구', // 지산동
  '703': '동구',   // 서호동
  '704': '서구',   // 이현동
  '705': '남구',   // 대명동
  '707': '동구',   // 신암동
  '708': '북구',   // 태전동
  '709': '수성구', // 만촌동
  '710': '달서구', // 호림동
  '711': '달성군', // 유가읍
  '712': '수성구', // 시지동
  '713': '달서구', // 진천동
  '714': '달성군', // 다사읍
  '715': '달서구', // 본동
  '716': '북구',   // 산격동
  '717': '달성군', // 화원읍
  '718': '서구',   // 내당동
  '719': '북구',   // 침산동
  '720': '중구',   // 남산1동
  '802': '서구',   // 평리동
  '803': '달서구', // 이곡동
  '804': '남구',   // 충혼탑
  '805': '북구',   // 서변동
  '806': '수성구', // 연호동
  '807': '동구'    // 용계동
};

let currentAirHour = 'all';

function getTodayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
}

function updateRealtimeBadgeVisibility(dateStr = currentAirDate, hourStr = currentAirHour) {
  const badge = document.getElementById('header-realtime-badge');
  if (!badge) return;
  const todayStr = getTodayIsoDate();
  const isPastOrSpecificHour = (dateStr && dateStr !== todayStr) || (hourStr && hourStr !== 'all');
  if (isPastOrSpecificHour) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'inline-flex';
  }
}

async function fetchDistrictAirData(dateStr = currentAirDate, hourStr = currentAirHour) {
  updateRealtimeBadgeVisibility(dateStr, hourStr);
  const modal = document.getElementById('air-modal');
  const tbody = document.getElementById('district-summary-tbody');
  
  // 모달이 열려 있는 상태라면 표에 로딩 스피너 표시
  if (tbody && modal && modal.style.display !== 'none') {
    const timeLabel = (hourStr && hourStr !== 'all') ? `${hourStr}:00 ` : '';
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
          <div style="display:inline-flex; align-items:center; justify-content:center; gap:8px;">
            <i data-lucide="loader" class="spin-animation" style="width:16px;height:16px;"></i>
            <span>${dateStr ? dateStr + ' ' : ''}${timeLabel}대기 정보를 불러오는 중입니다...</span>
          </div>
        </td>
      </tr>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const params = [];
    if (dateStr) params.push(`date=${encodeURIComponent(dateStr)}`);
    if (hourStr && hourStr !== 'all') params.push(`hour=${encodeURIComponent(hourStr)}`);
    const url = '/api/air/districts' + (params.length ? `?${params.join('&')}` : '');

    const res = await fetch(url);
    const result = await res.json();
    if (result.success && result.districts) {
      currentDistrictAirData = { ...defaultDistrictAirData, ...result.districts };
      if (result.dongs) {
        currentDongAirData = result.dongs;
      }
      // 26개 전체 측정소 목록(또는 8개구 대표) 종합 표 렌더링
      const stationList = result.stations || Object.values(result.districts);
      renderDistrictSummary(stationList);
      // 26개 대기 측정소 실제 위치 핀(마커) 지도 표출
      renderStationMarkers(stationList);
      // 지도 행정동 SVG 색상 갱신 (142개 읍·면·동 IDW 공간 보간 대기질 반영)
      if (leafletDongLayer) {
        leafletDongLayer.setStyle(getDongStyle);
      }
      // 대기정보 퀵카드 및 상단 헤더 동기화
      if (currentAirDataObj) {
        updateAirUi(currentAirDataObj);
      }
    } else {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">
              해당 일자 및 시간의 대기 정보 데이터가 없습니다.
            </td>
          </tr>`;
      }
    }
  } catch (err) {
    console.error('대기정보 로드 실패:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 20px; color: #ef4444;">
            데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </td>
        </tr>`;
    }
  }
}

// --------------------------------------------------------------------------
// 1-2. 대구 25개 공식 대기 측정소 핀(마커) 지도 표출 (도시대기 19개소 vs 도로변대기 6개소)
// --------------------------------------------------------------------------
function renderStationMarkers(stations) {
  if (!leafletMapInstance) return;
  if (!stations || !stations.length) return;

  allStationsList = stations;

  if (!leafletStationLayerGroup) {
    leafletStationLayerGroup = L.layerGroup();
    if (isStationsOverlayOn) {
      leafletStationLayerGroup.addTo(leafletMapInstance);
    }
  } else {
    leafletStationLayerGroup.clearLayers();
  }

  // 도시대기 (빌딩/도시) SVG 아이콘
  const urbanIconSvg = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
      <path d="M9 22v-4h6v4"/>
      <path d="M8 6h.01"/>
      <path d="M16 6h.01"/>
      <path d="M12 6h.01"/>
      <path d="M12 10h.01"/>
      <path d="M12 14h.01"/>
      <path d="M16 10h.01"/>
      <path d="M16 14h.01"/>
      <path d="M8 10h.01"/>
      <path d="M8 14h.01"/>
    </svg>`;

  // 도로변대기 (도로/길) SVG 아이콘
  const roadsideIconSvg = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 21L8 3"/>
      <path d="M20 21L16 3"/>
      <path d="M12 4v4"/>
      <path d="M12 11v3"/>
      <path d="M12 17v3"/>
    </svg>`;

  stations.forEach(sttn => {
    const lat = sttn.lat;
    const lng = sttn.lng;
    if (!lat || !lng) return;

    const isRoadside = (sttn.network === '도로변대기' || (sttn.sttn_cd && String(sttn.sttn_cd).startsWith('8')));
    const netClass = isRoadside ? 'roadside' : 'urban';
    const netLabel = isRoadside ? '도로변대기' : '도시대기';
    const stName = sttn.station_name || sttn.name || '';
    const cleanName = stName.replace(/\(.*?\)/, '').trim();
    const pm10Val = (sttn.pm10 !== undefined && sttn.pm10 !== null && sttn.pm10 !== '') ? sttn.pm10 : '-';
    const pm25Val = (sttn.pm25 !== undefined && sttn.pm25 !== null && sttn.pm25 !== '') ? sttn.pm25 : '-';
    
    const gradeObj = (pm10Val === '-' || pm10Val === '점검중' || pm10Val === null) ? { level: 0, text: '점검중', color: '#94a3b8' } : getAirGrade(pm10Val, pm25Val);
    const gradeColor = gradeObj.color;
    const gradeText = (gradeObj.level === 0) ? '점검중' : gradeObj.text;

    const iconContent = isRoadside ? roadsideIconSvg : urbanIconSvg;

    const customIcon = L.divIcon({
      className: 'custom-sttn-icon',
      html: `
        <div class="station-pin-wrapper ${netClass}" title="${cleanName} (${netLabel}, PM10: ${pm10Val})">
          <div class="sttn-pin-body ${netClass}">
            <div class="sttn-pin-icon-inner">${iconContent}</div>
          </div>
          <span class="sttn-pin-label">${cleanName}</span>
        </div>
      `,
      iconSize: [28, 34],
      iconAnchor: [14, 28],
      tooltipAnchor: [0, -30]
    });

    const marker = L.marker([lat, lng], { icon: customIcon });

    marker.bindTooltip(`
      <div class="sttn-tooltip-card">
        <div class="sttc-header">
          <div class="sttc-title">
            <span>${stName} 측정소</span>
            <span style="font-size: 1.0rem; color:#94a3b8; font-weight:normal;">(${sttn.sttn_cd})</span>
          </div>
          <span class="sttc-badge ${netClass}">${netLabel}</span>
        </div>
        <div class="sttc-address">
          📍 ${sttn.address || '대구광역시 소재 측정소'}
        </div>
        <div class="sttc-grid">
          <div class="sttc-grid-item">
            <span class="sttc-grid-label">미세먼지 (PM10)</span>
            <strong class="sttc-grid-val" style="color: #38bdf8;">${pm10Val} <small>㎍/㎥</small></strong>
          </div>
          <div class="sttc-grid-item">
            <span class="sttc-grid-label">초미세먼지 (PM2.5)</span>
            <strong class="sttc-grid-val" style="color: #a78bfa;">${pm25Val} <small>㎍/㎥</small></strong>
          </div>
        </div>
        <div style="margin-top: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 1.0rem;">
          <span style="color: #94a3b8;">통합 대기질:</span>
          <span style="background: ${gradeColor}25; color: ${gradeColor}; border: 1px solid ${gradeColor}60; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
            ${gradeText}
          </span>
        </div>
      </div>
    `, {
      direction: 'top',
      className: 'dong-leaflet-tooltip',
      opacity: 0.98
    });

    // Leaflet 기본 _openTooltip 가로채기 (네비게이션 상태이거나 드래그 중일 때 툴팁 팝업 원천 차단)
    const origMarkerOpenTooltip = marker._openTooltip;
    marker._openTooltip = function(e) {
      if (typeof patrolNavActive !== 'undefined' && patrolNavActive) return;
      if (document.body.classList.contains('nav-active')) return;
      if (e && e.originalEvent && e.originalEvent.buttons !== 0) return;
      if (isMapMouseDown || isMapDragging) return;
      if (Date.now() - lastDragEndTime < 350) return;
      if (origMarkerOpenTooltip) {
        origMarkerOpenTooltip.call(this, e);
      }
    };

    marker.on('click', (e) => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e);
      currentStationCode = sttn.sttn_cd;
      fetchAirData(sttn.sttn_cd, currentAirDate);
      const select = document.getElementById('station-select');
      if (select) select.value = sttn.sttn_cd;
    });

    marker.addTo(leafletStationLayerGroup);
  });
}


// --------------------------------------------------------------------------
// 앱 초기화 라이프사이클
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 백엔드 분진차량 및 경로 데이터 로드
  await loadBackendData();

  // 2. 통합 인터랙티브 지도 초기화 (일반/위성사진 베이스맵)
  initRoadLeafletMap();

  // 3. 대구 142개 읍·면·동 행정구역 GeoJSON 레이어 비동기 로드 및 바인딩
  await loadDaeguDongGeoJson();

  // 4. 전역 이벤트 리스너 등록
  setupEventListeners();

  // 5. 실시간 대기정보 및 8개 자치구 대기질 데이터 비동기 병렬 로드
  await Promise.all([
    fetchDistrictAirData(),
    fetchAirData(currentStationCode)
  ]);

  // 6. 초기 화면: 특정 자치구 강제 선택 없이 대구 전역 균일 조망
  if (leafletMapInstance && leafletRoutePolylines && leafletRoutePolylines.length > 0) {
    const allBounds = [];
    leafletRoutePolylines.forEach(p => {
      if (p.routeData && p.routeData.points) {
        p.routeData.points.forEach(pt => allBounds.push(pt));
      }
    });
    if (allBounds.length > 0) {
      leafletMapInstance.fitBounds(allBounds, { padding: [50, 50], maxZoom: 12 });
    }
  }

  // 7. 기본 베이스맵(일반지도 또는 대기 중인 뷰) 동기화
  const targetView = window._pendingMasterView || currentMasterView || 'clean';
  setMasterView(targetView);
});

// 1. 백엔드 분진차량 분석 데이터 로드
async function loadBackendData() {
  try {
    const res = await fetch('/api/analysis');
    const result = await res.json();
    if (result.success && result.data) {
      allVehicles = result.data.vehicles || [];
      allRoutes = result.data.routes || [];

      // 백엔드 모니터링 측정소 기본 PM10 데이터 병합
      if (result.data.stations && Array.isArray(result.data.stations)) {
        result.data.stations.forEach(s => {
          if (s.district && s.pm10) {
            const grade = getAirGradeFromPm10(s.pm10);
            currentDistrictAirData[s.district] = {
              district: s.district,
              sttn_name: s.name,
              pm10: s.pm10,
              level: grade.level,
              text: grade.text,
              color: grade.color
            };
          }
        });
      }
    }
  } catch (err) {
    console.error('분석 데이터 로드 실패:', err);
  }
}

// --------------------------------------------------------------------------
// 2. 대구 142개 동·읍·면 GeoJSON 레이어 로드 & 렌더링
// --------------------------------------------------------------------------
async function loadDaeguDongGeoJson() {
  if (!leafletMapInstance) return;

  try {
    const res = await fetch('/static/data/daegu_dong.geojson?v=' + Date.now());
    daeguDongGeoJsonData = await res.json();

    if (leafletDongLayer && leafletMapInstance.hasLayer(leafletDongLayer)) {
      leafletMapInstance.removeLayer(leafletDongLayer);
    }

    leafletDongLayer = L.geoJSON(daeguDongGeoJsonData, {
      style: getDongStyle,
      onEachFeature: onEachDongFeature
    });
    window.leafletDongLayer = leafletDongLayer;

    if (isDistrictOverlayOn) {
      leafletDongLayer.addTo(leafletMapInstance);
      leafletDongLayer.bringToBack();
    }

    // 도로망 노선이 항상 폴리곤 위에 오도록 유지
    if (leafletRouteLayerGroup && leafletMapInstance.hasLayer(leafletRouteLayerGroup)) {
      leafletRouteLayerGroup.bringToFront();
    }

    if (selectedDistrict) {
      leafletDongLayer.setStyle(getDongStyle);
    }

    // 15개 운행구간(Zone) 시각화 초기화
    if (typeof init15ZoneVisualization === 'function') {
      init15ZoneVisualization();
    }
  } catch (err) {
    console.error('대구 행정구역 GeoJSON 로드 실패:', err);
  }
}

// 선택된 동 또는 자치구의 실제 행정구역 SVG 경계선 전용 최상단 네온 하이라이트 오버레이
function updateDongHighlightOverlay(districtName, dongName = null) {
  if (!leafletMapInstance || !daeguDongGeoJsonData) return;

  // 기존 하이라이트 오버레이 제거
  if (selectedDongHighlightLayer && leafletMapInstance.hasLayer(selectedDongHighlightLayer)) {
    leafletMapInstance.removeLayer(selectedDongHighlightLayer);
    selectedDongHighlightLayer = null;
    window.selectedDongHighlightLayer = null;
  }

  // 행정구역 오버레이가 꺼져있거나 구/동 이름이 없으면 생성하지 않음
  if (!isDistrictOverlayOn || (!districtName && !dongName)) {
    return;
  }

  // 타겟 Feature(들) 필터링 (공백 및 특수문자 안전 처리)
  let targetFeatures = [];
  if (dongName) {
    // 특정 동 선택 시: 해당 1개 동의 실제 SVG 곡선 경계선
    targetFeatures = daeguDongGeoJsonData.features.filter(f => {
      if (!f.properties) return false;
      const fDist = (f.properties.district || '').trim();
      const fDong = (f.properties.dong || '').trim();
      const tDist = (districtName || '').trim();
      const tDong = (dongName || '').trim();
      return fDist === tDist && (fDong === tDong || fDong.includes(tDong) || tDong.includes(fDong));
    });
  } else if (districtName) {
    // 자치구 전체 선택 시: 해당 자치구 내 동들의 실제 SVG 경계선
    targetFeatures = daeguDongGeoJsonData.features.filter(f => {
      if (!f.properties) return false;
      const fDist = (f.properties.district || '').trim();
      const tDist = (districtName || '').trim();
      return fDist === tDist;
    });
  }

  if (targetFeatures.length > 0) {
    selectedDongHighlightLayer = L.geoJSON(targetFeatures, {
      style: {
        fill: false,
        fillOpacity: 0, // 내부는 100% 투명하게 하여 이전 투명도 완벽 보존
        color: '#38bdf8', // 깔끔하고 선명한 사이언 외곽선
        weight: 3, // 과하지 않고 또렷한 외곽선 두께
        opacity: 1,
        dashArray: '',
        className: 'selected-dong-neon-path'
      },
      interactive: false // 마우스 이벤트는 아래 레이어로 통과
    });

    selectedDongHighlightLayer.addTo(leafletMapInstance);
    selectedDongHighlightLayer.bringToFront();
    window.selectedDongHighlightLayer = selectedDongHighlightLayer;

    // 도로망 노선이 항상 최상단에 오도록 유지
    if (leafletRouteLayerGroup && leafletMapInstance.hasLayer(leafletRouteLayerGroup)) {
      leafletRouteLayerGroup.bringToFront();
    }
  }
}
window.updateDongHighlightOverlay = updateDongHighlightOverlay;

// 동 폴리곤 스타일 계산 (142개 읍·면·동 IDW 정밀 대기질 등급 기반 컬러링 및 실제 SVG 테두리 곡선 강조)
function getDongStyle(feature) {
  const dist = (feature.properties.district || '').trim();
  const dong = (feature.properties.dong || '').trim();
  const isSelectedDong = selectedDongName && (dong === selectedDongName.trim() || dong.includes(selectedDongName.trim())) && (!selectedDistrict || dist === selectedDistrict.trim());
  const isSelectedDist = selectedDistrict && dist === selectedDistrict.trim();

  // 1. 행정동별 IDW 정밀 보간 데이터 우선 조회, 없으면 자치구 기본값 fallback
  const dongKey = dist + '_' + dong;
  const dongAir = currentDongAirData[dongKey] || currentDongAirData[dong] || null;
  const distAir = currentDistrictAirData[dist] || defaultDistrictAirData[dist] || { pm10: 70, level: 2, text: '보통', color: '#10b981' };
  const airColor = (dongAir && dongAir.color) ? dongAir.color : (distAir.color || '#10b981');

  // 1. 특정 동(Dong)이 선택된 경우: 내부 투명도(0.20) 유지 + 사이언 외곽선 강조
  if (isSelectedDong) {
    return {
      fillColor: airColor,
      fillOpacity: 0.20, // 기존 대기색 투명도(0.20) 그대로 유지!
      color: '#38bdf8', // 깔끔한 사이언 외곽선
      weight: 3,        // 절제된 외곽선 두께
      opacity: 1,
      dashArray: ''
    };
  }

  // 2. 특정 자치구(구/군)가 선택된 경우: 내부 투명도는 기본 투명도(0.20) 유지하고 구 외곽선 강조
  if (isSelectedDist && !selectedDongName) {
    return {
      fillColor: airColor,
      fillOpacity: 0.20,
      color: '#38bdf8',
      weight: 2,
      opacity: 0.9,
      dashArray: ''
    };
  }

  // 3. 모든 비선택 구역도 옅어지지 않고 동일하게 원래 투명도(0.20) 유지
  return {
    fillColor: airColor,
    fillOpacity: 0.20,
    color: airColor,
    weight: 1.2,
    opacity: 0.65,
    dashArray: '2'
  };
}

// 각 동 폴리곤에 대한 이벤트 및 툴팁 바인딩
function onEachDongFeature(feature, layer) {
  const dong = (feature.properties.dong || '').trim();
  const dist = (feature.properties.district || '').trim();
  const fullName = feature.properties.fullName || `대구광역시 ${dist} ${dong}`;

  function getDongAirInfo() {
    const dongKey = dist + '_' + dong;
    const dongAir = currentDongAirData[dongKey] || currentDongAirData[dong] || null;
    const distAir = currentDistrictAirData[dist] || defaultDistrictAirData[dist] || { pm10: 70, pm25: 32, level: 2, text: '보통', color: '#10b981' };
    
    return {
      pm10: (dongAir && dongAir.pm10 !== undefined) ? dongAir.pm10 : distAir.pm10,
      pm25: (dongAir && dongAir.pm25 !== undefined) ? dongAir.pm25 : (distAir.pm25 || '-'),
      text: (dongAir && dongAir.text) ? dongAir.text : distAir.text,
      color: (dongAir && dongAir.color) ? dongAir.color : (distAir.color || '#10b981'),
      nearest: (dongAir && dongAir.nearest_station) ? `${dongAir.nearest_station} (${dongAir.nearest_dist_km}km)` : ''
    };
  }

  function renderTooltipContent() {
    const air = getDongAirInfo();
    return `
      <div style="font-family: inherit; min-width: 175px;">
        <div style="font-weight: 700; font-size: 1.05rem; color: #f8fafc; margin-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span>${dist} <span style="color: #38bdf8;">${dong}</span></span>
          <span style="background: ${air.color}25; color: ${air.color}; border: 1px solid ${air.color}80; padding: 1px 6px; border-radius: 4px; font-size: 1.0rem; font-weight: 700;">${air.text}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 1.0rem; color: #cbd5e1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8;">미세먼지 (PM10):</span>
            <strong style="color: #38bdf8; font-size: 1.0rem;">${air.pm10} <small style="font-weight: normal; font-size: 1.0rem;">㎍/㎥</small></strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8;">초미세먼지 (PM2.5):</span>
            <strong style="color: #a78bfa; font-size: 1.0rem;">${air.pm25} <small style="font-weight: normal; font-size: 1.0rem;">㎍/㎥</small></strong>
          </div>
          ${air.nearest ? `
          <div style="margin-top: 3px; padding-top: 3px; border-top: 1px dashed rgba(255,255,255,0.12); font-size: 1.0rem; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
            <span>기준 측정소:</span>
            <span style="color: #e2e8f0; font-weight: 600;">${air.nearest}</span>
          </div>` : ''}
        </div>
      </div>
    `;
  }

  layer.bindTooltip(renderTooltipContent(), {
    sticky: true,
    className: 'dong-leaflet-tooltip',
    direction: 'auto',
    opacity: 0.98
  });

  // Leaflet 기본 _openTooltip 가로채기 (드래그/마우스누름/드래그 직후 및 네비게이션 모드 툴팁 자동 팝업 원천 봉쇄)
  const origOpenTooltip = layer._openTooltip;
  layer._openTooltip = function(e) {
    if (typeof patrolNavActive !== 'undefined' && patrolNavActive) return;
    if (document.body.classList.contains('nav-active')) return;
    // 1. 마우스 좌클릭이 눌려있는 상태 (드래그 중이거나 홀드 중)
    if (e && e.originalEvent && e.originalEvent.buttons !== 0) return;
    // 2. 지도 드래그 또는 마우스다운 상태 플래그
    if (isMapMouseDown || isMapDragging) return;
    // 3. 드래그 직후 350ms 이내 (드래그 종료 지점에서의 불필요한 자동 툴팁 팝업 방지)
    if (Date.now() - lastDragEndTime < 350) return;

    if (origOpenTooltip) {
      origOpenTooltip.call(this, e);
    }
  };

  layer.on({
    mouseover: function(e) {
      if (typeof patrolNavActive !== 'undefined' && patrolNavActive) return;
      if (document.body.classList.contains('nav-active')) return;
      // 마우스 버튼이 눌려 있는 상태(드래그 중이거나 홀드 중), 또는 드래그 직후에는 호버 툴팁과 하이라이트 생성 완전 차단!
      if (e.originalEvent && e.originalEvent.buttons !== 0) return;
      if (isMapMouseDown || isMapDragging) return;
      if (Date.now() - lastDragEndTime < 350) return;

      const l = e.target;

      // 최신 미세먼지 정보로 툴팁 실시간 반영
      layer.setTooltipContent(renderTooltipContent());

      if (currentlyHoveredDongLayer && currentlyHoveredDongLayer !== l) {
        if (leafletDongLayer) {
          leafletDongLayer.resetStyle(currentlyHoveredDongLayer);
        }
        currentlyHoveredDongLayer.closeTooltip();
      }
      currentlyHoveredDongLayer = l;

      l.setStyle({
        fillOpacity: 0.38,
        color: '#ffffff',
        weight: 2,
        opacity: 0.95
      });
    },
    mouseout: function(e) {
      const l = e.target;
      if (l.feature) {
        l.setStyle(getDongStyle(l.feature));
      } else if (leafletDongLayer) {
        leafletDongLayer.resetStyle(l);
      }
      l.closeTooltip();
      if (currentlyHoveredDongLayer === l) {
        currentlyHoveredDongLayer = null;
      }
    },
    mousedown: function(e) {
      layer._mouseDownTime = Date.now();
      layer._mouseDownPos = e.containerPoint;
    },
    click: function(e) {
      if (e.originalEvent) {
        L.DomEvent.stopPropagation(e);
      }

      // 12px 이상 명백히 마우스를 움직였거나 지도 이동 중인 경우만 드래그로 판정하여 무시
      let movedDistance = 0;
      if (layer._mouseDownPos && e.containerPoint) {
        movedDistance = layer._mouseDownPos.distanceTo(e.containerPoint);
      }
      if (isMapDragging || movedDistance > 12) {
        return;
      }

      // 맵 빈 공간 클릭 시 즉각적인 선택 해제 방지 플래그
      justClickedDong = true;
      setTimeout(() => { justClickedDong = false; }, 350);

      dismissAllTooltipsAndHovers();
      selectDistrictAndDong(dist, dong, fullName);
    }
  });
}

// --------------------------------------------------------------------------
// 3. 네이버 지도 스타일 3-Way 뷰 및 오버레이 컨트롤러
// --------------------------------------------------------------------------
// 3. 네이버 지도 스타일 2-Way 베이스맵([일반지도] ↔ [위성사진]) 및 오버레이 컨트롤러
// --------------------------------------------------------------------------
function setMasterView(viewType) {
  if (viewType === 'svg') viewType = 'clean';
  currentMasterView = viewType;

  setNaverBaseMap(viewType);

  if (leafletMapInstance) {
    setTimeout(() => {
      leafletMapInstance.invalidateSize();
      if (selectedDistrict) {
        highlightLeafletDistrict(selectedDistrict);
      }
    }, 50);
  }

  updateNaverControlsUI();
}

function setNaverBaseMap(type) {
  currentNaverBaseMap = type;
  if (!leafletMapInstance) return;

  if (type === 'satellite') {
    // 고해상도 위성영상으로 전환 (위치/줌/레이어 유지)
    if (darkOSMTileLayer && leafletMapInstance.hasLayer(darkOSMTileLayer)) {
      leafletMapInstance.removeLayer(darkOSMTileLayer);
    }
    if (esriSatelliteTileLayer && !leafletMapInstance.hasLayer(esriSatelliteTileLayer)) {
      esriSatelliteTileLayer.addTo(leafletMapInstance);
      esriSatelliteTileLayer.bringToBack();
    }
  } else {
    // 일반/선명한 다크 지도로 전환 (위치/줌/레이어 유지)
    if (esriSatelliteTileLayer && leafletMapInstance.hasLayer(esriSatelliteTileLayer)) {
      leafletMapInstance.removeLayer(esriSatelliteTileLayer);
    }
    if (darkOSMTileLayer && !leafletMapInstance.hasLayer(darkOSMTileLayer)) {
      darkOSMTileLayer.addTo(leafletMapInstance);
      darkOSMTileLayer.bringToBack();
    }
  }

  // 레이어 계층 순서 보정
  if (leafletDongLayer && leafletMapInstance.hasLayer(leafletDongLayer)) {
    leafletDongLayer.bringToBack();
  }
  if (leafletRouteLayerGroup && leafletMapInstance.hasLayer(leafletRouteLayerGroup)) {
    leafletRouteLayerGroup.bringToFront();
  }
}

function toggleNaverOverlay(type) {
  if (type === 'district') {
    isDistrictOverlayOn = !isDistrictOverlayOn;

    // 상호 배타적 제어: 행정구역을 켜면 운행구간(12개 권역)을 자동으로 끔
    if (isDistrictOverlayOn) {
      if (typeof isZoneOverlayVisible !== 'undefined' && isZoneOverlayVisible) {
        isZoneOverlayVisible = false;
        if (leafletMapInstance) {
          if (zonePolygonLayerGroup && leafletMapInstance.hasLayer(zonePolygonLayerGroup)) leafletMapInstance.removeLayer(zonePolygonLayerGroup);
          if (zoneCorridorGroup && leafletMapInstance.hasLayer(zoneCorridorGroup)) leafletMapInstance.removeLayer(zoneCorridorGroup);
          if (zoneLabelLayerGroup && leafletMapInstance.hasLayer(zoneLabelLayerGroup)) leafletMapInstance.removeLayer(zoneLabelLayerGroup);
          if (typeof updateZoneHighlightOverlay === 'function') updateZoneHighlightOverlay(null);
          if (typeof selectedZoneId !== 'undefined') selectedZoneId = null;
        }
      }
    } else {
      // 행정구역을 끌 때: 선택된 행정구역 테두리 빛남(하이라이트) 레이어 즉시 제거
      if (selectedDongHighlightLayer && leafletMapInstance && leafletMapInstance.hasLayer(selectedDongHighlightLayer)) {
        leafletMapInstance.removeLayer(selectedDongHighlightLayer);
        selectedDongHighlightLayer = null;
        window.selectedDongHighlightLayer = null;
      }
      selectedDistrict = null;
      selectedDongName = null;
    }

    if (leafletMapInstance) {
      if (isDistrictOverlayOn) {
        if (leafletDongLayer && !leafletMapInstance.hasLayer(leafletDongLayer)) {
          leafletDongLayer.addTo(leafletMapInstance);
          leafletDongLayer.bringToBack();
        }
      } else {
        if (leafletDongLayer && leafletMapInstance.hasLayer(leafletDongLayer)) {
          leafletMapInstance.removeLayer(leafletDongLayer);
        }
      }
    }
  } else if (type === 'routes') {
    isRoutesOverlayOn = !isRoutesOverlayOn;
    const btn = document.getElementById('nft-layer-route');
    if (btn) btn.classList.toggle('active', isRoutesOverlayOn);

    if (leafletMapInstance) {
      if (isRoutesOverlayOn) {
        // 오른쪽 위 "구간 노선망" 클릭 시: 방금 추가한 1구간 실시간 대기반응형 최적 노선 표출!
        ensureDynamicRouteLoadedAndVisible(false);
      } else {
        // 끄면 실시간 최적 노선 숨김!
        hideDynamicRouteFromMap();
      }
    }
  } else if (type === 'stations') {
    isStationsOverlayOn = !isStationsOverlayOn;
    if (leafletMapInstance) {
      if (isStationsOverlayOn) {
        if (leafletStationLayerGroup && !leafletMapInstance.hasLayer(leafletStationLayerGroup)) {
          leafletStationLayerGroup.addTo(leafletMapInstance);
        } else if (!leafletStationLayerGroup && allStationsList.length > 0) {
          renderStationMarkers(allStationsList);
        }
      } else {
        if (leafletStationLayerGroup && leafletMapInstance.hasLayer(leafletStationLayerGroup)) {
          leafletMapInstance.removeLayer(leafletStationLayerGroup);
        }
      }
    }
  } else if (type === 'zones') {
    if (typeof isZoneOverlayVisible !== 'undefined') {
      isZoneOverlayVisible = !isZoneOverlayVisible;

      // 상호 배타적 제어: 운행구간(12개 권역)을 켜면 행정구역을 자동으로 끔 및 행정구역 빛남 테두리 오버레이 제거
      if (isZoneOverlayVisible) {
        if (isDistrictOverlayOn) {
          isDistrictOverlayOn = false;
          if (leafletMapInstance && leafletDongLayer && leafletMapInstance.hasLayer(leafletDongLayer)) {
            leafletMapInstance.removeLayer(leafletDongLayer);
          }
        }
        // 행정구역 선택 상태 및 빛나는 테두리 하이라이트 오버레이 제거
        if (selectedDongHighlightLayer && leafletMapInstance && leafletMapInstance.hasLayer(selectedDongHighlightLayer)) {
          leafletMapInstance.removeLayer(selectedDongHighlightLayer);
          selectedDongHighlightLayer = null;
          window.selectedDongHighlightLayer = null;
        }
        selectedDistrict = null;
        selectedDongName = null;
      }

      if (leafletMapInstance) {
        if (isZoneOverlayVisible) {
          if (zonePolygonLayerGroup && !leafletMapInstance.hasLayer(zonePolygonLayerGroup)) zonePolygonLayerGroup.addTo(leafletMapInstance);
          if (zoneCorridorGroup && !leafletMapInstance.hasLayer(zoneCorridorGroup)) zoneCorridorGroup.addTo(leafletMapInstance);
          if (zoneLabelLayerGroup && !leafletMapInstance.hasLayer(zoneLabelLayerGroup)) zoneLabelLayerGroup.addTo(leafletMapInstance);
          if (typeof updateZoneHighlightOverlay === 'function' && typeof selectedZoneId !== 'undefined' && selectedZoneId) {
            updateZoneHighlightOverlay(selectedZoneId);
          }
        } else {
          if (zonePolygonLayerGroup && leafletMapInstance.hasLayer(zonePolygonLayerGroup)) leafletMapInstance.removeLayer(zonePolygonLayerGroup);
          if (zoneCorridorGroup && leafletMapInstance.hasLayer(zoneCorridorGroup)) leafletMapInstance.removeLayer(zoneCorridorGroup);
          if (zoneLabelLayerGroup && leafletMapInstance.hasLayer(zoneLabelLayerGroup)) leafletMapInstance.removeLayer(zoneLabelLayerGroup);
          if (typeof updateZoneHighlightOverlay === 'function') {
            updateZoneHighlightOverlay(null);
          }
          if (typeof selectedZoneId !== 'undefined') {
            selectedZoneId = null;
          }
        }
      }
    }
  }

  if (leafletMapInstance && leafletRouteLayerGroup && leafletMapInstance.hasLayer(leafletRouteLayerGroup)) {
    leafletRouteLayerGroup.bringToFront();
  }

  // UI 버튼 상태 갱신
  updateNaverControlsUI();
}

// 상단 헤더 및 우측 플로팅 버튼 활성화 상태 동기화
function updateNaverControlsUI() {
  const btnClean = document.getElementById('btn-basemap-clean');
  const btnSat = document.getElementById('btn-basemap-satellite');
  const btnDist = document.getElementById('btn-overlay-district');
  const btnRoutes = document.getElementById('btn-overlay-routes');

  const nftStd = document.getElementById('nft-btn-std');
  const nftSat = document.getElementById('nft-btn-sat');
  const nftDist = document.getElementById('nft-layer-dist');
  const nftRoute = document.getElementById('nft-layer-route');
  const nftStation = document.getElementById('nft-layer-station');
  const nftZone = document.getElementById('nft-layer-zone');

  const isClean = currentMasterView === 'clean';
  const isSat = currentMasterView === 'satellite';

  // 1. 맵 뷰 타입 동기화
  if (btnClean) btnClean.classList.toggle('active', isClean);
  if (btnSat) btnSat.classList.toggle('active', isSat);

  if (nftStd) nftStd.classList.toggle('active', isClean);
  if (nftSat) nftSat.classList.toggle('active', isSat);

  // 2. 오버레이 레이어 동기화
  if (btnDist) btnDist.classList.toggle('active', isDistrictOverlayOn);
  if (nftDist) nftDist.classList.toggle('active', isDistrictOverlayOn);

  if (btnRoutes) btnRoutes.classList.toggle('active', isRoutesOverlayOn);
  if (nftRoute) nftRoute.classList.toggle('active', isRoutesOverlayOn);

  if (nftStation) nftStation.classList.toggle('active', isStationsOverlayOn);
  if (nftZone && typeof isZoneOverlayVisible !== 'undefined') {
    nftZone.classList.toggle('active', isZoneOverlayVisible);
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// --------------------------------------------------------------------------
// 4. 대구 실시간 대기정보(air.daegu.go.kr) 크롤링 데이터 조회 및 렌더링
// --------------------------------------------------------------------------
async function fetchAirData(sttnCd = '701', dateStr = undefined, force = false) {
  currentStationCode = sttnCd;
  if (dateStr !== undefined) {
    currentAirDate = dateStr;
  }

  try {
    const query = currentAirDate ? `sttn_cd=${sttnCd}&date=${encodeURIComponent(currentAirDate)}` : `sttn_cd=${sttnCd}`;
    const res = await fetch(`/api/air/realtime?${query}`);
    const result = await res.json();

    if (result.success && result.data) {
      const airData = result.data;
      updateAirUi(airData);
      renderAirTable(airData.records);

      // 좌측 퀵 카드 및 상단 실시간 칩 UI만 업데이트 (지도 영역 색상은 초기 로드 및 모달 갱신 시 일괄 유지)
    }
  } catch (err) {
    console.error('실시간 대기정보 조회 실패:', err);
  }
}

function updateAirUi(airData) {
  if (!airData) return;
  currentAirDataObj = airData;

  const latest = airData.latest;
  const sttnName = airData.station_name || '수창동(중구)';

  // 1. 해당 날짜/측정소의 latest 데이터(실제 측정 농도)를 최우선 적용하여 날짜 간 데이터 꼬임 방지
  const hasLatestPm10 = latest && latest.pm10 && latest.pm10.value !== undefined && latest.pm10.value !== '' && latest.pm10.value !== '-';
  const hasLatestPm25 = latest && latest.pm25 && latest.pm25.value !== undefined && latest.pm25.value !== '' && latest.pm25.value !== '-';

  // allStationsList는 현재 조회 중인 날짜와 일치할 때만 보조 fallback으로 사용
  const isAllSttnsMatchingDate = allStationsList && allStationsList.length > 0 && 
    (!currentAirDate || (allStationsList[0].time && allStationsList[0].time.startsWith(currentAirDate)));

  const matchedSttn = isAllSttnsMatchingDate 
    ? allStationsList.find(s => s.sttn_cd === airData.sttn_cd || (s.name && airData.station_name && airData.station_name.includes(s.name)))
    : null;

  const displayPm10 = hasLatestPm10 
    ? latest.pm10.value 
    : (matchedSttn && matchedSttn.pm10 !== undefined && matchedSttn.pm10 !== '-' && matchedSttn.pm10 !== null ? matchedSttn.pm10 : '-');

  const displayPm25 = hasLatestPm25 
    ? latest.pm25.value 
    : (matchedSttn && matchedSttn.pm25 !== undefined && matchedSttn.pm25 !== '-' && matchedSttn.pm25 !== null ? matchedSttn.pm25 : '-');

  // 1. 헤더 상단 라이브 칩
  const liveStation = document.getElementById('air-live-station');
  const livePm10 = document.getElementById('air-live-pm10');
  const livePm25 = document.getElementById('air-live-pm25');
  if (liveStation) liveStation.textContent = sttnName;
  if (livePm10) livePm10.textContent = displayPm10;
  if (livePm25) livePm25.textContent = displayPm25;

  // 2. 좌측 퀵 카드
  const qStation = document.getElementById('quick-air-station');
  const qTime = document.getElementById('quick-air-time');
  const qLiveBadge = document.getElementById('quick-air-live-badge');
  const qPm10Val = document.getElementById('quick-pm10-val');
  const qPm10Tag = document.getElementById('quick-pm10-tag');
  const qPm10Icon = document.getElementById('quick-pm10-icon');
  const qPm25Val = document.getElementById('quick-pm25-val');
  const qPm25Tag = document.getElementById('quick-pm25-tag');
  const qPm25Icon = document.getElementById('quick-pm25-icon');
  const qCaiVal = document.getElementById('quick-cai-val');
  const qCaiSub = document.getElementById('quick-cai-sub');
  const qCaiTag = document.getElementById('quick-cai-tag');
  const qCaiIcon = document.getElementById('quick-cai-icon');

  const isDemo = currentAirDate && currentAirDate !== getTodayIsoDate();

  if (qLiveBadge) {
    if (isDemo) {
      qLiveBadge.textContent = 'DEMO';
      qLiveBadge.className = 'badge-live badge-demo';
    } else {
      qLiveBadge.textContent = 'LIVE';
      qLiveBadge.className = 'badge-live';
    }
  }

  if (qStation) qStation.textContent = sttnName;
  if (latest) {
    if (qTime) {
      const timePart = latest.time.includes(' ') ? latest.time.split(' ')[1] : latest.time;
      qTime.textContent = isDemo ? `${currentAirDate} 일평균` : `${timePart} 기준`;
    }
    if (qPm10Val) qPm10Val.textContent = displayPm10;

    // PM10 등급 및 아이콘/태그
    const g10 = (latest.pm10 && latest.pm10.grade && latest.pm10.grade.text) 
      ? latest.pm10.grade 
      : getAirGradeFromPm10(displayPm10);
    const lvl10 = g10.level || 2;
    if (qPm10Tag) {
      qPm10Tag.textContent = g10.text;
      qPm10Tag.className = `qm-tag ${lvl10 === 1 ? 'tag-good' : (lvl10 === 2 ? 'tag-moderate' : (lvl10 === 4 ? 'tag-very-bad' : 'tag-bad'))}`;
    }
    if (qPm10Icon) {
      qPm10Icon.textContent = lvl10 === 1 ? '😊' : (lvl10 === 2 ? '🙂' : (lvl10 === 4 ? '👿' : '😷'));
      qPm10Icon.className = `status-icon-circle ${lvl10 === 1 ? 'status-good' : (lvl10 === 2 ? 'status-moderate' : (lvl10 === 4 ? 'status-very-bad' : 'status-bad'))}`;
    }

    // PM2.5 등급 및 아이콘/태그
    if (qPm25Val) qPm25Val.textContent = displayPm25;
    const g25 = (latest.pm25 && latest.pm25.grade && latest.pm25.grade.text) 
      ? latest.pm25.grade 
      : getAirGrade(null, displayPm25);
    const lvl25 = g25.level || 2;
    if (qPm25Tag) {
      qPm25Tag.textContent = g25.text;
      qPm25Tag.className = `qm-tag ${lvl25 === 1 ? 'tag-good' : (lvl25 === 2 ? 'tag-moderate' : (lvl25 === 4 ? 'tag-very-bad' : 'tag-bad'))}`;
    }
    if (qPm25Icon) {
      qPm25Icon.textContent = lvl25 === 1 ? '😊' : (lvl25 === 2 ? '🙂' : (lvl25 === 4 ? '👿' : '😷'));
      qPm25Icon.className = `status-icon-circle ${lvl25 === 1 ? 'status-good' : (lvl25 === 2 ? 'status-moderate' : (lvl25 === 4 ? 'status-very-bad' : 'status-bad'))}`;
    }

    // CAI 등급 및 아이콘/태그
    if (qCaiVal) qCaiVal.textContent = latest.cai.value;
    if (qCaiSub) qCaiSub.textContent = latest.cai.substance || 'O3';
    const caiGrade = latest.cai.grade || { level: 2, text: '보통' };
    const lvlCai = caiGrade.level || 2;
    if (qCaiTag) {
      qCaiTag.textContent = caiGrade.text;
      qCaiTag.className = `qm-tag ${lvlCai === 1 ? 'tag-good' : (lvlCai === 2 ? 'tag-moderate' : (lvlCai === 4 ? 'tag-very-bad' : 'tag-bad'))}`;
    }
    if (qCaiIcon) {
      qCaiIcon.textContent = lvlCai === 1 ? '😊' : (lvlCai === 2 ? '🙂' : (lvlCai === 4 ? '👿' : '😷'));
      qCaiIcon.className = `status-icon-circle ${lvlCai === 1 ? 'status-good' : (lvlCai === 2 ? 'status-moderate' : (lvlCai === 4 ? 'status-very-bad' : 'status-bad'))}`;
    }
  }

  // 3. 셀렉트 박스 동기화
  const sttnSelect = document.getElementById('station-select');
  if (sttnSelect && sttnSelect.value !== airData.sttn_cd) {
    sttnSelect.value = airData.sttn_cd;
  }
  const modalSttnSelect = document.getElementById('modal-station-select');
  if (modalSttnSelect && modalSttnSelect.value !== airData.sttn_cd) {
    modalSttnSelect.value = airData.sttn_cd;
  }

  // 4. 조회 일자 인풋 및 공식 사이트 원문 링크 동적 갱신
  const dateInput = document.getElementById('modal-date-input');
  if (dateInput && airData.date) {
    dateInput.value = airData.date;
  }
  const officialLink = document.querySelector('.official-link');
  if (officialLink && airData.date) {
    officialLink.href = `https://air.daegu.go.kr/index.do?menu_id=00000801&menu_link=%2Ffront%2FrealTimeAir%2FrealTimeTotalAirView.do&sttn_cd=${airData.sttn_cd || '701'}&from=${airData.date}&fromtime=00&to=${airData.date}&totime=23`;
  }
}

function renderAirTable(records) {
  const tbody = document.getElementById('air-table-tbody');
  if (!tbody) return;

  function renderIcon(grade) {
    const lvl = grade.level;
    const txt = grade.text;
    let icon = 'smile';
    let cls = 'grade-good';
    if (lvl === 2) { icon = 'meh'; cls = 'grade-moderate'; }
    else if (lvl === 3) { icon = 'frown'; cls = 'grade-bad'; }
    else if (lvl === 4) { icon = 'alert-triangle'; cls = 'grade-very-bad'; }
    return `<span class="tbl-grade-icon ${cls}" title="${txt}"><i data-lucide="${icon}"></i></span>`;
  }

  const reversedRecords = [...records].reverse();

  tbody.innerHTML = reversedRecords.map(r => `
    <tr>
      <td style="font-weight: 600;">${r.time}</td>
      <td style="font-weight: 700; color: var(--accent-blue);">${r.cai.substance}</td>
      <td>${renderIcon(r.cai.grade)}</td>
      <td style="font-weight: 700;">${r.cai.value}</td>
      <td>${renderIcon(r.pm25.grade)}</td>
      <td style="font-weight: 700;">${r.pm25.value}</td>
      <td>${renderIcon(r.pm10.grade)}</td>
      <td class="col-pm10">${r.pm10.value}</td>
      <td>${renderIcon(r.o3.grade)}</td>
      <td>${r.o3.value}</td>
      <td>${renderIcon(r.co.grade)}</td>
      <td>${r.co.value}</td>
      <td>${renderIcon(r.so2.grade)}</td>
      <td>${r.so2.value}</td>
      <td>${renderIcon(r.no2.grade)}</td>
      <td>${r.no2.value}</td>
    </tr>
  `).join('');
}

async function openAirModal() {
  const modal = document.getElementById('air-modal');
  if (modal) {
    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }

  // 모달 조회일자 인풋 동기화
  const dateInput = document.getElementById('modal-date-input');
  if (dateInput) {
    if (currentAirDate) {
      dateInput.value = currentAirDate;
    } else if (!dateInput.value) {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      dateInput.value = new Date(now.getTime() - offset).toISOString().split('T')[0];
    }
  }

  // 모달 시간 선택 셀렉트 동기화
  const hourSelect = document.getElementById('modal-hour-select');
  if (hourSelect) {
    hourSelect.value = currentAirHour || 'all';
  }

  const modalSttnSelect = document.getElementById('modal-station-select');
  if (modalSttnSelect && currentStationCode) {
    modalSttnSelect.value = currentStationCode;
  }

  // 현재 설정된 날짜 및 시간 기준으로 전체 측정소 표 렌더링
  await fetchDistrictAirData(currentAirDate, currentAirHour);
}

async function refreshAirModal(dateStr = currentAirDate, hourStr = currentAirHour, force = false) {
  const nextDate = dateStr || null;
  const nextHour = (hourStr !== undefined && hourStr !== null) ? hourStr : 'all';
  if (currentAirDate !== nextDate || currentAirHour !== nextHour) invalidateRouteForAirSelection();
  currentAirDate = nextDate;
  currentAirHour = nextHour;

  const dateInput = document.getElementById('modal-date-input');
  if (dateInput) {
    if (currentAirDate) {
      dateInput.value = currentAirDate;
    } else {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      dateInput.value = new Date(now.getTime() - offset).toISOString().split('T')[0];
    }
  }

  const hourSelect = document.getElementById('modal-hour-select');
  if (hourSelect) {
    hourSelect.value = currentAirHour || 'all';
  }

  // 1. 측정소 상세 데이터 갱신
  const p1 = fetchAirData(currentStationCode, currentAirDate, force);
  // 2. 전체 측정소 표 및 지도 색상 동시 갱신
  const p2 = fetchDistrictAirData(currentAirDate, currentAirHour);
  await Promise.all([p1, p2]);
}

function closeAirModal() {
  const modal = document.getElementById('air-modal');
  if (modal) modal.style.display = 'none';
}

function renderDistrictSummary(stations) {
  const tbody = document.getElementById('district-summary-tbody');
  if (!tbody) return;
  const rows = stations.map(s => {
    const sttnName = s.station_name || s.sttn_name || s.name || s.sttn_cd || '';
    const distName = s.district || stationCodeToDistrict[s.sttn_cd] || '';
    const gradeText = s.text || s.pm10_text || '';
    const color = s.color || '#10b981';
    const pm10Val = (s.pm10 !== undefined && s.pm10 !== null && s.pm10 !== '') ? s.pm10 : '-';
    const pm25Val = (s.pm25 !== undefined && s.pm25 !== null && s.pm25 !== '') ? s.pm25 : '-';
    return `
      <tr>
        <td style="font-weight: 700; color: var(--text-main);">${sttnName}</td>
        <td style="color: var(--text-muted); font-size: 1.0rem;">${distName}</td>
        <td style="font-weight: 700; color: #38bdf8;">${pm10Val}</td>
        <td style="font-weight: 700; color: #a78bfa;">${pm25Val}</td>
        <td><span class="qm-tag" style="background:${color}25;color:${color};border:1px solid ${color}60;">
          ${gradeText}
        </span></td>
      </tr>`;
  }).join('');
  tbody.innerHTML = rows;
}


// --------------------------------------------------------------------------
// 5. 구·군 및 동 단위 통합 선택 & 지도 동기화
// --------------------------------------------------------------------------
function selectDistrict(districtName, routeId = null) {
  selectedDistrict = districtName;
  selectedDongName = null;
  selectedRouteId = routeId;

  // 운행구간 하이라이트가 남아있다면 제거
  if (typeof updateZoneHighlightOverlay === 'function') {
    updateZoneHighlightOverlay(null);
  }
  if (typeof selectedZoneId !== 'undefined') {
    selectedZoneId = null;
  }

  // 좌측 드롭다운 동기화
  const selectEl = document.getElementById('district-filter');
  if (selectEl) selectEl.value = districtName;

  // 퀵 칩 동기화
  document.querySelectorAll('.district-chip').forEach(chip => {
    if (chip.getAttribute('data-district') === districtName) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // 실시간 대기측정소 동기화 (구 단위 대표 측정소)
  const targetStation = getStationForDong(districtName, null);
  if (targetStation && targetStation !== currentStationCode) {
    fetchAirData(targetStation);
  }

  // 우측 하단 상세 카드 렌더링
  renderDetailCard(districtName, null, `대구광역시 ${districtName} 관제 권역`, routeId);

  // 선택된 자치구의 실제 SVG 경계선 전용 최상단 네온 오버레이 반영
  updateDongHighlightOverlay(districtName, null);

  // Leaflet 동 폴리곤 스타일 갱신
  if (leafletDongLayer) {
    leafletDongLayer.setStyle(getDongStyle);
  }

  // Leaflet 도로망 노선 스타일 갱신 및 포커싱 (단일 노선 선택 시 해당 노선만 단독 강조, 캔버스 자동 줌 비활성화)
  highlightLeafletDistrict(districtName, routeId, false);
}

function selectDistrictAndDong(districtName, dongName, fullName, routeId = null) {
  selectedDistrict = districtName;
  selectedDongName = dongName;
  selectedRouteId = routeId;

  // 운행구간 하이라이트가 남아있다면 제거
  if (typeof updateZoneHighlightOverlay === 'function') {
    updateZoneHighlightOverlay(null);
  }
  if (typeof selectedZoneId !== 'undefined') {
    selectedZoneId = null;
  }

  // 좌측 드롭다운 동기화
  const selectEl = document.getElementById('district-filter');
  if (selectEl) selectEl.value = districtName;

  // 퀵 칩 동기화
  document.querySelectorAll('.district-chip').forEach(chip => {
    if (chip.getAttribute('data-district') === districtName) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // 실시간 대기측정소 동기화 (현풍/구지 등 동·읍·면별 가장 가까운 실제 측정소 정밀 매핑)
  const targetStation = getStationForDong(districtName, dongName);
  if (targetStation && targetStation !== currentStationCode) {
    fetchAirData(targetStation);
  }

  // 우측 하단 상세 카드 렌더링
  renderDetailCard(districtName, dongName, fullName, routeId);

  // 선택된 동의 실제 SVG 곡선 경계선 전용 최상단 네온 오버레이 표출
  updateDongHighlightOverlay(districtName, dongName);

  // Leaflet 동 폴리곤 스타일 갱신 및 선택된 동을 최상단으로 올림
  if (leafletDongLayer) {
    leafletDongLayer.setStyle(getDongStyle);
    leafletDongLayer.eachLayer(l => {
      if (l.feature && l.feature.properties && l.feature.properties.dong === dongName) {
        l.bringToFront();
      }
    });
  }

  // Leaflet 도로망 노선 스타일 갱신 (동 클릭 시에는 카메라 강제 줌아웃 방지)
  highlightLeafletDistrict(districtName, routeId, false);
}

function highlightLeafletDistrict(districtName, targetRouteId = null, shouldFitBounds = false) {
  if (!leafletMapInstance) return;

  // 동 폴리곤 스타일 동기화 (선택된 구의 실제 SVG 경계선 테두리 강조)
  if (leafletDongLayer) {
    leafletDongLayer.setStyle(getDongStyle);
  }

  const distBounds = [];

  // 1. 행정구역 동 레이어에서 해당 자치구 영역 바운드 추출 (단일 노선 선택이 아닐 때만 자치구 바운드 사용)
  if (!targetRouteId && leafletDongLayer && shouldFitBounds) {
    leafletDongLayer.eachLayer(layer => {
      if (layer.feature && layer.feature.properties && layer.feature.properties.district === districtName) {
        const b = layer.getBounds();
        distBounds.push(b.getSouthWest());
        distBounds.push(b.getNorthEast());
      }
    });
  }

  // 2. 도로망 노선 스타일 갱신 (더미 노선이 켜져 있을 때만)
  if (leafletRoutePolylines && leafletRoutePolylines.length > 0 && isDummyRoutesVisible) {
    leafletRoutePolylines.forEach(p => {
      // [중요] 특정 노선을 직접 클릭한 경우: 오직 그 1개 노선만 단독 강조!
      if (targetRouteId) {
        if (p.routeData && p.routeData.id === targetRouteId) {
          p.setStyle({ color: '#c084fc', weight: 8.5, opacity: 1 });
          p.bringToFront();
          if (p.routeData.points && shouldFitBounds) {
            p.routeData.points.forEach(pt => distBounds.push(L.latLng(pt[0], pt[1])));
          }
        } else {
          // [사용자 요청]: 더미 노선 투명도 낮게 한 것 풀고 또렷하게 고정 (0.82)
          const pColor = p.routeData ? (p.routeData.color || '#a855f7') : '#a855f7';
          p.setStyle({ color: pColor, weight: 4.8, opacity: 0.82 });
        }
      } else {
        // 좌측 자치구 필터를 클릭한 경우: 해당 자치구 권역 노선 강조
        if (p.routeData && p.routeData.district && p.routeData.district.includes(districtName)) {
          p.setStyle({ color: '#c084fc', weight: 7.5, opacity: 1 });
          p.bringToFront();
          if (p.routeData.points && shouldFitBounds) {
            p.routeData.points.forEach(pt => distBounds.push(L.latLng(pt[0], pt[1])));
          }
        } else {
          const pColor = p.routeData ? (p.routeData.color || '#a855f7') : '#a855f7';
          p.setStyle({ color: pColor, weight: 4.8, opacity: 0.82 });
        }
      }
    });
  }

  // 3. 해당 노선 또는 권역으로 부드럽게 화면 이동 (shouldFitBounds가 true일 때만)
  if (shouldFitBounds && distBounds.length > 0 && leafletMapInstance) {
    leafletMapInstance.fitBounds(L.latLngBounds(distBounds), { padding: [60, 60], maxZoom: 14 });
  }
}

// 7. 우측 하단 상세 카드 렌더링
function renderDetailCard(districtName, dongName = null, fullName = null, routeId = null) {
  const card = document.getElementById('detail-card');
  const tag = document.getElementById('detail-tag');
  const title = document.getElementById('detail-title');
  const metrics = document.getElementById('detail-metrics');

  if (!card) return;

  const vehicle = allVehicles.find(v => v.district === districtName) || allVehicles[0] || {
    name: `${districtName} 관제차량`,
    model: '16톤 친환경 분진흡입차',
    improvement: { distance_reduction_pct: 18.4, duration_reduction_pct: 22.1, pm10_reduction_pct: 35.8, dust_efficiency_gain_pct: 28.5 },
    before_stats: { distance_km: 42.5, duration_min: 165, pm10_avg_after: 48 },
    after_stats: { distance_km: 34.7, duration_min: 128, pm10_avg_after: 31, dust_collected_kg: 84.5 }
  };
  const route = routeId ? (allRoutes.find(r => r.id === routeId) || allRoutes.find(r => r.district && r.district.includes(districtName))) : (allRoutes.find(r => r.district && r.district.includes(districtName)) || allRoutes[0]);

  const assignedStationCode = getStationForDong(districtName, dongName);
  const assignedStationName = stationCodeToDistrict[assignedStationCode] ? `${assignedStationCode} ${stationCodeToDistrict[assignedStationCode]}` : `${assignedStationCode} 측정소`;

  const dongKey = districtName + '_' + (dongName || '');
  const dongAir = (dongName && currentDongAirData) ? (currentDongAirData[dongKey] || currentDongAirData[dongName]) : null;
  const airSummaryHtml = dongAir ? `
    <div style="margin-top: 8px; font-size: 1.0rem; background: rgba(56, 189, 248, 0.08); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(56, 189, 248, 0.25); line-height: 1.4;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="color: #38bdf8; font-weight: 700;">🌬️ 동별 정밀 대기질 (IDW):</span>
        <span style="background: ${dongAir.color}25; color: ${dongAir.color}; border: 1px solid ${dongAir.color}80; padding: 1px 6px; border-radius: 4px; font-weight: 700;">${dongAir.text}</span>
      </div>
      <div style="color: #cbd5e1; font-size: 1.0rem;">
        PM10 <strong style="color: #38bdf8;">${dongAir.pm10}㎍/㎥</strong> · PM2.5 <strong style="color: #a78bfa;">${dongAir.pm25}㎍/㎥</strong>
        ${dongAir.nearest_station ? `<span style="color: #94a3b8;"> (기준: ${dongAir.nearest_station})</span>` : ''}
      </div>
    </div>
  ` : '';

  tag.textContent = fullName ? fullName : `대구광역시 ${districtName} 관제 권역`;
  title.textContent = dongName ? `${districtName} ${dongName}` : (vehicle ? vehicle.name : `${districtName} 관리구역`);

  if (vehicle) {
    metrics.innerHTML = `
      <div style="font-size: 1.0rem; color: var(--accent-blue); font-weight: 700; margin-bottom: 8px;">
        🚛 권역 전담: ${vehicle.name} (${vehicle.model})
      </div>
      <div class="metric-grid">
        <div class="metric-item">
          <span class="metric-label">운행거리 단축</span>
          <strong class="metric-val text-accent">-${vehicle.improvement.distance_reduction_pct}%</strong>
          <small style="font-size: 1.0rem; color: var(--text-muted);">${vehicle.before_stats.distance_km}km → ${vehicle.after_stats.distance_km}km</small>
        </div>
        <div class="metric-item">
          <span class="metric-label">소요시간 절감</span>
          <strong class="metric-val text-accent">-${vehicle.improvement.duration_reduction_pct}%</strong>
          <small style="font-size: 1.0rem; color: var(--text-muted);">${vehicle.before_stats.duration_min}분 → ${vehicle.after_stats.duration_min}분</small>
        </div>
        <div class="metric-item">
          <span class="metric-label">PM10 저감률</span>
          <strong class="metric-val text-emerald">-${vehicle.improvement.pm10_reduction_pct}%</strong>
          <small style="font-size: 1.0rem; color: var(--text-muted);">${vehicle.before_stats.pm10_avg_after} → ${vehicle.after_stats.pm10_avg_after} ㎍/㎥</small>
        </div>
        <div class="metric-item">
          <span class="metric-label">분진 흡입 효율</span>
          <strong class="metric-val text-emerald">+${vehicle.improvement.dust_efficiency_gain_pct}%</strong>
          <small style="font-size: 1.0rem; color: var(--text-muted);">${vehicle.after_stats.dust_collected_kg}kg 포집</small>
        </div>
      </div>
      ${airSummaryHtml}
      <div style="margin-top: 8px; font-size: 1.0rem; color: var(--text-muted); background: var(--bg-input); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--bg-border); line-height: 1.4;">
        📍 <strong>관제 권역:</strong> ${dongName ? `${districtName} ${dongName} 일대 관제 도로망` : `${districtName} 전역 주요 도로망`}<br>
        ✨ <strong>대기 측정소:</strong> ${assignedStationName} 실시간 동기화 완료
      </div>
    `;
  }

  card.style.display = 'block';
  if (window.lucide) {
    lucide.createIcons();
  }
}

function closeDetailCard() {
  const card = document.getElementById('detail-card');
  if (card) card.style.display = 'none';
}

function resetSelection() {
  selectedDistrict = null;
  selectedDongName = null;
  selectedRouteId = null;

  // 선택된 동/구 최상단 네온 하이라이트 오버레이 제거
  if (selectedDongHighlightLayer && leafletMapInstance && leafletMapInstance.hasLayer(selectedDongHighlightLayer)) {
    leafletMapInstance.removeLayer(selectedDongHighlightLayer);
    selectedDongHighlightLayer = null;
  }

  const selectEl = document.getElementById('district-filter');
  if (selectEl) selectEl.value = 'all';

  document.querySelectorAll('.district-chip').forEach(c => c.classList.remove('active'));
  closeDetailCard();

  if (leafletDongLayer) {
    leafletDongLayer.setStyle(getDongStyle);
  }

  if (leafletMapInstance) {
    leafletMapInstance.setView([35.8714, 128.6014], 11.5);
  }
}

// --------------------------------------------------------------------------
// 8. Leaflet 통합 맵 인스턴스 초기화
// --------------------------------------------------------------------------
function initRoadLeafletMap() {
  if (leafletMapInstance) {
    setTimeout(() => { leafletMapInstance.invalidateSize(); }, 200);
    return;
  }

  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // 대구 중심 좌표
  leafletMapInstance = L.map('map', {
    center: [35.8714, 128.6014],
    zoom: 11.5,
    zoomControl: false
  });
  window.leafletMapInstance = leafletMapInstance;

  // 1. 일반 도로 타일 (OpenStreetMap 기반 다크 필터, API 키 불필요)
  darkOSMTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    subdomains: 'abc',
    maxZoom: 19,
    className: 'map-tiles-dark'
  });

  // 2. 고해상도 위성 영상 (Esri Satellite, API 키 불필요)
  esriSatelliteTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 18
  });

  // 기본은 일반(다크) 지도로 설정
  darkOSMTileLayer.addTo(leafletMapInstance);

  // 줌 컨트롤 (우측 하단)
  L.control.zoom({ position: 'bottomright' }).addTo(leafletMapInstance);

  // 12개 운행구간 전담 도로망 노선 레이어 그룹 (초기화)
  leafletRouteLayerGroup = L.featureGroup();
  leafletRoutePolylines = [];

  if (allRoutes && allRoutes.length > 0) {
    allRoutes.forEach(route => {
      if ((route.multi_lines && route.multi_lines.length > 0) || (route.points && route.points.length > 0)) {
        const routeColor = route.color || '#a855f7';
        const lineCoords = (route.multi_lines && route.multi_lines.length > 0) ? route.multi_lines : route.points;
        const poly = L.polyline(lineCoords, {
          color: routeColor,
          weight: 5.2,
          opacity: 0.92,
          lineJoin: 'round',
          lineCap: 'round'
        });
        poly.routeData = route;

        // 기존 경로도 추천 경로와 같은 상시 거리 배지로 표시
        if (route.course_code) {
          const labelText = `${route.course_code}경로`;
          const badgePoints = route.multi_lines?.length
            ? route.multi_lines.flat() : route.points;
          const midPoint = badgePoints[Math.floor(badgePoints.length / 2)];
          const badgeIcon = L.divIcon({
            html: `<div class="fleet-route-dist-badge" style="--veh-color: ${routeColor};" title="${route.zone_id}구간 ${labelText} ${route.length_km}km">
              <span class="frd-dot" style="background: ${routeColor};"></span>
              <span class="frd-name">${labelText}</span>
              <span class="frd-km">${route.length_km}km</span>
            </div>`,
            className: 'fleet-route-badge-container',
            iconSize: [130, 28],
            iconAnchor: [65, 14]
          });
          const badgeMarker = L.marker(midPoint, { icon: badgeIcon, zIndexOffset: 910 });
          badgeMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            poly.openPopup(midPoint);
          });
          // 레이어 전체 및 A/B/C 개별 표시 전환과 배지의 수명을 동기화
          poly.on('add', () => badgeMarker.addTo(leafletMapInstance));
          poly.on('remove', () => badgeMarker.remove());
        }

        const popupHtml = `
          <div style="min-width: 230px; font-family: inherit;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <span style="background: ${routeColor}25; color: ${routeColor}; border: 1px solid ${routeColor}; font-size: 0.85rem; font-weight: 800; padding: 1px 6px; border-radius: 4px;">
                ${route.zone_code || '구간'}
              </span>
              <div style="font-size: 0.95rem; font-weight: 700; color: #f1f5f9;">
                ${route.name}
              </div>
            </div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 8px;">
              관제 권역: <strong style="color: #f8fafc;">${route.district}</strong> · 총연장 <strong>${route.length_km}km</strong>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: rgba(255,255,255,0.06); padding: 6px 8px; border-radius: 6px; margin-bottom: 8px;">
              <div>
                <div style="font-size: 0.75rem; color: #94a3b8;">흡입 전 미세먼지</div>
                <div style="font-size: 0.95rem; font-weight: 700; color: #f87171;">${route.pm10_before || '-'} <small style="font-size: 0.75rem;">㎍/㎥</small></div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: #94a3b8;">흡입 후 미세먼지</div>
                <div style="font-size: 0.95rem; font-weight: 700; color: #34d399;">${route.pm10_after_clean || '-'} <small style="font-size: 0.75rem;">㎍/㎥</small></div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
              <span style="color: #94a3b8;">교통 혼잡도:</span>
              <span style="color: #38bdf8; font-weight: 600;">${route.traffic_level || '보통'}</span>
            </div>
          </div>
        `;

        poly.bindPopup(popupHtml);

        poly.on('mouseover', function () {
          if (this.isZone1Dummy && !isDummyRouteViewActive) return;
          if (isMapMouseDown || isMapDragging) return;
          this.setStyle({ color: '#ffffff', weight: 7.5, opacity: 1 });
        });

        poly.on('mouseout', function () {
          if (this.isZone1Dummy && !isDummyRouteViewActive) return;
          const color = this.routeData ? (this.routeData.color || '#a855f7') : '#a855f7';
          if (selectedRouteId && this.routeData && this.routeData.id === selectedRouteId) {
            this.setStyle({ color: color, weight: 8, opacity: 1 });
          } else {
            this.setStyle({ color: color, weight: 5.2, opacity: 0.92 });
          }
        });

        poly.on('click', function (e) {
          if (!isDummyRoutesVisible) return;
          if (route.zone_id && typeof selectZone === 'function') {
            selectZone(route.zone_id, false);
          } else if (route.district) {
            selectDistrict(route.district.split('/')[0], null, false);
          }
        });

        poly.addTo(leafletRouteLayerGroup);
        leafletRoutePolylines.push(poly);
      }
    });
  }

  window.leafletRoutePolylines = leafletRoutePolylines;
  window.leafletRouteLayerGroup = leafletRouteLayerGroup;


  updateNaverControlsUI();

  // 지도 마우스 인터랙션 제어 (드래그/홀드 시 툴팁 및 잔여 호버 원천 차단)
  leafletMapInstance.on('mousedown', (e) => {
    isMapMouseDown = true;
    isMapDragging = false;
    mapMouseDownTime = Date.now();
    mapMouseDownPos = e.containerPoint;
    dismissAllTooltipsAndHovers();
  });

  leafletMapInstance.on('movestart dragstart', () => {
    isMapDragging = true;
    dismissAllTooltipsAndHovers();
  });

  leafletMapInstance.on('moveend dragend', () => {
    isMapMouseDown = false;
    lastDragEndTime = Date.now();
    dismissAllTooltipsAndHovers();
    setTimeout(() => {
      isMapDragging = false;
      dismissAllTooltipsAndHovers();
    }, 120);
  });

  // 지도 빈 공간 클릭 시 선택 초기화 (동 폴리곤 클릭 시에는 무시)
  leafletMapInstance.on('click', (e) => {
    if (justClickedDong) return;
    const elapsed = Date.now() - mapMouseDownTime;
    let dist = 0;
    if (mapMouseDownPos && e.containerPoint) {
      dist = mapMouseDownPos.distanceTo(e.containerPoint);
    }
    if (!isMapDragging && (Date.now() - lastDragEndTime >= 250) && elapsed < 300 && dist < 10) {
      resetSelection();
    }
  });

  // 브라우저 최상단 레벨에서 마우스 누름/뗌 즉각 포착 (이벤트 버블링 지연 완전 차단)
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      isMapMouseDown = true;
      dismissAllTooltipsAndHovers();
    }
  }, true);

  window.addEventListener('mouseup', () => {
    isMapMouseDown = false;
    // lastDragEndTime은 실제 dragend 이벤트에서만 갱신 (일반 클릭 오판 방지)
    dismissAllTooltipsAndHovers();
    setTimeout(() => {
      isMapDragging = false;
      dismissAllTooltipsAndHovers();
    }, 100);
  }, true);

  // 지도 컨테이너 자체에서 마우스가 나갔을 때 툴팁 정리
  mapEl.addEventListener('mouseleave', () => {
    isMapMouseDown = false;
    isMapDragging = false;
    dismissAllTooltipsAndHovers();
  });

  setTimeout(() => {
    leafletMapInstance.invalidateSize();
    // 초기 기존 노선 기본 비활성화 동기화 (사용자 요청: 기본 비활성화)
    if (typeof updateDummyRoutesVisibility === 'function') {
      updateDummyRoutesVisibility();
    }
    if (typeof syncAllDummyCoursesBtn === 'function') {
      syncAllDummyCoursesBtn();
    }
  }, 250);
}

// --------------------------------------------------------------------------
// 9. 전역 이벤트 리스너 등록
// --------------------------------------------------------------------------
function setupEventListeners() {
  // 자치구 셀렉트 변경
  const districtSelect = document.getElementById('district-filter');
  if (districtSelect) {
    districtSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'all') resetSelection();
      else selectDistrict(val);
    });
  }

  // 측정소 직접 선택 셀렉트 (좌측 패널)
  const stationSelect = document.getElementById('station-select');
  if (stationSelect) {
    stationSelect.addEventListener('change', (e) => {
      fetchAirData(e.target.value);
    });
  }

  // 모달 내 측정소 셀렉트
  const modalStationSelect = document.getElementById('modal-station-select');
  if (modalStationSelect) {
    modalStationSelect.addEventListener('change', (e) => {
      fetchAirData(e.target.value, currentAirDate);
    });
  }

  // 모달 내 조회 일자 직접 선택
  const modalDateInput = document.getElementById('modal-date-input');
  if (modalDateInput) {
    modalDateInput.addEventListener('change', (e) => {
      const hourVal = document.getElementById('modal-hour-select')?.value || currentAirHour || 'all';
      if (e.target.value) {
        refreshAirModal(e.target.value, hourVal, true);
      }
    });
  }

  // 모달 내 시간 직접 선택
  const modalHourSelect = document.getElementById('modal-hour-select');
  if (modalHourSelect) {
    modalHourSelect.addEventListener('change', (e) => {
      const dateVal = document.getElementById('modal-date-input')?.value || currentAirDate;
      refreshAirModal(dateVal, e.target.value, true);
    });
  }

  // 5분마다 실시간 대기 데이터 자동 백그라운드 갱신 (날짜가 바뀌면 자정 이후 자동 전환)
  setInterval(() => {
    // 특정 과거 날짜를 조회 중인 상태가 아니라면(실시간 모드) 최신 데이터 자동 폴링
    if (!currentAirDate) {
      fetchAirData(currentStationCode);
      fetchDistrictAirData();
    }
  }, 300000);



  // 초기화 버튼
  const resetBtn = document.getElementById('btn-reset-view');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetSelection();
    });
  }



  // 모달 백드롭 클릭 시 닫기
  const modalBackdrop = document.getElementById('air-modal');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeAirModal();
    });
  }
}

// ==========================================================================
// 10. 전역 window 객체 명시적 함수 바인딩 (인라인 onclick & 외부 모듈 호환)
// ==========================================================================
window._realSetMasterView = setMasterView;
window.setMasterView = setMasterView;
window._realToggleNaverOverlay = toggleNaverOverlay;
window.toggleNaverOverlay = toggleNaverOverlay;
window.setNaverBaseMap = setNaverBaseMap;
window._realOpenAirModal = openAirModal;
window.openAirModal = openAirModal;
window._realCloseAirModal = closeAirModal;
window.closeAirModal = closeAirModal;
window._realCloseDetailCard = closeDetailCard;
window.closeDetailCard = closeDetailCard;
window.selectDistrict = selectDistrict;
window.selectDistrictAndDong = selectDistrictAndDong;
window.selectDong = selectDistrictAndDong;
window.resetSelection = resetSelection;
window.fetchAirData = fetchAirData;

// 대기 중인 뷰 전환 요청이 있다면 즉시 적용
if (window._pendingMasterView) {
  setMasterView(window._pendingMasterView);
}

// ==========================================================================
// 데모용: 특정 날짜 대기 데이터 전체 로드 & 지도 색상 및 모달 표 갱신
// ==========================================================================
function invalidateRouteForAirSelection() {
  routeContextRevision += 1;
  window.currentDynamicRouteData = null;
  if (patrolNavActive) stopPatrolNavigation();
  clearDynamicRouteLayers();
  closeDynamicRoutePanel();
  if (typeof renderZoneDashboardCard === 'function' && typeof DAEGU_15_ZONES !== 'undefined') {
    const zone = DAEGU_15_ZONES.find(z => z.id === selectedZoneId);
    if (zone) renderZoneDashboardCard(zone);
  }
}

async function loadDemoAirDate(dateStr) {
  const demoBtn = document.getElementById('btn-demo-date');
  const resetBtn = document.getElementById('btn-demo-reset');

  // 버튼 로딩 상태
  if (demoBtn) {
    demoBtn.disabled = true;
    demoBtn.innerHTML = '<i data-lucide="loader" class="spin-animation"></i><span>불러오는 중...</span>';
    if (window.lucide) lucide.createIcons();
  }

  currentAirDate = dateStr;
  currentAirHour = 'all';
  invalidateRouteForAirSelection(); // 이전 날짜 경로와 진행 중 요청 무효화

  // 모달 조회일자 인풋 동기화
  const dateInput = document.getElementById('modal-date-input');
  if (dateInput) {
    dateInput.value = dateStr;
  }
  const hourSelect = document.getElementById('modal-hour-select');
  if (hourSelect) {
    hourSelect.value = 'all';
  }

  // 1. 단일 URL 전체 자치구/측정소 로드 & 현재 측정소 상세 데이터 동시 병렬 로드
  await Promise.all([
    fetchDistrictAirData(dateStr, 'all'),
    fetchAirData(currentStationCode, dateStr, true)
  ]);

  // 버튼 UI 전환 (데모 → 복귀 버튼 표시)
  if (demoBtn) {
    demoBtn.style.display = 'none';
    demoBtn.disabled = false;
    demoBtn.innerHTML = '<i data-lucide="calendar-clock"></i><span>📅 2026-03-24 데모 데이터 보기</span>';
  }
  if (resetBtn) {
    resetBtn.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }
}

async function resetToRealtimeAir() {
  const demoBtn = document.getElementById('btn-demo-date');
  const resetBtn = document.getElementById('btn-demo-reset');

  currentAirDate = null;
  currentAirHour = 'all';
  invalidateRouteForAirSelection(); // 실시간 복귀 시 데모 경로 제거

  // 모달 날짜 인풋 오늘 날짜로 복귀
  const dateInput = document.getElementById('modal-date-input');
  if (dateInput) {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    dateInput.value = new Date(now.getTime() - offset).toISOString().split('T')[0];
  }
  const hourSelect = document.getElementById('modal-hour-select');
  if (hourSelect) {
    hourSelect.value = 'all';
  }

  // 실시간 날짜(오늘)로 동시 병렬 복귀
  await Promise.all([
    fetchDistrictAirData(null, 'all'),
    fetchAirData(currentStationCode, null, true)
  ]);

  if (resetBtn) resetBtn.style.display = 'none';
  if (demoBtn) {
    demoBtn.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }
}

window.loadDemoAirDate = loadDemoAirDate;
window.resetToRealtimeAir = resetToRealtimeAir;
window.refreshAirModal = refreshAirModal;
window.fetchDistrictAirData = fetchDistrictAirData;

// ==========================================================================
// 1구간 실시간 대기반응형 분진흡입차량 동적 최적 노선 생성 & 관제 모듈
// ==========================================================================

let dynamicRoutePolyline = null;
let dynamicRouteMarkersGroup = null;
let dynamicSimulationMarker = null;
let dynamicSimulationTimer = null;
let dynamicSimulationIndex = 0;
let dynamicRouteViewMode = 'dynamic'; // 'dynamic' | 'static' | 'both'
// 기존 전체 더미 노선 데이터(1~13구간) 표시/숨김 여부 플래그
let isDummyRoutesVisible = false;
window.isDummyRoutesVisible = false;

function hideDynamicRouteFromMap() {
  if (dynamicRouteMarkersGroup && leafletMapInstance && leafletMapInstance.hasLayer(dynamicRouteMarkersGroup)) {
    leafletMapInstance.removeLayer(dynamicRouteMarkersGroup);
  }
  if (dynamicRoutePolyline) {
    dynamicRoutePolyline.setStyle({ opacity: 0 });
  }
}

async function ensureDynamicRouteLoadedAndVisible(shouldZoom = false) {
  if (!leafletMapInstance) return;

  // 사용자가 명시적으로 '노선 생성' 버튼을 눌러 생성된 데이터가 있을 때만 지도에 표출
  if (window.currentDynamicRouteData) {
    if (dynamicRouteMarkersGroup && !leafletMapInstance.hasLayer(dynamicRouteMarkersGroup)) {
      dynamicRouteMarkersGroup.addTo(leafletMapInstance);
    }
    if (dynamicRoutePolyline) {
      dynamicRoutePolyline.setStyle({ opacity: 0.95, weight: 6.5 });
      if (shouldZoom) {
        leafletMapInstance.fitBounds(dynamicRoutePolyline.getBounds(), { padding: [40, 40], animate: true });
      }
    }
    if (typeof updateFleetRouteOpacity === 'function') {
      updateFleetRouteOpacity();
    }
  }
}

/**
 * 기존 전체 더미 노선 데이터(1~13구간) 보기 / 숨기기 토글
 * (사용자 요청: "최적 노선으로 복귀 말고 그냥 기존 더미 노선 데이터 보기 숨기기로만 해줘.
 *  그리고 그 더미 노선데이터가 1구간 말고 전체 더미 데이터를 보기, 숨기기 가능하도록")
 */
// 더미데이터 A, B, C 개별 가시성 필터 상태 (기본값: 모두 비활성화)
window.dummyFilterState = {
  A: false,
  B: false,
  C: false
};

/**
 * 기존 전체 더미 노선 데이터(1~13구간) 보기 / 숨기기 메인 토글
 */
function toggleDummyRouteView() {
  isDummyRoutesVisible = !isDummyRoutesVisible;
  window.isDummyRoutesVisible = isDummyRoutesVisible;

  const btn = document.getElementById('btn-toggle-dummy-route');
  const textEl = document.getElementById('text-dummy-route');
  const iconEl = document.getElementById('icon-dummy-route');

  if (isDummyRoutesVisible) {
    if (btn) btn.classList.add('active');
    if (textEl) textEl.textContent = '🗺️ 기존 노선 표시';
    if (iconEl) iconEl.setAttribute('data-lucide', 'route');
    // 모든 서브 코스도 활성화
    if (!window.dummyFilterState) {
      window.dummyFilterState = { A: false, B: false, C: false };
    }
    ['A', 'B', 'C'].forEach(c => {
      window.dummyFilterState[c] = true;
      const sub = document.getElementById(`btn-dummy-course-${c}`);
      if (sub) sub.classList.add('active');
    });
  } else {
    if (btn) btn.classList.remove('active');
    if (textEl) textEl.textContent = '🗺️ 기존 노선 숨김';
    if (iconEl) iconEl.setAttribute('data-lucide', 'eye-off');
    // 서브 버튼 스타일 비활성화
    ['A', 'B', 'C'].forEach(c => {
      window.dummyFilterState[c] = false;
      const sub = document.getElementById(`btn-dummy-course-${c}`);
      if (sub) sub.classList.remove('active');
    });
  }

  updateDummyRoutesVisibility();
  syncAllDummyCoursesBtn();
  if (window.lucide) lucide.createIcons();
}

/**
 * 더미데이터 개별 코스(A:빨강, B:주황, C:보라) 개별 토글
 */
function toggleDummyCourse(courseCode) {
  if (!window.dummyFilterState) {
    window.dummyFilterState = { A: false, B: false, C: false };
  }

  window.dummyFilterState[courseCode] = !window.dummyFilterState[courseCode];
  
  const anyActive = !!(window.dummyFilterState.A || window.dummyFilterState.B || window.dummyFilterState.C);
  isDummyRoutesVisible = anyActive;
  window.isDummyRoutesVisible = anyActive;

  // 버튼 스타일 동기화
  const subBtn = document.getElementById(`btn-dummy-course-${courseCode}`);
  if (subBtn) {
    if (window.dummyFilterState[courseCode]) {
      subBtn.classList.add('active');
    } else {
      subBtn.classList.remove('active');
    }
  }

  updateDummyRoutesVisibility();
  syncAllDummyCoursesBtn();
}

/**
 * 더미데이터 A, B, C 전체 일괄 켜기 / 끄기
 */
function toggleAllDummyCourses() {
  if (!window.dummyFilterState) {
    window.dummyFilterState = { A: false, B: false, C: false };
  }

  const allActive = !!(window.dummyFilterState.A && window.dummyFilterState.B && window.dummyFilterState.C);
  const targetState = !allActive;

  window.dummyFilterState.A = targetState;
  window.dummyFilterState.B = targetState;
  window.dummyFilterState.C = targetState;
  isDummyRoutesVisible = targetState;
  window.isDummyRoutesVisible = targetState;

  ['A', 'B', 'C'].forEach(c => {
    const subBtn = document.getElementById(`btn-dummy-course-${c}`);
    if (subBtn) {
      if (targetState) subBtn.classList.add('active');
      else subBtn.classList.remove('active');
    }
  });

  updateDummyRoutesVisibility();
  syncAllDummyCoursesBtn();
}

function syncAllDummyCoursesBtn() {
  const allBtn = document.getElementById('btn-dummy-all-toggle');
  if (!allBtn) return;

  const anyActive = !!(window.dummyFilterState.A || window.dummyFilterState.B || window.dummyFilterState.C);
  const allActive = !!(window.dummyFilterState.A && window.dummyFilterState.B && window.dummyFilterState.C);

  if (allActive) {
    allBtn.classList.add('active');
    allBtn.textContent = '전체 끄기';
  } else {
    allBtn.classList.remove('active');
    allBtn.textContent = '전체 켜기';
  }
  isDummyRoutesVisible = anyActive;
  window.isDummyRoutesVisible = anyActive;
}

/**
 * 개별 A, B, C 필터 상태와 메인 노선 가시성을 폴리라인 레이어에 동적 적용
 */
function updateDummyRoutesVisibility() {
  if (!leafletMapInstance) return;

  if (isDummyRoutesVisible) {
    if (leafletRouteLayerGroup && !leafletMapInstance.hasLayer(leafletRouteLayerGroup)) {
      leafletMapInstance.addLayer(leafletRouteLayerGroup);
      leafletRouteLayerGroup.bringToBack();
    }

    if (leafletRoutePolylines && leafletRoutePolylines.length > 0) {
      leafletRoutePolylines.forEach(p => {
        const course = p.routeData ? p.routeData.course_code : null;
        const isCourseActive = course ? (window.dummyFilterState[course] === true) : true;

        if (isCourseActive) {
          if (!leafletRouteLayerGroup.hasLayer(p)) {
            leafletRouteLayerGroup.addLayer(p);
          }
          const color = p.routeData ? (p.routeData.color || '#a855f7') : '#a855f7';
          p.setStyle({ opacity: 0.92, weight: 5.2, color: color });
          // 필터를 켤 때 자동으로 띄우지 않고 마우스 호버 시에만 표시
          if (p.getTooltip()) {
            p.closeTooltip();
          }
        } else {
          if (leafletRouteLayerGroup.hasLayer(p)) {
            leafletRouteLayerGroup.removeLayer(p);
          }
          if (p.getTooltip()) {
            p.closeTooltip();
          }
        }
      });
    }
  } else {
    if (leafletRouteLayerGroup && leafletMapInstance.hasLayer(leafletRouteLayerGroup)) {
      leafletMapInstance.removeLayer(leafletRouteLayerGroup);
    }
    if (leafletRoutePolylines && leafletRoutePolylines.length > 0) {
      leafletRoutePolylines.forEach(p => {
        if (p.getTooltip()) {
          p.closeTooltip();
        }
      });
    }
  }
}

window.toggleDummyRouteView = toggleDummyRouteView;
window.toggleDummyCourse = toggleDummyCourse;
window.toggleAllDummyCourses = toggleAllDummyCourses;
window.updateDummyRoutesVisibility = updateDummyRoutesVisibility;

/**
 * 1~13 전 구간 실시간 대기현황 기반 동적 노선 생성 API 호출 및 맵 렌더링
 */
async function generateAndDisplayDynamicRoute(zoneId = null, dateStr = null, hourStr = null) {
  // 인자 보정 (지정된 zoneId 없으면 현재 선택된 zoneId 또는 기본 1구간)
  const targetZoneId = zoneId ? Number(zoneId) : (typeof selectedZoneId !== 'undefined' && selectedZoneId ? selectedZoneId : 1);

  if (!dateStr && currentAirDate) {
    dateStr = currentAirDate;
  }
  if (!hourStr && typeof currentAirHour !== 'undefined' && currentAirHour !== 'all') {
    hourStr = currentAirHour;
  }

  // 요청을 시작한 시점의 날짜/시간과 세대를 고정
  const requestRevision = routeContextRevision;
  const requestId = ++routeGenerationRequestId;
  const requestDate = dateStr || null;
  const requestHour = hourStr || 'all';

  // 선택 구간 동기화 (클릭 시 캔버스 줌 변경 방지)
  if (typeof selectZone === 'function') {
    selectZone(targetZoneId, false);
  }

  // 버튼 로딩 상태 표시
  const btnZ1 = document.getElementById('btn-gen-dynamic-z1');
  const btnLive = document.getElementById('btn-ai-gen-live');
  const btnDemo = document.getElementById('btn-ai-gen-demo');

  const origTextZ1 = btnZ1 ? btnZ1.innerHTML : '';
  if (btnZ1) {
    btnZ1.classList.add('loading');
    btnZ1.innerHTML = `<span class="pulse-dot-cyan"></span><span>${targetZoneId}구간 선택한 대기자료로 연산 중...</span>`;
  }
  if (btnLive) {
    btnLive.classList.add('loading');
    btnLive.disabled = true;
  }
  if (btnDemo) {
    btnDemo.classList.add('loading');
    btnDemo.disabled = true;
  }

  try {
    const url = `/api/routes/dynamic-generate?zone_id=${targetZoneId}&date=${encodeURIComponent(requestDate || '')}&hour=${encodeURIComponent(requestHour)}`;
    const res = await fetch(url);
    const data = await res.json();
    // 대기 기준 변경 후 늦게 도착한 이전 요청은 지도에 그리지 않음
    if (requestRevision !== routeContextRevision || requestId !== routeGenerationRequestId) return;

    if (data.success && data.dynamic_route) {
      window.currentDynamicRouteData = data;

      // 1. 지도상에 동적 노선 및 거점 마커 표출 (캔버스 자동 줌 비활성화)
      renderDynamicRouteOnMap(data, false);

      // 2. 종합 관제 모달 UI 데이터 백그라운드 준비
      updateDynamicRouteModalUI(data);

      // 3. 우측 하단 선택 구간 카드 상태 즉시 갱신
      if (typeof renderZoneDashboardCard === 'function') {
        const targetZoneObj = (typeof DAEGU_15_ZONES !== 'undefined') ? DAEGU_15_ZONES.find(z => z.id === targetZoneId) : null;
        if (targetZoneObj) renderZoneDashboardCard(targetZoneObj);
      }

      console.log('[DynamicRoute] 단일 추천 경로 생성', data.methodology);
    } else {
      alert(data.message || '동적 노선 생성 중 오류가 발생했습니다.');
    }
  } catch (err) {
    console.error('동적 노선 생성 통신 실패:', err);
    if (requestRevision === routeContextRevision && requestId === routeGenerationRequestId) {
      alert('서버와 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  } finally {
    if (requestId !== routeGenerationRequestId) return;
    if (btnZ1) {
      btnZ1.classList.remove('loading');
      btnZ1.innerHTML = origTextZ1 || `<span>⚡ ${targetZoneId}구간 추천 경로 생성</span>`;
    }
    if (btnLive) {
      btnLive.classList.remove('loading');
      btnLive.disabled = false;
    }
    if (btnDemo) {
      btnDemo.classList.remove('loading');
      btnDemo.disabled = false;
    }
    if (window.lucide) lucide.createIcons();
  }
}

/**
 * 지도에 동적 노선(Polyline) 및 순번 마커(Numbered Markers) 표출
 */
let dynamicFleetPolylines = [];
let dynamicFleetActiveFilter = 'all';
let patrolNavActiveVehicleId = null;

/**
 * 노선 및 마커 투명도 제어:
 * - 내비 상태가 아닐 때: 모든 노선 및 마커를 100% 선명하게 불투명 표시
 * - 내비 상태일 때: 현재 주행 중인 해당 노선만 불투명, 그 외 노선은 투명(0.15) 처리
 */
function updateFleetRouteOpacity() {
  if (!dynamicFleetPolylines || dynamicFleetPolylines.length === 0) return;

  if (patrolNavActive && patrolNavActiveVehicleId) {
    // 1. 내비 상태: 해당하는 노선만 불투명, 타 노선은 투명하게
    dynamicFleetPolylines.forEach(item => {
      if (item.vehicleId === patrolNavActiveVehicleId) {
        item.polyline.setStyle({ opacity: 0.95, weight: 6.5 });
      } else {
        item.polyline.setStyle({ opacity: 0.15, weight: 3 });
      }
    });

    if (dynamicRouteMarkersGroup) {
      dynamicRouteMarkersGroup.eachLayer(layer => {
        if (layer instanceof L.Marker && layer.vehicleId) {
          if (layer.vehicleId === patrolNavActiveVehicleId) {
            layer.setOpacity(1.0);
          } else {
            layer.setOpacity(0.15);
          }
        }
      });
    }
  } else {
    // 2. 내비 상태가 아님: 모든 노선과 마커 전부 완전 불투명
    dynamicFleetPolylines.forEach(item => {
      item.polyline.setStyle({ opacity: 0.95, weight: 6.5 });
    });

    if (dynamicRouteMarkersGroup) {
      dynamicRouteMarkersGroup.eachLayer(layer => {
        if (layer instanceof L.Marker) {
          layer.setOpacity(1.0);
        }
      });
    }
  }
}

/**
 * 지도에 다중 분진흡입차량(Fleet) 동적 노선 및 순번 마커 표출
 * - 각 차량별 전용 네온 컬러(1호차: 레드, 2호차: 오렌지, 3호차: 퍼플) 폴리라인 동시 표출
 * - 차량당 80km 한도 제약 표기
 */
function renderDynamicRouteOnMap(data, shouldZoom = false) {
  if (!leafletMapInstance) return;

  const fleetRoutes = data.fleet_routes || (data.dynamic_route ? [data.dynamic_route] : []);
  const allStops = (data.dynamic_route && data.dynamic_route.stops) ? data.dynamic_route.stops : [];

  // 기존 동적 레이어 정리
  clearDynamicRouteLayers();

  dynamicRouteMarkersGroup = L.featureGroup();
  dynamicFleetPolylines = [];

  // 1. 차량별 동적 도로망 네온 Polyline 생성 (다중 노선 및 세그먼트 지원)
  fleetRoutes.forEach((route, vIdx) => {
    if (!route.points || route.points.length === 0) return;

    const routeColor = route.color || (vIdx === 0 ? '#ef4444' : (vIdx === 1 ? '#f97316' : '#a855f7'));
    let mainPolyForPopup = null;

    const routePopupHtml = `
      <div style="min-width: 270px; font-family: inherit;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <span style="background: ${route.accent_bg || 'rgba(6, 182, 212, 0.2)'}; color: ${routeColor}; border: 1px solid ${routeColor}; font-size: 0.78rem; font-weight: 800; padding: 2px 7px; border-radius: 4px;">
            ${route.vehicle_name || `${vIdx + 1}호차`}
          </span>
          <span style="font-size: 0.78rem; color: #34d399; font-weight: 700;">
            ${route.is_within_limit ? '평균 거리 상한 이내' : '거리 상한 초과'}
          </span>
        </div>
        <div style="font-size: 1rem; font-weight: 800; color: #f8fafc; margin-bottom: 4px;">
          ${route.route_title || route.name}
        </div>
        <div style="font-size: 0.84rem; color: #94a3b8; margin-bottom: 8px;">
          총 운행 <strong>${route.total_dist_km}km</strong> / 목표 ${Number(route.max_dist_limit_km).toFixed(2)}km · 소요 <strong>${route.est_work_min}분</strong>
        </div>
        ${route.has_highway_transit ? `
        <div style="display: flex; gap: 6px; margin-bottom: 8px; font-size: 0.76rem;">
          <span style="flex: 1; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4); color: #38bdf8; padding: 4px 6px; border-radius: 4px; text-align: center;">
            🧹 청소 ${route.cleaning_dist_km || route.total_dist_km}km
          </span>
          <span style="flex: 1; background: rgba(148, 163, 184, 0.15); border: 1px solid rgba(148, 163, 184, 0.4); color: #94a3b8; padding: 4px 6px; border-radius: 4px; text-align: center;">
            🚗 고속이동 ${route.transit_highway_dist_km || 0}km
          </span>
        </div>` : ''}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: rgba(255,255,255,0.06); padding: 8px; border-radius: 6px; margin-bottom: 8px;">
          <div>
            <div style="font-size: 0.72rem; color: #94a3b8;">방문 거점 평균 PM10</div>
            <div style="font-size: 1rem; font-weight: 800; color: #38bdf8;">${route.avg_target_pm10 ?? '-'} <small style="font-size: 0.72rem;">㎍/㎥</small></div>
          </div>
          <div>
            <div style="font-size: 0.72rem; color: #94a3b8;">순회 거점</div>
            <div style="font-size: 1rem; font-weight: 800; color: #34d399;">${(route.stops || []).length} <small style="font-size: 0.72rem;">개소</small></div>
          </div>
        </div>
        <div style="text-align: center;">
          <button onclick="openDynamicRoutePanel(); setFleetFilter('${route.vehicle_id}');" style="width: 100%; padding: 6px; border-radius: 6px; background: ${routeColor}; color: #ffffff; border: none; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
            📋 ${route.vehicle_name || `${vIdx + 1}호차`} 작업 지시서 보기
          </button>
        </div>
      </div>
    `;

    // 1-1. 세그먼트(일반 청소 도로 vs 고속도로 단순 이동) 지원
    if (route.segments && route.segments.length > 0) {
      route.segments.forEach((seg, sIdx) => {
        if (!seg.points || seg.points.length < 2) return;
        const isHighway = seg.type === 'highway_transit';
        const segColor = isHighway ? '#94a3b8' : (seg.color || routeColor);
        const segPoly = L.polyline(seg.points, {
          color: segColor,
          weight: isHighway ? 4.5 : 6.5,
          opacity: isHighway ? 0.85 : 0.95,
          dashArray: isHighway ? '6,8' : '',
          lineJoin: 'round',
          lineCap: 'round',
          className: isHighway ? 'dynamic-route-highway-transit' : 'dynamic-route-neon'
        });

        const segTooltip = isHighway 
          ? `🚗 고속도로 단순 이동 (청소 미수행): ${seg.distance_km}km`
          : `🧹 살수·흡입 청소 작업 구간: ${seg.distance_km}km`;
        segPoly.bindTooltip(segTooltip, { sticky: true, className: 'route-segment-tooltip' });
        segPoly.bindPopup(routePopupHtml);

        if (!mainPolyForPopup || !isHighway) {
          mainPolyForPopup = segPoly;
        }

        dynamicRouteMarkersGroup.addLayer(segPoly);
        dynamicFleetPolylines.push({
          vehicleId: route.vehicle_id,
          polyline: segPoly,
          routeData: route
        });
      });
    } else {
      const poly = L.polyline(route.points, {
        color: routeColor,
        weight: 6.5,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
        className: 'dynamic-route-neon'
      });
      poly.bindPopup(routePopupHtml);
      mainPolyForPopup = poly;
      dynamicFleetPolylines.push({
        vehicleId: route.vehicle_id,
        polyline: poly,
        routeData: route
      });
      dynamicRouteMarkersGroup.addLayer(poly);
    }

    // 1-1. 각 차량 운행 노선 경로 위에 '차량 운행 거리' 네온 플로팅 배지 마커 생성
    if (route.points && route.points.length > 0) {
      const midIdx = Math.floor(route.points.length / 2);
      const midPoint = route.points[midIdx] || route.points[0];

      const distBadgeHtml = `
        <div class="fleet-route-dist-badge" style="--veh-color: ${routeColor};" title="추천 경로 ${route.total_dist_km}km · ${data.observation_context?.label || ''}">
          <span class="frd-dot" style="background: ${routeColor};"></span>
          <span class="frd-name">추천 경로</span>
          <span class="frd-km">${route.total_dist_km}km</span>
        </div>
      `;

      const distBadgeIcon = L.divIcon({
        html: distBadgeHtml,
        className: 'fleet-route-badge-container',
        iconSize: [175, 28],
        iconAnchor: [87, 14]
      });

      const distMarker = L.marker(midPoint, { icon: distBadgeIcon, zIndexOffset: 920 });
      distMarker.vehicleId = route.vehicle_id;
      distMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        poly.openPopup(midPoint);
      });
      dynamicRouteMarkersGroup.addLayer(distMarker);
    }
  });

  // 하위 호환용 단일 polyline 참조 설정
  dynamicRoutePolyline = dynamicFleetPolylines.length > 0 ? dynamicFleetPolylines[0].polyline : null;

  // 2. 순회 거점 순서 원형 마커는 사용자 요청에 따라 표시하지 않음 (노선 선형만 깔끔하게 표출)
  allStops.forEach((stop, idx) => {
    stop.leafletMarker = null;
  });

  dynamicRouteMarkersGroup.addTo(leafletMapInstance);

  // 3. 지도 줌 (사용자 요청: 자동 줌 방지 플래그 적용 시 비활성)
  if (shouldZoom && dynamicRouteMarkersGroup) {
    leafletMapInstance.fitBounds(dynamicRouteMarkersGroup.getBounds(), {
      padding: [40, 40],
      animate: true,
      duration: 0.8
    });
  }

  // 4. 가시성 동기화
  applyRouteViewModeStyle();
  updateFleetRouteOpacity();
}

/**
 * 동적 레이어 제거
 */
function clearDynamicRouteLayers() {
  if (dynamicSimulationTimer) {
    clearInterval(dynamicSimulationTimer);
    dynamicSimulationTimer = null;
  }
  if (dynamicSimulationMarker && leafletMapInstance) {
    leafletMapInstance.removeLayer(dynamicSimulationMarker);
    dynamicSimulationMarker = null;
  }
  if (dynamicRouteMarkersGroup) {
    dynamicRouteMarkersGroup.clearLayers();
    if (leafletMapInstance && leafletMapInstance.hasLayer(dynamicRouteMarkersGroup)) {
      leafletMapInstance.removeLayer(dynamicRouteMarkersGroup);
    }
    dynamicRouteMarkersGroup = null;
  }
  dynamicFleetPolylines = [];
  dynamicRoutePolyline = null;
}

/**
 * 뷰 모드 전환 (dynamic / static / both)
 */
function switchRouteViewMode(mode) {
  dynamicRouteViewMode = mode;

  document.querySelectorAll('.drm-view-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-view-${mode}`);
  if (activeBtn) activeBtn.classList.add('active');

  applyRouteViewModeStyle();
}

function applyRouteViewModeStyle() {
  const staticRoute1Poly = (leafletRoutePolylines || []).find(p => p.routeData && p.routeData.zone_id === 1);

  if (dynamicRouteViewMode === 'dynamic') {
    dynamicFleetPolylines.forEach(item => {
      item.polyline.setStyle({ opacity: 0.95, weight: 6.5 });
    });
    if (dynamicRouteMarkersGroup && leafletMapInstance && !leafletMapInstance.hasLayer(dynamicRouteMarkersGroup)) {
      dynamicRouteMarkersGroup.addTo(leafletMapInstance);
    }
    if (staticRoute1Poly) {
      // [사용자 요청]: 더미 노선 투명도 낮게 한 것 풀고 또렷하게 고정 (0.88)
      staticRoute1Poly.setStyle({ opacity: 0.88, weight: 5.2 });
    }
    if (isDummyRoutesVisible && leafletRoutePolylines && leafletRoutePolylines.length > 0) {
      leafletRoutePolylines.forEach(p => {
        const color = p.routeData ? (p.routeData.color || '#a855f7') : '#a855f7';
        p.setStyle({ opacity: 0.88, weight: 5.0, color: color });
      });
    }
  } else if (dynamicRouteViewMode === 'static') {
    dynamicFleetPolylines.forEach(item => {
      item.polyline.setStyle({ opacity: 0 });
    });
    if (dynamicRouteMarkersGroup && leafletMapInstance && leafletMapInstance.hasLayer(dynamicRouteMarkersGroup)) {
      leafletMapInstance.removeLayer(dynamicRouteMarkersGroup);
    }
    if (staticRoute1Poly) {
      staticRoute1Poly.setStyle({ opacity: 1, weight: 6.5, color: '#10b981' });
      staticRoute1Poly.bringToFront();
    }
  } else if (dynamicRouteViewMode === 'both') {
    dynamicFleetPolylines.forEach(item => {
      item.polyline.setStyle({ opacity: 0.95, weight: 5.5 });
    });
    if (dynamicRouteMarkersGroup && leafletMapInstance && !leafletMapInstance.hasLayer(dynamicRouteMarkersGroup)) {
      dynamicRouteMarkersGroup.addTo(leafletMapInstance);
    }
    if (staticRoute1Poly) {
      staticRoute1Poly.setStyle({ opacity: 0.85, weight: 5.5, color: '#06b6d4' });
      staticRoute1Poly.bringToFront();
    }
  }
}

/**
 * 함대(Fleet) 차량 필터 전환 (전체보기 / 1호차 / 2호차 / 3호차)
 */
function setFleetFilter(filterId) {
  // 이미 활성화된 호차를 한 번 더 누르면 전체 보기('all')로 토글
  if (dynamicFleetActiveFilter === filterId) {
    dynamicFleetActiveFilter = 'all';
  } else {
    dynamicFleetActiveFilter = filterId;
  }

  // 탭 버튼 스타일
  document.querySelectorAll('.fleet-tab-btn:not(.fleet-nav-direct-btn)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vehicleId === dynamicFleetActiveFilter);
  });

  // 작업지시서 테이블 필터 칩 스타일
  document.querySelectorAll('.table-filter-chip').forEach(btn => {
    const vId = btn.dataset.vehicleId;
    btn.classList.toggle('active', vId === dynamicFleetActiveFilter);
  });

  // 지도 Polyline & 마커 투명도 제어 (내비 상태가 아니면 전부 불투명 유지)
  updateFleetRouteOpacity();

  // 모달 테이블 행 필터링
  document.querySelectorAll('.drm-stops-table tbody tr').forEach(row => {
    const rowVehId = row.dataset.vehicleId;
    if (dynamicFleetActiveFilter === 'all' || rowVehId === dynamicFleetActiveFilter) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

/**
 * 종합 관제 모달 UI 업데이트 (다중 차량 함대 지원)
 */
function updateDynamicRouteModalUI(data) {
  const dyn = data.dynamic_route;
  const comp = data.static_comparison;
  const air = data.air_status;
  const fleet = data.fleet_summary || {};
  const fleetRoutes = data.fleet_routes || (dyn ? [dyn] : []);

  // 헤더 타이틀 및 전략 뱃지 동적 반영 (군더더기 중복 제거 및 간소화)
  const titleEl = document.querySelector('.drm-title span:first-child');
  if (titleEl) {
    titleEl.textContent = dyn.name || `${data.zone_name || data.zone_id + '구간'} 최적 정화 노선`;
  }

  const tagEl = document.querySelector('.drm-title .zdc-tag');
  if (tagEl) {
    const stratBadge = fleet.strategy_badge || dyn.strategy_badge || `${fleet.active_vehicles_count || 1}개 경로`;
    tagEl.textContent = stratBadge;
    tagEl.style.background = fleet.is_emergency ? 'rgba(239, 68, 68, 0.2)' : 'rgba(6, 182, 212, 0.2)';
    tagEl.style.color = fleet.is_emergency ? '#ef4444' : '#38bdf8';
    tagEl.style.borderColor = fleet.is_emergency ? 'rgba(239, 68, 68, 0.4)' : 'rgba(6, 182, 212, 0.4)';
  }

  const timeEl = document.getElementById('drm-generated-time');
  if (timeEl) {
    timeEl.innerHTML = `대기 기준: <strong>${data.observation_context?.label || "조회 기준 확인 필요"}</strong><br>생성시각: <strong>${data.generated_at}</strong> · <strong>${fleet.active_vehicles_count || 1}개 추천 경로</strong>`;
  }

  // 차량별 탭 바 컨테이너 생성/갱신 (#drm-fleet-tabs)
  let tabsContainer = document.getElementById('drm-fleet-tabs');
  if (!tabsContainer) {
    const airBanner = document.getElementById('drm-air-banner');
    if (airBanner) {
      tabsContainer = document.createElement('div');
      tabsContainer.id = 'drm-fleet-tabs';
      tabsContainer.className = 'drm-fleet-tabs-row';
      airBanner.parentNode.insertBefore(tabsContainer, airBanner.nextSibling);
    }
  }

  if (tabsContainer) {
    let tabsHtml = '';

    // 사용자 요청: 각 호차별 내비 바로가기 버튼 ('추천 경로 내비 바로가기')
    fleetRoutes.forEach((route, idx) => {
      const activeClass = '';
      const vehShort = '추천 경로';
      const colorDot = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${route.color}; margin-right:3px; flex-shrink:0;"></span>`;
      tabsHtml += `
        <button class="fleet-tab-btn fleet-nav-direct-btn ${activeClass}" data-vehicle-id="${route.vehicle_id}" onclick="startPatrolNavigation('${route.vehicle_id}')" style="--btn-accent: ${route.color};" title="${vehShort} 분진순찰 실시간 GPS 내비게이션 바로 시작">
          ${colorDot}
          <i data-lucide="navigation" style="width:13px; height:13px; color:${route.color}; flex-shrink:0;"></i>
          <span><strong>${vehShort} 내비 바로가기</strong> (${route.total_dist_km}km)</span>
        </button>
      `;
    });

    tabsContainer.innerHTML = tabsHtml;
  }



  // 실시간 대기 배너 (구간 통합 대기 상태 동적 반영)
  const airAvgEl = document.getElementById('drm-air-avg');
  const airLabelEl = document.getElementById('drm-air-label');
  const airIconEl = document.getElementById('drm-air-icon');
  const pillFullEl = document.getElementById('drm-air-pill-full');

  if (airLabelEl) {
    airLabelEl.textContent = `${data.zone_name || (data.zone_id ? data.zone_id + '구간' : '관제')} 통합 권역 상태`;
  }
  if (airAvgEl) {
    const avgVal = air.zone_avg_pm10 || air.zone1_avg_pm10 || 0;
    const gradeColor = air.grade_color || '#10b981';
    const gradeText = air.grade_text || '보통';
    airAvgEl.innerHTML = `권역 평균: <strong style="color: ${gradeColor}; font-size: 16px;">${avgVal}</strong> ㎍/㎥ (<span style="color: ${gradeColor}; font-weight: 800;">${gradeText}</span>)`;
    if (pillFullEl) pillFullEl.style.borderLeftColor = gradeColor;
    if (airIconEl) airIconEl.style.color = gradeColor;
  }

  // A/B/C/AI 공통 평가망 PM10 대리지표 시뮬레이션 결과
  const method = data.methodology || {};
  const effect = data.effect_comparison || null;
  const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  if (effect && effect.routes && effect.routes.AI) {
    const A = effect.routes.A, B = effect.routes.B, C = effect.routes.C, AI = effect.routes.AI;
    const fmt = (v, n=1) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '-' : Number(v).toFixed(n);
    const improve = effect.ai_improvement_pct;

    // 1) 기존 A/B/C 평균 운행거리 + AI 실제 운행거리
    write('drm-kpi-eff', fmt(effect.abc_mean_distance_km, 1));
    write('drm-kpi-eff-gain', `AI ${fmt(AI.route_length_km, 1)}km`);
    write('drm-sub-eff', `A ${fmt(A.route_length_km,1)}km · B ${fmt(B.route_length_km,1)}km · C ${fmt(C.route_length_km,1)}km 평균`);

    // 2) 행정동별 청소 커버리지에 43.3%를 비례 적용한 AI PM10 대리지표 저감률
    write('drm-kpi-dust', `-${fmt(AI.reduction_pct, 1)}`);
    write('drm-kpi-dust-gain', '43.3% 기준 시나리오');
    write('drm-sub-dust', `A -${fmt(A.reduction_pct,1)}% · B -${fmt(B.reduction_pct,1)}% · C -${fmt(C.reduction_pct,1)}% · AI 평균 커버율 ${fmt(AI.mean_coverage_pct,1)}%`);

    // 3) AI 저감률 vs A/B/C 평균 상대 성능
    write('drm-kpi-dist', improve === null || improve === undefined ? '-' : `${Number(improve) >= 0 ? '+' : ''}${fmt(improve, 1)}`);
    write('drm-kpi-dist-save', `${Number(effect.ai_difference_percentage_points) >= 0 ? '+' : ''}${fmt(effect.ai_difference_percentage_points,1)}%p`);
    write('drm-sub-dist', `AI -${fmt(AI.reduction_pct,1)}% vs 기존 평균 -${fmt(effect.abc_mean_reduction_pct,1)}% · 영향 행정동 기준 비교`);

    // 4) 운행 전/후 PM10 대리지표
    write('drm-kpi-time', fmt(AI.after_pm10_proxy, 1));
    write('drm-kpi-time-save', `전 ${fmt(AI.before_pm10_proxy,1)}`);
    write('drm-sub-time', `영향 행정동 ${fmt(AI.affected_dong_count,0)}개 · 평균 청소 커버율 ${fmt(AI.mean_coverage_pct,1)}% · 기준효율 43.3% · 실제 대기농도 예측 아님`);
  } else {
    write('drm-kpi-eff', Number(method.target_distance_km || dyn.total_dist_km || 0).toFixed(1));
    write('drm-kpi-eff-gain', `AI ${Number(dyn.total_dist_km || 0).toFixed(1)}km`);
    write('drm-sub-eff', '기존 A·B·C 평균 거리');
    write('drm-kpi-dust', '-');
    write('drm-kpi-dust-gain', '계산 불가');
    write('drm-sub-dust', data.effect_error || 'PM10 효과 비교 자료를 구성하지 못했습니다.');
    write('drm-kpi-dist', '-');
    write('drm-kpi-dist-save', '-');
    write('drm-sub-dist', 'A/B/C/AI 효과 비교 계산 필요');
    write('drm-kpi-time', '-');
    write('drm-kpi-time-save', '-');
    write('drm-sub-time', '실제 PM10 예측값을 임의 생성하지 않습니다.');
  }

  // 작업 지시서 테이블 렌더링
  const tbody = document.getElementById('drm-stops-tbody');
  if (tbody && dyn.stops) {
    tbody.innerHTML = dyn.stops.map((s, idx) => {
      let seqBadge = '';
      const vColor = s.badge_color || '#38bdf8';
      const labelText = s.seq_label || s.seq;

      if (s.is_start) {
        seqBadge = `<span class="stop-seq-badge" style="background: ${vColor};">🚀 ${labelText}</span>`;
      } else if (s.is_end) {
        seqBadge = `<span class="stop-seq-badge" style="background: #10b981;">🏁 ${labelText}</span>`;
      } else {
        seqBadge = `<span class="stop-seq-badge" style="background: ${vColor};">${labelText}</span>`;
      }

      const vehBadge = `<span style="display:inline-block; font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:${vColor}20; color:${vColor}; border:1px solid ${vColor}50;">${s.vehicle_name ? s.vehicle_name.replace('대구분진 ', '') : `${s.vehicle_num || 1}호차`}</span>`;
      const pm10Display = `<strong style="color: #f87171;">${s.local_pm10}</strong> <small>㎍/㎥</small>`;

      return `
        <tr onclick="focusStopOnMap(${s.lat}, ${s.lng}, ${idx})" id="drm-row-${idx}" data-vehicle-id="${s.vehicle_id}">
          <td style="text-align: center;">${seqBadge}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
              ${vehBadge}
              <span style="font-weight: 700; color: #f8fafc;">${s.name}</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8;">${s.road_name || ''}</div>
          </td>
          <td><span style="color: #cbd5e1;">${s.dong || '-'}</span></td>
          <td>${pm10Display}</td>
        </tr>
      `;
    }).join('');
  }

  if (window.lucide) lucide.createIcons();
}

function roundNum(val, dec = 1) {
  return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
}

/**
 * 테이블 행 클릭 시 해당 거점으로 지도 이동 및 팝업 오픈
 */
function focusStopOnMap(lat, lng, idx) {
  if (!leafletMapInstance) return;

  // 테이블 행 하이라이트
  document.querySelectorAll('.drm-stops-table tr').forEach(r => r.classList.remove('active'));
  const targetRow = document.getElementById(`drm-row-${idx}`);
  if (targetRow) targetRow.classList.add('active');

  leafletMapInstance.setView([lat, lng], 15, { animate: true, duration: 0.6 });

  // 해당 거점 팝업 오픈
  if (window.currentDynamicRouteData && window.currentDynamicRouteData.dynamic_route.stops) {
    const stop = window.currentDynamicRouteData.dynamic_route.stops[idx];
    if (stop) {
      if (stop.leafletMarker) {
        setTimeout(() => {
          stop.leafletMarker.openPopup();
        }, 400);
      } else {
        const vehColor = stop.badge_color || stop.vehicle_color || '#38bdf8';
        const stopPopupHtml = `
          <div style="min-width: 250px; font-family: inherit;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="background: ${vehColor}; color: #ffffff; font-size: 0.75rem; font-weight: 800; padding: 2px 7px; border-radius: 4px;">
                ${stop.vehicle_name || '분진차'} · ${stop.seq_label || stop.seq}번
              </span>
              <span style="font-size: 0.78rem; font-weight: 700; color: #f43f5e;">PM10: ${stop.local_pm10}㎍/㎥</span>
            </div>
            <div style="font-size: 0.95rem; font-weight: 800; color: #f8fafc; margin-bottom: 2px;">
              ${stop.name}
            </div>
            <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 8px;">
              도로: <strong style="color: #e2e8f0;">${stop.road_name || '-'}</strong> (${stop.dong || ''})
            </div>
            <div style="background: rgba(255,255,255,0.06); padding: 7px 9px; border-radius: 6px; font-size: 0.78rem; color: #cbd5e1; line-height: 1.35; margin-bottom: 6px;">
              ⚙️ <strong>작업 모드:</strong> ${stop.action_mode || '정상 순회'}
            </div>
            ${stop.desc ? `<div style="font-size: 0.72rem; color: #94a3b8;">${stop.desc}</div>` : ''}
          </div>
        `;
        setTimeout(() => {
          L.popup()
            .setLatLng([lat, lng])
            .setContent(stopPopupHtml)
            .openOn(leafletMapInstance);
        }, 400);
      }
    }
  }
}

/**
 * 모달 열기/닫기
 */
function openDynamicRoutePanel() {
  const modal = document.getElementById('dynamic-route-modal');
  if (modal) {
    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }
}

function closeDynamicRoutePanel() {
  stopSweeperSimulation(); // 모달 닫을 때 백그라운드 100ms 주행 시뮬레이션 타이머 즉시 정지
  const modal = document.getElementById('dynamic-route-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 브라우저 탭 비활성화(유튜브 등 타 탭 이용) 시 백그라운드 연산 즉시 중단
document.addEventListener('visibilitychange', () => {
  if (document.hidden && dynamicSimulationTimer) {
    stopSweeperSimulation();
  }
});

/**
 * 분진차량 주행 시뮬레이션 토글
 */
function toggleSweeperSimulation() {
  if (dynamicSimulationTimer) {
    stopSweeperSimulation();
  } else {
    startSweeperSimulation();
  }
}

function startSweeperSimulation() {
  if (!window.currentDynamicRouteData || !window.currentDynamicRouteData.dynamic_route) return;
  const pts = window.currentDynamicRouteData.dynamic_route.points || [];
  if (pts.length === 0) return;

  const playBtn = document.getElementById('btn-sim-play');
  const playIcon = document.getElementById('sim-play-icon');
  const playText = document.getElementById('sim-play-text');

  if (playText) playText.textContent = '일시 정지';
  if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
  if (window.lucide) lucide.createIcons();

  if (!dynamicSimulationMarker) {
    const sweeperIcon = L.divIcon({
      className: 'sweeper-sim-marker',
      html: `
        <div class="sweeper-icon-wrap">
          <span style="font-size: 16px;">🚛</span>
          <span class="sweeper-tag">대구분진 1호차</span>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    dynamicSimulationMarker = L.marker(pts[0], { icon: sweeperIcon, zIndexOffset: 2000 }).addTo(leafletMapInstance);
  }

  dynamicSimulationTimer = setInterval(() => {
    if (dynamicSimulationIndex >= pts.length) {
      stopSweeperSimulation();
      dynamicSimulationIndex = 0;
      alert('추천 경로 가상 주행 완료. 실제 청소 및 분진 수거량을 의미하지 않습니다.');
      return;
    }

    const curPt = pts[dynamicSimulationIndex];
    dynamicSimulationMarker.setLatLng(curPt);

    dynamicSimulationIndex += 1;
  }, 100);
}

function stopSweeperSimulation() {
  if (dynamicSimulationTimer) {
    clearInterval(dynamicSimulationTimer);
    dynamicSimulationTimer = null;
  }

  const playText = document.getElementById('sim-play-text');
  const playIcon = document.getElementById('sim-play-icon');
  if (playText) playText.textContent = '차량 주행 시뮬레이션';
  if (playIcon) playIcon.setAttribute('data-lucide', 'play');
  if (window.lucide) lucide.createIcons();
}

/**
 * 분진차량 관제망 작업지시 전송 시뮬레이션
 */
function dispatchSweeperOrder() {
  alert('🚀 [관제 전송 완료] 대구분진 1호차(정성서 기사) 차재 단말기로 실시간 최적화 노선 지시서가 전송되었습니다.');
}

// 전역 바인딩 및 조기 대기 큐 처리
window._realOpenDynamicRoutePanel = openDynamicRoutePanel;
window._realCloseDynamicRoutePanel = closeDynamicRoutePanel;
window._realGenerateDynamicRoute = generateAndDisplayDynamicRoute;
window.generateAndDisplayDynamicRoute = generateAndDisplayDynamicRoute;
window.openDynamicRoutePanel = openDynamicRoutePanel;
window.closeDynamicRoutePanel = closeDynamicRoutePanel;
window.switchRouteViewMode = switchRouteViewMode;
window.focusStopOnMap = focusStopOnMap;
window.toggleSweeperSimulation = toggleSweeperSimulation;
window.stopSweeperSimulation = stopSweeperSimulation;
window.setFleetFilter = setFleetFilter;
window.startPatrolNavigation = startPatrolNavigation;

window._realToggleDummyRouteView = toggleDummyRouteView;
window.toggleDummyRouteView = toggleDummyRouteView;
window.ensureDynamicRouteLoadedAndVisible = ensureDynamicRouteLoadedAndVisible;

// ==========================================================================
// 10. 실시간 분진순찰 전담 내비게이션 엔진 (HTML5 GPS + 60fps 거리보간 가상주행)
// ==========================================================================

let patrolNavActive = false;
let patrolNavWatchId = null;
let patrolNavSimTimer = null;
let patrolNavAnimFrameId = null;
let patrolNavIsSimMode = false;
let patrolNavCurrentIndex = 0;
let patrolNavPoints = [];
let patrolNavStops = [];
let patrolNavCumDist = [];
let patrolNavTotalDist = 0;
let patrolNavCurrentDist = 0;
let patrolNavSpeedMultiplier = 64; // 64배속 초고속 주행 고정
const PATROL_NAV_BASE_SPEED_KMH = 22; // 기본 분진흡입 작업 속도 (22 km/h)

let patrolVehicleMarker = null;
let patrolCleanedPolyline = null;
let patrolLastKnownHeading = 0;
let currentMapRotation = 0;

/**
 * 가상 주행 64배속 고정 안내
 */
function cycleNavSpeedMultiplier() {
  patrolNavSpeedMultiplier = 64;
  const txtEl = document.getElementById('pnh-speed-mult-text');
  if (txtEl) {
    txtEl.textContent = `64x 초고속`;
  }
}

/**
 * 전체 경로의 누적 거리(m) 배열 사전 빌드
 */
function buildNavCumDistances() {
  patrolNavCumDist = [0];
  patrolNavTotalDist = 0;
  if (!patrolNavPoints || patrolNavPoints.length === 0) return;

  for (let i = 0; i < patrolNavPoints.length - 1; i++) {
    const d = getDistanceMeters(patrolNavPoints[i], patrolNavPoints[i + 1]);
    patrolNavTotalDist += d;
    patrolNavCumDist.push(patrolNavTotalDist);
  }
}

/**
 * 누적 주행 거리(m)를 기반으로 정확한 선형 보간 위경도/방위각/인덱스 산출
 */
function getNavStateAtDistance(targetDist) {
  if (!patrolNavPoints || patrolNavPoints.length === 0) {
    return { lat: 0, lng: 0, heading: 0, index: 0, ratio: 0 };
  }
  if (targetDist <= 0 || patrolNavPoints.length === 1) {
    const h = patrolNavPoints.length > 1 ? calculateBearing(patrolNavPoints[0], patrolNavPoints[1]) : 0;
    return { lat: patrolNavPoints[0][0], lng: patrolNavPoints[0][1], heading: h, index: 0, ratio: 0 };
  }
  if (targetDist >= patrolNavTotalDist) {
    const lastIdx = patrolNavPoints.length - 1;
    const prevIdx = Math.max(0, lastIdx - 1);
    const h = calculateBearing(patrolNavPoints[prevIdx], patrolNavPoints[lastIdx]);
    return { lat: patrolNavPoints[lastIdx][0], lng: patrolNavPoints[lastIdx][1], heading: h, index: lastIdx, ratio: 1.0 };
  }

  // 이진 탐색으로 현재 타겟 거리가 속한 선분 구간 탐색
  let low = 0;
  let high = patrolNavCumDist.length - 1;
  let segIdx = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (patrolNavCumDist[mid] <= targetDist) {
      segIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  segIdx = Math.min(segIdx, patrolNavPoints.length - 2);
  const d0 = patrolNavCumDist[segIdx];
  const d1 = patrolNavCumDist[segIdx + 1];
  const segLen = d1 - d0;
  const t = segLen > 0 ? (targetDist - d0) / segLen : 0;

  const p0 = patrolNavPoints[segIdx];
  const p1 = patrolNavPoints[segIdx + 1];
  const lat = p0[0] + (p1[0] - p0[0]) * t;
  const lng = p0[1] + (p1[1] - p0[1]) * t;
  const heading = calculateBearing(p0, p1);

  return {
    lat,
    lng,
    heading,
    index: segIdx,
    ratio: patrolNavTotalDist > 0 ? targetDist / patrolNavTotalDist : 0
  };
}

/**
 * 내비게이션 헤딩-업(Heading-Up) 회전 제어
 * - 차량의 진행 방향(heading)이 항상 화면 위쪽(북쪽, 12시 방향)을 향하도록 지도를 -heading 만큼 회전
 * - 360° 경계 회전 시 최단 각도 보간 (-180° ~ +180°)
 */
function updateMapHeadingRotation(heading) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (!patrolNavActive) {
    mapEl.style.transform = '';
    currentMapRotation = 0;
    return;
  }

  if (typeof heading !== 'number' || isNaN(heading)) {
    return;
  }

  patrolLastKnownHeading = heading;
  let targetRot = -heading;

  // 최단 각도 보간
  let diff = (targetRot - currentMapRotation) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;

  currentMapRotation += diff;
  mapEl.style.transform = `rotate(${currentMapRotation}deg)`;
}

/**
 * 60fps 부드러운 감쇠 선회 회전 (코너링 시 멀미 방지 부드러운 감쇠)
 */
function updateMapHeadingRotationSmooth(heading) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (!patrolNavActive) {
    mapEl.style.transform = '';
    currentMapRotation = 0;
    return;
  }

  if (typeof heading !== 'number' || isNaN(heading)) {
    return;
  }

  patrolLastKnownHeading = heading;
  let targetRot = -heading;

  let diff = (targetRot - currentMapRotation) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;

  currentMapRotation += diff * 0.30;
  mapEl.style.transform = `rotate(${currentMapRotation.toFixed(2)}deg)`;
}

/**
 * 실시간 분진순찰 전담 내비게이션 시작
 */
async function startPatrolNavigation(vehicleId = null) {
  // 1. 모달 및 보조 패널 닫아 순수 내비 화면 확보
  if (typeof closeDynamicRoutePanel === 'function') {
    closeDynamicRoutePanel();
  }
  if (typeof closeAirModal === 'function') {
    closeAirModal();
  }

  // 내비 모드 활성화 시 메인 UI 전체 숨김 (내비 HUD만 표출)
  document.body.classList.add('nav-active');

  // 기존 열려있는 모든 툴팁/팝업 즉시 닫기
  if (leafletMapInstance) {
    leafletMapInstance.closePopup();
    leafletMapInstance.eachLayer(l => {
      if (typeof l.closeTooltip === 'function') l.closeTooltip();
    });
  }

  // 노선 데이터 확인 (없으면 현재 또는 1구간 자동 생성)
  if (!window.currentDynamicRouteData || !window.currentDynamicRouteData.dynamic_route) {
    const targetZone = (typeof selectedZoneId !== 'undefined' && selectedZoneId) ? selectedZoneId : 1;
    await generateAndDisplayDynamicRoute(targetZone, currentAirDate, currentAirHour);
  }

  if (!window.currentDynamicRouteData || !window.currentDynamicRouteData.dynamic_route) {
    alert('⚠️ 먼저 순찰할 운행구간의 최적 노선을 생성해주세요.');
    document.body.classList.remove('nav-active');
    return;
  }

  if (vehicleId) {
    dynamicFleetActiveFilter = vehicleId;
  }

  let selectedRoute = window.currentDynamicRouteData.dynamic_route;
  if (typeof dynamicFleetActiveFilter !== 'undefined' && dynamicFleetActiveFilter !== 'all' && window.currentDynamicRouteData.fleet_routes) {
    const matched = window.currentDynamicRouteData.fleet_routes.find(r => r.vehicle_id === dynamicFleetActiveFilter);
    if (matched && matched.points && matched.points.length > 0) {
      selectedRoute = matched;
    }
  }

  patrolNavPoints = selectedRoute.points || [];
  patrolNavStops = selectedRoute.stops || [];

  if (patrolNavPoints.length === 0) {
    alert('⚠️ 주행할 노선 지오메트리 좌표가 비어있습니다.');
    document.body.classList.remove('nav-active');
    return;
  }

  buildNavCumDistances();

  patrolNavActive = true;
  patrolNavActiveVehicleId = (selectedRoute && selectedRoute.vehicle_id) || vehicleId || (dynamicFleetActiveFilter !== 'all' ? dynamicFleetActiveFilter : null);
  patrolNavCurrentIndex = 0;
  patrolNavCurrentDist = 0;
  window._hasWarnedGpsDistance = false;
  window._navDoNotPanToGps = false;
  window._lastNavGpsCoord = null;

  // 지도 선 및 마커 투명도 제어 (내비 중인 노선만 불투명, 타 노선 투명화)
  updateFleetRouteOpacity();

  // 2. HUD 컨테이너 표출
  const hudEl = document.getElementById('patrol-nav-hud');
  if (hudEl) {
    hudEl.style.display = 'flex';
  }

  const speedMultEl = document.getElementById('pnh-speed-mult-text');
  if (speedMultEl) {
    speedMultEl.textContent = `64x 초고속`;
  }

  // 상단 권역 태그 갱신
  const zoneTag = document.getElementById('pnh-zone-tag');
  if (zoneTag) {
    const zName = window.currentDynamicRouteData.zone_info ? window.currentDynamicRouteData.zone_info.name : '대구 분진순찰';
    const vehName = (selectedRoute.vehicle_name && selectedRoute.vehicle_name !== '전체 함대') ? ` · ${selectedRoute.vehicle_name}` : '';
    zoneTag.textContent = `${zName}${vehName} 실시간 순찰`;
  }

  // 3. 지도 레이어 구성: 정화 완료 궤적 레이어 (초록색 덧칠)
  if (!patrolCleanedPolyline) {
    patrolCleanedPolyline = L.polyline([], {
      color: '#10b981',
      weight: 6.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(leafletMapInstance);
  } else {
    patrolCleanedPolyline.setLatLngs([]);
    if (!leafletMapInstance.hasLayer(patrolCleanedPolyline)) {
      patrolCleanedPolyline.addTo(leafletMapInstance);
    }
  }

  // 4. 차량 내비 마커 생성 (진행 방향 표시 전문 GPS 화살표)
  const startPt = patrolNavPoints[0];
  if (!patrolVehicleMarker) {
    const markerIcon = L.divIcon({
      className: 'nav-vehicle-marker',
      html: `
        <div class="nav-vehicle-pulse"></div>
        <div class="nav-vehicle-core" id="nav-vehicle-core">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#10b981" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });
    patrolVehicleMarker = L.marker(startPt, { icon: markerIcon, zIndexOffset: 3000 }).addTo(leafletMapInstance);
  } else {
    patrolVehicleMarker.setLatLng(startPt);
    if (!leafletMapInstance.hasLayer(patrolVehicleMarker)) {
      patrolVehicleMarker.addTo(leafletMapInstance);
    }
  }

  // 지도 시점 출발지로 상세 도로 줌/팬 (레벨 17)
  leafletMapInstance.setView(startPt, 17, { animate: false });

  // UI 숨김 후 뷰포트 크기 재정렬
  setTimeout(() => {
    if (leafletMapInstance) leafletMapInstance.invalidateSize();
  }, 120);

  // 초기 진행 방향으로 지도 헤딩-업 사전 회전
  if (patrolNavPoints.length > 1) {
    const initHeading = calculateBearing(patrolNavPoints[0], patrolNavPoints[1]);
    updateMapHeadingRotation(initHeading);
  }

  // 5. GPS 수신 시도
  initNavGeolocation();

  if (window.lucide) lucide.createIcons();
}

/**
 * 브라우저 Geolocation API 실시간 GPS 연결
 */
function initNavGeolocation() {
  const modePill = document.getElementById('pnh-mode-pill');
  const simText = document.getElementById('pnh-sim-text');

  if ('geolocation' in navigator) {
    if (modePill) modePill.textContent = '🛰️ GPS 위성 연결 중...';

    // GPS 위치 감시 등록
    patrolNavWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!patrolNavActive) return;
        patrolNavIsSimMode = false;
        if (modePill) modePill.textContent = '🛰️ 실시간 GPS 연동됨';
        if (simText) simText.textContent = '가상 주행';

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = pos.coords.speed;
        let heading = pos.coords.heading;

        // 모바일/PC 브라우저에서 heading이 없는 경우 이전 GPS 좌표와의 방위각으로 실시간 산출
        if ((heading === null || isNaN(heading) || heading === undefined) && window._lastNavGpsCoord) {
          const dLat = lat - window._lastNavGpsCoord[0];
          const dLng = lng - window._lastNavGpsCoord[1];
          if (Math.hypot(dLat, dLng) > 0.00003) {
            heading = calculateBearing(window._lastNavGpsCoord, [lat, lng]);
          } else {
            heading = patrolLastKnownHeading || 0;
          }
        }
        window._lastNavGpsCoord = [lat, lng];

        const speedKmh = (speed && speed > 0) ? Math.round(speed * 3.6) : 18;
        const closestIdx = findClosestRoutePointIndex([lat, lng]);

        // 경로에 너무 멀면(3km 이상 떨어진 곳에서 접속 시) 시뮬레이션 권장 알림
        const distToStart = getDistanceMeters([lat, lng], patrolNavPoints[0]);
        if (distToStart > 3000) {
          if (!window._hasWarnedGpsDistance) {
            window._hasWarnedGpsDistance = true;
            if (confirm('현재 계신 위치가 대구 순찰 권역과 거리가 있습니다. 실제 도로 주행 모습을 확인하시려면 [가상 주행 모드]로 전환할까요?')) {
              startNavSimulationMode();
              return;
            } else {
              // 사용자가 취소 시: GPS 위치로 화면 이동(panTo) 원천 차단
              window._navDoNotPanToGps = true;
            }
          } else if (window._navDoNotPanToGps) {
            window._navDoNotPanToGps = true;
          }
        }

        const shouldPan = !window._navDoNotPanToGps;
        updateNavHUD(lat, lng, heading || 0, speedKmh, closestIdx, shouldPan);
      },
      (err) => {
        console.warn('GPS 수신 불가, 가상 주행 모드로 자동 시작:', err.message);
        startNavSimulationMode();
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 1000
      }
    );
  } else {
    console.warn('이 브라우저는 Geolocation을 지원하지 않습니다.');
    startNavSimulationMode();
  }
}

/**
 * 가상 주행 모드 ↔ 실제 GPS 모드 토글
 */
function toggleNavSimulationMode() {
  if (patrolNavIsSimMode) {
    // 실제 GPS 복귀 시도
    if (patrolNavAnimFrameId) {
      cancelAnimationFrame(patrolNavAnimFrameId);
      patrolNavAnimFrameId = null;
    }
    if (patrolNavSimTimer) {
      clearInterval(patrolNavSimTimer);
      patrolNavSimTimer = null;
    }
    initNavGeolocation();
  } else {
    // 가상 주행 모드로 전환
    startNavSimulationMode();
  }
}

/**
 * 60fps 거리 기반 초연속 보간 가상 주행 모드 시작
 */
function startNavSimulationMode() {
  patrolNavIsSimMode = true;

  if (patrolNavWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(patrolNavWatchId);
    patrolNavWatchId = null;
  }

  const modePill = document.getElementById('pnh-mode-pill');
  const simText = document.getElementById('pnh-sim-text');
  if (modePill) modePill.textContent = '🎮 가상 고속주행';
  if (simText) simText.textContent = 'GPS 복귀';

  if (patrolNavAnimFrameId) {
    cancelAnimationFrame(patrolNavAnimFrameId);
    patrolNavAnimFrameId = null;
  }
  if (patrolNavSimTimer) {
    clearInterval(patrolNavSimTimer);
    patrolNavSimTimer = null;
  }

  buildNavCumDistances();

  // 완주 상태에서 다시 누른 경우 처음부터 리셋
  if (patrolNavCurrentDist >= patrolNavTotalDist - 15) {
    patrolNavCurrentDist = 0;
  }

  let lastTimestamp = null;
  let lastHudUpdate = 0;
  let lastPolyUpdate = 0;

  function simLoop(timestamp) {
    if (!patrolNavActive || !patrolNavIsSimMode) {
      patrolNavAnimFrameId = null;
      return;
    }

    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.08, (timestamp - lastTimestamp) / 1000); // 초 단위 dt 클램프
    lastTimestamp = timestamp;

    // 현재 설정된 배속에 따른 실시간 주행 속도 (km/h -> m/s)
    const currentSpeedKmh = PATROL_NAV_BASE_SPEED_KMH * patrolNavSpeedMultiplier;
    const speedMps = (currentSpeedKmh * 1000) / 3600;

    patrolNavCurrentDist += speedMps * dt;

    // 완주 체크
    if (patrolNavCurrentDist >= patrolNavTotalDist) {
      patrolNavCurrentDist = patrolNavTotalDist;
      const finalState = getNavStateAtDistance(patrolNavTotalDist);

      if (patrolVehicleMarker) {
        patrolVehicleMarker.setLatLng([finalState.lat, finalState.lng]);
      }
      if (patrolCleanedPolyline && patrolNavPoints.length > 0) {
        patrolCleanedPolyline.setLatLngs(patrolNavPoints);
      }
      updateNavHUD(finalState.lat, finalState.lng, finalState.heading, 0, patrolNavPoints.length - 1, false, 1.0);

      patrolNavAnimFrameId = null;
      setTimeout(() => {
        alert('🎉 실시간 분진흡입 전담 순찰 경로 완주! 도로 정화가 완료되었습니다.');
      }, 60);
      return;
    }

    // 거리 기반 60fps 보간 좌표 및 각도 산출
    const state = getNavStateAtDistance(patrolNavCurrentDist);
    patrolNavCurrentIndex = state.index;

    // 1. 차량 마커 즉시 이동 및 부드러운 회전 (60fps)
    if (patrolVehicleMarker) {
      patrolVehicleMarker.setLatLng([state.lat, state.lng]);
      const coreEl = document.getElementById('nav-vehicle-core');
      if (coreEl && typeof state.heading === 'number') {
        coreEl.style.transform = `rotate(${Math.round(state.heading)}deg)`;
      }
    }

    // 2. 지도 카메라 추적 (setView + animate: false로 60fps 무지연 미끄러짐 트래킹)
    if (leafletMapInstance && !window._navDoNotPanToGps) {
      leafletMapInstance.setView([state.lat, state.lng], leafletMapInstance.getZoom(), { animate: false });
      updateMapHeadingRotationSmooth(state.heading);
    }

    // 3. 초록색 정화완료 선 실시간 갱신 (부하 방지 45ms 스로틀링)
    if (timestamp - lastPolyUpdate > 45) {
      lastPolyUpdate = timestamp;
      if (patrolCleanedPolyline && patrolNavPoints.length > 0) {
        const cleanedPts = patrolNavPoints.slice(0, state.index + 1);
        cleanedPts.push([state.lat, state.lng]);
        patrolCleanedPolyline.setLatLngs(cleanedPts);
      }
    }

    // 4. HUD 계기판 및 턴바이턴 안내 갱신 (60ms 스로틀링)
    if (timestamp - lastHudUpdate > 60) {
      lastHudUpdate = timestamp;
      const displaySpeed = Math.round(currentSpeedKmh + Math.sin(patrolNavCurrentDist * 0.08) * (1.5 * patrolNavSpeedMultiplier));
      updateNavHUD(state.lat, state.lng, state.heading, displaySpeed, state.index, false, state.ratio);
    }

    patrolNavAnimFrameId = requestAnimationFrame(simLoop);
  }

  patrolNavAnimFrameId = requestAnimationFrame(simLoop);
}

/**
 * 내비게이션 HUD 및 지도 레이어 실시간 업데이트
 */
function updateNavHUD(lat, lng, heading, speedKmh, curIndex, shouldPan = true, customFraction = null) {
  if (!patrolNavActive) return;
  patrolNavCurrentIndex = curIndex;

  // 1. 차량 마커 위치 및 회전 (GPS 모드 등에서 호출될 때)
  if (!patrolNavIsSimMode && patrolVehicleMarker) {
    if (window._navDoNotPanToGps) {
      const anchorPt = (patrolNavPoints && patrolNavPoints.length > 0) ? (patrolNavPoints[curIndex] || patrolNavPoints[0]) : [lat, lng];
      patrolVehicleMarker.setLatLng(anchorPt);
    } else {
      patrolVehicleMarker.setLatLng([lat, lng]);
    }
    const coreEl = document.getElementById('nav-vehicle-core');
    if (coreEl && heading) {
      coreEl.style.transform = `rotate(${Math.round(heading)}deg)`;
    }
  }

  // 2. 지도 카메라 추적 (GPS 모드 전용)
  if (!patrolNavIsSimMode && leafletMapInstance && shouldPan && !window._navDoNotPanToGps) {
    leafletMapInstance.panTo([lat, lng], { animate: true, duration: 0.35 });
    if (typeof heading === 'number' && !isNaN(heading)) {
      updateMapHeadingRotation(heading);
    }
  }

  // 3. 지나간 경로 초록색 정화완료 선 (GPS 모드 전용)
  if (!patrolNavIsSimMode && patrolCleanedPolyline && patrolNavPoints.length > 0) {
    const cleanedPts = patrolNavPoints.slice(0, curIndex + 1);
    patrolCleanedPolyline.setLatLngs(cleanedPts);
  }

  // 4. 주행 속도 HUD 반영
  const speedVal = document.getElementById('pnh-speed-val');
  if (speedVal) speedVal.textContent = speedKmh;

  // 5. 전체 정화 진척률 & 남은 거리 계산 (비율 보간 반영)
  const totalPts = patrolNavPoints.length;
  const fraction = customFraction !== null ? customFraction : (curIndex / Math.max(1, totalPts - 1));
  const pct = Math.min(100, Math.round(fraction * 100));

  const progPct = document.getElementById('pnh-prog-pct');
  const progBar = document.getElementById('pnh-prog-bar');
  if (progPct) progPct.textContent = `${pct}%`;
  if (progBar) progBar.style.width = `${pct}%`;

  const totalDistKm = (window.currentDynamicRouteData.dynamic_route && window.currentDynamicRouteData.dynamic_route.distance_km)
    ? window.currentDynamicRouteData.dynamic_route.distance_km
    : (patrolNavTotalDist > 0 ? (patrolNavTotalDist / 1000) : 15.0);
  const remKm = Math.max(0, (totalDistKm * (1 - fraction))).toFixed(1);
  const remDistEl = document.getElementById('pnh-rem-dist');
  if (remDistEl) remDistEl.textContent = `${remKm} km`;

  // 6. 다음 경유지(Stop / 도로명 / PM10) 계산
  updateNextStopGuidance(lat, lng, curIndex);
}

/**
 * 다음 경유지 및 교차로 턴바이턴 안내 (실시간 남은 거리 카운트다운, 회전 방향, 도로명, 대기질)
 */
function updateNextStopGuidance(curLat, curLng, curIndex) {
  if (!patrolNavPoints || patrolNavPoints.length === 0) return;

  const totalPoints = patrolNavPoints.length;
  const isEnd = curIndex >= totalPoints - 2;

  // 1. 앞으로 주행할 경로를 따라 가장 가까운 회전(Turn) 지점 및 남은 거리(미터) 실시간 계산
  let accDistMeters = 0;
  let turnType = 'straight'; // 'straight' | 'left' | 'right' | 'uturn'
  let turnDistance = 0;
  let turnFound = false;

  for (let i = curIndex; i < totalPoints - 1; i++) {
    const stepDist = getDistanceMeters(patrolNavPoints[i], patrolNavPoints[i + 1]);
    accDistMeters += stepDist;

    if (i + 2 < totalPoints) {
      const h1 = calculateBearing(patrolNavPoints[i], patrolNavPoints[i + 1]);
      const h2 = calculateBearing(patrolNavPoints[i + 1], patrolNavPoints[i + 2]);

      let angleDiff = (h2 - h1) % 360;
      if (angleDiff < -180) angleDiff += 360;
      if (angleDiff > 180) angleDiff -= 360;

      // 32도 이상 회전하는 교차로/커브 감지
      if (Math.abs(angleDiff) >= 32) {
        turnFound = true;
        turnDistance = Math.max(10, Math.round(accDistMeters));
        if (Math.abs(angleDiff) >= 135) {
          turnType = 'uturn';
        } else if (angleDiff > 0) {
          turnType = 'right';
        } else {
          turnType = 'left';
        }
        break;
      }
    }

    // 500m 이상 직진이면 해당 거리에서 직진 표시
    if (accDistMeters >= 500) {
      break;
    }
  }

  let displayDist = turnFound ? turnDistance : Math.max(10, Math.round(accDistMeters));

  // 2. 현재 위치 기준 Stop 정보 매칭 (도로명, 관할동, 대기질)
  let targetStop = null;
  if (patrolNavStops && patrolNavStops.length > 0) {
    const fraction = curIndex / Math.max(1, totalPoints - 1);
    const stopIdx = Math.min(patrolNavStops.length - 1, Math.floor(fraction * patrolNavStops.length));
    targetStop = patrolNavStops[stopIdx] || patrolNavStops[0];
  }

  const roadName = (targetStop && (targetStop.road_name || targetStop.name)) ? (targetStop.road_name || targetStop.name) : '분진순찰 본선';
  const dongName = (targetStop && targetStop.dong) ? targetStop.dong : '대구 권역';
  const pm10Val = (targetStop && (targetStop.local_pm10 || targetStop.pm10)) ? (targetStop.local_pm10 || targetStop.pm10) : 48;

  // 3. UI DOM 반영
  const distNumEl = document.getElementById('pnh-dist-num');
  const distUnitEl = document.getElementById('pnh-dist-unit');
  const roadNameEl = document.getElementById('pnh-road-name');
  const roadSubEl = document.getElementById('pnh-road-sub');
  const stateBadgeEl = document.getElementById('pnh-badge-state');
  const airValEl = document.getElementById('pnh-air-val');
  const airGradeEl = document.getElementById('pnh-air-grade');
  const airBadgeEl = document.getElementById('pnh-air-badge');
  const turnIcon = document.getElementById('pnh-turn-icon');

  if (isEnd) {
    if (distNumEl) distNumEl.textContent = '0';
    if (distUnitEl) distUnitEl.textContent = 'm';
    if (roadNameEl) roadNameEl.textContent = '순찰 목적지 도착 (정화 완료)';
    if (roadSubEl) roadSubEl.textContent = `${dongName} 분진흡입 전담 순찰 완주`;
    if (stateBadgeEl) {
      stateBadgeEl.textContent = '완료';
      stateBadgeEl.style.background = '#10b981';
      stateBadgeEl.style.color = '#ffffff';
    }
    if (turnIcon) {
      turnIcon.setAttribute('data-lucide', 'check-circle');
      if (window.lucide) lucide.createIcons();
    }
    return;
  }

  if (distNumEl && distUnitEl) {
    if (displayDist >= 1000) {
      distNumEl.textContent = (displayDist / 1000).toFixed(1);
      distUnitEl.textContent = 'km';
    } else {
      distNumEl.textContent = displayDist;
      distUnitEl.textContent = 'm';
    }
  }

  let turnActionText = '직진';
  let iconName = 'arrow-up';
  let badgeColor = 'rgba(56, 189, 248, 0.2)';
  let textColor = '#38bdf8';

  if (turnFound) {
    if (turnType === 'left') {
      turnActionText = displayDist <= 40 ? '잠시 후 좌회전' : `${displayDist}m 앞 좌회전`;
      iconName = 'corner-up-left';
      badgeColor = 'rgba(168, 85, 247, 0.25)';
      textColor = '#c084fc';
    } else if (turnType === 'right') {
      turnActionText = displayDist <= 40 ? '잠시 후 우회전' : `${displayDist}m 앞 우회전`;
      iconName = 'corner-up-right';
      badgeColor = 'rgba(245, 158, 11, 0.25)';
      textColor = '#fbbf24';
    } else if (turnType === 'uturn') {
      turnActionText = displayDist <= 40 ? '잠시 후 유턴' : `${displayDist}m 앞 유턴`;
      iconName = 'rotate-ccw';
      badgeColor = 'rgba(239, 68, 68, 0.25)';
      textColor = '#f87171';
    }
  } else {
    turnActionText = `${displayDist}m 앞 직진 순찰`;
    iconName = 'arrow-up';
  }

  if (roadNameEl) {
    roadNameEl.textContent = roadName;
  }
  if (roadSubEl) {
    roadSubEl.textContent = `관할: ${dongName} · 분진차량 집중 흡입 순찰 중`;
  }

  if (stateBadgeEl) {
    stateBadgeEl.textContent = '순찰 진행 중';
    stateBadgeEl.style.background = 'rgba(16, 185, 129, 0.25)';
    stateBadgeEl.style.color = '#34d399';
  }

  if (turnIcon) {
    turnIcon.setAttribute('data-lucide', iconName);
    if (window.lucide) lucide.createIcons();
  }

  // 대기질 PM10 배지 갱신
  if (airValEl) {
    let airColor = '#38bdf8';
    if (pm10Val > 150) airColor = '#ef4444';
    else if (pm10Val > 80) airColor = '#f59e0b';
    airValEl.style.color = airColor;
    airValEl.innerHTML = `${pm10Val} <small>㎍/㎥</small>`;
  }
  if (airBadgeEl) {
    if (pm10Val > 150) {
      airBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.6)';
    } else if (pm10Val > 80) {
      airBadgeEl.style.borderColor = 'rgba(245, 158, 11, 0.6)';
    } else {
      airBadgeEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    }
  }
}

/**
 * 내비게이션 종료
 */
function stopPatrolNavigation() {
  patrolNavActive = false;
  patrolNavIsSimMode = false;
  window._navDoNotPanToGps = false;
  window._hasWarnedGpsDistance = false;

  // 1. 내비 집중 모드 해제 및 메인 UI 복원
  document.body.classList.remove('nav-active');

  // 2. 지도 헤딩 회전 초기화 (정북 고정으로 복원)
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.transform = '';
  }
  currentMapRotation = 0;

  if (patrolNavWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(patrolNavWatchId);
    patrolNavWatchId = null;
  }

  if (patrolNavAnimFrameId) {
    cancelAnimationFrame(patrolNavAnimFrameId);
    patrolNavAnimFrameId = null;
  }

  if (patrolNavSimTimer) {
    clearInterval(patrolNavSimTimer);
    patrolNavSimTimer = null;
  }

  const hudEl = document.getElementById('patrol-nav-hud');
  if (hudEl) {
    hudEl.style.display = 'none';
  }

  if (patrolCleanedPolyline && leafletMapInstance && leafletMapInstance.hasLayer(patrolCleanedPolyline)) {
    leafletMapInstance.removeLayer(patrolCleanedPolyline);
  }

  if (patrolVehicleMarker && leafletMapInstance && leafletMapInstance.hasLayer(patrolVehicleMarker)) {
    leafletMapInstance.removeLayer(patrolVehicleMarker);
  }

  // 내비 종료: 모든 노선 및 마커를 100% 불투명으로 즉시 원복
  patrolNavActiveVehicleId = null;
  updateFleetRouteOpacity();

  // 지도 크기 재계산 (UI 복원 대응)
  setTimeout(() => {
    if (leafletMapInstance) leafletMapInstance.invalidateSize();
  }, 120);
}

/**
 * 유틸리티: 현재 GPS와 가장 가까운 경로점 인덱스 탐색
 */
function findClosestRoutePointIndex(targetCoord) {
  if (!patrolNavPoints || patrolNavPoints.length === 0) return 0;
  let minDist = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < patrolNavPoints.length; i++) {
    const pt = patrolNavPoints[i];
    const d = Math.hypot(pt[0] - targetCoord[0], pt[1] - targetCoord[1]);
    if (d < minDist) {
      minDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * 두 좌표 간의 거리 (미터)
 */
function getDistanceMeters(c1, c2) {
  const R = 6371e3;
  const φ1 = (c1[0] * Math.PI) / 180;
  const φ2 = (c2[0] * Math.PI) / 180;
  const Δφ = ((c2[0] - c1[0]) * Math.PI) / 180;
  const Δλ = ((c2[1] - c1[1]) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 두 좌표 간 방위각(각도) 계산
 */
function calculateBearing(p1, p2) {
  const y = Math.sin((p2[1] - p1[1]) * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180);
  const x = Math.cos(p1[0] * Math.PI / 180) * Math.sin(p2[0] * Math.PI / 180) -
            Math.sin(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * Math.cos((p2[1] - p1[1]) * Math.PI / 180);
  const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return brng;
}

window.startPatrolNavigation = startPatrolNavigation;
window.stopPatrolNavigation = stopPatrolNavigation;
window.toggleNavSimulationMode = toggleNavSimulationMode;
window.cycleNavSpeedMultiplier = cycleNavSpeedMultiplier;

if (window._pendingDynamicRouteGen) {
  const p = window._pendingDynamicRouteGen;
  window._pendingDynamicRouteGen = null;
  generateAndDisplayDynamicRoute(p.zoneId, p.dateStr, p.hourStr);
}




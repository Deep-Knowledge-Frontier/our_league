// 클럽 설정 - 이 파일만 수정하면 다른 클럽도 사용 가능

// 마스터 관리자 이메일을 환경변수에서 파싱 (.env REACT_APP_MASTER_EMAILS)
// 쉼표로 여러 개 구분 가능. 환경변수가 없으면 빈 배열.
// 이렇게 하면 소스 코드에 실제 이메일이 하드코딩되지 않습니다.
const parseMasterEmails = () => {
  const raw = process.env.REACT_APP_MASTER_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

export const APP_CONFIG = {
  clubName: '한강FC',
  appTitle: '우리들의 리그',
  logoText: '우리들의 리그',

  // 경기장 프리셋
  locationPresets: [
    { name: '수색철길 풋살장', address: '서울 은평구 수색동 262-26' },
    { name: '영락중학교', address: '서울 은평구 불광동 12' },
  ],

  // 날씨 기본 좌표 (상암)
  weatherLocation: { lat: 37.5775, lon: 126.8896 },

  // 포지션 목록
  positions: ['GK', 'DF', 'DM', 'MF', 'AM', 'FW'],

  // 실력 등급
  skillLevels: ['상', '상-중', '중', '중-하', '하', '하하'],

  // 기본 팀 수
  defaultTeamCount: 2,

  // 출석 시간 슬롯 (분)
  timeSlotMinutes: 30,
  timeWindowMinutes: 120,

  // 마스터 관리자 이메일 (전체 팀 관리 권한) - 환경변수에서 로드
  masterEmails: parseMasterEmails(),
};

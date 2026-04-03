// 클럽 설정 - 이 파일만 수정하면 다른 클럽도 사용 가능
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

  // 마스터 관리자 이메일 (전체 팀 관리 권한)
  masterEmails: ['idisyun@gmail.com'],
};

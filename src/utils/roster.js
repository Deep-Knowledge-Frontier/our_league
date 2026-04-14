/**
 * 경기일별 저장된 팀 로스터 데이터에서 특정 팀의 선수 명단을 추출한다.
 * 저장 포맷은 시기마다 달라서 3단계 fallback으로 찾는다:
 *   1) 키가 팀 이름과 정확히 일치
 *   2) 키가 team1/team2 (또는 team_1/team_2) 패턴
 *   3) 키 정렬 후 순서로 매칭 (첫번째=team1, 두번째=team2)
 *
 * @param {object} rosterData - DB에서 가져온 팀별 로스터 객체
 * @param {string} teamName - 찾을 팀 이름 (대소문자 무시, 공백 trim)
 * @param {'team1'|'team2'} teamSide - 이름으로 못 찾을 때 사용할 fallback 인덱스
 * @returns {string[]} 선수명 배열
 */
export function extractTeamRoster(rosterData, teamName, teamSide) {
  if (!rosterData) return [];
  const entries = Object.entries(rosterData);
  const tName = (teamName || '').toLowerCase().trim();

  // 1. 키가 팀 이름과 정확히 일치
  for (const [key, val] of entries) {
    if (key.toLowerCase().trim() === tName) {
      return val ? Object.values(val).filter(Boolean).map(String) : [];
    }
  }

  // 2. 키가 team1/team2 패턴
  for (const [key, val] of entries) {
    const k = key.toLowerCase().trim();
    const num = teamSide === 'team1' ? '1' : '2';
    if (k === `team${num}` || k === `team_${num}`) {
      return val ? Object.values(val).filter(Boolean).map(String) : [];
    }
  }

  // 3. 키 정렬 후 순서로 매칭 (첫번째=team1, 두번째=team2)
  const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
  const idx = teamSide === 'team1' ? 0 : 1;
  if (sorted[idx]) {
    const val = sorted[idx][1];
    return val ? Object.values(val).filter(Boolean).map(String) : [];
  }
  return [];
}

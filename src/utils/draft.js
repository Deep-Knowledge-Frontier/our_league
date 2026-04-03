// 스네이크 드래프트 알고리즘
// 능력치가 높은 선수부터 팀에 번갈아 배정 (1→2→2→1→1→2...)
export const snakeDraft = (players, teamCount = 2) => {
  if (!players || players.length === 0) return Array.from({ length: teamCount }, () => []);

  // 능력치 기준 내림차순 정렬
  const sorted = [...players].sort((a, b) => (b.abilityScore || 0) - (a.abilityScore || 0));

  const teams = Array.from({ length: teamCount }, () => []);
  let direction = 1; // 1: 정방향, -1: 역방향
  let teamIdx = 0;

  sorted.forEach((player) => {
    teams[teamIdx].push(player);

    // 스네이크 방향 전환
    if (direction === 1 && teamIdx === teamCount - 1) {
      direction = -1;
    } else if (direction === -1 && teamIdx === 0) {
      direction = 1;
    } else {
      teamIdx += direction;
    }
  });

  return teams;
};

// 고참/저참 분리 후 각각 스네이크 드래프트
export const snakeDraftWithAttendance = (players, teamCount = 2, attendanceThreshold = 50) => {
  const high = players.filter((p) => (p.attendanceRate || 0) >= attendanceThreshold);
  const low = players.filter((p) => (p.attendanceRate || 0) < attendanceThreshold);

  const highTeams = snakeDraft(high, teamCount);
  const lowTeams = snakeDraft(low, teamCount);

  return highTeams.map((team, idx) => [...team, ...(lowTeams[idx] || [])]);
};

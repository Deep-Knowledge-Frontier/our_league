// 선수 포인트 적립 공식 — MyPage와 AdminPage 백업 양쪽에서 공유
//
// 사용 시점:
//   - MyPage: 현재 잔액이 없을 때 fallback으로 즉시 계산
//   - AdminPage 백업: 신규 회원의 잔액 초기화 (PlayerBalance에 entry 없을 때)
//
// 포인트 정책 변경 시 이 파일만 수정하면 두 곳 모두 일관 적용.

export const POINTS_RULES = {
  attendance: 30,
  win: 20,
  draw: 5,
  goal: 30,
  assist: 15,
  gameMvp: 50,
  dayMvp: 100,
  voteAttend: 5,
  voteAbsent: 3,
  voteUndecided: 1,
};

/**
 * 카운트 객체로부터 포인트 breakdown 계산
 * @param {object} counts - { attendance, wins, draws, losses, goals, assists,
 *                            gameMvpCount, dayMvpCount, voteAttend, voteAbsent, voteUndecided }
 * @returns {object} breakdown (카테고리별 P 값)
 */
export function computePointsBreakdown(counts = {}) {
  return {
    attendance:    (counts.attendance    || 0) * POINTS_RULES.attendance,
    win:           (counts.wins          || 0) * POINTS_RULES.win,
    draw:          (counts.draws         || 0) * POINTS_RULES.draw,
    goal:          (counts.goals         || 0) * POINTS_RULES.goal,
    assist:        (counts.assists       || 0) * POINTS_RULES.assist,
    gameMvp:       (counts.gameMvpCount  || 0) * POINTS_RULES.gameMvp,
    dayMvp:        (counts.dayMvpCount   || 0) * POINTS_RULES.dayMvp,
    voteAttend:    (counts.voteAttend    || 0) * POINTS_RULES.voteAttend,
    voteAbsent:    (counts.voteAbsent    || 0) * POINTS_RULES.voteAbsent,
    voteUndecided: (counts.voteUndecided || 0) * POINTS_RULES.voteUndecided,
  };
}

/** breakdown 객체의 합산 */
export function totalFromBreakdown(breakdown = {}) {
  return Object.values(breakdown).reduce((s, v) => s + (Number(v) || 0), 0);
}

/** counts → 단일 합산 (편의) */
export function computeTotalPoints(counts) {
  return totalFromBreakdown(computePointsBreakdown(counts));
}

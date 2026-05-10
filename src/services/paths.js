// Firebase RTDB 경로 중앙화
// 모든 페이지는 이 모듈의 함수만 사용해서 경로를 생성한다 (오타 방지, 일괄 변경 가능)
//
// 사용 예시:
//   import { paths } from '../services/paths';
//   import { ref, get } from 'firebase/database';
//   import { db } from '../config/firebase';
//
//   const snap = await get(ref(db, paths.member(clubName, userName)));
//   const timerRef = ref(db, paths.matchTimer(clubName, date, gameNum));

export const paths = {
  // ── 사용자/권한 ──
  user: (emailKey) => `Users/${emailKey}`,
  userProfile: (emailKey) => `users/${emailKey}/profile`,
  allowedUser: (role, emailKey) => `AllowedUsers/${role}/${emailKey}`,
  masterUser: (emailKey) => `MasterUsers/${emailKey}`,

  // ── 클럽 ──
  clubs: () => 'clubs',
  club: (clubName) => `clubs/${clubName}`,
  clubRequests: () => 'ClubRequests',
  deletedClubs: () => 'DeletedClubs',
  joinRequest: (clubName, emailKey) => `JoinRequests/${clubName}/${emailKey}`,

  // ── 회원 정보 ──
  memberInfoRoot: (clubName) => `MemberInfo/${clubName}`,
  member: (clubName, name) => `MemberInfo/${clubName}/${name}`,
  registeredPlayers: (clubName) => `registeredPlayers/${clubName}`,

  // ── 매치 일정 ──
  matchDates: (clubName) => `MatchDates/${clubName}`,
  matchDate: (clubName, dateKey) => `MatchDates/${clubName}/${dateKey}`,
  locationPresets: (clubName) => `LocationPresets/${clubName}`,

  // ── 일자별 선수 선택 (PlayerSelectionByDate) ──
  // 회원 투표 영역 (member-writable)
  selection: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}`,
  attendList: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/AttandPlayer/all`,
  absentList: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/AbsentPlayer/all`,
  undecidedList: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/UndecidedPlayer/all`,
  attendTime: (clubName, date, emailKey) => `PlayerSelectionByDate/${clubName}/${date}/AttendTime/${emailKey}`,
  guestsRoot: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/Guests`,
  guestsByMember: (clubName, date, emailKey) => `PlayerSelectionByDate/${clubName}/${date}/Guests/${emailKey}`,

  // 운영자 영역 (admin-only)
  teamRoster: (clubName, date, code) => `PlayerSelectionByDate/${clubName}/${date}/AttandPlayer/${code}`, // A/B/C
  teamCaptains: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/TeamCaptains`,
  teamCaptain: (clubName, date, code) => `PlayerSelectionByDate/${clubName}/${date}/TeamCaptains/${code}`,
  teamNames: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/TeamNames`,
  teamName: (clubName, date, code) => `PlayerSelectionByDate/${clubName}/${date}/TeamNames/${code}`,
  matchOrder: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/MatchOrder`,
  formationOpen: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/FormationOpen`,
  draft: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/Draft`,
  draftStatus: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/Draft/status`,
  teamFormationRoot: (clubName, date) => `PlayerSelectionByDate/${clubName}/${date}/TeamFormation`,
  teamFormation: (clubName, date, code) => `PlayerSelectionByDate/${clubName}/${date}/TeamFormation/${code}`,
  gameSetup: (clubName, date, gameNum) => `PlayerSelectionByDate/${clubName}/${date}/game${gameNum}`,
  selectionBackup: (clubName) => `PlayerSelectionByDateBackup/${clubName}`,

  // ── 매치 타이머 (운영자 전용) ──
  matchTimer: (clubName, date, gameNum) => `MatchTimer/${clubName}/${date}/game${gameNum}`,

  // ── 클럽 데이터 (점수 기록) — 클럽명을 루트로 사용하는 레거시 영역 ──
  matchDay: (clubName, date) => `${clubName}/${date}`,
  game: (clubName, date, gameKey) => `${clubName}/${date}/${gameKey}`,        // 'gameN'
  gameByNumber: (clubName, date, gameNum) => `${clubName}/${date}/game${gameNum}`,

  // ── 백업/통계 ──
  dailyResultsBackup: (clubName) => `DailyResultsBackup/${clubName}`,
  dailyResultsByDate: (clubName, date) => `DailyResultsBackup/${clubName}/${date}`,
  playerStatsBackup: (clubName) => `PlayerStatsBackup/${clubName}`,
  playerStatsBackup6m: (clubName) => `PlayerStatsBackup_6m/${clubName}`,
  playerStatsBackupSeason: (clubName) => `PlayerStatsBackup_season/${clubName}`,
  playerStatsByName: (clubName, name) => `PlayerStatsBackup/${clubName}/${name}`,
  playerDetailStats: (clubName) => `PlayerDetailStats/${clubName}`,
  playerWeeklyStandings: (clubName) => `PlayerWeeklyStandings/${clubName}`,
  playerNetworkGraph: (clubName) => `PlayerNetworkGraph/${clubName}`,
  playerStateBackup: (clubName) => `PlayerStateBackup/${clubName}`,
  clubBackup: (clubName) => `${clubName}_backup`,

  // ── 리그/우승 ──
  leagueMaker: (clubName) => `LeagueMaker/${clubName}`,
  teamOfWinner: (clubName) => `TeamOfWinner/${clubName}`,
  teamOfWinnerBy: (clubName, leagueId, code) => `TeamOfWinner/${clubName}/League${leagueId}/${code}`,

  // ── 시스템 ──
  banners: () => 'banners',
  system: () => 'system',
};

/**
 * 디버그용: 모든 사용 가능한 path 함수를 콘솔에 출력
 * 개발 시 path 이름을 까먹었을 때 활용
 */
export function debugListPaths() {
  if (process.env.NODE_ENV !== 'development') return;
  // eslint-disable-next-line no-console
  console.table(Object.keys(paths).map((k) => ({ name: k, fn: paths[k].toString().slice(0, 80) })));
}

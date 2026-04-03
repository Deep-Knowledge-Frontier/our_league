/**
 * MVP 재계산 스크립트 (Android DailyResultsBackupHelper 로직 동일)
 *
 * 경기별 MVP: 이긴 팀 선수 중 포인트(골1+어시1) 최고 → 골 수 → 능력치 순
 * 일별 MVP: 일별 우승팀(승점→골득실→득점) 선수 중 포인트 3+ 최고, 없으면 능력치 최고
 *
 * 사용법: node scripts/recalc-mvp.js
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set, update } = require('firebase/database');

const firebaseConfig = {
  apiKey: 'AIzaSyCi6aaK8YoY7lFJZZQOTmgJB7PrFgMU9-s',
  authDomain: 'football-92492.firebaseapp.com',
  databaseURL: 'https://football-92492-default-rtdb.firebaseio.com',
  projectId: 'football-92492',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CLUB = '한강FC';
const NO_MVP = '없음';

// ── 골 기록 파싱 ──
// "HH:MM | 득점자" 또는 "HH:MM | 득점자 - 어시스터"
function parseGoalRecord(record) {
  if (!record || typeof record !== 'string') return null;
  let scorer = null, assister = null;

  if (record.includes('|')) {
    const parts = record.split('|');
    if (parts.length >= 2) {
      const content = parts[1].trim();
      if (content.includes('-')) {
        const inner = content.split('-');
        scorer = inner[0].trim();
        if (inner.length > 1) assister = inner[1].trim();
      } else {
        scorer = content;
      }
    }
  } else {
    scorer = record.trim();
  }

  return { scorer, assister };
}

// ── 골 리스트에서 포인트/골 수 집계 ──
function processPoints(goalList) {
  const points = {};
  const goals = {};

  const list = Array.isArray(goalList) ? goalList : [];
  list.forEach(record => {
    const parsed = parseGoalRecord(record);
    if (!parsed) return;

    const { scorer, assister } = parsed;

    if (scorer && scorer.length > 0) {
      points[scorer] = (points[scorer] || 0) + 1;
      goals[scorer] = (goals[scorer] || 0) + 1;
    }

    if (assister && assister.length > 0 && assister !== NO_MVP) {
      points[assister] = (points[assister] || 0) + 1;
    }
  });

  return { points, goals };
}

// ── 팀 선수 목록 추출 ──
function getPlayersList(teamData) {
  if (!teamData) return [];
  if (Array.isArray(teamData)) return teamData.filter(Boolean).map(s => String(s).trim());
  if (typeof teamData === 'object') {
    return Object.values(teamData).filter(Boolean).map(s => String(s).trim());
  }
  return [];
}

// ── 경기별 MVP (Android calculateMatchMvp 동일) ──
// 이긴 팀 선수만 후보, 무승부면 양팀 모두
// 포인트(골+어시 각 1점) → 골 수 → 능력치 순
function calculateMatchMvp(team1Players, team2Players, score1, score2, matchPoints, matchGoals, abilityMap) {
  let candidates = [];

  if (score1 > score2) {
    candidates = [...team1Players];
  } else if (score2 > score1) {
    candidates = [...team2Players];
  } else {
    candidates = [...team1Players, ...team2Players];
  }

  if (candidates.length === 0) return NO_MVP;

  let best = candidates[0];
  let maxPts = -1;
  let maxGoals = -1;
  let maxAbility = -1.0;

  for (const p of candidates) {
    const pt = matchPoints[p] || 0;
    const g = matchGoals[p] || 0;
    const ab = abilityMap[p] || 0;

    if (pt > maxPts) {
      best = p; maxPts = pt; maxGoals = g; maxAbility = ab;
    } else if (pt === maxPts) {
      if (g > maxGoals) {
        best = p; maxPts = pt; maxGoals = g; maxAbility = ab;
      } else if (g === maxGoals) {
        if (ab > maxAbility) {
          best = p; maxAbility = ab;
        }
      }
    }
  }

  return best;
}

// ── 일별 우승팀 결정 (Android calculateDailyWinningTeam 동일) ──
// 승점(승3/무1/패0) → 골득실 → 득점 순
function calculateDailyWinningTeam(matches) {
  if (!matches || matches.length === 0) return null;

  const pts = {}, gd = {}, gs = {};

  matches.forEach(m => {
    const t1 = m.team1, t2 = m.team2;
    const s1 = m.score1, s2 = m.score2;

    gs[t1] = (gs[t1] || 0) + s1;
    gs[t2] = (gs[t2] || 0) + s2;

    gd[t1] = (gd[t1] || 0) + (s1 - s2);
    gd[t2] = (gd[t2] || 0) + (s2 - s1);

    const p1 = s1 > s2 ? 3 : s1 === s2 ? 1 : 0;
    const p2 = s2 > s1 ? 3 : s1 === s2 ? 1 : 0;

    pts[t1] = (pts[t1] || 0) + p1;
    pts[t2] = (pts[t2] || 0) + p2;
  });

  const teams = Object.keys(pts).sort((a, b) => {
    let c = (pts[b] || 0) - (pts[a] || 0);
    if (c !== 0) return c;
    c = (gd[b] || 0) - (gd[a] || 0);
    if (c !== 0) return c;
    return (gs[b] || 0) - (gs[a] || 0);
  });

  return teams.length > 0 ? teams[0] : null;
}

// ── 일별 MVP (Android calculateDateMvp 동일) ──
// 우승팀 선수 중 포인트 3+ 최고, 없으면 능력치 최고
function calculateDateMvp(winner, matches, dailyAggPoints, abilityMap) {
  if (!winner) return NO_MVP;

  const candidates = new Set();
  matches.forEach(m => {
    if (winner === m.team1 && m.team1Players) m.team1Players.forEach(p => candidates.add(p));
    if (winner === m.team2 && m.team2Players) m.team2Players.forEach(p => candidates.add(p));
  });

  if (candidates.size === 0) return NO_MVP;

  // 1차: 포인트 3 이상인 선수 중 최고
  let best = null;
  let maxPt = -1;

  for (const p of candidates) {
    const pt = dailyAggPoints[p] || 0;
    if (pt >= 3 && pt > maxPt) {
      maxPt = pt;
      best = p;
    }
  }

  if (best) return best;

  // 2차: 능력치 최고
  let maxAbility = -1.0;
  for (const p of candidates) {
    const ab = abilityMap[p] || 0;
    if (ab > maxAbility) {
      maxAbility = ab;
      best = p;
    }
  }

  return best || NO_MVP;
}

async function main() {
  console.log('========================================');
  console.log('  MVP 재계산 (Android 로직 동일)');
  console.log(`  DB: football-92492 / ${CLUB}`);
  console.log('========================================\n');

  // 1. 능력치 로드
  console.log('[1/4] 선수 능력치 로드...');
  const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${CLUB}`));
  const abilityMap = {};
  if (statsSnap.exists()) {
    Object.entries(statsSnap.val()).forEach(([name, data]) => {
      abilityMap[name] = data.abilityScore || 0;
    });
  }
  console.log(`  ${Object.keys(abilityMap).length}명 능력치 로드\n`);

  // 2. 팀 편성 데이터 로드
  console.log('[2/4] 팀 편성 데이터 로드...');
  const selectionSnap = await get(ref(db, `PlayerSelectionByDate/${CLUB}`));
  const selectionData = selectionSnap.exists() ? selectionSnap.val() : {};
  console.log(`  ${Object.keys(selectionData).length}일 팀 편성 데이터\n`);

  // 3. 전체 경기 데이터 읽기
  console.log('[3/4] 전체 경기 데이터 읽기...');
  const snapshot = await get(ref(db, CLUB));
  if (!snapshot.exists()) {
    console.log('경기 데이터가 없습니다.');
    process.exit(0);
  }

  const allDates = snapshot.val();
  const dateKeys = Object.keys(allDates).sort();
  console.log(`  총 ${dateKeys.length}개 경기일\n`);

  // 4. 각 날짜별 처리
  console.log('[4/4] MVP 계산 및 저장...');
  const gameUpdates = {};
  const dailyResults = {};
  let totalGames = 0;
  let mvpSet = 0;

  for (const dateKey of dateKeys) {
    const dateData = allDates[dateKey];
    const gameKeys = Object.keys(dateData).filter(k => k.startsWith('game')).sort();
    if (gameKeys.length === 0) continue;

    const matchResults = [];
    const dailyAggPoints = {};

    for (const gameKey of gameKeys) {
      const gameData = dateData[gameKey];
      totalGames++;

      const t1Name = gameData.team1_name || 'A';
      const t2Name = gameData.team2_name || 'B';
      const s1 = gameData.goalCount1 || 0;
      const s2 = gameData.goalCount2 || 0;

      // 팀 선수 목록 (game별 → AttandPlayer 폴백)
      const gameSelection = selectionData[dateKey]?.[gameKey];
      let team1Players, team2Players;

      if (gameSelection) {
        team1Players = getPlayersList(gameSelection[t1Name] || gameSelection[`Team ${t1Name}`]);
        team2Players = getPlayersList(gameSelection[t2Name] || gameSelection[`Team ${t2Name}`]);
      } else {
        const attData = selectionData[dateKey]?.AttandPlayer;
        team1Players = getPlayersList(attData?.[t1Name]);
        team2Players = getPlayersList(attData?.[t2Name]);
      }

      // 포인트 집계
      const r1 = processPoints(gameData.goalList1);
      const r2 = processPoints(gameData.goalList2);

      const matchPoints = {};
      const matchGoals = {};
      [r1, r2].forEach(r => {
        Object.entries(r.points).forEach(([k, v]) => { matchPoints[k] = (matchPoints[k] || 0) + v; });
        Object.entries(r.goals).forEach(([k, v]) => { matchGoals[k] = (matchGoals[k] || 0) + v; });
      });

      // 일별 합산
      Object.entries(matchPoints).forEach(([k, v]) => {
        dailyAggPoints[k] = (dailyAggPoints[k] || 0) + v;
      });

      // 경기 MVP 계산
      const mvp = calculateMatchMvp(team1Players, team2Players, s1, s2, matchPoints, matchGoals, abilityMap);

      // 저장
      gameUpdates[`${CLUB}/${dateKey}/${gameKey}/mvp`] = mvp;
      if (mvp !== NO_MVP) mvpSet++;

      const gameNum = parseInt(gameKey.replace('game', ''), 10);
      matchResults.push({
        gameNumber: `${gameNum}경기`,
        team1: t1Name,
        team2: t2Name,
        score1: s1,
        score2: s2,
        mvp,
        team1Players,
        team2Players,
      });
    }

    // 일별 우승팀 + 일별 MVP
    const dailyWinner = calculateDailyWinningTeam(matchResults);
    const dailyMvp = calculateDateMvp(dailyWinner, matchResults, dailyAggPoints, abilityMap);

    console.log(`  ${dateKey}: 우승팀=${dailyWinner || '?'}, MVP=${dailyMvp}`);

    // DailyResultsBackup용 (team1Players/team2Players 제거)
    dailyResults[dateKey] = {
      dailyMvp,
      matches: matchResults.map(({ team1Players, team2Players, ...rest }) => rest),
    };
  }

  console.log(`\n  총 ${totalGames}경기 중 ${mvpSet}경기 MVP 산정\n`);

  // Firebase 저장
  console.log('Firebase에 저장...');

  console.log(`  게임 MVP 업데이트: ${Object.keys(gameUpdates).length}건`);
  // update는 한 번에 최대량 제한이 있으므로 분할
  const entries = Object.entries(gameUpdates);
  const BATCH = 500;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = Object.fromEntries(entries.slice(i, i + BATCH));
    await update(ref(db), batch);
  }
  console.log('  ✅ 게임 MVP 저장 완료');

  console.log(`  DailyResultsBackup 업데이트: ${Object.keys(dailyResults).length}일`);
  await set(ref(db, `DailyResultsBackup/${CLUB}`), dailyResults);
  console.log('  ✅ DailyResultsBackup 저장 완료');

  console.log('\n========================================');
  console.log(`  완료! ${totalGames}경기 MVP 재계산, ${dateKeys.length}일 백업 갱신`);
  console.log('========================================');
  process.exit(0);
}

main().catch(err => {
  console.error('에러:', err);
  process.exit(1);
});

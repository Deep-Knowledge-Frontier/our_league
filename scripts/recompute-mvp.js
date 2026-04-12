#!/usr/bin/env node
/**
 * 특정 경기일의 MVP를 새 로직으로 재계산합니다.
 *
 * 로직:
 *   - 경기 MVP: 우승팀 선수 중 공격포인트 1위 (무승부는 양팀 참여 선수 중 6개월 abilityScore 최고)
 *   - 일일 MVP: 일일 우승팀 로스터 ∩ 게임 MVP 득표 최다 선수
 *
 * 사용법:
 *   node scripts/recompute-mvp.js               # dry-run (변경사항만 출력)
 *   node scripts/recompute-mvp.js --apply       # 실제 DB에 반영
 *   node scripts/recompute-mvp.js --club=한강FC --date=2026-04-12
 *
 * ⚠️ 이 스크립트는 입력 JSON을 tmp/ 에서 읽습니다.
 *    먼저 firebase database:get 으로 아래 경로들을 다운로드해주세요:
 *      tmp/day-games.json       ← {clubName}/{date}
 *      tmp/roster.json          ← PlayerSelectionByDate/{clubName}/{date}/AttandPlayer
 *      tmp/teamnames.json       ← PlayerSelectionByDate/{clubName}/{date}/TeamNames
 *      tmp/stats.json           ← PlayerStatsBackup_6m/{clubName}
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ID = 'football-92492';
const APPLY = process.argv.includes('--apply');
const CLUB = (process.argv.find((a) => a.startsWith('--club=')) || '--club=한강FC').split('=')[1];
const DATE = (process.argv.find((a) => a.startsWith('--date=')) || '--date=2026-04-12').split('=')[1];

const OWN_GOAL_LABEL = '자책골';
const NO_MVP = '없음';

// ── 입력 파일 로드 ──
const tmpDir = path.join(__dirname, '..', 'tmp');
const load = (name) => {
  const p = path.join(tmpDir, name);
  if (!fs.existsSync(p)) {
    console.error(`❌ 필요한 파일이 없습니다: ${p}`);
    console.error('   먼저 firebase database:get 으로 아래 경로들을 다운로드해주세요.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
};

const games = load('day-games.json');
const roster = load('roster.json') || {};
const teamNames = load('teamnames.json') || {};
const statsRaw = load('stats.json') || {};

// 스탯을 abilityScore 맵으로 변환
const statsMap = {};
Object.entries(statsRaw).forEach(([name, d]) => {
  statsMap[name] = Number(d?.abilityScore || 0);
});

// ── 헬퍼 ──
function parseGoalEntry(entry) {
  // "1 | 홍길동 - 강감찬" → { scorer: '홍길동', assister: '강감찬' }
  const parts = String(entry).split(' | ');
  if (parts.length < 2) return { scorer: null, assister: null };
  const names = parts[1].split(' - ');
  return {
    scorer: (names[0] || '').trim() || null,
    assister: (names[1] || '').trim() || null,
  };
}

function teamNameToCode(tname) {
  // "Team A" → "A" 또는 TeamNames 매칭
  for (const code of ['A', 'B', 'C']) {
    if (teamNames && teamNames[code] === tname) return code;
  }
  const clean = String(tname || '').replace(/^(팀\s*|Team\s*)/i, '').trim();
  if (['A', 'B', 'C'].includes(clean)) return clean;
  return null;
}

// ── 경기 MVP 재계산 ──
function computeGameMvp(game) {
  const list1 = Array.isArray(game.goalList1) ? game.goalList1 : [];
  const list2 = Array.isArray(game.goalList2) ? game.goalList2 : [];
  const score1 = Number(game.goalCount1) || 0;
  const score2 = Number(game.goalCount2) || 0;

  const winTeam = score1 > score2 ? 1 : score2 > score1 ? 2 : 0;

  // ── 무승부 → 양팀 로스터에서 abilityScore 최고 ──
  if (winTeam === 0) {
    const code1 = teamNameToCode(game.team1_name);
    const code2 = teamNameToCode(game.team2_name);
    const r1 = code1 && Array.isArray(roster[code1]) ? roster[code1].filter(Boolean) : [];
    const r2 = code2 && Array.isArray(roster[code2]) ? roster[code2].filter(Boolean) : [];
    const allPlayers = [...r1, ...r2];
    if (allPlayers.length === 0) return NO_MVP;

    const sorted = [...allPlayers].sort((a, b) => {
      const sa = statsMap[a] || 0;
      const sb = statsMap[b] || 0;
      return sb - sa || a.localeCompare(b, 'ko');
    });
    return sorted[0] || NO_MVP;
  }

  // ── 승부 있음 → 우승팀 공격포인트 1위 ──
  const winnerList = winTeam === 1 ? list1 : list2;
  if (winnerList.length === 0) return NO_MVP;

  const stats = {};
  winnerList.forEach((entry) => {
    const { scorer, assister } = parseGoalEntry(entry);
    if (scorer && scorer !== OWN_GOAL_LABEL) {
      stats[scorer] = stats[scorer] || { goals: 0, assists: 0 };
      stats[scorer].goals++;
    }
    if (assister && assister !== OWN_GOAL_LABEL) {
      stats[assister] = stats[assister] || { goals: 0, assists: 0 };
      stats[assister].assists++;
    }
  });

  const sorted = Object.entries(stats).sort((a, b) => {
    const d = b[1].goals + b[1].assists - (a[1].goals + a[1].assists);
    if (d) return d;
    return b[1].goals - a[1].goals;
  });
  return sorted.length > 0 ? sorted[0][0] : NO_MVP;
}

// ── 메인: 각 경기 재계산 + 일일 MVP ──
const gameKeys = Object.keys(games).filter((k) => k.startsWith('game')).sort();
const results = [];
const points = {};
const gd = {};
const gf = {};
// 일일 누적 공격 포인트 (선수별): { name: { goals, assists } }
const dailyStats = {};

const countForDaily = (list) => {
  if (!Array.isArray(list)) return;
  list.forEach((entry) => {
    const { scorer, assister } = parseGoalEntry(entry);
    if (scorer && scorer !== OWN_GOAL_LABEL) {
      dailyStats[scorer] = dailyStats[scorer] || { goals: 0, assists: 0 };
      dailyStats[scorer].goals++;
    }
    if (assister && assister !== OWN_GOAL_LABEL) {
      dailyStats[assister] = dailyStats[assister] || { goals: 0, assists: 0 };
      dailyStats[assister].assists++;
    }
  });
};

gameKeys.forEach((key) => {
  const g = games[key];
  const oldMvp = g.mvp || NO_MVP;
  const newMvp = computeGameMvp(g);
  const changed = oldMvp !== newMvp;

  results.push({
    gameKey: key,
    team1_name: g.team1_name,
    team2_name: g.team2_name,
    score1: g.goalCount1 || 0,
    score2: g.goalCount2 || 0,
    oldMvp,
    newMvp,
    changed,
  });

  // 승점 집계 (일일 우승팀 결정용)
  const t1 = g.team1_name;
  const t2 = g.team2_name;
  const s1 = Number(g.goalCount1) || 0;
  const s2 = Number(g.goalCount2) || 0;
  if (t1) {
    gf[t1] = (gf[t1] || 0) + s1;
    gd[t1] = (gd[t1] || 0) + (s1 - s2);
    points[t1] = (points[t1] || 0) + (s1 > s2 ? 3 : s1 === s2 ? 1 : 0);
  }
  if (t2) {
    gf[t2] = (gf[t2] || 0) + s2;
    gd[t2] = (gd[t2] || 0) + (s2 - s1);
    points[t2] = (points[t2] || 0) + (s2 > s1 ? 3 : s1 === s2 ? 1 : 0);
  }

  // 일일 누적 공격 포인트 집계 (일일 MVP 선정용)
  countForDaily(g.goalList1);
  countForDaily(g.goalList2);
});

// 일일 우승팀 결정
const teamEntries = Object.entries(points);
let dailyWinnerName = null;
if (teamEntries.length > 0) {
  teamEntries.sort(
    (a, b) =>
      b[1] - a[1] ||
      ((gd[b[0]] || 0) - (gd[a[0]] || 0)) ||
      ((gf[b[0]] || 0) - (gf[a[0]] || 0))
  );
  dailyWinnerName = teamEntries[0][0];
}

// 일일 우승팀 로스터 조회
let dailyWinnerRoster = [];
if (dailyWinnerName) {
  const code = teamNameToCode(dailyWinnerName);
  if (code && Array.isArray(roster[code])) {
    dailyWinnerRoster = roster[code].filter(Boolean);
  }
}

// 일일 MVP 선정:
// 1) 일일 우승팀 선수 중
// 2) 총 공격 포인트(골+어시스트) 최다 → 동률 시 골 수 → abilityScore → 이름
let newDailyMvp = NO_MVP;
if (dailyWinnerRoster.length > 0) {
  const rosterSet = new Set(dailyWinnerRoster);
  const eligible = dailyWinnerRoster.map((name) => ({
    name,
    goals: dailyStats[name]?.goals || 0,
    assists: dailyStats[name]?.assists || 0,
    ability: statsMap[name] || 0,
  }));
  // 최소 1포인트 이상 선수만 선정 대상 (아무도 기여 안 했으면 평점 최고)
  const contributors = eligible.filter((p) => p.goals + p.assists > 0);
  const pool = contributors.length > 0 ? contributors : eligible;
  pool.sort((a, b) =>
    (b.goals + b.assists) - (a.goals + a.assists) ||
    b.goals - a.goals ||
    b.ability - a.ability ||
    a.name.localeCompare(b.name, 'ko')
  );
  if (pool.length > 0) newDailyMvp = pool[0].name;
  // 로그용
  console.log('\n[일일 우승팀 선수 공격 포인트]');
  eligible.sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
    .forEach((p) => {
      if (rosterSet.has(p.name)) {
        console.log(`   ${p.name}: ${p.goals}G ${p.assists}A (총 ${p.goals + p.assists}) · 평점 ${p.ability}`);
      }
    });
}

// DailyResultsBackup 읽어서 기존 dailyMvp 확인
let oldDailyMvp = NO_MVP;
try {
  const daily = JSON.parse(fs.readFileSync(path.join(tmpDir, 'daily.json'), 'utf-8'));
  oldDailyMvp = daily?.dailyMvp || NO_MVP;
} catch {
  // 무시
}

// ── 결과 출력 ──
console.log('');
console.log(`🏟  ${CLUB} / ${DATE}`);
console.log(`📌 ${APPLY ? '⚡ APPLY MODE — 실제 DB에 반영' : '🔍 DRY-RUN — 변경사항만 출력 (--apply 플래그 사용 시 실제 반영)'}`);
console.log('');
console.log('───── 경기별 MVP ─────');
results.forEach((r) => {
  const mark = r.changed ? '🔄' : '  ';
  console.log(
    `${mark} ${r.gameKey}: ${r.team1_name} ${r.score1}:${r.score2} ${r.team2_name}`
  );
  if (r.changed) {
    console.log(`     Old: ${r.oldMvp}  →  New: ${r.newMvp}`);
  } else {
    console.log(`     MVP: ${r.newMvp} (unchanged)`);
  }
});

console.log('');
console.log('───── 일일 집계 ─────');
Object.entries(points).forEach(([tname, pts]) => {
  console.log(`   ${tname}: ${pts}점 (골득실 ${gd[tname] >= 0 ? '+' : ''}${gd[tname]}, 득점 ${gf[tname]})`);
});
console.log(`   → 일일 우승: ${dailyWinnerName || '(미정)'}`);
console.log('');
console.log('───── 일일 MVP ─────');
const dmChanged = oldDailyMvp !== newDailyMvp;
if (dmChanged) {
  console.log(`🔄 Old: ${oldDailyMvp}  →  New: ${newDailyMvp}`);
} else {
  console.log(`   ${newDailyMvp} (unchanged)`);
}

const anyChanged = results.some((r) => r.changed) || dmChanged;
console.log('');
if (!anyChanged) {
  console.log('✅ 변경사항 없음. 모든 MVP가 이미 새 로직과 일치합니다.');
  process.exit(0);
}

if (!APPLY) {
  console.log('ℹ  DRY-RUN 모드라 실제 DB는 수정되지 않았습니다.');
  console.log('   실제 반영하려면: node scripts/recompute-mvp.js --apply');
  process.exit(0);
}

// ── APPLY: 실제 DB 쓰기 ──
console.log('');
console.log('💾 DB에 적용 중...');

function fbSet(dbPath, value) {
  const tmp = path.join(tmpDir, `apply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(value));
  try {
    execSync(
      `firebase database:set "${dbPath}" "${tmp}" --project ${PROJECT_ID} --force`,
      { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
    );
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// 1. 각 게임의 mvp 필드 업데이트 (변경된 것만)
results.forEach((r) => {
  if (!r.changed) return;
  const dbPath = `/${CLUB}/${DATE}/${r.gameKey}/mvp`;
  console.log(`  ✏  ${dbPath} = "${r.newMvp}"`);
  fbSet(dbPath, r.newMvp);
});

// 2. DailyResultsBackup 전체 재저장 (matches에 새 MVP 반영 + dailyMvp 업데이트)
const newMatches = results.map((r) => ({
  gameNumber: r.gameKey.replace('game', '') + '경기',
  team1: r.team1_name,
  team2: r.team2_name,
  score1: r.score1,
  score2: r.score2,
  mvp: r.newMvp,
}));
const newDaily = { matches: newMatches, dailyMvp: newDailyMvp };
console.log(`  ✏  /DailyResultsBackup/${CLUB}/${DATE}  (matches + dailyMvp)`);
fbSet(`/DailyResultsBackup/${CLUB}/${DATE}`, newDaily);

console.log('');
console.log('✅ 적용 완료!');

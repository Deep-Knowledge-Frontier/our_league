#!/usr/bin/env node
/**
 * Firebase Emulator 시드 스크립트
 *
 * 사용법:
 *   1. 터미널 A: `npm run emulator`  (Auth:9099 + DB:9000 + UI:4000)
 *   2. 터미널 B: `node scripts/seed-emulator.js`
 *   3. 터미널 C: `npm start`
 *   4. 브라우저 "Google로 로그인" → 팝업에서 admin@test.com 선택
 *
 * 이 스크립트는 프로덕션 Firebase에는 절대 영향을 주지 않습니다.
 * (emulator hosts 를 localhost:9000 / localhost:9099 로 고정)
 */

const PROJECT_ID = 'football-92492';
const DB_HOST = 'http://localhost:9000';
const AUTH_HOST = 'http://localhost:9099';
const NS = `${PROJECT_ID}-default-rtdb`;

// ── 안전장치: 실제 호스트로 가는 실수 방지 ──
process.env.FIREBASE_DATABASE_EMULATOR_HOST = 'localhost:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const CLUB = '테스트FC';

// ── 이메일 → Firebase key 변환 (app 로직과 동일) ──
const k = (email) => email.replace(/\./g, ',');

// ── 테스트 유저 정의 ──
// admin@test.com은 관리자이면서 참석자(이순신)로도 등록 → 주장으로 선택 가능
// 즉, 한 계정으로 관리자 + 주장 테스트를 모두 할 수 있음
const USERS = [
  { email: 'admin@test.com',    name: '이순신',   role: 'admin',  isAttendee: true },
  { email: 'player1@test.com',  name: '강감찬',   role: 'player', isAttendee: true },
  { email: 'player2@test.com',  name: '을지문덕', role: 'player', isAttendee: true },
  { email: 'player3@test.com',  name: '세종대왕', role: 'player', isAttendee: true },
  { email: 'player4@test.com',  name: '유관순',   role: 'player', isAttendee: true },
  { email: 'player5@test.com',  name: '안중근',   role: 'player', isAttendee: true },
  { email: 'player6@test.com',  name: '윤봉길',   role: 'player', isAttendee: true },
  { email: 'player7@test.com',  name: '김구',     role: 'player', isAttendee: true },
  { email: 'player8@test.com',  name: '신사임당', role: 'player', isAttendee: true },
  { email: 'player9@test.com',  name: '정약용',   role: 'player', isAttendee: true },
];

// ── 선수 능력치 풀 (드래프트 균형 테스트용) ──
const ABILITY_POOL = [85, 82, 78, 75, 73, 70, 68, 66, 64, 62, 60, 58, 55];

// ── 다음 경기 날짜 (오늘 + 3일) ──
const todayPlus = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const NEXT_MATCH = todayPlus(3);

// ── Auth emulator: 유저 생성 ──
async function createAuthUser(email, password = 'test1234') {
  try {
    const res = await fetch(
      `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (data.error && data.error.message !== 'EMAIL_EXISTS') {
      console.warn(`  ⚠ ${email}: ${data.error.message}`);
    }
    return data.localId || null;
  } catch (e) {
    console.warn(`  ⚠ ${email}: ${e.message}`);
    return null;
  }
}

// ── DB emulator: PUT 전체 트리 ──
async function dbPut(path, data) {
  // path가 빈 문자열이면 루트(/), 아니면 /foo/bar 형태
  const normalized = path && !path.startsWith('/') ? `/${path}` : (path || '/');
  const url = `${DB_HOST}${normalized}.json?ns=${NS}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`DB PUT ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ── 시드 데이터 빌드 ──
function buildSeed() {
  const tree = {};

  // AllowedUsers (권한)
  tree.AllowedUsers = { admin: {}, moderator: {} };
  USERS.forEach((u) => {
    if (u.role === 'admin') tree.AllowedUsers.admin[k(u.email)] = true;
  });

  // Users (프로필)
  tree.Users = {};
  USERS.forEach((u) => {
    tree.Users[k(u.email)] = {
      name: u.name,
      club: CLUB,
      email: u.email,
      createdAt: Date.now(),
    };
  });

  // 클럽 설정
  tree.clubs = {
    [CLUB]: {
      type: 'futsal',
      formation: '1-3-1',
      createdAt: Date.now(),
      description: '로컬 개발 테스트 클럽',
    },
  };

  // registeredPlayers (참석 가능한 모든 유저를 선수로 등록)
  const players = USERS.filter((u) => u.isAttendee);
  tree.registeredPlayers = { [CLUB]: {} };
  players.forEach((u, i) => {
    tree.registeredPlayers[CLUB][`p${i + 1}`] = {
      name: u.name,
      position: ['GK', 'DF', 'MF', 'FW'][i % 4],
      skill: '중',
      email: u.email,
    };
  });

  // 선수 스탯 (abilityScore 기반 자동/AI 편성용)
  tree.PlayerStatsBackup_6m = { [CLUB]: {} };
  players.forEach((u, i) => {
    tree.PlayerStatsBackup_6m[CLUB][u.name] = {
      abilityScore: ABILITY_POOL[i] || 60,
      goals: 5 + (i % 7),
      assists: 3 + (i % 5),
      attendanceRate: 50 + (i * 3) % 50,
      pointRate: 40 + (i * 4) % 50,
      participatedMatches: 10 + (i % 8),
    };
  });

  // 다음 경기 일정
  tree.MatchDates = {
    [CLUB]: {
      [NEXT_MATCH]: {
        isActive: true,
        time: '19:00',
        location: '수색철길 풋살장',
      },
    },
  };

  // 투표 데이터 — 참석자(isAttendee) 전원이 참석으로 등록됨 (admin 이순신 포함)
  const attend = players.map((u) => u.name);
  tree.PlayerSelectionByDate = {
    [CLUB]: {
      [NEXT_MATCH]: {
        AttandPlayer: { all: attend },
        AbsentPlayer: { all: [] },
        UndecidedPlayer: { all: [] },
      },
    },
  };

  // 최근 경기 결과 (홈 카드 채우기용)
  const pastDate = todayPlus(-7);
  tree.DailyResultsBackup = {
    [CLUB]: {
      [pastDate]: {
        dailyMvp: '이순신',
        matches: [
          { team1: 'A팀', team2: 'B팀', score1: 3, score2: 2, mvp: '강감찬' },
          { team1: 'A팀', team2: 'C팀', score1: 1, score2: 1, mvp: '세종대왕' },
          { team1: 'B팀', team2: 'C팀', score1: 2, score2: 0, mvp: '유관순' },
        ],
      },
    },
  };

  return tree;
}

// ── 메인 ──
async function main() {
  console.log('🌱 Firebase Emulator 시드 시작');
  console.log(`   DB:   ${DB_HOST}?ns=${NS}`);
  console.log(`   Auth: ${AUTH_HOST}`);
  console.log('');

  // 1. Auth 유저 생성
  console.log('👤 Auth 유저 생성...');
  for (const u of USERS) {
    await createAuthUser(u.email);
    console.log(`   ✓ ${u.email} (${u.name})`);
  }

  // 2. DB 시드 (전체 트리 PUT)
  console.log('');
  console.log('📊 DB 시드 중...');
  const seed = buildSeed();
  await dbPut('', seed);
  console.log(`   ✓ 클럽: ${CLUB}`);
  console.log(`   ✓ 선수: ${Object.keys(seed.registeredPlayers[CLUB]).length}명`);
  console.log(`   ✓ 다음 경기: ${NEXT_MATCH}`);
  console.log(`   ✓ 참석자: ${seed.PlayerSelectionByDate[CLUB][NEXT_MATCH].AttandPlayer.all.length}명`);

  console.log('');
  console.log('✅ 시드 완료!');
  console.log('');
  console.log('📝 다음 단계:');
  console.log('   1. npm start');
  console.log('   2. 브라우저에서 "Google로 로그인" 클릭');
  console.log('   3. 팝업에서 원하는 계정 선택');
  console.log('');
  console.log('🧪 주장 테스트 계정 (드래프트 테스트용):');
  console.log('   • admin@test.com    → 관리자 (드래프트 시작/관리)');
  console.log('   • captain1@test.com → 이순신   (A팀 주장 예정)');
  console.log('   • captain2@test.com → 강감찬   (B팀 주장 예정)');
  console.log('   • captain3@test.com → 을지문덕 (C팀 주장 예정)');
  console.log('   • player1~9@test.com → 나머지 참석자');
  console.log('');
  console.log('💡 멀티창 테스트 팁:');
  console.log('   시크릿 창(또는 다른 브라우저)을 여러 개 열어서');
  console.log('   각 창에 다른 계정으로 로그인하면 실시간 동기화를 확인할 수 있어요.');
  console.log('');
  console.log('🔍 Emulator UI: http://localhost:4000');
}

main().catch((e) => {
  console.error('');
  console.error('❌ 시드 실패:', e.message);
  console.error('');
  console.error('   Emulator가 실행 중인지 확인하세요: npm run emulator');
  process.exit(1);
});

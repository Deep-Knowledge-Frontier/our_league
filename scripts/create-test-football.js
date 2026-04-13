#!/usr/bin/env node
/**
 * 테스트용 축구 클럽 생성 스크립트
 * 프로덕션 DB에 직접 쓰기 — 마스터 관리자가 클럽 전환으로 접근 가능
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'football-92492';
const CLUB = '테스트축구FC';

// 내일 날짜
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const MATCH_DATE = tomorrow.toISOString().slice(0, 10);

// Firebase에 JSON 쓰기
function fbSet(dbPath, data) {
  const tmp = path.join(os.tmpdir(), `fb-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(data));
  try {
    execSync(
      `firebase database:set "${dbPath}" "${tmp}" --project ${PROJECT_ID} --force`,
      { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
    );
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function fbUpdate(dbPath, data) {
  const tmp = path.join(os.tmpdir(), `fb-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(data));
  try {
    execSync(
      `firebase database:update "${dbPath}" "${tmp}" --project ${PROJECT_ID} --force`,
      { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
    );
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

console.log(`🏟 테스트 축구 클럽 생성: ${CLUB}`);
console.log(`📅 테스트 경기일: ${MATCH_DATE}`);
console.log('');

// 1. 클럽 등록
console.log('1. 클럽 등록...');
fbSet(`/clubs/${CLUB}`, {
  type: 'football',
  formation: '4-3-3',
  name: CLUB,
  createdAt: Date.now(),
  createdBy: 'test-script',
});

// 2. 선수 등록 (22명 — 축구 11 vs 11)
console.log('2. 선수 등록...');
const players = [
  '테스트GK1', '테스트DF1', '테스트DF2', '테스트DF3', '테스트DF4',
  '테스트MF1', '테스트MF2', '테스트MF3',
  '테스트FW1', '테스트FW2', '테스트FW3',
  '테스트GK2', '테스트DF5', '테스트DF6', '테스트DF7', '테스트DF8',
  '테스트MF4', '테스트MF5', '테스트MF6',
  '테스트FW4', '테스트FW5', '테스트FW6',
];
const regPlayers = {};
players.forEach((name, i) => {
  const pos = name.match(/(GK|DF|MF|FW)/)?.[1] || 'MF';
  regPlayers[`p${i + 1}`] = { name, position: pos, skill: '중', email: `test${i + 1}@test.com` };
});
fbSet(`/registeredPlayers/${CLUB}`, regPlayers);

// 3. 경기일 등록
console.log('3. 경기일 등록...');
fbSet(`/MatchDates/${CLUB}/${MATCH_DATE}`, {
  isActive: true,
  time: '19:00',
  location: '테스트 경기장',
});

// 4. 참석 투표 (전원 참석)
console.log('4. 참석자 등록...');
fbSet(`/PlayerSelectionByDate/${CLUB}/${MATCH_DATE}/AttandPlayer`, {
  all: players,
  A: players.slice(0, 11),
  B: players.slice(11, 22),
});

// 5. 팀 캡틴 설정
console.log('5. 주장 설정...');
fbSet(`/PlayerSelectionByDate/${CLUB}/${MATCH_DATE}/TeamCaptains`, {
  A: '테스트FW1',
  B: '테스트FW4',
});

// 6. 마스터 관리자의 Users에 이 클럽 표시 안 해도 됨 — isMaster 기능으로 클럽 전환 가능

// 7. 6개월 스탯 (쿼터 출전 카운팅 + MVP 판단용)
console.log('6. 선수 스탯 등록...');
const stats = {};
players.forEach((name, i) => {
  stats[name] = {
    abilityScore: 60 + Math.round(Math.random() * 30),
    goals: Math.round(Math.random() * 10),
    assists: Math.round(Math.random() * 8),
    attendanceRate: 50 + Math.round(Math.random() * 50),
    pointRate: 30 + Math.round(Math.random() * 60),
    participatedMatches: 5 + Math.round(Math.random() * 15),
  };
});
fbSet(`/PlayerStatsBackup_6m/${CLUB}`, stats);

console.log('');
console.log('✅ 테스트 축구 클럽 생성 완료!');
console.log('');
console.log('📝 테스트 방법:');
console.log('   1. https://uri-league.web.app 접속 (마스터 관리자 로그인)');
console.log('   2. 내정보 탭 → 마스터 관리자 → 클럽 조회 → "테스트축구FC" 선택');
console.log('   3. 관리탭 → 경기운영 → 해당 경기 선택');
console.log('   4. 팀 구성 → ⏱ 쿼터 설정 UI 확인');
console.log('   5. 쿼터별 포메이션 탭 + 선수별 출전 카운팅 확인');
console.log('');
console.log(`🏟 클럽: ${CLUB} (football 타입)`);
console.log(`📅 경기: ${MATCH_DATE}`);
console.log(`👥 선수: ${players.length}명 (A팀 11명 vs B팀 11명)`);

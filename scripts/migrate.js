/**
 * 데이터 마이그레이션 스크립트
 * 구 DB (test2-82751) → 새 DB (football-92492)
 *
 * 사용법: node scripts/migrate.js
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set } = require('firebase/database');

// ── 구 DB (test2-82751, production) ──
const oldConfig = {
  apiKey: 'AIzaSyCdTmoHaTnJh8AOVr59HL4Y8_-XDUPG4eY',
  authDomain: 'test2-82751.firebaseapp.com',
  databaseURL: 'https://test2-82751-default-rtdb.firebaseio.com',
  projectId: 'test2-82751',
};

// ── 새 DB (football-92492) ──
const newConfig = {
  apiKey: 'AIzaSyCi6aaK8YoY7lFJZZQOTmgJB7PrFgMU9-s',
  authDomain: 'football-92492.firebaseapp.com',
  databaseURL: 'https://football-92492-default-rtdb.firebaseio.com',
  projectId: 'football-92492',
};

// 두 개의 Firebase 앱 초기화
const oldApp = initializeApp(oldConfig, 'old');
const newApp = initializeApp(newConfig, 'new');

const oldDb = getDatabase(oldApp);
const newDb = getDatabase(newApp);

// 마이그레이션할 경로 목록
const PATHS_TO_MIGRATE = [
  'Users',                        // 사용자 프로필
  'AllowedUsers',                 // 권한 (admin, moderator, verified)
  'MatchDates/한강FC',             // 경기 일정
  'PlayerSelectionByDate/한강FC',  // 출석/팀 선택
  '한강FC',                        // 경기 결과 (clubName/date/game)
  'PlayerStatsBackup_6m/한강FC',   // 6개월 롤링 통계
  'PlayerStatsBackup/한강FC',      // 전체 통계 백업
  'PlayerDetailStats/한강FC',      // 상세 선수 통계
  'PlayerWeeklyStandings/한강FC',  // 주간 순위
  'PlayerNetworkGraph/한강FC',     // 선수 관계 그래프
  'DailyResultsBackup/한강FC',     // 일별 결과 백업
  'MemberInfo/한강FC',             // 회원 정보
  'registeredPlayers/한강FC',      // 등록 선수
  'LeagueMaker/한강FC',            // 리그 설정
];

async function migratePath(path) {
  try {
    console.log(`[읽기] ${path} ...`);
    const snapshot = await get(ref(oldDb, path));

    if (!snapshot.exists()) {
      console.log(`  ⚠️  데이터 없음 (스킵)`);
      return { path, status: 'empty' };
    }

    const data = snapshot.val();
    const size = JSON.stringify(data).length;
    console.log(`  📦 데이터 크기: ${(size / 1024).toFixed(1)} KB`);

    console.log(`[쓰기] ${path} → 새 DB ...`);
    await set(ref(newDb, path), data);
    console.log(`  ✅ 완료`);

    return { path, status: 'success', size };
  } catch (error) {
    console.error(`  ❌ 실패: ${error.message}`);
    return { path, status: 'error', error: error.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  Firebase 데이터 마이그레이션');
  console.log('  구 DB: test2-82751');
  console.log('  새 DB: football-92492');
  console.log('========================================\n');

  const results = [];

  for (const path of PATHS_TO_MIGRATE) {
    const result = await migratePath(path);
    results.push(result);
    console.log('');
  }

  // 결과 요약
  console.log('========================================');
  console.log('  마이그레이션 결과 요약');
  console.log('========================================');

  const success = results.filter(r => r.status === 'success');
  const empty = results.filter(r => r.status === 'empty');
  const errors = results.filter(r => r.status === 'error');

  console.log(`  ✅ 성공: ${success.length}개`);
  success.forEach(r => console.log(`     - ${r.path} (${(r.size / 1024).toFixed(1)} KB)`));

  if (empty.length > 0) {
    console.log(`  ⚠️  빈 경로: ${empty.length}개`);
    empty.forEach(r => console.log(`     - ${r.path}`));
  }

  if (errors.length > 0) {
    console.log(`  ❌ 실패: ${errors.length}개`);
    errors.forEach(r => console.log(`     - ${r.path}: ${r.error}`));
  }

  console.log('\n마이그레이션 완료!');
  process.exit(0);
}

main().catch(err => {
  console.error('마이그레이션 중 치명적 에러:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * 프로덕션 DB → Emulator 동기화 스크립트
 *
 * 동작:
 *   1. firebase CLI로 프로덕션 football-92492 Realtime DB 전체를 다운로드
 *   2. 다운로드한 JSON에 테스트 admin 계정(admin@test.com) 주입
 *   3. Emulator(localhost:9000)에 PUT
 *   4. Emulator Auth(localhost:9099)에 admin@test.com 계정 생성
 *
 * 요구사항:
 *   - Emulator가 실행 중이어야 함: `npm run emulator`
 *   - Firebase CLI 로그인 상태: `firebase login` (배포 때 이미 되어있으면 OK)
 *
 * 사용법:
 *   터미널 A: npm run emulator
 *   터미널 B: npm run sync-prod
 *   터미널 C: npm start
 *
 * ⚠️ 이 스크립트는 프로덕션 DB를 READ만 합니다 (절대 쓰지 않음).
 *    Emulator에만 WRITE 합니다.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'football-92492';
const NS = `${PROJECT_ID}-default-rtdb`;
const DB_HOST = 'http://localhost:9000';
const AUTH_HOST = 'http://localhost:9099';

// 테스트 admin 계정 (자동 로그인용)
const TEST_ADMIN_EMAIL = 'admin@test.com';
const TEST_ADMIN_PASSWORD = 'test1234';
const TEST_ADMIN_KEY = TEST_ADMIN_EMAIL.replace(/\./g, ',');

// ⚠️ 이 env var들은 firebase CLI가 emulator를 타게 만들기 때문에 sync 동안은 절대 세팅 안 함.
//    아래의 REST 호출은 하드코딩된 localhost:9000/9099 URL을 직접 사용함.
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function main() {
  console.log('🌐 프로덕션 → Emulator 동기화 시작');
  console.log(`   프로덕션: ${PROJECT_ID} (READ ONLY)`);
  console.log(`   Emulator: ${DB_HOST} (WRITE)`);
  console.log('');

  // ── 1. Emulator 실행 확인 ──
  try {
    const res = await fetch(`${DB_HOST}/.json?ns=${NS}`);
    if (!res.ok && res.status !== 200) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error('❌ Emulator 연결 실패. 먼저 "npm run emulator"로 emulator를 실행하세요.');
    console.error(`   오류: ${e.message}`);
    process.exit(1);
  }
  console.log('✓ Emulator 연결 확인');

  // ── 2. 프로덕션 DB 다운로드 ──
  console.log('');
  console.log('📥 프로덕션 DB 스냅샷 다운로드 중 (firebase database:get)...');
  const tmpFile = path.join(os.tmpdir(), `prod-snapshot-${Date.now()}.json`);
  let prodData;
  try {
    // --output 옵션으로 직접 파일에 쓰기 (stdout의 INFO 메시지와 분리)
    execSync(
      `firebase database:get / --project ${PROJECT_ID} --output "${tmpFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer: 500 * 1024 * 1024,
        stdio: 'inherit',
      }
    );
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    prodData = JSON.parse(raw);
    fs.unlinkSync(tmpFile); // 임시 파일 정리
    console.log('  ✓ 다운로드 완료');
    const sizeKB = (raw.length / 1024).toFixed(1);
    console.log(`  크기: ${sizeKB} KB`);
    console.log(`  최상위 키: ${Object.keys(prodData).join(', ')}`);
  } catch (e) {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    console.error('');
    console.error('❌ 프로덕션 DB 다운로드 실패:', e.message);
    console.error('');
    console.error('   다음을 확인하세요:');
    console.error('   1. firebase login 되어 있는지: firebase projects:list');
    console.error(`   2. ${PROJECT_ID} 프로젝트 접근 권한 있는지`);
    console.error('   3. 인터넷 연결 상태');
    process.exit(1);
  }

  // ── 3. 테스트 admin 계정 주입 ──
  console.log('');
  console.log('🔧 테스트 admin 계정 주입 중...');
  if (!prodData.AllowedUsers) prodData.AllowedUsers = {};
  if (!prodData.AllowedUsers.admin) prodData.AllowedUsers.admin = {};
  prodData.AllowedUsers.admin[TEST_ADMIN_KEY] = true;

  // 선호 클럽 결정: 한강FC > 그 외 첫 번째
  const clubs = prodData.clubs || prodData.registeredPlayers || {};
  const clubKeys = Object.keys(clubs);
  const PREFERRED_CLUB = '한강FC';
  const selectedClub = clubKeys.includes(PREFERRED_CLUB) ? PREFERRED_CLUB : (clubKeys[0] || '');

  if (!prodData.Users) prodData.Users = {};
  prodData.Users[TEST_ADMIN_KEY] = {
    name: '테스트관리자',
    club: selectedClub,
    email: TEST_ADMIN_EMAIL,
    createdAt: Date.now(),
  };
  console.log(`  ✓ AllowedUsers/admin/${TEST_ADMIN_KEY} 추가`);
  console.log(`  ✓ Users/${TEST_ADMIN_KEY} 추가 (club: ${selectedClub || '(none)'})`);

  // ── 4. Emulator에 업로드 (전체 덮어쓰기) ──
  console.log('');
  console.log('📤 Emulator DB에 업로드 중...');
  const uploadRes = await fetch(`${DB_HOST}/.json?ns=${NS}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prodData),
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    console.error(`❌ 업로드 실패: ${uploadRes.status} ${txt}`);
    process.exit(1);
  }
  console.log('  ✓ 업로드 완료');

  // ── 5. Emulator Auth에 test admin 계정 생성 ──
  console.log('');
  console.log('👤 Emulator Auth 계정 생성 중...');
  try {
    const authRes = await fetch(
      `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
          returnSecureToken: true,
        }),
      }
    );
    const authData = await authRes.json();
    if (authData.error && authData.error.message !== 'EMAIL_EXISTS') {
      console.warn(`  ⚠ ${authData.error.message}`);
    } else {
      console.log(`  ✓ ${TEST_ADMIN_EMAIL} (${authData.error?.message === 'EMAIL_EXISTS' ? '이미 존재' : '신규'})`);
    }
  } catch (e) {
    console.warn(`  ⚠ Auth 계정 생성 실패 (무시 가능): ${e.message}`);
  }

  // ── 완료 메시지 ──
  console.log('');
  console.log('✅ 프로덕션 → Emulator 동기화 완료!');
  console.log('');
  console.log('📝 다음 단계:');
  console.log('   1. npm start (다른 터미널)');
  console.log('   2. 브라우저에서 자동 로그인됨 (admin@test.com)');
  console.log('   3. 또는 Google 로그인 팝업에서 admin@test.com 선택');
  console.log('');
  console.log('🔍 Emulator UI: http://localhost:4000');
  console.log('');
  console.log('⚠️  Emulator를 종료하면 (npm run emulator 재시작) 데이터 초기화됩니다.');
  console.log('    다시 동기화하려면: npm run sync-prod');
}

main().catch((e) => {
  console.error('');
  console.error('❌ 동기화 실패:', e.message);
  process.exit(1);
});

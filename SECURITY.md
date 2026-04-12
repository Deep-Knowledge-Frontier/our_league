# 보안 체크리스트

이 프로젝트는 Firebase(football-92492) + React 기반의 공개 웹 앱입니다.
아래 항목들을 정기적으로 점검하세요.

## 📊 보안 수준 요약

| 레이어 | 상태 | 다음 조치 |
|--------|------|-----------|
| Firebase API Key | `.env` 분리 (gitignore) | ✅ 완료 |
| `masterEmails` 하드코딩 | 환경변수화 | ✅ 완료 |
| GitHub 저장소 | Private | 수동 확인 필요 |
| `database.rules` 실수 배포 방지 | `production.json` / `emulator.json` 분리 | ✅ 완료 |
| `npm run deploy` | `--only hosting:uri-league` 강제 | ✅ 완료 |
| **프로덕션 DB Rules** | **수동 점검 필요** | 🔴 **가장 중요** |
| Auth Authorized Domains | 수동 확인 필요 | 🟡 확인 필요 |
| API Key HTTP Referrer 제한 | 수동 확인 필요 | 🟡 확인 필요 |
| Firebase App Check | 수동 설정 필요 | 🟢 권장 |

## 🔐 코드 레벨 (저장소에서 관리)

- [x] **`masterEmails` 환경변수 분리** — `REACT_APP_MASTER_EMAILS`로 관리 (`src/config/app.config.js`)
- [x] **`database.rules.json` 실수 배포 방지** — `emulator.json` 으로 분리
- [x] **`database.rules.production.json`** — 프로덕션 권장 규칙 파일
- [x] **`npm run deploy`** = `firebase deploy --only hosting:uri-league` (hosting만 배포)
- [x] **`npm run deploy-rules`** = `firebase deploy --only database` (규칙만 배포, 명시적)
- [x] **`.env`, `backups/`, `tmp/`, `.emulator-data/`** 모두 `.gitignore` 포함

## 🚨 Firebase Realtime Database Rules — 핵심

### 현재 상태 파악
먼저 Firebase Console에서 현재 프로덕션 규칙을 확인하세요:
👉 https://console.firebase.google.com/project/football-92492/database/football-92492-default-rtdb/rules

**⚠️ 절대 안 되는 상태:**
```json
{".read": true, ".write": true}
```

**⚠️ 약하지만 많이 보이는 상태:**
```json
{".read": "auth != null", ".write": "auth != null"}
```
이 상태는 "권한 승격" 공격이 가능합니다 — 로그인한 누구나 `AllowedUsers/admin/자기이메일 = true` 를 써서 관리자가 될 수 있어요.

### 권장 규칙 — `database.rules.production.json`
저장소에 이미 작성되어 있습니다. 핵심 보호 사항:

1. **`Users/{emailKey}`** — 본인만 쓰기 가능. 관리자만 전체 조회. 남이 내 프로필을 변조 못 함.
2. **`AllowedUsers/admin/*`** — 기존 admin만 admin 권한 추가/삭제 가능. 자기 승격 공격 차단.
3. **`DailyResultsBackup`, `MatchDates`, `registeredPlayers`, `clubs`, 각종 Stats** — 읽기는 로그인 유저, 쓰기는 admin만.
4. **`PlayerSelectionByDate/*`** — 로그인 유저가 투표/드래프트 가능 (참여 시나리오 유지).
5. **`ClubRequests`** — 로그인 유저 누구나 생성 가능, admin만 읽기/수정 (클럽 생성 요청 기능 유지).
6. **루트 레벨 `{clubName}/{date}/game*`** (경기 기록) — 읽기는 로그인, 쓰기는 admin만.
7. **`$default`** — 명시되지 않은 모든 경로는 기본적으로 거부.

### 배포 절차

#### 1단계: 현재 규칙 백업 (반드시!)
Firebase Console 에서 현재 규칙을 복사해서 **안전한 곳에 저장**하세요:
```
https://console.firebase.google.com/project/football-92492/database/football-92492-default-rtdb/rules
```
좌측 "규칙" 탭 → 전체 JSON 복사 → `backups/prod-rules-YYYYMMDD.json` 파일로 저장

#### 2단계: 앱 동작에 영향 없는지 검증
현재 앱은 다음 동작을 수행합니다. 새 규칙에서 이게 모두 작동해야 합니다:
- 로그인 → `Users/{emailKey}` 읽기 ✅
- `AllowedUsers/admin/{emailKey}` 확인 ✅
- 홈 카드, 경기 결과, 통계 읽기 ✅
- 투표 (`PlayerSelectionByDate/...`) 쓰기 ✅
- 드래프트 진행 (`PlayerSelectionByDate/.../Draft`) 쓰기 ✅
- 개인정보 수정 (`Users/{본인emailKey}`) 쓰기 ✅
- 튜토리얼 완료 플래그 (`Users/{emailKey}/tutorialSeen`) 쓰기 ✅
- 관리자: 경기일 추가, 팀 편성, 경기 결과 기록, MVP 등 쓰기 ✅

#### 3단계: Emulator에서 먼저 테스트 (권장)
```bash
# emulator 설정 파일에 production rules 임시 적용
# 1) database.rules.emulator.json 을 database.rules.production.json 으로 임시 교체
# 2) emulator 재시작
# 3) 앱에서 주요 동작 테스트
```

#### 4단계: 프로덕션 배포
```bash
npm run deploy-rules
```
(자동으로 `firebase deploy --only database` 실행)

#### 5단계: 즉시 검증
1. 브라우저에서 https://uri-league.web.app 접속
2. 로그인 → 홈 화면 정상 로드 확인
3. 투표 → 정상 동작 확인
4. 관리탭 → 경기일 확인
5. 내정보 → 통계 확인

**문제 발생 시**: 즉시 1단계에서 백업한 규칙을 Firebase Console 에서 복원.

### 롤백 방법
```
Firebase Console → Realtime Database → 규칙 탭
→ 저장된 백업 JSON 붙여넣기 → 게시
```

## 🌐 Firebase Console 수동 설정

### 1. Auth → Authorized Domains
👉 https://console.firebase.google.com/project/football-92492/authentication/settings

허용 도메인만 남기세요:
- `localhost` (개발)
- `uri-league.web.app` (프로덕션)
- `uri-league.firebaseapp.com`
- (기타 사용 중인 커스텀 도메인)

❌ 모르는 도메인이 있으면 즉시 삭제.

### 2. API Key 제한 (Google Cloud Console)
👉 https://console.cloud.google.com/apis/credentials?project=football-92492

Firebase API Key 를 찾아서:
- **Application restrictions** → `HTTP referrers`
  - `https://uri-league.web.app/*`
  - `https://uri-league.firebaseapp.com/*`
  - `http://localhost:3000/*` (개발 중에만)
- **API restrictions** → Firebase 관련 API만 허용

### 3. Firebase App Check (권장)
👉 https://console.firebase.google.com/project/football-92492/appcheck

- reCAPTCHA v3 공급자 활성화
- 웹 사이트 키 생성 → 앱에 적용
- 봇/스크래퍼 차단

### 4. 서비스 계정 정리
👉 https://console.cloud.google.com/iam-admin/serviceaccounts?project=football-92492
- 안 쓰는 서비스 계정 삭제
- 키 JSON 파일 있으면 즉시 폐기

## 🚨 사고 대응

### 키가 유출된 경우
1. **즉시** API Key 재발급 (Google Cloud Console)
2. 기존 키 비활성화
3. `.env` 업데이트 → 재배포
4. Firebase DB 의심스러운 변경 검토
5. `backups/` 에서 복구

### 악성 데이터 발견 시
1. `npm run backup-db` 로 현재 상태 백업
2. Firebase Console 에서 해당 노드 제거
3. 규칙 강화 + 어느 경로로 들어왔는지 파악
4. 관리자 외 권한 전체 감사

## 🧪 주기적 점검 (월 1회 권장)

```bash
# 1. 커밋 히스토리에 민감 정보 있는지 스캔
git log --all -p | grep -iE 'api.?key|secret|password|token' | head -20

# 2. 프로덕션 DB 스냅샷 저장
npm run backup-db

# 3. 의존성 취약점 스캔
npm audit

# 4. 원격 저장소 visibility 확인
curl -s https://api.github.com/repos/Deep-Knowledge-Frontier/our_league | grep '"visibility"'
# 예상: "visibility": "private" (또는 404 — private이면 unauthenticated 접근 불가)
```

## 📚 참고 자료

- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Firebase Realtime Database Rules Language](https://firebase.google.com/docs/database/security/rules-conditions)
- [Firebase App Check](https://firebase.google.com/docs/app-check)
- [OWASP Top 10](https://owasp.org/Top10/)

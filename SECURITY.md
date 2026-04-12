# 보안 체크리스트

이 프로젝트는 Firebase(football-92492) + React 기반의 공개 웹 앱입니다.
아래 항목들을 정기적으로 점검하세요.

## 🔐 코드 레벨 (이 저장소에서 관리)

- [x] **`masterEmails` 환경변수 분리** — `REACT_APP_MASTER_EMAILS` 로만 관리 (`src/config/app.config.js` 에 하드코딩 금지)
- [x] **`database.rules.json` 실수 배포 방지** — emulator 전용 파일(`database.rules.emulator.json`) 로 분리, `firebase.json` 의 최상위 `database` 블록 제거
- [x] **`npm run deploy`** 스크립트는 `--only hosting:uri-league` 만 배포 (database/functions 절대 건드리지 않음)
- [x] **`.env`, `backups/`, `.emulator-data/`** 모두 `.gitignore` 포함
- [ ] **비밀 값 커밋 금지** — API 키, 토큰, 서비스 계정 JSON 등 절대 커밋 안 함
  - 확인: `git log --all -p | grep -iE 'api.?key|secret|password|token'`

## 🌐 Firebase Console (수동 설정)

### 1. Realtime Database 규칙
👉 https://console.firebase.google.com/project/football-92492/database/football-92492-default-rtdb/rules

**필수 확인**:
- `auth != null` 체크 (익명 접근 차단)
- 읽기는 클럽 멤버만, 쓰기는 권한별 제한
- `AllowedUsers/admin/*` 경로는 오직 기존 admin만 쓸 수 있어야 함 (권한 승격 방지)
- `Users/{emailKey}` 는 본인만 쓸 수 있어야 함 (다른 유저 프로필 변조 방지)

**❌ 절대 금지**: `{".read": true, ".write": true}` — 전체 공개

### 2. Auth → Authorized Domains
👉 https://console.firebase.google.com/project/football-92492/authentication/settings

허용 도메인만 남기세요:
- `localhost` (개발)
- `uri-league.web.app` (프로덕션)
- `uri-league.firebaseapp.com`
- (기타 사용 중인 커스텀 도메인)

❌ 모르는 도메인이 있으면 즉시 삭제.

### 3. API Key 제한 (Google Cloud Console)
👉 https://console.cloud.google.com/apis/credentials?project=football-92492

Firebase API Key를 찾아서:
- **Application restrictions** → `HTTP referrers` 선택
- 허용 referrer에 위의 Authorized Domains 와 동일하게 입력
  - `https://uri-league.web.app/*`
  - `https://uri-league.firebaseapp.com/*`
  - `http://localhost:3000/*` (개발 중에만)
- **API restrictions** → Firebase 관련 API만 허용 (Identity Toolkit, Cloud Firestore, Realtime DB 등)

### 4. Firebase App Check (권장)
👉 https://console.firebase.google.com/project/football-92492/appcheck

- 브라우저 reCAPTCHA v3 또는 reCAPTCHA Enterprise 활성화
- 프로덕션에서 API 호출이 "실제 우리 앱" 에서만 오는지 검증
- 봇/스크래핑 차단 효과

### 5. 서비스 계정 점검
👉 https://console.cloud.google.com/iam-admin/serviceaccounts?project=football-92492

- 사용하지 않는 서비스 계정 삭제
- 키 파일(JSON)은 **절대** 저장소에 올리지 말 것

## 🚨 사고 대응 (incident response)

### 키가 유출된 경우
1. **즉시** Firebase Console → API Key 재발급
2. 기존 키 비활성화 (Google Cloud Console)
3. `.env` 업데이트 → 재배포
4. Firebase DB 의심스러운 변경 검토 (Logs → Audit)
5. `backups/` 에서 복구 필요 시 JSON 가져오기

### 악성 데이터 발견 시
1. `npm run backup-db` 로 현재 상태 백업
2. Firebase Console 에서 해당 노드 제거
3. 규칙 강화 (어느 경로로 들어왔는지 파악)
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
# 예상: "visibility": "private"
```

## 📚 참고 자료

- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Firebase API Key 보안](https://firebase.google.com/docs/projects/api-keys)
- [Firebase App Check](https://firebase.google.com/docs/app-check)
- [OWASP Top 10](https://owasp.org/Top10/)

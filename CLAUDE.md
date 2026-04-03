# Football Club Web App (football-web)

## 프로젝트 개요
- 풋살/축구 동호회 관리 웹앱 (범용)
- Firebase Hosting + Realtime Database 기반
- React 19 + MUI 7 + react-router-dom 7

## 기술 스택
- **프론트엔드**: React 19, MUI 7, Chart.js, react-force-graph-2d
- **백엔드/DB**: Firebase Realtime Database (football-92492)
- **인증**: Firebase Auth (Google 로그인)
- **빌드**: Create React App

## 프로젝트 구조 (리팩토링됨)
```
src/
  config/
    firebase.js           # Firebase 초기화 (env 변수)
    app.config.js          # 클럽 설정 (이름, 장소, 포지션 등)
  contexts/
    AuthContext.js         # 인증 Context + useAuth 훅
  hooks/                   # 커스텀 훅
  components/
    common/
      BottomNav.js         # 하단 네비게이션
    layout/
      TabLayout.js         # 탭 레이아웃 (상태 보존)
  pages/
    LoginPage.js           # 로그인 (파티클 인트로)
    RegisterPage.js        # 회원가입
    VotePage.js            # 출석 투표
    PlayerSelectPage.js    # 선수 선택/팀 편성 (스네이크 드래프트)
    ScoreRecordPage.js     # 스코어 기록
    ResultsPage.js         # 경기 결과 + 리더보드
    TeamViewPage.js        # 팀 시각화
    MatchDetailPage.js     # 경기 상세
    MyPage.js              # 마이페이지 (통계, 네트워크 그래프)
    AdminPage.js           # 관리자 (경기관리, 백업, 통계)
    LeaguePage.js          # 리그 점수
  utils/
    stats.js               # 통계 함수 (softmax, 평균, 표준편차)
    draft.js               # 스네이크 드래프트 알고리즘
    format.js              # 날짜/이름 포맷 유틸
    permissions.js         # 권한 체크 유틸
```

## 라우팅
- 탭 경로: `/vote`, `/results`, `/mypage`, `/admin`
- 비탭 경로: `/login`, `/register`, `/team/:date`, `/match/:date/:game`, `/player-select`, `/score-record`, `/league`

## 범용성 설정 (app.config.js)
클럽명, 장소 프리셋, 날씨 좌표 등을 `src/config/app.config.js`에서 관리.
다른 클럽에서 사용하려면 이 파일만 수정하면 됨.

## 개발 명령어
```bash
npm start          # 개발 서버 (localhost:3000)
npm run build      # 프로덕션 빌드
```

## 환경 변수
`.env` 파일 필요 (`.env.example` 참고)
- REACT_APP_FIREBASE_* 접두사로 Firebase 설정

## 기존 프로젝트 대비 개선 사항
1. 클럽명 하드코딩 제거 → config 파일로 분리
2. AuthContext 도입 → prop drilling 제거
3. 유틸 함수 공통화 → stats.js, format.js, draft.js
4. 폴더 구조 정리 → pages, components, hooks, utils 분리
5. BottomNav를 TabLayout으로 통합 → 중복 렌더링 제거

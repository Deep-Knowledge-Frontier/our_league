import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import TabLayout from './components/layout/TabLayout';

// 큰 페이지들은 lazy-load (초기 번들 축소)
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'));
const TeamViewPage = lazy(() => import('./pages/TeamViewPage'));
const LeaguePage = lazy(() => import('./pages/LeaguePage'));
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'));
const PlayerSelectPage = lazy(() => import('./pages/PlayerSelectPage'));
const ScoreRecordPage = lazy(() => import('./pages/ScoreRecordPage'));
const DraftPage = lazy(() => import('./pages/DraftPage'));

const PageFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <CircularProgress size={32} />
  </Box>
);

const TAB_PATHS = ['/home', '/vote', '/results', '/mypage', '/admin'];

// 🔴 Dev 환경에서 emulator를 쓰지 않으면 프로덕션 DB에 연결 중이므로 경고 배너 표시
const IS_DEV_PROD_CONNECTED =
  process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_EMULATOR === 'false';

function ProdWarningBanner() {
  const [dismissed, setDismissed] = React.useState(false);
  if (!IS_DEV_PROD_CONNECTED || dismissed) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 9999,
        background: 'linear-gradient(90deg, #D32F2F, #B71C1C)',
        color: 'white',
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: 700,
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(211,47,47,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: '14px' }}>🔴</span>
      <span>LOCAL DEV → PRODUCTION DB 연결 중 · 쓰기 동작은 실제 서비스에 반영됩니다</span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: 'white',
          padding: '2px 10px',
          borderRadius: 4,
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          marginLeft: 4,
        }}
      >
        닫기
      </button>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const isTab = TAB_PATHS.includes(location.pathname);

  const [tabMounted, setTabMounted] = useState(isTab);
  useEffect(() => {
    if (isTab) setTabMounted(true);
  }, [isTab]);

  return (
    <>
      {tabMounted && (
        <div style={{ display: isTab ? 'block' : 'none' }}>
          <TabLayout currentPath={location.pathname} />
        </div>
      )}

      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending" element={<PendingApprovalPage />} />
          <Route path="/team/:date" element={<TeamViewPage />} />
          <Route path="/league" element={<LeaguePage />} />
          <Route path="/match/:date/:game" element={<MatchDetailPage />} />
          <Route path="/player-select" element={<PlayerSelectPage />} />
          <Route path="/score-record" element={<ScoreRecordPage />} />
          <Route path="/draft/:date" element={<DraftPage />} />
          {TAB_PATHS.map((path) => (
            <Route key={path} path={path} element={null} />
          ))}
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <ProdWarningBanner />
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;

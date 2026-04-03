import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TeamViewPage from './pages/TeamViewPage';
import LeaguePage from './pages/LeaguePage';
import MatchDetailPage from './pages/MatchDetailPage';
import PlayerSelectPage from './pages/PlayerSelectPage';
import ScoreRecordPage from './pages/ScoreRecordPage';
import TabLayout from './components/layout/TabLayout';

const TAB_PATHS = ['/vote', '/results', '/mypage', '/admin'];

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

      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/team/:date" element={<TeamViewPage />} />
        <Route path="/league" element={<LeaguePage />} />
        <Route path="/match/:date/:game" element={<MatchDetailPage />} />
        <Route path="/player-select" element={<PlayerSelectPage />} />
        <Route path="/score-record" element={<ScoreRecordPage />} />
        {TAB_PATHS.map((path) => (
          <Route key={path} path={path} element={null} />
        ))}
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;

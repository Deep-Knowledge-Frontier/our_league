import React, { useState, useEffect, Suspense, lazy } from 'react';
import { CircularProgress, Box } from '@mui/material';
import BottomNav from '../common/BottomNav';
import ErrorBoundary from '../common/ErrorBoundary';
import DemoGuestBanner from '../common/DemoGuestBanner';
import { useGlobalNotifications } from '../../hooks/useGlobalNotifications';

// 탭 페이지들도 lazy-load (초기 번들 축소)
const HomePage = lazy(() => import('../../pages/HomePage'));
const VotePage = lazy(() => import('../../pages/VotePage'));
const ResultsPage = lazy(() => import('../../pages/ResultsPage'));
const MyPage = lazy(() => import('../../pages/MyPage'));
const AdminPage = lazy(() => import('../../pages/AdminPage'));

const TabFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <CircularProgress size={32} />
  </Box>
);

const tabs = [
  { path: '/home', Component: HomePage },
  { path: '/vote', Component: VotePage },
  { path: '/results', Component: ResultsPage },
  { path: '/mypage', Component: MyPage },
  { path: '/admin', Component: AdminPage },
];

// Lazy 마운팅: 탭을 처음 선택할 때만 마운트, 이후 display:none으로 유지
export default function TabLayout({ currentPath }) {
  const [mounted, setMounted] = useState({});

  // 전역 푸시 알림 리스너 (투표 마감, 드래프트 시작, 내 차례, MVP)
  useGlobalNotifications();

  useEffect(() => {
    if (currentPath && !mounted[currentPath]) {
      setMounted(prev => ({ ...prev, [currentPath]: true }));
    }
  }, [currentPath, mounted]);

  return (
    <>
      <DemoGuestBanner />
      {tabs.map(({ path, Component }) => {
        const isMounted = mounted[path];
        const isActive = currentPath === path;
        if (!isMounted) return null;
        return (
          <div key={path} style={{ display: isActive ? 'block' : 'none' }}>
            <ErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <Component />
              </Suspense>
            </ErrorBoundary>
          </div>
        );
      })}
      <BottomNav />
    </>
  );
}

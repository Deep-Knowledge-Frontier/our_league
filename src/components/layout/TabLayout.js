import React, { useState, useEffect } from 'react';
import HomePage from '../../pages/HomePage';
import VotePage from '../../pages/VotePage';
import ResultsPage from '../../pages/ResultsPage';
import MyPage from '../../pages/MyPage';
import AdminPage from '../../pages/AdminPage';
import BottomNav from '../common/BottomNav';
import ErrorBoundary from '../common/ErrorBoundary';
import DemoGuestBanner from '../common/DemoGuestBanner';

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
              <Component />
            </ErrorBoundary>
          </div>
        );
      })}
      <BottomNav />
    </>
  );
}

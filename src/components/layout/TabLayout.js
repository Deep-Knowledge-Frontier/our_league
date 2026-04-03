import React from 'react';
import VotePage from '../../pages/VotePage';
import ResultsPage from '../../pages/ResultsPage';
import MyPage from '../../pages/MyPage';
import AdminPage from '../../pages/AdminPage';
import BottomNav from '../common/BottomNav';

// 모든 탭을 한번에 마운트, display로만 전환 (상태 보존)
export default function TabLayout({ currentPath }) {
  const show = (path) => ({ display: currentPath === path ? 'block' : 'none' });

  return (
    <>
      <div style={show('/vote')}><VotePage /></div>
      <div style={show('/results')}><ResultsPage /></div>
      <div style={show('/mypage')}><MyPage /></div>
      <div style={show('/admin')}><AdminPage /></div>
      <BottomNav />
    </>
  );
}

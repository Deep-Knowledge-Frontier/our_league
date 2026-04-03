import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Paper, BottomNavigation, BottomNavigationAction } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../../contexts/AuthContext';

const baseItems = [
  { label: '홈', icon: <HomeIcon />, path: '/home' },
  { label: '투표', icon: <CalendarMonthIcon />, path: '/vote' },
  { label: '경기결과', icon: <EmojiEventsIcon />, path: '/results' },
  { label: '내 정보', icon: <PersonIcon />, path: '/mypage' },
];

const adminItem = { label: '관리', icon: <SettingsIcon />, path: '/admin' };

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isModerator, isMaster } = useAuth();

  const navItems = (isAdmin || isModerator || isMaster) ? [...baseItems, adminItem] : baseItems;
  const currentIdx = navItems.findIndex((item) => location.pathname === item.path);

  return (
    <Paper
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        borderTop: '1px solid #e0e0e0',
      }}
      elevation={8}
    >
      <BottomNavigation
        value={currentIdx >= 0 ? currentIdx : false}
        onChange={(_, newValue) => navigate(navItems[newValue].path)}
        sx={{
          height: 60,
          '& .MuiBottomNavigationAction-root': {
            color: '#999',
            minWidth: 50,
            '&.Mui-selected': { color: '#1565C0' },
          },
        }}
      >
        {navItems.map((item) => (
          <BottomNavigationAction key={item.path} label={item.label} icon={item.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../../contexts/AuthContext';

const baseItems = [
  { label: '홈', icon: HomeIcon, path: '/home' },
  { label: '투표', icon: CalendarMonthIcon, path: '/vote' },
  { label: '경기결과', icon: EmojiEventsIcon, path: '/results' },
  { label: '내 정보', icon: PersonIcon, path: '/mypage' },
];

const adminItem = { label: '관리', icon: SettingsIcon, path: '/admin' };

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isModerator, isMaster } = useAuth();

  const navItems = (isAdmin || isModerator || isMaster) ? [...baseItems, adminItem] : baseItems;

  return (
    <Box sx={{
      position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 1200,
      bgcolor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
      border: '1px solid rgba(255,255,255,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      height: 60, px: 0.5,
    }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <Box key={item.path} onClick={() => navigate(item.path)}
            sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flex: 1, cursor: 'pointer', py: 0.5, borderRadius: 2,
              transition: 'all 0.2s ease',
              '&:active': { transform: 'scale(0.9)' },
            }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: '12px',
              bgcolor: isActive ? '#1565C0' : 'transparent',
              transition: 'all 0.25s ease',
              mb: 0.2,
            }}>
              <Icon sx={{ fontSize: 20, color: isActive ? 'white' : '#999', transition: 'color 0.2s' }} />
            </Box>
            <Typography sx={{
              fontSize: '0.62rem', fontWeight: isActive ? 700 : 500,
              color: isActive ? '#1565C0' : '#999', transition: 'color 0.2s',
            }}>
              {item.label}
            </Typography>
            {isActive && (
              <Box sx={{
                width: 4, height: 4, borderRadius: '50%', bgcolor: '#1565C0',
                mt: 0.1, transition: 'all 0.2s',
              }} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

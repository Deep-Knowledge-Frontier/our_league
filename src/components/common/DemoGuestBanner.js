import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useAuth } from '../../contexts/AuthContext';

// 데모 게스트 상단 배너 — 로그인 유도
export default function DemoGuestBanner() {
  const { isDemoGuest, exitDemoGuest } = useAuth();
  const navigate = useNavigate();

  if (!isDemoGuest) return null;

  const handleLogin = () => {
    exitDemoGuest();
    navigate('/login');
  };

  return (
    <Box sx={{
      position: 'sticky', top: 0, zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      px: 2, py: 1,
      background: 'linear-gradient(90deg, #F57C00, #E65100)',
      color: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
        <VisibilityIcon sx={{ fontSize: 16 }} />
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
          체험 모드 · 샘플 데이터
        </Typography>
      </Box>
      <Button size="small" onClick={handleLogin}
        sx={{
          fontSize: '0.75rem', fontWeight: 700, color: '#E65100',
          bgcolor: 'white', borderRadius: 2, px: 1.5, py: 0.3, minHeight: 0,
          '&:hover': { bgcolor: '#FFF3E0' },
        }}>
        로그인하기
      </Button>
    </Box>
  );
}

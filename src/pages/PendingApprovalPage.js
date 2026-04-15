import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { Box, Container, Typography, Button, Paper, CircularProgress } from '@mui/material';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import LogoutIcon from '@mui/icons-material/Logout';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { userName, realClubName, authReady, emailKey } = useAuth();
  const [livePending, setLivePending] = useState(true);

  // 🆕 Users/{emailKey}.pending 을 실시간 구독 → 승인되면 자동으로 /home
  useEffect(() => {
    if (!emailKey) return;
    const r = ref(db, `Users/${emailKey}/pending`);
    return onValue(r, (snap) => {
      const val = snap.val();
      setLivePending(val === true);
      if (val !== true) {
        // 승인됨 → home으로
        setTimeout(() => navigate('/home', { replace: true }), 500);
      }
    });
  }, [emailKey, navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/', { replace: true });
  };

  if (!authReady) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ pt: 6, pb: 4 }}>
      <Paper sx={{
        borderRadius: 4, p: 4, textAlign: 'center',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
      }}>
        {/* 아이콘 */}
        <Box sx={{
          width: 90, height: 90, mx: 'auto', mb: 2, borderRadius: '50%',
          bgcolor: '#FFF8E1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(245,127,23,0.2)',
        }}>
          <HourglassEmptyIcon sx={{ fontSize: 48, color: '#F57F17' }} />
        </Box>

        <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', mb: 1, color: '#222' }}>
          가입 승인 대기 중
        </Typography>
        <Typography sx={{ fontSize: '0.95rem', color: '#666', mb: 3, lineHeight: 1.6 }}>
          <b>{userName}</b>님의 <b>{realClubName}</b> 가입 신청이<br />
          접수되었습니다.
        </Typography>

        <Box sx={{
          p: 2, borderRadius: 2, bgcolor: '#FFF8E1',
          border: '1px solid #FFE082', mb: 3,
        }}>
          <Typography sx={{ fontSize: '0.85rem', color: '#E65100', fontWeight: 700, mb: 0.5 }}>
            📋 관리자 승인이 필요합니다
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#6D4C41', lineHeight: 1.5 }}>
            클럽 관리자가 가입을 승인하면<br />
            즉시 앱을 이용하실 수 있습니다.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
          <CircularProgress size={14} sx={{ color: '#F57F17' }} />
          <Typography sx={{ fontSize: '0.75rem', color: '#999' }}>
            {livePending ? '승인 대기 중... (자동 갱신)' : '승인 완료! 이동 중...'}
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<LogoutIcon />}
          onClick={handleLogout}
          sx={{
            borderRadius: 2, color: '#666', borderColor: '#ccc',
            fontWeight: 600,
          }}
        >
          로그아웃
        </Button>
      </Paper>
    </Container>
  );
}

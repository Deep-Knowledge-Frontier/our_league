import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Switch, Button, Alert, Divider,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';

const NOTIF_TYPES = [
  { key: 'voteDeadline', label: '투표 마감 임박 (D-1/D-day)', desc: '경기 전날 또는 당일, 아직 투표하지 않았을 때' },
  { key: 'draftStart', label: '드래프트 시작', desc: '내가 주장인 경기의 드래프트가 시작되면' },
  { key: 'draftTurn', label: '내 드래프트 차례', desc: '스네이크 드래프트에서 내 픽 차례가 되면' },
  { key: 'matchResult', label: '경기 결과 / MVP 발표', desc: '오늘 경기의 MVP가 선정되면' },
];

export default function NotificationSettingsDialog({ open, onClose, notif }) {
  const { supported, permission, prefs, savePrefs, requestPermission } = notif;

  const handleToggleMaster = async () => {
    if (!prefs.enabled) {
      if (permission !== 'granted') {
        const result = await requestPermission();
        if (result !== 'granted') return;
      } else {
        await savePrefs({ enabled: true });
      }
    } else {
      await savePrefs({ enabled: false });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <NotificationsIcon sx={{ color: '#7E57C2' }} />
        알림 설정
      </DialogTitle>
      <DialogContent dividers sx={{ px: 2, py: 2 }}>
        {!supported && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            이 브라우저는 알림을 지원하지 않습니다.
          </Alert>
        )}
        {supported && permission === 'denied' && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
            브라우저 설정에서 이 사이트의 알림을 차단했습니다. 브라우저 설정 → 알림 → 이 사이트를 허용으로 변경해주세요.
          </Alert>
        )}

        {/* 마스터 토글 */}
        <Box sx={{
          display: 'flex', alignItems: 'center',
          p: 1.5, borderRadius: 2, bgcolor: '#F5F5F7', mb: 2,
        }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>알림 받기</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: '#888' }}>
              {permission === 'granted' ? '브라우저 권한 허용됨' : '꺼져있음'}
            </Typography>
          </Box>
          <Switch
            checked={prefs.enabled}
            onChange={handleToggleMaster}
            disabled={!supported || permission === 'denied'}
          />
        </Box>

        {/* 세부 토글 */}
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#666', mb: 1 }}>
          알림 종류
        </Typography>
        {NOTIF_TYPES.map((type, i) => (
          <Box key={type.key}>
            <Box sx={{ display: 'flex', alignItems: 'center', py: 1.2 }}>
              <Box sx={{ flex: 1, mr: 1 }}>
                <Typography sx={{
                  fontWeight: 600, fontSize: '0.85rem',
                  color: prefs.enabled ? '#333' : '#999',
                }}>
                  {type.label}
                </Typography>
                <Typography sx={{
                  fontSize: '0.7rem', color: '#999', mt: 0.2,
                }}>
                  {type.desc}
                </Typography>
              </Box>
              <Switch
                size="small"
                checked={!!prefs[type.key]}
                onChange={() => savePrefs({ [type.key]: !prefs[type.key] })}
                disabled={!prefs.enabled}
              />
            </Box>
            {i < NOTIF_TYPES.length - 1 && <Divider />}
          </Box>
        ))}

        <Alert severity="info" sx={{ mt: 2, fontSize: '0.72rem' }}>
          이 알림은 앱(탭)이 열려있을 때만 동작합니다. 백그라운드 푸시는 지원하지 않습니다.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}

// 경기별 동기화 타이머
// - Firebase RTDB로 모든 회원에게 실시간 동기화
// - 운영자(admin/moderator)만 조작 가능, 회원은 조회만
// - 종료 시 자동 알람 (소리 + 진동 + 알림)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack } from '@mui/material';
import { ref, onValue, set, remove } from 'firebase/database';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import AlarmIcon from '@mui/icons-material/Alarm';
import LockIcon from '@mui/icons-material/Lock';
import { db } from '../config/firebase';

const DURATION_PRESETS = [8, 10, 12, 15, 20];
const DEFAULT_DURATION_MIN = 12;
const STALE_THRESHOLD_MS = 30 * 1000; // 종료 후 30초 지나면 알람 스킵

const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * 경기 타이머 (Firebase 동기화)
 * @param {string} props.clubName
 * @param {string} props.dateParam
 * @param {number} props.gameNumber
 * @param {boolean} props.canEdit - 운영자 여부
 * @param {boolean} props.isDemoGuest - 데모/게스트 모드면 쓰기 차단
 * @param {string} props.userName - 작성자 표시용
 * @param {string} props.label
 */
export default function MatchTimer({
  clubName,
  dateParam,
  gameNumber,
  canEdit = false,
  isDemoGuest = false,
  userName = '',
  label = '',
}) {
  // ── 로컬 상태 ──
  const [timerData, setTimerData] = useState(null);  // Firebase에서 받은 상태
  const [now, setNow] = useState(Date.now());        // 매 틱마다 갱신
  const [duration, setDuration] = useState(DEFAULT_DURATION_MIN * 60);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 알람 중복 방지: 동일 endTime은 한 번만 알람
  const alarmedEndTimeRef = useRef(0);
  // 🆕 AudioContext 재사용 — 첫 클릭에서 unlock 후 알람마다 재사용
  const audioCtxRef = useRef(null);

  // 권한 체크 — 데모는 무조건 막힘
  const canControl = canEdit && !isDemoGuest && !!clubName && !!dateParam;

  // 경로 — 운영자 전용 쓰기 규칙이 적용된 별도 최상위 노드
  const timerPath = clubName && dateParam && gameNumber
    ? `MatchTimer/${clubName}/${dateParam}/game${gameNumber}`
    : null;

  // ── localStorage에서 기본 duration 로드 ──
  useEffect(() => {
    const saved = localStorage.getItem('matchTimerDuration');
    if (saved) {
      const m = parseInt(saved, 10);
      if (!isNaN(m) && m >= 1 && m <= 60) setDuration(m * 60);
    }
  }, []);

  // ── Firebase 구독 ──
  useEffect(() => {
    if (!timerPath) return;
    const unsub = onValue(ref(db, timerPath), (snap) => {
      setTimerData(snap.exists() ? snap.val() : null);
    });
    return () => unsub();
  }, [timerPath]);

  // ── 경기 변경 시 알람 카운터 리셋 ──
  useEffect(() => {
    alarmedEndTimeRef.current = 0;
  }, [gameNumber]);

  // 🆕 첫 사용자 인터랙션에서 AudioContext unlock (iOS Safari 자동재생 정책 우회)
  const unlockAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      // 무음 한 박자 재생해서 unlock
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.value = 0;
      osc.start(0); osc.stop(ctx.currentTime + 0.01);
      audioCtxRef.current = ctx;
    } catch (e) { /* unlock 실패 시 무시 */ }
  }, []);

  // 컴포넌트 언마운트 시 AudioContext 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ── 알람 ──
  const triggerAlarm = useCallback(() => {
    // 1) 비프음 — 미리 unlock된 AudioContext 재사용
    try {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'closed') {
        // suspended 상태면 resume (백그라운드 복귀 등)
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        let t = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = i === 2 ? 1100 : 880;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
          gain.gain.setValueAtTime(0.4, t + 0.35);
          gain.gain.linearRampToValueAtTime(0, t + 0.4);
          osc.start(t); osc.stop(t + 0.45);
          t += 0.6;
        }
      }
    } catch (e) { /* 재생 실패 무시 */ }

    // 2) 진동
    if (navigator.vibrate) {
      try { navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
    }

    // 3) 브라우저 알림
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('⏰ 경기 시간 종료', {
          body: `${label || gameNumber + '경기'} — 시간이 다 됐습니다.`,
          icon: '/logo192.png',
          tag: `match-timer-${gameNumber}`,
        });
      } catch (e) {}
    }
  }, [gameNumber, label]);

  // ── 틱 (running 상태일 때만) ──
  useEffect(() => {
    const status = timerData?.status;
    if (status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timerData?.status]);

  // ── 0 도달 감지 + 알람 ──
  useEffect(() => {
    if (!timerData || timerData.status !== 'running') return;
    const endTime = timerData.endTime;
    if (!endTime) return;
    const remaining = (endTime - now) / 1000;
    if (remaining <= 0 && alarmedEndTimeRef.current !== endTime) {
      // 너무 오래 전에 끝난 건 무시 (재접속 시 옛 알람 방지)
      const elapsedSinceEnd = now - endTime;
      alarmedEndTimeRef.current = endTime; // 어쨌든 기록 (중복 방지)
      if (elapsedSinceEnd < STALE_THRESHOLD_MS) {
        triggerAlarm();
      }
    }
  }, [now, timerData, triggerAlarm]);

  // ── 알림 권한 요청 (사용자 인터랙션 시) ──
  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  // ── 운영자 액션: 시작/재개 ──
  const handleStart = async () => {
    if (!canControl || !timerPath) return;
    unlockAudio();                  // 🆕 사용자 인터랙션 시점에 오디오 unlock
    requestNotificationPermission();
    let remainingSec;
    if (timerData?.status === 'paused') {
      // 🆕 nullish coalescing — 0초 정확히 paused여도 0초로 재개 (즉시 종료)
      remainingSec = timerData.remainingAtPause ?? duration;
    } else {
      remainingSec = duration;
    }
    // 0초 또는 음수면 가드 (안전장치)
    if (remainingSec <= 0) {
      remainingSec = duration;
    }
    const newEndTime = Date.now() + remainingSec * 1000;
    try {
      // 🆕 명시적 필드 저장 (스프레드 미사용)
      await set(ref(db, timerPath), {
        status: 'running',
        endTime: newEndTime,
        durationSec: duration,
        remainingAtPause: null,
        updatedBy: userName || '운영자',
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error('[MatchTimer] 시작 실패:', e);
    }
  };

  // ── 운영자 액션: 일시정지 ──
  const handlePause = async () => {
    if (!canControl || !timerPath || !timerData) return;
    if (timerData.status !== 'running') return;
    const remainingSec = Math.max(0, Math.round((timerData.endTime - Date.now()) / 1000));
    try {
      // 🆕 명시적 필드 — timerData 스프레드 대신 필요한 필드만 저장
      await set(ref(db, timerPath), {
        status: 'paused',
        endTime: null,
        durationSec: timerData.durationSec || duration,
        remainingAtPause: remainingSec,
        updatedBy: userName || '운영자',
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error('[MatchTimer] 일시정지 실패:', e);
    }
  };

  // ── 운영자 액션: 리셋 ──
  const handleReset = async () => {
    if (!canControl || !timerPath) return;
    try {
      // 노드 삭제 → 모두 idle 상태로 인식
      await remove(ref(db, timerPath));
      alarmedEndTimeRef.current = 0;
    } catch (e) {
      console.error('[MatchTimer] 리셋 실패:', e);
    }
  };

  const handleToggle = () => {
    if (!canControl) return;
    const status = timerData?.status;
    if (status === 'running') return handlePause();
    return handleStart();
  };

  // ── 시간 설정 ──
  const setMinutes = async (m) => {
    if (!canControl) {
      // 운영자가 아닌 경우 로컬에만 저장 (다음에 운영자 되면 사용)
      setDuration(m * 60);
      localStorage.setItem('matchTimerDuration', String(m));
      setSettingsOpen(false);
      return;
    }
    setDuration(m * 60);
    localStorage.setItem('matchTimerDuration', String(m));
    setSettingsOpen(false);
    // 현재 idle/finished 상태면 동기화에도 반영
    if (!timerData || timerData.status === 'idle' || timerData.status === 'finished') {
      try {
        await remove(ref(db, timerPath));
      } catch (e) {}
    }
  };

  // ── 표시할 남은 시간 계산 ──
  let remaining;
  let displayStatus; // 'idle' | 'running' | 'paused' | 'finished'
  if (!timerData) {
    remaining = duration;
    displayStatus = 'idle';
  } else if (timerData.status === 'running') {
    remaining = Math.max(0, Math.round((timerData.endTime - now) / 1000));
    displayStatus = remaining === 0 ? 'finished' : 'running';
  } else if (timerData.status === 'paused') {
    remaining = timerData.remainingAtPause ?? 0;  // 🆕 ?? 사용 (0도 정확히 0으로)
    displayStatus = 'paused';
  } else if (timerData.status === 'finished') {
    remaining = 0;
    displayStatus = 'finished';
  } else {
    remaining = timerData.durationSec || duration;
    displayStatus = 'idle';
  }

  const displayDuration = timerData?.durationSec || duration;
  const isLowTime = displayStatus === 'running' && remaining > 0 && remaining <= 30;
  const isCritical = displayStatus === 'running' && remaining > 0 && remaining <= 10;

  // 색상
  const timeColor =
    displayStatus === 'finished' ? '#C62828' :
    isCritical ? '#C62828' :
    isLowTime ? '#E65100' :
    displayStatus === 'running' ? '#2E7D32' :
    displayStatus === 'paused' ? '#F57C00' :
    '#37474F';
  const bgColor =
    displayStatus === 'finished' ? '#FFEBEE' :
    isCritical ? '#FFEBEE' :
    isLowTime ? '#FFF3E0' :
    displayStatus === 'running' ? '#E8F5E9' :
    displayStatus === 'paused' ? '#FFF3E0' :
    '#F5F7FA';
  const borderColor =
    displayStatus === 'finished' ? '#C62828' :
    isCritical ? '#C62828' :
    isLowTime ? '#E65100' :
    displayStatus === 'running' ? '#2E7D32' :
    displayStatus === 'paused' ? '#F57C00' :
    '#CFD8DC';

  const progress = displayDuration > 0 ? Math.max(0, Math.min(1, remaining / displayDuration)) : 0;

  // 상태 라벨
  const statusLabel = (() => {
    if (displayStatus === 'finished') return '⏰ 시간 종료';
    if (displayStatus === 'running') return '⏱ 진행 중';
    if (displayStatus === 'paused') return '⏸ 일시정지';
    return `타이머 ${Math.floor(displayDuration / 60)}분`;
  })();

  return (
    <>
      <Box
        sx={{
          bgcolor: bgColor,
          borderRadius: 3,
          border: `2px solid ${borderColor}`,
          boxShadow: displayStatus === 'running' ? `0 4px 14px ${borderColor}33` : '0 1px 3px rgba(0,0,0,0.05)',
          p: 1.5,
          mb: 2,
          transition: 'background-color 0.3s, border-color 0.3s',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 진행률 막대 */}
        <Box sx={{
          position: 'absolute', left: 0, bottom: 0,
          height: 3, width: `${progress * 100}%`,
          bgcolor: borderColor, transition: 'width 0.25s linear',
          opacity: 0.5,
        }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* 클릭 영역 */}
          <Box
            onClick={canControl ? handleToggle : undefined}
            sx={{
              flex: 1,
              cursor: canControl ? 'pointer' : 'default',
              userSelect: 'none',
              display: 'flex', alignItems: 'center', gap: 1.2,
              py: 0.5, borderRadius: 2,
              opacity: canControl ? 1 : 0.95,
              '&:active': canControl ? { transform: 'scale(0.98)' } : {},
              transition: 'transform 0.1s',
            }}
          >
            {/* 큰 원형 버튼 */}
            <Box sx={{
              width: 44, height: 44, borderRadius: '50%',
              bgcolor: timeColor, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 2px 6px ${timeColor}66`,
              flexShrink: 0,
              animation: displayStatus === 'finished' ? 'matchTimerBlink 0.6s infinite alternate' : 'none',
              '@keyframes matchTimerBlink': {
                '0%': { opacity: 1 }, '100%': { opacity: 0.4 },
              },
            }}>
              {!canControl ? <LockIcon sx={{ fontSize: 22 }} /> :
                displayStatus === 'finished' ? <AlarmIcon sx={{ fontSize: 26 }} /> :
                displayStatus === 'running' ? <PauseIcon sx={{ fontSize: 26 }} /> :
                <PlayArrowIcon sx={{ fontSize: 28 }} />}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{
                fontSize: '0.7rem', fontWeight: 700, color: timeColor,
                letterSpacing: '0.08em', mb: -0.3,
              }}>
                {statusLabel}
              </Typography>
              <Typography sx={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '2rem', fontWeight: 900, color: timeColor,
                lineHeight: 1.1, letterSpacing: '-0.02em',
                animation: isCritical ? 'matchTimerPulse 0.5s infinite alternate' : 'none',
                '@keyframes matchTimerPulse': {
                  '0%': { transform: 'scale(1)' }, '100%': { transform: 'scale(1.06)' },
                },
              }}>
                {formatTime(remaining)}
              </Typography>
              {/* 누가 마지막으로 조작했는지 (동기화 표시) */}
              {timerData?.updatedBy && (displayStatus === 'running' || displayStatus === 'paused') && (
                <Typography sx={{ fontSize: '0.65rem', color: '#777', mt: 0.2 }}>
                  🔄 {timerData.updatedBy} 운영
                </Typography>
              )}
            </Box>
          </Box>

          {/* 우측 컨트롤 */}
          <Stack direction="column" spacing={0.5}>
            <IconButton
              size="small"
              onClick={handleReset}
              disabled={!canControl || (!timerData && remaining === duration)}
              sx={{
                bgcolor: 'white', border: `1px solid ${borderColor}66`,
                '&:hover': { bgcolor: '#FAFAFA' },
                '&.Mui-disabled': { bgcolor: '#F5F5F5', opacity: 0.5 },
              }}
              title={canControl ? '리셋' : '운영자만 조작 가능'}
            >
              <RestartAltIcon sx={{ fontSize: 18, color: '#546E7A' }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{
                bgcolor: 'white', border: `1px solid ${borderColor}66`,
                '&:hover': { bgcolor: '#FAFAFA' },
              }}
              title="시간 설정"
            >
              <SettingsIcon sx={{ fontSize: 18, color: '#546E7A' }} />
            </IconButton>
          </Stack>
        </Box>

        {/* 회원 알림 (조작 불가) */}
        {!canControl && (
          <Typography sx={{
            fontSize: '0.65rem', color: '#999', textAlign: 'center', mt: 0.6, fontWeight: 600,
          }}>
            🔒 운영자가 시작/일시정지를 조작합니다 (실시간 동기화)
          </Typography>
        )}
      </Box>

      {/* 시간 설정 다이얼로그 */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.05rem', pb: 1 }}>
          ⏱ 경기 시간 설정
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: '#666', mb: 2 }}>
            한 경기 당 시간을 선택해 주세요.
            {canControl ? ' 변경하면 모든 회원에게 동기화됩니다.' : ' (운영자만 변경 가능)'}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {DURATION_PRESETS.map(m => (
              <Button
                key={m}
                onClick={() => setMinutes(m)}
                disabled={!canControl}
                variant={duration === m * 60 ? 'contained' : 'outlined'}
                sx={{
                  borderRadius: 99, fontWeight: 800, px: 2.5,
                  bgcolor: duration === m * 60 ? '#1565C0' : 'transparent',
                  '&:hover': { bgcolor: duration === m * 60 ? '#0D47A1' : '#E3F2FD' },
                }}
              >
                {m}분
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

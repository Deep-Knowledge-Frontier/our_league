import React, { useState, useEffect } from 'react';
import {
  Dialog, Box, Typography, IconButton, Button, Alert, Stack,
  Checkbox, FormControlLabel, TextField, CircularProgress, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { ref, get, update } from 'firebase/database';
import { signOut, reauthenticateWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from '../config/firebase';

/**
 * 회원 탈퇴 다이얼로그 — Soft Delete 방식
 *
 * 동작:
 *   1. 안전 체크: 마지막 관리자인지, 진행 중인 드래프트에 주장인지
 *   2. 2단계 확인 (체크박스 + 텍스트 입력)
 *   3. Google 재인증 (Firebase 요구사항)
 *   4. Users/{emailKey}에 deleted=true + 개인정보 익명화
 *   5. 로그아웃 + 로그인 화면 리다이렉트
 *
 * 유지되는 것: 과거 경기 기록, 통계 (이름 참조)
 * 제거되는 것: 이름(→"탈퇴한 사용자"), 생년, 키/몸무게, 포지션, 실력
 */
export default function AccountDeleteDialog({ open, onClose, emailKey, userName, clubName, onDeleted }) {
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]); // 탈퇴 블로커
  const [agree1, setAgree1] = useState(false);
  const [agree2, setAgree2] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // 안전 체크: 열릴 때마다 실행
  useEffect(() => {
    if (!open) return;
    setError(null);
    setAgree1(false);
    setAgree2(false);
    setConfirmText('');
    setWarnings([]);
    runSafetyCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runSafetyCheck = async () => {
    if (!emailKey || !clubName) return;
    setChecking(true);
    const blockers = [];
    try {
      // 1. 마지막 관리자 체크
      const adminSnap = await get(ref(db, 'AllowedUsers/admin'));
      if (adminSnap.exists()) {
        const admins = adminSnap.val() || {};
        const adminKeys = Object.keys(admins);
        if (adminKeys.includes(emailKey) && adminKeys.length === 1) {
          blockers.push({
            severity: 'error',
            msg: '현재 유일한 관리자입니다. 다른 관리자를 지정한 후 탈퇴해주세요.',
          });
        }
      }

      // 2. 진행 중인 드래프트에 주장인지 체크 (모든 경기일 Draft 검사)
      const draftsSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}`));
      if (draftsSnap.exists()) {
        const dates = draftsSnap.val() || {};
        const activeDraftDates = [];
        Object.entries(dates).forEach(([dateKey, dateData]) => {
          const draft = dateData?.Draft;
          if (!draft) return;
          if (draft.status !== 'active' && draft.status !== 'review') return;
          const captains = draft.captains || {};
          if (Object.values(captains).includes(userName)) {
            activeDraftDates.push(dateKey);
          }
        });
        if (activeDraftDates.length > 0) {
          blockers.push({
            severity: 'error',
            msg: `진행 중인 드래프트에 주장으로 참여 중입니다. (${activeDraftDates.join(', ')}) 드래프트 완료 후 탈퇴해주세요.`,
          });
        }
      }
    } catch (e) {
      console.error('안전 체크 실패:', e);
      blockers.push({
        severity: 'warning',
        msg: `안전 체크 중 오류: ${e.message}`,
      });
    } finally {
      setWarnings(blockers);
      setChecking(false);
    }
  };

  const canProceed =
    warnings.filter((w) => w.severity === 'error').length === 0 &&
    agree1 &&
    agree2 &&
    confirmText === '탈퇴';

  const handleDelete = async () => {
    if (!canProceed) return;
    setDeleting(true);
    setError(null);
    try {
      // 1. Firebase Auth 재인증 (최근 로그인 요구사항)
      try {
        await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
      } catch (e) {
        // 재인증 실패해도 DB soft delete는 진행 가능. Auth 삭제는 안 함.
        console.warn('재인증 실패(무시하고 진행):', e.message);
      }

      // 2. Users/{emailKey} soft delete + 개인정보 익명화
      const updates = {
        name: '탈퇴한 사용자',
        deleted: true,
        deletedAt: Date.now(),
        // 개인정보 제거
        birthYear: null,
        height: null,
        weight: null,
        position: null,
        skill: null,
        consentGiven: null,
        // 이메일, club은 데이터 무결성을 위해 유지 (leaks 식별자는 남음)
      };
      await update(ref(db, `Users/${emailKey}`), updates);

      // 3. AllowedUsers에서 권한 제거 (관리자/중재자 이력도 삭제)
      await update(ref(db, 'AllowedUsers'), {
        [`admin/${emailKey}`]: null,
        [`moderator/${emailKey}`]: null,
      });

      // 4. 로그아웃
      await signOut(auth);

      if (onDeleted) onDeleted();
      // 로그인 페이지로 이동은 상위 컴포넌트에서 처리
      onClose();
      window.location.href = '/'; // 확실하게 새로고침
    } catch (e) {
      console.error('탈퇴 처리 실패:', e);
      setError(`탈퇴 실패: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const hasErrors = warnings.some((w) => w.severity === 'error');

  return (
    <Dialog
      open={open}
      onClose={deleting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      {/* 헤더 */}
      <Box sx={{
        background: 'linear-gradient(135deg, #C62828 0%, #8E0000 100%)',
        color: 'white', px: 2.5, py: 2,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <WarningAmberIcon sx={{ fontSize: 26 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', flex: 1 }}>
          회원 탈퇴
        </Typography>
        <IconButton size="small" onClick={onClose} disabled={deleting} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#333' }}>
            정말 탈퇴하시겠습니까?
          </Typography>

          {/* 탈퇴 정책 설명 */}
          <Box sx={{
            p: 1.5, borderRadius: 2,
            bgcolor: '#FFF8E1', border: '1px solid #FFE082',
          }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#E65100', mb: 0.8 }}>
              ⚠ 탈퇴 시 이렇게 처리됩니다
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#666', lineHeight: 1.7 }}>
              • 개인정보 <b>즉시 제거</b>: 이름(→&quot;탈퇴한 사용자&quot;), 생년, 키/몸무게, 포지션, 실력<br/>
              • 과거 경기 기록(골, 어시스트 등 통계)은 <b>익명으로 유지</b><br/>
              • 관리자/중재자 권한 <b>즉시 회수</b><br/>
              • 재가입은 동일 이메일로 언제든 가능
            </Typography>
          </Box>

          {/* 안전 체크 경고 */}
          {checking && (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <CircularProgress size={20} />
              <Typography sx={{ fontSize: '0.78rem', color: '#666', mt: 0.5 }}>
                탈퇴 가능 여부 확인 중...
              </Typography>
            </Box>
          )}
          {!checking && warnings.length > 0 && warnings.map((w, i) => (
            <Alert key={i} severity={w.severity} sx={{ fontSize: '0.78rem' }}>
              {w.msg}
            </Alert>
          ))}

          {error && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{error}</Alert>}

          {/* 탈퇴 가능한 경우만 확인 UI 표시 */}
          {!hasErrors && !checking && (
            <>
              <Divider />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={agree1}
                    onChange={(e) => setAgree1(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography sx={{ fontSize: '0.78rem' }}>
                    개인정보가 즉시 제거됨을 이해합니다
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={agree2}
                    onChange={(e) => setAgree2(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography sx={{ fontSize: '0.78rem' }}>
                    과거 경기 기록은 익명으로 유지됨을 이해합니다
                  </Typography>
                }
              />

              <TextField
                fullWidth
                size="small"
                label={<Typography sx={{ fontSize: '0.8rem' }}>확인을 위해 <b>탈퇴</b>를 입력하세요</Typography>}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="탈퇴"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </>
          )}

          {/* 액션 */}
          <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
            <Button
              fullWidth variant="outlined"
              onClick={onClose}
              disabled={deleting}
              sx={{ borderRadius: 2 }}
            >
              취소
            </Button>
            <Button
              fullWidth variant="contained"
              color="error"
              startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />}
              onClick={handleDelete}
              disabled={!canProceed || deleting}
              sx={{
                borderRadius: 2, fontWeight: 800,
                '&:not(:disabled)': {
                  background: 'linear-gradient(135deg, #C62828, #8E0000)',
                },
              }}
            >
              {deleting ? '처리 중...' : '탈퇴'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Dialog>
  );
}

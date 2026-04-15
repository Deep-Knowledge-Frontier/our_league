import React, { useState, useEffect } from 'react';
import {
  Dialog, Box, Typography, IconButton, TextField, Button, Chip,
  Stack, Alert, CircularProgress, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import PersonIcon from '@mui/icons-material/Person';
import CakeIcon from '@mui/icons-material/Cake';
import HeightIcon from '@mui/icons-material/Height';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import { ref, get, update } from 'firebase/database';
import { db } from '../config/firebase';
import PositionAvatar from './PositionAvatar';

const POSITIONS = [
  { value: 'GK', emoji: '🧤', label: 'GK', desc: '골키퍼', color: '#F9A825' },
  { value: 'DF', emoji: '🛡️', label: 'DF', desc: '수비수', color: '#1565C0' },
  { value: 'DM', emoji: '⚓', label: 'DM', desc: '수비형 미드', color: '#00838F' },
  { value: 'MF', emoji: '⚙️', label: 'MF', desc: '미드필더', color: '#2E7D32' },
  { value: 'AM', emoji: '🎯', label: 'AM', desc: '공격형 미드', color: '#EF6C00' },
  { value: 'FW', emoji: '⚡', label: 'FW', desc: '공격수', color: '#C62828' },
];

const SKILLS = [
  { value: '상', label: '상', color: '#D32F2F', desc: '프로급', width: '100%' },
  { value: '상-중', label: '상중', color: '#E65100', desc: '상급', width: '83%' },
  { value: '중', label: '중', color: '#F57C00', desc: '평균', width: '66%' },
  { value: '중-하', label: '중하', color: '#1976D2', desc: '중하급', width: '50%' },
  { value: '하', label: '하', color: '#42A5F5', desc: '초보', width: '33%' },
  { value: '하하', label: '하하', color: '#90CAF9', desc: '입문', width: '16%' },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function ProfileEditDialog({ open, onClose, emailKey, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '', birthYear: '', height: '', weight: '',
    position: '', subPosition: '', jerseyNumber: '',
    skill: '', club: '',
  });

  useEffect(() => {
    if (!open || !emailKey) return;
    setLoading(true);
    setError(null);
    get(ref(db, `Users/${emailKey}`))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.val();
          setForm({
            name: d.name || '', birthYear: d.birthYear || '',
            height: d.height || '', weight: d.weight || '',
            position: d.position || '',
            subPosition: d.subPosition || '',
            jerseyNumber: d.jerseyNumber != null ? String(d.jerseyNumber) : '',
            skill: d.skill || '', club: d.club || '',
          });
        }
      })
      .catch((e) => setError(`불러오기 실패: ${e.message}`))
      .finally(() => setLoading(false));
  }, [open, emailKey]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!emailKey) return;
    if (!form.name.trim()) { setError('이름은 필수입니다.'); return; }
    setSaving(true);
    setError(null);
    try {
      const jerseyNum = form.jerseyNumber === '' ? null : Number(form.jerseyNumber);
      if (jerseyNum !== null && (Number.isNaN(jerseyNum) || jerseyNum < 0 || jerseyNum > 99)) {
        setError('등번호는 0~99 사이여야 합니다.');
        setSaving(false);
        return;
      }
      const payload = {
        name: form.name.trim(),
        birthYear: form.birthYear,
        height: form.height === '' ? null : Number(form.height),
        weight: form.weight === '' ? null : Number(form.weight),
        position: form.position,
        subPosition: form.subPosition || '',
        jerseyNumber: jerseyNum,
        skill: form.skill,
        club: form.club,
        updatedAt: Date.now(),
      };
      await update(ref(db, `Users/${emailKey}`), payload);

      // registeredPlayers에도 반영 — 이름이 일치하는 엔트리를 찾아 업데이트
      if (form.club) {
        try {
          const regSnap = await get(ref(db, `registeredPlayers/${form.club}`));
          if (regSnap.exists()) {
            const regData = regSnap.val() || {};
            const matchedKey = Object.entries(regData)
              .find(([, v]) => v && v.name === form.name.trim())?.[0];
            if (matchedKey) {
              await update(ref(db, `registeredPlayers/${form.club}/${matchedKey}`), {
                position: form.position || '',
                subPosition: form.subPosition || '',
                jerseyNumber: jerseyNum,
              });
            }
          }
        } catch (regErr) {
          // registeredPlayers 업데이트 실패는 치명적이지 않음
          console.error('registeredPlayers 동기화 실패:', regErr);
        }
      }

      if (onSaved) onSaved(payload);
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedSkill = SKILLS.find((s) => s.value === form.skill);

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '92vh' } }}
    >
      {/* 헤더 + 아바타 미리보기 */}
      <Box sx={{
        background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
        color: 'white', px: 2.5, pt: 2, pb: 2.5,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <EditIcon sx={{ fontSize: 22 }} />
          <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', flex: 1 }}>
            개인정보 수정
          </Typography>
          <IconButton size="small" onClick={onClose} disabled={saving} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>
        {/* 미리보기 */}
        {!loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PositionAvatar position={form.position} size={48} showLabel />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                {form.jerseyNumber && (
                  <Box sx={{
                    bgcolor: 'rgba(255,255,255,0.2)',
                    color: 'white',
                    fontWeight: 900, fontSize: '0.82rem',
                    px: 0.8, py: 0.2, borderRadius: 0.8,
                    minWidth: 28, textAlign: 'center',
                  }}>
                    #{form.jerseyNumber}
                  </Box>
                )}
                <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.2 }}>
                  {form.name || '이름'}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                {form.club || '클럽'} · {form.position || '포지션'}
                {form.subPosition ? `/${form.subPosition}` : ''}
                {' · '}{form.skill || '실력'}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

            {/* ── 기본 정보 ── */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.2 }}>
                <PersonIcon sx={{ fontSize: 18, color: '#1565C0' }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#1565C0', letterSpacing: 0.3 }}>
                  기본 정보
                </Typography>
              </Box>
              <TextField
                label="이름 *"
                size="small"
                fullWidth
                value={form.name}
                onChange={handleChange('name')}
                sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Stack direction="row" spacing={1.2}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <CakeIcon sx={{ fontSize: 14, color: '#888' }} />
                    <Typography sx={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>생년</Typography>
                  </Box>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    placeholder="1990"
                    value={form.birthYear}
                    onChange={handleChange('birthYear')}
                    inputProps={{ min: 1950, max: CURRENT_YEAR }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <HeightIcon sx={{ fontSize: 14, color: '#888' }} />
                    <Typography sx={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>키 (cm)</Typography>
                  </Box>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    placeholder="175"
                    value={form.height}
                    onChange={handleChange('height')}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <FitnessCenterIcon sx={{ fontSize: 14, color: '#888' }} />
                    <Typography sx={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>몸무게</Typography>
                  </Box>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    placeholder="75"
                    value={form.weight}
                    onChange={handleChange('weight')}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
              </Stack>
            </Box>

            <Divider />

            {/* ── 포지션 (1순위 + 2순위) + 등번호 ── */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                <SportsSoccerIcon sx={{ fontSize: 18, color: '#2E7D32' }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#2E7D32', letterSpacing: 0.3 }}>
                  포지션 & 등번호
                </Typography>
              </Box>

              {/* 1순위 포지션 */}
              <Typography sx={{ fontSize: '0.72rem', color: '#666', fontWeight: 700, mb: 0.6 }}>
                1순위 포지션 (주요)
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 1.5 }}>
                {POSITIONS.map((p) => {
                  const active = form.position === p.value;
                  return (
                    <Chip
                      key={p.value}
                      label={`${p.emoji} ${p.label}`}
                      onClick={() => {
                        if (active) {
                          setField('position', '');
                          setField('subPosition', '');
                        } else {
                          setField('position', p.value);
                          // 1순위 = 2순위가 되면 2순위 초기화
                          if (form.subPosition === p.value) setField('subPosition', '');
                        }
                      }}
                      sx={{
                        fontWeight: active ? 900 : 600,
                        fontSize: '0.82rem',
                        height: 34,
                        bgcolor: active ? p.color : '#F5F5F5',
                        color: active ? 'white' : '#333',
                        border: active ? `2px solid ${p.color}` : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        transform: active ? 'scale(1.05)' : 'scale(1)',
                        boxShadow: active ? `0 3px 8px ${p.color}55` : 'none',
                        '&:hover': { bgcolor: active ? p.color : '#E0E0E0' },
                      }}
                    />
                  );
                })}
              </Box>

              {/* 2순위 포지션 */}
              <Typography sx={{ fontSize: '0.72rem', color: '#666', fontWeight: 700, mb: 0.6 }}>
                2순위 포지션 <Typography component="span" sx={{ fontSize: '0.65rem', color: '#999' }}>(선택)</Typography>
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 1.5 }}>
                {POSITIONS.filter((p) => p.value !== form.position).map((p) => {
                  const active = form.subPosition === p.value;
                  return (
                    <Chip
                      key={p.value}
                      label={`${p.emoji} ${p.label}`}
                      onClick={() => setField('subPosition', active ? '' : p.value)}
                      sx={{
                        fontWeight: active ? 900 : 600,
                        fontSize: '0.78rem',
                        height: 30,
                        bgcolor: active ? '#7E57C2' : '#F5F5F5',
                        color: active ? 'white' : '#555',
                        border: active ? '2px solid #7E57C2' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        boxShadow: active ? '0 3px 8px rgba(126,87,194,0.4)' : 'none',
                        '&:hover': { bgcolor: active ? '#7E57C2' : '#E0E0E0' },
                      }}
                    />
                  );
                })}
              </Box>

              {/* 등번호 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.72rem', color: '#666', fontWeight: 700, minWidth: 60 }}>
                  등번호
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  placeholder="0~99"
                  value={form.jerseyNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') { setField('jerseyNumber', ''); return; }
                    const n = parseInt(v, 10);
                    if (Number.isNaN(n) || n < 0 || n > 99) return;
                    setField('jerseyNumber', String(n));
                  }}
                  inputProps={{ min: 0, max: 99 }}
                  sx={{
                    width: 100,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      fontWeight: 800,
                      '& input': { textAlign: 'center', fontSize: '1rem' },
                    },
                  }}
                />
                {form.jerseyNumber && (
                  <Box sx={{
                    bgcolor: '#1565C0', color: 'white',
                    fontWeight: 900, fontSize: '0.95rem',
                    px: 1, py: 0.3, borderRadius: 1,
                    minWidth: 34, textAlign: 'center',
                  }}>
                    #{form.jerseyNumber}
                  </Box>
                )}
              </Box>
            </Box>

            <Divider />

            {/* ── 실력 ── */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                <BarChartIcon sx={{ fontSize: 18, color: '#F57C00' }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#F57C00', letterSpacing: 0.3 }}>
                  실력
                </Typography>
                {selectedSkill && (
                  <Typography sx={{ fontSize: '0.68rem', color: '#999', ml: 'auto' }}>
                    {selectedSkill.desc}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {SKILLS.map((s) => {
                  const active = form.skill === s.value;
                  return (
                    <Box
                      key={s.value}
                      onClick={() => setField('skill', active ? '' : s.value)}
                      sx={{
                        flex: 1, py: 0.8, textAlign: 'center',
                        borderRadius: 1.5, cursor: 'pointer',
                        bgcolor: active ? s.color : '#F5F5F5',
                        color: active ? 'white' : '#666',
                        fontWeight: active ? 900 : 600,
                        fontSize: '0.72rem',
                        border: active ? `2px solid ${s.color}` : '1px solid transparent',
                        transition: 'all 0.15s',
                        transform: active ? 'scale(1.08)' : 'scale(1)',
                        boxShadow: active ? `0 3px 8px ${s.color}55` : 'none',
                        '&:hover': { bgcolor: active ? s.color : '#E0E0E0' },
                      }}
                    >
                      {s.label}
                    </Box>
                  );
                })}
              </Box>
              {/* 시각적 바 */}
              {selectedSkill && (
                <Box sx={{ mt: 0.8, height: 4, borderRadius: 2, bgcolor: '#E0E0E0', overflow: 'hidden' }}>
                  <Box sx={{
                    width: selectedSkill.width,
                    height: '100%',
                    borderRadius: 2,
                    bgcolor: selectedSkill.color,
                    transition: 'width 0.3s ease',
                  }} />
                </Box>
              )}
            </Box>

            <Divider />

            {/* ── 클럽 ── */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.8 }}>
                <GroupsIcon sx={{ fontSize: 18, color: '#7B1FA2' }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#7B1FA2', letterSpacing: 0.3 }}>
                  클럽
                </Typography>
              </Box>
              <TextField
                size="small"
                fullWidth
                value={form.club}
                onChange={handleChange('club')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Typography sx={{ fontSize: '0.68rem', color: '#999', mt: 0.5, pl: 0.5 }}>
                ⚠ 클럽 변경 시 기존 경기 기록은 이전 클럽에 남습니다
              </Typography>
            </Box>

            {/* 액션 */}
            <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
              <Button
                fullWidth variant="outlined"
                onClick={onClose}
                disabled={saving}
                sx={{ borderRadius: 2, color: '#666', borderColor: '#ccc' }}
              >
                취소
              </Button>
              <Button
                fullWidth variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
                sx={{
                  borderRadius: 2, fontWeight: 800,
                  background: 'linear-gradient(135deg, #2D336B, #1A1D4E)',
                  '&:hover': { background: 'linear-gradient(135deg, #1A1D4E, #0D1030)' },
                }}
              >
                {saving ? '저장 중...' : '저장'}
              </Button>
            </Box>
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Dialog, Box, Typography, IconButton, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Stack, Alert, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { ref, get, update } from 'firebase/database';
import { db } from '../config/firebase';

const POSITIONS = [
  { value: 'GK', label: 'GK (골키퍼)' },
  { value: 'DF', label: 'DF (수비수)' },
  { value: 'DM', label: 'DM (수비형 미드)' },
  { value: 'MF', label: 'MF (미드필더)' },
  { value: 'AM', label: 'AM (공격형 미드)' },
  { value: 'FW', label: 'FW (공격수)' },
];

const SKILLS = ['상', '상-중', '중', '중-하', '하', '하하'];

// 생년 선택 옵션 (1950~현재)
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: CURRENT_YEAR - 1950 + 1 }, (_, i) => String(CURRENT_YEAR - i));

export default function ProfileEditDialog({ open, onClose, emailKey, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '',
    birthYear: '',
    height: '',
    weight: '',
    position: '',
    skill: '',
    club: '',
  });

  // 열릴 때마다 현재 DB 값 로드
  useEffect(() => {
    if (!open || !emailKey) return;
    setLoading(true);
    setError(null);
    get(ref(db, `Users/${emailKey}`))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.val();
          setForm({
            name: d.name || '',
            birthYear: d.birthYear || '',
            height: d.height || '',
            weight: d.weight || '',
            position: d.position || '',
            skill: d.skill || '',
            club: d.club || '',
          });
        }
      })
      .catch((e) => setError(`불러오기 실패: ${e.message}`))
      .finally(() => setLoading(false));
  }, [open, emailKey]);

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSave = async () => {
    if (!emailKey) return;
    if (!form.name.trim()) {
      setError('이름은 필수입니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // 숫자 필드는 Number로 저장 (기존 타입 유지)
      const payload = {
        name: form.name.trim(),
        birthYear: form.birthYear,
        height: form.height === '' ? null : Number(form.height),
        weight: form.weight === '' ? null : Number(form.weight),
        position: form.position,
        skill: form.skill,
        club: form.club,
        updatedAt: Date.now(),
      };
      await update(ref(db, `Users/${emailKey}`), payload);
      // 부모에 저장 완료 알림 (데이터 리프레시용)
      if (onSaved) onSaved(payload);
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      {/* 헤더 */}
      <Box sx={{
        background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
        color: 'white', px: 2.5, py: 2,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <EditIcon sx={{ fontSize: 24 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', flex: 1 }}>
          개인정보 수정
        </Typography>
        <IconButton size="small" onClick={onClose} disabled={saving} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2.5 }}>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={1.8}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="이름 *"
              size="small"
              fullWidth
              value={form.name}
              onChange={handleChange('name')}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <FormControl size="small" fullWidth>
              <InputLabel>생년</InputLabel>
              <Select
                label="생년"
                value={form.birthYear}
                onChange={handleChange('birthYear')}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">선택 안 함</MenuItem>
                {BIRTH_YEARS.map((y) => (
                  <MenuItem key={y} value={y}>{y}년</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={1.5}>
              <TextField
                label="키 (cm)"
                size="small"
                type="number"
                value={form.height}
                onChange={handleChange('height')}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="몸무게 (kg)"
                size="small"
                type="number"
                value={form.weight}
                onChange={handleChange('weight')}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Stack>

            <FormControl size="small" fullWidth>
              <InputLabel>포지션</InputLabel>
              <Select
                label="포지션"
                value={form.position}
                onChange={handleChange('position')}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">선택 안 함</MenuItem>
                {POSITIONS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>실력</InputLabel>
              <Select
                label="실력"
                value={form.skill}
                onChange={handleChange('skill')}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">선택 안 함</MenuItem>
                {SKILLS.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="클럽"
              size="small"
              fullWidth
              value={form.club}
              onChange={handleChange('club')}
              helperText="⚠ 클럽 변경 시 기존 경기 기록은 이전 클럽에 남습니다"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* 액션 */}
            <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
              <Button
                fullWidth variant="outlined"
                onClick={onClose}
                disabled={saving}
                sx={{ borderRadius: 2 }}
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
                  background: 'linear-gradient(135deg, #1565C0, #0D47A1)',
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

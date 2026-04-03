import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get } from 'firebase/database';
import {
  Container, TextField, Button, Typography, Checkbox,
  FormControlLabel, Select, MenuItem, FormControl, InputLabel, Box,
  CircularProgress
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/app.config';

function RegisterPage() {
  const navigate = useNavigate();
  const { user, emailKey } = useAuth();

  const [clubList, setClubList] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    height: '',
    weight: '',
    birthYear: '',
    position: '',
    skill: '',
    club: '',
    consentGiven: false,
  });

  // DB에서 등록된 팀 목록 로드
  useEffect(() => {
    get(ref(db, 'clubs')).then(snap => {
      if (snap.exists()) {
        const clubs = Object.values(snap.val()).map(c => c.name).filter(Boolean).sort();
        setClubList(clubs);
        if (clubs.length === 1) {
          setFormData(prev => ({ ...prev, club: clubs[0] }));
        }
      }
      setLoadingClubs(false);
    }).catch(() => setLoadingClubs(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleRegister = async () => {
    if (!formData.consentGiven) { alert('개인정보 수집 및 이용에 동의해주세요.'); return; }
    if (!formData.name || !formData.birthYear || !formData.club) { alert('모든 필수 항목을 입력해주세요.'); return; }
    if (!user || !emailKey) { alert('로그인 정보가 없습니다.'); navigate('/'); return; }

    try {
      await set(ref(db, `Users/${emailKey}`), {
        name: formData.name,
        height: parseFloat(formData.height) || 0,
        weight: parseFloat(formData.weight) || 0,
        birthYear: formData.birthYear,
        position: formData.position,
        skill: formData.skill,
        club: formData.club,
        consentGiven: true,
      });
      alert('등록 완료!');
      navigate('/home');
    } catch (error) {
      console.error('등록 실패:', error);
      alert('등록 실패: ' + error.message);
    }
  };

  const years = [];
  for (let i = 2010; i >= 1970; i--) years.push(i.toString());

  return (
    <Container maxWidth="sm" sx={{ mt: '30px', backgroundColor: '#fff', p: '20px', borderRadius: '10px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button onClick={() => navigate('/')} sx={{ minWidth: 'auto', color: '#1976D2' }}>
          <ArrowBackIcon />
        </Button>
        <Typography variant="h4" sx={{ color: '#1976D2', fontWeight: 'bold', textAlign: 'center', flex: 1, mr: '40px' }}>
          회원 등록
        </Typography>
      </Box>

      <Box component="form" noValidate autoComplete="off">
        <FormControl fullWidth margin="normal">
          <InputLabel>클럽</InputLabel>
          {loadingClubs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
          ) : (
            <Select name="club" value={formData.club} label="클럽" onChange={handleChange}>
              {clubList.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          )}
        </FormControl>

        <Box display="flex" gap={2}>
          <TextField label="이름" name="name" fullWidth margin="normal" onChange={handleChange} />
          <TextField label="키(cm)" name="height" type="number" fullWidth margin="normal" onChange={handleChange} />
          <TextField label="체중(kg)" name="weight" type="number" fullWidth margin="normal" onChange={handleChange} />
        </Box>

        <Box display="flex" gap={2} mt={2}>
          <FormControl fullWidth>
            <InputLabel>출생연도</InputLabel>
            <Select name="birthYear" value={formData.birthYear} label="출생연도" onChange={handleChange}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>포지션</InputLabel>
            <Select name="position" value={formData.position} label="포지션" onChange={handleChange}>
              {APP_CONFIG.positions.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>실력</InputLabel>
            <Select name="skill" value={formData.skill} label="실력" onChange={handleChange}>
              {APP_CONFIG.skillLevels.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        <Box mt={3} mb={2}>
          <FormControlLabel
            control={<Checkbox name="consentGiven" checked={formData.consentGiven} onChange={handleChange} />}
            label="개인정보 수집 및 이용에 동의합니다."
          />
        </Box>

        <Button
          variant="contained" fullWidth size="large"
          sx={{ backgroundColor: '#1976D2', padding: '12px', fontSize: '16px' }}
          onClick={handleRegister}
        >
          등록
        </Button>
      </Box>
    </Container>
  );
}

export default RegisterPage;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get, push } from 'firebase/database';
import {
  Container, TextField, Button, Typography, Checkbox,
  FormControlLabel, Select, MenuItem, FormControl, InputLabel, Box,
  CircularProgress, Card, CardContent, Collapse, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import GroupsIcon from '@mui/icons-material/Groups';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/app.config';

function RegisterPage() {
  const navigate = useNavigate();
  const { user, emailKey } = useAuth();

  const [clubList, setClubList] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [newClub, setNewClub] = useState({ name: '', type: 'futsal', region: '' });
  const [creatingClub, setCreatingClub] = useState(false);

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

  const handleCreateClub = async () => {
    const name = newClub.name.trim();
    if (!name) { alert('클럽 이름을 입력해주세요.'); return; }
    if (clubList.includes(name)) { alert('이미 등록된 클럽입니다.'); return; }
    if (!user) { alert('로그인 정보가 없습니다.'); return; }
    setCreatingClub(true);
    try {
      // 승인 대기 요청으로 저장 (마스터 관리자가 승인해야 실제 생성)
      const requestKey = name.replace(/[.#$\/\[\]]/g, '_');
      await set(ref(db, `ClubRequests/${requestKey}`), {
        name,
        type: newClub.type,
        region: newClub.region || '',
        requestedAt: new Date().toISOString().slice(0, 10),
        requestedBy: user.email,
        requestedByName: user.displayName || '',
        status: 'pending',
      });
      setNewClub({ name: '', type: 'futsal', region: '' });
      setCreateClubOpen(false);
      alert('클럽 생성 신청이 완료되었습니다.\n마스터 관리자 승인 후 이용 가능합니다.');
    } catch (e) {
      alert('신청 실패: ' + e.message);
    }
    setCreatingClub(false);
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleRegister = async () => {
    if (!formData.consentGiven) { alert('개인정보 수집 및 이용에 동의해주세요.'); return; }
    if (!formData.name || !formData.birthYear || !formData.club) { alert('이름, 출생연도, 클럽은 필수입니다.'); return; }
    if (!user || !emailKey) { alert('로그인 정보가 없습니다.'); navigate('/'); return; }

    try {
      // 1. 중복 가입 방지: 이미 등록된 이메일인지 확인
      const existingSnap = await get(ref(db, `Users/${emailKey}`));
      if (existingSnap.exists() && existingSnap.val().club) {
        alert('이미 등록된 계정입니다. 홈으로 이동합니다.');
        navigate('/home');
        return;
      }

      // 2. 동명이인 경고: 같은 클럽에 같은 이름이 있는지 확인
      const playersSnap = await get(ref(db, `registeredPlayers/${formData.club}`));
      if (playersSnap.exists()) {
        const names = Object.values(playersSnap.val()).map(p => p.name);
        if (names.includes(formData.name.trim())) {
          if (!window.confirm(`${formData.club}에 "${formData.name}" 이름이 이미 있습니다. 동명이인으로 등록하시겠습니까?`)) return;
        }
      }

      const today = new Date().toISOString().slice(0, 10);

      // 3. Users에 저장 (동의 날짜 포함)
      await set(ref(db, `Users/${emailKey}`), {
        name: formData.name,
        height: parseFloat(formData.height) || 0,
        weight: parseFloat(formData.weight) || 0,
        birthYear: formData.birthYear,
        position: formData.position,
        skill: formData.skill,
        club: formData.club,
        consentGiven: true,
        consentDate: today,
      });

      // 4. registeredPlayers에 자동 등록
      await push(ref(db, `registeredPlayers/${formData.club}`), {
        name: formData.name.trim(),
        date: today,
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

  const isFormValid = formData.name && formData.birthYear && formData.club && formData.consentGiven;

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', py: 3 }}>
      <Container maxWidth="sm" sx={{ px: 2 }}>

        {/* 헤더 */}
        <Card sx={{
          mb: 2.5, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
        }}>
          <CardContent sx={{ py: 3, textAlign: 'center', position: 'relative' }}>
            <Button onClick={() => navigate('/')}
              sx={{ position: 'absolute', left: 8, top: 12, minWidth: 'auto', color: 'rgba(255,255,255,0.6)' }}>
              <ArrowBackIcon />
            </Button>
            <SportsSoccerIcon sx={{ fontSize: 36, color: 'rgba(255,255,255,0.3)', mb: 0.5 }} />
            <Typography variant="h5" sx={{ color: 'white', fontWeight: 900 }}>
              회원 등록
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', mt: 0.5 }}>
              우리들의 리그에 참여하세요
            </Typography>
          </CardContent>
        </Card>

        {/* 클럽 선택 */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 'bold', color: '#2D336B', fontSize: '0.95rem', mb: 1.5 }}>
            소속 클럽 <span style={{ color: '#D32F2F' }}>*</span>
          </Typography>
          {loadingClubs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
          ) : (
            <>
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel>클럽 선택</InputLabel>
                <Select name="club" value={formData.club} label="클럽 선택" onChange={handleChange}
                  sx={{ borderRadius: 2 }}>
                  {clubList.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
              <Button
                fullWidth variant="outlined" size="small"
                startIcon={<AddIcon />}
                onClick={() => setCreateClubOpen(true)}
                sx={{
                  borderRadius: 2, py: 1, borderColor: '#2D336B', color: '#2D336B',
                  borderStyle: 'dashed', fontSize: '0.85rem', fontWeight: 600,
                  '&:hover': { borderColor: '#1A1D4E', bgcolor: 'rgba(45,51,107,0.04)' },
                }}>
                새 클럽 만들기
              </Button>
            </>
          )}
        </Paper>

        {/* 기본 정보 */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 'bold', color: '#2D336B', fontSize: '0.95rem', mb: 1.5 }}>
            기본 정보
          </Typography>

          <TextField
            label="이름" name="name" fullWidth size="small"
            value={formData.name} onChange={handleChange}
            required
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <FormControl fullWidth size="small" sx={{ mb: 2 }} required>
            <InputLabel>출생연도</InputLabel>
            <Select name="birthYear" value={formData.birthYear} label="출생연도" onChange={handleChange}
              sx={{ borderRadius: 2 }}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="키(cm)" name="height" type="number" fullWidth size="small"
              value={formData.height} onChange={handleChange}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="체중(kg)" name="weight" type="number" fullWidth size="small"
              value={formData.weight} onChange={handleChange}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
        </Paper>

        {/* 플레이 정보 */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 'bold', color: '#2D336B', fontSize: '0.95rem', mb: 1.5 }}>
            플레이 정보
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>포지션</InputLabel>
              <Select name="position" value={formData.position} label="포지션" onChange={handleChange}
                sx={{ borderRadius: 2 }}>
                {APP_CONFIG.positions.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>실력</InputLabel>
              <Select name="skill" value={formData.skill} label="실력" onChange={handleChange}
                sx={{ borderRadius: 2 }}>
                {APP_CONFIG.skillLevels.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </Paper>

        {/* 개인정보 동의 */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2.5, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 'bold', color: '#2D336B', fontSize: '0.95rem', mb: 1 }}>
            개인정보 수집 및 이용 동의 <span style={{ color: '#D32F2F' }}>*</span>
          </Typography>

          {/* 동의 내용 토글 */}
          <Box
            onClick={() => setPrivacyOpen(!privacyOpen)}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              bgcolor: '#F5F7FA', borderRadius: 2, px: 2, py: 1, mb: 1.5, cursor: 'pointer',
              '&:hover': { bgcolor: '#ECEFF1' },
            }}
          >
            <Typography sx={{ fontSize: '0.82rem', color: '#555' }}>내용 보기</Typography>
            {privacyOpen ? <ExpandLessIcon sx={{ fontSize: 18, color: '#999' }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: '#999' }} />}
          </Box>

          <Collapse in={privacyOpen}>
            <Box sx={{
              bgcolor: '#FAFAFA', borderRadius: 2, p: 2, mb: 1.5,
              border: '1px solid #E0E0E0', maxHeight: 200, overflow: 'auto',
            }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.7 }}>
                <b>1. 수집 항목</b><br />
                이름, 출생연도, 키, 체중, 포지션, 실력, 소속 클럽, 이메일(구글 계정)<br /><br />
                <b>2. 수집 목적</b><br />
                경기 투표, 팀 편성, 선수 통계 관리, 리그 운영 등 서비스 제공<br /><br />
                <b>3. 보유 및 이용 기간</b><br />
                회원 탈퇴 시 또는 서비스 종료 시까지<br /><br />
                <b>4. 동의 거부 시 불이익</b><br />
                동의하지 않을 경우 서비스 이용이 제한될 수 있습니다.<br /><br />
                <b>5. 제3자 제공</b><br />
                수집된 개인정보는 제3자에게 제공하지 않습니다. 단, 클럽 내 리그 운영 목적으로 소속 클럽 관리자에게 이름, 포지션, 실력 등급 정보가 공유될 수 있습니다.
              </Typography>
            </Box>
          </Collapse>

          <FormControlLabel
            control={
              <Checkbox
                name="consentGiven"
                checked={formData.consentGiven}
                onChange={handleChange}
                sx={{ '&.Mui-checked': { color: '#2D336B' } }}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.88rem', color: formData.consentGiven ? '#2D336B' : '#666', fontWeight: formData.consentGiven ? 600 : 400 }}>
                개인정보 수집 및 이용에 동의합니다.
              </Typography>
            }
          />
        </Paper>

        {/* 등록 버튼 */}
        <Button
          variant="contained" fullWidth size="large"
          disabled={!isFormValid}
          onClick={handleRegister}
          sx={{
            borderRadius: 3, py: 1.5, fontSize: '1rem', fontWeight: 'bold',
            background: isFormValid
              ? 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)'
              : undefined,
            boxShadow: isFormValid ? 4 : 0,
            mb: 3,
          }}
        >
          등록하기
        </Button>

        {/* 클럽 생성 다이얼로그 */}
        <Dialog open={createClubOpen} onClose={() => setCreateClubOpen(false)} maxWidth="xs" fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle sx={{ fontWeight: 900, fontSize: '1.05rem', pb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GroupsIcon sx={{ color: '#2D336B', fontSize: 22 }} />
              새 클럽 만들기
            </Box>
            <Typography sx={{ fontSize: '0.78rem', color: '#999', mt: 0.3 }}>
              마스터 관리자 승인 후 클럽이 생성됩니다
            </Typography>
          </DialogTitle>
          <DialogContent sx={{ pt: 1.5 }}>
            <TextField
              label="클럽 이름" fullWidth size="small" required
              value={newClub.name}
              onChange={e => setNewClub(p => ({ ...p, name: e.target.value }))}
              placeholder="예: 한강FC"
              sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>종목</InputLabel>
              <Select value={newClub.type} label="종목"
                onChange={e => setNewClub(p => ({ ...p, type: e.target.value }))}
                sx={{ borderRadius: 2 }}>
                <MenuItem value="futsal">풋살</MenuItem>
                <MenuItem value="football">축구</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="활동 지역" fullWidth size="small"
              value={newClub.region}
              onChange={e => setNewClub(p => ({ ...p, region: e.target.value }))}
              placeholder="예: 서울 마포구"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateClubOpen(false)} sx={{ color: '#666', borderRadius: 2 }}>취소</Button>
            <Button variant="contained" onClick={handleCreateClub} disabled={creatingClub || !newClub.name.trim()}
              sx={{
                borderRadius: 2, fontWeight: 700, px: 3, color: 'white',
                background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
              }}>
              {creatingClub ? <CircularProgress size={20} color="inherit" /> : '신청하기'}
            </Button>
          </DialogActions>
        </Dialog>

      </Container>
    </Box>
  );
}

export default RegisterPage;

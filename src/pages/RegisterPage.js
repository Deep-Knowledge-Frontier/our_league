import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get, push } from 'firebase/database';
import {
  Container, TextField, Button, Typography, Checkbox,
  FormControlLabel, Box, CircularProgress, Card, CardContent,
  Collapse, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import GroupsIcon from '@mui/icons-material/Groups';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/app.config';
import { CLUB_EMBLEM_MAP } from '../components/ClubEmblems';

const TOTAL_STEPS = 6;

// 팀명 해시 → 색상 자동 생성
const CLUB_COLORS = ['#1565C0','#2E7D32','#C62828','#6A1B9A','#E65100','#00838F','#4527A0','#AD1457','#1B5E20','#BF360C'];
function getClubColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return CLUB_COLORS[Math.abs(h) % CLUB_COLORS.length];
}

const POSITION_INFO = {
  GK: { emoji: '🧤', label: 'GK', desc: '골키퍼' },
  DF: { emoji: '🛡️', label: 'DF', desc: '수비수' },
  DM: { emoji: '⚓', label: 'DM', desc: '수비형 미드' },
  MF: { emoji: '⚙️', label: 'MF', desc: '미드필더' },
  AM: { emoji: '🎯', label: 'AM', desc: '공격형 미드' },
  FW: { emoji: '⚡', label: 'FW', desc: '공격수' },
};

const SKILL_INFO = [
  { value: '상', color: '#D32F2F', desc: '프로급 실력' },
  { value: '상-중', color: '#E65100', desc: '상급 수준' },
  { value: '중', color: '#F57C00', desc: '평균 수준' },
  { value: '중-하', color: '#1565C0', desc: '중하급 수준' },
  { value: '하', color: '#1976D2', desc: '초보 수준' },
  { value: '하하', color: '#42A5F5', desc: '입문 수준' },
];

function RegisterPage() {
  const navigate = useNavigate();
  const { user, emailKey } = useAuth();

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('right'); // 'right' or 'left'
  const [clubList, setClubList] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [clubSearch, setClubSearch] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [newClub, setNewClub] = useState({ name: '', type: 'futsal', region: '' });
  const [creatingClub, setCreatingClub] = useState(false);

  const [formData, setFormData] = useState({
    name: '', height: '', weight: '', birthYear: '',
    position: '', subPosition: '', jerseyNumber: '',
    skill: '', club: '', consentGiven: false,
  });

  useEffect(() => {
    get(ref(db, 'clubs')).then(snap => {
      if (snap.exists()) {
        const clubs = Object.entries(snap.val()).map(([key, val]) => ({
          name: val.name || key,
          type: val.type || 'futsal',
          region: val.region || '',
          emoji: val.emoji || '',
        })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        setClubList(clubs);
      }
      setLoadingClubs(false);
    }).catch(() => setLoadingClubs(false));
  }, []);

  const goNext = () => { setSlideDir('right'); setStep(s => Math.min(s + 1, TOTAL_STEPS - 1)); };
  const goBack = () => { setSlideDir('left'); setStep(s => Math.max(s - 1, 0)); };

  const selectClub = (club) => { setFormData(p => ({ ...p, club })); setTimeout(goNext, 200); };
  const selectPosition = (pos) => { setFormData(p => ({ ...p, position: pos })); setTimeout(goNext, 200); };
  const selectSkill = (skill) => { setFormData(p => ({ ...p, skill })); setTimeout(goNext, 200); };

  const handleCreateClub = async () => {
    const name = newClub.name.trim();
    if (!name) { alert('클럽 이름을 입력해주세요.'); return; }
    if (clubList.includes(name)) { alert('이미 등록된 클럽입니다.'); return; }
    if (!user) { alert('로그인 정보가 없습니다.'); return; }
    setCreatingClub(true);
    try {
      const requestKey = name.replace(/[.#$/[\]]/g, '_');
      await set(ref(db, `ClubRequests/${requestKey}`), {
        name, type: newClub.type, region: newClub.region || '',
        requestedAt: new Date().toISOString().slice(0, 10),
        requestedBy: user.email, requestedByName: user.displayName || '', status: 'pending',
      });
      setNewClub({ name: '', type: 'futsal', region: '' });
      setCreateClubOpen(false);
      alert('클럽 생성 신청이 완료되었습니다.\n마스터 관리자 승인 후 이용 가능합니다.');
    } catch (e) { alert('신청 실패: ' + e.message); }
    setCreatingClub(false);
  };

  const handleRegister = async () => {
    if (!formData.consentGiven) { alert('개인정보 수집 및 이용에 동의해주세요.'); return; }
    if (!formData.name || !formData.birthYear || !formData.club) { alert('필수 정보를 입력해주세요.'); return; }
    if (!user || !emailKey) { alert('로그인 정보가 없습니다.'); navigate('/'); return; }
    try {
      const existingSnap = await get(ref(db, `Users/${emailKey}`));
      if (existingSnap.exists() && existingSnap.val().club) {
        alert('이미 등록된 계정입니다.'); navigate('/home'); return;
      }
      const playersSnap = await get(ref(db, `registeredPlayers/${formData.club}`));
      const existingNames = playersSnap.exists() ? Object.values(playersSnap.val()).map(p => p.name) : [];
      let finalName = formData.name.trim();
      let alreadyRegistered = false;
      if (existingNames.includes(finalName)) {
        const choice = window.confirm(
          `${formData.club}에 "${finalName}" 이름이 이미 있습니다.\n\n[확인] 본인입니다\n[취소] 동명이인입니다`
        );
        if (choice) { alreadyRegistered = true; }
        else {
          let num = 2;
          while (existingNames.includes(`${formData.name.trim()}(${num})`)) num++;
          finalName = `${formData.name.trim()}(${num})`;
          if (!window.confirm(`"${finalName}"(으)로 등록됩니다. 진행할까요?`)) return;
        }
      }
      const today = new Date().toISOString().slice(0, 10);
      const jerseyNum = formData.jerseyNumber ? parseInt(formData.jerseyNumber, 10) : null;
      await set(ref(db, `Users/${emailKey}`), {
        name: finalName, height: parseFloat(formData.height) || 0, weight: parseFloat(formData.weight) || 0,
        birthYear: formData.birthYear,
        position: formData.position,
        subPosition: formData.subPosition || '',
        jerseyNumber: jerseyNum,
        skill: formData.skill,
        club: formData.club, consentGiven: true, consentDate: today,
      });
      if (!alreadyRegistered) {
        await push(ref(db, `registeredPlayers/${formData.club}`), {
          name: finalName, date: today,
          position: formData.position || '',
          subPosition: formData.subPosition || '',
          jerseyNumber: jerseyNum,
        });
      }
      alert('등록 완료!'); navigate('/home');
    } catch (error) { alert('등록 실패: ' + error.message); }
  };

  const years = [];
  for (let i = 2010; i >= 1970; i--) years.push(i.toString());

  const stepTitles = [
    '어떤 클럽에 소속되어 있나요?',
    '이름과 출생연도를 알려주세요',
    '신체 정보 (선택사항)',
    '주로 어떤 포지션인가요?',
    '실력은 어느 정도인가요?',
    '마지막으로 확인해주세요',
  ];

  const renderStep = () => {
    switch (step) {
      case 0: // 클럽 선택
        return (
          <Box>
            {loadingClubs ? (
              <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
            ) : (() => {
              const filtered = clubSearch
                ? clubList.filter(c => c.name.toLowerCase().includes(clubSearch.toLowerCase()) || c.region.includes(clubSearch))
                : clubList;
              return (
                <>
                  {clubList.length > 4 && (
                    <TextField fullWidth size="small" placeholder="클럽 이름 또는 지역으로 검색"
                      value={clubSearch} onChange={e => setClubSearch(e.target.value)}
                      sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.2 }}>
                    {filtered.map(c => {
                      const selected = formData.club === c.name;
                      const color = getClubColor(c.name);
                      const EmblemComp = CLUB_EMBLEM_MAP[c.name];
                      return (
                        <Box key={c.name} onClick={() => selectClub(c.name)}
                          sx={{
                            p: 1.5, borderRadius: 2.5, cursor: 'pointer', textAlign: 'center',
                            border: selected ? `2px solid ${color}` : '1.5px solid #e0e0e0',
                            bgcolor: selected ? `${color}10` : 'white',
                            boxShadow: selected ? `0 2px 12px ${color}30` : '0 1px 4px rgba(0,0,0,0.06)',
                            transition: 'all 0.2s',
                            '&:hover': { borderColor: color, boxShadow: `0 2px 8px ${color}20` },
                          }}>
                          <Box sx={{ width: 52, height: 52, mx: 'auto', mb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {EmblemComp ? (
                              <EmblemComp size={52} />
                            ) : (
                              <Box sx={{
                                width: 48, height: 48, borderRadius: '50%', bgcolor: color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: `0 2px 8px ${color}40`,
                              }}>
                                <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '1.2rem' }}>{c.name.charAt(0)}</Typography>
                              </Box>
                            )}
                          </Box>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: selected ? color : '#333', mb: 0.2 }}>
                            {c.name}
                          </Typography>
                          <Typography sx={{ fontSize: '0.68rem', color: '#999' }}>
                            {c.type === 'football' ? '축구' : '풋살'}{c.region ? ` · ${c.region}` : ''}
                          </Typography>
                          {selected && (
                            <CheckCircleIcon sx={{ fontSize: 18, color, mt: 0.5 }} />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                  {filtered.length === 0 && clubSearch && (
                    <Typography sx={{ textAlign: 'center', color: '#999', py: 2, fontSize: '0.85rem' }}>
                      "{clubSearch}" 검색 결과가 없습니다
                    </Typography>
                  )}
                  <Button fullWidth variant="outlined" startIcon={<AddIcon />}
                    onClick={() => setCreateClubOpen(true)}
                    sx={{ mt: 1.5, borderRadius: 2.5, py: 1, borderStyle: 'dashed', borderColor: '#999', color: '#666', fontSize: '0.85rem', fontWeight: 600 }}>
                    새 클럽 만들기
                  </Button>
                </>
              );
            })()}
          </Box>
        );

      case 1: // 이름 + 출생연도
        return (
          <Box>
            <TextField label="이름" fullWidth size="small" value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              autoFocus required
              sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '1.1rem' } }} />
            <Typography sx={{ fontSize: '0.85rem', color: '#666', mb: 1, fontWeight: 600 }}>출생연도</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0.8 }}>
              {years.map(y => (
                <Button key={y} size="small" variant={formData.birthYear === y ? 'contained' : 'outlined'}
                  onClick={() => setFormData(p => ({ ...p, birthYear: y }))}
                  sx={{
                    borderRadius: 2, py: 0.8, fontSize: '0.85rem', fontWeight: 600, minWidth: 0,
                    bgcolor: formData.birthYear === y ? '#2D336B' : 'transparent',
                    borderColor: formData.birthYear === y ? '#2D336B' : '#ddd',
                    color: formData.birthYear === y ? 'white' : '#555',
                  }}>
                  {y.slice(2)}
                </Button>
              ))}
            </Box>
          </Box>
        );

      case 2: // 키 + 체중
        return (
          <Box>
            <TextField label="키 (cm)" type="number" fullWidth size="small" value={formData.height}
              onChange={e => setFormData(p => ({ ...p, height: e.target.value }))}
              placeholder="예: 176"
              sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '1.1rem' } }} />
            <TextField label="체중 (kg)" type="number" fullWidth size="small" value={formData.weight}
              onChange={e => setFormData(p => ({ ...p, weight: e.target.value }))}
              placeholder="예: 75"
              sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '1.1rem' } }} />
            <Button fullWidth variant="text" onClick={goNext}
              sx={{ color: '#999', fontSize: '0.85rem' }}>건너뛰기</Button>
          </Box>
        );

      case 3: // 포지션 1순위 + 2순위 + 등번호
        return (
          <Box>
            <Typography sx={{ fontSize: '0.85rem', color: '#666', mb: 1, fontWeight: 700 }}>1순위 포지션 (주요)</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
              {APP_CONFIG.positions.map(pos => {
                const info = POSITION_INFO[pos] || { emoji: '⚽', label: pos, desc: pos };
                const selected = formData.position === pos;
                return (
                  <Button key={pos} variant={selected ? 'contained' : 'outlined'}
                    onClick={() => {
                      setFormData(p => ({
                        ...p,
                        position: pos,
                        // 1순위 = 2순위가 되면 2순위 초기화
                        subPosition: p.subPosition === pos ? '' : p.subPosition,
                      }));
                    }}
                    sx={{
                      borderRadius: 2, py: 1.2, display: 'flex', flexDirection: 'column', gap: 0.2,
                      textTransform: 'none', minHeight: 70,
                      bgcolor: selected ? '#2D336B' : 'transparent',
                      borderColor: selected ? '#2D336B' : '#ddd',
                      color: selected ? 'white' : '#333',
                      '&:hover': { bgcolor: selected ? '#1A1D4E' : '#f5f5f5' },
                    }}>
                    <Typography sx={{ fontSize: '1.2rem' }}>{info.emoji}</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>{info.label}</Typography>
                  </Button>
                );
              })}
            </Box>

            <Typography sx={{ fontSize: '0.85rem', color: '#666', mb: 1, fontWeight: 700 }}>
              2순위 포지션 <Typography component="span" sx={{ fontSize: '0.72rem', color: '#999' }}>(선택)</Typography>
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
              {APP_CONFIG.positions.filter(p => p !== formData.position).map(pos => {
                const info = POSITION_INFO[pos] || { emoji: '⚽', label: pos, desc: pos };
                const selected = formData.subPosition === pos;
                return (
                  <Button key={pos} variant={selected ? 'contained' : 'outlined'}
                    onClick={() => setFormData(p => ({ ...p, subPosition: selected ? '' : pos }))}
                    sx={{
                      borderRadius: 2, py: 0.8, fontSize: '0.82rem', fontWeight: 700,
                      textTransform: 'none',
                      bgcolor: selected ? '#7E57C2' : 'transparent',
                      borderColor: selected ? '#7E57C2' : '#ddd',
                      color: selected ? 'white' : '#555',
                      '&:hover': { bgcolor: selected ? '#5E35B1' : '#f5f5f5' },
                    }}>
                    {info.emoji} {info.label}
                  </Button>
                );
              })}
            </Box>

            <Typography sx={{ fontSize: '0.85rem', color: '#666', mb: 1, fontWeight: 700 }}>
              등번호 <Typography component="span" sx={{ fontSize: '0.72rem', color: '#999' }}>(선택 · 1~99)</Typography>
            </Typography>
            <TextField
              fullWidth size="small" type="number"
              placeholder="예: 10"
              value={formData.jerseyNumber}
              onChange={e => {
                const v = e.target.value;
                if (v === '') { setFormData(p => ({ ...p, jerseyNumber: '' })); return; }
                const n = parseInt(v, 10);
                if (Number.isNaN(n) || n < 0 || n > 99) return;
                setFormData(p => ({ ...p, jerseyNumber: String(n) }));
              }}
              inputProps={{ min: 0, max: 99 }}
              sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Button
              fullWidth variant="contained"
              disabled={!formData.position}
              onClick={goNext}
              sx={{
                mt: 1, py: 1.2, borderRadius: 2, fontWeight: 800,
                bgcolor: '#2D336B', '&:hover': { bgcolor: '#1A1D4E' },
              }}
            >
              다음
            </Button>
          </Box>
        );

      case 4: // 실력
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SKILL_INFO.map(s => {
              const selected = formData.skill === s.value;
              return (
                <Button key={s.value} fullWidth variant={selected ? 'contained' : 'outlined'}
                  onClick={() => selectSkill(s.value)}
                  sx={{
                    borderRadius: 2.5, py: 1.5, justifyContent: 'space-between', textTransform: 'none',
                    bgcolor: selected ? s.color : 'transparent',
                    borderColor: selected ? s.color : '#ddd',
                    color: selected ? 'white' : '#333',
                    '&:hover': { bgcolor: selected ? s.color : '#f5f5f5', borderColor: s.color },
                  }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{s.value}</Typography>
                  <Typography sx={{ fontSize: '0.8rem', opacity: 0.7 }}>{s.desc}</Typography>
                </Button>
              );
            })}
          </Box>
        );

      case 5: // 확인 + 동의
        return (
          <Box>
            {/* 선수 프로필 카드 */}
            <Box sx={{
              background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
              borderRadius: 3, p: 2.5, mb: 2, textAlign: 'center', color: 'white',
            }}>
              <Box sx={{
                width: 56, height: 56, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1,
              }}>
                <Typography sx={{ fontSize: '1.5rem' }}>
                  {POSITION_INFO[formData.position]?.emoji || '⚽'}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.3rem', mb: 0.3 }}>{formData.name || '이름'}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem' }}>{formData.club}</Typography>

              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1.5 }}>
                {[
                  {
                    label: '포지션',
                    value: formData.position
                      ? (formData.subPosition ? `${formData.position}/${formData.subPosition}` : formData.position)
                      : '-',
                  },
                  { label: '등번호', value: formData.jerseyNumber ? `#${formData.jerseyNumber}` : '-' },
                  { label: '출생', value: formData.birthYear || '-' },
                  { label: '실력', value: formData.skill || '-' },
                ].map(item => (
                  <Box key={item.label} sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#FFD700' }}>{item.value}</Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>{item.label}</Typography>
                  </Box>
                ))}
              </Box>

              {(formData.height || formData.weight) && (
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {formData.height && (
                    <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                      {formData.height}cm
                    </Typography>
                  )}
                  {formData.weight && (
                    <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                      {formData.weight}kg
                    </Typography>
                  )}
                </Box>
              )}
            </Box>

            {/* 개인정보 동의 */}
            <Box onClick={() => setPrivacyOpen(!privacyOpen)}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                bgcolor: '#F5F7FA', borderRadius: 2, px: 2, py: 1, mb: 1, cursor: 'pointer',
                '&:hover': { bgcolor: '#ECEFF1' } }}>
              <Typography sx={{ fontSize: '0.82rem', color: '#555' }}>개인정보 수집 및 이용 동의</Typography>
              {privacyOpen ? <ExpandLessIcon sx={{ fontSize: 18, color: '#999' }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: '#999' }} />}
            </Box>
            <Collapse in={privacyOpen}>
              <Box sx={{ bgcolor: '#FAFAFA', borderRadius: 2, p: 2, mb: 1, border: '1px solid #E0E0E0', maxHeight: 140, overflow: 'auto' }}>
                <Typography sx={{ fontSize: '0.72rem', color: '#555', lineHeight: 1.7 }}>
                  <b>1. 수집 항목</b><br />이름, 출생연도, 키, 체중, 포지션, 실력, 소속 클럽, 이메일<br /><br />
                  <b>2. 수집 목적</b><br />경기 투표, 팀 편성, 선수 통계 관리, 리그 운영<br /><br />
                  <b>3. 보유 기간</b><br />회원 탈퇴 시 또는 서비스 종료 시까지<br /><br />
                  <b>4. 제3자 제공</b><br />클럽 내 리그 운영 목적으로 관리자에게 공유될 수 있습니다.
                </Typography>
              </Box>
            </Collapse>
            <FormControlLabel
              control={<Checkbox checked={formData.consentGiven}
                onChange={e => setFormData(p => ({ ...p, consentGiven: e.target.checked }))}
                sx={{ '&.Mui-checked': { color: '#2D336B' } }} />}
              label={<Typography sx={{ fontSize: '0.88rem', fontWeight: formData.consentGiven ? 700 : 400, color: formData.consentGiven ? '#2D336B' : '#666' }}>
                개인정보 수집 및 이용에 동의합니다.
              </Typography>}
            />
          </Box>
        );

      default: return null;
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!formData.club;
      case 1: return !!(formData.name && formData.birthYear);
      case 2: return true;
      case 3: return true; // 선택사항
      case 4: return true; // 선택사항
      case 5: return formData.consentGiven && formData.name && formData.birthYear && formData.club;
      default: return false;
    }
  };

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh' }}>
      {/* 헤더 */}
      <Box sx={{ background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)', px: 2, pt: 2, pb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Button onClick={() => step > 0 ? goBack() : navigate('/')}
            sx={{ minWidth: 'auto', color: 'rgba(255,255,255,0.7)', p: 0.5 }}>
            <ArrowBackIcon />
          </Button>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 600 }}>
            {step + 1} / {TOTAL_STEPS}
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={((step + 1) / TOTAL_STEPS) * 100}
          sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)',
            '& .MuiLinearProgress-bar': { bgcolor: '#FFD700', borderRadius: 2 }, mb: 2 }} />
        <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '1.3rem', lineHeight: 1.3 }}>
          {stepTitles[step]}
        </Typography>
      </Box>

      <Container maxWidth="sm" sx={{ px: 2, mt: -1.5 }}>
        <Card sx={{ borderRadius: 3, boxShadow: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 2.5 }}>
            <Box key={step} sx={{
              animation: `slideIn${slideDir === 'right' ? 'Right' : 'Left'} 0.3s ease`,
              '@keyframes slideInRight': {
                '0%': { opacity: 0, transform: 'translateX(30px)' },
                '100%': { opacity: 1, transform: 'translateX(0)' },
              },
              '@keyframes slideInLeft': {
                '0%': { opacity: 0, transform: 'translateX(-30px)' },
                '100%': { opacity: 1, transform: 'translateX(0)' },
              },
            }}>
              {renderStep()}
            </Box>
          </CardContent>
        </Card>

        {/* 하단 버튼 */}
        <Box sx={{ mt: 2, mb: 4, display: 'flex', gap: 1 }}>
          {step > 0 && (
            <Button variant="outlined" onClick={goBack}
              sx={{ borderRadius: 2.5, py: 1.3, fontWeight: 700, borderColor: '#ccc', color: '#666', flex: step === 5 ? 1 : 'none', px: 3 }}>
              이전
            </Button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <Button variant="contained" fullWidth onClick={goNext} disabled={!canProceed()}
              endIcon={<ArrowForwardIcon />}
              sx={{
                borderRadius: 2.5, py: 1.3, fontWeight: 700, fontSize: '1rem',
                background: canProceed() ? 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)' : undefined,
              }}>
              다음
            </Button>
          ) : (
            <Button variant="contained" fullWidth onClick={handleRegister} disabled={!canProceed()}
              sx={{
                borderRadius: 2.5, py: 1.3, fontWeight: 700, fontSize: '1rem',
                background: canProceed() ? 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)' : undefined,
              }}>
              등록하기
            </Button>
          )}
        </Box>
      </Container>

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
          <TextField label="클럽 이름" fullWidth size="small" required
            value={newClub.name} onChange={e => setNewClub(p => ({ ...p, name: e.target.value }))}
            placeholder="예: 한강FC"
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>종목</InputLabel>
            <Select value={newClub.type} label="종목" onChange={e => setNewClub(p => ({ ...p, type: e.target.value }))}
              sx={{ borderRadius: 2 }}>
              <MenuItem value="futsal">풋살</MenuItem>
              <MenuItem value="football">축구</MenuItem>
            </Select>
          </FormControl>
          <TextField label="활동 지역" fullWidth size="small"
            value={newClub.region} onChange={e => setNewClub(p => ({ ...p, region: e.target.value }))}
            placeholder="예: 서울 마포구"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateClubOpen(false)} sx={{ color: '#666', borderRadius: 2 }}>취소</Button>
          <Button variant="contained" onClick={handleCreateClub} disabled={creatingClub || !newClub.name.trim()}
            sx={{ borderRadius: 2, fontWeight: 700, px: 3, color: 'white',
              background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)' }}>
            {creatingClub ? <CircularProgress size={20} color="inherit" /> : '신청하기'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default RegisterPage;

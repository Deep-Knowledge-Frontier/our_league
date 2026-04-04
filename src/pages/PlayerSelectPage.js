import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, set, onValue, update } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button,
  Chip, IconButton, ToggleButton, ToggleButtonGroup, Divider
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { softmaxPercent } from '../utils/stats';

const DRAFT_HIGH_ATTEND_THRESHOLD = 3;
const MATCHES_PER_TEAM = 6;

function avgExcludeNull(names, statsMap) {
  if (!names?.length) return 0;
  let sum = 0, cnt = 0;
  names.forEach(n => {
    const s = statsMap[n];
    if (s?.pointRate > 0) { sum += s.pointRate; cnt++; }
  });
  return cnt === 0 ? 0 : sum / cnt;
}

function snakeDraft(players, teamCount, statsMap) {
  const high = [], low = [];
  players.forEach(name => {
    const attend = statsMap[name]?.attendanceRate || 0;
    (attend >= DRAFT_HIGH_ATTEND_THRESHOLD ? high : low).push(name);
  });

  const sortByScore = (a, b) => {
    const sa = statsMap[a] || {}, sb = statsMap[b] || {};
    return (sb.abilityScore || 0) - (sa.abilityScore || 0) || (sb.pointRate || 0) - (sa.pointRate || 0) || a.localeCompare(b, 'ko');
  };
  high.sort(sortByScore);
  low.sort(sortByScore);

  const appendSnake = (group, out) => {
    const rounds = Math.ceil(group.length / teamCount);
    for (let r = 0; r < rounds; r++) {
      const start = r * teamCount;
      const slice = group.slice(start, Math.min(start + teamCount, group.length));
      if (r % 2 === 1) slice.reverse();
      out.push(...slice);
    }
  };

  const order = [];
  appendSnake(high, order);
  appendSnake(low, order);

  const teams = Array.from({ length: teamCount }, () => []);
  order.forEach((name, i) => teams[i % teamCount].push(name));
  return teams;
}

function pickTwoRandom(names) {
  const src = [...new Set(names.filter(Boolean))];
  if (src.length < 2) return src;
  for (let i = src.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [src[i], src[j]] = [src[j], src[i]];
  }
  return [src[0], src[1]];
}

export default function PlayerSelectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const { clubName, isAdmin, isModerator } = useAuth();
  const canEdit = isAdmin || isModerator;

  const [loading, setLoading] = useState(true);
  const [registeredPlayers, setRegisteredPlayers] = useState([]);
  const [statsMap, setStatsMap] = useState({});
  const [selectedPlayers, setSelectedPlayers] = useState({});
  const [guests, setGuests] = useState([]);
  const [teamCount, setTeamCount] = useState(3);
  const [teams, setTeams] = useState({ A: [], B: [], C: [] });
  const [keyPop, setKeyPop] = useState([]);
  const [hasSavedTeams, setHasSavedTeams] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTeams, setEditTeams] = useState({ A: [], B: [], C: [] });
  const [movingPlayer, setMovingPlayer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    return onValue(ref(db, `registeredPlayers/${clubName}`), snap => {
      const v = snap.val() || {};
      setRegisteredPlayers(Object.values(v).map(p => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')));
    });
  }, [clubName]);

  useEffect(() => {
    return onValue(ref(db, `PlayerStatsBackup_6m/${clubName}`), snap => {
      const v = snap.val() || {};
      const map = {};
      Object.entries(v).forEach(([name, data]) => {
        map[name] = {
          participatedMatches: data.participatedMatches || 0,
          attendanceRate: data.attendanceRate || 0,
          pointRate: data.pointRate || 0,
          abilityScore: data.abilityScore || 0,
        };
      });
      setStatsMap(map);
    });
  }, [clubName]);

  useEffect(() => {
    const base = `PlayerSelectionByDate/${clubName}/${dateParam}`;
    const off1 = onValue(ref(db, `${base}/AttandPlayer/all`), snap => {
      const v = snap.val();
      if (Array.isArray(v)) {
        const map = {};
        v.filter(Boolean).forEach(n => { map[n] = true; });
        setSelectedPlayers(map);
      }
      setLoading(false);
    });
    const off2 = onValue(ref(db, `${base}/AttandPlayer`), snap => {
      const v = snap.val() || {};
      const a = Array.isArray(v.A) ? v.A.filter(Boolean) : [];
      const b = Array.isArray(v.B) ? v.B.filter(Boolean) : [];
      const c = Array.isArray(v.C) ? v.C.filter(Boolean) : [];
      setTeams({ A: a, B: b, C: c });
      setHasSavedTeams(a.length > 0 || b.length > 0 || c.length > 0);
    });
    const off3 = onValue(ref(db, `${base}/keyPop`), snap => {
      const v = snap.val();
      setKeyPop(Array.isArray(v) ? v.filter(Boolean) : []);
    });
    const off4 = onValue(ref(db, `${base}/Guests`), snap => {
      const v = snap.val() || {};
      const list = [];
      Object.values(v).forEach(arr => { if (Array.isArray(arr)) arr.filter(Boolean).forEach(g => list.push(g)); });
      setGuests(list);
    });
    return () => { off1(); off2(); off3(); off4(); };
  }, [clubName, dateParam]);

  const playerList = useMemo(() => {
    const regSet = new Set(registeredPlayers);
    const extras = Object.keys(statsMap).filter(n => !regSet.has(n)).sort((a, b) => a.localeCompare(b, 'ko'));
    const guestNames = guests.map(g => `${g} (용병)`);
    return [...registeredPlayers, ...guestNames, ...extras];
  }, [registeredPlayers, statsMap, guests]);

  const selectedCount = useMemo(() => Object.values(selectedPlayers).filter(Boolean).length, [selectedPlayers]);

  const togglePlayer = useCallback((name) => {
    if (!canEdit) return;
    setSelectedPlayers(prev => {
      const next = { ...prev, [name]: !prev[name] };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const all = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
        set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer/all`), all);
      }, 350);
      return next;
    });
  }, [canEdit, clubName, dateParam]);

  const runDraft = useCallback(() => {
    const picked = Object.entries(selectedPlayers).filter(([, v]) => v).map(([k]) => k);
    if (picked.length < 2) { alert('최소 2명 이상 선택해주세요.'); return; }
    const result = snakeDraft(picked, teamCount, statsMap);
    const newTeams = { A: result[0] || [], B: result[1] || [], C: teamCount === 3 ? (result[2] || []) : [] };
    setTeams(newTeams);
    setKeyPop(pickTwoRandom(picked));
    setShowResult(true);
  }, [selectedPlayers, teamCount, statsMap]);

  const saveTeams = useCallback(async (teamsToSave, keyPopToSave, cb) => {
    const base = `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer`;
    const updates = {};
    updates[`${base}/A`] = teamsToSave.A;
    updates[`${base}/B`] = teamsToSave.B;
    updates[`${base}/C`] = teamCount === 3 ? teamsToSave.C : null;
    updates[`PlayerSelectionByDate/${clubName}/${dateParam}/keyPop`] = keyPopToSave.slice(0, 2);
    try { await update(ref(db), updates); setHasSavedTeams(true); cb?.(); }
    catch (e) { alert('저장 실패: ' + e.message); }
  }, [clubName, dateParam, teamCount]);

  const goToScoreRecord = useCallback(() => {
    saveTeams(teams, keyPop, () => {
      navigate(`/score-record?date=${dateParam}&teamCount=${teamCount}&matchesPerTeam=${MATCHES_PER_TEAM}&game=1`);
    });
  }, [teams, keyPop, saveTeams, navigate, dateParam, teamCount]);

  const startEdit = useCallback(() => {
    setEditTeams({ A: [...teams.A], B: [...teams.B], C: [...teams.C] });
    setEditMode(true);
    setMovingPlayer(null);
  }, [teams]);

  const handleEditPlayerClick = useCallback((player, fromTeam) => {
    if (movingPlayer?.name === player && movingPlayer?.from === fromTeam) setMovingPlayer(null);
    else setMovingPlayer({ name: player, from: fromTeam });
  }, [movingPlayer]);

  const handleTeamHeaderClick = useCallback((toTeam) => {
    if (!movingPlayer || movingPlayer.from === toTeam) return;
    setEditTeams(prev => {
      const next = { ...prev };
      next[movingPlayer.from] = prev[movingPlayer.from].filter(n => n !== movingPlayer.name);
      next[toTeam] = [...prev[toTeam], movingPlayer.name];
      return next;
    });
    setMovingPlayer(null);
  }, [movingPlayer]);

  const saveEdit = useCallback(() => {
    setTeams(editTeams);
    saveTeams(editTeams, keyPop);
    setEditMode(false);
    setMovingPlayer(null);
  }, [editTeams, keyPop, saveTeams]);

  const probs = useMemo(() => {
    const dt = editMode ? editTeams : teams;
    const scores = [avgExcludeNull(dt.A, statsMap), avgExcludeNull(dt.B, statsMap)];
    if (teamCount === 3) scores.push(avgExcludeNull(dt.C, statsMap));
    const p = softmaxPercent(scores, 20);
    return { A: p[0] || 0, B: p[1] || 0, C: p[2] || 0 };
  }, [teams, editTeams, editMode, statsMap, teamCount]);

  const displayTeams = editMode ? editTeams : teams;
  const theme = {
    A: { bg: '#1E66D0', light: '#EAF2FF', border: '#BBD3FF' },
    B: { bg: '#1F7A2E', light: '#EAF7EE', border: '#BFE8C7' },
    C: { bg: '#D12A2A', light: '#FFECEC', border: '#FFC2C2' },
  };

  if (loading) return (
    <Container sx={{ mt: 6, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }}>선수 정보를 불러오는 중...</Typography></Container>
  );

  return (
    <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <IconButton onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
        <SportsSoccerIcon sx={{ color: '#1565C0' }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.2rem' }}>경기 운영</Typography>
        <Chip label={dateParam} size="small" sx={{ ml: 'auto', fontWeight: 'bold' }} />
      </Box>

      <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>참여선수: {selectedCount}명</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', color: '#666' }}>팀수:</Typography>
            <ToggleButtonGroup value={teamCount} exclusive onChange={(e, v) => v && setTeamCount(v)} size="small">
              <ToggleButton value={2} sx={{ px: 1.5, py: 0.3, fontSize: '0.8rem' }}>2팀</ToggleButton>
              <ToggleButton value={3} sx={{ px: 1.5, py: 0.3, fontSize: '0.8rem' }}>3팀</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {playerList.map((name, i) => {
            const isSelected = !!selectedPlayers[name];
            const isExtra = !registeredPlayers.includes(name) && !name.includes('(용병)');
            return (
              <Box key={name + i} onClick={() => togglePlayer(name)} sx={{
                py: 0.8, px: 0.5, borderRadius: 1.5, textAlign: 'center', cursor: canEdit ? 'pointer' : 'default',
                bgcolor: isSelected ? '#1565C0' : '#F5F5F5', color: isSelected ? 'white' : isExtra ? '#088395' : '#333',
                fontWeight: isSelected ? 700 : 500, fontSize: '0.8rem',
                border: isSelected ? '2px solid #0D47A1' : '1px solid #E0E0E0',
                transition: 'all 0.15s', userSelect: 'none',
                '&:active': canEdit ? { transform: 'scale(0.95)' } : {},
              }}>{name}</Box>
            );
          })}
        </Box>

        {canEdit && (
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" fullWidth startIcon={<ShuffleIcon />} onClick={runDraft}
              sx={{ borderRadius: 2, fontWeight: 'bold', bgcolor: '#1565C0' }}>자동 팀 배정</Button>
          </Box>
        )}
      </Paper>

      {(hasSavedTeams || showResult) && (
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
              {editMode ? '팀 편집 (선수 클릭 -> 팀 헤더 클릭)' : '팀 구성'}
            </Typography>
            {canEdit && !editMode && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton size="small" onClick={startEdit}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={runDraft}><ShuffleIcon fontSize="small" /></IconButton>
              </Box>
            )}
            {editMode && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={saveEdit} sx={{ fontSize: '0.75rem' }}>저장</Button>
                <Button size="small" variant="outlined" onClick={() => { setEditMode(false); setMovingPlayer(null); }} sx={{ fontSize: '0.75rem' }}>취소</Button>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'stretch' }}>
            {['A', 'B', ...(teamCount === 3 ? ['C'] : [])].map(code => (
              <Box key={code} sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ textAlign: 'center', mb: 0.5 }}>
                  <Chip label={`${probs[code].toFixed(1)}%`} size="small"
                    sx={{ bgcolor: theme[code].bg, color: 'white', fontWeight: 700, fontSize: '0.75rem', height: 22 }} />
                </Box>
                <Box onClick={() => editMode && handleTeamHeaderClick(code)} sx={{
                  bgcolor: theme[code].bg, color: 'white', textAlign: 'center', fontWeight: 800, py: 0.6, fontSize: '0.9rem',
                  borderRadius: '8px 8px 0 0', cursor: editMode && movingPlayer ? 'pointer' : 'default',
                  border: editMode && movingPlayer && movingPlayer.from !== code ? '2px dashed #FFD54F' : 'none',
                }}>
                  팀 {code}
                  {editMode && movingPlayer && movingPlayer.from !== code && <SwapHorizIcon sx={{ fontSize: 14, ml: 0.5, verticalAlign: 'middle' }} />}
                </Box>
                <Box sx={{ border: `1px solid ${theme[code].border}`, borderTop: 'none', bgcolor: theme[code].light, borderRadius: '0 0 8px 8px', p: 0.5, minHeight: 60 }}>
                  {(displayTeams[code] || []).length === 0 ? (
                    <Typography sx={{ color: '#999', textAlign: 'center', py: 2, fontSize: '0.8rem' }}>없음</Typography>
                  ) : (displayTeams[code] || []).map((name, idx) => (
                    <Box key={`${code}-${name}-${idx}`} onClick={() => editMode && handleEditPlayerClick(name, code)} sx={{
                      bgcolor: movingPlayer?.name === name && movingPlayer?.from === code ? '#FFE082' : 'white',
                      border: movingPlayer?.name === name && movingPlayer?.from === code ? '2px solid #F57C00' : '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 1, px: 0.5, py: 0.5, mb: 0.3, display: 'flex', gap: 0.3, alignItems: 'center', justifyContent: 'center',
                      cursor: editMode ? 'pointer' : 'default', transition: 'all 0.15s',
                    }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#888' }}>{idx + 1}.</Typography>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{name}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>


          {canEdit && !editMode && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button variant="outlined" fullWidth startIcon={<SaveIcon />} onClick={() => saveTeams(teams, keyPop)}
                sx={{ borderRadius: 2, fontWeight: 'bold' }}>저장만 하기</Button>
              <Button variant="contained" fullWidth startIcon={<PlayArrowIcon />} onClick={goToScoreRecord}
                sx={{ borderRadius: 2, fontWeight: 'bold', bgcolor: '#1565C0' }}>게임 진행</Button>
            </Box>
          )}
        </Paper>
      )}
    </Container>
  );
}

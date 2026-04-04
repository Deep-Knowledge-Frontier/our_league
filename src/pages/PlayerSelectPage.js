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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { db } from '../config/firebase';
import { get } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { softmaxPercent } from '../utils/stats';
import { getFormations, getDefaultFormation } from '../config/formations';
import FormationField from '../components/FormationField';

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
  const [teamNames, setTeamNames] = useState({ A: '', B: '', C: '' });
  const [editingTeamName, setEditingTeamName] = useState(null); // 'A' | 'B' | 'C' | null
  const [teamCaptains, setTeamCaptains] = useState({ A: '', B: '', C: '' });

  // 포메이션 관리
  const [clubType, setClubType] = useState('futsal');
  const [clubFormation, setClubFormation] = useState('');
  const [teamFormations, setTeamFormations] = useState({});  // { A: { formationId, players }, B: ... }
  const [selectedPos, setSelectedPos] = useState(null);
  const [expandFormation, setExpandFormation] = useState(null); // 'A' | 'B' | 'C' | null

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
    const off5 = onValue(ref(db, `${base}/TeamNames`), snap => {
      const v = snap.val() || {};
      setTeamNames({ A: v.A || '', B: v.B || '', C: v.C || '' });
    });
    const off6 = onValue(ref(db, `${base}/TeamCaptains`), snap => {
      const v = snap.val() || {};
      setTeamCaptains({ A: v.A || '', B: v.B || '', C: v.C || '' });
    });
    return () => { off1(); off2(); off3(); off4(); off5(); off6(); };
  }, [clubName, dateParam]);

  // 클럽 종목/포메이션 + 경기별 포메이션 로드
  useEffect(() => {
    if (!clubName) return;
    (async () => {
      const clubSnap = await get(ref(db, `clubs/${clubName}`));
      if (clubSnap.exists()) {
        const type = clubSnap.val().type || 'futsal';
        setClubType(type);
        setClubFormation(clubSnap.val().formation || getDefaultFormation(type));
      }
      const tfSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`));
      if (tfSnap.exists()) setTeamFormations(tfSnap.val());
    })();
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
  const getTeamLabel = (code) => teamNames[code] || `팀 ${code}`;
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
                <Box onClick={() => {
                  if (editMode && movingPlayer) handleTeamHeaderClick(code);
                  else if (canEdit && !editMode) setEditingTeamName(editingTeamName === code ? null : code);
                }} sx={{
                  bgcolor: theme[code].bg, color: 'white', textAlign: 'center', fontWeight: 800, py: 0.6, fontSize: '0.9rem',
                  borderRadius: '8px 8px 0 0', cursor: canEdit ? 'pointer' : 'default',
                  border: editMode && movingPlayer && movingPlayer.from !== code ? '2px dashed #FFD54F' : 'none',
                }}>
                  {editingTeamName === code ? (
                    <input
                      autoFocus
                      placeholder={`팀 ${code}`}
                      value={teamNames[code]}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setTeamNames(prev => ({ ...prev, [code]: e.target.value }))}
                      onBlur={async () => {
                        setEditingTeamName(null);
                        await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamNames/${code}`), teamNames[code] || null);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          setEditingTeamName(null);
                          await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamNames/${code}`), teamNames[code] || null);
                        }
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)',
                        borderRadius: 4, color: 'white', textAlign: 'center', fontWeight: 800,
                        fontSize: '0.85rem', width: '90%', padding: '2px 4px', outline: 'none',
                      }}
                    />
                  ) : (
                    <>
                      {getTeamLabel(code)}
                      {canEdit && !editMode && <EditIcon sx={{ fontSize: 12, ml: 0.3, verticalAlign: 'middle', opacity: 0.6 }} />}
                    </>
                  )}
                  {editMode && movingPlayer && movingPlayer.from !== code && <SwapHorizIcon sx={{ fontSize: 14, ml: 0.5, verticalAlign: 'middle' }} />}
                </Box>
                <Box sx={{ border: `1px solid ${theme[code].border}`, borderTop: 'none', bgcolor: theme[code].light, borderRadius: '0 0 8px 8px', p: 0.5, minHeight: 60 }}>
                  {(displayTeams[code] || []).length === 0 ? (
                    <Typography sx={{ color: '#999', textAlign: 'center', py: 2, fontSize: '0.8rem' }}>없음</Typography>
                  ) : (displayTeams[code] || []).map((name, idx) => {
                    const isCaptain = teamCaptains[code] === name;
                    return (
                      <Box key={`${code}-${name}-${idx}`}
                        onClick={() => {
                          if (editMode) handleEditPlayerClick(name, code);
                          else if (canEdit) {
                            const newCap = isCaptain ? '' : name;
                            setTeamCaptains(prev => ({ ...prev, [code]: newCap }));
                            set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamCaptains/${code}`), newCap || null);
                          }
                        }}
                        sx={{
                          bgcolor: movingPlayer?.name === name && movingPlayer?.from === code ? '#FFE082' : isCaptain ? '#FFF3E0' : 'white',
                          border: movingPlayer?.name === name && movingPlayer?.from === code ? '2px solid #F57C00' : isCaptain ? '2px solid #FF9800' : '1px solid rgba(0,0,0,0.08)',
                          borderRadius: 1, px: 0.5, py: 0.5, mb: 0.3, display: 'flex', gap: 0.3, alignItems: 'center', justifyContent: 'center',
                          cursor: canEdit ? 'pointer' : 'default', transition: 'all 0.15s',
                        }}>
                        {isCaptain && <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', color: '#FF9800', mr: 0.2 }}>C</Typography>}
                        <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#888' }}>{idx + 1}.</Typography>
                        <Typography sx={{ fontWeight: isCaptain ? 800 : 600, fontSize: '0.82rem', color: isCaptain ? '#E65100' : 'inherit' }}>{name}</Typography>
                      </Box>
                    );
                  })}
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

          {/* 팀별 포메이션 배치 */}
          {!editMode && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#333', flex: 1 }}>
                  <SportsSoccerIcon sx={{ fontSize: 18, verticalAlign: 'middle', mr: 0.5, color: '#2E7D32' }} />
                  팀별 포메이션
                </Typography>
                {canEdit && (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {['futsal', 'football'].map(t => (
                      <Chip key={t} label={t === 'futsal' ? '풋살' : '축구'} size="small"
                        onClick={async () => {
                          setClubType(t);
                          setClubFormation(getDefaultFormation(t));
                          setTeamFormations({});
                          await update(ref(db), {
                            [`clubs/${clubName}/type`]: t,
                            [`clubs/${clubName}/formation`]: getDefaultFormation(t),
                            [`PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`]: null,
                          });
                        }}
                        sx={{ fontSize: '0.7rem', height: 22, fontWeight: 600,
                          bgcolor: clubType === t ? '#2E7D32' : '#F0F2F5',
                          color: clubType === t ? 'white' : '#777' }} />
                    ))}
                  </Box>
                )}
              </Box>
              {['A', 'B', ...(teamCount === 3 ? ['C'] : [])].map(code => {
                const teamPlayers = displayTeams[code] || [];
                if (teamPlayers.length === 0) return null;
                const tf = teamFormations[code] || {};
                const fmId = tf.formationId || clubFormation || getDefaultFormation(clubType);
                const fmDef = getFormations(clubType)[fmId];
                const assignedPlayers = tf.players || {};
                const isExpanded = expandFormation === code;

                return (
                  <Box key={code} sx={{ mb: 1 }}>
                    <Box onClick={() => { setExpandFormation(isExpanded ? null : code); setSelectedPos(null); }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.8, px: 1,
                        bgcolor: theme[code].light, borderRadius: 1.5, border: `1px solid ${theme[code].border}` }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: theme[code].bg }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', flex: 1 }}>{getTeamLabel(code)} 포메이션</Typography>
                      <Chip label={fmId} size="small" sx={{ fontSize: '0.72rem', height: 20, fontWeight: 600 }} />
                      {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                    </Box>

                    {isExpanded && fmDef && (
                      <Box sx={{ mt: 1, px: 0.5 }}>
                        {/* 포메이션 프리셋 변경 */}
                        {canEdit && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                            {Object.entries(getFormations(clubType)).map(([key, fm]) => (
                              <Chip key={key} label={fm.name} size="small"
                                onClick={async () => {
                                  const newTf = { ...teamFormations, [code]: { formationId: key, players: {} } };
                                  setTeamFormations(newTf);
                                  setSelectedPos(null);
                                  await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), { formationId: key, players: {} });
                                }}
                                sx={{ fontSize: '0.72rem', fontWeight: 600, bgcolor: fmId === key ? '#2E7D32' : '#F0F2F5',
                                  color: fmId === key ? 'white' : '#555', cursor: 'pointer' }} />
                            ))}
                          </Box>
                        )}

                        {/* 안내 메시지 */}
                        {canEdit && selectedPos && expandFormation === code && (
                          <Typography sx={{ fontSize: '0.73rem', color: '#FF9800', fontWeight: 600, mb: 0.5, textAlign: 'center' }}>
                            {assignedPlayers[selectedPos]
                              ? `${fmDef.positions.find(p => p.id === selectedPos)?.label} (${assignedPlayers[selectedPos]}) — 다른 포지션 또는 아래 선수 터치`
                              : `${fmDef.positions.find(p => p.id === selectedPos)?.label} — 아래 선수 터치로 배치`}
                          </Typography>
                        )}

                        {/* 필드 */}
                        <FormationField
                          clubType={clubType}
                          positions={fmDef.positions}
                          players={assignedPlayers}
                          selectedPos={expandFormation === code ? selectedPos : null}
                          onPositionClick={canEdit ? async (posId) => {
                            if (!selectedPos) { setSelectedPos(posId); return; }
                            if (selectedPos === posId) { setSelectedPos(null); return; }
                            const newPlayers = { ...assignedPlayers };
                            const a = newPlayers[selectedPos];
                            const b = newPlayers[posId];
                            if (a) newPlayers[posId] = a; else delete newPlayers[posId];
                            if (b) newPlayers[selectedPos] = b; else delete newPlayers[selectedPos];
                            const newTf = { ...teamFormations, [code]: { formationId: fmId, players: newPlayers } };
                            setTeamFormations(newTf);
                            setSelectedPos(null);
                            await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), newTf[code]);
                          } : undefined}
                          readOnly={!canEdit}
                          width={Math.min(280, window.innerWidth - 80)}
                        />

                        {/* 미배치 선수 목록 */}
                        {canEdit && (
                          <Box sx={{ mt: 1 }}>
                            <Typography sx={{ fontSize: '0.73rem', color: '#999', fontWeight: 600, mb: 0.5 }}>
                              {selectedPos ? '선수 터치로 배치' : '포지션을 먼저 터치'}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
                              {teamPlayers
                                .filter(p => !Object.values(assignedPlayers).includes(p))
                                .map(name => (
                                  <Chip key={name} label={name} size="small"
                                    onClick={async () => {
                                      if (!selectedPos) return;
                                      const newPlayers = { ...assignedPlayers, [selectedPos]: name };
                                      const newTf = { ...teamFormations, [code]: { formationId: fmId, players: newPlayers } };
                                      setTeamFormations(newTf);
                                      setSelectedPos(null);
                                      await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), newTf[code]);
                                    }}
                                    sx={{ fontSize: '0.75rem', fontWeight: 600, cursor: selectedPos ? 'pointer' : 'default',
                                      bgcolor: selectedPos ? '#FFF8E1' : '#F5F5F5', color: selectedPos ? '#F57F17' : '#999',
                                      border: selectedPos ? '1px solid #FFD600' : '1px solid #E0E0E0' }} />
                                ))}
                              {teamPlayers.filter(p => !Object.values(assignedPlayers).includes(p)).length === 0 && (
                                <Typography sx={{ fontSize: '0.72rem', color: '#BBB', fontStyle: 'italic' }}>모든 선수 배치됨</Typography>
                              )}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Paper>
      )}
    </Container>
  );
}

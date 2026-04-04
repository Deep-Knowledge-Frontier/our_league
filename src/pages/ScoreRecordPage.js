import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, set, onValue } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button,
  IconButton, Autocomplete, TextField, List, ListItem, ListItemText,
  ListItemSecondaryAction, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Divider
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowLeftIcon from '@mui/icons-material/ChevronLeft';
import ArrowRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

const OWN_GOAL_LABEL = '자책골';
const NO_MVP = '없음';

function generateMatches(teamNames) {
  const matches = [];
  for (let i = 0; i < teamNames.length - 1; i++)
    for (let j = i + 1; j < teamNames.length; j++)
      matches.push([teamNames[i], teamNames[j]]);
  return matches;
}

export default function ScoreRecordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const teamCountParam = parseInt(searchParams.get('teamCount') || '3', 10);
  const gameParam = parseInt(searchParams.get('game') || '1', 10);

  const { clubName, isAdmin, isModerator } = useAuth();
  const canEdit = isAdmin || isModerator;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gameNumber, setGameNumber] = useState(gameParam);
  const [teamSelections, setTeamSelections] = useState({});
  const [registeredPlayers, setRegisteredPlayers] = useState([]);
  const [goalList1, setGoalList1] = useState([]);
  const [goalList2, setGoalList2] = useState([]);
  const [scorer1, setScorer1] = useState(null);
  const [assist1, setAssist1] = useState(null);
  const [scorer2, setScorer2] = useState(null);
  const [assist2, setAssist2] = useState(null);
  const [editIdx1, setEditIdx1] = useState(-1);
  const [editIdx2, setEditIdx2] = useState(-1);
  const [selectedMvp, setSelectedMvp] = useState(null);
  const [endDialog, setEndDialog] = useState(false);
  const [teamNames, setTeamNames] = useState({ A: '', B: '', C: '' });
  const [customMatchOrder, setCustomMatchOrder] = useState(null);

  useEffect(() => {
    return onValue(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamNames`), snap => {
      const v = snap.val() || {};
      setTeamNames({ A: v.A || '', B: v.B || '', C: v.C || '' });
    });
  }, [clubName, dateParam]);

  useEffect(() => {
    return onValue(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/MatchOrder`), snap => {
      if (snap.exists()) setCustomMatchOrder(snap.val());
    });
  }, [clubName, dateParam]);

  useEffect(() => {
    return onValue(ref(db, `registeredPlayers/${clubName}`), snap => {
      const v = snap.val() || {};
      setRegisteredPlayers(Object.values(v).map(p => p.name).filter(Boolean));
    });
  }, [clubName]);

  useEffect(() => {
    const teamRef = ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/game${gameNumber}`);
    return onValue(teamRef, snap => {
      const v = snap.val();
      if (v) {
        const sel = {};
        Object.entries(v).forEach(([key, players]) => {
          const teamName = key.replace('Team ', '');
          if (Array.isArray(players)) sel[teamName] = [...players, OWN_GOAL_LABEL];
        });
        setTeamSelections(sel);
      } else {
        get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer`)).then(attSnap => {
          const att = attSnap.val() || {};
          const sel = {};
          ['A', 'B', 'C'].forEach(t => {
            if (Array.isArray(att[t]) && att[t].length > 0) sel[t] = [...att[t].filter(Boolean), OWN_GOAL_LABEL];
          });
          setTeamSelections(sel);
        });
      }
      setLoading(false);
    });
  }, [clubName, dateParam, gameNumber]);

  useEffect(() => {
    const gameRef = ref(db, `${clubName}/${dateParam}/game${gameNumber}`);
    return onValue(gameRef, snap => {
      if (snap.exists()) {
        const data = snap.val();
        setGoalList1(Array.isArray(data.goalList1) ? data.goalList1 : []);
        setGoalList2(Array.isArray(data.goalList2) ? data.goalList2 : []);
        setSelectedMvp(data.mvp && data.mvp !== NO_MVP ? data.mvp : null);
      } else {
        setGoalList1([]); setGoalList2([]); setSelectedMvp(null);
      }
      setEditIdx1(-1); setEditIdx2(-1);
      setScorer1(null); setAssist1(null); setScorer2(null); setAssist2(null);
    });
  }, [clubName, dateParam, gameNumber]);

  const getTeamLabel = useCallback((code) => teamNames[code] || `팀 ${code}`, [teamNames]);

  const matches = useMemo(() => {
    if (customMatchOrder && customMatchOrder.length > 0) return customMatchOrder;
    const tn = Object.keys(teamSelections).filter(k => k !== 'all');
    return tn.length < 2 ? [['A', 'B']] : generateMatches(tn);
  }, [teamSelections, customMatchOrder]);

  const currentMatch = useMemo(() => {
    if (gameNumber <= matches.length) return matches[gameNumber - 1] || ['A', 'B'];
    return matches[(gameNumber - 1) % matches.length] || ['A', 'B'];
  }, [matches, gameNumber]);
  const endMatch = useMemo(() => customMatchOrder ? customMatchOrder.length : (teamCountParam === 2 ? 6 : teamCountParam === 3 ? 9 : matches.length), [teamCountParam, matches, customMatchOrder]);

  const team1Options = useMemo(() => {
    const tp = teamSelections[currentMatch[0]] || [];
    return [...tp, ...registeredPlayers.filter(p => !tp.includes(p))];
  }, [teamSelections, currentMatch, registeredPlayers]);

  const team2Options = useMemo(() => {
    const tp = teamSelections[currentMatch[1]] || [];
    return [...tp, ...registeredPlayers.filter(p => !tp.includes(p))];
  }, [teamSelections, currentMatch, registeredPlayers]);

  const mvpOptions = useMemo(() => {
    const combined = [...(teamSelections[currentMatch[0]] || []), ...(teamSelections[currentMatch[1]] || [])];
    return [...new Set(combined.filter(n => n && n !== OWN_GOAL_LABEL))];
  }, [teamSelections, currentMatch]);

  const isTeam1Player = useCallback(n => (teamSelections[currentMatch[0]] || []).includes(n), [teamSelections, currentMatch]);
  const isTeam2Player = useCallback(n => (teamSelections[currentMatch[1]] || []).includes(n), [teamSelections, currentMatch]);

  const syncDailyResultsBackup = useCallback(async () => {
    const snapshot = await get(ref(db, `${clubName}/${dateParam}`));
    if (!snapshot.exists()) return;
    const matchesArr = [];
    const mvpVotes = {};
    snapshot.forEach(gameSnap => {
      if (!String(gameSnap.key).startsWith('game')) return;
      const gd = gameSnap.val() || {};
      const gi = parseInt(String(gameSnap.key).replace('game', ''), 10);
      const mvp = gd.mvp || NO_MVP;
      matchesArr.push({ gameNumber: `${gi}경기`, team1: gd.team1_name || '', team2: gd.team2_name || '', score1: gd.goalCount1 || 0, score2: gd.goalCount2 || 0, mvp });
      if (mvp && mvp !== NO_MVP) mvpVotes[mvp] = (mvpVotes[mvp] || 0) + 1;
    });
    const dailyMvp = Object.keys(mvpVotes).length > 0 ? Object.entries(mvpVotes).sort((a, b) => b[1] - a[1])[0][0] : NO_MVP;
    await set(ref(db, `DailyResultsBackup/${clubName}/${dateParam}`), { matches: matchesArr, dailyMvp });
  }, [clubName, dateParam]);

  const saveToFirebase = useCallback(async (list1, list2, cb, mvp = selectedMvp) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await set(ref(db, `${clubName}/${dateParam}/game${gameNumber}`), {
        team1_name: getTeamLabel(currentMatch[0]), team2_name: getTeamLabel(currentMatch[1]), gameNumber,
        goalList1: list1, goalCount1: list1.length, goalList2: list2, goalCount2: list2.length,
        startTime: -1, gameTime: 0, mvp: mvp || NO_MVP,
      });
      await syncDailyResultsBackup();
      cb?.();
    } catch (e) { alert('저장 실패: ' + e.message); }
    setSaving(false);
  }, [canEdit, currentMatch, gameNumber, clubName, dateParam, selectedMvp, syncDailyResultsBackup]);

  const handleMvpChange = useCallback((_, v) => { setSelectedMvp(v); if (canEdit) saveToFirebase(goalList1, goalList2, null, v); }, [canEdit, goalList1, goalList2, saveToFirebase]);

  const addGoal = useCallback((team) => {
    if (!canEdit) return;
    const scorer = team === 1 ? scorer1 : scorer2;
    const assist = team === 1 ? assist1 : assist2;
    const editIdx = team === 1 ? editIdx1 : editIdx2;
    const setList = team === 1 ? setGoalList1 : setGoalList2;
    const list = team === 1 ? [...goalList1] : [...goalList2];
    const otherList = team === 1 ? goalList2 : goalList1;
    if (!scorer) { alert('골 넣은 선수를 선택해주세요.'); return; }
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let record = `${time} | ${scorer}`;
    if (assist) record += ` - ${assist}`;
    if (editIdx >= 0) list[editIdx] = record; else list.push(record);
    setList(list);
    saveToFirebase(team === 1 ? list : otherList, team === 2 ? list : otherList);
    if (team === 1) { setScorer1(null); setAssist1(null); setEditIdx1(-1); }
    else { setScorer2(null); setAssist2(null); setEditIdx2(-1); }
  }, [canEdit, scorer1, assist1, scorer2, assist2, editIdx1, editIdx2, goalList1, goalList2, saveToFirebase]);

  const deleteGoal = useCallback((team, idx) => {
    if (!canEdit) return;
    const setList = team === 1 ? setGoalList1 : setGoalList2;
    const list = team === 1 ? [...goalList1] : [...goalList2];
    const otherList = team === 1 ? goalList2 : goalList1;
    list.splice(idx, 1);
    setList(list);
    saveToFirebase(team === 1 ? list : otherList, team === 2 ? list : otherList);
  }, [canEdit, goalList1, goalList2, saveToFirebase]);

  const selectGoal = useCallback((team, idx) => {
    const list = team === 1 ? goalList1 : goalList2;
    const parts = list[idx].split(' | ');
    if (parts.length > 1) {
      const names = parts[1].split(' - ');
      if (team === 1) { setScorer1(names[0]?.trim()); setAssist1(names[1]?.trim() || null); setEditIdx1(idx); }
      else { setScorer2(names[0]?.trim()); setAssist2(names[1]?.trim() || null); setEditIdx2(idx); }
    }
  }, [goalList1, goalList2]);

  const GoalInput = ({ team, options, isTeamPlayer, scorer, setScorer, assist, setAssist, editIdx, onAdd }) => (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Autocomplete value={scorer} onChange={(e, v) => setScorer(v)} options={options}
        renderInput={p => <TextField {...p} label="골" size="small" />}
        renderOption={(p, o) => <li {...p} style={{ color: isTeamPlayer(o) ? '#1565C0' : '#333', fontWeight: isTeamPlayer(o) ? 700 : 400 }}>{o}</li>}
        size="small" disabled={!canEdit} sx={{ mb: 0.5 }} />
      <Autocomplete value={assist} onChange={(e, v) => setAssist(v)} options={options}
        renderInput={p => <TextField {...p} label="어시스트" size="small" />}
        renderOption={(p, o) => <li {...p} style={{ color: isTeamPlayer(o) ? '#1565C0' : '#333', fontWeight: isTeamPlayer(o) ? 700 : 400 }}>{o}</li>}
        size="small" disabled={!canEdit} sx={{ mb: 0.5 }} />
      <Button variant="contained" size="small" fullWidth startIcon={editIdx >= 0 ? <EditIcon /> : <AddIcon />}
        onClick={() => onAdd(team)} disabled={!canEdit} sx={{ fontSize: '0.75rem', py: 0.5 }}>
        {editIdx >= 0 ? '수정' : '추가'}
      </Button>
    </Box>
  );

  const GoalList = ({ team, list, onSelect, onDelete }) => (
    <List dense sx={{ maxHeight: 200, overflow: 'auto', bgcolor: '#FAFAFA', borderRadius: 1, mt: 0.5 }}>
      {list.length === 0 ? <ListItem><ListItemText primary="기록 없음" sx={{ color: '#999', textAlign: 'center' }} /></ListItem> : (
        list.map((item, idx) => (
          <ListItem key={idx} onClick={() => onSelect(team, idx)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#EEE' }, borderRadius: 1, mb: 0.3 }}>
            <ListItemText primary={item} primaryTypographyProps={{ fontSize: '0.8rem' }} />
            <ListItemSecondaryAction>
              <IconButton edge="end" size="small" onClick={e => { e.stopPropagation(); onDelete(team, idx); }} disabled={!canEdit} sx={{ color: '#bbb' }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))
      )}
    </List>
  );

  if (loading) return <Container sx={{ mt: 6, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }}>경기 데이터를 불러오는 중...</Typography></Container>;

  return (
    <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <IconButton onClick={() => navigate(`/player-select?date=${dateParam}`)}><ArrowBackIcon /></IconButton>
        <SportsSoccerIcon sx={{ color: '#1565C0' }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.1rem' }}>점수 기록</Typography>
        <Chip label={dateParam} size="small" sx={{ ml: 'auto', fontWeight: 'bold' }} />
      </Box>

      <Paper sx={{ borderRadius: 3, p: 1.5, mb: 2, boxShadow: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <IconButton onClick={() => gameNumber > 1 && setGameNumber(g => g - 1)} disabled={gameNumber <= 1}><ArrowLeftIcon /></IconButton>
          <Typography sx={{ fontWeight: 900, fontSize: '1.3rem', color: '#1565C0' }}>{gameNumber}경기</Typography>
          <IconButton onClick={() => gameNumber >= endMatch ? setEndDialog(true) : canEdit ? saveToFirebase(goalList1, goalList2, () => setGameNumber(g => g + 1)) : setGameNumber(g => g + 1)} disabled={saving}><ArrowRightIcon /></IconButton>
        </Box>
        <Typography sx={{ fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>{getTeamLabel(currentMatch[0])} vs {getTeamLabel(currentMatch[1])}</Typography>
      </Paper>

      <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mb: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: '#1E66D0' }}>{getTeamLabel(currentMatch[0])}</Typography>
            <Typography sx={{ fontWeight: 900, fontSize: '2.5rem', color: '#1E66D0' }}>{goalList1.length}</Typography>
          </Box>
          <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: '#999' }}>:</Typography>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: '#1F7A2E' }}>{getTeamLabel(currentMatch[1])}</Typography>
            <Typography sx={{ fontWeight: 900, fontSize: '2.5rem', color: '#1F7A2E' }}>{goalList2.length}</Typography>
          </Box>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ mb: 2 }}>
          <Autocomplete value={selectedMvp} onChange={handleMvpChange}
            options={selectedMvp && !mvpOptions.includes(selectedMvp) ? [selectedMvp, ...mvpOptions] : mvpOptions}
            renderInput={p => <TextField {...p} label="MVP" size="small" />}
            disabled={!canEdit} clearOnEscape sx={{ backgroundColor: '#fff' }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <GoalInput team={1} options={team1Options} isTeamPlayer={isTeam1Player} scorer={scorer1} setScorer={setScorer1} assist={assist1} setAssist={setAssist1} editIdx={editIdx1} onAdd={addGoal} />
          <GoalInput team={2} options={team2Options} isTeamPlayer={isTeam2Player} scorer={scorer2} setScorer={setScorer2} assist={assist2} setAssist={setAssist2} editIdx={editIdx2} onAdd={addGoal} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E66D0', mb: 0.3 }}>{getTeamLabel(currentMatch[0])} 골 기록</Typography>
            <GoalList team={1} list={goalList1} onSelect={selectGoal} onDelete={deleteGoal} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1F7A2E', mb: 0.3 }}>{getTeamLabel(currentMatch[1])} 골 기록</Typography>
            <GoalList team={2} list={goalList2} onSelect={selectGoal} onDelete={deleteGoal} />
          </Box>
        </Box>
      </Paper>

      {saving && <Box sx={{ textAlign: 'center', py: 1 }}><CircularProgress size={20} /><Typography sx={{ fontSize: '0.8rem', color: '#999' }}>저장 중...</Typography></Box>}

      <Dialog open={endDialog} onClose={() => setEndDialog(false)}>
        <DialogTitle>모든 경기 종료</DialogTitle>
        <DialogContent><Typography>경기 결과 화면으로 이동할까요?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setEndDialog(false)}>아니오</Button>
          <Button variant="contained" startIcon={<EmojiEventsIcon />} onClick={() => canEdit ? saveToFirebase(goalList1, goalList2, () => navigate('/results')) : navigate('/results')}>예</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

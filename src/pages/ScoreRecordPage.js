import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, set, onValue } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Button,
  IconButton, Autocomplete, TextField, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Collapse, Select, MenuItem, FormControl
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowLeftIcon from '@mui/icons-material/ChevronLeft';
import ArrowRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getFormations } from '../config/formations';
import FormationField from '../components/FormationField';

const OWN_GOAL_LABEL = '자책골';
const NO_MVP = '없음';

function generateMatches(teamNames) {
  const matches = [];
  for (let i = 0; i < teamNames.length - 1; i++)
    for (let j = i + 1; j < teamNames.length; j++)
      matches.push([teamNames[i], teamNames[j]]);
  return matches;
}

// 골 기록 파싱 (기존: "HH:MM | scorer - assist", 신규: "N | scorer - assist")
function parseGoalDisplay(item, idx) {
  const parts = item.split(' | ');
  const details = parts.length > 1 ? parts[1] : parts[0];
  const [scorerName, assistName] = details.split(' - ').map(s => s?.trim());
  return { num: idx + 1, scorer: scorerName || '', assist: assistName || '' };
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
  // 경기 중단(그만하기) 다이얼로그
  const [stopDialog, setStopDialog] = useState(false);
  const [teamNames, setTeamNames] = useState({ A: '', B: '', C: '' });
  const [customMatchOrder, setCustomMatchOrder] = useState(null);
  // 6개월 능력치 (abilityScore) 맵 — 무승부 시 MVP 선정용
  const [statsMap, setStatsMap] = useState({});

  // 포메이션 관련 상태
  const [showLineup, setShowLineup] = useState(false);
  const [teamFormations, setTeamFormations] = useState({});
  const [clubType, setClubType] = useState('futsal');
  const [activeFormTeam, setActiveFormTeam] = useState(0); // 0=team1, 1=team2
  const [selectedFormPos, setSelectedFormPos] = useState(null);
  const [posPlayerDialog, setPosPlayerDialog] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);

  // 경기 전환 셋업 다이얼로그 상태
  const [gameSetupOpen, setGameSetupOpen] = useState(false);
  const [setupGameNum, setSetupGameNum] = useState(null);
  const [setupTeamIdx, setSetupTeamIdx] = useState(0);
  const [setupFormPos, setSetupFormPos] = useState(null);
  const [setupPosDialog, setSetupPosDialog] = useState(false);
  const [setupAddPlayerOpen, setSetupAddPlayerOpen] = useState(false);
  const [setupTeams, setSetupTeams] = useState({}); // 개별 경기 팀 구성 (로컬 상태)
  const [setupFormations, setSetupFormations] = useState({}); // 개별 경기 포메이션 (로컬 상태)
  const [initialSetupDone, setInitialSetupDone] = useState(false);

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

  // 6개월 능력치 로드 (무승부 MVP 선정용)
  useEffect(() => {
    if (!clubName) return;
    get(ref(db, `PlayerStatsBackup_6m/${clubName}`)).then((snap) => {
      if (!snap.exists()) { setStatsMap({}); return; }
      const v = snap.val() || {};
      const map = {};
      Object.entries(v).forEach(([name, data]) => {
        map[name] = Number(data?.abilityScore || 0);
      });
      setStatsMap(map);
    }).catch(() => setStatsMap({}));
  }, [clubName]);

  // 포메이션 + 클럽 타입 로드
  useEffect(() => {
    if (!clubName) return;
    get(ref(db, `clubs/${clubName}`)).then(snap => {
      if (snap.exists()) setClubType(snap.val().type || 'futsal');
    }).catch(() => {});
  }, [clubName]);

  // 포메이션 로딩: game-level 우선, 없으면 date-level TeamFormation fallback
  useEffect(() => {
    if (!clubName) return;
    const loadFormations = async () => {
      const gameFormSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/game${gameNumber}/Formation`));
      if (gameFormSnap.exists()) {
        setTeamFormations(gameFormSnap.val());
      } else {
        const tfSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`));
        setTeamFormations(tfSnap.exists() ? tfSnap.val() : {});
      }
    };
    loadFormations();
  }, [clubName, dateParam, gameNumber]);

  const getTeamLabel = useCallback((code) => teamNames[code] || `Team ${code}`, [teamNames]);

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

  // 경기 MVP 선정
  // - 승부 있음: 우승팀 선수 중 공격 포인트(골+어시스트) 1위
  // - 무승부: 양팀 참여 선수 중 6개월 능력치(abilityScore) 1위
  const computeMvp = useCallback((list1, list2) => {
    const winTeam = list1.length > list2.length ? 1 : list2.length > list1.length ? 2 : 0;

    // ── 무승부 또는 양팀 무득점 → 6개월 평점 최고 선수 ──
    if (winTeam === 0) {
      // 현재 경기에 참여 중인 양팀 로스터 수집 (자책골 라벨 제외)
      const roster1 = (teamSelections[currentMatch[0]] || []).filter((p) => p !== OWN_GOAL_LABEL);
      const roster2 = (teamSelections[currentMatch[1]] || []).filter((p) => p !== OWN_GOAL_LABEL);
      const allPlayers = [...roster1, ...roster2];
      if (allPlayers.length === 0) return NO_MVP;

      // 능력치 내림차순 정렬 → 동률 시 이름순
      const sorted = [...allPlayers].sort((a, b) => {
        const sa = statsMap[a] || 0;
        const sb = statsMap[b] || 0;
        return sb - sa || a.localeCompare(b, 'ko');
      });
      return sorted[0] || NO_MVP;
    }

    // ── 승부 있음 → 우승팀 선수 중 공격 포인트 1위 ──
    const winnerList = winTeam === 1 ? list1 : list2;
    const stats = {};
    winnerList.forEach((r) => {
      const parts = r.split(' | ');
      if (parts.length < 2) return;
      const names = parts[1].split(' - ');
      const scorer = names[0]?.trim();
      const assister = names[1]?.trim();
      // 자책골은 우승팀 득점으로 기록되지만 자책 선수는 패배팀 소속이므로 제외
      if (scorer && scorer !== OWN_GOAL_LABEL) {
        stats[scorer] = stats[scorer] || { goals: 0, assists: 0 };
        stats[scorer].goals++;
      }
      if (assister && assister !== OWN_GOAL_LABEL) {
        stats[assister] = stats[assister] || { goals: 0, assists: 0 };
        stats[assister].assists++;
      }
    });

    // 우승팀 선수 중 공격 포인트(골+어시스트) 가장 많은 선수 → 동률 시 골 많은 선수
    const sorted = Object.entries(stats).sort((a, b) => {
      const d = (b[1].goals + b[1].assists) - (a[1].goals + a[1].assists);
      if (d) return d;
      return b[1].goals - a[1].goals;
    });
    return sorted.length > 0 ? sorted[0][0] : NO_MVP;
  }, [teamSelections, currentMatch, statsMap]);

  const isTeam1Player = useCallback(n => (teamSelections[currentMatch[0]] || []).includes(n), [teamSelections, currentMatch]);
  const isTeam2Player = useCallback(n => (teamSelections[currentMatch[1]] || []).includes(n), [teamSelections, currentMatch]);

  // 일일 우승팀 계산 + 해당 팀 선수 중 총 공격 포인트 1위를 일일 MVP로 선정
  const syncDailyResultsBackup = useCallback(async () => {
    const [gamesSnap, rosterSnap, teamNamesSnap] = await Promise.all([
      get(ref(db, `${clubName}/${dateParam}`)),
      get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer`)),
      get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamNames`)),
    ]);
    if (!gamesSnap.exists()) return;

    const matchesArr = [];
    const points = {};   // { teamName: 승점 }
    const gd = {};       // { teamName: 골득실 }
    const gf = {};       // { teamName: 총 득점 }
    const dailyStats = {}; // { playerName: { goals, assists } } — 일일 누적 공격 포인트

    // 골 리스트에서 공격 포인트 집계 (자책골 라벨 제외)
    const countForDaily = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((entry) => {
        const parts = String(entry).split(' | ');
        if (parts.length < 2) return;
        const names = parts[1].split(' - ');
        const scorer = (names[0] || '').trim();
        const assister = (names[1] || '').trim();
        if (scorer && scorer !== OWN_GOAL_LABEL) {
          dailyStats[scorer] = dailyStats[scorer] || { goals: 0, assists: 0 };
          dailyStats[scorer].goals++;
        }
        if (assister && assister !== OWN_GOAL_LABEL) {
          dailyStats[assister] = dailyStats[assister] || { goals: 0, assists: 0 };
          dailyStats[assister].assists++;
        }
      });
    };

    gamesSnap.forEach((gameSnap) => {
      if (!String(gameSnap.key).startsWith('game')) return;
      const g = gameSnap.val() || {};
      const gi = parseInt(String(gameSnap.key).replace('game', ''), 10);
      const t1 = g.team1_name || '';
      const t2 = g.team2_name || '';
      const s1 = Number(g.goalCount1) || 0;
      const s2 = Number(g.goalCount2) || 0;
      const mvp = g.mvp || NO_MVP;

      matchesArr.push({ gameNumber: `${gi}경기`, team1: t1, team2: t2, score1: s1, score2: s2, mvp });

      // 승점 집계
      if (t1) {
        gf[t1] = (gf[t1] || 0) + s1;
        gd[t1] = (gd[t1] || 0) + (s1 - s2);
        points[t1] = (points[t1] || 0) + (s1 > s2 ? 3 : s1 === s2 ? 1 : 0);
      }
      if (t2) {
        gf[t2] = (gf[t2] || 0) + s2;
        gd[t2] = (gd[t2] || 0) + (s2 - s1);
        points[t2] = (points[t2] || 0) + (s2 > s1 ? 3 : s1 === s2 ? 1 : 0);
      }

      // 일일 누적 공격 포인트 (양팀 모두)
      countForDaily(g.goalList1);
      countForDaily(g.goalList2);
    });

    // 일일 우승팀 결정 (승점 → 골득실 → 득점 순)
    const teamEntries = Object.entries(points);
    let dailyWinnerName = null;
    if (teamEntries.length > 0) {
      teamEntries.sort((a, b) =>
        (b[1] - a[1]) ||
        ((gd[b[0]] || 0) - (gd[a[0]] || 0)) ||
        ((gf[b[0]] || 0) - (gf[a[0]] || 0))
      );
      dailyWinnerName = teamEntries[0][0];
    }

    // 일일 우승팀 로스터 매핑 (TeamNames 커스텀명 → 기본 A/B/C → prefix 제거)
    const roster = rosterSnap.exists() ? rosterSnap.val() : {};
    const teamNames = teamNamesSnap.exists() ? teamNamesSnap.val() : {};
    const toArr = (v) => (Array.isArray(v) ? v.filter(Boolean)
                         : v && typeof v === 'object' ? Object.values(v).filter(Boolean)
                         : []);

    let dailyWinnerRoster = [];
    if (dailyWinnerName) {
      for (const code of ['A', 'B', 'C']) {
        if (teamNames[code] === dailyWinnerName) {
          dailyWinnerRoster = toArr(roster[code]);
          break;
        }
      }
      if (dailyWinnerRoster.length === 0 && ['A', 'B', 'C'].includes(dailyWinnerName)) {
        dailyWinnerRoster = toArr(roster[dailyWinnerName]);
      }
      if (dailyWinnerRoster.length === 0) {
        const clean = String(dailyWinnerName).replace(/^(팀\s*|Team\s*)/i, '').trim();
        if (['A', 'B', 'C'].includes(clean)) {
          dailyWinnerRoster = toArr(roster[clean]);
        }
      }
    }

    // 일일 MVP 선정:
    // 1) 일일 우승팀 선수 중
    // 2) 총 공격 포인트(골+어시스트) 최다 → 골 수 → 6개월 평점 → 이름순
    let dailyMvp = NO_MVP;
    if (dailyWinnerRoster.length > 0) {
      const candidates = dailyWinnerRoster.map((name) => ({
        name,
        goals: dailyStats[name]?.goals || 0,
        assists: dailyStats[name]?.assists || 0,
        ability: statsMap[name] || 0,
      }));
      // 기여(골/어시스트)가 있는 선수만 1차 대상. 없으면 평점 최고.
      const contributors = candidates.filter((p) => p.goals + p.assists > 0);
      const pool = contributors.length > 0 ? contributors : candidates;
      pool.sort((a, b) =>
        (b.goals + b.assists) - (a.goals + a.assists) ||
        b.goals - a.goals ||
        b.ability - a.ability ||
        a.name.localeCompare(b.name, 'ko')
      );
      if (pool.length > 0) dailyMvp = pool[0].name;
    }

    await set(ref(db, `DailyResultsBackup/${clubName}/${dateParam}`), { matches: matchesArr, dailyMvp });
  }, [clubName, dateParam, statsMap]);

  const saveToFirebase = useCallback(async (list1, list2, cb) => {
    if (!canEdit) return;
    setSaving(true);
    const mvp = computeMvp(list1, list2);
    setSelectedMvp(mvp === NO_MVP ? null : mvp);
    try {
      await set(ref(db, `${clubName}/${dateParam}/game${gameNumber}`), {
        team1_name: getTeamLabel(currentMatch[0]), team2_name: getTeamLabel(currentMatch[1]), gameNumber,
        goalList1: list1, goalCount1: list1.length, goalList2: list2, goalCount2: list2.length,
        startTime: -1, gameTime: 0, mvp,
      });
      await syncDailyResultsBackup();
      cb?.();
    } catch (e) { alert('저장 실패: ' + e.message); }
    setSaving(false);
  }, [canEdit, currentMatch, gameNumber, clubName, dateParam, computeMvp, syncDailyResultsBackup, getTeamLabel]);

  const addGoal = useCallback((team) => {
    if (!canEdit) return;
    const scorer = team === 1 ? scorer1 : scorer2;
    const assist = team === 1 ? assist1 : assist2;
    const editIdx = team === 1 ? editIdx1 : editIdx2;
    const setList = team === 1 ? setGoalList1 : setGoalList2;
    const list = team === 1 ? [...goalList1] : [...goalList2];
    const otherList = team === 1 ? goalList2 : goalList1;
    if (!scorer) { alert('골 넣은 선수를 선택해주세요.'); return; }
    const seq = editIdx >= 0 ? editIdx + 1 : list.length + 1;
    let record = `${seq} | ${scorer}`;
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

  // 경기 전환 시 상태 즉시 초기화 (레이스 컨디션 방지)
  const navigateToGame = useCallback((newGameNum) => {
    setGoalList1([]);
    setGoalList2([]);
    setSelectedMvp(null);
    setEditIdx1(-1); setEditIdx2(-1);
    setScorer1(null); setAssist1(null); setScorer2(null); setAssist2(null);
    setGameNumber(newGameNum);
  }, []);

  // 다음 경기 셋업 다이얼로그 열기
  const openGameSetup = useCallback(async (nextGameNum) => {
    const nextMatch = matches[(nextGameNum - 1) % matches.length] || ['A', 'B'];
    // game-level 데이터 우선, 없으면 AttandPlayer fallback
    const gameSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/game${nextGameNum}`));
    let teams = {};
    let formations = {};
    if (gameSnap.exists()) {
      const v = gameSnap.val();
      Object.entries(v).forEach(([key, val]) => {
        if (key === 'Formation') {
          formations = val || {};
        } else {
          const code = key.replace('Team ', '');
          if (Array.isArray(val)) teams[code] = val.filter(Boolean);
        }
      });
    } else {
      const attSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer`));
      const att = attSnap.val() || {};
      nextMatch.forEach(code => {
        teams[code] = Array.isArray(att[code]) ? att[code].filter(Boolean) : [];
      });
    }
    // 포메이션 fallback: game-level 없으면 date-level TeamFormation
    if (Object.keys(formations).length === 0) {
      const tfSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`));
      if (tfSnap.exists()) formations = tfSnap.val() || {};
    }
    setSetupGameNum(nextGameNum);
    setSetupTeams(teams);
    setSetupFormations(formations);
    setSetupTeamIdx(0);
    setSetupFormPos(null);
    setSetupPosDialog(false);
    setSetupAddPlayerOpen(false);
    setGameSetupOpen(true);
  }, [matches, clubName, dateParam]);

  // Game 1 진입 시 자동 셋업 다이얼로그
  useEffect(() => {
    if (loading || initialSetupDone || !clubName) return;
    // 이미 기록된 경기면 다이얼로그 안 열기
    get(ref(db, `${clubName}/${dateParam}/game${gameNumber}`)).then(snap => {
      if (!snap.exists()) {
        openGameSetup(gameNumber);
      }
      setInitialSetupDone(true);
    }).catch(() => setInitialSetupDone(true));
  }, [loading, initialSetupDone, clubName, dateParam, gameNumber, openGameSetup]);

  const selectGoal = useCallback((team, idx) => {
    const list = team === 1 ? goalList1 : goalList2;
    const parts = list[idx].split(' | ');
    if (parts.length > 1) {
      const names = parts[1].split(' - ');
      if (team === 1) { setScorer1(names[0]?.trim()); setAssist1(names[1]?.trim() || null); setEditIdx1(idx); }
      else { setScorer2(names[0]?.trim()); setAssist2(names[1]?.trim() || null); setEditIdx2(idx); }
    }
  }, [goalList1, goalList2]);

  // 포메이션 편집
  const activeCode = currentMatch[activeFormTeam];
  const activeTf = teamFormations[activeCode];
  const activeFmDef = activeTf?.formationId ? getFormations(clubType)[activeTf.formationId] : null;
  const activeTeamPlayers = useMemo(() => {
    return (teamSelections[activeCode] || []).filter(p => p !== OWN_GOAL_LABEL);
  }, [teamSelections, activeCode]);

  const handleFormPosClick = useCallback((posId) => {
    if (!canEdit) return;
    setSelectedFormPos(posId);
    setPosPlayerDialog(true);
  }, [canEdit]);

  const handleAssignPlayer = useCallback(async (playerName) => {
    setPosPlayerDialog(false);
    if (!selectedFormPos || !canEdit) return;
    const code = activeCode;
    const tf = { ...teamFormations };
    if (!tf[code]) {
      // 포메이션이 없으면 기본 포메이션 생성
      const defaultId = clubType === 'futsal' ? '1-3-1' : '4-3-3';
      tf[code] = { formationId: defaultId, players: {} };
    }
    tf[code] = { ...tf[code], players: { ...tf[code].players, [selectedFormPos]: playerName || null } };
    setTeamFormations(tf);
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), tf[code]);
    setSelectedFormPos(null);
  }, [selectedFormPos, canEdit, activeCode, teamFormations, clubType, clubName, dateParam]);

  // 포메이션 변경
  const availableFormations = useMemo(() => Object.entries(getFormations(clubType)), [clubType]);

  const handleChangeFormation = useCallback(async (formationId) => {
    if (!canEdit) return;
    const code = activeCode;
    const formations = getFormations(clubType);
    const fmDef = formations[formationId];
    if (!fmDef) return;
    const players = activeTeamPlayers;
    // 간단한 자동 배정: 포지션 순서대로 선수 할당
    const newPlayers = {};
    const posOrder = [...fmDef.positions].sort((a, b) => {
      const pri = (id) => { const u = id.toUpperCase(); if (['FW','ST','ST1','ST2','LW','RW','LF','RF'].includes(u)) return 0; if (['AM','LWB','RWB'].includes(u)) return 1; if (['CM','CM1','CM2','CM3','MF','LM','RM','CDM','CDM1','CDM2','DM'].includes(u)) return 2; if (['CB','CB1','CB2','CB3','DF','LB','RB'].includes(u)) return 3; if (u==='GK') return 4; return 3; };
      return pri(a.id) - pri(b.id);
    });
    const available = [...players];
    posOrder.forEach(pos => {
      if (available.length === 0) return;
      const idx = 0; // 순서대로 배정
      newPlayers[pos.id] = available[idx];
      available.splice(idx, 1);
    });
    const newTf = { formationId, players: newPlayers };
    const tf = { ...teamFormations, [code]: newTf };
    setTeamFormations(tf);
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), newTf);
  }, [canEdit, activeCode, activeTeamPlayers, teamFormations, clubType, clubName, dateParam]);

  // 선수 추가
  const addablePlayersForTeam = useMemo(() => {
    const currentPlayers = (teamSelections[activeCode] || []).filter(p => p !== OWN_GOAL_LABEL);
    return registeredPlayers.filter(p => !currentPlayers.includes(p));
  }, [teamSelections, activeCode, registeredPlayers]);

  const handleAddPlayer = useCallback(async (playerName) => {
    if (!playerName || !canEdit) return;
    const code = activeCode;
    const currentPlayers = (teamSelections[code] || []).filter(p => p !== OWN_GOAL_LABEL);
    if (currentPlayers.includes(playerName)) return;
    const newPlayers = [...currentPlayers, playerName];
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer/${code}`), newPlayers);
    setAddPlayerOpen(false);
  }, [canEdit, activeCode, teamSelections, clubName, dateParam]);

  // 선수 삭제
  const handleRemovePlayer = useCallback(async (playerName) => {
    if (!canEdit) return;
    const code = activeCode;
    const currentPlayers = (teamSelections[code] || []).filter(p => p !== OWN_GOAL_LABEL && p !== playerName);
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer/${code}`), currentPlayers);
    // 포메이션에서도 제거
    const tf = teamFormations[code];
    if (tf?.players) {
      const newFormPlayers = { ...tf.players };
      Object.entries(newFormPlayers).forEach(([posId, name]) => {
        if (name === playerName) delete newFormPlayers[posId];
      });
      const newTf = { ...tf, players: newFormPlayers };
      const allTf = { ...teamFormations, [code]: newTf };
      setTeamFormations(allTf);
      await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), newTf);
    }
  }, [canEdit, activeCode, teamSelections, teamFormations, clubName, dateParam]);

  // === 경기 전환 셋업 다이얼로그 관련 ===
  const setupMatch = useMemo(() => {
    if (!setupGameNum) return ['A', 'B'];
    if (setupGameNum <= matches.length) return matches[setupGameNum - 1] || ['A', 'B'];
    return matches[(setupGameNum - 1) % matches.length] || ['A', 'B'];
  }, [setupGameNum, matches]);

  const setupActiveCode = setupMatch[setupTeamIdx];
  const setupActiveTf = setupFormations[setupActiveCode];
  const setupActiveFmDef = setupActiveTf?.formationId ? getFormations(clubType)[setupActiveTf.formationId] : null;

  const setupActiveTeamPlayers = useMemo(() => {
    return setupTeams[setupActiveCode] || [];
  }, [setupTeams, setupActiveCode]);

  const setupAddablePlayers = useMemo(() => {
    const allUsed = Object.values(setupTeams).flat();
    return registeredPlayers.filter(p => !allUsed.includes(p));
  }, [setupTeams, registeredPlayers]);

  const handleSetupFormPosClick = useCallback((posId) => {
    if (!canEdit) return;
    setSetupFormPos(posId);
    setSetupPosDialog(true);
  }, [canEdit]);

  const handleSetupChangeFormation = useCallback((formationId) => {
    if (!canEdit) return;
    const code = setupActiveCode;
    const formations = getFormations(clubType);
    const fmDef = formations[formationId];
    if (!fmDef) return;
    const players = setupTeams[code] || [];
    const newPlayers = {};
    const posOrder = [...fmDef.positions].sort((a, b) => {
      const pri = (id) => { const u = id.toUpperCase(); if (['FW','ST','ST1','ST2','LW','RW','LF','RF'].includes(u)) return 0; if (['AM','LWB','RWB'].includes(u)) return 1; if (['CM','CM1','CM2','CM3','MF','LM','RM','CDM','CDM1','CDM2','DM'].includes(u)) return 2; if (['CB','CB1','CB2','CB3','DF','LB','RB'].includes(u)) return 3; if (u==='GK') return 4; return 3; };
      return pri(a.id) - pri(b.id);
    });
    const available = [...players];
    posOrder.forEach(pos => {
      if (available.length === 0) return;
      newPlayers[pos.id] = available[0];
      available.splice(0, 1);
    });
    const newTf = { formationId, players: newPlayers };
    setSetupFormations(prev => ({ ...prev, [code]: newTf }));
  }, [canEdit, setupActiveCode, setupTeams, clubType]);

  const handleSetupAssignPlayer = useCallback((playerName) => {
    setSetupPosDialog(false);
    if (!setupFormPos || !canEdit) return;
    const code = setupActiveCode;
    setSetupFormations(prev => {
      const existing = prev[code] || { formationId: clubType === 'futsal' ? '1-3-1' : '4-3-3', players: {} };
      return {
        ...prev,
        [code]: { ...existing, players: { ...existing.players, [setupFormPos]: playerName || null } },
      };
    });
    setSetupFormPos(null);
  }, [setupFormPos, canEdit, setupActiveCode, clubType]);

  const handleSetupAddPlayer = useCallback((playerName) => {
    if (!playerName || !canEdit) return;
    const code = setupActiveCode;
    setSetupTeams(prev => {
      const cur = prev[code] || [];
      if (cur.includes(playerName)) return prev;
      return { ...prev, [code]: [...cur, playerName] };
    });
    setSetupAddPlayerOpen(false);
  }, [canEdit, setupActiveCode]);

  const handleSetupRemovePlayer = useCallback((playerName) => {
    if (!canEdit) return;
    const code = setupActiveCode;
    setSetupTeams(prev => ({
      ...prev,
      [code]: (prev[code] || []).filter(p => p !== playerName),
    }));
  }, [canEdit, setupActiveCode]);

  const handleStartNextGame = useCallback(async () => {
    // 개별 경기 팀 구성 + 포메이션을 game-level에 저장 (AttandPlayer/TeamFormation 변경 없음)
    const nextMatch = matches[(setupGameNum - 1) % matches.length] || ['A', 'B'];
    const gameData = {};
    nextMatch.forEach(code => {
      gameData[`Team ${code}`] = setupTeams[code] || [];
    });
    // 포메이션도 game-level에 저장
    const formationData = {};
    nextMatch.forEach(code => {
      if (setupFormations[code]) formationData[code] = setupFormations[code];
    });
    if (Object.keys(formationData).length > 0) {
      gameData['Formation'] = formationData;
    }
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/game${setupGameNum}`), gameData);
    setGameSetupOpen(false);
    navigateToGame(setupGameNum);
  }, [setupGameNum, setupTeams, setupFormations, matches, clubName, dateParam, navigateToGame]);

  // 팀 색상
  const teamColors = { A: { main: '#1E66D0', bg: '#EAF2FF' }, B: { main: '#1F7A2E', bg: '#EAF7EE' }, C: { main: '#D12A2A', bg: '#FFECEC' } };
  const t1Color = teamColors[currentMatch[0]] || teamColors.A;
  const t2Color = teamColors[currentMatch[1]] || teamColors.B;

  if (loading) return <Container sx={{ mt: 6, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }}>로딩 중...</Typography></Container>;

  return (
    <Box sx={{ bgcolor: '#f0f2f5', minHeight: '100vh', pb: 12 }}>
      {/* 헤더 */}
      <Box sx={{ background: 'linear-gradient(135deg, #0C0950 0%, #1E66D0 100%)', p: 2, pb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <IconButton onClick={() => navigate('/admin')} sx={{ color: 'white', mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: 'white', flex: 1 }}>점수 기록</Typography>
          <Chip label={dateParam} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, mr: 0.8 }} />
          {canEdit && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<StopCircleIcon sx={{ fontSize: '16px !important' }} />}
              onClick={() => setStopDialog(true)}
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.5)',
                fontSize: '0.72rem',
                fontWeight: 700,
                py: 0.3,
                px: 1,
                minWidth: 'auto',
                '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              그만하기
            </Button>
          )}
        </Box>

        {/* 경기 네비게이션 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <IconButton onClick={() => gameNumber > 1 && navigateToGame(gameNumber - 1)} disabled={gameNumber <= 1} sx={{ color: 'white' }}>
            <ArrowLeftIcon />
          </IconButton>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: 'white' }}>{gameNumber}경기</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
              {getTeamLabel(currentMatch[0])} vs {getTeamLabel(currentMatch[1])}
            </Typography>
          </Box>
          <IconButton
            onClick={() => gameNumber >= endMatch ? setEndDialog(true) : openGameSetup(gameNumber + 1)}
            disabled={saving} sx={{ color: 'white' }}>
            <ArrowRightIcon />
          </IconButton>
        </Box>
      </Box>

      <Container maxWidth="sm" sx={{ mt: -2 }}>
        {/* 스코어보드 */}
        <Box sx={{ bgcolor: 'white', borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', p: 2.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            {/* Team 1 */}
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', px: 1.5, py: 0.5, borderRadius: 2, bgcolor: t1Color.main, mb: 0.8 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'white', letterSpacing: '0.03em' }}>{getTeamLabel(currentMatch[0])}</Typography>
              </Box>
              <Typography sx={{ fontWeight: 900, fontSize: '2.8rem', color: t1Color.main, lineHeight: 1 }}>{goalList1.length}</Typography>
            </Box>

            <Typography sx={{ fontWeight: 300, fontSize: '2rem', color: '#ccc', mt: 2.5 }}>:</Typography>

            {/* Team 2 */}
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', px: 1.5, py: 0.5, borderRadius: 2, bgcolor: t2Color.main, mb: 0.8 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'white', letterSpacing: '0.03em' }}>{getTeamLabel(currentMatch[1])}</Typography>
              </Box>
              <Typography sx={{ fontWeight: 900, fontSize: '2.8rem', color: t2Color.main, lineHeight: 1 }}>{goalList2.length}</Typography>
            </Box>
          </Box>

          {/* MVP */}
          {selectedMvp && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1.5, gap: 0.5, bgcolor: '#FFF8E1', borderRadius: 2, py: 0.6, px: 1.5 }}>
              <EmojiEventsIcon sx={{ fontSize: 16, color: '#F57C00' }} />
              <Typography sx={{ fontSize: '0.8rem', color: '#F57C00', fontWeight: 700 }}>MVP: {selectedMvp}</Typography>
            </Box>
          )}
        </Box>

        {/* 골 입력 */}
        <Box sx={{ bgcolor: 'white', borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {[1, 2].map(team => {
              const options = team === 1 ? team1Options : team2Options;
              const isTP = team === 1 ? isTeam1Player : isTeam2Player;
              const sc = team === 1 ? scorer1 : scorer2;
              const setSc = team === 1 ? setScorer1 : setScorer2;
              const as = team === 1 ? assist1 : assist2;
              const setAs = team === 1 ? setAssist1 : setAssist2;
              const eIdx = team === 1 ? editIdx1 : editIdx2;
              const color = team === 1 ? t1Color : t2Color;
              return (
                <Box key={team} sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ height: 3, bgcolor: color.main, borderRadius: 2, mb: 1 }} />
                  <Autocomplete value={sc} onChange={(e, v) => setSc(v)} options={options}
                    renderInput={p => <TextField {...p} placeholder="골" size="small" inputProps={{ ...p.inputProps, readOnly: true }} />}
                    renderOption={(p, o) => <li {...p} style={{ color: isTP(o) ? color.main : '#333', fontWeight: isTP(o) ? 700 : 400 }}>{o}</li>}
                    size="small" disabled={!canEdit} sx={{ mb: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                  <Autocomplete value={as} onChange={(e, v) => setAs(v)} options={options}
                    renderInput={p => <TextField {...p} placeholder="어시스트" size="small" inputProps={{ ...p.inputProps, readOnly: true }} />}
                    renderOption={(p, o) => <li {...p} style={{ color: isTP(o) ? color.main : '#333', fontWeight: isTP(o) ? 700 : 400 }}>{o}</li>}
                    size="small" disabled={!canEdit} sx={{ mb: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                  <Button variant="contained" size="small" fullWidth startIcon={eIdx >= 0 ? <EditIcon /> : <AddIcon />}
                    onClick={() => addGoal(team)} disabled={!canEdit}
                    sx={{ fontSize: '0.75rem', py: 0.5, borderRadius: 2, bgcolor: color.main, '&:hover': { bgcolor: color.main, filter: 'brightness(0.9)' } }}>
                    {eIdx >= 0 ? '수정' : '추가'}
                  </Button>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* 골 기록 */}
        {(goalList1.length > 0 || goalList2.length > 0) && (
          <Box sx={{ bgcolor: 'white', borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {[{ team: 1, list: goalList1, color: t1Color, label: getTeamLabel(currentMatch[0]) },
                { team: 2, list: goalList2, color: t2Color, label: getTeamLabel(currentMatch[1]) }].map(({ team, list, color, label }) => (
                <Box key={team} sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: color.main, mb: 0.5, letterSpacing: '-0.02em' }}>
                    {label} ({list.length})
                  </Typography>
                  {list.length === 0 ? (
                    <Typography sx={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'center', py: 1 }}>-</Typography>
                  ) : (
                    list.map((item, idx) => {
                      const g = parseGoalDisplay(item, idx);
                      return (
                        <Box key={idx}
                          onClick={() => selectGoal(team, idx)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5, px: 0.8,
                            borderRadius: 1.5, cursor: 'pointer', mb: 0.3,
                            bgcolor: (team === 1 ? editIdx1 : editIdx2) === idx ? color.bg : 'transparent',
                            '&:hover': { bgcolor: '#f5f5f5' },
                          }}>
                          <Box sx={{
                            width: 18, height: 18, borderRadius: '50%', bgcolor: color.main,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{g.num}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {g.scorer}{g.assist ? <span style={{ color: '#999', fontWeight: 400 }}> ({g.assist})</span> : ''}
                          </Typography>
                          {canEdit && (
                            <IconButton size="small" onClick={e => { e.stopPropagation(); deleteGoal(team, idx); }}
                              sx={{ p: 0.3, color: '#ccc', '&:hover': { color: '#e53935' } }}>
                              <DeleteIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          )}
                        </Box>
                      );
                    })
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* 라인업 & 포메이션 */}
        <Box sx={{ bgcolor: 'white', borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', mb: 2, overflow: 'hidden' }}>
          <Box
            onClick={() => setShowLineup(!showLineup)}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, cursor: 'pointer', '&:hover': { bgcolor: '#f9f9f9' } }}>
            <GroupsIcon sx={{ color: '#1565C0', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', flex: 1 }}>라인업 & 포메이션</Typography>
            {showLineup ? <ExpandLessIcon sx={{ color: '#999' }} /> : <ExpandMoreIcon sx={{ color: '#999' }} />}
          </Box>

          <Collapse in={showLineup}>
            <Box sx={{ px: 2, pb: 2 }}>
              {/* 팀 탭 */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                {[0, 1].map(i => {
                  const code = currentMatch[i];
                  const color = i === 0 ? t1Color : t2Color;
                  const isActive = activeFormTeam === i;
                  return (
                    <Button key={i} size="small" variant={isActive ? 'contained' : 'outlined'}
                      onClick={() => { setActiveFormTeam(i); setSelectedFormPos(null); }}
                      sx={{
                        flex: 1, borderRadius: 2, fontWeight: 700, fontSize: '0.8rem',
                        bgcolor: isActive ? color.main : 'transparent',
                        borderColor: color.main, color: isActive ? 'white' : color.main,
                        '&:hover': { bgcolor: isActive ? color.main : color.bg, borderColor: color.main },
                      }}>
                      {getTeamLabel(code)}
                    </Button>
                  );
                })}
              </Box>

              {/* 선수 명단 */}
              <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.8 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#666', flex: 1 }}>
                    선수 ({activeTeamPlayers.length}명)
                  </Typography>
                  {canEdit && (
                    <Button size="small" startIcon={<PersonAddIcon sx={{ fontSize: 14 }} />}
                      onClick={() => setAddPlayerOpen(!addPlayerOpen)}
                      sx={{ fontSize: '0.7rem', textTransform: 'none', borderRadius: 2, minWidth: 'auto', py: 0.3 }}>
                      추가
                    </Button>
                  )}
                </Box>

                {/* 선수 추가 Autocomplete */}
                <Collapse in={addPlayerOpen}>
                  <Box sx={{ mb: 1 }}>
                    <Autocomplete
                      options={addablePlayersForTeam}
                      onChange={(e, v) => { if (v) handleAddPlayer(v); }}
                      renderInput={p => <TextField {...p} placeholder="선수 이름 선택" size="small" inputProps={{ ...p.inputProps, readOnly: true }} />}
                      size="small"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  </Box>
                </Collapse>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {activeTeamPlayers.length === 0 ? (
                    <Typography sx={{ fontSize: '0.8rem', color: '#999', py: 1 }}>선수 데이터 없음</Typography>
                  ) : (
                    activeTeamPlayers.map((name, idx) => {
                      const isAssigned = activeTf?.players && Object.values(activeTf.players).includes(name);
                      const color = activeFormTeam === 0 ? t1Color : t2Color;
                      return (
                        <Chip key={idx} label={name} size="small" variant={isAssigned ? 'filled' : 'outlined'}
                          onDelete={canEdit ? () => handleRemovePlayer(name) : undefined}
                          deleteIcon={<PersonRemoveIcon sx={{ fontSize: '14px !important' }} />}
                          sx={{
                            fontSize: '0.75rem', fontWeight: isAssigned ? 700 : 400,
                            bgcolor: isAssigned ? color.bg : 'transparent',
                            borderColor: color.main,
                            color: isAssigned ? color.main : '#666',
                            '& .MuiChip-deleteIcon': { color: '#ccc', '&:hover': { color: '#e53935' } },
                          }} />
                      );
                    })
                  )}
                </Box>
              </Box>

              {/* 포메이션 선택 + 필드 */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <SwapHorizIcon sx={{ fontSize: 16, color: '#999' }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#666' }}>포메이션</Typography>
                  {canEdit ? (
                    <FormControl size="small" sx={{ minWidth: 120, ml: 'auto' }}>
                      <Select
                        value={activeTf?.formationId || ''}
                        onChange={(e) => handleChangeFormation(e.target.value)}
                        displayEmpty
                        sx={{ fontSize: '0.8rem', borderRadius: 2, height: 32 }}
                      >
                        <MenuItem value="" disabled><em>선택</em></MenuItem>
                        {availableFormations.map(([id, fm]) => (
                          <MenuItem key={id} value={id} sx={{ fontSize: '0.8rem' }}>{fm.label || fm.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    activeTf?.formationId && <Chip label={activeTf.formationId} size="small" sx={{ fontWeight: 700, fontSize: '0.75rem', ml: 'auto' }} />
                  )}
                </Box>

                {activeFmDef ? (
                  <FormationField
                    clubType={clubType}
                    positions={activeFmDef.positions}
                    players={activeTf?.players || {}}
                    selectedPos={selectedFormPos}
                    onPositionClick={handleFormPosClick}
                    readOnly={!canEdit}
                    width={Math.min(300, window.innerWidth - 80)}
                  />
                ) : (
                  <Box sx={{ textAlign: 'center', py: 2, bgcolor: '#f9f9f9', borderRadius: 2 }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#999' }}>
                      {canEdit ? '위에서 포메이션을 선택하세요' : '포메이션 미설정'}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Collapse>
        </Box>

        {saving && (
          <Box sx={{ textAlign: 'center', py: 1 }}>
            <CircularProgress size={18} />
            <Typography sx={{ fontSize: '0.75rem', color: '#999', mt: 0.5 }}>저장 중...</Typography>
          </Box>
        )}
      </Container>

      {/* 포메이션 선수 배정 다이얼로그 */}
      <Dialog open={posPlayerDialog} onClose={() => setPosPlayerDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 800 }}>
          {selectedFormPos} 포지션 선수 배정
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
            {activeTeamPlayers.map((name, idx) => {
              const assignedTo = activeTf?.players
                ? Object.entries(activeTf.players).find(([, v]) => v === name)?.[0]
                : null;
              return (
                <Button key={idx} fullWidth variant="outlined" size="small"
                  onClick={() => handleAssignPlayer(name)}
                  sx={{
                    justifyContent: 'flex-start', textTransform: 'none', borderRadius: 2, py: 0.8,
                    borderColor: assignedTo ? '#e0e0e0' : (activeFormTeam === 0 ? t1Color.main : t2Color.main),
                    color: assignedTo === selectedFormPos ? '#F57C00' : '#333',
                    fontWeight: assignedTo === selectedFormPos ? 800 : 400,
                  }}>
                  {name}
                  {assignedTo && assignedTo !== selectedFormPos && (
                    <Typography component="span" sx={{ ml: 'auto', fontSize: '0.7rem', color: '#999' }}>({assignedTo})</Typography>
                  )}
                  {assignedTo === selectedFormPos && (
                    <Typography component="span" sx={{ ml: 'auto', fontSize: '0.7rem', color: '#F57C00', fontWeight: 700 }}>현재</Typography>
                  )}
                </Button>
              );
            })}
            <Button fullWidth variant="text" size="small" color="error"
              onClick={() => handleAssignPlayer(null)}
              sx={{ mt: 0.5, borderRadius: 2 }}>
              비우기
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPosPlayerDialog(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* 경기 전환 셋업 다이얼로그 */}
      <Dialog open={gameSetupOpen} onClose={() => setGameSetupOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}>
        <DialogTitle sx={{ pb: 1, background: 'linear-gradient(135deg, #0C0950 0%, #1E66D0 100%)', color: 'white' }}>
          <Typography sx={{ fontWeight: 900, fontSize: '1.1rem' }}>다음 경기 준비</Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', mt: 0.3 }}>
            {setupGameNum}경기 — {getTeamLabel(setupMatch[0])} vs {getTeamLabel(setupMatch[1])}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 2, py: 1.5 }}>
          {/* 팀 탭 */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, mt: 0.5 }}>
            {[0, 1].map(i => {
              const code = setupMatch[i];
              const color = teamColors[code] || (i === 0 ? teamColors.A : teamColors.B);
              const isActive = setupTeamIdx === i;
              return (
                <Button key={i} size="small" variant={isActive ? 'contained' : 'outlined'}
                  onClick={() => { setSetupTeamIdx(i); setSetupFormPos(null); setSetupAddPlayerOpen(false); }}
                  sx={{
                    flex: 1, borderRadius: 2, fontWeight: 700, fontSize: '0.8rem',
                    bgcolor: isActive ? color.main : 'transparent',
                    borderColor: color.main, color: isActive ? 'white' : color.main,
                    '&:hover': { bgcolor: isActive ? color.main : color.bg, borderColor: color.main },
                  }}>
                  {getTeamLabel(code)}
                </Button>
              );
            })}
          </Box>

          {/* 선수 명단 */}
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.8 }}>
              <GroupsIcon sx={{ fontSize: 16, color: '#666', mr: 0.5 }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#666', flex: 1 }}>
                선수 ({setupActiveTeamPlayers.length}명)
              </Typography>
              {canEdit && (
                <Button size="small" startIcon={<PersonAddIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setSetupAddPlayerOpen(!setupAddPlayerOpen)}
                  sx={{ fontSize: '0.7rem', textTransform: 'none', borderRadius: 2, minWidth: 'auto', py: 0.3 }}>
                  추가
                </Button>
              )}
            </Box>

            <Collapse in={setupAddPlayerOpen}>
              <Box sx={{ mb: 1 }}>
                <Autocomplete
                  options={setupAddablePlayers}
                  onChange={(e, v) => { if (v) handleSetupAddPlayer(v); }}
                  renderInput={p => <TextField {...p} placeholder="선수 이름 선택" size="small" inputProps={{ ...p.inputProps, readOnly: true }} />}
                  size="small"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Box>
            </Collapse>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {setupActiveTeamPlayers.length === 0 ? (
                <Typography sx={{ fontSize: '0.8rem', color: '#999', py: 1 }}>선수 데이터 없음</Typography>
              ) : (
                setupActiveTeamPlayers.map((name, idx) => {
                  const isAssigned = setupActiveTf?.players && Object.values(setupActiveTf.players).includes(name);
                  const color = teamColors[setupActiveCode] || teamColors.A;
                  return (
                    <Chip key={idx} label={name} size="small" variant={isAssigned ? 'filled' : 'outlined'}
                      onDelete={canEdit ? () => handleSetupRemovePlayer(name) : undefined}
                      deleteIcon={<PersonRemoveIcon sx={{ fontSize: '14px !important' }} />}
                      sx={{
                        fontSize: '0.75rem', fontWeight: isAssigned ? 700 : 400,
                        bgcolor: isAssigned ? color.bg : 'transparent',
                        borderColor: color.main,
                        color: isAssigned ? color.main : '#666',
                        '& .MuiChip-deleteIcon': { color: '#ccc', '&:hover': { color: '#e53935' } },
                      }} />
                  );
                })
              )}
            </Box>
          </Box>

          {/* 포메이션 선택 + 필드 */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SwapHorizIcon sx={{ fontSize: 16, color: '#999' }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#666' }}>포메이션</Typography>
              {canEdit ? (
                <FormControl size="small" sx={{ minWidth: 120, ml: 'auto' }}>
                  <Select
                    value={setupActiveTf?.formationId || ''}
                    onChange={(e) => handleSetupChangeFormation(e.target.value)}
                    displayEmpty
                    sx={{ fontSize: '0.8rem', borderRadius: 2, height: 32 }}
                  >
                    <MenuItem value="" disabled><em>선택</em></MenuItem>
                    {availableFormations.map(([id, fm]) => (
                      <MenuItem key={id} value={id} sx={{ fontSize: '0.8rem' }}>{fm.label || fm.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                setupActiveTf?.formationId && <Chip label={setupActiveTf.formationId} size="small" sx={{ fontWeight: 700, fontSize: '0.75rem', ml: 'auto' }} />
              )}
            </Box>

            {setupActiveFmDef ? (
              <FormationField
                clubType={clubType}
                positions={setupActiveFmDef.positions}
                players={setupActiveTf?.players || {}}
                selectedPos={setupFormPos}
                onPositionClick={handleSetupFormPosClick}
                readOnly={!canEdit}
                width={Math.min(280, window.innerWidth - 100)}
              />
            ) : (
              <Box sx={{ textAlign: 'center', py: 2, bgcolor: '#f9f9f9', borderRadius: 2 }}>
                <Typography sx={{ fontSize: '0.8rem', color: '#999' }}>
                  {canEdit ? '위에서 포메이션을 선택하세요' : '포메이션 미설정'}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={() => setGameSetupOpen(false)} sx={{ borderRadius: 2, color: '#666' }}>취소</Button>
          <Button variant="contained" onClick={handleStartNextGame}
            endIcon={<ArrowRightIcon />}
            sx={{ borderRadius: 2, fontWeight: 700, px: 3, background: 'linear-gradient(135deg, #0C0950 0%, #1E66D0 100%)' }}>
            경기 시작
          </Button>
        </DialogActions>
      </Dialog>

      {/* 셋업 포지션 선수 배정 다이얼로그 */}
      <Dialog open={setupPosDialog} onClose={() => setSetupPosDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 800 }}>
          {setupFormPos} 포지션 선수 배정
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
            {setupActiveTeamPlayers.map((name, idx) => {
              const assignedTo = setupActiveTf?.players
                ? Object.entries(setupActiveTf.players).find(([, v]) => v === name)?.[0]
                : null;
              const color = teamColors[setupActiveCode] || teamColors.A;
              return (
                <Button key={idx} fullWidth variant="outlined" size="small"
                  onClick={() => handleSetupAssignPlayer(name)}
                  sx={{
                    justifyContent: 'flex-start', textTransform: 'none', borderRadius: 2, py: 0.8,
                    borderColor: assignedTo ? '#e0e0e0' : color.main,
                    color: assignedTo === setupFormPos ? '#F57C00' : '#333',
                    fontWeight: assignedTo === setupFormPos ? 800 : 400,
                  }}>
                  {name}
                  {assignedTo && assignedTo !== setupFormPos && (
                    <Typography component="span" sx={{ ml: 'auto', fontSize: '0.7rem', color: '#999' }}>({assignedTo})</Typography>
                  )}
                  {assignedTo === setupFormPos && (
                    <Typography component="span" sx={{ ml: 'auto', fontSize: '0.7rem', color: '#F57C00', fontWeight: 700 }}>현재</Typography>
                  )}
                </Button>
              );
            })}
            <Button fullWidth variant="text" size="small" color="error"
              onClick={() => handleSetupAssignPlayer(null)}
              sx={{ mt: 0.5, borderRadius: 2 }}>
              비우기
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetupPosDialog(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* 경기 종료 다이얼로그 */}
      <Dialog open={endDialog} onClose={() => setEndDialog(false)}>
        <DialogTitle>모든 경기 종료</DialogTitle>
        <DialogContent><Typography>경기 결과 화면으로 이동할까요?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setEndDialog(false)}>아니오</Button>
          <Button variant="contained" startIcon={<EmojiEventsIcon />}
            onClick={() => canEdit ? saveToFirebase(goalList1, goalList2, () => navigate('/results')) : navigate('/results')}>
            예
          </Button>
        </DialogActions>
      </Dialog>

      {/* 경기 중단(그만하기) 다이얼로그 */}
      <Dialog open={stopDialog} onClose={() => setStopDialog(false)}>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StopCircleIcon sx={{ color: '#F57C00' }} />
            경기 그만하기
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', mb: 1 }}>
            지금까지 기록한 <b>{gameNumber}경기</b>까지의 결과를 저장하고 나가시겠습니까?
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#666' }}>
            • 현재 입력한 골/어시스트는 자동 저장됩니다<br />
            • 나머지 경기는 나중에 이어서 기록할 수 있어요<br />
            • 경기운영 화면으로 돌아갑니다
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopDialog(false)}>계속 기록</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<StopCircleIcon />}
            onClick={() => {
              if (canEdit) {
                saveToFirebase(goalList1, goalList2, () => navigate(`/player-select?date=${dateParam}`));
              } else {
                navigate(`/player-select?date=${dateParam}`);
              }
            }}
          >
            저장하고 나가기
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, set, get, onValue, update, remove } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button,
  Chip, IconButton, ToggleButton, ToggleButtonGroup, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ShieldIcon from '@mui/icons-material/Shield';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RestoreIcon from '@mui/icons-material/Restore';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ShareIcon from '@mui/icons-material/Share';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { softmaxPercent, averageExcludeZero } from '../utils/stats';
import { getFormations, getDefaultFormation } from '../config/formations';
import FormationField from '../components/FormationField';
import { shareFormationImage } from '../utils/shareFormation';

const DRAFT_HIGH_ATTEND_THRESHOLD = 3;
const MATCHES_PER_TEAM = 6;

// 팀 선수들의 pointRate 평균 (0 제외)
const avgExcludeNull = (names, statsMap) =>
  averageExcludeZero(names, (n) => statsMap[n]?.pointRate);

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

/* ── AI 최적 팀 편성: 스왑 최적화 (개인 능력 균형 + 시너지) ── */
const MIN_SYNERGY_GAMES = 10; // 동반 승률 최소 경기수
const SYNERGY_WEIGHT = 0.3;   // 시너지 가중치 (0~1)

function optimizeTeams(initialTeams, teamCount, statsMap, networkData, maxIter = 100) {
  const teams = initialTeams.map(t => [...t]);

  // 팀 내 2인 조합 평균 동반승률
  const calcSynergy = (team) => {
    if (!networkData || team.length < 2) return 50;
    let sum = 0, cnt = 0;
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const a = team[i], b = team[j];
        const edge = networkData[a]?.[b] || networkData[b]?.[a];
        if (edge && edge.games >= MIN_SYNERGY_GAMES) {
          sum += edge.winRate;
          cnt++;
        }
      }
    }
    return cnt > 0 ? sum / cnt : 50; // 데이터 없으면 중립(50%)
  };

  // 팀 점수: 능력 + 시너지
  const calcTeamScore = (team) => {
    const avgAbility = team.length > 0
      ? team.reduce((s, n) => s + (statsMap[n]?.abilityScore || 0), 0) / team.length
      : 0;
    const synergy = calcSynergy(team);
    return avgAbility + SYNERGY_WEIGHT * synergy;
  };

  // 비용: 팀 점수 분산 (낮을수록 균등)
  const calcCost = () => {
    const scores = teams.slice(0, teamCount).map(calcTeamScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return scores.reduce((s, v) => s + (v - mean) ** 2, 0);
  };

  let bestCost = calcCost();

  for (let iter = 0; iter < maxIter; iter++) {
    let improved = false;
    // 모든 팀 쌍에서 선수 교환 시도
    for (let ti = 0; ti < teamCount; ti++) {
      for (let tj = ti + 1; tj < teamCount; tj++) {
        for (let pi = 0; pi < teams[ti].length; pi++) {
          for (let pj = 0; pj < teams[tj].length; pj++) {
            // 교환
            [teams[ti][pi], teams[tj][pj]] = [teams[tj][pj], teams[ti][pi]];
            const newCost = calcCost();
            if (newCost < bestCost - 0.001) {
              bestCost = newCost;
              improved = true;
            } else {
              // 원복
              [teams[ti][pi], teams[tj][pj]] = [teams[tj][pj], teams[ti][pi]];
            }
          }
        }
      }
    }
    if (!improved) break;
  }

  // 시너지 정보 반환
  const synergyScores = teams.slice(0, teamCount).map(calcSynergy);
  return { teams, synergyScores };
}

// 포지션 ID → 역할 점수 (공격 vs 수비 가중치)
function getPositionScore(posId, stats) {
  const atk = stats?.finalAttack || 50;
  const def = stats?.finalDefense || 50;
  const bal = stats?.finalBalance || 50;
  const stm = stats?.finalStamina || 50;
  const id = posId.toUpperCase();
  if (id === 'GK') return def * 0.5 + stm * 0.3 + bal * 0.2;
  if (['CB', 'CB1', 'CB2', 'CB3', 'DF', 'LB', 'RB'].includes(id)) return def * 0.5 + bal * 0.3 + stm * 0.2;
  if (['CDM', 'CDM1', 'CDM2', 'DM'].includes(id)) return def * 0.4 + bal * 0.3 + atk * 0.3;
  if (['CM', 'CM1', 'CM2', 'CM3', 'MF', 'LM', 'RM'].includes(id)) return bal * 0.3 + atk * 0.35 + def * 0.35;
  if (['AM', 'LWB', 'RWB'].includes(id)) return atk * 0.4 + bal * 0.3 + def * 0.3;
  if (['FW', 'ST', 'ST1', 'ST2', 'LW', 'RW', 'LF', 'RF'].includes(id)) return atk * 0.6 + bal * 0.2 + stm * 0.2;
  return bal;
}

// 등록 포지션 기반 스마트 배치 (축구 쿼터용)
// 선수의 registeredPlayers.position과 포메이션 포지션을 매칭
function smartAutoAssign(positions, teamPlayers, playerPositions) {
  const assigned = {};
  const available = new Set(teamPlayers);

  // 포지션 카테고리 매핑: 등록 포지션 → 포메이션 포지션 호환성
  const categoryOf = (id) => {
    const u = (id || '').toUpperCase();
    if (u === 'GK') return 'GK';
    if (['CB', 'CB1', 'CB2', 'CB3', 'DF', 'LB', 'RB', 'LWB', 'RWB'].includes(u)) return 'DF';
    if (['CDM', 'CDM1', 'CDM2', 'DM', 'CM', 'CM1', 'CM2', 'CM3', 'MF', 'LM', 'RM'].includes(u)) return 'MF';
    if (['AM', 'CAM'].includes(u)) return 'AM';
    if (['FW', 'ST', 'ST1', 'ST2', 'LW', 'RW', 'LF', 'RF'].includes(u)) return 'FW';
    return 'MF';
  };

  // GK 먼저, 그 다음 DF → MF → FW 순으로 배치 (구체적 포지션 우선)
  const sorted = [...positions].sort((a, b) => {
    const pri = (id) => { const c = categoryOf(id); return c === 'GK' ? 0 : c === 'DF' ? 1 : c === 'MF' ? 2 : c === 'AM' ? 3 : 4; };
    return pri(a.id) - pri(b.id);
  });

  for (const pos of sorted) {
    if (available.size === 0) break;
    const posCat = categoryOf(pos.id);

    // 1순위: 등록 포지션 카테고리가 정확히 일치하는 선수
    let bestPlayer = null;
    for (const player of available) {
      const regPos = playerPositions[player] || '';
      if (categoryOf(regPos) === posCat) { bestPlayer = player; break; }
    }
    // 2순위: 없으면 아무나 (남은 선수 중 첫 번째)
    if (!bestPlayer) bestPlayer = [...available][0];

    if (bestPlayer) {
      assigned[pos.id] = bestPlayer;
      available.delete(bestPlayer);
    }
  }
  return assigned;
}

function autoAssignPlayers(positions, teamPlayers, statsMap) {
  const players = {};
  const available = [...teamPlayers];
  // 포지션별로 가장 적합한 선수 매칭 (탐욕 알고리즘)
  const posOrder = [...positions].sort((a, b) => {
    // 공격→미드→수비 순으로 배치, GK는 맨 마지막 (남은 선수가 GK)
    const priority = (id) => {
      const u = id.toUpperCase();
      if (['FW', 'ST', 'ST1', 'ST2', 'LW', 'RW', 'LF', 'RF'].includes(u)) return 0;
      if (['AM', 'LWB', 'RWB'].includes(u)) return 1;
      if (['CDM', 'CDM1', 'CDM2', 'DM', 'CM', 'CM1', 'CM2', 'CM3', 'MF', 'LM', 'RM'].includes(u)) return 2;
      if (['CB', 'CB1', 'CB2', 'CB3', 'DF', 'LB', 'RB'].includes(u)) return 3;
      if (u === 'GK') return 4;
      return 3;
    };
    return priority(a.id) - priority(b.id);
  });

  for (const pos of posOrder) {
    if (available.length === 0) break;
    let bestIdx = 0;
    let bestScore = -1;
    available.forEach((name, idx) => {
      const score = getPositionScore(pos.id, statsMap[name]);
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    });
    players[pos.id] = available[bestIdx];
    available.splice(bestIdx, 1);
  }
  return players;
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
  const { clubName, userName, isAdmin, isModerator, isMaster } = useAuth();
  const canEdit = isAdmin || isModerator;
  // 주장은 자기 팀의 포메이션만 편집 가능 (선수 구성/경기순서는 admin 전용)
  const canEditTeamFormation = (code) => canEdit || (!!userName && teamCaptains?.[code] === userName);

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
  const [matchOrder, setMatchOrder] = useState([]);  // [['A','B'], ['A','C'], ['B','C']]
  // 해당 경기일에 이미 기록된 경기 결과가 있는지 (DailyResultsBackup 체크)
  const [hasMatchResults, setHasMatchResults] = useState(false);
  const [swapMatch, setSwapMatch] = useState(null);  // index of match being swapped

  // 포메이션 관리
  const [clubType, setClubType] = useState('futsal');
  const [clubFormation, setClubFormation] = useState('');
  const [teamFormations, setTeamFormations] = useState({});

  // 🆕 포메이션 시스템 (축구: 쿼터 / 풋살: 경기)
  const [formationEnabled, setFormationEnabled] = useState(false);
  const useQuarterSystem = teamCount === 2 && formationEnabled;
  // 쿼터/경기 라벨: 축구 = "Q1", 풋살 = "1경기"
  const getQuarterLabel = (qKey) => {
    const n = qKey.replace('Q', '');
    return clubType === 'football' ? qKey : `${n}경기`;
  };
  const [quarterCount, setQuarterCount] = useState(1);
  const [quarterFormations, setQuarterFormations] = useState({}); // { A: { Q1: {...}, Q2: {...} }, B: {...} }
  const [teamQuarterTab, setTeamQuarterTab] = useState({ A: 'Q1', B: 'Q1' }); // 팀별 쿼터 기억
  const [networkData, setNetworkData] = useState(null);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [isAiOptimized, setIsAiOptimized] = useState(false);
  const [synergyScores, setSynergyScores] = useState(null);  // { A: { formationId, players }, B: ... }
  const [selectedPos, setSelectedPos] = useState(null);
  const [expandFormation, setExpandFormation] = useState(null); // 'A' | 'B' | 'C' | null

  // expandFormation 선언 이후에 파생값 계산
  const activeQuarterTab = teamQuarterTab[expandFormation === 'B' ? 'B' : 'A'] || 'Q1';
  const setActiveQuarterTab = (qKey) => {
    const teamCode = expandFormation === 'B' ? 'B' : 'A';
    setTeamQuarterTab(prev => ({ ...prev, [teamCode]: qKey }));
  };

  // 쿼터 탭 전환 시: 해당 쿼터의 포메이션을 TeamFormation 뷰에 반영
  useEffect(() => {
    if (!useQuarterSystem || quarterCount <= 1) return;
    const newTf = {};
    ['A', 'B'].forEach((code) => {
      const qKey = teamQuarterTab[code] || 'Q1';
      if (quarterFormations?.[code]?.[qKey]) {
        newTf[code] = quarterFormations[code][qKey];
      }
    });
    if (Object.keys(newTf).length > 0) {
      setTeamFormations((prev) => ({ ...prev, ...newTf }));
    }
  }, [teamQuarterTab, useQuarterSystem, quarterCount, quarterFormations]);
  // 선수별 등록 포지션 맵 { '테스트GK1': 'GK', '테스트DF1': 'DF', ... }
  const [playerPositions, setPlayerPositions] = useState({});

  useEffect(() => {
    return onValue(ref(db, `registeredPlayers/${clubName}`), snap => {
      const v = snap.val() || {};
      const entries = Object.values(v);
      setRegisteredPlayers(entries.map(p => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')));
      // 포지션 맵 구성
      const posMap = {};
      entries.forEach(p => { if (p.name && p.position) posMap[p.name] = p.position; });
      setPlayerPositions(posMap);
    });
  }, [clubName]);

  // 해당 경기일에 이미 기록된 경기 결과가 있는지 체크 (실시간)
  useEffect(() => {
    if (!clubName || !dateParam) return;
    return onValue(ref(db, `DailyResultsBackup/${clubName}/${dateParam}`), (snap) => {
      if (!snap.exists()) { setHasMatchResults(false); return; }
      const v = snap.val();
      const matches = v?.matches;
      const hasAny = Array.isArray(matches)
        ? matches.length > 0
        : matches && Object.keys(matches).length > 0;
      setHasMatchResults(!!hasAny);
    });
  }, [clubName, dateParam]);

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
          finalAttack: data.finalAttack || 50,
          finalDefense: data.finalDefense || 50,
          finalStamina: data.finalStamina || 50,
          finalBalance: data.finalBalance || 50,
          finalContribution: data.finalContribution || 50,
        };
      });
      setStatsMap(map);
    });
  }, [clubName]);

  // PlayerNetworkGraph 로드 (시너지 데이터)
  useEffect(() => {
    if (!clubName) return;
    get(ref(db, `PlayerNetworkGraph/${clubName}`)).then(snap => {
      if (snap.exists()) setNetworkData(snap.val());
    }).catch(() => {});
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
      // 저장된 팀 구성에서 팀수 복원 (C팀 유무로 판단)
      if (a.length > 0 || b.length > 0) {
        setTeamCount(c.length > 0 ? 3 : 2);
      }
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
    const off7 = onValue(ref(db, `${base}/MatchOrder`), snap => {
      if (snap.exists()) setMatchOrder(snap.val());
    });
    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); };
  }, [clubName, dateParam]);

  // 클럽 종목/포메이션 + 경기별 포메이션 + 쿼터 설정 로드
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
      // 🆕 쿼터 설정 로드
      const qcSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterConfig`));
      if (qcSnap.exists()) {
        const qc = qcSnap.val();
        setQuarterCount(qc.count || 1);
      }
      const qfSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation`));
      if (qfSnap.exists()) setQuarterFormations(qfSnap.val());
      // 포메이션 활성화 여부 로드
      const feSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/FormationEnabled`));
      setFormationEnabled(feSnap.val() === true);
    })();
  }, [clubName, dateParam]);

  // 팀이 있는데 포메이션이 비어있으면 자동 배치 (2팀은 formationEnabled일 때만)
  useEffect(() => {
    if (!hasSavedTeams || Object.keys(teamFormations).length > 0) return;
    if (!clubType || teams.A.length === 0) return;
    if (teamCount === 2 && !formationEnabled) return;
    const fmId = clubFormation || getDefaultFormation(clubType);
    const fmDef = getFormations(clubType)[fmId];
    if (!fmDef) return;
    const codes = teams.C.length > 0 ? ['A', 'B', 'C'] : ['A', 'B'];
    const newTf = {};
    codes.forEach(code => {
      const teamPlayers = teams[code] || [];
      if (teamPlayers.length > 0) {
        newTf[code] = { formationId: fmId, players: autoAssignPlayers(fmDef.positions, teamPlayers, statsMap) };
      }
    });
    if (Object.keys(newTf).length > 0) {
      setTeamFormations(newTf);
      set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`), newTf);
    }
  }, [hasSavedTeams, teamFormations, teams, clubType, clubFormation, statsMap, clubName, dateParam, teamCount, formationEnabled]);

  // 참여선수 = 등록선수 + 이 경기일의 등록 용병 (스탯 기록만 있는 과거 선수는 제외)
  const playerList = useMemo(() => {
    const guestNames = guests.map(g => `${g} (용병)`);
    return [...registeredPlayers, ...guestNames];
  }, [registeredPlayers, guests]);

  const selectedCount = useMemo(() => Object.values(selectedPlayers).filter(Boolean).length, [selectedPlayers]);

  // 풋살: 참여선수 수에 따라 팀 수 자동 추천 (14명 이하 → 2팀, 15명+ → 3팀)
  // 이미 팀 편성이 저장된 경우에는 자동 변경 안 함 (관리자 수동 우선)
  useEffect(() => {
    if (clubType !== 'futsal') return;
    if (hasSavedTeams) return; // 이미 편성된 팀이 있으면 건드리지 않음
    if (selectedCount <= 0) return;
    const recommended = selectedCount <= 14 ? 2 : 3;
    setTeamCount(recommended);
  }, [selectedCount, clubType, hasSavedTeams]);

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

  // 참석선수 변동 시 팀 자동 조정
  useEffect(() => {
    if (!hasSavedTeams || editMode) return;
    const currentSelected = new Set(Object.entries(selectedPlayers).filter(([, v]) => v).map(([k]) => k));
    if (currentSelected.size === 0) return;

    const allTeamMembers = [...teams.A, ...teams.B, ...teams.C];
    if (allTeamMembers.length === 0) return;

    const removed = allTeamMembers.filter(n => !currentSelected.has(n));
    const added = [...currentSelected].filter(n => !allTeamMembers.includes(n));
    if (removed.length === 0 && added.length === 0) return;

    const codes = teamCount === 3 ? ['A', 'B', 'C'] : ['A', 'B'];
    const newTeams = {};
    codes.forEach(code => {
      newTeams[code] = teams[code].filter(n => currentSelected.has(n));
    });
    added.forEach(name => {
      const minCode = codes.reduce((a, b) => (newTeams[a].length <= newTeams[b].length ? a : b));
      newTeams[minCode].push(name);
    });
    if (teamCount === 2) newTeams.C = [];

    setTeams(newTeams);
    // 포메이션도 재배치
    const fmId = clubFormation || getDefaultFormation(clubType);
    const fmDef = getFormations(clubType)[fmId];
    if (fmDef) {
      const newTf = {};
      codes.forEach(code => {
        const existing = teamFormations[code];
        const useFmId = existing?.formationId || fmId;
        const useFmDef = getFormations(clubType)[useFmId] || fmDef;
        if (newTeams[code].length > 0) {
          newTf[code] = { formationId: useFmId, players: autoAssignPlayers(useFmDef.positions, newTeams[code], statsMap) };
        }
      });
      setTeamFormations(newTf);
      update(ref(db), { [`PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`]: newTf });
    }
    const base = `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer`;
    const updates = {};
    updates[`${base}/A`] = newTeams.A;
    updates[`${base}/B`] = newTeams.B;
    updates[`${base}/C`] = teamCount === 3 ? newTeams.C : null;
    update(ref(db), updates);
  }, [selectedPlayers, hasSavedTeams, editMode, teams, teamCount, clubName, dateParam, clubFormation, clubType, teamFormations, statsMap]);

  const generateDefaultMatchOrder = useCallback((tc) => {
    const codes = tc === 3 ? ['A', 'B', 'C'] : ['A', 'B'];
    const order = [];
    for (let i = 0; i < codes.length - 1; i++)
      for (let j = i + 1; j < codes.length; j++)
        order.push([codes[i], codes[j]]);
    // 3팀: AvB, AvC, BvC → 3라운드 반복 = 9경기
    const rounds = tc === 2 ? 6 : 3;
    const full = [];
    for (let r = 0; r < rounds; r++) full.push(...order);
    return full;
  }, []);

  const runDraft = useCallback(() => {
    const picked = Object.entries(selectedPlayers).filter(([, v]) => v).map(([k]) => k);
    if (picked.length < 2) { alert('최소 2명 이상 선택해주세요.'); return; }
    const result = snakeDraft(picked, teamCount, statsMap);
    const newTeams = { A: result[0] || [], B: result[1] || [], C: teamCount === 3 ? (result[2] || []) : [] };
    setTeams(newTeams);
    setKeyPop(pickTwoRandom(picked));
    if (matchOrder.length === 0) {
      const order = generateDefaultMatchOrder(teamCount);
      setMatchOrder(order);
    }
    // 팀별 포메이션 자동 배치
    const fmId = clubFormation || getDefaultFormation(clubType);
    const fmDef = getFormations(clubType)[fmId];
    if (fmDef) {
      const newTf = {};
      ['A', 'B', ...(teamCount === 3 ? ['C'] : [])].forEach(code => {
        const teamPlayers = newTeams[code] || [];
        if (teamPlayers.length > 0) {
          newTf[code] = { formationId: fmId, players: autoAssignPlayers(fmDef.positions, teamPlayers, statsMap) };
        }
      });
      setTeamFormations(newTf);
      set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`), newTf);
    }
    setShowResult(true);
    setIsAiOptimized(false);
    setSynergyScores(null);
  }, [selectedPlayers, teamCount, statsMap, matchOrder, generateDefaultMatchOrder, clubFormation, clubType, clubName, dateParam]);

  const runAiDraft = useCallback(() => {
    const picked = Object.entries(selectedPlayers).filter(([, v]) => v).map(([k]) => k);
    if (picked.length < 2) { alert('최소 2명 이상 선택해주세요.'); return; }

    setAiOptimizing(true);
    // setTimeout으로 UI 블로킹 방지
    setTimeout(() => {
      // 1단계: Snake Draft로 초기 해
      const initial = snakeDraft(picked, teamCount, statsMap);
      // 2단계: 스왑 최적화
      const { teams: optimized, synergyScores: synScores } = optimizeTeams(initial, teamCount, statsMap, networkData);
      const newTeams = { A: optimized[0] || [], B: optimized[1] || [], C: teamCount === 3 ? (optimized[2] || []) : [] };
      setTeams(newTeams);
      setKeyPop(pickTwoRandom(picked));
      if (matchOrder.length === 0) {
        const order = generateDefaultMatchOrder(teamCount);
        setMatchOrder(order);
      }
      // 포메이션 자동 배치
      const fmId = clubFormation || getDefaultFormation(clubType);
      const fmDef = getFormations(clubType)[fmId];
      if (fmDef) {
        const newTf = {};
        ['A', 'B', ...(teamCount === 3 ? ['C'] : [])].forEach(code => {
          const teamPlayers = newTeams[code] || [];
          if (teamPlayers.length > 0) {
            newTf[code] = { formationId: fmId, players: autoAssignPlayers(fmDef.positions, teamPlayers, statsMap) };
          }
        });
        setTeamFormations(newTf);
        set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation`), newTf);
      }
      setShowResult(true);
      setIsAiOptimized(true);
      setSynergyScores(synScores);
      setAiOptimizing(false);
    }, 50);
  }, [selectedPlayers, teamCount, statsMap, networkData, matchOrder, generateDefaultMatchOrder, clubFormation, clubType, clubName, dateParam]);

  const saveTeams = useCallback(async (teamsToSave, keyPopToSave, cb) => {
    const base = `PlayerSelectionByDate/${clubName}/${dateParam}/AttandPlayer`;
    const updates = {};
    updates[`${base}/A`] = teamsToSave.A;
    updates[`${base}/B`] = teamsToSave.B;
    updates[`${base}/C`] = teamCount === 3 ? teamsToSave.C : null;
    updates[`PlayerSelectionByDate/${clubName}/${dateParam}/keyPop`] = keyPopToSave.slice(0, 2);
    if (matchOrder.length > 0) updates[`PlayerSelectionByDate/${clubName}/${dateParam}/MatchOrder`] = matchOrder;
    try { await update(ref(db), updates); setHasSavedTeams(true); cb?.(); }
    catch (e) { alert('저장 실패: ' + e.message); }
  }, [clubName, dateParam, teamCount, matchOrder]);

  // 축구 2팀 쿼터 모드: matchesPerTeam = quarterCount (각 쿼터가 독립 경기)
  // formationEnabled 여부와 무관하게 기존 축구 2팀 쿼터 개수 유지
  const effectiveMatchesPerTeam =
    (clubType === 'football' && teamCount === 2 && quarterCount > 1)
      ? quarterCount
      : MATCHES_PER_TEAM;

  // 경기 기록이 있으면 MatchDetailPage(경기 1)로, 없으면 ScoreRecordPage(새 기록)로
  const goToScoreRecord = useCallback(() => {
    saveTeams(teams, keyPop, () => {
      if (hasMatchResults) {
        navigate(`/match/${dateParam}/1`);
      } else {
        navigate(`/score-record?date=${dateParam}&teamCount=${teamCount}&matchesPerTeam=${effectiveMatchesPerTeam}&game=1`);
      }
    });
  }, [teams, keyPop, saveTeams, navigate, dateParam, teamCount, hasMatchResults, effectiveMatchesPerTeam]);

  // 기록 수정 (편집 모드) — 기록이 있을 때 별도로 접근
  const goToScoreEdit = useCallback(() => {
    saveTeams(teams, keyPop, () => {
      navigate(`/score-record?date=${dateParam}&teamCount=${teamCount}&matchesPerTeam=${effectiveMatchesPerTeam}&game=1`);
    });
  }, [teams, keyPop, saveTeams, navigate, dateParam, teamCount, effectiveMatchesPerTeam]);

  // 🆕 경기 기록 삭제 + 복구
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [hasDeletedBackup, setHasDeletedBackup] = useState(false);

  // 삭제: 백업 후 삭제
  const deleteMatchRecords = async () => {
    if (deleteConfirmText !== dateParam) return;
    try {
      // 1) 백업 저장 (복구용)
      const [gameSnap, dailySnap] = await Promise.all([
        get(ref(db, `${clubName}/${dateParam}`)),
        get(ref(db, `DailyResultsBackup/${clubName}/${dateParam}`)),
      ]);
      const backup = {};
      if (gameSnap.exists()) backup.games = gameSnap.val();
      if (dailySnap.exists()) backup.daily = dailySnap.val();
      backup.deletedAt = Date.now();
      backup.deletedBy = userName || 'admin';
      await set(ref(db, `DeletedRecords/${clubName}/${dateParam}`), backup);

      // 2) 실제 삭제
      await Promise.all([
        remove(ref(db, `${clubName}/${dateParam}`)),
        remove(ref(db, `DailyResultsBackup/${clubName}/${dateParam}`)),
      ]);
      setHasMatchResults(false);
      setHasDeletedBackup(true);
      setDeleteDialog(false);
      setDeleteConfirmText('');
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  // 복구
  const restoreMatchRecords = async () => {
    try {
      const backupSnap = await get(ref(db, `DeletedRecords/${clubName}/${dateParam}`));
      if (!backupSnap.exists()) { alert('복구할 백업이 없습니다.'); return; }
      const backup = backupSnap.val();
      const updates = {};
      if (backup.games) updates[`${clubName}/${dateParam}`] = backup.games;
      if (backup.daily) updates[`DailyResultsBackup/${clubName}/${dateParam}`] = backup.daily;
      await update(ref(db), updates);
      await remove(ref(db, `DeletedRecords/${clubName}/${dateParam}`));
      setHasMatchResults(true);
      setHasDeletedBackup(false);
    } catch (e) {
      alert('복구 실패: ' + e.message);
    }
  };

  // 백업 존재 여부 체크
  useEffect(() => {
    if (!clubName || !dateParam) return;
    get(ref(db, `DeletedRecords/${clubName}/${dateParam}`)).then(snap => {
      setHasDeletedBackup(snap.exists());
    }).catch(() => {});
  }, [clubName, dateParam]);

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
  const getTeamLabel = (code) => teamNames[code] || code;
  const getTeamShortLabel = (code) => teamNames[code] || code;
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 0.8 }}>
          <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>참여선수: {selectedCount}명</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* 마스터 관리자: 클럽 종목 변경 */}
            {isMaster && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {['futsal', 'football'].map((t) => {
                  const active = clubType === t;
                  return (
                    <Chip
                      key={t}
                      label={t === 'futsal' ? '⚽ 풋살' : '🏟 축구'}
                      size="small"
                      onClick={async () => {
                        setClubType(t);
                        setClubFormation(getDefaultFormation(t));
                        await update(ref(db), {
                          [`clubs/${clubName}/type`]: t,
                          [`clubs/${clubName}/formation`]: getDefaultFormation(t),
                        });
                      }}
                      sx={{
                        fontWeight: active ? 800 : 500,
                        fontSize: '0.72rem',
                        bgcolor: active ? '#2D336B' : '#F0F2F5',
                        color: active ? 'white' : '#555',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: active ? '#1A1D4E' : '#E0E0E0' },
                      }}
                    />
                  );
                })}
              </Box>
            )}
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
          <>
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button variant="contained" fullWidth startIcon={<ShuffleIcon />} onClick={runDraft}
                sx={{ borderRadius: 2, fontWeight: 'bold', bgcolor: '#1565C0' }}>자동 편성</Button>
              <Button variant="contained" fullWidth startIcon={aiOptimizing ? <CircularProgress size={18} color="inherit" /> : <AutoFixHighIcon />}
                onClick={runAiDraft} disabled={aiOptimizing}
                sx={{
                  borderRadius: 2, fontWeight: 'bold', color: 'white',
                  background: 'linear-gradient(135deg, #7B1FA2, #4A148C)',
                  '&:hover': { background: 'linear-gradient(135deg, #6A1B9A, #38006b)' },
                }}>
                {aiOptimizing ? '분석중...' : 'AI 편성'}
              </Button>
            </Box>
            <Button
              fullWidth variant="outlined" startIcon={<ShieldIcon />}
              onClick={() => navigate(`/draft/${dateParam}`)}
              sx={{
                mt: 1, borderRadius: 2, fontWeight: 'bold',
                borderColor: '#7B1FA2', color: '#7B1FA2',
                borderWidth: 2, py: 1,
                '&:hover': { borderColor: '#4A148C', bgcolor: '#F3E5F5', borderWidth: 2 },
              }}>
              ⚔ 주장 드래프트로 편성
            </Button>
          </>
        )}
      </Paper>

      {(hasSavedTeams || showResult) && (
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                {editMode ? '팀 편집 (선수 클릭 -> 팀 헤더 클릭)' : '팀 구성'}
              </Typography>
              {isAiOptimized && !editMode && (
                <Chip label="AI 최적화" size="small"
                  icon={<AutoFixHighIcon sx={{ fontSize: '14px !important' }} />}
                  sx={{ fontSize: '0.68rem', height: 22, bgcolor: '#EDE7F6', color: '#7B1FA2', fontWeight: 700 }} />
              )}
            </Box>
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
                  {isAiOptimized && synergyScores && synergyScores[['A','B','C'].indexOf(code)] != null && (
                    <Typography sx={{ fontSize: '0.6rem', color: '#7B1FA2', fontWeight: 600, mt: 0.2 }}>
                      시너지 {synergyScores[['A','B','C'].indexOf(code)].toFixed(0)}%
                    </Typography>
                  )}
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
                  {(() => {
                    const players = displayTeams[code] || [];
                    if (players.length === 0) {
                      return <Typography sx={{ color: '#999', textAlign: 'center', py: 2, fontSize: '0.8rem' }}>없음</Typography>;
                    }
                    // 주장을 맨 위(1번)로 정렬
                    const cap = teamCaptains[code];
                    const sorted = cap && players.includes(cap)
                      ? [cap, ...players.filter(p => p !== cap)]
                      : players;
                    return sorted.map((name, idx) => {
                      const isCaptain = cap === name;
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
                            borderRadius: 1, px: 0.5, py: 0.5, mb: 0.3, display: 'flex', gap: 0.4, alignItems: 'center',
                            cursor: canEdit ? 'pointer' : 'default', transition: 'all 0.15s',
                          }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#aaa', flexShrink: 0 }}>{idx + 1}.</Typography>
                          <Typography sx={{
                            fontWeight: isCaptain ? 800 : 600, fontSize: '0.8rem',
                            color: isCaptain ? '#E65100' : 'inherit',
                            flex: 1, textAlign: 'center',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{name}</Typography>
                          {(() => {
                            const ability = statsMap[name]?.abilityScore || 0;
                            return ability > 0 ? (
                              <Typography sx={{ fontSize: '0.65rem', color: '#999', fontWeight: 600, flexShrink: 0 }}>
                                {Math.round(ability)}
                              </Typography>
                            ) : null;
                          })()}
                        </Box>
                      );
                    });
                  })()}
                </Box>
              </Box>
            ))}
          </Box>


          {/* 경기 순서 (2팀이면 A vs B 뿐이라 표시 불필요) */}
          {!editMode && matchOrder.length > 0 && teamCount > 2 && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#333', flex: 1 }}>
                  경기 순서
                </Typography>
                {canEdit && (
                  <Chip label="초기화" size="small" onClick={() => {
                    const order = generateDefaultMatchOrder(teamCount);
                    setMatchOrder(order);
                    setSwapMatch(null);
                    set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/MatchOrder`), order);
                  }} sx={{ fontSize: '0.7rem', height: 22, fontWeight: 600 }} />
                )}
              </Box>
              {canEdit && swapMatch !== null && (
                <Typography sx={{ fontSize: '0.73rem', color: '#FF9800', fontWeight: 600, mb: 0.5, textAlign: 'center' }}>
                  {swapMatch + 1}경기를 교체할 경기를 터치하세요
                </Typography>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {matchOrder.map((match, idx) => {
                  const isSelected = swapMatch === idx;
                  return (
                    <Chip key={idx}
                      label={`${idx + 1}. ${getTeamShortLabel(match[0])} vs ${getTeamShortLabel(match[1])}`}
                      size="small"
                      onClick={() => {
                        if (!canEdit) return;
                        if (swapMatch === null) { setSwapMatch(idx); return; }
                        if (swapMatch === idx) { setSwapMatch(null); return; }
                        // swap
                        const newOrder = [...matchOrder];
                        [newOrder[swapMatch], newOrder[idx]] = [newOrder[idx], newOrder[swapMatch]];
                        setMatchOrder(newOrder);
                        setSwapMatch(null);
                        set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/MatchOrder`), newOrder);
                      }}
                      sx={{
                        fontSize: '0.75rem', fontWeight: 600,
                        bgcolor: isSelected ? '#FFD600' : '#F5F5F5',
                        color: isSelected ? '#333' : '#555',
                        border: isSelected ? '2px solid #FF9800' : '1px solid #E0E0E0',
                        cursor: canEdit ? 'pointer' : 'default',
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* 🆕 포메이션 정하기 토글 (2팀일 때만) */}
          {teamCount === 2 && !editMode && canEdit && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant={formationEnabled ? 'contained' : 'outlined'}
                size="small"
                startIcon={<SportsSoccerIcon sx={{ fontSize: 16 }} />}
                onClick={async () => {
                  const newVal = !formationEnabled;
                  setFormationEnabled(newVal);
                  await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/FormationEnabled`), newVal);
                }}
                sx={{
                  fontSize: '0.78rem', fontWeight: 700,
                  bgcolor: formationEnabled ? '#2D336B' : 'transparent',
                  color: formationEnabled ? 'white' : '#2D336B',
                  borderColor: '#2D336B',
                  '&:hover': {
                    bgcolor: formationEnabled ? '#1A1D4E' : '#E8EAF6',
                    borderColor: '#2D336B',
                  },
                  textTransform: 'none',
                  borderRadius: 2,
                  px: 2, py: 0.6,
                }}
              >
                {formationEnabled ? '포메이션 설정 중' : '포메이션 정하기'}
              </Button>
            </Box>
          )}

          {/* 🆕 쿼터/경기 설정 + 탭 (2팀 + 포메이션 활성화 시) — 스테퍼 + 탭 통합 */}
          {useQuarterSystem && !editMode && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 1.5 }} />

              {/* 쿼터 수 스테퍼 (−/+) — 컴팩트하고 "설정" 느낌 */}
              {canEdit && (
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 1.5, mb: 1.5,
                }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#666' }}>
                    ⏱ {clubType === 'football' ? '쿼터' : '경기'} 수
                  </Typography>
                  <Box sx={{
                    display: 'flex', alignItems: 'center',
                    bgcolor: '#F0F2F5', borderRadius: 2, overflow: 'hidden',
                    border: '1px solid #E0E0E0',
                  }}>
                    <Box
                      onClick={async () => {
                        if (quarterCount <= 1) return;
                        const newCount = quarterCount - 1;
                        setQuarterCount(newCount);
                        // 양 팀 모두 쿼터 범위 초과 시 조정
                        setTeamQuarterTab(prev => {
                          const next = { ...prev };
                          ['A', 'B'].forEach(c => {
                            if (parseInt((next[c] || 'Q1').replace('Q', '')) > newCount) next[c] = `Q${newCount}`;
                          });
                          return next;
                        });
                        await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterConfig`), { count: newCount });
                      }}
                      sx={{
                        width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: quarterCount > 1 ? 'pointer' : 'default',
                        color: quarterCount > 1 ? '#333' : '#CCC',
                        fontWeight: 900, fontSize: '1.2rem',
                        '&:hover': quarterCount > 1 ? { bgcolor: '#E0E0E0' } : {},
                        '&:active': quarterCount > 1 ? { bgcolor: '#D0D0D0' } : {},
                      }}
                    >
                      −
                    </Box>
                    <Box sx={{
                      width: 48, height: 36,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'white',
                      fontWeight: 900, fontSize: '1.1rem', color: '#1565C0',
                      borderLeft: '1px solid #E0E0E0',
                      borderRight: '1px solid #E0E0E0',
                    }}>
                      {quarterCount}
                    </Box>
                    <Box
                      onClick={async () => {
                        if (quarterCount >= 4) return;
                        const newCount = quarterCount + 1;
                        setQuarterCount(newCount);
                        await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterConfig`), { count: newCount });
                      }}
                      sx={{
                        width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: quarterCount < 4 ? 'pointer' : 'default',
                        color: quarterCount < 4 ? '#333' : '#CCC',
                        fontWeight: 900, fontSize: '1.2rem',
                        '&:hover': quarterCount < 4 ? { bgcolor: '#E0E0E0' } : {},
                        '&:active': quarterCount < 4 ? { bgcolor: '#D0D0D0' } : {},
                      }}
                    >
                      +
                    </Box>
                  </Box>
                </Box>
              )}

            </Box>
          )}

          {/* ──────────── 축구 2팀 쿼터 포메이션 (팀 탭 + 단일 필드) ──────────── */}
          {useQuarterSystem && quarterCount > 1 && !editMode && (() => {
            const activeTeamCode = expandFormation === 'B' ? 'B' : 'A';
            const fieldW = Math.min(280, window.innerWidth - 80);
            const code = activeTeamCode;
            const th = theme[code] || theme.A;
            const teamPlayers = displayTeams[code] || [];
            const tf = quarterFormations?.[code]?.[activeQuarterTab] || teamFormations[code] || {};
            const fmId = tf.formationId || clubFormation || getDefaultFormation(clubType);
            const fmDef = getFormations(clubType)[fmId];
            const assignedPlayers = tf.players || {};
            const canEditThis = canEditTeamFormation(code);

            return (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 1.5 }} />

                {/* 1️⃣ 팀 선택 탭 (좌우 — 먼저!) */}
                <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                  {['A', 'B'].map((c) => {
                    const t = theme[c] || theme.A;
                    const active = activeTeamCode === c;
                    // 각 팀 자신의 기억된 쿼터 사용 (비활성 팀도 자기 쿼터 표시)
                    const cQuarter = teamQuarterTab[c] || 'Q1';
                    const cTf = quarterFormations?.[c]?.[cQuarter] || teamFormations[c] || {};
                    const cFmId = cTf.formationId || '';
                    return (
                      <Box
                        key={c}
                        onClick={() => { setExpandFormation(c); setSelectedPos(null); }}
                        sx={{
                          flex: 1, py: 1.2, textAlign: 'center',
                          borderRadius: 2, cursor: 'pointer',
                          bgcolor: active ? t.bg : t.light,
                          color: active ? 'white' : t.bg,
                          fontWeight: 900, fontSize: '0.9rem',
                          border: `2px solid ${active ? t.bg : t.border}`,
                          boxShadow: active ? `0 4px 12px ${t.bg}44` : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {getTeamLabel(c)}
                        {cFmId && (
                          <Typography component="span" sx={{ fontSize: '0.65rem', ml: 0.5, opacity: 0.7 }}>
                            {cFmId}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>

                {/* 2️⃣ 쿼터 탭 (팀 아래) */}
                <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                  {Array.from({ length: quarterCount }).map((_, i) => {
                    const qKey = `Q${i + 1}`;
                    const active = activeQuarterTab === qKey;
                    return (
                      <Box
                        key={qKey}
                        onClick={() => setActiveQuarterTab(qKey)}
                        sx={{
                          flex: 1, py: 0.7, textAlign: 'center',
                          borderRadius: '8px 8px 0 0',
                          cursor: 'pointer',
                          bgcolor: active ? '#2D336B' : 'transparent',
                          color: active ? 'white' : '#888',
                          fontWeight: active ? 900 : 600,
                          fontSize: '0.82rem',
                          borderBottom: active ? '3px solid #2D336B' : '3px solid #E0E0E0',
                          transition: 'all 0.15s',
                          '&:hover': !active ? { color: '#555', borderBottomColor: '#999' } : {},
                        }}
                      >
                        {getQuarterLabel(qKey)}
                      </Box>
                    );
                  })}
                </Box>

                {/* 3️⃣ 쿼터/경기 포메이션 제목 + 공유 */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.8, gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#444' }}>
                    <SportsSoccerIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5, color: '#2E7D32' }} />
                    {getQuarterLabel(activeQuarterTab)} 포메이션
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={async () => {
                      try {
                        const teamLabel = getTeamLabel(code);
                        const blob = await shareFormationImage({
                          clubType, teamLabel, date: dateParam, quarterCount,
                          quarterFormations, teamFormations, teamCode: code,
                        });
                        const file = new File([blob], `${teamLabel}_formation.png`, { type: 'image/png' });
                        if (navigator.share && navigator.canShare?.({ files: [file] })) {
                          await navigator.share({ files: [file], title: `${teamLabel} 포메이션` });
                        } else {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${teamLabel}_formation.png`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (e) {
                        console.error('share error', e);
                      }
                    }}
                    sx={{ color: '#888', '&:hover': { color: '#2D336B' } }}
                  >
                    <ShareIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Box>

                {/* 선택된 팀의 포메이션 프리셋 — 현재 쿼터에만 적용 */}
                {canEditThis && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1, justifyContent: 'center' }}>
                    {Object.entries(getFormations(clubType)).map(([key, fm]) => (
                      <Chip key={key} label={fm.name} size="small"
                        onClick={async () => {
                          const newFmDef = getFormations(clubType)[key];
                          if (!newFmDef) return;
                          const autoPlayers = smartAutoAssign(newFmDef.positions, teamPlayers, playerPositions);
                          const tfData = { formationId: key, players: autoPlayers };
                          setTeamFormations(prev => ({ ...prev, [code]: tfData }));
                          setSelectedPos(null);
                          // 현재 쿼터에만 적용
                          const newQf = { ...quarterFormations };
                          if (!newQf[code]) newQf[code] = {};
                          newQf[code][activeQuarterTab] = tfData;
                          setQuarterFormations(newQf);
                          await update(ref(db), {
                            [`PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation/${code}/${activeQuarterTab}`]: tfData,
                            [`PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`]: tfData,
                          });
                        }}
                        sx={{
                          fontSize: '0.72rem', fontWeight: 600,
                          bgcolor: fmId === key ? th.bg : '#F0F2F5',
                          color: fmId === key ? 'white' : '#555',
                          cursor: 'pointer',
                        }} />
                    ))}
                  </Box>
                )}

                {/* 필드 (선택된 팀만 풀사이즈) */}
                {fmDef && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <FormationField
                      clubType={clubType}
                      positions={fmDef.positions}
                      players={assignedPlayers}
                      selectedPos={selectedPos}
                      onPositionClick={canEditThis ? async (posId) => {
                        if (!selectedPos) { setSelectedPos(posId); return; }
                        if (selectedPos === posId) { setSelectedPos(null); return; }
                        const newPlayers = { ...assignedPlayers };
                        const a = newPlayers[selectedPos];
                        const b = newPlayers[posId];
                        if (a) newPlayers[posId] = a; else delete newPlayers[posId];
                        if (b) newPlayers[selectedPos] = b; else delete newPlayers[selectedPos];
                        const tfData = { formationId: fmId, players: newPlayers };
                        setTeamFormations(prev => ({ ...prev, [code]: tfData }));
                        setSelectedPos(null);
                        await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), tfData);
                        const newQf = { ...quarterFormations };
                        if (!newQf[code]) newQf[code] = {};
                        newQf[code][activeQuarterTab] = tfData;
                        setQuarterFormations(newQf);
                        await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation/${code}/${activeQuarterTab}`), tfData);
                      } : undefined}
                      readOnly={!canEditThis}
                      width={fieldW}
                    />
                  </Box>
                )}

                {/* 통합 선수 목록 — 출전 fill + 클릭으로 포메이션 배치 */}
                {canEditThis && selectedPos && fmDef && (
                  <Typography sx={{ fontSize: '0.75rem', color: '#FF6F00', fontWeight: 700, mb: 0.5, textAlign: 'center' }}>
                    📍 {fmDef.positions.find((p) => p.id === selectedPos)?.label || selectedPos} — 아래 선수 탭해서 배치
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, justifyContent: 'center', mb: 1 }}>
                  {teamPlayers.map((name) => {
                    // 현재 쿼터 배치 여부
                    const posKey = Object.keys(assignedPlayers).find((k) => assignedPlayers[k] === name);
                    const isPlaced = !!posKey;
                    const posLabel = posKey && fmDef ? (fmDef.positions.find((p) => p.id === posKey)?.label || posKey) : null;
                    const isClickable = canEditThis && !!selectedPos;

                    // 각 쿼터별 출전 여부 (세그먼트 블록용)
                    const quarterSlots = [];
                    for (let q = 1; q <= quarterCount; q++) {
                      const qf = quarterFormations?.[code]?.[`Q${q}`];
                      quarterSlots.push(qf?.players && Object.values(qf.players).includes(name));
                    }

                    return (
                      <Box
                        key={name}
                        onClick={async () => {
                          if (!selectedPos || !canEditThis) return;
                          const newPlayers = { ...assignedPlayers, [selectedPos]: name };
                          Object.keys(newPlayers).forEach((p) => {
                            if (newPlayers[p] === name && p !== selectedPos) delete newPlayers[p];
                          });
                          const tfData = { formationId: fmId, players: newPlayers };
                          setTeamFormations((prev) => ({ ...prev, [code]: tfData }));
                          setSelectedPos(null);
                          await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), tfData);
                          const newQf = { ...quarterFormations };
                          if (!newQf[code]) newQf[code] = {};
                          newQf[code][activeQuarterTab] = tfData;
                          setQuarterFormations(newQf);
                          await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation/${code}/${activeQuarterTab}`), tfData);
                        }}
                        sx={{
                          borderRadius: 2, minWidth: 80,
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          px: 0.8, py: 0.5,
                          border: isPlaced
                            ? `2px solid ${th.bg}`
                            : isClickable ? '1.5px dashed #FFB300' : '1px solid #DDD',
                          bgcolor: isPlaced ? th.light : '#F9F9F9',
                          cursor: isClickable ? 'pointer' : 'default',
                          transition: 'all 0.15s',
                          '&:hover': isClickable ? { bgcolor: '#FFF8E1', borderColor: '#FFB300' } : {},
                        }}
                      >
                        {/* 선수명 + 포지션 */}
                        <Typography sx={{
                          fontSize: '0.65rem', fontWeight: isPlaced ? 800 : 600,
                          color: isPlaced ? th.bg : '#555', lineHeight: 1.2,
                        }}>
                          {name}
                          {isPlaced && (
                            <Typography component="span" sx={{ fontSize: '0.55rem', ml: 0.3, color: th.bg, fontWeight: 700 }}>
                              {posLabel}
                            </Typography>
                          )}
                        </Typography>
                        {/* 쿼터 세그먼트 블록 — 출전 ■ / 미출전 □ */}
                        <Box sx={{ display: 'flex', gap: '2px', mt: 0.3, alignItems: 'center' }}>
                          {quarterSlots.map((played, qi) => {
                            const isCurrentQ = `Q${qi + 1}` === activeQuarterTab;
                            return (
                              <Box
                                key={qi}
                                sx={{
                                  width: isCurrentQ ? 12 : 10,
                                  height: isCurrentQ ? 8 : 6,
                                  borderRadius: 0.5,
                                  bgcolor: played ? th.bg : '#E8E8E8',
                                  opacity: played ? 1 : 0.4,
                                  border: isCurrentQ
                                    ? (played ? `1.5px solid ${th.bg}` : '1.5px solid #999')
                                    : (played ? 'none' : '0.5px solid #CCC'),
                                  boxShadow: played && isCurrentQ ? `0 0 3px ${th.bg}88` : 'none',
                                  transition: 'all 0.2s',
                                }}
                              />
                            );
                          })}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })()}

          {/* ──────────── 기존 포메이션 (3팀 / 2팀 1쿼터 + 포메이션 활성화) ──────────── */}
          {!(useQuarterSystem && quarterCount > 1) && !editMode && (teamCount !== 2 || formationEnabled) && (
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
                const canEditThis = canEditTeamFormation(code);
                const isMyTeam = !!userName && teamCaptains?.[code] === userName && !canEdit;

                return (
                  <Box key={code} sx={{ mb: 1 }}>
                    <Box onClick={() => { setExpandFormation(isExpanded ? null : code); setSelectedPos(null); }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.8, px: 1,
                        bgcolor: theme[code].light, borderRadius: 1.5, border: `1px solid ${theme[code].border}` }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: theme[code].bg }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', flex: 1 }}>{getTeamLabel(code)} 포메이션</Typography>
                      {isMyTeam && (
                        <Chip label="내 팀 ⚽" size="small" sx={{ fontSize: '0.68rem', height: 18, bgcolor: '#FF6F00', color: 'white', fontWeight: 800, mr: 0.3 }} />
                      )}
                      <Chip label={fmId} size="small" sx={{ fontSize: '0.72rem', height: 20, fontWeight: 600 }} />
                      {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                    </Box>

                    {isExpanded && fmDef && (
                      <Box sx={{ mt: 1, px: 0.5 }}>
                        {/* 포메이션 프리셋 변경 */}
                        {canEditThis && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                            {Object.entries(getFormations(clubType)).map(([key, fm]) => (
                              <Chip key={key} label={fm.name} size="small"
                                onClick={async () => {
                                  const newFmDef = getFormations(clubType)[key];
                                  const autoPlayers = newFmDef ? autoAssignPlayers(newFmDef.positions, teamPlayers, statsMap) : {};
                                  const newTf = { ...teamFormations, [code]: { formationId: key, players: autoPlayers } };
                                  setTeamFormations(newTf);
                                  setSelectedPos(null);
                                  await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), { formationId: key, players: autoPlayers });
                                  // 쿼터 모드: QuarterFormation 에도 동시 저장
                                  if (useQuarterSystem && quarterCount > 1) {
                                    const newQf = { ...quarterFormations };
                                    if (!newQf[code]) newQf[code] = {};
                                    newQf[code][activeQuarterTab] = { formationId: key, players: autoPlayers };
                                    setQuarterFormations(newQf);
                                    await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation/${code}/${activeQuarterTab}`), { formationId: key, players: autoPlayers });
                                  }
                                }}
                                sx={{ fontSize: '0.72rem', fontWeight: 600, bgcolor: fmId === key ? '#2E7D32' : '#F0F2F5',
                                  color: fmId === key ? 'white' : '#555', cursor: 'pointer' }} />
                            ))}
                          </Box>
                        )}

                        {/* 안내 메시지 */}
                        {canEditThis && selectedPos && expandFormation === code && (
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
                          onPositionClick={canEditThis ? async (posId) => {
                            if (!selectedPos) { setSelectedPos(posId); return; }
                            if (selectedPos === posId) { setSelectedPos(null); return; }
                            const newPlayers = { ...assignedPlayers };
                            const a = newPlayers[selectedPos];
                            const b = newPlayers[posId];
                            if (a) newPlayers[posId] = a; else delete newPlayers[posId];
                            if (b) newPlayers[selectedPos] = b; else delete newPlayers[selectedPos];
                            const tfData = { formationId: fmId, players: newPlayers };
                            const newTf = { ...teamFormations, [code]: tfData };
                            setTeamFormations(newTf);
                            setSelectedPos(null);
                            await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), tfData);
                            if (useQuarterSystem && quarterCount > 1) {
                              const newQf = { ...quarterFormations };
                              if (!newQf[code]) newQf[code] = {};
                              newQf[code][activeQuarterTab] = tfData;
                              setQuarterFormations(newQf);
                              await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation/${code}/${activeQuarterTab}`), tfData);
                            }
                          } : undefined}
                          readOnly={!canEditThis}
                          width={Math.min(280, window.innerWidth - 80)}
                        />

                        {/* 미배치 선수 목록 */}
                        {canEditThis && (
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
                                      const tfData = { formationId: fmId, players: newPlayers };
                                      const newTf = { ...teamFormations, [code]: tfData };
                                      setTeamFormations(newTf);
                                      setSelectedPos(null);
                                      await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/TeamFormation/${code}`), tfData);
                                      if (useQuarterSystem && quarterCount > 1) {
                                        const newQf = { ...quarterFormations };
                                        if (!newQf[code]) newQf[code] = {};
                                        newQf[code][activeQuarterTab] = tfData;
                                        setQuarterFormations(newQf);
                                        await set(ref(db, `PlayerSelectionByDate/${clubName}/${dateParam}/QuarterFormation/${code}/${activeQuarterTab}`), tfData);
                                      }
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

          {canEdit && !editMode && (
            <>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button variant="outlined" fullWidth startIcon={<SaveIcon />} onClick={() => saveTeams(teams, keyPop)}
                  sx={{ borderRadius: 2, fontWeight: 'bold' }}>저장만 하기</Button>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={hasMatchResults ? <EmojiEventsIcon /> : <PlayArrowIcon />}
                  onClick={goToScoreRecord}
                  sx={{
                    borderRadius: 2, fontWeight: 'bold',
                    bgcolor: hasMatchResults ? '#2E7D32' : '#1565C0',
                    '&:hover': { bgcolor: hasMatchResults ? '#1B5E20' : '#0D47A1' },
                  }}
                >
                  {hasMatchResults ? '경기별 점수 보기' : '게임 진행'}
                </Button>
              </Box>
              {hasMatchResults && (
                <Button
                  fullWidth
                  variant="text"
                  size="small"
                  startIcon={<EditIcon sx={{ fontSize: '16px !important' }} />}
                  onClick={goToScoreEdit}
                  sx={{
                    mt: 0.8, borderRadius: 2, fontSize: '0.78rem', fontWeight: 600,
                    color: '#666',
                    '&:hover': { bgcolor: '#F0F2F5' },
                  }}
                >
                  기록 수정 (편집 모드)
                </Button>
              )}
              {/* 경기 기록 삭제 (관리자) */}
              {hasMatchResults && canEdit && (
                <Button fullWidth variant="text" size="small"
                  startIcon={<DeleteForeverIcon sx={{ fontSize: '14px !important' }} />}
                  onClick={() => setDeleteDialog(true)}
                  sx={{ mt: 0.5, fontSize: '0.72rem', color: '#999', '&:hover': { color: '#C62828', bgcolor: '#FFEBEE' } }}
                >
                  경기 기록 전체 삭제
                </Button>
              )}
              {/* 복구 버튼 */}
              {!hasMatchResults && hasDeletedBackup && canEdit && (
                <Button fullWidth variant="outlined" size="small"
                  startIcon={<RestoreIcon />}
                  onClick={restoreMatchRecords}
                  sx={{ mt: 0.8, borderRadius: 2, fontSize: '0.78rem', fontWeight: 700, borderColor: '#2E7D32', color: '#2E7D32' }}
                >
                  삭제된 기록 복구
                </Button>
              )}
            </>
          )}
        </Paper>
      )}

      {/* 경기 기록 삭제 다이얼로그 */}
      <Dialog open={deleteDialog} onClose={() => { setDeleteDialog(false); setDeleteConfirmText(''); }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#C62828' }}>
          <DeleteForeverIcon /> 경기 기록 삭제
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.88rem', mb: 1.5 }}>
            <b>{dateParam}</b> 경기일의 <b>모든 경기 기록</b>(골/어시스트/MVP)이 삭제됩니다.
          </Typography>
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#E8F5E9', border: '1px solid #C8E6C9', mb: 2 }}>
            <Typography sx={{ fontSize: '0.78rem', color: '#2E7D32', fontWeight: 700 }}>
              ✅ 삭제 후에도 복구할 수 있습니다 (백업 자동 저장)
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8rem', color: '#666', mb: 1 }}>
            확인을 위해 날짜를 입력하세요:
          </Typography>
          <TextField
            fullWidth size="small"
            placeholder={dateParam}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialog(false); setDeleteConfirmText(''); }}>취소</Button>
          <Button
            variant="contained" color="error"
            disabled={deleteConfirmText !== dateParam}
            onClick={deleteMatchRecords}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, set, update, get } from 'firebase/database';
import {
  Container, Box, Typography, Paper, Button, Chip, IconButton,
  CircularProgress, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Switch, Alert, Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShieldIcon from '@mui/icons-material/Shield';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import FormationField from '../components/FormationField';
import { getFormations, getDefaultFormation } from '../config/formations';

// 간단 자동 배치 (공격 → 미드 → 수비 → GK 순으로 주어진 팀원을 채움)
function simpleAutoAssign(positions, teamPlayers) {
  const players = {};
  const available = [...teamPlayers];
  const priority = (id) => {
    const u = (id || '').toUpperCase();
    if (['FW', 'ST', 'LW', 'RW', 'LF', 'RF'].includes(u)) return 0;
    if (['AM', 'CAM'].includes(u)) return 1;
    if (['CM', 'LM', 'RM', 'DM', 'MF'].includes(u)) return 2;
    if (['CB', 'LB', 'RB', 'DF', 'LWB', 'RWB'].includes(u)) return 3;
    if (u === 'GK') return 4;
    return 3;
  };
  const sorted = [...positions].sort((a, b) => priority(a.id) - priority(b.id));
  sorted.forEach((pos) => {
    if (available.length > 0) players[pos.id] = available.shift();
  });
  return players;
}

// ── 스네이크 드래프트에서 pickIdx 번째 픽의 팀 코드 반환 ──
function getCurrentTeamCode(pickOrder, pickIdx, snake) {
  const n = pickOrder.length;
  if (n === 0) return null;
  const round = Math.floor(pickIdx / n);
  const posInRound = pickIdx % n;
  const reversed = snake && round % 2 === 1;
  return reversed ? pickOrder[n - 1 - posInRound] : pickOrder[posInRound];
}

const TEAM_THEME = {
  A: { bg: '#1E66D0', light: '#EAF2FF', border: '#BBD3FF', name: 'A팀' },
  B: { bg: '#1F7A2E', light: '#EAF7EE', border: '#BFE8C7', name: 'B팀' },
  C: { bg: '#D12A2A', light: '#FFECEC', border: '#FFC2C2', name: 'C팀' },
};

export default function DraftPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const { clubName, userName, isAdmin, isModerator, authReady, user } = useAuth();
  const canAdmin = isAdmin || isModerator;

  const [loading, setLoading] = useState(true);
  const [attendees, setAttendees] = useState([]);
  const [draft, setDraft] = useState(null);

  // ── 주장 선정 로컬 state (admin만 사용, 모든 status에서 편집 가능) ──
  const [captainList, setCaptainList] = useState([]); // 주장들 (순서 = 픽 순서)
  const [snake, setSnake] = useState(true);
  // 기존 draft가 있을 때, 로컬 captainList를 자동으로 sync (관리자 편의)
  useEffect(() => {
    if (draft?.captains && Array.isArray(draft?.pickOrder)) {
      const ordered = draft.pickOrder.map((c) => draft.captains[c]).filter(Boolean);
      setCaptainList(ordered);
      if (typeof draft.snake === 'boolean') setSnake(draft.snake);
    }
  }, [draft?.status]); // status 변화 시에만 sync (작업 중 덮어쓰기 방지)

  // ── 다이얼로그 ──
  const [confirmDialog, setConfirmDialog] = useState(false);
  // 트레이드: { myPlayer, otherCode, otherPlayer } | null
  const [tradeForm, setTradeForm] = useState(null);
  // 관리자 + 주장 겸임 케이스: 관리자 모드(주장 선정 패널) vs 주장 모드(픽 UI)
  const [adminPanelMode, setAdminPanelMode] = useState(false);
  // 관리자 패널 내부: view(현재 주장 표시) vs edit(주장 편집 중)
  const [captainEditMode, setCaptainEditMode] = useState(false);
  // 🧪 테스트: admin이 특정 팀 주장을 impersonate (3팀 모두 단독 테스트용)
  const [devCaptainOverride, setDevCaptainOverride] = useState(null); // null | 'A' | 'B' | 'C'

  // 포메이션 편집용 state
  const [clubType, setClubType] = useState('futsal');
  const [clubFormation, setClubFormation] = useState('');
  const [teamFormations, setTeamFormations] = useState({}); // { A: { formationId, players }, ... }
  const [selectedPos, setSelectedPos] = useState(null); // 현재 선택된 포지션 ID

  // ── 데이터 로드 (실시간) ──
  useEffect(() => {
    if (!authReady || !clubName || !date) return;
    setLoading(true);

    // 참석자는 한 번만 읽음
    get(ref(db, `PlayerSelectionByDate/${clubName}/${date}/AttandPlayer/all`)).then((snap) => {
      if (snap.exists() && Array.isArray(snap.val())) {
        setAttendees(snap.val().filter(Boolean));
      }
    });

    // 클럽 종목 + 기본 포메이션 로드
    get(ref(db, `clubs/${clubName}`)).then((snap) => {
      if (snap.exists()) {
        const v = snap.val();
        setClubType(v.type || 'futsal');
        setClubFormation(v.formation || '');
      }
    });

    // 드래프트 세션은 실시간 구독
    const draftRef = ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`);
    const unsub = onValue(draftRef, (snap) => {
      setDraft(snap.exists() ? snap.val() : null);
      setLoading(false);
    });

    // 팀별 포메이션도 실시간 구독 (다른 주장이 변경 시 반영)
    const tfRef = ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamFormation`);
    const unsubTf = onValue(tfRef, (snap) => {
      setTeamFormations(snap.exists() ? (snap.val() || {}) : {});
    });

    return () => { unsub(); unsubTf(); };
  }, [authReady, clubName, date]);

  // ── 파생 데이터 ──
  const status = draft?.status || 'setup';
  const currentTeamCode = useMemo(() => {
    if (status !== 'active' || !draft) return null;
    return getCurrentTeamCode(draft.pickOrder || [], draft.currentPickIdx || 0, !!draft.snake);
  }, [draft, status]);

  const myTeamCode = useMemo(() => {
    // admin이 테스트용 impersonate 설정한 경우 우선 적용
    if (devCaptainOverride && draft?.captains?.[devCaptainOverride]) {
      return devCaptainOverride;
    }
    if (!draft?.captains || !userName) return null;
    return Object.keys(draft.captains).find((code) => draft.captains[code] === userName) || null;
  }, [draft, userName, devCaptainOverride]);

  const isMyTurn = status === 'active' && myTeamCode && currentTeamCode === myTeamCode;

  // ── 셋업 단계 액션 ──
  // 최대 3명까지만 주장으로 선정 가능 (A/B/C 팀)
  const MAX_CAPTAINS = 3;
  const toggleCaptain = (name) => {
    setCaptainList((prev) => {
      if (prev.includes(name)) return prev.filter((p) => p !== name);
      if (prev.length >= MAX_CAPTAINS) {
        alert(`주장은 최대 ${MAX_CAPTAINS}명까지만 선정할 수 있습니다. 기존 주장을 먼저 해제해주세요.`);
        return prev;
      }
      return [...prev, name];
    });
  };

  const moveCaptainUp = (idx) => {
    if (idx === 0) return;
    const next = [...captainList];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setCaptainList(next);
  };

  const moveCaptainDown = (idx) => {
    if (idx === captainList.length - 1) return;
    const next = [...captainList];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setCaptainList(next);
  };

  // 편집 모드 진입 시 현재 DB의 주장 목록으로 로컬 state 재싱크
  const enterCaptainEdit = () => {
    if (draft?.captains && Array.isArray(draft?.pickOrder)) {
      const ordered = draft.pickOrder.map((c) => draft.captains[c]).filter(Boolean);
      setCaptainList(ordered);
      setSnake(draft.snake !== false);
    } else {
      setCaptainList([]);
      setSnake(true);
    }
    setCaptainEditMode(true);
  };

  const cancelCaptainEdit = () => {
    // 편집 취소 — 로컬 state 원복
    if (draft?.captains && Array.isArray(draft?.pickOrder)) {
      const ordered = draft.pickOrder.map((c) => draft.captains[c]).filter(Boolean);
      setCaptainList(ordered);
      setSnake(draft.snake !== false);
    } else {
      setCaptainList([]);
    }
    setCaptainEditMode(false);
  };

  // 관리자 전용: 주장 선정 → 드래프트 시작 OR 기존 드래프트 재선정(리셋)
  // 어떤 status에서도 호출 가능. 호출 시 세션이 active 로 초기화됨.
  const startDraft = async () => {
    try {
      // 최대 3명 강제 (state에 4명 이상이 들어가 있을 경우 방어)
      const effectiveList = captainList.slice(0, 3);
      if (effectiveList.length < 2) {
        alert('주장은 최소 2명 이상 지정해주세요.');
        return;
      }
      // 모든 주장이 참석자 명단에 있는지 검증
      const missing = effectiveList.filter((n) => !attendees.includes(n));
      if (missing.length > 0) {
        alert(`참석 명단에 없는 선수가 있습니다: ${missing.join(', ')}`);
        return;
      }
      if (draft && !window.confirm(
        draft.status === 'confirmed'
          ? '확정된 드래프트를 재선정하시겠습니까? 기존 팀 구성이 초기화됩니다.'
          : '드래프트를 새 주장 명단으로 재시작하시겠습니까? 기존 픽이 모두 사라집니다.'
      )) return;

      const codes = ['A', 'B', 'C'].slice(0, effectiveList.length);
      const captains = {};
      codes.forEach((c, i) => { captains[c] = effectiveList[i]; });

      // 참석자 다시 로드 (변경됐을 수 있음)
      const attendSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${date}/AttandPlayer/all`));
      const currentAttendees = (attendSnap.exists() && Array.isArray(attendSnap.val()))
        ? attendSnap.val().filter(Boolean) : attendees;

      const pool = currentAttendees.filter((n) => !effectiveList.includes(n));
      const teams = {};
      codes.forEach((c) => { teams[c] = [captains[c]]; });

      const session = {
        status: 'active',
        captains,
        pickOrder: codes,
        snake,
        currentPickIdx: 0,
        pool,
        teams,
        picks: [],
        trades: null,
        resetRequests: null,
        reDraftRequests: null,
        startedAt: Date.now(),
        createdBy: user?.email || '',
        skippedBy: null,
      };

      await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), session);
      await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/DraftMode`), 'draft');
      // eslint-disable-next-line no-console
      console.log('✅ 드래프트 시작/재선정 완료', { captains, pickOrder: codes });
      setCaptainEditMode(false);
    } catch (e) {
      console.error('❌ 드래프트 시작 실패:', e);
      alert(`드래프트 시작 실패: ${e?.message || e}`);
    }
  };

  // ── 액티브 단계 액션 ──
  // 픽은 주장만 가능 (관리자는 개입 불가, 주장 선정/취소/재선정만)
  const pickPlayer = async (playerName) => {
    if (!draft) return;
    if (!isMyTurn) return;
    if (!(draft.pool || []).includes(playerName)) return;

    const pickIdx = draft.currentPickIdx || 0;
    const teamCode = currentTeamCode;
    if (!teamCode) return;

    const newPool = (draft.pool || []).filter((p) => p !== playerName);
    const newTeam = [...(draft.teams?.[teamCode] || []), playerName];
    const newPicks = [
      ...(draft.picks || []),
      { team: teamCode, player: playerName, ts: Date.now(), pickNum: pickIdx },
    ];

    // 풀 소진 시 review 단계로
    const nextStatus = newPool.length === 0 ? 'review' : 'active';

    const updates = {
      [`pool`]: newPool,
      [`teams/${teamCode}`]: newTeam,
      [`picks`]: newPicks,
      [`currentPickIdx`]: pickIdx + 1,
      [`status`]: nextStatus,
    };

    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), updates);
  };

  const skipTurn = async () => {
    if (!canAdmin || !draft) return;
    const pickIdx = draft.currentPickIdx || 0;
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
      currentPickIdx: pickIdx + 1,
      skippedBy: userName,
    });
  };

  // ── 리뷰 단계 액션 ──
  const requestReset = async () => {
    if (!draft) return;
    const myCode = myTeamCode || (canAdmin ? draft.pickOrder?.[0] : null);
    if (!myCode) return;
    const current = draft.resetRequests || {};
    const updated = { ...current, [myCode]: true };
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
      resetRequests: updated,
    });

    // 전원 동의 체크
    const allAgreed = (draft.pickOrder || []).every((c) => updated[c]);
    if (allAgreed) {
      // 셋업 상태로 리셋 (주장 설정은 유지)
      const codes = draft.pickOrder || [];
      const captains = draft.captains || {};
      const fresh = {
        ...draft,
        status: 'active',
        currentPickIdx: 0,
        pool: attendees.filter((n) => !Object.values(captains).includes(n)),
        teams: Object.fromEntries(codes.map((c) => [c, [captains[c]]])),
        picks: [],
        resetRequests: null,
        skippedBy: null,
      };
      await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), fresh);
    }
  };

  const cancelResetRequest = async () => {
    if (!draft) return;
    const myCode = myTeamCode || (canAdmin ? draft.pickOrder?.[0] : null);
    if (!myCode) return;
    const current = draft.resetRequests || {};
    const updated = { ...current, [myCode]: false };
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
      resetRequests: updated,
    });
  };

  // ── 트레이드 액션 ──
  const openTradeDialog = () => {
    const myCode = myTeamCode || (canAdmin ? draft?.pickOrder?.[0] : null);
    if (!myCode) return;
    setTradeForm({ fromCode: myCode, myPlayer: '', otherCode: '', otherPlayer: '' });
  };

  const proposeTrade = async () => {
    if (!draft || !tradeForm) return;
    const { fromCode, myPlayer, otherCode, otherPlayer } = tradeForm;
    if (!fromCode || !myPlayer || !otherCode || !otherPlayer) {
      alert('모든 항목을 선택해주세요.');
      return;
    }
    const newTrade = {
      id: `trade-${Date.now()}`,
      from: fromCode,
      to: otherCode,
      give: myPlayer,
      take: otherPlayer,
      status: 'pending',
      proposedBy: user?.email || userName,
      ts: Date.now(),
    };
    const existing = draft.trades || [];
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
      trades: [...existing, newTrade],
    });
    setTradeForm(null);
  };

  const respondTrade = async (tradeId, accept) => {
    if (!draft) return;
    const trades = draft.trades || [];
    const trade = trades.find((t) => t.id === tradeId);
    if (!trade || trade.status !== 'pending') return;

    // 권한: 받는 팀(to)의 주장이거나 관리자
    const isTargetCaptain = draft.captains?.[trade.to] === userName;
    if (!isTargetCaptain && !canAdmin) return;

    const teams = draft.teams || {};
    const fromTeam = teams[trade.from] || [];
    const toTeam = teams[trade.to] || [];

    // 유효성: 선수가 여전히 해당 팀에 있는지
    if (!fromTeam.includes(trade.give) || !toTeam.includes(trade.take)) {
      // 무효화 (다른 트레이드로 이미 교환됨)
      const updated = trades.map((t) => t.id === tradeId ? { ...t, status: 'invalid' } : t);
      await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), { trades: updated });
      return;
    }

    if (!accept) {
      const updated = trades.map((t) => t.id === tradeId ? { ...t, status: 'rejected', respondedAt: Date.now() } : t);
      await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), { trades: updated });
      return;
    }

    // 수락: atomic swap
    const newFromTeam = fromTeam.map((p) => p === trade.give ? trade.take : p);
    const newToTeam = toTeam.map((p) => p === trade.take ? trade.give : p);
    const updatedTrades = trades.map((t) => t.id === tradeId ? { ...t, status: 'accepted', respondedAt: Date.now() } : t);
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
      [`teams/${trade.from}`]: newFromTeam,
      [`teams/${trade.to}`]: newToTeam,
      trades: updatedTrades,
    });
  };

  const cancelTrade = async (tradeId) => {
    if (!draft) return;
    const trades = draft.trades || [];
    const updated = trades.map((t) => t.id === tradeId ? { ...t, status: 'cancelled' } : t);
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), { trades: updated });
  };

  // ── 포메이션 편집 액션 (주장이 자기 팀만) ──
  const changeFormation = async (code, newFmId) => {
    if (!draft || !myTeamCode || code !== myTeamCode) return;
    const newFmDef = getFormations(clubType)[newFmId];
    if (!newFmDef) return;
    const teamPlayers = draft.teams?.[code] || [];
    const autoPlayers = simpleAutoAssign(newFmDef.positions, teamPlayers);
    const newTf = { formationId: newFmId, players: autoPlayers };
    setSelectedPos(null);
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamFormation/${code}`), newTf);
  };

  const assignPlayerToPosition = async (code, posId, playerName) => {
    if (!draft || !myTeamCode || code !== myTeamCode) return;
    const tf = teamFormations[code] || {};
    const fmId = tf.formationId || clubFormation || getDefaultFormation(clubType);
    const currentPlayers = { ...(tf.players || {}) };
    // 같은 선수가 다른 포지션에 이미 있으면 제거 (중복 방지)
    Object.keys(currentPlayers).forEach((p) => {
      if (currentPlayers[p] === playerName && p !== posId) delete currentPlayers[p];
    });
    currentPlayers[posId] = playerName;
    const newTf = { formationId: fmId, players: currentPlayers };
    setSelectedPos(null);
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamFormation/${code}`), newTf);
  };

  const swapPositions = async (code, fromPosId, toPosId) => {
    if (!draft || !myTeamCode || code !== myTeamCode) return;
    const tf = teamFormations[code] || {};
    const fmId = tf.formationId || clubFormation || getDefaultFormation(clubType);
    const currentPlayers = { ...(tf.players || {}) };
    const a = currentPlayers[fromPosId];
    const b = currentPlayers[toPosId];
    if (a) currentPlayers[toPosId] = a; else delete currentPlayers[toPosId];
    if (b) currentPlayers[fromPosId] = b; else delete currentPlayers[fromPosId];
    const newTf = { formationId: fmId, players: currentPlayers };
    setSelectedPos(null);
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamFormation/${code}`), newTf);
  };

  // 확정은 주장이 (또는 관리자가) 실행 가능. 관리자는 드래프트 과정에 개입하지 않지만
  // 비상 상황에서 강제 확정할 수 있도록 열어둠.
  const confirmDraft = async () => {
    if (!draft) return;
    // 안전장치: active 또는 review 단계에서만 확정 가능 (실수로 기존 데이터 덮어쓰기 방지)
    if (draft.status !== 'active' && draft.status !== 'review') {
      console.warn('[confirmDraft] 확정 불가 상태:', draft.status);
      return;
    }
    if (!myTeamCode && !canAdmin) return;
    // captains와 teams가 모두 있는지 검증 (없으면 기존 데이터 덮어쓰기 방지)
    if (!draft.captains || !draft.teams) {
      console.warn('[confirmDraft] captains 또는 teams가 없음');
      return;
    }
    const teams = draft.teams || {};
    // teams를 AttandPlayer/{A|B|C}에 반영
    const updates = {};
    ['A', 'B', 'C'].forEach((c) => {
      if (teams[c]) {
        updates[`AttandPlayer/${c}`] = teams[c];
      }
    });
    // TeamCaptains도 반영
    Object.entries(draft.captains || {}).forEach(([c, name]) => {
      updates[`TeamCaptains/${c}`] = name;
    });
    updates['Draft/status'] = 'confirmed';
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}`), updates);
    setConfirmDialog(false);
    navigate(`/player-select?date=${date}`);
  };

  const cancelDraft = async () => {
    if (!canAdmin) return;
    if (!window.confirm('진행 중인 드래프트를 취소하시겠습니까? 세션이 완전히 삭제됩니다.')) return;
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), null);
    navigate(`/player-select?date=${date}`);
  };

  const adminRestart = async () => {
    if (!canAdmin || !draft) return;
    if (!window.confirm('드래프트를 처음부터 다시 시작하시겠습니까? 주장과 픽 순서는 유지되고 모든 픽이 초기화됩니다.')) return;
    const codes = draft.pickOrder || [];
    const captains = draft.captains || {};
    // 현재 참석자 다시 로드 (혹시 바뀐 경우 대비)
    const attendSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${date}/AttandPlayer/all`));
    const currentAttendees = (attendSnap.exists() && Array.isArray(attendSnap.val()))
      ? attendSnap.val().filter(Boolean) : attendees;
    const fresh = {
      ...draft,
      status: 'active',
      currentPickIdx: 0,
      pool: currentAttendees.filter((n) => !Object.values(captains).includes(n)),
      teams: Object.fromEntries(codes.map((c) => [c, [captains[c]]])),
      picks: [],
      trades: null,
      resetRequests: null,
      skippedBy: null,
      restartedAt: Date.now(),
    };
    await set(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), fresh);
  };

  // ── 로딩 ──
  if (loading) {
    return (
      <Container sx={{ mt: 6, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>드래프트 정보 불러오는 중...</Typography>
      </Container>
    );
  }

  // ── 권한 체크 ──
  if (!user) {
    return <Container sx={{ mt: 6 }}><Alert severity="warning">로그인이 필요합니다.</Alert></Container>;
  }

  // ──────────────────────────────────────
  // RENDER: 공통 헤더
  // ──────────────────────────────────────
  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
      <IconButton onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
      <ShieldIcon sx={{ color: '#7B1FA2' }} />
      <Typography sx={{ fontWeight: 900, fontSize: '1.2rem' }}>드래프트</Typography>
      <Chip label={date} size="small" sx={{ ml: 'auto', fontWeight: 'bold' }} />
    </Box>
  );

  // 🧪 Dev 전용: admin이 특정 주장으로 전환 (3팀 주장 권한 모두 테스트)
  const DevCaptainSwitcher = () => {
    if (!canAdmin) return null;
    const hasCaptains = draft?.captains && Object.keys(draft.captains).length > 0;
    if (!hasCaptains) return null;
    const codes = draft.pickOrder || Object.keys(draft.captains);
    const realCode = Object.keys(draft.captains).find((c) => draft.captains[c] === userName) || null;
    return (
      <Paper sx={{
        borderRadius: 2, p: 1.2, mb: 2,
        bgcolor: '#FFF8E1', border: '1px dashed #FFB300',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.7 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#E65100', flex: 1 }}>
            🧪 [테스트] 주장 역할 전환
          </Typography>
          {devCaptainOverride && (
            <Chip label={`impersonating ${devCaptainOverride}팀`} size="small"
              sx={{ bgcolor: '#E65100', color: 'white', fontWeight: 700, height: 18, fontSize: '0.62rem' }} />
          )}
        </Box>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {codes.map((c) => {
            const theme = TEAM_THEME[c];
            const isActive = devCaptainOverride === c || (!devCaptainOverride && realCode === c);
            return (
              <Chip
                key={c}
                label={`${theme?.name || c} (${draft.captains[c]})`}
                size="small"
                onClick={() => {
                  setDevCaptainOverride(c);
                  setAdminPanelMode(false); // 주장 뷰로 자동 전환
                }}
                sx={{
                  fontWeight: 800, fontSize: '0.72rem',
                  bgcolor: isActive ? (theme?.bg || '#7B1FA2') : '#F5F5F5',
                  color: isActive ? 'white' : '#555',
                  cursor: 'pointer',
                  border: isActive ? `2px solid ${theme?.bg || '#7B1FA2'}` : '1px solid transparent',
                  '&:hover': { bgcolor: isActive ? theme?.bg : '#E0E0E0' },
                }}
              />
            );
          })}
          <Chip
            label="원래 역할"
            size="small"
            onClick={() => setDevCaptainOverride(null)}
            sx={{
              fontSize: '0.72rem',
              bgcolor: devCaptainOverride === null ? '#757575' : '#F5F5F5',
              color: devCaptainOverride === null ? 'white' : '#666',
              cursor: 'pointer',
            }}
          />
        </Stack>
        <Typography sx={{ fontSize: '0.65rem', color: '#888', mt: 0.5 }}>
          팀을 클릭하면 해당 주장으로 행동합니다. 픽/트레이드/확정 모두 가능.
        </Typography>
      </Paper>
    );
  };

  // ──────────────────────────────────────
  // RENDER: 관리자 전용 - 주장 선정/취소/재선정 패널 (모든 status)
  // 관리자는 드래프트 과정(픽/트레이드)은 볼 수 없고, 오직 주장 관리만 함
  // 관리자 + 주장 겸임 시에는 adminPanelMode 토글로 전환
  // ──────────────────────────────────────
  const isAdminOnly = canAdmin && (!myTeamCode || adminPanelMode);
  if (isAdminOnly) {
    const statusLabel = {
      setup: { text: '대기', color: '#757575', bg: '#F5F5F5' },
      active: { text: '진행 중', color: '#1565C0', bg: '#E3F2FD' },
      review: { text: '검토 중', color: '#F57C00', bg: '#FFF3E0' },
      confirmed: { text: '확정됨', color: '#2E7D32', bg: '#E8F5E9' },
    }[status] || { text: '대기', color: '#757575', bg: '#F5F5F5' };

    return (
      <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
        {header}
        {/* 안내 */}
        <Alert severity="info" sx={{ mb: 2 }}>
          관리자는 <b>주장 선정/취소/재선정</b>만 가능합니다. 드래프트 진행은 주장들만 참여합니다.
        </Alert>

        {/* 🧪 Dev: 테스트용 주장 역할 전환 */}
        <DevCaptainSwitcher />

        {/* 관리자 + 주장 겸임 시 주장 모드로 전환 */}
        {myTeamCode && adminPanelMode && (
          <Button
            fullWidth variant="outlined"
            onClick={() => setAdminPanelMode(false)}
            sx={{ mb: 2, borderRadius: 2, borderColor: '#1565C0', color: '#1565C0' }}
          >
            🔙 주장 모드로 돌아가기 ({myTeamCode}팀 주장)
          </Button>
        )}

        {/* 현재 상태 */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', flex: 1 }}>현재 드래프트 상태</Typography>
            <Chip label={statusLabel.text} size="small"
              sx={{ bgcolor: statusLabel.bg, color: statusLabel.color, fontWeight: 800 }} />
          </Box>
          {draft && draft.captains && (
            <Typography sx={{ fontSize: '0.8rem', color: '#666' }}>
              현재 주장: {(draft.pickOrder || []).map((c) => `${c}팀 ${draft.captains[c]}`).join(' · ')}
            </Typography>
          )}
        </Paper>

        {/* 주장 선정 패널 - View 모드 (현재 주장 표시) */}
        {!captainEditMode && (
          <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
            <Typography sx={{ fontWeight: 'bold', mb: 1, fontSize: '1rem' }}>
              현재 주장
            </Typography>
            {(!draft?.captains || Object.keys(draft.captains).length === 0) ? (
              <Typography sx={{ color: '#999', py: 2, textAlign: 'center', fontSize: '0.9rem' }}>
                아직 주장이 선정되지 않았습니다.
              </Typography>
            ) : (
              <Stack spacing={0.7} sx={{ mb: 2 }}>
                {(draft.pickOrder || []).map((code, idx) => {
                  const theme = TEAM_THEME[code] || TEAM_THEME.A;
                  const name = draft.captains[code];
                  if (!name) return null;
                  return (
                    <Box key={code} sx={{
                      display: 'flex', alignItems: 'center', gap: 1, p: 1.2,
                      bgcolor: theme.light, border: `1px solid ${theme.border}`, borderRadius: 1.5,
                    }}>
                      <Chip label={theme.name} size="small" sx={{ bgcolor: theme.bg, color: 'white', fontWeight: 800 }} />
                      <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '0.95rem' }}>
                        <Typography component="span" sx={{ fontSize: '0.75rem', color: '#888', mr: 0.8 }}>
                          {idx + 1}픽
                        </Typography>
                        {name}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            )}

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained" size="large"
                startIcon={draft ? <EditIcon /> : <PlayArrowIcon />}
                onClick={enterCaptainEdit}
                sx={{
                  borderRadius: 2, fontWeight: 900, py: 1.2, flex: 1, minWidth: 140,
                  background: 'linear-gradient(135deg, #7B1FA2, #4A148C)',
                }}
              >
                {draft ? '✏️ 주장 재선정' : '🚀 주장 선정 & 드래프트 시작'}
              </Button>
              {draft && (
                <Button
                  variant="outlined" size="large" color="error"
                  onClick={cancelDraft}
                  sx={{ borderRadius: 2, fontWeight: 800, py: 1.2 }}
                >
                  ❌ 취소
                </Button>
              )}
            </Stack>
          </Paper>
        )}

        {/* 주장 선정 패널 - Edit 모드 (편집 중) */}
        {captainEditMode && (
          <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2, border: '2px solid #7B1FA2' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography sx={{ fontWeight: 'bold', fontSize: '1rem', flex: 1 }}>
                ① 주장 선택
              </Typography>
              <Chip label="편집 중" size="small" sx={{ bgcolor: '#7B1FA2', color: 'white', fontWeight: 800 }} />
            </Box>
            <Typography sx={{ fontSize: '0.78rem', color: '#666', mb: 1 }}>
              참석자 {attendees.length}명 중에서 주장을 선택하세요. 클릭하여 추가/제거.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
              {attendees.map((name) => {
                const selected = captainList.includes(name);
                return (
                  <Chip
                    key={name}
                    label={selected ? `${captainList.indexOf(name) + 1}. ${name} ✓` : `+ ${name}`}
                    onClick={() => toggleCaptain(name)}
                    sx={{
                      fontWeight: selected ? 800 : 500,
                      bgcolor: selected ? '#7B1FA2' : '#F5F5F5',
                      color: selected ? 'white' : '#333',
                      border: selected ? '2px solid #4A148C' : '1px solid transparent',
                      cursor: 'pointer',
                      transform: selected ? 'scale(1.03)' : 'scale(1)',
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: selected ? '#6A1B9A' : '#E0E0E0' },
                    }}
                  />
                );
              })}
            </Box>

            {captainList.length >= 2 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography sx={{ fontWeight: 'bold', mb: 1, fontSize: '1rem' }}>
                  ② 팀 배정 & 픽 순서
                </Typography>
                <Stack spacing={0.5} sx={{ mb: 2 }}>
                  {captainList.slice(0, 3).map((name, idx) => {
                    const code = ['A', 'B', 'C'][idx];
                    const theme = TEAM_THEME[code] || TEAM_THEME.A;
                    return (
                      <Box key={name} sx={{
                        display: 'flex', alignItems: 'center', gap: 1, p: 1,
                        bgcolor: theme.light, border: `1px solid ${theme.border}`, borderRadius: 1.5,
                      }}>
                        <Chip label={theme.name} size="small" sx={{ bgcolor: theme.bg, color: 'white', fontWeight: 800 }} />
                        <Typography sx={{ flex: 1, fontWeight: 700 }}>{idx + 1}픽: {name}</Typography>
                        <IconButton size="small" onClick={() => moveCaptainUp(idx)} disabled={idx === 0}>
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => moveCaptainDown(idx)} disabled={idx === captainList.length - 1}>
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Stack>

                <Divider sx={{ my: 1.5 }} />
                <Typography sx={{ fontWeight: 'bold', mb: 1, fontSize: '1rem' }}>
                  ③ 옵션
                </Typography>
                <FormControlLabel
                  control={<Switch checked={snake} onChange={(e) => setSnake(e.target.checked)} />}
                  label="스네이크 드래프트 (권장)"
                />
                <Typography sx={{ fontSize: '0.78rem', color: '#888', mt: 0.5 }}>
                  {snake ? 'A→B→C→C→B→A… (공평)' : 'A→B→C→A→B→C… (순환)'}
                </Typography>
              </>
            )}

            {/* 적용 / 취소 */}
            <Stack direction="row" spacing={1} sx={{ mt: 2.5 }}>
              <Button
                variant="contained" size="large"
                startIcon={draft ? <RestartAltIcon /> : <PlayArrowIcon />}
                onClick={startDraft}
                disabled={captainList.length < 2}
                sx={{
                  borderRadius: 2, fontWeight: 900, py: 1.2, flex: 1,
                  background: 'linear-gradient(135deg, #2E7D32, #1B5E20)',
                  '&:disabled': { background: '#ccc' },
                }}
              >
                {draft ? '✓ 적용 (드래프트 리셋)' : '🚀 드래프트 시작'}
              </Button>
              <Button
                variant="outlined" size="large"
                onClick={cancelCaptainEdit}
                sx={{ borderRadius: 2, fontWeight: 800, py: 1.2, px: 2.5, color: '#666', borderColor: '#ccc' }}
              >
                취소
              </Button>
            </Stack>
            {captainList.length < 2 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#E65100', mt: 1, textAlign: 'center', fontWeight: 600 }}>
                ⚠ 주장을 최소 2명 이상 선택해주세요
              </Typography>
            )}
          </Paper>
        )}
      </Container>
    );
  }

  // ──────────────────────────────────────
  // RENDER: SETUP (드래프트 미시작, 주장/일반 유저)
  // ──────────────────────────────────────
  if (!draft || status === 'setup') {
    return (
      <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
        {header}
        <Alert severity="info">드래프트가 아직 시작되지 않았습니다. 관리자가 주장을 선정하고 시작하기를 기다려주세요.</Alert>
      </Container>
    );
  }

  // ──────────────────────────────────────
  // RENDER: 비-주장 일반 사용자 (관전 불가)
  // ──────────────────────────────────────
  if (!myTeamCode) {
    return (
      <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
        {header}
        <Alert severity="warning">
          드래프트 진행은 주장만 참여할 수 있습니다. 결과가 확정되면 경기 운영 화면에서 확인하세요.
        </Alert>
      </Container>
    );
  }

  // ──────────────────────────────────────
  // RENDER: ACTIVE (드래프트 진행 중)
  // ──────────────────────────────────────
  if (status === 'active') {
    const codes = draft.pickOrder || [];
    const pool = draft.pool || [];
    const teams = draft.teams || {};
    const picks = draft.picks || [];
    const totalPicks = (pool.length + picks.length);

    return (
      <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
        {header}

        {/* 🧪 Dev: 테스트용 주장 역할 전환 */}
        <DevCaptainSwitcher />

        {/* 현재 차례 */}
        <Paper sx={{
          borderRadius: 3, p: 2, mb: 2, boxShadow: 3,
          bgcolor: isMyTurn ? '#FFF3E0' : TEAM_THEME[currentTeamCode]?.light,
          border: isMyTurn ? '3px solid #FF6F00' : `2px solid ${TEAM_THEME[currentTeamCode]?.border}`,
          animation: isMyTurn ? 'myTurnPulse 1.5s ease-in-out infinite' : 'none',
          '@keyframes myTurnPulse': {
            '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,111,0,0.4)' },
            '50%': { boxShadow: '0 0 0 10px rgba(255,111,0,0)' },
          },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: TEAM_THEME[currentTeamCode]?.bg }}>
              {isMyTurn ? '🔥 내 차례!' : `${TEAM_THEME[currentTeamCode]?.name} (${draft.captains[currentTeamCode]}) 차례`}
            </Typography>
            <Chip
              label={`${picks.length + 1}/${totalPicks}`}
              size="small"
              sx={{ ml: 'auto', fontWeight: 800 }}
            />
          </Box>
        </Paper>

        {/* 팀 현황 */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 'bold', mb: 1, fontSize: '0.95rem' }}>팀 현황</Typography>
          <Box sx={{ display: 'flex', gap: 0.8 }}>
            {codes.map((code) => {
              const theme = TEAM_THEME[code] || TEAM_THEME.A;
              const isCurrent = code === currentTeamCode;
              return (
                <Box key={code} sx={{
                  flex: 1, border: `2px solid ${isCurrent ? theme.bg : theme.border}`,
                  bgcolor: theme.light, borderRadius: 1.5, p: 0.8,
                  boxShadow: isCurrent ? `0 0 0 2px ${theme.bg}44` : 'none',
                }}>
                  <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: theme.bg, textAlign: 'center', mb: 0.5 }}>
                    {theme.name} ({(teams[code] || []).length})
                  </Typography>
                  {(teams[code] || []).map((name, i) => (
                    <Box key={name} sx={{
                      bgcolor: 'white', borderRadius: 0.8, px: 0.5, py: 0.3, mb: 0.3,
                      display: 'flex', alignItems: 'center', gap: 0.3,
                      border: i === 0 ? `1px solid ${theme.bg}` : '1px solid #E0E0E0',
                    }}>
                      <Typography sx={{ fontSize: '0.68rem', color: '#888', fontWeight: 700 }}>{i + 1}.</Typography>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: i === 0 ? 800 : 600, color: i === 0 ? theme.bg : '#222' }}>
                        {name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        </Paper>

        {/* 선수 풀 */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>선수 풀 ({pool.length}명)</Typography>
            {!isMyTurn && !canAdmin && (
              <Typography sx={{ ml: 'auto', fontSize: '0.75rem', color: '#999' }}>
                {draft.captains[currentTeamCode]}의 차례를 기다리는 중...
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {pool.map((name) => {
              const pickable = isMyTurn || canAdmin;
              return (
                <Chip
                  key={name}
                  label={name}
                  onClick={pickable ? () => pickPlayer(name) : undefined}
                  sx={{
                    fontWeight: 600,
                    bgcolor: pickable ? '#1565C0' : '#F5F5F5',
                    color: pickable ? 'white' : '#888',
                    cursor: pickable ? 'pointer' : 'default',
                    '&:hover': pickable ? { bgcolor: '#0D47A1' } : {},
                  }}
                />
              );
            })}
          </Box>
        </Paper>

        {/* 관리자(주장 겸임) 전용: 관리자 모드 전환 버튼 */}
        {canAdmin && myTeamCode && (
          <Button
            fullWidth variant="outlined" size="small"
            onClick={() => setAdminPanelMode(true)}
            sx={{ mb: 1, borderRadius: 2, borderColor: '#7B1FA2', color: '#7B1FA2', fontSize: '0.75rem' }}
          >
            🛡 관리자 모드 (주장 재선정)
          </Button>
        )}
      </Container>
    );
  }

  // ──────────────────────────────────────
  // RENDER: REVIEW (드래프트 완료 후 검토)
  // ──────────────────────────────────────
  if (status === 'review') {
    const codes = draft.pickOrder || [];
    const teams = draft.teams || {};
    const resetRequests = draft.resetRequests || {};
    const myResetRequested = myTeamCode && resetRequests[myTeamCode];
    const agreedCount = codes.filter((c) => resetRequests[c]).length;

    return (
      <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
        {header}

        {/* 🧪 Dev: 테스트용 주장 역할 전환 */}
        <DevCaptainSwitcher />

        <Alert severity="success" sx={{ mb: 2 }}>
          드래프트가 완료되었습니다. 팀을 검토하고 확정해주세요.
        </Alert>

        {/* 완성된 팀 */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Typography sx={{ fontWeight: 'bold', mb: 1, fontSize: '1rem' }}>팀 구성</Typography>
          <Box sx={{ display: 'flex', gap: 0.8 }}>
            {codes.map((code) => {
              const theme = TEAM_THEME[code] || TEAM_THEME.A;
              return (
                <Box key={code} sx={{
                  flex: 1, border: `2px solid ${theme.border}`,
                  bgcolor: theme.light, borderRadius: 1.5, p: 0.8,
                }}>
                  <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: theme.bg, textAlign: 'center', mb: 0.5 }}>
                    {theme.name} ({(teams[code] || []).length})
                  </Typography>
                  {(teams[code] || []).map((name, i) => (
                    <Box key={name} sx={{
                      bgcolor: 'white', borderRadius: 0.8, px: 0.5, py: 0.3, mb: 0.3,
                      border: i === 0 ? `1px solid ${theme.bg}` : '1px solid #E0E0E0',
                    }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: i === 0 ? 800 : 600, color: i === 0 ? theme.bg : '#222' }}>
                        {i + 1}. {name}{i === 0 && ' ©'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        </Paper>

        {/* 트레이드 */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <SwapHorizIcon sx={{ color: '#1565C0' }} />
            <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>트레이드</Typography>
          </Box>
          {(() => {
            const trades = draft.trades || [];
            const pending = trades.filter((t) => t.status === 'pending');
            const incoming = pending.filter((t) => myTeamCode && t.to === myTeamCode);
            const outgoing = pending.filter((t) => myTeamCode && t.from === myTeamCode);
            const history = trades.filter((t) => t.status !== 'pending');
            return (
              <>
                {/* 받은 제안 */}
                {incoming.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#E65100', fontWeight: 700, mb: 0.5 }}>
                      📩 받은 트레이드 제안
                    </Typography>
                    {incoming.map((t) => (
                      <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 0.8, mb: 0.5, bgcolor: '#FFF3E0', borderRadius: 1, border: '1px solid #FFE0B2' }}>
                        <Typography sx={{ fontSize: '0.8rem', flex: 1 }}>
                          <b>{t.take}</b> (내팀) ↔ <b>{t.give}</b> ({TEAM_THEME[t.from].name})
                        </Typography>
                        <Button size="small" variant="contained" color="success"
                          onClick={() => respondTrade(t.id, true)}
                          sx={{ minWidth: 'auto', px: 1, fontSize: '0.72rem' }}>수락</Button>
                        <Button size="small" variant="outlined" color="error"
                          onClick={() => respondTrade(t.id, false)}
                          sx={{ minWidth: 'auto', px: 1, fontSize: '0.72rem' }}>거절</Button>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* 보낸 제안 */}
                {outgoing.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#666', fontWeight: 700, mb: 0.5 }}>
                      📤 보낸 제안 (대기 중)
                    </Typography>
                    {outgoing.map((t) => (
                      <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 0.8, mb: 0.5, bgcolor: '#F5F5F5', borderRadius: 1, border: '1px solid #E0E0E0' }}>
                        <Typography sx={{ fontSize: '0.8rem', flex: 1 }}>
                          <b>{t.give}</b> (내팀) → <b>{t.take}</b> ({TEAM_THEME[t.to].name})
                        </Typography>
                        <Button size="small" variant="text" onClick={() => cancelTrade(t.id)}
                          sx={{ fontSize: '0.72rem', color: '#999' }}>취소</Button>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* 히스토리 */}
                {history.length > 0 && (
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#999', fontWeight: 700, mb: 0.5 }}>
                      히스토리
                    </Typography>
                    {history.slice(-5).reverse().map((t) => {
                      const statusLabel = {
                        accepted: { label: '✓ 성사', color: '#2E7D32' },
                        rejected: { label: '✕ 거절', color: '#C62828' },
                        cancelled: { label: '취소', color: '#999' },
                        invalid: { label: '무효', color: '#999' },
                      }[t.status] || { label: t.status, color: '#999' };
                      return (
                        <Typography key={t.id} sx={{ fontSize: '0.75rem', color: statusLabel.color, mb: 0.3 }}>
                          [{statusLabel.label}] {TEAM_THEME[t.from]?.name} {t.give} ↔ {TEAM_THEME[t.to]?.name} {t.take}
                        </Typography>
                      );
                    })}
                  </Box>
                )}

                {/* 제안 버튼 */}
                {(myTeamCode || canAdmin) && (
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<SwapHorizIcon />}
                    onClick={openTradeDialog}
                    sx={{
                      mt: incoming.length + outgoing.length + history.length > 0 ? 1 : 0,
                      borderRadius: 2, fontWeight: 700, py: 1,
                      borderColor: '#1565C0', color: '#1565C0', borderWidth: 2,
                      '&:hover': { borderColor: '#0D47A1', borderWidth: 2, bgcolor: '#E3F2FD' },
                    }}
                  >
                    새 트레이드 제안하기
                  </Button>
                )}
                {(incoming.length + outgoing.length + history.length === 0) && (myTeamCode || canAdmin) && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#999', mt: 0.8, textAlign: 'center' }}>
                    아직 트레이드 내역이 없습니다
                  </Typography>
                )}
              </>
            );
          })()}
        </Paper>

        {/* 재시작 합의 */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2, border: '1px solid #FFE082' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <WarningAmberIcon sx={{ color: '#F57C00' }} />
            <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', flex: 1 }}>처음부터 재시작</Typography>
            <Chip
              label={`${agreedCount}/${codes.length} 동의`}
              size="small"
              sx={{
                bgcolor: agreedCount === codes.length ? '#2E7D32' : agreedCount > 0 ? '#F57C00' : '#E0E0E0',
                color: agreedCount > 0 ? 'white' : '#666',
                fontWeight: 800, fontSize: '0.72rem', height: 22,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: '0.78rem', color: '#666', mb: 1.2 }}>
            주장 전원 동의 시 드래프트를 처음부터 다시 시작합니다.
          </Typography>

          {/* 주장별 동의 상태 — 가로 꽉 채우기 */}
          <Box sx={{ display: 'flex', gap: 0.6, mb: 1.5 }}>
            {codes.map((code) => {
              const theme = TEAM_THEME[code] || TEAM_THEME.A;
              const agreed = resetRequests[code];
              return (
                <Box
                  key={code}
                  sx={{
                    flex: 1,
                    p: 0.8,
                    borderRadius: 1.5,
                    bgcolor: agreed ? '#2E7D32' : theme.light,
                    border: `2px solid ${agreed ? '#1B5E20' : theme.border}`,
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <Typography sx={{
                    fontWeight: 900, fontSize: '0.78rem',
                    color: agreed ? 'white' : theme.bg,
                  }}>
                    {theme.name}
                  </Typography>
                  <Typography sx={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: agreed ? 'white' : '#999',
                    mt: 0.2,
                  }}>
                    {agreed ? '✓ 동의' : '대기 중'}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {myTeamCode && (
            myResetRequested ? (
              <Button
                fullWidth
                variant="outlined"
                onClick={cancelResetRequest}
                sx={{
                  borderRadius: 2, fontWeight: 700, py: 1,
                  borderColor: '#999', color: '#666',
                }}
              >
                재시작 요청 취소
              </Button>
            ) : (
              <Button
                fullWidth
                variant="contained"
                startIcon={<RestartAltIcon />}
                onClick={requestReset}
                sx={{
                  borderRadius: 2, fontWeight: 800, py: 1,
                  background: 'linear-gradient(135deg, #F57C00, #E65100)',
                  '&:hover': { background: 'linear-gradient(135deg, #E65100, #BF360C)' },
                }}
              >
                재시작 요청하기
              </Button>
            )
          )}
        </Paper>

        {/* 트레이드 제안 다이얼로그 */}
        <Dialog open={!!tradeForm} onClose={() => setTradeForm(null)} fullWidth maxWidth="sm"
          PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
          {tradeForm && (() => {
            const fromTheme = TEAM_THEME[tradeForm.fromCode] || TEAM_THEME.A;
            const toTheme = tradeForm.otherCode ? TEAM_THEME[tradeForm.otherCode] : null;
            const myTeam = (draft.teams?.[tradeForm.fromCode] || []).filter((p) => p !== draft.captains[tradeForm.fromCode]);
            const otherCodes = (draft.pickOrder || []).filter((c) => c !== tradeForm.fromCode);
            const otherTeam = tradeForm.otherCode
              ? (draft.teams?.[tradeForm.otherCode] || []).filter((p) => p !== draft.captains[tradeForm.otherCode])
              : [];
            const isComplete = tradeForm.myPlayer && tradeForm.otherCode && tradeForm.otherPlayer;

            return (
              <>
                {/* 헤더 */}
                <Box sx={{
                  background: 'linear-gradient(135deg, #1565C0 0%, #7B1FA2 100%)',
                  color: 'white', px: 2.5, py: 1.8,
                  display: 'flex', alignItems: 'center', gap: 1,
                }}>
                  <SwapHorizIcon sx={{ fontSize: 26 }} />
                  <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', flex: 1 }}>트레이드 제안</Typography>
                  <IconButton size="small" onClick={() => setTradeForm(null)} sx={{ color: 'white' }}>
                    <Typography sx={{ fontSize: '1.2rem', fontWeight: 900 }}>×</Typography>
                  </IconButton>
                </Box>

                <DialogContent sx={{ px: 2.5, py: 2 }}>
                  {/* STEP 1: 내 선수 선택 */}
                  <Box sx={{ mb: 2.2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                      <Box sx={{
                        width: 22, height: 22, borderRadius: '50%',
                        bgcolor: fromTheme.bg, color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.72rem', fontWeight: 900,
                      }}>1</Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', flex: 1 }}>
                        내보낼 내 선수
                      </Typography>
                      <Chip label={fromTheme.name} size="small"
                        sx={{ bgcolor: fromTheme.bg, color: 'white', fontWeight: 800, height: 22, fontSize: '0.7rem' }} />
                    </Box>
                    {myTeam.length === 0 ? (
                      <Typography sx={{ fontSize: '0.8rem', color: '#999', py: 1, textAlign: 'center' }}>
                        트레이드 가능한 선수가 없습니다.
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                        {myTeam.map((p) => {
                          const selected = tradeForm.myPlayer === p;
                          return (
                            <Chip key={p} label={p}
                              onClick={() => setTradeForm({ ...tradeForm, myPlayer: p })}
                              sx={{
                                fontWeight: selected ? 900 : 600,
                                fontSize: '0.82rem',
                                bgcolor: selected ? fromTheme.bg : fromTheme.light,
                                color: selected ? 'white' : '#333',
                                border: `2px solid ${selected ? fromTheme.bg : fromTheme.border}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                transform: selected ? 'scale(1.05)' : 'scale(1)',
                                boxShadow: selected ? `0 3px 10px ${fromTheme.bg}55` : 'none',
                                '&:hover': {
                                  bgcolor: selected ? fromTheme.bg : '#fff',
                                },
                              }} />
                          );
                        })}
                      </Box>
                    )}
                  </Box>

                  <Divider sx={{ my: 1.5 }} />

                  {/* STEP 2: 상대 팀 선택 */}
                  <Box sx={{ mb: 2.2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                      <Box sx={{
                        width: 22, height: 22, borderRadius: '50%',
                        bgcolor: '#555', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.72rem', fontWeight: 900,
                      }}>2</Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                        트레이드할 상대 팀
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.8 }}>
                      {otherCodes.map((c) => {
                        const theme = TEAM_THEME[c];
                        const selected = tradeForm.otherCode === c;
                        return (
                          <Box key={c}
                            onClick={() => setTradeForm({ ...tradeForm, otherCode: c, otherPlayer: '' })}
                            sx={{
                              flex: 1, py: 1.2, px: 1, borderRadius: 2,
                              border: `2px solid ${selected ? theme.bg : theme.border}`,
                              bgcolor: selected ? theme.bg : theme.light,
                              color: selected ? 'white' : theme.bg,
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s',
                              transform: selected ? 'scale(1.03)' : 'scale(1)',
                              boxShadow: selected ? `0 4px 12px ${theme.bg}55` : 'none',
                              '&:hover': { bgcolor: selected ? theme.bg : '#fff' },
                            }}>
                            <Typography sx={{ fontWeight: 900, fontSize: '0.95rem' }}>{theme.name}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', opacity: 0.85, mt: 0.2 }}>
                              주장 {draft.captains[c]}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>

                  {/* STEP 3: 상대 선수 선택 */}
                  {tradeForm.otherCode && toTheme && (
                    <>
                      <Divider sx={{ my: 1.5 }} />
                      <Box sx={{ mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                          <Box sx={{
                            width: 22, height: 22, borderRadius: '50%',
                            bgcolor: toTheme.bg, color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.72rem', fontWeight: 900,
                          }}>3</Box>
                          <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', flex: 1 }}>
                            받을 상대 선수
                          </Typography>
                          <Chip label={toTheme.name} size="small"
                            sx={{ bgcolor: toTheme.bg, color: 'white', fontWeight: 800, height: 22, fontSize: '0.7rem' }} />
                        </Box>
                        {otherTeam.length === 0 ? (
                          <Typography sx={{ fontSize: '0.8rem', color: '#999', py: 1, textAlign: 'center' }}>
                            트레이드 가능한 선수가 없습니다.
                          </Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                            {otherTeam.map((p) => {
                              const selected = tradeForm.otherPlayer === p;
                              return (
                                <Chip key={p} label={p}
                                  onClick={() => setTradeForm({ ...tradeForm, otherPlayer: p })}
                                  sx={{
                                    fontWeight: selected ? 900 : 600,
                                    fontSize: '0.82rem',
                                    bgcolor: selected ? toTheme.bg : toTheme.light,
                                    color: selected ? 'white' : '#333',
                                    border: `2px solid ${selected ? toTheme.bg : toTheme.border}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    transform: selected ? 'scale(1.05)' : 'scale(1)',
                                    boxShadow: selected ? `0 3px 10px ${toTheme.bg}55` : 'none',
                                    '&:hover': {
                                      bgcolor: selected ? toTheme.bg : '#fff',
                                    },
                                  }} />
                              );
                            })}
                          </Box>
                        )}
                      </Box>
                    </>
                  )}

                  {/* 미리보기 */}
                  {isComplete && (
                    <Box sx={{
                      mt: 2, p: 1.5, borderRadius: 2,
                      bgcolor: '#FAFAFA', border: '1px dashed #BDBDBD',
                    }}>
                      <Typography sx={{ fontSize: '0.72rem', color: '#888', fontWeight: 700, mb: 1, textAlign: 'center' }}>
                        🔍 교환 미리보기
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <Box sx={{
                          flex: 1, textAlign: 'center', p: 1, borderRadius: 1.5,
                          bgcolor: fromTheme.light, border: `2px solid ${fromTheme.bg}`,
                        }}>
                          <Typography sx={{ fontSize: '0.65rem', color: fromTheme.bg, fontWeight: 700 }}>
                            {fromTheme.name} → {toTheme.name}
                          </Typography>
                          <Typography sx={{ fontWeight: 900, color: fromTheme.bg, fontSize: '0.95rem', mt: 0.3 }}>
                            {tradeForm.myPlayer}
                          </Typography>
                        </Box>
                        <Box sx={{
                          fontSize: '1.5rem',
                          animation: 'swapPulse 1.2s ease-in-out infinite',
                          '@keyframes swapPulse': {
                            '0%, 100%': { transform: 'scale(1)' },
                            '50%': { transform: 'scale(1.2)' },
                          },
                        }}>⇄</Box>
                        <Box sx={{
                          flex: 1, textAlign: 'center', p: 1, borderRadius: 1.5,
                          bgcolor: toTheme.light, border: `2px solid ${toTheme.bg}`,
                        }}>
                          <Typography sx={{ fontSize: '0.65rem', color: toTheme.bg, fontWeight: 700 }}>
                            {toTheme.name} → {fromTheme.name}
                          </Typography>
                          <Typography sx={{ fontWeight: 900, color: toTheme.bg, fontSize: '0.95rem', mt: 0.3 }}>
                            {tradeForm.otherPlayer}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  <Typography sx={{ fontSize: '0.72rem', color: '#999', mt: 1.5, textAlign: 'center' }}>
                    ※ 주장은 트레이드 대상에서 제외됩니다
                  </Typography>
                </DialogContent>

                <DialogActions sx={{ px: 2.5, pb: 2, pt: 0 }}>
                  <Button onClick={() => setTradeForm(null)} sx={{ color: '#666' }}>
                    취소
                  </Button>
                  <Button onClick={proposeTrade} variant="contained"
                    disabled={!isComplete}
                    startIcon={<SwapHorizIcon />}
                    sx={{
                      borderRadius: 2, fontWeight: 900, px: 2.5,
                      background: isComplete
                        ? 'linear-gradient(135deg, #1565C0 0%, #7B1FA2 100%)'
                        : undefined,
                      '&:disabled': { background: '#ccc', color: 'white' },
                    }}>
                    트레이드 제안
                  </Button>
                </DialogActions>
              </>
            );
          })()}
        </Dialog>

        {/* 최종 확정 (주장 누구나 클릭 가능) */}
        <Button
          fullWidth variant="contained" size="large"
          startIcon={<CheckCircleIcon />}
          onClick={() => setConfirmDialog(true)}
          sx={{
            borderRadius: 2, fontWeight: 900, py: 1.3,
            background: 'linear-gradient(135deg, #2E7D32, #1B5E20)',
            '&:hover': { background: 'linear-gradient(135deg, #1B5E20, #1B5E20)' },
          }}
        >
          ✅ 최종 확정 (팀 반영)
        </Button>

        {/* 관리자(주장 겸임) 전용: 관리자 모드 전환 */}
        {canAdmin && myTeamCode && (
          <Button
            fullWidth variant="outlined" size="small"
            onClick={() => setAdminPanelMode(true)}
            sx={{ mt: 1, borderRadius: 2, borderColor: '#7B1FA2', color: '#7B1FA2', fontSize: '0.75rem' }}
          >
            🛡 관리자 모드 (주장 재선정)
          </Button>
        )}

        <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
          <DialogTitle>드래프트 확정</DialogTitle>
          <DialogContent>
            이 팀 구성으로 최종 확정하시겠습니까? 경기 운영 화면에 반영됩니다.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialog(false)}>취소</Button>
            <Button onClick={confirmDraft} variant="contained">확정</Button>
          </DialogActions>
        </Dialog>
      </Container>
    );
  }

  // ──────────────────────────────────────
  // RENDER: CONFIRMED
  // ──────────────────────────────────────
  const codes = draft.pickOrder || [];
  const teams = draft.teams || {};
  const reDraftReq = draft.reDraftRequests || {};
  const agreedCount = codes.filter((c) => reDraftReq[c]).length;
  const myReDraftRequested = myTeamCode && reDraftReq[myTeamCode];

  const requestReDraft = async () => {
    const updated = myTeamCode ? { ...reDraftReq, [myTeamCode]: true } : reDraftReq;
    const allAgreed = codes.length > 0 && codes.every((c) => updated[c]);
    if (allAgreed) {
      // 전원 동의 → 자동 재시작
      await adminRestart();
    } else {
      await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
        reDraftRequests: updated,
      });
    }
  };

  const cancelReDraft = async () => {
    if (!myTeamCode) return;
    const updated = { ...reDraftReq, [myTeamCode]: false };
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${date}/Draft`), {
      reDraftRequests: updated,
    });
  };

  return (
    <Container maxWidth="sm" sx={{ pt: 3, pb: 12 }}>
      {header}

      {/* 🧪 Dev: 테스트용 주장 역할 전환 */}
      <DevCaptainSwitcher />

      <Alert severity="success" sx={{ mb: 2 }}>
        드래프트가 확정되었습니다. 포메이션 설정이나 재드래프트 요청을 할 수 있어요.
      </Alert>

      {/* 확정된 팀 구성 표시 */}
      <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
        <Typography sx={{ fontWeight: 'bold', mb: 1, fontSize: '1rem' }}>확정된 팀</Typography>
        <Box sx={{ display: 'flex', gap: 0.8 }}>
          {codes.map((code) => {
            const theme = TEAM_THEME[code] || TEAM_THEME.A;
            return (
              <Box key={code} sx={{
                flex: 1, border: `2px solid ${theme.border}`,
                bgcolor: theme.light, borderRadius: 1.5, p: 0.8,
              }}>
                <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: theme.bg, textAlign: 'center', mb: 0.5 }}>
                  {theme.name} ({(teams[code] || []).length})
                </Typography>
                {(teams[code] || []).map((name, i) => (
                  <Box key={name} sx={{
                    bgcolor: 'white', borderRadius: 0.8, px: 0.5, py: 0.3, mb: 0.3,
                    border: i === 0 ? `1px solid ${theme.bg}` : '1px solid #E0E0E0',
                  }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: i === 0 ? 800 : 600, color: i === 0 ? theme.bg : '#222' }}>
                      {i + 1}. {name}{i === 0 && ' ©'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      </Paper>

      {/* 인라인 포메이션 편집기 (주장 전용, 자기 팀만) */}
      {myTeamCode && (() => {
        const theme = TEAM_THEME[myTeamCode];
        const myTeamPlayers = draft.teams?.[myTeamCode] || [];
        const tf = teamFormations[myTeamCode] || {};
        const fmId = tf.formationId || clubFormation || getDefaultFormation(clubType);
        const fmDef = getFormations(clubType)[fmId];
        const assignedPlayers = tf.players || {};
        const unassignedPlayers = myTeamPlayers.filter((p) => !Object.values(assignedPlayers).includes(p));

        return (
          <Paper sx={{
            borderRadius: 3, p: 2, mb: 2, boxShadow: 3,
            border: `2px solid ${theme.bg}`,
            background: `linear-gradient(180deg, ${theme.light} 0%, #FAFAFA 100%)`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <ShieldIcon sx={{ color: theme.bg, fontSize: 22 }} />
              <Typography sx={{ fontWeight: 900, fontSize: '1rem', color: theme.bg, flex: 1 }}>
                ⚽ {theme.name} 포메이션 설정
              </Typography>
              <Chip label={fmId} size="small" sx={{ bgcolor: theme.bg, color: 'white', fontWeight: 800 }} />
            </Box>

            {/* 포메이션 프리셋 선택 */}
            <Typography sx={{ fontSize: '0.74rem', color: '#666', fontWeight: 700, mb: 0.6 }}>
              포메이션 선택
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
              {Object.entries(getFormations(clubType)).map(([key, fm]) => {
                const active = fmId === key;
                return (
                  <Chip
                    key={key}
                    label={fm.name}
                    size="small"
                    onClick={() => changeFormation(myTeamCode, key)}
                    sx={{
                      fontWeight: 700, fontSize: '0.75rem',
                      bgcolor: active ? theme.bg : '#F0F2F5',
                      color: active ? 'white' : '#555',
                      border: active ? `2px solid ${theme.bg}` : '1px solid transparent',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: active ? theme.bg : '#E0E0E0' },
                    }}
                  />
                );
              })}
            </Box>

            {/* 필드 */}
            {fmDef && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                <FormationField
                  clubType={clubType}
                  positions={fmDef.positions}
                  players={assignedPlayers}
                  selectedPos={selectedPos}
                  onPositionClick={(posId) => {
                    // 기존 선택 → swap, 첫 선택 → 선택 상태
                    if (!selectedPos) { setSelectedPos(posId); return; }
                    if (selectedPos === posId) { setSelectedPos(null); return; }
                    swapPositions(myTeamCode, selectedPos, posId);
                  }}
                  width={Math.min(320, window.innerWidth - 80)}
                />
              </Box>
            )}

            {/* 안내 문구 */}
            {selectedPos && (
              <Typography sx={{ fontSize: '0.75rem', color: '#FF6F00', fontWeight: 700, mb: 0.8, textAlign: 'center' }}>
                📍 {fmDef?.positions.find((p) => p.id === selectedPos)?.label} 선택됨 → 다른 포지션 또는 아래 선수 터치
              </Typography>
            )}

            {/* 미배치 선수 */}
            {unassignedPlayers.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: '0.72rem', color: '#999', fontWeight: 700, mb: 0.5 }}>
                  미배치 선수 {unassignedPlayers.length}명 {selectedPos ? '— 터치해서 배치' : '— 포지션을 먼저 터치'}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
                  {unassignedPlayers.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      size="small"
                      onClick={() => {
                        if (!selectedPos) return;
                        assignPlayerToPosition(myTeamCode, selectedPos, name);
                      }}
                      sx={{
                        fontWeight: 600, fontSize: '0.76rem',
                        cursor: selectedPos ? 'pointer' : 'default',
                        bgcolor: selectedPos ? '#FFF8E1' : '#F5F5F5',
                        color: selectedPos ? '#E65100' : '#999',
                        border: selectedPos ? '1.5px solid #FFB300' : '1px solid #E0E0E0',
                        '&:hover': selectedPos ? { bgcolor: '#FFECB3' } : {},
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {unassignedPlayers.length === 0 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#2E7D32', fontWeight: 700, textAlign: 'center' }}>
                ✓ 모든 선수 배치 완료
              </Typography>
            )}
          </Paper>
        );
      })()}

      {/* 관리자: 포메이션 편집은 경기 운영에서 (인라인 편집기는 주장 전용) */}
      {!myTeamCode && canAdmin && (
        <Button
          fullWidth variant="outlined" size="large"
          startIcon={<ShieldIcon />}
          onClick={() => navigate(`/player-select?date=${date}`)}
          sx={{
            borderRadius: 2, fontWeight: 800, py: 1.2, mb: 2,
            borderColor: '#E65100', color: '#E65100', borderWidth: 2,
          }}
        >
          경기 운영 · 포메이션 관리
        </Button>
      )}

      {/* 재드래프트 요청 */}
      <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2, border: '1px solid #E1BEE7', bgcolor: '#F3E5F5' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <RestartAltIcon sx={{ color: '#7B1FA2' }} />
          <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#4A148C', flex: 1 }}>
            재드래프트 요청
          </Typography>
          <Chip
            label={`${agreedCount}/${codes.length} 동의`}
            size="small"
            sx={{
              bgcolor: agreedCount === codes.length && codes.length > 0 ? '#2E7D32'
                : agreedCount > 0 ? '#7B1FA2' : '#E0E0E0',
              color: agreedCount > 0 ? 'white' : '#888',
              fontWeight: 800, fontSize: '0.72rem', height: 22,
            }}
          />
        </Box>
        <Typography sx={{ fontSize: '0.78rem', color: '#666', mb: 1.2 }}>
          주장 전원 동의 시 드래프트를 처음부터 다시 시작합니다. {canAdmin && '(관리자는 즉시 재시작 가능)'}
        </Typography>

        {/* 주장별 동의 상태 - 가로 꽉 채우기 */}
        <Box sx={{ display: 'flex', gap: 0.6, mb: 1.5 }}>
          {codes.map((code) => {
            const theme = TEAM_THEME[code] || TEAM_THEME.A;
            const agreed = reDraftReq[code];
            return (
              <Box
                key={code}
                sx={{
                  flex: 1, p: 0.8, borderRadius: 1.5,
                  bgcolor: agreed ? '#2E7D32' : theme.light,
                  border: `2px solid ${agreed ? '#1B5E20' : theme.border}`,
                  textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <Typography sx={{
                  fontWeight: 900, fontSize: '0.78rem',
                  color: agreed ? 'white' : theme.bg,
                }}>
                  {theme.name}
                </Typography>
                <Typography sx={{
                  fontSize: '0.72rem', fontWeight: 700,
                  color: agreed ? 'white' : '#999', mt: 0.2,
                }}>
                  {agreed ? '✓ 동의' : '대기 중'}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* 액션 버튼 - full-width */}
        {myTeamCode && (
          myReDraftRequested ? (
            <Button
              fullWidth variant="outlined"
              onClick={cancelReDraft}
              sx={{
                borderRadius: 2, fontWeight: 700, py: 1,
                borderColor: '#999', color: '#666',
              }}
            >
              재드래프트 요청 취소
            </Button>
          ) : (
            <Button
              fullWidth variant="contained"
              startIcon={<RestartAltIcon />}
              onClick={requestReDraft}
              sx={{
                borderRadius: 2, fontWeight: 800, py: 1,
                background: 'linear-gradient(135deg, #7B1FA2, #4A148C)',
                '&:hover': { background: 'linear-gradient(135deg, #6A1B9A, #38006b)' },
              }}
            >
              재드래프트 동의하기
            </Button>
          )
        )}
      </Paper>

      {/* 관리자(주장 겸임) 전용: 관리자 모드 전환 */}
      {canAdmin && myTeamCode && (
        <Button
          fullWidth variant="outlined" size="small"
          onClick={() => setAdminPanelMode(true)}
          sx={{ mt: 1, borderRadius: 2, borderColor: '#7B1FA2', color: '#7B1FA2', fontSize: '0.75rem' }}
        >
          🛡 관리자 모드 (주장 재선정/취소)
        </Button>
      )}
    </Container>
  );
}

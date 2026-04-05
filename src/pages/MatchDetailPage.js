import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { ref, get } from 'firebase/database';
import {
  Container, Box, Typography, Button, CircularProgress, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useAuth } from '../contexts/AuthContext';
import { formatDateWithDay } from '../utils/format';
import { getFormations } from '../config/formations';

// 로스터에서 특정 팀의 선수 명단 추출
function extractTeamRoster(rosterData, teamName, teamSide) {
  const entries = Object.entries(rosterData);
  const tName = (teamName || '').toLowerCase().trim();

  // 1. 키가 팀 이름과 정확히 일치
  for (const [key, val] of entries) {
    if (key.toLowerCase().trim() === tName) {
      return val ? Object.values(val).filter(Boolean).map(String) : [];
    }
  }

  // 2. 키가 team1/team2 패턴
  for (const [key, val] of entries) {
    const k = key.toLowerCase().trim();
    const num = teamSide === 'team1' ? '1' : '2';
    if (k === `team${num}` || k === `team_${num}`) {
      return val ? Object.values(val).filter(Boolean).map(String) : [];
    }
  }

  // 3. 키 정렬 후 순서로 매칭 (첫번째=team1, 두번째=team2)
  const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
  const idx = teamSide === 'team1' ? 0 : 1;
  if (sorted[idx]) {
    const val = sorted[idx][1];
    return val ? Object.values(val).filter(Boolean).map(String) : [];
  }
  return [];
}

// 선수 포지션 계산 (안드로이드 로직 이식)
function calculateTeamPositions(team, isHome, fieldW, fieldH, statsMap) {
  if (!team || team.length === 0) return [];

  const positions = [];
  const assigned = new Set();
  const unique = [...new Set(team)];

  const centerX = fieldW / 2;
  const leftX = fieldW * 0.22;
  const rightX = fieldW * 0.78;

  const halfH = fieldH / 2;
  // Home: top half, Away: bottom half (여유있게 분배)
  const gkY      = isHome ? 28  : fieldH - 75;
  const defY     = isHome ? halfH * 0.38 : fieldH - halfH * 0.38;
  const midY     = isHome ? halfH * 0.62 : fieldH - halfH * 0.62;
  const attackY  = isHome ? halfH * 0.85 : fieldH - halfH * 0.85;

  const getScore = (name) => {
    const s = statsMap[name];
    if (!s) return 0;
    const game = (s.totalGoals || 0) + (s.totalAssists || 0);
    const avg = (s.avgGoalsPerGame || 0) + (s.avgAssistsPerGame || 0);
    return game > 0 ? game : avg;
  };

  const getAssistScore = (name) => {
    const s = statsMap[name];
    if (!s) return 0;
    return (s.totalAssists || 0) > 0 ? s.totalAssists : (s.avgAssistsPerGame || 0);
  };

  // 1. 어시스트 1위 → 미드필더 중앙
  const topAssist = [...unique].sort((a, b) => getAssistScore(b) - getAssistScore(a))[0];
  positions.push({ name: topAssist, x: centerX, y: midY, isHome });
  assigned.add(topAssist);

  // 2. 공격포인트 상위 2명 → 양쪽 공격
  const topScorers = unique.filter(p => !assigned.has(p))
    .sort((a, b) => getScore(b) - getScore(a)).slice(0, 2);
  if (topScorers[0]) { positions.push({ name: topScorers[0], x: leftX, y: attackY, isHome }); assigned.add(topScorers[0]); }
  if (topScorers[1]) { positions.push({ name: topScorers[1], x: rightX, y: attackY, isHome }); assigned.add(topScorers[1]); }

  // 3. 다음 상위 2명 → 수비
  const nextScorers = unique.filter(p => !assigned.has(p))
    .sort((a, b) => getScore(b) - getScore(a)).slice(0, 2);
  if (nextScorers[0]) { positions.push({ name: nextScorers[0], x: leftX, y: defY, isHome }); assigned.add(nextScorers[0]); }
  if (nextScorers[1]) { positions.push({ name: nextScorers[1], x: rightX, y: defY, isHome }); assigned.add(nextScorers[1]); }

  // 4. 골키퍼 (공격포인트 최하위)
  const remaining = unique.filter(p => !assigned.has(p));
  if (remaining.length > 0) {
    const gk = [...remaining].sort((a, b) => getScore(a) - getScore(b))[0];
    positions.push({ name: gk, x: centerX, y: gkY, isHome });
    assigned.add(gk);
  }

  // 5. 나머지 → 빈 자리에 배치
  const rest = unique.filter(p => !assigned.has(p));
  const extraSpots = [
    { x: leftX, y: midY },
    { x: rightX, y: midY },
    { x: centerX, y: defY },
    { x: centerX, y: attackY },
    { x: leftX, y: (midY + attackY) / 2 },
    { x: rightX, y: (midY + attackY) / 2 },
    { x: leftX, y: (defY + midY) / 2 },
    { x: rightX, y: (defY + midY) / 2 },
  ];
  rest.forEach((p, i) => {
    const spot = extraSpots[i % extraSpots.length];
    positions.push({ name: p, x: spot.x, y: spot.y, isHome });
    assigned.add(p);
  });

  return positions;
}

export default function MatchDetailPage() {
  const { date, game } = useParams();
  const navigate = useNavigate();
  const { clubName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [gameNum, setGameNum] = useState(parseInt(game) || 1);

  // Match data
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [goalList1, setGoalList1] = useState([]);
  const [goalList2, setGoalList2] = useState([]);

  // Players on field
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const [playerStats, setPlayerStats] = useState({});
  const [winnerStars, setWinnerStars] = useState({});

  // 포메이션 연동
  const [teamFormations, setTeamFormations] = useState({});
  const [matchTeamCodes, setMatchTeamCodes] = useState(['A', 'B']);
  const [clubType, setClubType] = useState('futsal');

  const loadMatchData = useCallback(async (gNum) => {
    setLoading(true);
    const gKey = `game${gNum}`;

    try {
      // 1. 경기 데이터 + 선수선택 데이터 병렬 로드
      const [scoreSnap, selSnap] = await Promise.all([
        get(ref(db, `${clubName}/${date}/${gKey}`)),
        get(ref(db, `PlayerSelectionByDate/${clubName}/${date}`)),
      ]);

      if (!scoreSnap.exists()) {
        setLoading(false);
        return false;
      }
      const scoreData = scoreSnap.val();
      setTeam1Name(scoreData.team1_name || 'Team A');
      setTeam2Name(scoreData.team2_name || 'Team B');
      setScore1(scoreData.goalCount1 || 0);
      setScore2(scoreData.goalCount2 || 0);

      // Goal lists
      const gl1 = scoreData.goalList1 ? Object.values(scoreData.goalList1) : [];
      const gl2 = scoreData.goalList2 ? Object.values(scoreData.goalList2) : [];
      setGoalList1(gl1.map(parseGoal).filter(Boolean));
      setGoalList2(gl2.map(parseGoal).filter(Boolean));

      // 2. 선수선택 데이터에서 포메이션/매치순서/선수 추출
      const selData = selSnap?.exists() ? selSnap.val() : {};

      // 포메이션 데이터
      setTeamFormations(selData.TeamFormation || {});

      // 팀 코드 결정 (MatchOrder → team_name에서 추론)
      const matchOrder = selData.MatchOrder;
      let codes = ['A', 'B'];
      if (matchOrder && Array.isArray(matchOrder) && matchOrder[gNum - 1]) {
        codes = matchOrder[gNum - 1];
      } else {
        const t1 = (scoreData.team1_name || '').replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
        const t2 = (scoreData.team2_name || '').replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
        if (t1) codes[0] = t1;
        if (t2) codes[1] = t2;
      }
      setMatchTeamCodes(codes);

      // 3. 선수 로스터 (game별 데이터 → AttandPlayer 폴백)
      const gameSelData = selData[gKey];
      if (gameSelData) {
        setTeamAPlayers(extractTeamRoster(gameSelData, scoreData.team1_name, 'team1'));
        setTeamBPlayers(extractTeamRoster(gameSelData, scoreData.team2_name, 'team2'));
      } else if (selData.AttandPlayer) {
        const att = selData.AttandPlayer;
        setTeamAPlayers((att[codes[0]] || []).filter(Boolean));
        setTeamBPlayers((att[codes[1]] || []).filter(Boolean));
      } else {
        setTeamAPlayers([]);
        setTeamBPlayers([]);
      }

      setLoading(false);
      return true;
    } catch (e) {
      console.error('Match data load error:', e);
      setLoading(false);
      return false;
    }
  }, [date, clubName]);

  // Parse goal string "time|scorer-assist"
  const parseGoal = (str) => {
    if (!str || !str.includes('|')) return null;
    const [time, rest] = str.split('|');
    const [scorer, assist] = rest.split('-');
    return { time: time.trim(), scorer: scorer.trim(), assist: assist ? assist.trim() : '없음' };
  };

  // 클럽 종목 로드
  useEffect(() => {
    if (!clubName) return;
    get(ref(db, `clubs/${clubName}`)).then(snap => {
      if (snap.exists()) setClubType(snap.val().type || 'futsal');
    }).catch(() => {});
  }, [clubName]);

  // Load player stats for positioning
  useEffect(() => {
    get(ref(db, `PlayerStateBackup/${clubName}`)).then(snap => {
      if (!snap.exists()) return;
      const map = {};
      snap.forEach(child => {
        const name = child.key;
        map[name] = {
          totalGoals: 0,
          totalAssists: 0,
          avgGoalsPerGame: child.child('avgGoalsPerGame').val() || 0,
          avgAssistsPerGame: child.child('avgAssistsPerGame').val() || 0,
        };
      });
      setPlayerStats(map);
    }).catch(() => {});
  }, [clubName]);

  // Load winner star data from previous match date
  useEffect(() => {
    (async () => {
      try {
        // 1. 모든 경기 날짜 가져오기
        const allDatesSnap = await get(ref(db, `${clubName}`));
        if (!allDatesSnap.exists()) return;

        const allDates = [];
        allDatesSnap.forEach(child => {
          // 날짜 형식인 키만 필터 (예: 2025-03-15)
          if (/^\d{4}-\d{2}-\d{2}$/.test(child.key)) {
            allDates.push(child.key);
          }
        });
        allDates.sort();

        // 2. 현재 날짜의 이전 경기일 찾기
        const currentIdx = allDates.indexOf(date);
        if (currentIdx <= 0) return;
        const prevDate = allDates[currentIdx - 1];

        // 3. 이전 날짜의 모든 게임에서 우승팀 찾기
        const prevSnap = await get(ref(db, `${clubName}/${prevDate}`));
        if (!prevSnap.exists()) return;

        // 각 게임의 승리팀 이름과 게임 정보 수집
        const winCounts = {}; // 팀별 승리 횟수
        const teamGames = {}; // 팀별 게임키/팀번호 기록
        prevSnap.forEach(gameChild => {
          if (!gameChild.key.startsWith('game')) return;
          const g = gameChild.val();
          const s1 = g.goalCount1 || 0;
          const s2 = g.goalCount2 || 0;
          const t1 = g.team1_name || '';
          const t2 = g.team2_name || '';

          // 각 팀의 게임 참여 기록
          if (t1) {
            if (!teamGames[t1]) teamGames[t1] = [];
            teamGames[t1].push({ gameKey: gameChild.key, teamSide: 'team1', name: t1 });
          }
          if (t2) {
            if (!teamGames[t2]) teamGames[t2] = [];
            teamGames[t2].push({ gameKey: gameChild.key, teamSide: 'team2', name: t2 });
          }

          if (s1 > s2) { winCounts[t1] = (winCounts[t1] || 0) + 1; }
          else if (s2 > s1) { winCounts[t2] = (winCounts[t2] || 0) + 1; }
        });

        // 가장 많이 이긴 팀 = 일별 우승팀
        const sortedTeams = Object.entries(winCounts).sort((a, b) => b[1] - a[1]);
        if (sortedTeams.length === 0) return;
        const dailyWinnerName = sortedTeams[0][0];
        const winnerGames = teamGames[dailyWinnerName] || [];

        if (winnerGames.length === 0) return;

        // 4. 우승팀의 선수 명단 가져오기 (해당 팀이 참여한 첫 번째 게임에서)
        const starMap = {};
        const w = winnerGames[0]; // 첫 게임의 로스터 사용
        const rosterSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${prevDate}/${w.gameKey}`));
        if (rosterSnap.exists()) {
          const players = extractTeamRoster(rosterSnap.val(), w.name, w.teamSide);
          players.forEach(name => { starMap[name] = 1; });
        }

        setWinnerStars(starMap);
      } catch (e) {
        console.error('Winner star load error:', e);
      }
    })();
  }, [date, clubName]);

  // Load match on mount and game change
  useEffect(() => {
    loadMatchData(gameNum);
  }, [gameNum, loadMatchData]);

  // Update game-specific stats (goals/assists from this match)
  const enrichedStats = useMemo(() => {
    const map = { ...playerStats };
    [...goalList1, ...goalList2].forEach(g => {
      if (!g) return;
      if (!map[g.scorer]) map[g.scorer] = { totalGoals: 0, totalAssists: 0, avgGoalsPerGame: 0, avgAssistsPerGame: 0 };
      map[g.scorer] = { ...map[g.scorer], totalGoals: (map[g.scorer].totalGoals || 0) + 1 };
      if (g.assist !== '없음') {
        if (!map[g.assist]) map[g.assist] = { totalGoals: 0, totalAssists: 0, avgGoalsPerGame: 0, avgAssistsPerGame: 0 };
        map[g.assist] = { ...map[g.assist], totalAssists: (map[g.assist].totalAssists || 0) + 1 };
      }
    });
    return map;
  }, [playerStats, goalList1, goalList2]);

  const FIELD_W = 360;
  const FIELD_H = 580;

  const allPositions = useMemo(() => {
    const formations = getFormations(clubType);
    const tf1 = teamFormations[matchTeamCodes[0]];
    const tf2 = teamFormations[matchTeamCodes[1]];
    const fmDef1 = tf1?.formationId ? formations[tf1.formationId] : null;
    const fmDef2 = tf2?.formationId ? formations[tf2.formationId] : null;

    // 포메이션 기반 위치 계산
    const buildFromFormation = (fmDef, tf, isHome, fallbackPlayers) => {
      if (!fmDef || !tf?.players) {
        return calculateTeamPositions(fallbackPlayers, isHome, FIELD_W, FIELD_H, enrichedStats);
      }
      const positioned = [];
      const assignedNames = new Set();
      fmDef.positions.forEach(pos => {
        const playerName = tf.players[pos.id];
        if (!playerName) return;
        assignedNames.add(playerName);
        const px = (pos.x / 100) * FIELD_W;
        let py;
        if (isHome) {
          // 상단: GK가 위쪽, FW가 중앙선 근처
          py = FIELD_H * 0.02 + (1 - pos.y / 100) * FIELD_H * 0.46;
        } else {
          // 하단: FW가 중앙선 근처, GK가 아래쪽
          py = FIELD_H * 0.52 + (pos.y / 100) * FIELD_H * 0.46;
        }
        positioned.push({ name: playerName, x: px, y: py, isHome, posLabel: pos.label });
      });
      return positioned;
    };

    const pos1 = buildFromFormation(fmDef1, tf1, true, teamAPlayers);
    const pos2 = buildFromFormation(fmDef2, tf2, false, teamBPlayers);
    return [...pos1, ...pos2];
  }, [teamAPlayers, teamBPlayers, enrichedStats, teamFormations, matchTeamCodes, clubType]);

  const formatTeamLabel = (name) => {
    if (!name) return '';
    const n = name.toString().trim().replace(/^팀\s*/, '');
    if (n.toUpperCase().startsWith('TEAM')) return n;
    return `Team ${n}`;
  };

  const handlePrevGame = async () => {
    if (gameNum <= 1) return;
    setGameNum(gameNum - 1);
  };

  const handleNextGame = async () => {
    const nextKey = `game${gameNum + 1}`;
    const snap = await get(ref(db, `${clubName}/${date}/${nextKey}`));
    if (snap.exists()) {
      setGameNum(gameNum + 1);
    }
  };

  const formattedDate = formatDateWithDay(date).replace(/-/g, '.');

  if (loading) {
    return (
      <Container sx={{ mt: 6, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>경기 정보를 불러오는 중...</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh', pb: 4 }}>
      {/* Header */}
      <Box sx={{ bgcolor: '#0C0950', p: 1.5, display: 'flex', alignItems: 'center' }}>
        <Button onClick={() => navigate(-1)} sx={{ color: 'white', minWidth: 'auto' }}>
          <ArrowBackIcon />
        </Button>
        <Typography sx={{ color: 'white', fontWeight: 'bold', flex: 1, textAlign: 'center', fontSize: '1.1rem', mr: 5 }}>
          {formattedDate}
        </Typography>
      </Box>

      <Container maxWidth="xs" sx={{ mt: 2 }}>
        {/* Score */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <img src="/uniform1.png" alt="Team A" style={{ width: 60, height: 60, objectFit: 'contain' }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', mt: 0.5 }}>
                {formatTeamLabel(team1Name)}
              </Typography>
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: '2.8rem', fontWeight: 900, lineHeight: 1 }}>
                {score1} : {score2}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 0.5 }}>
                <Button size="small" onClick={handlePrevGame} sx={{ minWidth: 'auto', p: 0.5 }}>
                  <ArrowBackIosIcon sx={{ fontSize: 16 }} />
                </Button>
                <Chip label={`${gameNum}경기`} size="small" sx={{ fontWeight: 'bold', bgcolor: '#e3f2fd', color: '#1565C0' }} />
                <Button size="small" onClick={handleNextGame} sx={{ minWidth: 'auto', p: 0.5 }}>
                  <ArrowForwardIosIcon sx={{ fontSize: 16 }} />
                </Button>
              </Box>
            </Box>

            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <img src="/uniform2.png" alt="Team B" style={{ width: 60, height: 60, objectFit: 'contain' }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', mt: 0.5 }}>
                {formatTeamLabel(team2Name)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Goal/Assist List */}
        {(goalList1.length > 0 || goalList2.length > 0) && (
          <Box sx={{ display: 'flex', mb: 2, gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              {goalList1.map((g, i) => (
                <Typography key={i} sx={{ fontSize: '0.8rem', textAlign: 'center', color: '#333' }}>
                  ⚽ {g.scorer} {g.assist !== '없음' ? `(${g.assist})` : ''} <span style={{ color: '#999' }}>{g.time}</span>
                </Typography>
              ))}
            </Box>
            <Box sx={{ flex: 1 }}>
              {goalList2.map((g, i) => (
                <Typography key={i} sx={{ fontSize: '0.8rem', textAlign: 'center', color: '#333' }}>
                  ⚽ {g.scorer} {g.assist !== '없음' ? `(${g.assist})` : ''} <span style={{ color: '#999' }}>{g.time}</span>
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Soccer Field */}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: FIELD_W,
            height: FIELD_H,
            mx: 'auto',
            borderRadius: 2,
            overflow: 'hidden',
            boxShadow: 3,
            background: 'linear-gradient(180deg, #2e7d32 0%, #388e3c 25%, #2e7d32 25%, #388e3c 50%, #2e7d32 50%, #388e3c 75%, #2e7d32 75%, #388e3c 100%)',
          }}
        >
          {/* Field markings */}
          {/* Center line */}
          <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', bgcolor: 'rgba(255,255,255,0.6)' }} />
          {/* Center circle */}
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 80, height: 80, border: '2px solid rgba(255,255,255,0.6)', borderRadius: '50%' }} />
          {/* Top penalty area */}
          <Box sx={{ position: 'absolute', top: 0, left: '20%', width: '60%', height: '16%', border: '2px solid rgba(255,255,255,0.6)', borderTop: 'none' }} />
          {/* Bottom penalty area */}
          <Box sx={{ position: 'absolute', bottom: 0, left: '20%', width: '60%', height: '16%', border: '2px solid rgba(255,255,255,0.6)', borderBottom: 'none' }} />
          {/* Top goal area */}
          <Box sx={{ position: 'absolute', top: 0, left: '35%', width: '30%', height: '6%', border: '2px solid rgba(255,255,255,0.6)', borderTop: 'none' }} />
          {/* Bottom goal area */}
          <Box sx={{ position: 'absolute', bottom: 0, left: '35%', width: '30%', height: '6%', border: '2px solid rgba(255,255,255,0.6)', borderBottom: 'none' }} />

          {/* Players */}
          {allPositions.map((pos, idx) => {
            const stars = winnerStars[pos.name] || 0;
            return (
              <Box
                key={`${pos.name}-${idx}`}
                sx={{
                  position: 'absolute',
                  left: pos.x - 30,
                  top: pos.y - 20,
                  width: 60,
                  textAlign: 'center',
                  animation: `dropIn 0.5s ease-out ${idx * 0.05}s both`,
                  '@keyframes dropIn': {
                    '0%': { opacity: 0, transform: 'translateY(-40px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                {/* Star badge */}
                {stars > 0 && (
                  <img
                    src="/star.png"
                    alt="star"
                    style={{
                      width: 16,
                      height: 16,
                      display: 'block',
                      margin: '0 auto -2px',
                    }}
                  />
                )}
                {/* Uniform */}
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={pos.isHome ? '/uniform1.png' : '/uniform2.png'}
                    alt={pos.name}
                    style={{ width: 36, height: 36, objectFit: 'contain' }}
                  />
                  {pos.posLabel && (
                    <Box sx={{
                      position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)',
                      bgcolor: 'rgba(0,0,0,0.7)', color: '#FFD700', fontSize: '0.5rem', fontWeight: 700,
                      px: 0.4, py: 0.1, borderRadius: 0.5, lineHeight: 1, whiteSpace: 'nowrap',
                    }}>
                      {pos.posLabel}
                    </Box>
                  )}
                </Box>
                {/* Name */}
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    color: 'white',
                    textShadow: '1px 1px 3px rgba(0,0,0,0.9)',
                    lineHeight: 1.2,
                    mt: 0.2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pos.name}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Back button */}
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Button
            variant="contained"
            onClick={() => navigate(-1)}
            sx={{ bgcolor: '#0C0950', borderRadius: 2, px: 4, fontWeight: 'bold', '&:hover': { bgcolor: '#1a1a6e' } }}
          >
            닫기
          </Button>
        </Box>
      </Container>
    </Box>
  );
}

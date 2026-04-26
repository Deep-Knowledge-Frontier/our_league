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
import { extractTeamRoster } from '../utils/roster';

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
  // 🆕 쿼터 데이터
  const [quarterData, setQuarterData] = useState(null); // { Q1: { score1, score2, goalList1, goalList2 }, ... }
  const [matchQuarterCount, setMatchQuarterCount] = useState(0);

  // Players on field
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const [playerStats, setPlayerStats] = useState({});
  // 해당 경기일 우승 주장 이름 (별 표시용)
  const [winningCaptain, setWinningCaptain] = useState(null);
  // 현재 우승 주장이 해당 날짜까지 누적한 총 우승 횟수
  const [winningCaptainTotalWins, setWinningCaptainTotalWins] = useState(0);
  // 🆕 리그 우승 명단 — TeamOfWinner/{clubName}/League{N}/{teamCode}: [선수명...]
  // 선수명 → 누적 리그 우승 횟수 매핑
  const [leagueWinCounts, setLeagueWinCounts] = useState({});

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

      // 🆕 쿼터 데이터 로드
      if (scoreData.quarters && scoreData.quarterCount >= 2) {
        setQuarterData(scoreData.quarters);
        setMatchQuarterCount(scoreData.quarterCount);
      } else {
        setQuarterData(null);
        setMatchQuarterCount(0);
      }

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

  // 해당 경기일의 우승팀 주장 찾기 (별 표시용)
  // - DailyResultsBackup에서 오늘 매치 결과로 승점 계산 → 우승팀 결정
  // - TeamCaptains에서 해당 코드의 주장 이름 조회
  // - 팀명 → 코드 매핑은 TeamNames 참고
  useEffect(() => {
    if (!date || !clubName) { setWinningCaptain(null); return; }
    (async () => {
      try {
        const [resultsSnap, captainsSnap, teamNamesSnap] = await Promise.all([
          get(ref(db, `DailyResultsBackup/${clubName}/${date}`)),
          get(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamCaptains`)),
          get(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamNames`)),
        ]);
        if (!resultsSnap.exists() || !captainsSnap.exists()) return;

        const matches = resultsSnap.val().matches || [];
        if (matches.length === 0) return;

        // 승점 집계 (승=3, 무=1, 패=0)
        const pts = {}, gd = {}, gs = {};
        (Array.isArray(matches) ? matches : Object.values(matches)).forEach((m) => {
          const t1 = m.team1, t2 = m.team2;
          const s1 = Number(m.score1) || 0, s2 = Number(m.score2) || 0;
          gs[t1] = (gs[t1] || 0) + s1; gs[t2] = (gs[t2] || 0) + s2;
          gd[t1] = (gd[t1] || 0) + (s1 - s2); gd[t2] = (gd[t2] || 0) + (s2 - s1);
          pts[t1] = (pts[t1] || 0) + (s1 > s2 ? 3 : s1 === s2 ? 1 : 0);
          pts[t2] = (pts[t2] || 0) + (s2 > s1 ? 3 : s1 === s2 ? 1 : 0);
        });
        const winnerName = Object.keys(pts).sort((a, b) =>
          (pts[b] || 0) - (pts[a] || 0) ||
          (gd[b] || 0) - (gd[a] || 0) ||
          (gs[b] || 0) - (gs[a] || 0)
        )[0];
        if (!winnerName) return;

        // 우승 팀명을 A/B/C 코드로 매핑
        const teamNames = teamNamesSnap.exists() ? teamNamesSnap.val() : {};
        const captains = captainsSnap.val() || {};
        let winnerCode = null;
        for (const c of ['A', 'B', 'C']) {
          if (teamNames[c] === winnerName || c === winnerName) { winnerCode = c; break; }
        }
        if (!winnerCode && winnerName) {
          // 매핑 실패 시 간단한 이름 비교 (예: "팀 A" → "A")
          const clean = String(winnerName).replace(/^(팀\s*|Team\s*)/i, '').trim();
          if (['A', 'B', 'C'].includes(clean)) winnerCode = clean;
        }
        if (winnerCode && captains[winnerCode]) {
          setWinningCaptain(captains[winnerCode]);
        }
      } catch (e) {
        console.error('우승 주장 로드 실패:', e);
      }
    })();
  }, [date, clubName]);

  // 🆕 리그 우승 명단 로드 — TeamOfWinner/{clubName}
  useEffect(() => {
    if (!clubName) { setLeagueWinCounts({}); return; }
    (async () => {
      try {
        const snap = await get(ref(db, `TeamOfWinner/${clubName}`));
        if (!snap.exists()) { setLeagueWinCounts({}); return; }
        const data = snap.val();
        const counts = {};
        // 구조: { League1: { C: [...names] }, League2: { ... }, ... }
        // 각 리그의 우승팀 로스터들에 등장한 선수 카운트
        Object.values(data || {}).forEach(leagueData => {
          Object.values(leagueData || {}).forEach(roster => {
            const list = Array.isArray(roster) ? roster : (roster && typeof roster === 'object' ? Object.values(roster) : []);
            list.forEach(n => {
              if (typeof n === 'string' && n.trim()) {
                const k = n.trim();
                counts[k] = (counts[k] || 0) + 1;
              }
            });
          });
        });
        setLeagueWinCounts(counts);
      } catch (e) {
        console.error('리그 우승 명단 로드 실패:', e);
        setLeagueWinCounts({});
      }
    })();
  }, [clubName]);

  // 우승 주장의 해당 날짜까지 누적 우승 횟수 계산 (3진법 승급 표시용)
  useEffect(() => {
    if (!clubName || !date || !winningCaptain) {
      setWinningCaptainTotalWins(0);
      return;
    }
    (async () => {
      try {
        const [resultsSnap, selectionsSnap] = await Promise.all([
          get(ref(db, `DailyResultsBackup/${clubName}`)),
          get(ref(db, `PlayerSelectionByDate/${clubName}`)),
        ]);
        if (!resultsSnap.exists()) { setWinningCaptainTotalWins(1); return; }
        const allResults = resultsSnap.val() || {};
        const allSelections = selectionsSnap.exists() ? (selectionsSnap.val() || {}) : {};

        // 현재 날짜까지의 경기일 정렬
        const dates = Object.keys(allResults).filter((d) => d <= date).sort();
        let count = 0;

        for (const d of dates) {
          const matches = allResults[d]?.matches;
          if (!matches) continue;
          const matchArr = Array.isArray(matches) ? matches : Object.values(matches);
          if (matchArr.length === 0) continue;

          // 승점 집계
          const points = {}, gd = {}, gf = {};
          matchArr.forEach((m) => {
            const t1 = m.team1, t2 = m.team2;
            const s1 = Number(m.score1) || 0, s2 = Number(m.score2) || 0;
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
          });
          const sortedTeams = Object.entries(points).sort((a, b) =>
            (b[1] - a[1]) ||
            ((gd[b[0]] || 0) - (gd[a[0]] || 0)) ||
            ((gf[b[0]] || 0) - (gf[a[0]] || 0))
          );
          if (sortedTeams.length === 0) continue;
          const winnerName = sortedTeams[0][0];

          // 해당 날짜의 주장/팀명 매핑
          const sel = allSelections[d] || {};
          const captains = sel.TeamCaptains || {};
          const teamNames = sel.TeamNames || {};
          let winnerCode = null;
          for (const code of ['A', 'B', 'C']) {
            if (teamNames[code] === winnerName) { winnerCode = code; break; }
          }
          if (!winnerCode) {
            const clean = String(winnerName).replace(/^(팀\s*|Team\s*)/i, '').trim();
            if (['A', 'B', 'C'].includes(clean)) winnerCode = clean;
          }
          if (winnerCode && captains[winnerCode] === winningCaptain) {
            count++;
          }
        }
        setWinningCaptainTotalWins(count);
      } catch (e) {
        console.error('누적 우승 카운트 실패:', e);
        setWinningCaptainTotalWins(1);
      }
    })();
  }, [clubName, date, winningCaptain]);

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

        {/* 🆕 쿼터 스코어 브레이크다운 */}
        {quarterData && matchQuarterCount >= 2 && (
          <Box sx={{
            mb: 2, p: 1.5, borderRadius: 2,
            bgcolor: '#FAFAFA', border: '1px solid #E0E0E0',
          }}>
            <Typography sx={{ fontSize: '0.72rem', color: '#888', fontWeight: 700, mb: 1, textAlign: 'center' }}>
              ⏱ 쿼터별 점수
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
              {Array.from({ length: matchQuarterCount }).map((_, i) => {
                const qKey = `Q${i + 1}`;
                const qd = quarterData[qKey] || {};
                return (
                  <Box key={qKey} sx={{
                    flex: 1, maxWidth: 80, textAlign: 'center',
                    p: 0.8, borderRadius: 1.5,
                    bgcolor: 'white', border: '1px solid #E0E0E0',
                  }}>
                    <Typography sx={{ fontSize: '0.62rem', color: '#999', fontWeight: 700 }}>
                      {qKey}
                    </Typography>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 900, color: '#333' }}>
                      {qd.score1 || 0}:{qd.score2 || 0}
                    </Typography>
                  </Box>
                );
              })}
              <Box sx={{
                flex: 1, maxWidth: 80, textAlign: 'center',
                p: 0.8, borderRadius: 1.5,
                bgcolor: '#2D336B', border: 'none',
              }}>
                <Typography sx={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                  합계
                </Typography>
                <Typography sx={{ fontSize: '1rem', fontWeight: 900, color: 'white' }}>
                  {score1}:{score2}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        {/* Goal/Assist List — 팀 컬러 + scorer/assister 분리 강조 */}
        {(goalList1.length > 0 || goalList2.length > 0) && (() => {
          const TEAM_A_COLOR = '#C62828';   // 홈팀 (빨강 유니폼)
          const TEAM_B_COLOR = '#F57F17';   // 원정팀 (노랑 유니폼)
          const renderGoal = (g, i, color) => (
            <Typography key={i} sx={{
              fontSize: '0.85rem', textAlign: 'left', lineHeight: 1.65, mb: 0.2,
            }}>
              <span style={{ fontSize: '0.95rem' }}>⚽</span>
              <span style={{ fontWeight: 700, color, marginLeft: 6 }}>
                {g.scorer}
                {g.assist && g.assist !== '없음' ? ` (${g.assist})` : ''}
              </span>
            </Typography>
          );
          return (
            <Box sx={{ display: 'flex', mb: 2, gap: 1 }}>
              <Box sx={{ flex: 1, pl: 1.5 }}>
                {goalList1.map((g, i) => renderGoal(g, i, TEAM_A_COLOR))}
              </Box>
              <Box sx={{ flex: 1, pl: 1.5 }}>
                {goalList2.map((g, i) => renderGoal(g, i, TEAM_B_COLOR))}
              </Box>
            </Box>
          );
        })()}

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
            const isWinningCaptain = !!winningCaptain && pos.name === winningCaptain;
            return (
              <Box
                key={`${pos.name}-${idx}`}
                sx={{
                  position: 'absolute',
                  left: pos.x - 30,
                  top: pos.y - 22,
                  width: 60,
                  textAlign: 'center',
                  animation: `dropIn 0.5s ease-out ${idx * 0.05}s both`,
                  '@keyframes dropIn': {
                    '0%': { opacity: 0, transform: 'translateY(-40px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                {/* Uniform */}
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={pos.isHome ? '/uniform1.png' : '/uniform2.png'}
                    alt={pos.name}
                    style={{ width: 36, height: 36, objectFit: 'contain' }}
                  />
                  {/* 🆕 리그 우승 별 — 누적 리그 우승 횟수만큼 골드 별 (유니폼 가장 위쪽) */}
                  {(() => {
                    const lw = leagueWinCounts[pos.name] || 0;
                    if (lw <= 0) return null;
                    return (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -22,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex',
                          gap: '0px',
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {Array.from({ length: Math.min(lw, 9) }).map((_, i) => (
                          <Typography
                            key={i}
                            component="span"
                            sx={{
                              fontSize: '0.85rem',
                              lineHeight: 1,
                              color: '#FFD700',
                              filter: 'drop-shadow(0 0 3px rgba(255,165,0,1))',
                              WebkitTextStroke: '0.4px rgba(178,34,34,0.7)',
                            }}
                          >
                            ★
                          </Typography>
                        ))}
                      </Box>
                    );
                  })()}
                  {/* 우승 주장 별 — 유니폼 위 가운데, 누적 승수에 따라 3진법 승급 표시
                      Tier 0 (골드, 1~2승): ★ #FFC107
                      Tier 1 (블루, 3승 = 1개): ★ #29B6F6   (3번 모이면 Tier 2로)
                      Tier 2 (퍼플, 9승 = 1개): ★ #AB47BC   (3번 모이면 Tier 3로)
                      Tier 3 (핑크, 27승 = 1개): ★ #E91E63  (최상위, 4+ 승급은 무시)
                  */}
                  {isWinningCaptain && winningCaptainTotalWins > 0 && (() => {
                    let n = winningCaptainTotalWins;
                    const t3 = Math.min(Math.floor(n / 27), 9); n -= t3 * 27;
                    const t2 = Math.floor(n / 9);              n -= t2 * 9;
                    const t1 = Math.floor(n / 3);              n -= t1 * 3;
                    const t0 = n;
                    const tiers = [
                      { n: t3, color: '#E91E63', glow: '233,30,99' },
                      { n: t2, color: '#AB47BC', glow: '171,71,188' },
                      { n: t1, color: '#29B6F6', glow: '41,182,246' },
                      { n: t0, color: '#FFC107', glow: '255,193,7' },
                    ];
                    return (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -9,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex',
                          gap: '0px',
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tiers.flatMap((tier, ti) =>
                          Array.from({ length: tier.n }).map((_, i) => (
                            <Typography
                              key={`${ti}-${i}`}
                              component="span"
                              sx={{
                                fontSize: '0.7rem',
                                lineHeight: 1,
                                color: tier.color,
                                filter: `drop-shadow(0 0 2px rgba(${tier.glow}, 0.9))`,
                                WebkitTextStroke: '0.3px rgba(0,0,0,0.5)',
                              }}
                            >
                              ★
                            </Typography>
                          ))
                        )}
                      </Box>
                    );
                  })()}
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

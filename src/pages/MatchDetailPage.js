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
import ShareIcon from '@mui/icons-material/Share';
import { useAuth } from '../contexts/AuthContext';
import { formatDateWithDay } from '../utils/format';
import { getFormations } from '../config/formations';
import { extractTeamRoster } from '../utils/roster';
import { shareMatchImage } from '../utils/shareMatch';

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
  // 선수명 → 우승한 리그 키 배열 (예: ['League1','League3'])
  const [leagueWinsByPlayer, setLeagueWinsByPlayer] = useState({});
  // 🆕 일별 우승팀 누적 (현재 날짜까지) — 선수명 → 누적 카운트
  const [dailyTeamWinsByPlayer, setDailyTeamWinsByPlayer] = useState({});
  // 🆕 공유 진행 상태
  const [sharing, setSharing] = useState(false);
  // 🆕 팀별 보기 필터 — 'home' | 'away' (기본 home, 항상 한 팀만 표시)
  const [viewTeam, setViewTeam] = useState('home');

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
  // 🚧 현재 League1만 활성화 — League2+ 데이터는 무시 (보류)
  //    추후 활성화: ENABLED_LEAGUES 에 추가 또는 필터 제거
  useEffect(() => {
    if (!clubName) { setLeagueWinsByPlayer({}); return; }
    const ENABLED_LEAGUES = new Set(['League1']);
    (async () => {
      try {
        const snap = await get(ref(db, `TeamOfWinner/${clubName}`));
        if (!snap.exists()) { setLeagueWinsByPlayer({}); return; }
        const data = snap.val();
        const byPlayer = {};
        Object.entries(data || {}).forEach(([leagueKey, leagueData]) => {
          if (!ENABLED_LEAGUES.has(leagueKey)) return;
          const seenInThisLeague = new Set();
          Object.values(leagueData || {}).forEach(roster => {
            const list = Array.isArray(roster) ? roster : (roster && typeof roster === 'object' ? Object.values(roster) : []);
            list.forEach(n => {
              if (typeof n === 'string' && n.trim()) {
                const k = n.trim();
                if (seenInThisLeague.has(k)) return;
                seenInThisLeague.add(k);
                if (!byPlayer[k]) byPlayer[k] = [];
                byPlayer[k].push(leagueKey);
              }
            });
          });
        });
        setLeagueWinsByPlayer(byPlayer);
      } catch (e) {
        console.error('리그 우승 명단 로드 실패:', e);
        setLeagueWinsByPlayer({});
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

  // 🆕 일별 우승팀 누적 계산 — 현재 날짜까지의 모든 일별 우승팀 로스터 합산
  useEffect(() => {
    if (!clubName || !date) { setDailyTeamWinsByPlayer({}); return; }
    (async () => {
      try {
        const [resultsSnap, selectionsSnap] = await Promise.all([
          get(ref(db, `DailyResultsBackup/${clubName}`)),
          get(ref(db, `PlayerSelectionByDate/${clubName}`)),
        ]);
        if (!resultsSnap.exists()) { setDailyTeamWinsByPlayer({}); return; }
        const allResults = resultsSnap.val() || {};
        const allSelections = selectionsSnap.exists() ? (selectionsSnap.val() || {}) : {};
        const dates = Object.keys(allResults).filter((d) => d <= date).sort();
        const counts = {};

        for (const d of dates) {
          const matches = allResults[d]?.matches;
          if (!matches) continue;
          const matchArr = Array.isArray(matches) ? matches : Object.values(matches);
          if (matchArr.length === 0) continue;

          // 일별 승점/골득실/득점 집계
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

          // 우승팀 코드 매핑 (TeamNames 우선, 없으면 'A/B/C' 정규화)
          const sel = allSelections[d] || {};
          const teamNames = sel.TeamNames || {};
          let winnerCode = null;
          for (const code of ['A', 'B', 'C']) {
            if (teamNames[code] === winnerName) { winnerCode = code; break; }
          }
          if (!winnerCode) {
            const clean = String(winnerName).replace(/^(팀\s*|Team\s*)/i, '').trim();
            if (['A', 'B', 'C'].includes(clean)) winnerCode = clean;
          }
          if (!winnerCode) continue;

          // 우승팀 로스터 → 각 선수 카운트++
          const roster = sel.AttandPlayer?.[winnerCode];
          const rosterArr = Array.isArray(roster) ? roster : (roster && typeof roster === 'object' ? Object.values(roster) : []);
          rosterArr.forEach(name => {
            if (typeof name === 'string' && name.trim()) {
              const k = name.trim();
              counts[k] = (counts[k] || 0) + 1;
            }
          });
        }
        setDailyTeamWinsByPlayer(counts);
      } catch (e) {
        console.error('일별 우승팀 누적 로드 실패:', e);
        setDailyTeamWinsByPlayer({});
      }
    })();
  }, [clubName, date]);

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
  const FIELD_H = 460; // 🆕 580 → 460 (모바일 화면에 위아래 전부 들어오도록 축소)

  const allPositions = useMemo(() => {
    const formations = getFormations(clubType);
    const tf1 = teamFormations[matchTeamCodes[0]];
    const tf2 = teamFormations[matchTeamCodes[1]];
    const fmDef1 = tf1?.formationId ? formations[tf1.formationId] : null;
    const fmDef2 = tf2?.formationId ? formations[tf2.formationId] : null;

    // 포메이션 기반 위치 계산
    // 🆕 한 팀만 보기 → 전체 필드 사용. GK 하단(자기 골대), 공격수 상단(상대편 골대)
    const isSolo = viewTeam === 'home' || viewTeam === 'away';

    const buildFromFormation = (fmDef, tf, isHome, fallbackPlayers) => {
      if (!fmDef || !tf?.players) {
        return calculateTeamPositions(fallbackPlayers, isHome, FIELD_W, FIELD_H, enrichedStats);
      }
      // 🆕 할당된 선수가 있는 포지션만 먼저 수집
      const assignedPositions = fmDef.positions.filter(pos => !!tf.players[pos.id]);
      if (assignedPositions.length === 0) {
        return calculateTeamPositions(fallbackPlayers, isHome, FIELD_W, FIELD_H, enrichedStats);
      }
      // 🆕 할당된 포지션의 y 범위로 정규화 → 전체 필드를 활용 (GK 미할당 등의 빈 공간 방지)
      const ys = assignedPositions.map(p => p.y);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      const ySpan = Math.max(1, yMax - yMin); // 0 division 방지
      const positioned = [];
      assignedPositions.forEach(pos => {
        const playerName = tf.players[pos.id];
        // 정규화된 y: 0(상단)~1(하단)
        const yNorm = ySpan > 0 ? (pos.y - yMin) / ySpan : 0.5;
        const px = (pos.x / 100) * FIELD_W;
        let py;
        if (isSolo) {
          // 한 팀만: 전체 필드 사용 — yNorm=0(FW/상단), yNorm=1(GK/하단)
          // 🆕 상단(FW)은 골 박스보다 살짝 아래에, 하단(GK)은 이름이 잘리지 않도록 여백 확보
          py = FIELD_H * 0.13 + yNorm * FIELD_H * 0.72;
        } else if (isHome) {
          // 상단: GK가 위쪽, FW가 중앙선 근처 (반전)
          py = FIELD_H * 0.02 + (1 - yNorm) * FIELD_H * 0.46;
        } else {
          // 하단: FW가 중앙선 근처, GK가 아래쪽
          py = FIELD_H * 0.52 + yNorm * FIELD_H * 0.46;
        }
        positioned.push({ name: playerName, x: px, y: py, isHome, posLabel: pos.label });
      });
      return positioned;
    };

    const pos1 = buildFromFormation(fmDef1, tf1, true, teamAPlayers);
    const pos2 = buildFromFormation(fmDef2, tf2, false, teamBPlayers);
    return [...pos1, ...pos2];
  }, [teamAPlayers, teamBPlayers, enrichedStats, teamFormations, matchTeamCodes, clubType, viewTeam]);


  const formatTeamLabel = (name) => {
    if (!name) return '';
    const n = name.toString().trim().replace(/^팀\s*/, '');
    if (n.toUpperCase().startsWith('TEAM')) return n;
    return `Team ${n}`;
  };

  // 🆕 SVG 별 — 폰트 글리프 의존 없이 정확한 5각 별 모양
  const StarIcon = ({ size = 12, color = '#FFC107', glow = '255,193,7' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{
      display: 'block',
      filter: `drop-shadow(0 0 ${Math.max(2, size / 6)}px rgba(${glow}, 0.95)) drop-shadow(0 2px 2px rgba(0,0,0,0.4))`,
    }}>
      <path
        d="M12 2 L14.81 9.27 L22.5 9.78 L16.59 14.69 L18.59 22.04 L12 17.77 L5.41 22.04 L7.41 14.69 L1.5 9.78 L9.19 9.27 Z"
        fill={color}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="0.7"
      />
    </svg>
  );

  // 🆕 유니폼 SVG — 티셔츠 silhouette + 포지션 라벨 내장 (벤치마크 디자인 적용)
  const JerseySVG = ({ color = '#1976D2', posLabel = '', width = 36, height = 30 }) => {
    const labelLen = String(posLabel || '').length;
    // 라벨 길이에 따라 폰트 크기 조정 (3글자=18, 2글자=24)
    const labelSize = labelLen >= 4 ? 14 : labelLen === 3 ? 18 : 24;
    return (
      <svg width={width} height={height} viewBox="0 0 100 83" style={{ display: 'block' }}>
        {/* 티셔츠 본체 (어깨, 소매, 몸통) */}
        <path
          d="M 30 6
             L 18 10
             L 6 22
             Q 4 28 8 32
             L 14 38
             L 22 34
             L 22 74
             Q 22 80 28 80
             L 72 80
             Q 78 80 78 74
             L 78 34
             L 86 38
             L 92 32
             Q 96 28 94 22
             L 82 10
             L 70 6
             L 64 12
             Q 50 22 36 12
             L 30 6 Z"
          fill={color}
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="0.8"
        />
        {/* 포지션 라벨 (유니폼 가운데) */}
        {posLabel && (
          <text
            x="50"
            y="56"
            textAnchor="middle"
            fill="white"
            fontSize={labelSize}
            fontWeight="900"
            fontFamily="sans-serif"
            stroke="rgba(0,0,0,0.45)"
            strokeWidth="0.6"
            paintOrder="stroke"
          >
            {posLabel}
          </text>
        )}
      </svg>
    );
  };

  // 팀 컬러 매핑
  const teamColor = (isHome) => isHome ? '#C62828' : '#F9A825'; // 빨강 / 노랑(살짝 진하게)

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

  // 🆕 경기 화면을 PNG로 생성해서 공유 (또는 다운로드)
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const formatted = formatDateWithDay(date).replace(/-/g, '.');
      const blob = await shareMatchImage({
        dateStr: formatted,
        team1Name: formatTeamLabel(team1Name),
        team2Name: formatTeamLabel(team2Name),
        score1, score2,
        gameNum,
        goalList1, goalList2,
        positions: allPositions,
        leagueWinsByPlayer,
        winningCaptain,
        winningCaptainTotalWins,
        dailyTeamWinsByPlayer,
      });
      const fileName = `${date}_${gameNum}경기.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      // Web Share API 우선
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${formatted} ${gameNum}경기`,
            text: `${team1Name} ${score1} : ${score2} ${team2Name}`,
          });
        } catch (e) {
          // 사용자가 취소한 경우 무시
          if (e.name !== 'AbortError') throw e;
        }
      } else {
        // Fallback: 다운로드
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert('이미지 생성/공유 실패: ' + (e.message || e));
    } finally {
      setSharing(false);
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

      <Container maxWidth="xs" sx={{ mt: 1 }}>
        {/* Score */}
        <Box sx={{ textAlign: 'center', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Box sx={{
              flex: 1, textAlign: 'center',
              opacity: viewTeam === 'away' ? 0.45 : 1,
              transition: 'opacity 0.18s',
            }}>
              <img src="/uniform1.png" alt="Team A" style={{ width: 60, height: 60, objectFit: 'contain' }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', mt: 0.3 }}>
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

            <Box sx={{
              flex: 1, textAlign: 'center',
              opacity: viewTeam === 'home' ? 0.45 : 1,
              transition: 'opacity 0.18s',
            }}>
              <img src="/uniform2.png" alt="Team B" style={{ width: 60, height: 60, objectFit: 'contain' }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', mt: 0.3 }}>
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
              fontSize: '0.85rem', textAlign: 'left', lineHeight: 1.5, mb: 0.1,
            }}>
              <span style={{ fontSize: '0.95rem' }}>⚽</span>
              <span style={{ fontWeight: 700, color, marginLeft: 6 }}>
                {g.scorer}
                {g.assist && g.assist !== '없음' ? ` (${g.assist})` : ''}
              </span>
            </Typography>
          );
          return (
            <Box sx={{ display: 'flex', mb: 0.5, gap: 1 }}>
              <Box sx={{ flex: 1, pl: 1.5 }}>
                {goalList1.map((g, i) => renderGoal(g, i, TEAM_A_COLOR))}
              </Box>
              <Box sx={{ flex: 1, pl: 1.5 }}>
                {goalList2.map((g, i) => renderGoal(g, i, TEAM_B_COLOR))}
              </Box>
            </Box>
          );
        })()}

        {/* 🆕 팀 선택 탭 — 필드와 붙어 있는 형태 (벤치마크 디자인) */}
        <Box sx={{
          position: 'relative',
          width: '100%',
          maxWidth: FIELD_W,
          mx: 'auto',
        }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            px: 0, // 🆕 필드 좌/우 끝과 정확히 일치
            mb: 0, // 필드와 직접 붙음 (갭 없음)
            position: 'relative',
            zIndex: 3,
          }}>
            {[
              { key: 'home', label: 'Team A', color: '#C62828', bg: '#FFEBEE', logoSrc: '/uniform1.png' },
              { key: 'away', label: 'Team B', color: '#F9A825', bg: '#FFF8E1', logoSrc: '/uniform2.png' },
            ].map((t) => {
              const isActive = viewTeam === t.key;
              return (
                <Box
                  key={t.key}
                  onClick={() => setViewTeam(t.key)}
                  sx={{
                    cursor: 'pointer',
                    minWidth: 90,
                    // 활성 탭: 흰 배경 (필드 위로 튀어나옴) / 비활성: 회색
                    bgcolor: isActive ? '#FFFFFF' : '#E8EAED',
                    border: 'none',
                    borderRadius: '10px 10px 0 0',
                    px: 1.5, py: 0.7,
                    display: 'flex', alignItems: 'center', gap: 0.6, justifyContent: 'center',
                    boxShadow: isActive
                      ? '0 -2px 8px rgba(0,0,0,0.12)'
                      : 'none',
                    transform: isActive ? 'translateY(0)' : 'scale(0.95)', // 🆕 비활성 탭의 아래쪽 밀림 제거 (필드와 겹침 방지)
                    transformOrigin: 'bottom center',
                    opacity: isActive ? 1 : 0.7,
                    transition: 'all 0.18s',
                    '&:hover': { bgcolor: isActive ? '#FFFFFF' : '#DEE0E3' },
                  }}
                >
                  <img
                    src={t.logoSrc}
                    alt={t.label}
                    style={{ width: 18, height: 18, objectFit: 'contain', opacity: isActive ? 1 : 0.7 }}
                  />
                  <Typography sx={{
                    fontSize: '0.82rem',
                    fontWeight: isActive ? 900 : 700,
                    color: isActive ? t.color : '#666',
                    letterSpacing: '-0.02em',
                  }}>
                    {t.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* 🔧 평면 2D 필드 — 관리탭(FormationField) 스타일 */}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: FIELD_W,
            height: FIELD_H,
            mx: 'auto',
            mb: 2,
            borderRadius: '4px 4px 8px 8px',
            overflow: 'visible',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            background: '#388E3C',
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

          {/* Players (선택된 한 팀만 필터) */}
          {allPositions
            .filter(pos => viewTeam === 'home' ? pos.isHome : !pos.isHome)
            .map((pos, idx) => {
            const isWinningCaptain = !!winningCaptain && pos.name === winningCaptain;
            return (
              <Box
                key={`${pos.name}-${idx}`}
                sx={{
                  position: 'absolute',
                  // 🆕 모바일 축소: 컨테이너 폭 64, 유니폼 폭 52에 맞춤
                  left: pos.x - 32,
                  top: pos.y - 18,
                  width: 64,
                  textAlign: 'center',
                  animation: `dropIn 0.4s ease-out ${idx * 0.04}s both`,
                  '@keyframes dropIn': {
                    '0%': { opacity: 0, transform: 'translateY(-20px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                {/* Uniform — JerseySVG (포지션 라벨 내장), 평면 */}
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <JerseySVG
                    color={teamColor(pos.isHome)}
                    posLabel={pos.posLabel}
                    width={52}
                    height={43}
                  />
                  {/* 🆕 별 영역 — 유니폼 위쪽(머리 부분)에 SVG 별로 표시
                      · 위쪽 줄: 리그 우승 별 (블루, 동일 크기)
                      · 아래쪽 줄: 캡틴 누적 별 (3진법 티어, 크기 차등)
                  */}
                  {(() => {
                    const lWins = leagueWinsByPlayer[pos.name] || [];
                    const showCaptain = isWinningCaptain && winningCaptainTotalWins > 0;
                    if (lWins.length === 0 && !showCaptain) return null;

                    // 캡틴 별 — 3진법 분해 + 크기 차등
                    let capStars = [];
                    if (showCaptain) {
                      let n = winningCaptainTotalWins;
                      const t3 = Math.min(Math.floor(n / 27), 9); n -= t3 * 27;
                      const t2 = Math.floor(n / 9); n -= t2 * 9;
                      const t1 = Math.floor(n / 3); n -= t1 * 3;
                      const t0 = n;
                      const tiers = [
                        { count: t3, color: '#E91E63', glow: '233,30,99', size: 24 },   // Pink (27) — 가장 큼
                        { count: t2, color: '#AB47BC', glow: '171,71,188', size: 21 },  // Purple (9)
                        { count: t1, color: '#29B6F6', glow: '41,182,246', size: 18 },  // Blue (3)
                        { count: t0, color: '#FFC107', glow: '255,193,7', size: 15 },   // Gold (1) — 가장 작음
                      ];
                      tiers.forEach((tier, ti) => {
                        for (let i = 0; i < tier.count; i++) {
                          capStars.push({ key: `c${ti}-${i}`, ...tier });
                        }
                      });
                    }

                    return (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          mb: '2px',
                          display: 'flex',
                          flexDirection: 'column-reverse', // 캡틴 아래(유니폼 가까이), 리그 위
                          alignItems: 'center',
                          gap: '1px',
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {/* 캡틴 별 (유니폼에 가장 가까운 줄) */}
                        {capStars.length > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                            {capStars.slice(0, 9).map((s) => (
                              <StarIcon key={s.key} size={s.size} color={s.color} glow={s.glow} />
                            ))}
                          </Box>
                        )}
                        {/* 리그 별 (블루 동일 크기, 위쪽 줄) */}
                        {lWins.length > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
                            {lWins.slice(0, 9).map((lk, i) => (
                              <StarIcon key={`l-${i}-${lk}`} size={18} color="#29B6F6" glow="41,182,246" />
                            ))}
                          </Box>
                        )}
                      </Box>
                    );
                  })()}
                  {/* 포지션 라벨은 이제 JerseySVG 내부에 통합됨 */}
                </Box>
                {/* Name — 🆕 textAlign: 'center'로 가로 가운데 정렬 명시 */}
                <Typography
                  sx={{
                    fontSize: '1.0rem',
                    fontWeight: 'bold',
                    color: 'white',
                    textShadow: '1px 1px 3px rgba(0,0,0,0.9)',
                    lineHeight: 1.2,
                    mt: 0.3,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    width: '100%',
                  }}
                >
                  {pos.name}
                </Typography>
                {/* 일별 우승팀 메달은 별 영역(유니폼 위)으로 이동됨 */}
              </Box>
            );
          })}
        </Box>

        {/* Back + Share button */}
        <Box sx={{ mt: 3, textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 1.2 }}>
          <Button
            variant="contained"
            onClick={() => navigate(-1)}
            sx={{ bgcolor: '#0C0950', borderRadius: 2, px: 4, fontWeight: 'bold', '&:hover': { bgcolor: '#1a1a6e' } }}
          >
            닫기
          </Button>
          <Button
            variant="contained"
            startIcon={sharing ? <CircularProgress size={16} color="inherit" /> : <ShareIcon />}
            onClick={handleShare}
            disabled={sharing}
            sx={{
              bgcolor: '#1565C0', borderRadius: 2, px: 3, fontWeight: 'bold',
              '&:hover': { bgcolor: '#0D47A1' },
            }}
          >
            {sharing ? '생성중…' : '경기 공유'}
          </Button>
        </Box>
      </Container>
    </Box>
  );
}

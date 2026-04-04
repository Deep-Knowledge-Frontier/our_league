import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { ref, get } from "firebase/database";
import { useNavigate } from 'react-router-dom';
import {
  Container, Paper, Typography, Box, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, CircularProgress, Chip,
  Card, CardContent, useMediaQuery, Button, Dialog, DialogContent, IconButton
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';
import { calcMean, calcStd } from '../utils/stats';

import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

function ResultsPage() {
  const navigate = useNavigate();

  const { clubName } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // 탭
  const [tabIndex, setTabIndex] = useState(0);

  // 로딩(페이지/탭별 분리)
  const [loadingPage, setLoadingPage] = useState(true);            // 초기 탭0 로딩
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [loadingLeagueList, setLoadingLeagueList] = useState(false);

  // 데이터
  const [dateGroups, setDateGroups] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leagueList, setLeagueList] = useState([]);

  // 필터
  const [attendanceThreshold, setAttendanceThreshold] = useState(10);

  // 팝업
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [openModal, setOpenModal] = useState(false);

  // MVP 팝업
  const [mvpModalOpen, setMvpModalOpen] = useState(false);
  const [mvpData, setMvpData] = useState(null);
  const [mvpLoading, setMvpLoading] = useState(false);

  // Firebase 결과 캐시(탭 왕복 시 read 줄이기)
  const registeredSetRef = useRef(null);
  const statsRef = useRef(null);

  // unmount 안전장치
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // =========================
  // 0) 유틸
  // =========================
  const safeParseYmd = (ymd) => {
    if (!ymd) return null;
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d); // iOS/Safari 포함 안정 파싱
  };



  const formatTeamName = (name) => {
    if (!name) return "";
    const n = name.toString().trim();
    if (n.toUpperCase().startsWith("TEAM")) return n;
    return `Team ${n}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    return dateString.slice(2).replace(/-/g, '.');
  };

  const calculateDailyWinningTeamSimple = (matches) => {
    const teamStats = {};
    matches.forEach(m => {
      const t1 = m.team1; const t2 = m.team2;
      const s1 = Number(m.score1 || 0);
      const s2 = Number(m.score2 || 0);

      if (!teamStats[t1]) teamStats[t1] = { pts: 0, gd: 0, goals: 0 };
      if (!teamStats[t2]) teamStats[t2] = { pts: 0, gd: 0, goals: 0 };

      teamStats[t1].goals += s1; teamStats[t2].goals += s2;
      teamStats[t1].gd += (s1 - s2); teamStats[t2].gd += (s2 - s1);

      if (s1 > s2) teamStats[t1].pts += 3;
      else if (s2 > s1) teamStats[t2].pts += 3;
      else { teamStats[t1].pts += 1; teamStats[t2].pts += 1; }
    });

    const sortedTeams = Object.keys(teamStats).sort((a, b) => {
      if (teamStats[b].pts !== teamStats[a].pts) return teamStats[b].pts - teamStats[a].pts;
      if (teamStats[b].gd !== teamStats[a].gd) return teamStats[b].gd - teamStats[a].gd;
      return teamStats[b].goals - teamStats[a].goals;
    });

    return sortedTeams.length > 0 ? sortedTeams[0] : null;
  };

  // =========================
  // 1) Firebase 로드(캐시 포함)
  // =========================
  const loadRegisteredSet = useCallback(async () => {
    if (registeredSetRef.current) return registeredSetRef.current;
    if (!clubName) return new Set();

    const regSnap = await get(ref(db, `registeredPlayers/${clubName}`));
    const set = new Set();
    if (regSnap.exists()) {
      regSnap.forEach((child) => {
        const val = child.val();
        if (val?.name) set.add(val.name.trim());
      });
    }
    registeredSetRef.current = set;
    return set;
  }, [clubName]);

  const loadStats = useCallback(async () => {
    if (statsRef.current) return statsRef.current;
    if (!clubName) return null;

    const snapshot = await get(ref(db, `PlayerStatsBackup_6m/${clubName}`));
    const stats = snapshot.exists() ? (snapshot.val() || {}) : null;
    statsRef.current = stats;
    return stats;
  }, [clubName]);

  const loadBackupData = useCallback(async () => {
    if (!clubName) return [];
    const snapshot = await get(ref(db, `DailyResultsBackup/${clubName}`));
    if (!snapshot.exists()) return [];

    const data = snapshot.val();
    const dates = Object.keys(data).sort().reverse();

    // 데이터가 많을 때 초기 로딩이 무거우면 최근 N개만 표시(원하면 조정)
    const MAX_DATES = 30;
    const limitedDates = dates.slice(0, MAX_DATES);

    const processedGroups = [];
    for (const date of limitedDates) {
      const dateData = data[date];
      const backupMatches = dateData?.matches ? Object.values(dateData.matches) : [];
      const rawMatches = [];
      const rawSnapshot = await get(ref(db, `${clubName}/${date}`));

      if (rawSnapshot.exists()) {
        rawSnapshot.forEach((gameSnap) => {
          if (!String(gameSnap.key || '').startsWith('game')) return;

          const gameData = gameSnap.val() || {};
          const gameIndex = parseInt(String(gameSnap.key).replace('game', ''), 10);
          const resolvedGameIndex = Number.isFinite(gameIndex) ? gameIndex : rawMatches.length + 1;

          rawMatches.push({
            gameIndex: resolvedGameIndex,
            date,
            gameNumber: `${resolvedGameIndex}경기`,
            team1: gameData.team1_name || '',
            team2: gameData.team2_name || '',
            score1: gameData.goalCount1 || 0,
            score2: gameData.goalCount2 || 0,
            mvp: gameData.mvp || "없음",
          });
        });
      }

      rawMatches.sort((a, b) => a.gameIndex - b.gameIndex);

      const mergedMatches = [];
      const maxMatchCount = Math.max(backupMatches.length, rawMatches.length);
      for (let i = 0; i < maxMatchCount; i++) {
        const backupMatch = backupMatches[i] || {};
        const rawMatch = rawMatches[i] || {};
        const resolvedMvp =
          backupMatch?.mvp && backupMatch.mvp !== "없음"
            ? backupMatch.mvp
            : (rawMatch?.mvp || "없음");

        mergedMatches.push({
          ...rawMatch,
          ...backupMatch,
          gameNumber: backupMatch?.gameNumber || rawMatch?.gameNumber || `${i + 1}경기`,
          mvp: resolvedMvp,
        });
      }

      const matches = mergedMatches.filter((match) => match.team1 || match.team2 || match.gameNumber);
      if (matches.length > 0) {
        const dateObj = safeParseYmd(date);
        const dayName = dateObj ? ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()] : '?';
        const mvpVotes = {};
        matches.forEach((match) => {
          if (match.mvp && match.mvp !== "없음") {
            mvpVotes[match.mvp] = (mvpVotes[match.mvp] || 0) + 1;
          }
        });

        const resolvedDateMvp =
          dateData?.dailyMvp && dateData.dailyMvp !== "없음"
            ? dateData.dailyMvp
            : (Object.keys(mvpVotes).length > 0
              ? Object.entries(mvpVotes).sort((a, b) => b[1] - a[1])[0][0]
              : "없음");

        processedGroups.push({
          dateStr: `${date} (${dayName})`,
          matches,
          dateMvp: resolvedDateMvp,
          dailyWinner: calculateDailyWinningTeamSimple(matches)
        });
      }
    }
    return processedGroups;
  }, [clubName]);

  const loadLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const registeredSet = await loadRegisteredSet();
      const stats = await loadStats();
      if (!stats) {
        if (aliveRef.current) setLeaderboard([]);
        return;
      }

      const tempRows = [];
      const gpgList = [], diffList = [], attList = [];

      Object.keys(stats).forEach(name => {
        if (!registeredSet.has(name)) return;

        const p = stats[name] || {};
        let attRate = Number(p.attendanceRate || 0);
        if (attRate <= 1.0) attRate *= 100;

        if (attRate < attendanceThreshold) return;

        const goals = Number(p.goals || 0);
        const participated = Number(p.participatedMatches || 0);
        const gpg = participated > 0 ? goals / participated : 0;
        const diff = Number(p.avgGoalDiffPerGame || 0);

        gpgList.push(gpg);
        diffList.push(diff);
        attList.push(attRate);

        tempRows.push({
          name,
          attendance: attRate,
          ability: Number(p.abilityScore ?? 0),
          pointRate: Number(p.pointRate ?? 0),
          gd: diff,
          voteRate: Number(p.voteRate ?? 0),
          goals,
          assists: Number(p.assists || 0),
          wins: Number(p.wins || 0),
          losses: Number(p.losses || 0),
          participated,
          gpg,
          statAtt: Number(p.finalAttack || 50),
          statDef: Number(p.finalDefense || 50),
          statSta: Number(p.finalStamina || 50),
          statBal: Number(p.finalBalance || 50),
          statCon: Number(p.finalContribution || 50),
        });
      });

      const env = {
        meanGpg: calcMean(gpgList), stdGpg: calcStd(gpgList),
        meanDiff: calcMean(diffList), stdDiff: calcStd(diffList),
        meanAtt: calcMean(attList), stdAtt: calcStd(attList),
      };

      const finalRows = tempRows.map(row => ({
        ...row,
        archetype: calculateArchetype(row.goals, row.participated, row.attendance, row.gd, env)
      }));

      finalRows.sort((a, b) => {
        if (b.ability !== a.ability) return b.ability - a.ability;
        if (b.pointRate !== a.pointRate) return b.pointRate - a.pointRate;
        return b.gd - a.gd;
      });

      if (aliveRef.current) {
        setLeaderboard(finalRows.map((item, index) => ({ ...item, rank: index + 1 })));
      }
    } catch (e) {
      console.error(e);
      if (aliveRef.current) setLeaderboard([]);
    } finally {
      if (aliveRef.current) setLoadingLeaderboard(false);
    }
  }, [attendanceThreshold, loadRegisteredSet, loadStats]);

  const loadLeagueList = useCallback(async () => {
    setLoadingLeagueList(true);
    try {
      const snapshot = await get(ref(db, `LeagueMaker/${clubName}`));
      if (!snapshot.exists()) {
        if (aliveRef.current) setLeagueList([]);
        return;
      }
      const data = snapshot.val();
      const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
      list.sort((a, b) => Number(b.id) - Number(a.id));
      if (aliveRef.current) setLeagueList(list);
    } catch (e) {
      console.error(e);
      if (aliveRef.current) setLeagueList([]);
    } finally {
      if (aliveRef.current) setLoadingLeagueList(false);
    }
  }, [clubName]);

  // =========================
  // 2) Effect 분리
  // =========================
  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      setLoadingPage(true);
      try {
        const groups = await loadBackupData();
        if (aliveRef.current) setDateGroups(groups);
      } catch (e) {
        console.error(e);
        if (aliveRef.current) setDateGroups([]);
      } finally {
        if (aliveRef.current) setLoadingPage(false);
      }
    })();
  }, [loadBackupData]);

  useEffect(() => {
    if (tabIndex === 1) loadLeaderboard();
  }, [tabIndex, attendanceThreshold, loadLeaderboard]);

  useEffect(() => {
    if (tabIndex === 2) loadLeagueList();
  }, [tabIndex, loadLeagueList]);

  // =========================
  // 3) 이벤트
  // =========================
  const handleMvpClick = useCallback(async (mvpName, e) => {
    if (e) e.stopPropagation();
    if (!mvpName || mvpName === '없음') return;

    setMvpLoading(true);
    setMvpModalOpen(true);

    try {
      // 1. DailyResultsBackup에서 MVP 횟수 집계
      const backupSnap = await get(ref(db, `DailyResultsBackup/${clubName}`));
      let dailyMvpCount = 0;
      let gameMvpCount = 0;
      const mvpDates = [];

      if (backupSnap.exists()) {
        const data = backupSnap.val();
        Object.entries(data).forEach(([dateKey, dateData]) => {
          if (dateData.dailyMvp === mvpName) {
            dailyMvpCount++;
            mvpDates.push(dateKey);
          }
          const matches = dateData.matches ? Object.values(dateData.matches) : [];
          matches.forEach(m => {
            if (m.mvp === mvpName) gameMvpCount++;
          });
        });
      }

      mvpDates.sort().reverse();

      // 2. PlayerStatsBackup_6m에서 선수 스탯
      const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${clubName}/${mvpName}`));
      let stats = null;
      if (statsSnap.exists()) {
        const s = statsSnap.val();
        stats = {
          ability: Number(s.abilityScore || 0),
          goals: Number(s.goals || 0),
          assists: Number(s.assists || 0),
          pointRate: Number(s.pointRate || 0),
          attendance: (() => { const r = Number(s.attendanceRate || 0); return r <= 1 ? r * 100 : r; })(),
          wins: Number(s.wins || 0),
          losses: Number(s.losses || 0),
          participated: Number(s.participatedMatches || 0),
        };
      }

      setMvpData({
        name: mvpName,
        dailyMvpCount,
        gameMvpCount,
        mvpDates: mvpDates.slice(0, 6),
        stats,
      });
    } catch (err) {
      console.error('MVP data load error:', err);
      setMvpData({ name: mvpName, dailyMvpCount: 0, gameMvpCount: 0, mvpDates: [], stats: null });
    } finally {
      setMvpLoading(false);
    }
  }, [clubName]);

  const handlePlayerClick = (player) => {
    setSelectedPlayer(player);
    setIsCardFlipped(false);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setIsCardFlipped(false);
  };

  const handleCardFlip = (e) => {
    e?.stopPropagation?.();
    setIsCardFlipped((v) => !v);
  };

  // =========================
  // 4) 스타일
  // =========================
  const titleFont = isMobile ? "1.4rem" : "1.8rem";
  const dateTitleFont = isMobile ? "1.1rem" : "1.3rem";
  const teamFont = isMobile ? "1.0rem" : "1.1rem";
  const scoreFont = isMobile ? "1.3rem" : "1.5rem";
  const chipFont = isMobile ? "0.8rem" : "0.9rem";
  const mvpFont = isMobile ? "0.85rem" : "0.95rem";

  const cellStyle = { padding: '8px 4px', fontSize: isMobile ? '0.8rem' : '0.9rem', textAlign: 'center', whiteSpace: 'nowrap', letterSpacing: '-0.03em' };
  const headerCellStyle = { ...cellStyle, fontWeight: 'bold', backgroundColor: '#E9EEF8', color: '#111827', fontSize: isMobile ? '0.85rem' : '0.95rem' };

  const showGlobalLoading = loadingPage && tabIndex === 0;

  return (
    <div style={{ backgroundColor: '#F0F2F5', minHeight: '100vh', paddingBottom: '80px' }}>
      <Container maxWidth="sm" sx={{ pt: 2, px: 2 }}>
        <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)' }}>
          <CardContent sx={{ py: 3, textAlign: 'center' }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', letterSpacing: 2 }}>
              경기결과
            </Typography>
            <Typography variant="h4" sx={{ color: 'white', fontWeight: 900, mt: 0.5 }}>
              {clubName}
            </Typography>
          </CardContent>
        </Card>
        <Paper square sx={{ mb: 2 }}>
          <Tabs value={tabIndex} onChange={(e, n) => setTabIndex(n)} variant="fullWidth">
            <Tab label="경기결과" sx={{ letterSpacing: '-0.03em', fontSize: '0.95rem', fontWeight: 'bold' }} />
            <Tab label="선수순위" sx={{ letterSpacing: '-0.03em', fontSize: '0.95rem', fontWeight: 'bold' }} />
            <Tab label="리그결과" sx={{ letterSpacing: '-0.03em', fontSize: '0.95rem', fontWeight: 'bold' }} />
          </Tabs>
        </Paper>

        {showGlobalLoading ? (
          <Box display="flex" justifyContent="center" mt={5}><CircularProgress /></Box>
        ) : (
          <>
            {/* 탭 0: 경기결과 */}
            {tabIndex === 0 && (
              <>
                {dateGroups.length === 0 && <Typography align="center" mt={5}>데이터가 없습니다.</Typography>}
                {dateGroups.map((group, idx) => (
                  <Card key={idx} sx={{ mb: 2, boxShadow: 3, borderRadius: 3 }}>
                    <CardContent sx={{ p: isMobile ? 1.5 : 2.5, '&:last-child': { pb: isMobile ? 1.5 : 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, borderBottom: '2px solid #eee', pb: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: dateTitleFont, letterSpacing: '-0.03em' }}>
                          📅 {group.dateStr}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          {group.dailyWinner && (
                            <Box display="flex" alignItems="center">
                              <WorkspacePremiumIcon sx={{ color: '#FFD700', mr: 0, fontSize: '1.2rem' }} />
                              <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#333', fontSize: chipFont, letterSpacing: '-0.05em' }}>
                                {formatTeamName(group.dailyWinner)}
                              </Typography>
                            </Box>
                          )}
                          <Chip
                            label={`MVP: ${group.dateMvp}`}
                            size="small"
                            color="error"
                            variant="outlined"
                            clickable
                            onClick={(e) => handleMvpClick(group.dateMvp, e)}
                            sx={{ fontSize: chipFont, height: 24, fontWeight: 'bold', letterSpacing: '-0.05em', borderWidth: '1.5px', cursor: 'pointer' }}
                          />
                        </Box>
                      </Box>

                      {group.matches.map((match, mIdx) => (
                        <Box
                          key={mIdx}
                          onClick={() => {
                            const dateKey = group.dateStr.split(' ')[0];
                            const gNum = match.gameNumber ? match.gameNumber.replace('경기', '') : (mIdx + 1);
                            navigate(`/match/${dateKey}/${gNum}`);
                          }}
                          sx={{ mb: 1.2, p: 1.2, bgcolor: '#f9f9f9', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, cursor: 'pointer', '&:hover': { bgcolor: '#e8f0fe' } }}>
                          <Chip
                            label={match.gameNumber ? match.gameNumber.replace('경기', '') : (mIdx + 1)}
                            size="small"
                            sx={{ fontWeight: '900', fontSize: '0.75rem', height: 24, minWidth: 28, bgcolor: '#e3f2fd', color: '#1565C0' }}
                          />

                          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, minWidth: 0 }}>
                            <Typography sx={{ fontSize: teamFont, fontWeight: Number(match.score1) > Number(match.score2) ? '900' : '500', color: Number(match.score1) > Number(match.score2) ? '#1565C0' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', flex: 1, letterSpacing: '-0.04em' }}>
                              {formatTeamName(match.team1)}
                            </Typography>

                            <Box sx={{ bgcolor: '#fff', border: '1.5px solid #ddd', px: 1, py: 0.2, borderRadius: 4, minWidth: 'auto', textAlign: 'center', boxShadow: 1 }}>
                              <Typography sx={{ fontSize: scoreFont, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#222' }}>
                                {match.score1}:{match.score2}
                              </Typography>
                            </Box>

                            <Typography sx={{ fontSize: teamFont, fontWeight: Number(match.score2) > Number(match.score1) ? '900' : '500', color: Number(match.score2) > Number(match.score1) ? '#1565C0' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', flex: 1, letterSpacing: '-0.04em' }}>
                              {formatTeamName(match.team2)}
                            </Typography>
                          </Box>

                          <Box
                            onClick={(e) => { e.stopPropagation(); handleMvpClick(match.mvp, e); }}
                            sx={{ display: 'flex', alignItems: 'center', minWidth: 'auto', cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
                          >
                            <EmojiEventsIcon sx={{ color: '#FFD700', fontSize: '1.2rem', mr: 0 }} />
                            <Typography sx={{ fontSize: mvpFont, fontWeight: 'bold', color: '#333', letterSpacing: '-0.05em' }}>
                              {match.mvp}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </>
            )}

            {/* 탭 1: 선수순위 */}
            {tabIndex === 1 && (
              <Box>
                <Box display="flex" justifyContent="flex-end" mb={1}>
                  <FormControl size="small" sx={{ minWidth: 100, backgroundColor: 'white' }}>
                    <InputLabel sx={{ fontSize: '0.9rem' }}>최소 출석</InputLabel>
                    <Select
                      value={attendanceThreshold}
                      label="최소 출석"
                      onChange={(e) => setAttendanceThreshold(e.target.value)}
                      sx={{ fontSize: '0.9rem', height: 40 }}
                    >
                      {[5, 10, 15, 30, 50].map(v => (<MenuItem key={v} value={v}>{v}%</MenuItem>))}
                    </Select>
                  </FormControl>
                </Box>

                {loadingLeaderboard ? (
                  <Box display="flex" justifyContent="center" mt={3}><CircularProgress size={26} /></Box>
                ) : (
                  <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ ...headerCellStyle, width: '10%' }}>순위</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '20%' }}>이름</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>능력</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>승률</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>득실</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>출석</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>투표</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {leaderboard.length === 0 ? (
                          <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, fontSize: '1rem' }}>데이터가 없습니다.</TableCell></TableRow>
                        ) : (
                          leaderboard.map((row) => (
                            <TableRow key={row.name} sx={{ backgroundColor: row.rank % 2 === 0 ? '#F7F9FC' : 'white' }}>
                              <TableCell sx={cellStyle}>{row.rank}</TableCell>
                              <TableCell
                                sx={{
                                  ...cellStyle,
                                  fontWeight: 'bold',
                                  color: '#1565C0',
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                                onClick={() => handlePlayerClick(row)}
                              >
                                {row.name}
                              </TableCell>
                              <TableCell sx={{ ...cellStyle, color: '#1565C0', fontWeight: 'bold' }}>{Number(row.ability).toFixed(1)}</TableCell>
                              <TableCell sx={cellStyle}>{Number(row.pointRate).toFixed(0)}%</TableCell>
                              <TableCell sx={{ ...cellStyle, color: row.gd >= 0 ? '#D32F2F' : '#1976D2' }}>
                                {row.gd > 0 ? '+' : ''}{Number(row.gd).toFixed(1)}
                              </TableCell>
                              <TableCell sx={cellStyle}>{Number(row.attendance).toFixed(0)}%</TableCell>
                              <TableCell sx={cellStyle}>{Number(row.voteRate).toFixed(0)}%</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* 탭 2: 리그결과 */}
            {tabIndex === 2 && (
              <Box>
                {loadingLeagueList ? (
                  <Box display="flex" justifyContent="center" mt={3}><CircularProgress size={26} /></Box>
                ) : leagueList.length === 0 ? (
                  <Typography align="center" mt={5}>진행된 리그가 없습니다.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {leagueList.map((league) => (
                      <Button
                        key={league.id}
                        variant="contained"
                        onClick={() => navigate(`/league`, {
                          state: {
                            clubName,
                            leagueNumber: league.id,
                            startDate: league.startDate,
                            endDate: league.endDate
                          }
                        })}
                        sx={{
                          backgroundColor: '#2D336B',
                          color: 'white',
                          borderRadius: 3,
                          py: 1.5,
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          textTransform: 'none',
                          boxShadow: 3,
                          '&:hover': { backgroundColor: '#1A237E' }
                        }}
                      >
                        <Box textAlign="center">
                          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: '1.1rem', mb: 0.2 }}>
                            제{league.id}회 {league.leagueName}
                          </Typography>
                          <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.85rem' }}>
                            ({formatDate(league.startDate)} ~ {formatDate(league.endDate)})
                          </Typography>
                        </Box>
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </Container>

      {/* 3D 선수 카드 팝업 */}
      <Dialog
        open={openModal}
        onClose={handleCloseModal}
        maxWidth="xs"
        PaperProps={{
          style: { backgroundColor: 'transparent', boxShadow: 'none', overflow: 'visible' }
        }}
      >
        <DialogContent sx={{ p: 0, overflow: 'visible', position: 'relative' }}>
          <IconButton
            onClick={handleCloseModal}
            sx={{
              position: 'absolute',
              top: -8,
              right: -8,
              bgcolor: 'rgba(0,0,0,0.55)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }
            }}
          >
            <CloseIcon />
          </IconButton>

          {selectedPlayer?.archetype && (
            <PlayerCard3D
              player={selectedPlayer}
              isFlipped={isCardFlipped}
              onFlip={handleCardFlip}
              archetype={selectedPlayer.archetype}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* MVP 팝업 */}
      <Dialog
        open={mvpModalOpen}
        onClose={() => setMvpModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #0a1929 0%, #1a237e 100%)',
            color: 'white',
          }
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          {mvpLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress sx={{ color: '#FFD700' }} />
            </Box>
          ) : mvpData ? (
            <Box>
              {/* 헤더 */}
              <Box sx={{
                textAlign: 'center',
                pt: 3, pb: 2,
                background: 'linear-gradient(180deg, rgba(255,215,0,0.15) 0%, transparent 100%)',
              }}>
                <EmojiEventsIcon sx={{ fontSize: 48, color: '#FFD700', mb: 0.5 }} />
                <Typography sx={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {mvpData.name}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', mt: 0.3 }}>
                  MVP Statistics
                </Typography>
              </Box>

              {/* MVP 횟수 카드 */}
              <Box sx={{ display: 'flex', gap: 1.5, px: 2.5, mb: 2 }}>
                <Box sx={{
                  flex: 1, textAlign: 'center', py: 2,
                  bgcolor: 'rgba(255,215,0,0.12)', borderRadius: 3, border: '1px solid rgba(255,215,0,0.25)',
                }}>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: '#FFD700', lineHeight: 1 }}>
                    {mvpData.dailyMvpCount}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', mt: 0.5, fontWeight: 600 }}>
                    일일 MVP
                  </Typography>
                </Box>
                <Box sx={{
                  flex: 1, textAlign: 'center', py: 2,
                  bgcolor: 'rgba(100,181,246,0.12)', borderRadius: 3, border: '1px solid rgba(100,181,246,0.25)',
                }}>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: '#64B5F6', lineHeight: 1 }}>
                    {mvpData.gameMvpCount}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', mt: 0.5, fontWeight: 600 }}>
                    경기 MVP
                  </Typography>
                </Box>
              </Box>

              {/* 선수 스탯 */}
              {mvpData.stats && (
                <Box sx={{ px: 2.5, mb: 2 }}>
                  <Box sx={{
                    bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 3, p: 2,
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5,
                  }}>
                    {[
                      { label: '능력치', value: mvpData.stats.ability.toFixed(1), color: '#FFD700' },
                      { label: '승률', value: `${mvpData.stats.pointRate.toFixed(0)}%`, color: '#69F0AE' },
                      { label: '골/어시', value: `${mvpData.stats.goals}G ${mvpData.stats.assists}A`, color: '#FF8A80' },
                      { label: '출석률', value: `${mvpData.stats.attendance.toFixed(0)}%`, color: '#80D8FF' },
                      { label: '전적', value: `${mvpData.stats.wins}승 ${mvpData.stats.losses}패`, color: '#B388FF' },
                      { label: '출전', value: `${mvpData.stats.participated}경기`, color: '#FFCC80' },
                    ].map((item, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                          {item.label}
                        </Typography>
                        <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: item.color }}>
                          {item.value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {/* 최근 MVP 날짜 */}
              {mvpData.mvpDates.length > 0 && (
                <Box sx={{ px: 2.5, mb: 2 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, mb: 1 }}>
                    최근 일일 MVP 날짜
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                    {mvpData.mvpDates.map((d, i) => (
                      <Chip
                        key={i}
                        label={d.slice(2).replace(/-/g, '.')}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          height: 26,
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* 닫기 버튼 */}
              <Box sx={{ textAlign: 'center', pb: 2.5, pt: 1 }}>
                <Button
                  onClick={() => setMvpModalOpen(false)}
                  variant="contained"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.12)',
                    color: 'white',
                    borderRadius: 3,
                    px: 5,
                    fontWeight: 700,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
                  }}
                >
                  닫기
                </Button>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>

    </div>
  );
}

// =========================
// Archetype (원본 로직 유지)
// =========================
const calculateArchetype = (goals, matches, attendanceRate, avgDiff, env) => {
  if (matches <= 0) return { title: "데이터 없음", desc: "경기 데이터가 부족합니다.", color: "#FFFFFF" };
  if (matches < 3) return { title: "루키", desc: "이제 막 그라운드에 발을 디딘 신인입니다.", color: "#FFFFFF" };

  const gpg = goals / matches;
  const { meanGpg, stdGpg, meanDiff, stdDiff } = env;

  const zGpg = (gpg - meanGpg) / stdGpg;
  const zDiff = (avgDiff - meanDiff) / stdDiff;

  if (attendanceRate < 20.0) {
    if (zGpg > 1.0 && zDiff > 0.5) return { title: "전설의 용병", desc: "그가 오면 승리와 골이 따라옵니다.", color: "#FFD700" };
    if (zGpg > 1.5) return { title: "폭격기", desc: "압도적인 득점력을 가진 특급 게스트.", color: "#FF4081" };
    if (zDiff > 1.0) return { title: "승리 요정", desc: "골은 없어도 팀을 이기게 만듭니다.", color: "#00E5FF" };

    if (zDiff < -1.0) {
      if (matches < 5) {
        if (zGpg > 0.5) return { title: "단기 체험러", desc: "몇 경기만으로 판단하긴 이르지만, 한 방은 있어요.", color: "#B0BEC5" };
        return { title: "초행길", desc: "아직 팀 템포를 익히는 중. 데이터가 더 필요해요.", color: "#CFD8DC" };
      }
      if (zGpg > 0.5) return { title: "고립 관광객", desc: "득점은 하지만 흐름이 끊겨 팀 득실에 손해가 납니다.", color: "#EF9A9A" };
      if (zGpg < -0.5) return { title: "힐링 관광객", desc: "승패보다 즐거움이 우선! 운동하러 오셨습니다.", color: "#E0E0E0" };
      return { title: "관람객", desc: "플레이보다 구경(?)이 더 기억에 남는 날이네요.", color: "#D7CCC8" };
    }
    return { title: "조커", desc: "변수를 창출하는 히든 카드.", color: "#B388FF" };
  }

  if (zGpg > 1.0 && zDiff > 1.0) return { title: "축구의 신", desc: "압도적인 기량으로 리그를 지배합니다.", color: "#FFD700" };

  if (zGpg > 1.0) {
    if (zDiff > 0) return { title: "발롱도르", desc: "팀의 승리를 결정짓는 최고의 공격수.", color: "#FFAB00" };
    return { title: "고독한 에이스", desc: "엄청난 득점력을 가졌으나 팀운이 없네요.", color: "#FF5252" };
  }

  if (zGpg > 0.5) {
    if (zDiff > 0.8) return { title: "라인브레이커", desc: "한 방에 수비 라인을 찢고 경기를 바꿉니다.", color: "#00C853" };
    if (zDiff > 0.5) return { title: "게임 체인저", desc: "흐름을 뒤바꾸는 결정적인 한 방.", color: "#00E676" };
    if (zDiff > 0.2) return { title: "결정적 피니셔", desc: "확실한 찬스를 골로 바꾸는 마무리.", color: "#1E88E5" };

    if (attendanceRate >= 80.0 && zGpg > 0.6) return { title: "고정 타겟맨", desc: "매주 믿고 쓰는 공격 옵션. 팀 전술의 중심.", color: "#5E35B1" };

    if (zGpg > 0.85) return { title: "스나이퍼", desc: "골문 앞에서의 침착함이 돋보입니다.", color: "#FF6E40" };
    if (zGpg > 0.70) return { title: "킬러 인스팅트", desc: "찬스가 오면 본능적으로 마무리합니다.", color: "#FB8C00" };

    if (zDiff < -0.7) return { title: "고립 타겟", desc: "득점은 하지만 전개가 끊겨 고립되기 쉽습니다.", color: "#EF5350" };
    if (zDiff < -0.2) return { title: "포스트 플레이어", desc: "버티고 받아내며 2선 찬스를 만듭니다.", color: "#8D6E63" };

    return { title: "타겟터", desc: "공격의 구심점이 되어주는 선수.", color: "#FF9E80" };
  }

  if (zDiff > 1.0) return { title: "승리의 토템", desc: "당신이 뛰면 팀은 지지 않습니다.", color: "#69F0AE" };
  if (zDiff > 0.5) return { title: "마에스트로", desc: "공수 조율을 통해 경기를 지배합니다.", color: "#40C4FF" };

  if (zGpg < -0.5 && zDiff > -0.2) {
    if (attendanceRate >= 80.0) return { title: "통곡의 벽", desc: "성실함과 수비력으로 팀을 지탱합니다.", color: "#76FF03" };
    return { title: "언성 히어로", desc: "보이지 않는 곳에서 팀을 위해 헌신합니다.", color: "#CFD8DC" };
  }

  if (Math.abs(zGpg) <= 0.5 && Math.abs(zDiff) <= 0.5) {
    if (zGpg >= 0.2) return { title: "섀도우 스트라이커", desc: "2선에서 언제든 득점을 노립니다.", color: "#BA68C8" };
    if (zDiff >= 0) return { title: "진공 청소기", desc: "중원을 장악하고 상대 공격을 차단합니다.", color: "#4DB6AC" };
    return { title: "링커", desc: "팀의 연결 고리 역할을 수행합니다.", color: "#90CAF9" };
  }

  if (attendanceRate >= 80.0) return { title: "공무원", desc: "눈이 오나 비가 오나 자리를 지키는 살림꾼.", color: "#FFF59D" };
  if (attendanceRate >= 60.0) return { title: "철인 28호", desc: "지치지 않는 체력으로 매주 출전합니다.", color: "#FF9100" };

  if (zDiff < -1.0) {
    if (zGpg > 0) return { title: "소년 가장", desc: "팀이 무너져도 고군분투하고 있습니다.", color: "#F50057" };
    return { title: "인간 승리", desc: "포기하지 않는 불굴의 의지가 아름답습니다.", color: "#FF80AB" };
  }

  if (zGpg < -1.0) return { title: "평화주의자", desc: "골대와 싸우지 않습니다. 평화를 사랑합니다.", color: "#DCE775" };

  if (matches < 10) return { title: "잠재적 유망주", desc: "데이터가 쌓이면 진가를 발휘할 겁니다.", color: "#FFCC80" };

  return { title: "행복 축구 전도사", desc: "승패를 떠나 축구를 즐깁니다.", color: "#FFFFFF" };
};

// =========================
// 3D 카드 (뒷면도 중앙 배치)
// =========================
const PlayerCard3D = ({ player, isFlipped, onFlip, archetype }) => {
  const chartData = useMemo(() => ({
    labels: ['체력', '수비', '공격', '밸런스', '기여'],
    datasets: [{
      label: 'Stats',
      data: [player.statSta, player.statDef, player.statAtt, player.statBal, player.statCon],
      backgroundColor: 'rgba(255, 215, 0, 0.5)',
      borderColor: '#FFD700',
      borderWidth: 2,
      pointBackgroundColor: '#FFD700',
    }],
  }), [player.statSta, player.statDef, player.statAtt, player.statBal, player.statCon]);

  const chartOptions = useMemo(() => ({
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { display: false },
        grid: { color: 'rgba(255,255,255,0.2)' },
        pointLabels: { color: '#FFF', font: { size: 10 } }
      }
    },
    plugins: { legend: { display: false } },
    maintainAspectRatio: false,
  }), []);

  return (
    <div style={{ perspective: '1000px', width: '320px', height: '500px', cursor: 'pointer' }} onClick={onFlip}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transition: 'transform 0.6s',
        transformStyle: 'preserve-3d',
        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
      }}>
        {/* 앞면 */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          borderRadius: '18px',
          backgroundColor: 'rgba(10, 25, 49, 0.8)',
          boxShadow: '0 16px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          textAlign: 'center',
          padding: '20px',
          boxSizing: 'border-box',
        }}>
          <Typography sx={{ fontSize: '4rem', fontWeight: 'bold', color: '#FFD700', mb: -1 }}>
            {player.ability.toFixed(1)}
          </Typography>
          <Typography sx={{ fontSize: '1.2rem', fontWeight: 'bold', mb: 3 }}>OVR</Typography>
          <Typography sx={{ fontSize: '1.8rem', fontWeight: 'bold', color: archetype.color, mb: 1 }}>
            {archetype.title}
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#FFF', px: 1, textAlign: 'center', mb: 6 }}>
            {archetype.desc}
          </Typography>
          <Typography sx={{ fontSize: '2.2rem', fontWeight: 'bold' }}>{player.name}</Typography>
        </div>

        {/* 뒷면: 세로/가로 중앙 정렬 */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          borderRadius: '18px',
          transform: 'rotateY(180deg)',
          backgroundColor: 'rgba(10, 10, 10, 0.8)',
          boxShadow: '0 16px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '12px',
          padding: '20px',
          color: 'white',
          boxSizing: 'border-box',
        }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>
            SEASON ANALYTICS
          </Typography>

          <div style={{
            width: '240px',
            height: '240px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Radar data={chartData} options={chartOptions} />
          </div>

          <Box sx={{ width: '100%', maxWidth: 280, mt: 1 }}>
            <Box display="flex" gap={1} mb={1}>
              <StatBox label="ATTACK POINT" value={`${player.goals}G ${player.assists}A`} color="#FFD700" />
              <StatBox label="RECORD" value={`${player.wins}W - ${player.losses}L`} color="#FFFFFF" />
            </Box>
            <Box display="flex" gap={1}>
              <StatBox label="APPEARANCES" value={`${player.participated} (${player.attendance.toFixed(0)}%)`} color="#00E676" />
              <StatBox label="WIN RATE" value={`${player.pointRate.toFixed(1)}%`} color="#E040FB" />
            </Box>
          </Box>
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, color }) => (
  <Box sx={{ flex: 1, backgroundColor: '#1E1E1E', borderRadius: 2, p: 1.5, textAlign: 'center' }}>
    <Typography sx={{ fontSize: '0.65rem', fontWeight: 'bold', color: color, opacity: 0.8 }}>{label}</Typography>
    <Typography sx={{ fontSize: '1rem', fontWeight: 'bold', color: color, mt: 0.5 }}>{value}</Typography>
  </Box>
);

export default ResultsPage;

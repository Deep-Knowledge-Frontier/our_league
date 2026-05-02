import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { ref, get } from "firebase/database";
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container, Paper, Typography, Box, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, CircularProgress, Chip,
  Card, CardContent, useMediaQuery, Button, Dialog, DialogContent, IconButton
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import CloseIcon from '@mui/icons-material/Close';
import ShareIcon from '@mui/icons-material/Share';
import { useAuth } from '../contexts/AuthContext';
import { calcMean, calcStd } from '../utils/stats';
import { DEMO_CLUB, createNameMap, anonymize } from '../utils/demo';
import { shareDailyResultsImage } from '../utils/shareDailyResults';
import { ResultsPageSkeleton } from '../components/common/SkeletonLoading';

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

  const { clubName, userName, loading: authLoading, isDemoGuest } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // 탭 (URL ?tab=1 등으로 탭 지정 가능)
  const [searchParams] = useSearchParams();
  const [tabIndex, setTabIndex] = useState(0);
  useEffect(() => {
    const t = parseInt(searchParams.get('tab') || '0', 10);
    if ([0, 1, 2].includes(t)) setTabIndex(t);
  }, [searchParams]);

  // 로딩(페이지/탭별 분리)
  const [loadingPage, setLoadingPage] = useState(true);            // 초기 탭0 로딩
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [loadingLeagueList, setLoadingLeagueList] = useState(false);

  // 데이터
  const [dateGroups, setDateGroups] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leagueList, setLeagueList] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [awardStats, setAwardStats] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoNameMap, setDemoNameMap] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const dataClub = (demoMode || isDemoGuest) ? DEMO_CLUB : clubName;

  // 필터 (기본 15% — 능력치 정규화 기준과 일치)
  const [attendanceThreshold, setAttendanceThreshold] = useState(15);
  const [statsPeriod, setStatsPeriod] = useState('6m'); // '6m' | 'season' | 'all'

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
  const statsRef = useRef({});

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
    const n = name.toString().trim().replace(/^팀\s*/, '');
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
    if (!dataClub) return new Set();

    const regSnap = await get(ref(db, `registeredPlayers/${dataClub}`));
    const set = new Set();
    if (regSnap.exists()) {
      regSnap.forEach((child) => {
        const val = child.val();
        if (val?.name) set.add(val.name.trim());
      });
    }
    registeredSetRef.current = set;
    return set;
  }, [dataClub]);

  const loadStats = useCallback(async (period) => {
    const p = period || statsPeriod;
    if (statsRef.current[p]) return statsRef.current[p];
    if (!dataClub) return null;

    const pathMap = { '6m': 'PlayerStatsBackup_6m', 'season': 'PlayerStatsBackup_season', 'all': 'PlayerStatsBackup' };
    const snapshot = await get(ref(db, `${pathMap[p]}/${dataClub}`));
    const stats = snapshot.exists() ? (snapshot.val() || {}) : null;
    statsRef.current[p] = stats;
    return stats;
  }, [dataClub, statsPeriod]);

  const loadBackupData = useCallback(async () => {
    if (!dataClub) return [];

    // 1회 읽기: DailyResultsBackup + PlayerSelectionByDate (myTeam 판별용)
    const [backupSnap, selAllSnap] = await Promise.all([
      get(ref(db, `DailyResultsBackup/${dataClub}`)),
      (userName && !demoMode) ? get(ref(db, `PlayerSelectionByDate/${dataClub}`)) : Promise.resolve(null),
    ]);
    if (!backupSnap.exists()) return [];

    const data = backupSnap.val();
    const selAllData = selAllSnap?.exists() ? selAllSnap.val() : {};
    const dates = Object.keys(data).sort().reverse();
    const MAX_DATES = 30;
    const limitedDates = dates.slice(0, MAX_DATES);

    // myTeam 판별 헬퍼
    const findMyTeam = (date, gameKey, t1Name, t2Name) => {
      if (!userName || demoMode) return null;
      const dateSel = selAllData[date];
      if (!dateSel) return null;
      const src = dateSel[gameKey] || dateSel.AttandPlayer;
      if (!src) return null;
      const inList = (arr) => Array.isArray(arr) && arr.some(p => p && typeof p === 'string' && p.trim() === userName);
      for (const [key, val] of Object.entries(src)) {
        if (!inList(val)) continue;
        const code = key.replace(/^Team\s*/i, '').replace(/^팀\s*/, '').trim();
        const t1Code = t1Name.replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
        const t2Code = t2Name.replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
        if (code === t1Code || key === t1Name) return 'team1';
        if (code === t2Code || key === t2Name) return 'team2';
      }
      return null;
    };

    const processedGroups = [];
    for (const date of limitedDates) {
      const dateData = data[date];
      const backupMatches = dateData?.matches ? Object.values(dateData.matches) : [];
      if (backupMatches.length === 0) continue;

      const matches = backupMatches.map((m, i) => ({
        gameNumber: m.gameNumber || `${i + 1}경기`,
        team1: m.team1 || '', team2: m.team2 || '',
        score1: m.score1 || 0, score2: m.score2 || 0,
        mvp: m.mvp || '없음',
        myTeam: findMyTeam(date, `game${i + 1}`, m.team1 || '', m.team2 || ''),
      }));

      const dateObj = safeParseYmd(date);
      const dayName = dateObj ? ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()] : '?';

      processedGroups.push({
        dateStr: `${date} (${dayName})`,
        matches,
        dateMvp: dateData?.dailyMvp && dateData.dailyMvp !== '없음'
          ? dateData.dailyMvp
          : (matches.find(m => m.mvp !== '없음')?.mvp || '없음'),
        dailyWinner: calculateDailyWinningTeamSimple(matches),
      });
    }
    return processedGroups;
  }, [dataClub, userName, demoMode]);

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
  }, [attendanceThreshold, statsPeriod, loadRegisteredSet, loadStats]);

  const loadLeagueList = useCallback(async () => {
    setLoadingLeagueList(true);
    try {
      const [leagueSnap, dailySnap] = await Promise.all([
        get(ref(db, `LeagueMaker/${dataClub}`)),
        get(ref(db, `DailyResultsBackup/${dataClub}`)),
      ]);

      if (leagueSnap.exists()) {
        const data = leagueSnap.val();
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        list.sort((a, b) => Number(b.id) - Number(a.id));
        if (aliveRef.current) setLeagueList(list);
      } else {
        if (aliveRef.current) setLeagueList([]);
      }

      // MVP/팀우승 통계 계산
      if (dailySnap.exists()) {
        const dailyData = dailySnap.val();
        const dailyMvpMap = {}, gameMvpMap = {}, teamWinMap = {};

        Object.values(dailyData).forEach(dayInfo => {
          // 일별 MVP
          if (dayInfo?.dailyMvp && dayInfo.dailyMvp !== '없음') {
            dailyMvpMap[dayInfo.dailyMvp] = (dailyMvpMap[dayInfo.dailyMvp] || 0) + 1;
          }
          // 경기별 MVP
          const matches = dayInfo?.matches ? Object.values(dayInfo.matches) : [];
          matches.forEach(m => {
            if (m.mvp && m.mvp !== '없음') gameMvpMap[m.mvp] = (gameMvpMap[m.mvp] || 0) + 1;
          });
          // 팀 우승
          if (matches.length > 0) {
            const pts = {};
            matches.forEach(m => {
              const t1 = m.team1, t2 = m.team2;
              const s1 = Number(m.score1 || 0), s2 = Number(m.score2 || 0);
              if (!pts[t1]) pts[t1] = { p: 0, gd: 0 };
              if (!pts[t2]) pts[t2] = { p: 0, gd: 0 };
              pts[t1].gd += (s1 - s2); pts[t2].gd += (s2 - s1);
              if (s1 > s2) pts[t1].p += 3;
              else if (s2 > s1) pts[t2].p += 3;
              else { pts[t1].p += 1; pts[t2].p += 1; }
            });
            const winner = Object.keys(pts).sort((a, b) =>
              pts[b].p !== pts[a].p ? pts[b].p - pts[a].p : pts[b].gd - pts[a].gd
            )[0];
            if (winner) {
              const code = winner.replace(/^(팀\s*|Team\s*)/i, '').trim();
              teamWinMap[code] = (teamWinMap[code] || 0) + 1;
            }
          }
        });

        const toSorted = (map) => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        if (aliveRef.current) setAwardStats({
          dailyMvp: toSorted(dailyMvpMap).slice(0, 5),
          gameMvp: toSorted(gameMvpMap).slice(0, 5),
          teamWins: toSorted(teamWinMap),
        });
      }
    } catch (e) {
      console.error(e);
      if (aliveRef.current) setLeagueList([]);
    } finally {
      if (aliveRef.current) setLoadingLeagueList(false);
    }
  }, [dataClub]);

  // =========================
  // 2) Effect 분리
  // =========================
  useEffect(() => {
    if (!dataClub) return;
    let cancelled = false;
    setLoadingPage(true);
    setDateGroups([]);
    (async () => {
      try {
        const groups = await loadBackupData();
        if (!cancelled) setDateGroups(groups || []);
      } catch (e) {
        console.error('loadBackupData error:', e);
        if (!cancelled) setDateGroups([]);
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadBackupData, dataClub]);

  useEffect(() => {
    if (tabIndex === 1) loadLeaderboard();
  }, [tabIndex, attendanceThreshold, loadLeaderboard]);

  useEffect(() => {
    if (tabIndex === 2) loadLeagueList();
  }, [tabIndex, loadLeagueList]);

  // =========================
  // 3) 이벤트
  // =========================
  // 🆕 일자별 결과 카드 공유 — 카드 단위 PNG 생성 후 Web Share / 다운로드
  const [sharingDate, setSharingDate] = useState(null);
  const handleShareDaily = useCallback(async (group, e) => {
    if (e) e.stopPropagation();
    if (!group || sharingDate) return;
    setSharingDate(group.dateStr);
    try {
      const blob = await shareDailyResultsImage({
        dateStr: group.dateStr,
        dailyWinner: group.dailyWinner,
        dateMvp: group.dateMvp,
        matches: (group.matches || []).map((m, idx) => ({
          gameNumber: m.gameNumber || `${idx + 1}경기`,
          team1: m.team1, team2: m.team2,
          score1: m.score1, score2: m.score2,
          mvp: m.mvp,
        })),
      });
      const dateKey = String(group.dateStr || '').split(' ')[0] || 'match';
      const fileName = `${dateKey}_경기결과.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${group.dateStr} 경기 결과`,
            text: `${group.dateStr}${group.dailyWinner ? ` · 우승: ${group.dailyWinner}` : ''}`,
          });
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert('이미지 생성/공유 실패: ' + (err.message || err));
    } finally {
      setSharingDate(null);
    }
  }, [sharingDate]);

  const handleMvpClick = useCallback(async (mvpName, e) => {
    if (e) e.stopPropagation();
    if (!mvpName || mvpName === '없음') return;

    setMvpLoading(true);
    setMvpModalOpen(true);

    try {
      // 1. DailyResultsBackup에서 MVP 횟수 집계
      const backupSnap = await get(ref(db, `DailyResultsBackup/${dataClub}`));
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
      const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${dataClub}/${mvpName}`));
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
  }, [dataClub]);

  // 데모 게스트: 자동 데모 활성화
  useEffect(() => {
    if (isDemoGuest && !demoMode) {
      (async () => {
        setDemoLoading(true);
        try {
          const regSnap = await get(ref(db, `registeredPlayers/${DEMO_CLUB}`));
          const realNames = regSnap.exists() ? Object.values(regSnap.val()).map(p => p.name).filter(Boolean) : [];
          setDemoNameMap(createNameMap(realNames));
          setDemoMode(true);
        } catch (e) { console.error(e); }
        setDemoLoading(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoGuest]);

  const activateDemo = async () => {
    setDemoLoading(true);
    try {
      registeredSetRef.current = null;
      statsRef.current = {};
      const regSnap = await get(ref(db, `registeredPlayers/${DEMO_CLUB}`));
      const realNames = regSnap.exists() ? Object.values(regSnap.val()).map(p => p.name).filter(Boolean) : [];
      setDemoNameMap(createNameMap(realNames));
      setDemoMode(true);
    } catch (e) { console.error(e); }
    setDemoLoading(false);
  };

  const deactivateDemo = () => {
    setDemoMode(false);
    setDemoNameMap(null);
    registeredSetRef.current = null;
    statsRef.current = {};
  };

  // 데모 모드: 이름 변환 헬퍼
  const dn = (name) => demoMode && demoNameMap ? anonymize(name, demoNameMap) : name;

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
  const dateTitleFont = isMobile ? "1.1rem" : "1.3rem";
  const teamFont = isMobile ? "1.0rem" : "1.1rem";
  const scoreFont = isMobile ? "1.3rem" : "1.5rem";
  const chipFont = isMobile ? "0.8rem" : "0.9rem";
  const mvpFont = isMobile ? "0.85rem" : "0.95rem";

  const cellStyle = { padding: '8px 4px', fontSize: isMobile ? '0.8rem' : '0.9rem', textAlign: 'center', whiteSpace: 'nowrap', letterSpacing: '-0.03em' };
  const headerCellStyle = { ...cellStyle, fontWeight: 'bold', backgroundColor: '#E9EEF8', color: '#111827', fontSize: isMobile ? '0.85rem' : '0.95rem' };

  const showGlobalLoading = (loadingPage || authLoading || !dataClub) && tabIndex === 0;

  return (
    <div style={{ backgroundColor: '#F0F2F5', minHeight: '100vh', paddingBottom: '96px' }}>
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

        {/* 데모 모드 배너 */}
        {demoMode && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 2, py: 0.8, borderRadius: 2, bgcolor: '#FFF3E0', border: '1px solid #FFE0B2' }}>
            <Typography sx={{ fontSize: '0.82rem', color: '#E65100', fontWeight: 700 }}>샘플 데이터를 보고 있습니다</Typography>
            <Button size="small" onClick={deactivateDemo} sx={{ fontSize: '0.75rem', color: '#E65100', fontWeight: 700, minWidth: 'auto' }}>닫기</Button>
          </Box>
        )}

        {showGlobalLoading ? (
          <ResultsPageSkeleton />
        ) : (
          <>
            {/* 탭 0: 경기결과 */}
            {tabIndex === 0 && (
              <>
                {dateGroups.length === 0 && !demoMode && (
                  <Box sx={{ textAlign: 'center', mt: 5 }}>
                    <Typography sx={{ color: '#999', mb: 2 }}>데이터가 없습니다.</Typography>
                    <Button variant="contained" onClick={activateDemo} disabled={demoLoading}
                      startIcon={demoLoading ? <CircularProgress size={16} color="inherit" /> : <EmojiEventsIcon />}
                      sx={{ borderRadius: 2, fontWeight: 700, background: 'linear-gradient(135deg, #F57C00, #E65100)' }}>
                      {demoLoading ? '로딩중...' : '샘플 데이터 보기'}
                    </Button>
                  </Box>
                )}
                {dateGroups.length === 0 && demoMode && <Typography align="center" mt={5}>데이터를 불러오는 중...</Typography>}
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
                            label={`MVP: ${dn(group.dateMvp)}`}
                            size="small"
                            color="error"
                            variant="outlined"
                            clickable
                            onClick={(e) => handleMvpClick(group.dateMvp, e)}
                            sx={{ fontSize: chipFont, height: 24, fontWeight: 'bold', letterSpacing: '-0.05em', borderWidth: '1.5px', cursor: 'pointer' }}
                          />
                          {/* 🆕 일자별 공유 버튼 */}
                          <IconButton
                            size="small"
                            onClick={(e) => handleShareDaily(group, e)}
                            disabled={sharingDate === group.dateStr}
                            sx={{
                              p: 0.4,
                              color: '#1565C0',
                              '&:hover': { bgcolor: '#E3F2FD' },
                            }}
                            title="이 날 경기 결과 공유"
                          >
                            {sharingDate === group.dateStr
                              ? <CircularProgress size={16} />
                              : <ShareIcon sx={{ fontSize: '1.05rem' }} />}
                          </IconButton>
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

                          {/* 왼쪽 팀 영역 */}
                          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', minWidth: 0 }}>
                            {match.myTeam === 'team1' && (
                              <Box sx={{ width: 17, height: 17, borderRadius: '50%', bgcolor: '#FF9800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Typography sx={{ fontSize: '0.5rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>나</Typography>
                              </Box>
                            )}
                            <Typography sx={{ fontSize: teamFont, fontWeight: Number(match.score1) > Number(match.score2) ? '900' : '500', color: Number(match.score1) > Number(match.score2) ? '#1565C0' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.04em' }}>
                              {formatTeamName(match.team1)}
                            </Typography>
                          </Box>

                          {/* 점수 (중앙 고정) */}
                          <Box sx={{ bgcolor: '#fff', border: '1.5px solid #ddd', px: 1, py: 0.2, borderRadius: 4, textAlign: 'center', boxShadow: 1, flexShrink: 0 }}>
                            <Typography sx={{ fontSize: scoreFont, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#222' }}>
                              {match.score1}:{match.score2}
                            </Typography>
                          </Box>

                          {/* 오른쪽 팀 영역 */}
                          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '3px', minWidth: 0 }}>
                            <Typography sx={{ fontSize: teamFont, fontWeight: Number(match.score2) > Number(match.score1) ? '900' : '500', color: Number(match.score2) > Number(match.score1) ? '#1565C0' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.04em' }}>
                              {formatTeamName(match.team2)}
                            </Typography>
                            {match.myTeam === 'team2' && (
                              <Box sx={{ width: 17, height: 17, borderRadius: '50%', bgcolor: '#FF9800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Typography sx={{ fontSize: '0.5rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>나</Typography>
                              </Box>
                            )}
                          </Box>

                          <Box
                            onClick={(e) => { e.stopPropagation(); handleMvpClick(match.mvp, e); }}
                            sx={{ display: 'flex', alignItems: 'center', minWidth: 'auto', cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
                          >
                            <EmojiEventsIcon sx={{ color: '#FFD700', fontSize: '1.2rem', mr: 0 }} />
                            <Typography sx={{ fontSize: mvpFont, fontWeight: 'bold', color: '#333', letterSpacing: '-0.05em' }}>
                              {dn(match.mvp)}
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
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} gap={1} flexWrap="wrap">
                  {/* 기간 — iOS 스타일 Segmented Control */}
                  <Box sx={{
                    display: 'inline-flex',
                    p: 0.4,
                    bgcolor: '#F0F2F5',
                    borderRadius: 99,
                    position: 'relative',
                  }}>
                    {[
                      { value: '6m', label: '6개월' },
                      { value: 'season', label: `${new Date().getFullYear()}` },
                      { value: 'all', label: '전체' },
                    ].map(p => {
                      const active = statsPeriod === p.value;
                      return (
                        <Box
                          key={p.value}
                          onClick={() => { setStatsPeriod(p.value); statsRef.current = {}; }}
                          sx={{
                            px: 1.8, py: 0.6,
                            borderRadius: 99,
                            fontSize: '0.78rem',
                            fontWeight: active ? 800 : 600,
                            color: active ? '#1565C0' : '#888',
                            bgcolor: active ? 'white' : 'transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: active ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                            '&:hover': !active ? { color: '#555' } : {},
                          }}
                        >
                          {p.label}
                        </Box>
                      );
                    })}
                  </Box>

                  {/* 최소 출전율 필터 — Pill 스타일 */}
                  <FormControl size="small">
                    <Select
                      value={attendanceThreshold}
                      onChange={(e) => setAttendanceThreshold(e.target.value)}
                      renderValue={(value) => (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box component="span" sx={{ fontSize: '0.72rem', color: '#888', fontWeight: 600 }}>
                            최소 출전
                          </Box>
                          <Box component="span" sx={{ fontSize: '0.82rem', color: '#1565C0', fontWeight: 900 }}>
                            {value}%
                          </Box>
                        </Box>
                      )}
                      sx={{
                        borderRadius: 99,
                        bgcolor: '#F0F2F5',
                        height: 36,
                        '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
                        '& .MuiSelect-select': {
                          py: 0.8, pl: 1.8, pr: '30px !important',
                        },
                        '& .MuiSelect-icon': { right: 8, color: '#888' },
                      }}
                    >
                      {[5, 10, 15, 30, 50].map(v => (
                        <MenuItem key={v} value={v} sx={{ fontSize: '0.85rem' }}>
                          최소 출전 {v}%
                        </MenuItem>
                      ))}
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
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>출전</TableCell>
                          <TableCell sx={{ ...headerCellStyle, width: '14%' }}>투표</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {leaderboard.length === 0 ? (
                          <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, fontSize: '1rem' }}>데이터가 없습니다.</TableCell></TableRow>
                        ) : (
                          leaderboard.map((row) => {
                            // 🆕 현재 로그인한 사용자 본인 행 강조
                            const isMe = !!userName && String(row.name).trim() === String(userName).trim();
                            return (
                            <TableRow
                              key={row.name}
                              sx={{
                                backgroundColor: isMe
                                  ? '#FFF8E1'                             // 🆕 본인 행: 연노랑
                                  : (row.rank % 2 === 0 ? '#F7F9FC' : 'white'),
                                position: 'relative',
                                ...(isMe && {
                                  boxShadow: 'inset 4px 0 0 #F57C00',     // 🆕 좌측 주황 표시줄
                                  '& td': { fontWeight: 800 },
                                }),
                              }}
                            >
                              <TableCell sx={{ ...cellStyle, ...(isMe && { color: '#E65100' }) }}>
                                {row.rank}
                              </TableCell>
                              <TableCell
                                sx={{
                                  ...cellStyle,
                                  fontWeight: 'bold',
                                  color: isMe ? '#E65100' : '#1565C0',
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.4,
                                }}
                                onClick={() => handlePlayerClick(row)}
                              >
                                {isMe && <Box component="span" sx={{ fontSize: '0.9em' }}>👤</Box>}
                                {dn(row.name)}
                                {isMe && (
                                  <Box component="span" sx={{
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    color: 'white',
                                    bgcolor: '#F57C00',
                                    borderRadius: 99,
                                    px: 0.7, py: 0.1,
                                    ml: 0.2,
                                    letterSpacing: '-0.02em',
                                  }}>
                                    나
                                  </Box>
                                )}
                              </TableCell>
                              <TableCell sx={{ ...cellStyle, color: '#1565C0', fontWeight: 'bold' }}>{Number(row.ability).toFixed(1)}</TableCell>
                              <TableCell sx={cellStyle}>{Number(row.pointRate).toFixed(0)}%</TableCell>
                              <TableCell sx={{ ...cellStyle, color: row.gd >= 0 ? '#D32F2F' : '#1976D2' }}>
                                {row.gd > 0 ? '+' : ''}{Number(row.gd).toFixed(1)}
                              </TableCell>
                              <TableCell sx={cellStyle}>{Number(row.attendance).toFixed(0)}%</TableCell>
                              <TableCell sx={cellStyle}>{Number(row.voteRate).toFixed(0)}%</TableCell>
                            </TableRow>
                            );
                          })
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
                ) : (
                  <>
                    {/* 리그 목록 */}
                    {leagueList.length === 0 ? (
                      <Typography align="center" mt={3} sx={{ color: '#999' }}>진행된 리그가 없습니다.</Typography>
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
                  </>
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
                      { label: '출전률', value: `${mvpData.stats.attendance.toFixed(0)}%`, color: '#80D8FF' },
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

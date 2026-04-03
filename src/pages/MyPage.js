import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../config/firebase';
import { ref, get } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button, Card, CardContent,
  Avatar, Divider, Chip, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import GroupIcon from '@mui/icons-material/Group';
import { signOut } from 'firebase/auth';
import { Radar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, RadialLinearScale, PointElement,
  LineElement, Filler, Tooltip, CategoryScale, LinearScale
} from 'chart.js';
import ForceGraph2D from 'react-force-graph-2d';
import { useAuth } from '../contexts/AuthContext';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, CategoryScale, LinearScale);

/* -- 로스터 추출 헬퍼 -- */
function extractTeamRoster(rosterData, teamName, fallbackKey) {
  if (!rosterData) return [];
  const toArr = v => {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'object') return Object.values(v).filter(Boolean);
    return [v];
  };
  if (rosterData[teamName]) return toArr(rosterData[teamName]);
  const keys = Object.keys(rosterData).sort();
  if (fallbackKey === 'team1' && rosterData[keys[0]]) return toArr(rosterData[keys[0]]);
  if (fallbackKey === 'team2' && keys.length > 1 && rosterData[keys[1]]) return toArr(rosterData[keys[1]]);
  if (keys.length >= 2) {
    return fallbackKey === 'team1' ? toArr(rosterData[keys[0]]) : toArr(rosterData[keys[1]]);
  }
  return [];
}

export default function MyPage() {
  const navigate = useNavigate();
  const { clubName, userName, emailKey, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null);
  const [memberInfo, setMemberInfo] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [matchStats, setMatchStats] = useState(null);
  const [teammates, setTeammates] = useState(null);
  const [weeklyStandings, setWeeklyStandings] = useState(null);
  const [rankThreshold, setRankThreshold] = useState(10);
  const [networkGraph, setNetworkGraph] = useState(null);
  const [allPlayerStats, setAllPlayerStats] = useState(null);
  const [showMoreTeammates, setShowMoreTeammates] = useState({ best: false, worst: false, mostPlayed: false });

  useEffect(() => {
    if (!user) { navigate('/login'); return; }

    const loadData = async () => {
      try {
        // 유저 기본 정보
        const userSnap = await get(ref(db, `Users/${emailKey}`));
        if (userSnap.exists()) {
          setUserInfo(userSnap.val());
        }

        // 회원 상세 정보
        const memberSnap = await get(ref(db, `MemberInfo/${clubName}/${userName}`));
        if (memberSnap.exists()) setMemberInfo(memberSnap.val());

        // 선수 통계 (백업)
        const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${clubName}/${userName}`));
        if (statsSnap.exists()) setPlayerStats(statsSnap.val());

        // 주별 순위 이력 (전체 standings)
        const standingsSnap = await get(ref(db, `PlayerWeeklyStandings/${clubName}`));
        if (standingsSnap.exists()) setWeeklyStandings(standingsSnap.val());

        // 전체 선수 관계도 + 전체 선수 개인 통계
        const [netSnap, allStatsSnap] = await Promise.all([
          get(ref(db, `PlayerNetworkGraph/${clubName}`)),
          get(ref(db, `PlayerDetailStats/${clubName}`)),
        ]);
        if (netSnap.exists()) setNetworkGraph(netSnap.val());
        if (allStatsSnap.exists()) setAllPlayerStats(allStatsSnap.val());

        // 개인별 상세 통계: 백업 데이터 우선, 없으면 실시간 계산
        const detailSnap = await get(ref(db, `PlayerDetailStats/${clubName}/${userName}`));
        if (detailSnap.exists()) {
          const d = detailSnap.val();
          setMatchStats({
            totalGames: d.totalGames,
            totalGoals: d.totalGoals,
            totalAssists: d.totalAssists,
            totalWins: d.totalWins,
            totalLosses: d.totalLosses,
            totalDraws: d.totalDraws,
            totalConceded: d.totalConceded,
            totalCleanSheets: d.totalCleanSheets,
            totalMatchDays: d.totalMatchDays,
            mvpCount: d.mvpCount || 0,
            goalsPerGame: d.goalsPerGame,
            assistsPerGame: d.assistsPerGame,
            concededPerGame: d.concededPerGame,
            goalDiffPerGame: d.goalDiffPerGame,
            winRate: d.winRate,
          });
          if (d.teammates) {
            setTeammates(d.teammates);
          }
        } else {
          // fallback: 실시간 계산
          await calculateFromMatchData(userName);
        }

      } catch (e) {
        console.error('MyPage load error:', e);
      }
      setLoading(false);
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate, emailKey, clubName, userName]);

  /* -- Fallback: 경기 데이터로부터 상세 통계 계산 -- */
  const calculateFromMatchData = async (playerName) => {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.toISOString().slice(0, 10);

      const dailySnap = await get(ref(db, `DailyResultsBackup/${clubName}`));
      if (!dailySnap.exists()) return;

      const dailyData = dailySnap.val();
      const dates = Object.keys(dailyData).filter(d => d >= cutoff).sort();
      if (dates.length === 0) return;

      let totalGames = 0, totalGoals = 0, totalAssists = 0;
      let totalWins = 0, totalLosses = 0, totalDraws = 0;
      let totalConceded = 0, totalCleanSheets = 0;
      let totalMatchDays = 0;
      let mvpCount = 0;
      const teammateMap = {};

      for (const date of dates) {
        totalMatchDays++;
        const rosterSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${date}`));
        const dateSnap = await get(ref(db, `${clubName}/${date}`));
        if (!dateSnap.exists()) continue;

        const dayInfo = dailyData[date];
        if (dayInfo?.dailyMvp === playerName) mvpCount++;
        if (dayInfo?.matches) {
          Object.values(dayInfo.matches).forEach(m => {
            if (m.mvp === playerName) mvpCount++;
          });
        }

        dateSnap.forEach(gameChild => {
          if (!gameChild.key.startsWith('game')) return;
          const g = gameChild.val();
          const s1 = g.goalCount1 || 0;
          const s2 = g.goalCount2 || 0;
          const t1Name = g.team1_name || '';
          const t2Name = g.team2_name || '';

          if (!rosterSnap || !rosterSnap.exists()) return;
          const gameRoster = rosterSnap.child(gameChild.key);
          if (!gameRoster.exists()) return;

          const rosterData = gameRoster.val();
          const team1Players = extractTeamRoster(rosterData, t1Name, 'team1');
          const team2Players = extractTeamRoster(rosterData, t2Name, 'team2');

          let myTeam = null;
          let myScore = 0, oppScore = 0;
          let myTeammates = [];

          if (team1Players.includes(playerName)) {
            myTeam = 'team1'; myScore = s1; oppScore = s2;
            myTeammates = team1Players.filter(n => n !== playerName);
          } else if (team2Players.includes(playerName)) {
            myTeam = 'team2'; myScore = s2; oppScore = s1;
            myTeammates = team2Players.filter(n => n !== playerName);
          } else {
            return;
          }

          totalGames++;
          totalConceded += oppScore;
          if (oppScore === 0) totalCleanSheets++;

          const won = myScore > oppScore;
          const lost = myScore < oppScore;
          if (won) totalWins++;
          else if (lost) totalLosses++;
          else totalDraws++;

          const parseGoalList = (goalList) => {
            if (!goalList) return [];
            return Object.values(goalList).map(str => {
              if (!str || !str.includes('|')) return null;
              const [, rest] = str.split('|');
              if (!rest) return null;
              const [scorer, assist] = rest.split('-');
              return { scorer: scorer?.trim(), assist: assist?.trim() };
            }).filter(Boolean);
          };

          const myGoalList = myTeam === 'team1' ? parseGoalList(g.goalList1) : parseGoalList(g.goalList2);
          myGoalList.forEach(gl => {
            if (gl.scorer === playerName) totalGoals++;
            if (gl.assist === playerName) totalAssists++;
          });

          myTeammates.forEach(tm => {
            if (!teammateMap[tm]) teammateMap[tm] = { games: 0, wins: 0 };
            teammateMap[tm].games++;
            if (won) teammateMap[tm].wins++;
          });
        });
      }

      if (totalGames === 0) return;

      setMatchStats({
        totalGames, totalGoals, totalAssists,
        totalWins, totalLosses, totalDraws,
        totalConceded, totalCleanSheets, totalMatchDays, mvpCount,
        goalsPerGame: (totalGoals / totalGames).toFixed(2),
        assistsPerGame: (totalAssists / totalGames).toFixed(2),
        concededPerGame: (totalConceded / totalGames).toFixed(2),
        goalDiffPerGame: ((totalGoals - totalConceded) / totalGames).toFixed(2),
        winRate: Math.round((totalWins / totalGames) * 100),
      });

      const tmArr = Object.entries(teammateMap)
        .filter(([, v]) => v.games >= 13)
        .map(([name, v]) => ({
          name, games: v.games, wins: v.wins,
          winRate: Math.round((v.wins / v.games) * 100),
        }));

      setTeammates({
        best: [...tmArr].sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 6),
        worst: [...tmArr].sort((a, b) => a.winRate - b.winRate || b.games - a.games).slice(0, 6),
        mostPlayed: [...tmArr].sort((a, b) => b.games - a.games || b.winRate - a.winRate).slice(0, 6),
      });
    } catch (e) {
      console.error('Match data calc error:', e);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  // 육각형 라벨 커스텀 플러그인 -- 항목명 작게 + 수치 크게
  const radarLabelPlugin = useMemo(() => ({
    id: 'customRadarLabels',
    afterDraw(chart) {
      const dataset = chart.data.datasets[0];
      if (!dataset) return;
      const values = dataset.data;
      const labels = chart.data.labels;
      const colors = ['#D32F2F', '#1565C0', '#388E3C', '#F57C00', '#7B1FA2'];
      const { ctx, scales: { r } } = chart;
      if (!r) return;
      const n = labels.length;
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
        const dist = r.drawingArea + 28;
        const x = r.xCenter + Math.cos(angle) * dist;
        const y = r.yCenter + Math.sin(angle) * dist;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '500 11px sans-serif';
        ctx.fillStyle = colors[i];
        ctx.fillText(labels[i], x, y - 10);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = colors[i];
        ctx.fillText(Math.round(Number(values[i])).toString(), x, y + 9);
        ctx.restore();
      }
    }
  }), []);

  // 출석 기준에 따라 내 순위 동적 계산
  const rankHistory = useMemo(() => {
    if (!weeklyStandings || !userName) return null;
    return Object.keys(weeklyStandings).sort().map(weekKey => {
      const weekData = weeklyStandings[weekKey];
      const eligible = Object.entries(weekData)
        .filter(([, p]) => (p.attendanceRate || 0) >= rankThreshold)
        .sort((a, b) => (b[1].abilityScore || 0) - (a[1].abilityScore || 0));
      const myIdx = eligible.findIndex(([n]) => n === userName);
      if (myIdx === -1) return null;
      return { week: weekKey, rank: myIdx + 1, total: eligible.length };
    }).filter(Boolean);
  }, [weeklyStandings, userName, rankThreshold]);

  const graphContainerRef = useRef(null);
  const fgRef = useRef(null);
  const [graphWidth, setGraphWidth] = useState(300);
  const MIN_GAMES = 5;

  useEffect(() => {
    const measure = () => {
      if (graphContainerRef.current) setGraphWidth(graphContainerRef.current.offsetWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [networkGraph]);

  const graphData = useMemo(() => {
    if (!networkGraph) return null;

    const playerSet = new Set();
    Object.keys(networkGraph).forEach(a => {
      playerSet.add(a);
      Object.keys(networkGraph[a]).forEach(b => playerSet.add(b));
    });

    const MIN_NODE_GAMES = 12;
    const eligibleSet = new Set(
      [...playerSet].filter(n => (allPlayerStats?.[n]?.totalGames || 0) > MIN_NODE_GAMES)
    );

    const allGames = [...eligibleSet].map(n => allPlayerStats?.[n]?.totalGames || 0);
    const maxG = Math.max(...allGames, 1);
    const minG = Math.min(...allGames, maxG);

    const drawn = new Set();
    const links = [];
    const connectedNames = new Set();
    let maxEdgeGames = 1;
    Object.values(networkGraph).forEach(conns =>
      Object.values(conns).forEach(d => { if (d.games > maxEdgeGames) maxEdgeGames = d.games; })
    );
    Object.entries(networkGraph).forEach(([a, conns]) => {
      Object.entries(conns).forEach(([b, data]) => {
        const key = [a, b].sort().join('|');
        if (drawn.has(key) || data.games < MIN_GAMES) return;
        if (!eligibleSet.has(a) || !eligibleSet.has(b)) return;
        drawn.add(key);
        connectedNames.add(a);
        connectedNames.add(b);
        const dist = 200 - (data.winRate || 50) * 1.7;
        links.push({ source: a, target: b, games: data.games, winRate: data.winRate, maxEdgeGames, distance: Math.max(dist, 30) });
      });
    });

    const nodes = [...connectedNames].map(name => {
      const s = allPlayerStats?.[name];
      const g = s?.totalGames || 0;
      const wr = s?.winRate ?? 50;
      const size = 3 + Math.pow(wr / 100, 3) * 57;
      const gNorm = (g - minG) / (maxG - minG || 1);
      return { id: name, totalGames: g, winRate: wr, size, gNorm, isMe: name === userName };
    });

    return nodes.length > 0 ? { nodes, links } : null;
  }, [networkGraph, allPlayerStats, userName]);

  if (loading) {
    return (
      <Container sx={{ mt: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  const statRow = (label, value, color) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8 }}>
      <Typography sx={{ color: '#666', fontSize: '0.9rem' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem', color: color || '#333' }}>{value}</Typography>
    </Box>
  );

  /* -- 능력치 기반 실력 등급 계산 (상상~하하, 9단계) -- */
  const getSkillGrade = () => {
    if (!playerStats) return null;
    const avg = (
      (playerStats.finalAttack ?? 50) +
      (playerStats.finalDefense ?? 50) +
      (playerStats.finalStamina ?? 50) +
      (playerStats.finalBalance ?? 50) +
      (playerStats.finalContribution ?? 50)
    ) / 5;
    // 50~98 범위 -> 9단계
    if (avg >= 92) return { label: '상상', color: '#B71C1C' };
    if (avg >= 86) return { label: '상중', color: '#C62828' };
    if (avg >= 80) return { label: '상하', color: '#D32F2F' };
    if (avg >= 74) return { label: '중상', color: '#E65100' };
    if (avg >= 68) return { label: '중중', color: '#F57C00' };
    if (avg >= 62) return { label: '중하', color: '#FFA000' };
    if (avg >= 56) return { label: '하상', color: '#1565C0' };
    if (avg >= 50) return { label: '하중', color: '#1976D2' };
    return { label: '하하', color: '#42A5F5' };
  };
  const skillGrade = getSkillGrade();

  const radarData = playerStats ? {
    labels: ['공격', '수비', '체력', '밸런스', '기여도'],
    datasets: [{
      data: [
        Number((playerStats.finalAttack ?? 50).toFixed(1)),
        Number((playerStats.finalDefense ?? 50).toFixed(1)),
        Number((playerStats.finalStamina ?? 50).toFixed(1)),
        Number((playerStats.finalBalance ?? 50).toFixed(1)),
        Number((playerStats.finalContribution ?? 50).toFixed(1)),
      ],
      backgroundColor: 'rgba(21, 101, 192, 0.2)',
      borderColor: '#1565C0',
      borderWidth: 2,
      pointBackgroundColor: '#1565C0',
      pointRadius: 4,
    }],
  } : null;

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: true,
    layout: { padding: { top: 52, bottom: 44, left: 44, right: 44 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      r: {
        min: 30,
        max: 100,
        ticks: { stepSize: 10, display: false },
        pointLabels: { display: false },
        grid: { color: 'rgba(0,0,0,0.08)' },
        angleLines: { color: 'rgba(0,0,0,0.08)' },
      },
    },
  };

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 10 }}>
      <Container maxWidth="sm" sx={{ pt: 2, px: 2 }}>

        {/* -- 헤더 카드 -- */}
        <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)' }}>
          <CardContent sx={{ py: 3, textAlign: 'center' }}>
            <Avatar sx={{ width: 60, height: 60, mx: 'auto', mb: 1, bgcolor: 'rgba(255,255,255,0.2)' }}>
              <PersonIcon sx={{ fontSize: 35 }} />
            </Avatar>
            <Typography variant="h5" sx={{ color: 'white', fontWeight: 900 }}>
              {userName}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', mt: 0.3 }}>
              {clubName}
            </Typography>
            {memberInfo?.no && (
              <Chip label={`#${memberInfo.no}`} size="small"
                sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 'bold' }} />
            )}
          </CardContent>
        </Card>

        {/* -- 기본 정보 (컴팩트 그리드) -- */}
        <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2 }}>
          {(() => {
            const items = [];
            const birth = userInfo?.birthYear && userInfo.birthYear !== '출생연도'
              ? userInfo.birthYear
              : memberInfo?.birthYear || null;
            if (userInfo?.position && userInfo.position !== '포지션')
              items.push({ label: '포지션', value: userInfo.position });
            if (birth) items.push({ label: '출생', value: birth });
            if (userInfo?.height > 0) items.push({ label: '키', value: `${userInfo.height}cm` });
            if (userInfo?.weight > 0) items.push({ label: '체중', value: `${userInfo.weight}kg` });
            if (memberInfo?.district && memberInfo.district !== '미기재')
              items.push({ label: '지역', value: memberInfo.district });
            if (skillGrade) items.push({ label: '실력', value: skillGrade.label, color: skillGrade.color });

            if (items.length === 0) {
              return <Typography sx={{ color: '#999', textAlign: 'center', py: 1.5, fontSize: '0.85rem' }}>등록된 정보가 없습니다.</Typography>;
            }
            return (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {items.map(item => (
                  <Box key={item.label} sx={{
                    flex: '1 1 calc(33.3% - 8px)', minWidth: 80,
                    textAlign: 'center', py: 1, px: 0.5,
                    borderRadius: 2, bgcolor: '#F5F7FA',
                  }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#999', mb: 0.3 }}>{item.label}</Typography>
                    <Typography sx={{ fontSize: '1.15rem', fontWeight: 'bold', color: item.color || '#333' }}>
                      {item.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            );
          })()}
        </Paper>

        {/* -- 능력치 레이더 차트 -- */}
        {radarData && (
          <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
            <Typography sx={{ fontWeight: 'bold', color: '#1565C0', mb: 1, fontSize: '1rem' }}>
              능력치
            </Typography>
            <Box sx={{ maxWidth: 340, mx: 'auto' }}>
              <Radar data={radarData} options={radarOptions} plugins={[radarLabelPlugin]} />
            </Box>
          </Paper>
        )}

        {/* -- 주별 순위 추이 -- */}
        {rankHistory && rankHistory.length >= 2 && (() => {
          const latest = rankHistory[rankHistory.length - 1];
          const prev = rankHistory[rankHistory.length - 2];
          const diff = prev.rank - latest.rank; // 양수 = 순위 상승
          return (
            <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                  순위 추이
                </Typography>
                <FormControl size="small" sx={{ minWidth: 90 }}>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>최소 출석</InputLabel>
                  <Select
                    value={rankThreshold}
                    label="최소 출석"
                    onChange={e => setRankThreshold(e.target.value)}
                    sx={{ fontSize: '0.8rem', height: 36 }}
                  >
                    {[5, 10, 20, 30, 50].map(v => (
                      <MenuItem key={v} value={v}>{v}%</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography sx={{ fontSize: '0.72rem', color: '#999', mb: 1.5 }}>
                최근 6개월 기준 · 주차별 능력치 순위 · 출석률 {rankThreshold}% 이상 선수 대상
              </Typography>
              {/* 현재 순위 */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#D32F2F', lineHeight: 1 }}>
                    {latest.rank}위
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#999', mt: 0.3 }}>
                    전체 {latest.total}명 중
                  </Typography>
                </Box>
                {diff !== 0 && (
                  <Chip
                    label={diff > 0 ? `▲ ${diff}` : `▼ ${Math.abs(diff)}`}
                    size="small"
                    sx={{
                      bgcolor: diff > 0 ? '#E8F5E9' : '#FFEBEE',
                      color: diff > 0 ? '#388E3C' : '#D32F2F',
                      fontWeight: 'bold', fontSize: '0.8rem',
                    }}
                  />
                )}
              </Box>
              {/* 라인 차트 */}
              <Box sx={{ height: 150 }}>
                <Line
                  plugins={[{
                    id: 'rankDotLabels',
                    afterDatasetsDraw(chart) {
                      const { ctx, data } = chart;
                      const meta = chart.getDatasetMeta(0);
                      const last = data.datasets[0].data.length - 1;
                      meta.data.forEach((point, i) => {
                        const rank = data.datasets[0].data[i];
                        ctx.save();
                        ctx.font = `bold ${i === last ? 11 : 10}px sans-serif`;
                        ctx.fillStyle = i === last ? '#D32F2F' : '#1565C0';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(`${rank}위`, point.x, point.y - 5);
                        ctx.restore();
                      });
                    }
                  }]}
                  data={{
                    labels: rankHistory.map(r => r.week.replace(/\d{4}-/, '')),
                    datasets: [{
                      data: rankHistory.map(r => r.rank),
                      borderColor: '#1565C0',
                      backgroundColor: 'rgba(21,101,192,0.08)',
                      borderWidth: 2,
                      pointRadius: rankHistory.map((r, i) =>
                        i === rankHistory.length - 1 ? 6 : 4
                      ),
                      pointBackgroundColor: rankHistory.map((r, i) =>
                        i === rankHistory.length - 1 ? '#D32F2F' : '#1565C0'
                      ),
                      tension: 0.3,
                      fill: true,
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const r = rankHistory[ctx.dataIndex];
                            return `${r.rank}위 / ${r.total}명`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        reverse: true,
                        min: 1,
                        ticks: {
                          stepSize: 1,
                          callback: (v) => Number.isInteger(v) ? `${v}위` : '',
                          font: { size: 10 },
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                      },
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } },
                      },
                    },
                  }}
                />
              </Box>
            </Paper>
          );
        })()}

        {/* -- 최근 6개월 통계 -- */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
            <SportsSoccerIcon sx={{ color: '#1565C0', mr: 1, fontSize: 20 }} />
            <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
              최근 6개월 통계
            </Typography>
          </Box>

          {matchStats ? (
            <>
              {/* 요약 숫자 카드 */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mb: 1.5 }}>
                {[
                  { label: '출전', value: matchStats.totalGames, color: '#1565C0' },
                  { label: '골', value: matchStats.totalGoals, color: '#D32F2F' },
                  { label: '어시스트', value: matchStats.totalAssists, color: '#F57C00' },
                ].map(item => (
                  <Box key={item.label} sx={{
                    textAlign: 'center', py: 1.2, borderRadius: 2,
                    bgcolor: `${item.color}10`,
                  }}>
                    <Typography sx={{ fontSize: '1.4rem', fontWeight: 'bold', color: item.color }}>
                      {item.value}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#666' }}>{item.label}</Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mb: 1.5 }}>
                {[
                  { label: '승', value: matchStats.totalWins, color: '#388E3C' },
                  { label: '무', value: matchStats.totalDraws, color: '#666' },
                  { label: '패', value: matchStats.totalLosses, color: '#D32F2F' },
                ].map(item => (
                  <Box key={item.label} sx={{
                    textAlign: 'center', py: 1.2, borderRadius: 2,
                    bgcolor: `${item.color}10`,
                  }}>
                    <Typography sx={{ fontSize: '1.4rem', fontWeight: 'bold', color: item.color }}>
                      {item.value}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#666' }}>{item.label}</Typography>
                  </Box>
                ))}
              </Box>

              <Divider sx={{ my: 1 }} />
              {statRow('승률', `${matchStats.winRate}%`, '#7B1FA2')}
              {statRow('클린시트', matchStats.totalCleanSheets, '#388E3C')}
              {matchStats.mvpCount > 0 && statRow('MVP', `${matchStats.mvpCount}회`, '#F57C00')}

              <Divider sx={{ my: 1 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#555', fontSize: '0.85rem', mb: 0.5 }}>
                경기당 기록
              </Typography>
              {statRow('골/경기', matchStats.goalsPerGame, '#D32F2F')}
              {statRow('어시스트/경기', matchStats.assistsPerGame, '#F57C00')}
              {statRow('실점/경기', matchStats.concededPerGame, '#999')}
              {statRow('득실차/경기', matchStats.goalDiffPerGame,
                Number(matchStats.goalDiffPerGame) >= 0 ? '#388E3C' : '#D32F2F')}
            </>
          ) : playerStats ? (
            <>
              {statRow('골', playerStats.goals || 0, '#D32F2F')}
              {statRow('어시스트', playerStats.assists || 0, '#1565C0')}
              {statRow('출전 경기', playerStats.participatedMatches || 0)}
              {statRow('승', playerStats.wins || 0, '#388E3C')}
              {statRow('패', playerStats.losses || 0, '#D32F2F')}
              <Divider sx={{ my: 1 }} />
              {statRow('승률', playerStats.participatedMatches > 0
                ? `${Math.round(((playerStats.wins || 0) / playerStats.participatedMatches) * 100)}%`
                : '0%', '#7B1FA2')}
            </>
          ) : (
            <Typography sx={{ color: '#999', textAlign: 'center', py: 2 }}>통계 데이터가 없습니다.</Typography>
          )}
        </Paper>

        {/* -- 전체 선수 관계도 -- */}
        {graphData && graphData.nodes.length > 0 && (
          <Paper sx={{ borderRadius: 3, mb: 2, boxShadow: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.3 }}>
                <GroupIcon sx={{ color: '#1565C0', mr: 1, fontSize: 20 }} />
                <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                  선수 관계도 (최근 6개월 통계)
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.72rem', color: '#999' }}>
                {MIN_GAMES}경기 이상 함께한 선수 연결 · 드래그/핀치로 탐색
              </Typography>
            </Box>
            <Box ref={graphContainerRef} sx={{ bgcolor: '#ffffff' }}>
              {graphWidth > 0 && (
                <ForceGraph2D
                  ref={fgRef}
                  graphData={graphData}
                  width={graphWidth}
                  height={420}
                  backgroundColor="#ffffff"
                  nodeVal={node => node.size}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const r = Math.sqrt(node.size) * 2.5;
                    const lightness = Math.round(72 - node.gNorm * 42);
                    const nodeColor = `hsl(210,75%,${lightness}%)`;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                    ctx.fillStyle = nodeColor;
                    ctx.fill();
                    const fontSize = Math.max(11 / globalScale, 3);
                    ctx.font = `${node.isMe ? 'bold ' : ''}${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillStyle = node.isMe ? '#D4A017' : '#222';
                    ctx.fillText(node.id, node.x, node.y - r - 2 / globalScale);
                  }}
                  nodeCanvasObjectMode={() => 'replace'}
                  linkWidth={link => 0.5 + (link.games / link.maxEdgeGames) * 3}
                  linkColor={link => {
                    const hue = Math.min(link.winRate * 1.2, 120);
                    return `hsla(${hue},60%,48%,0.35)`;
                  }}
                  d3VelocityDecay={0.3}
                  d3AlphaDecay={0.02}
                  linkDistance={link => link.distance || 100}
                  cooldownTicks={200}
                  onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, py: 1.2, flexWrap: 'wrap' }}>
              {[
                { color: 'hsl(210,75%,72%)', label: '출전 적음' },
                { color: 'hsl(210,75%,30%)', label: '출전 많음' },
              ].map(l => (
                <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: l.color }} />
                  <Typography sx={{ fontSize: '0.7rem', color: '#666' }}>{l.label}</Typography>
                </Box>
              ))}
              <Typography sx={{ fontSize: '0.7rem', color: '#D4A017', fontWeight: 'bold' }}>노란 이름 = 나</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>버블 크기 = 승률</Typography>
            </Box>
          </Paper>
        )}

        {/* -- 함께한 동료 분석 -- */}
        {teammates && (teammates.best.length > 0 || teammates.worst.length > 0) && (
          <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <GroupIcon sx={{ color: '#1565C0', mr: 1, fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                함께한 동료 분석
              </Typography>
            </Box>

            {[
              { key: 'best', label: 'Best 동료 (높은 승률)', color: '#388E3C', bg: '#E8F5E9', list: teammates.best, rightLabel: (tm) => `${tm.winRate}%` },
              { key: 'worst', label: '도전 동료 (낮은 승률)', color: '#D32F2F', bg: '#FFEBEE', list: teammates.worst, rightLabel: (tm) => `${tm.winRate}%` },
              { key: 'mostPlayed', label: '가장 많이 함께한 동료', color: '#1565C0', bg: '#E3F2FD', list: teammates.mostPlayed, rightLabel: (tm) => `${tm.games}경기`, rightSub: (tm) => `승률 ${tm.winRate}%` },
            ].filter(s => s.list && s.list.length > 0).map((section, si) => {
              const expanded = showMoreTeammates[section.key];
              const visible = expanded ? section.list : section.list.slice(0, 3);
              const hasMore = section.list.length > 3;
              return (
                <React.Fragment key={section.key}>
                  {si > 0 && <Divider sx={{ my: 1.5 }} />}
                  <Typography sx={{ fontSize: '0.85rem', color: section.color, fontWeight: 'bold', mb: 0.5 }}>
                    {section.label}
                  </Typography>
                  {visible.map((tm, i) => (
                    <Box key={tm.name} sx={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      py: 0.7, px: 1, borderRadius: 1.5, mb: 0.5,
                      bgcolor: i === 0 && !expanded ? section.bg : 'transparent',
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.85rem', color: '#999', width: 20 }}>{i + 1}</Typography>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: i === 0 && !expanded ? 'bold' : 'normal' }}>
                          {tm.name}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {section.rightSub && (
                          <Typography sx={{ fontSize: '0.8rem', color: '#999' }}>{section.rightSub(tm)}</Typography>
                        )}
                        {!section.rightSub && (
                          <Typography sx={{ fontSize: '0.8rem', color: '#999' }}>{tm.games}경기</Typography>
                        )}
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 'bold', color: section.color }}>
                          {section.rightLabel(tm)}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                  {hasMore && (
                    <Button size="small" fullWidth
                      onClick={() => setShowMoreTeammates(p => ({ ...p, [section.key]: !p[section.key] }))}
                      sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
                      {expanded ? '접기' : `나머지 ${section.list.length - 3}명 더보기`}
                    </Button>
                  )}
                </React.Fragment>
              );
            })}
          </Paper>
        )}

        {/* -- 로그아웃 -- */}
        <Button
          fullWidth
          variant="outlined"
          color="error"
          startIcon={<LogoutIcon />}
          onClick={handleLogout}
          sx={{ borderRadius: 2, py: 1.2, fontWeight: 'bold', mb: 2 }}
        >
          로그아웃
        </Button>
      </Container>

    </Box>
  );
}

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { ref, get } from "firebase/database";
import {
  Container, Paper, Typography, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, CircularProgress, Button,
  useMediaQuery, Chip, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';

function LeaguePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { clubName } = useAuth();

  const { leagueNumber, startDate, endDate } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [leagueTable, setLeagueTable] = useState([]);
  const [playerStats, setPlayerStats] = useState([]);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [sortBy, setSortBy] = useState('attackPts');

  useEffect(() => {
    if (!clubName || !startDate || !endDate) {
      alert("잘못된 접근입니다.");
      navigate('/');
      return;
    }
    window.scrollTo(0, 0);
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    setPlayerLoading(true);
    try {
      const snapshot = await get(ref(db, `DailyResultsBackup/${clubName}`));
      if (!snapshot.exists()) {
        setLeagueTable([]);
        setPlayerStats([]);
        setLoading(false);
        setPlayerLoading(false);
        return;
      }

      const data = snapshot.val();
      const teamStats = {};
      const mvpCounts = {};
      const leagueDates = [];

      // 1. 팀 통계 + MVP 집계 + 리그 기간 날짜 수집
      Object.keys(data).forEach(date => {
        if (date >= startDate && date <= endDate) {
          leagueDates.push(date);
          const dateData = data[date];
          const matches = dateData.matches ? Object.values(dateData.matches) : [];

          // 일간 MVP
          if (dateData.dailyMvp && dateData.dailyMvp !== '없음') {
            mvpCounts[dateData.dailyMvp] = (mvpCounts[dateData.dailyMvp] || 0) + 1;
          }

          matches.forEach(m => {
            const t1 = formatTeamName(m.team1);
            const t2 = formatTeamName(m.team2);
            const s1 = Number(m.score1);
            const s2 = Number(m.score2);

            if (!teamStats[t1]) teamStats[t1] = initTeamStat();
            if (!teamStats[t2]) teamStats[t2] = initTeamStat();

            teamStats[t1].games++; teamStats[t2].games++;
            teamStats[t1].goals += s1; teamStats[t2].goals += s2;
            teamStats[t1].conceded += s2; teamStats[t2].conceded += s1;
            teamStats[t1].gd += (s1 - s2); teamStats[t2].gd += (s2 - s1);

            if (s1 > s2) {
              teamStats[t1].points += 3; teamStats[t1].wins++; teamStats[t2].losses++;
            } else if (s2 > s1) {
              teamStats[t2].points += 3; teamStats[t2].wins++; teamStats[t1].losses++;
            } else {
              teamStats[t1].points += 1; teamStats[t2].points += 1;
              teamStats[t1].draws++; teamStats[t2].draws++;
            }

            // 경기 MVP
            if (m.mvp && m.mvp !== '없음') {
              mvpCounts[m.mvp] = (mvpCounts[m.mvp] || 0) + 1;
            }
          });
        }
      });

      // 팀 순위
      const sortedList = Object.keys(teamStats).map(teamName => ({ teamName, ...teamStats[teamName] }));
      sortedList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.goals - a.goals;
      });
      setLeagueTable(sortedList.map((item, index) => ({ ...item, rank: index + 1 })));
      setLoading(false);

      // 2. 선수별 골/어시스트/출전/승률 집계
      const pStats = {};
      for (const date of leagueDates) {
        const dateSnap = await get(ref(db, `${clubName}/${date}`));
        if (!dateSnap.exists()) continue;

        const rosterSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${date}`));

        dateSnap.forEach(gameChild => {
          if (!gameChild.key.startsWith('game')) return;
          const g = gameChild.val();
          const s1 = g.goalCount1 || 0;
          const s2 = g.goalCount2 || 0;
          const t1Name = g.team1_name || '';
          const t2Name = g.team2_name || '';

          // 골/어시스트 파싱
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

          const goals1 = parseGoalList(g.goalList1);
          const goals2 = parseGoalList(g.goalList2);

          // 골/어시스트 집계
          const addGoal = (name) => {
            if (!name) return;
            if (!pStats[name]) pStats[name] = { goals: 0, assists: 0, games: 0, wins: 0, losses: 0, draws: 0, hatTricks: 0, conceded: 0, cleanSheets: 0 };
            pStats[name].goals++;
          };
          const addAssist = (name) => {
            if (!name || name === '없음') return;
            if (!pStats[name]) pStats[name] = { goals: 0, assists: 0, games: 0, wins: 0, losses: 0, draws: 0, hatTricks: 0, conceded: 0, cleanSheets: 0 };
            pStats[name].assists++;
          };

          goals1.forEach(g2 => { addGoal(g2.scorer); addAssist(g2.assist); });
          goals2.forEach(g2 => { addGoal(g2.scorer); addAssist(g2.assist); });

          // 해트트릭 체크
          const goalCountByPlayer = {};
          [...goals1, ...goals2].forEach(g2 => {
            if (g2.scorer) goalCountByPlayer[g2.scorer] = (goalCountByPlayer[g2.scorer] || 0) + 1;
          });
          Object.entries(goalCountByPlayer).forEach(([name, cnt]) => {
            if (cnt >= 3 && pStats[name]) pStats[name].hatTricks++;
          });

          // 로스터로 출전/승패 집계
          if (rosterSnap && rosterSnap.exists()) {
            const gameRoster = rosterSnap.child(gameChild.key);
            if (gameRoster.exists()) {
              const rosterData = gameRoster.val();
              const team1Players = extractTeamRoster(rosterData, t1Name, 'team1');
              const team2Players = extractTeamRoster(rosterData, t2Name, 'team2');

              const addGameResult = (name, teamScore, opponentScore) => {
                if (!pStats[name]) pStats[name] = { goals: 0, assists: 0, games: 0, wins: 0, losses: 0, draws: 0, hatTricks: 0, conceded: 0, cleanSheets: 0 };
                pStats[name].games++;
                pStats[name].conceded += opponentScore;
                if (opponentScore === 0) pStats[name].cleanSheets++;
                if (teamScore > opponentScore) pStats[name].wins++;
                else if (teamScore < opponentScore) pStats[name].losses++;
                else pStats[name].draws++;
              };

              team1Players.forEach(name => addGameResult(name, s1, s2));
              team2Players.forEach(name => addGameResult(name, s2, s1));
            }
          }
        });
      }

      // MVP 합치기 & 최종 배열
      const playerArray = Object.entries(pStats).map(([name, s]) => ({
        name,
        goals: s.goals,
        assists: s.assists,
        attackPts: s.goals + s.assists,
        mvp: mvpCounts[name] || 0,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        winRate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0,
        hatTricks: s.hatTricks,
        gpg: s.games > 0 ? (s.goals / s.games).toFixed(2) : '0.00',
        conceded: s.conceded,
        cleanSheets: s.cleanSheets,
        concededPG: s.games > 0 ? (s.conceded / s.games).toFixed(2) : '0.00',
      }));

      playerArray.sort((a, b) => b.attackPts - a.attackPts || b.goals - a.goals);
      setPlayerStats(playerArray);
      setPlayerLoading(false);

    } catch (error) {
      console.error("League Load Error:", error);
      setLeagueTable([]);
      setPlayerStats([]);
      setLoading(false);
      setPlayerLoading(false);
    }
  };

  const extractTeamRoster = (rosterData, teamName, teamSide) => {
    const entries = Object.entries(rosterData);
    const tName = (teamName || '').toLowerCase().trim();

    for (const [key, val] of entries) {
      if (key.toLowerCase().trim() === tName) {
        return val ? Object.values(val).filter(Boolean).map(String) : [];
      }
    }
    for (const [key, val] of entries) {
      const k = key.toLowerCase().trim();
      const num = teamSide === 'team1' ? '1' : '2';
      if (k === `team${num}` || k === `team_${num}`) {
        return val ? Object.values(val).filter(Boolean).map(String) : [];
      }
    }
    const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
    const idx = teamSide === 'team1' ? 0 : 1;
    if (sorted[idx]) {
      const val = sorted[idx][1];
      return val ? Object.values(val).filter(Boolean).map(String) : [];
    }
    return [];
  };

  const initTeamStat = () => ({
    points: 0, gd: 0, goals: 0, conceded: 0,
    wins: 0, draws: 0, losses: 0, games: 0
  });

  const formatTeamName = (name) => {
    if (!name) return "";
    const n = name.toString().trim();
    if (n.toUpperCase().startsWith("TEAM")) return n;
    return `Team ${n}`;
  };

  // 정렬
  const sortedPlayers = [...playerStats].sort((a, b) => {
    if (sortBy === 'goals') return b.goals - a.goals || b.attackPts - a.attackPts;
    if (sortBy === 'assists') return b.assists - a.assists || b.attackPts - a.attackPts;
    if (sortBy === 'mvp') return b.mvp - a.mvp || b.attackPts - a.attackPts;
    if (sortBy === 'winRate') return b.winRate - a.winRate || b.games - a.games;
    if (sortBy === 'games') return b.games - a.games;
    if (sortBy === 'cleanSheets') return b.cleanSheets - a.cleanSheets || a.concededPG - b.concededPG;
    if (sortBy === 'concededPG') return parseFloat(a.concededPG) - parseFloat(b.concededPG) || b.cleanSheets - a.cleanSheets;
    return b.attackPts - a.attackPts || b.goals - a.goals;
  });

  // 뱃지 결정
  const getBadges = (player) => {
    const badges = [];
    if (playerStats.length === 0) return badges;

    const maxGoals = Math.max(...playerStats.map(p => p.goals));
    const maxAssists = Math.max(...playerStats.map(p => p.assists));
    const maxMvp = Math.max(...playerStats.map(p => p.mvp));
    const maxGames = Math.max(...playerStats.map(p => p.games));
    const eligibleForWinRate = playerStats.filter(p => p.games >= 3);
    const maxWinRate = eligibleForWinRate.length > 0 ? Math.max(...eligibleForWinRate.map(p => p.winRate)) : 0;

    const eligibleForDefense = playerStats.filter(p => p.games >= 3);
    const maxCleanSheets = eligibleForDefense.length > 0 ? Math.max(...eligibleForDefense.map(p => p.cleanSheets)) : 0;

    if (player.goals > 0 && player.goals === maxGoals) badges.push({ label: '득점왕', color: '#D32F2F' });
    if (player.assists > 0 && player.assists === maxAssists) badges.push({ label: '어시스트왕', color: '#1565C0' });
    if (player.mvp > 0 && player.mvp === maxMvp) badges.push({ label: 'MVP', color: '#F57C00' });
    if (player.games > 0 && player.games === maxGames) badges.push({ label: '출석왕', color: '#388E3C' });
    if (player.games >= 3 && player.winRate === maxWinRate && maxWinRate > 0) badges.push({ label: '승리요정', color: '#7B1FA2' });
    if (player.games >= 3 && player.cleanSheets > 0 && player.cleanSheets === maxCleanSheets) badges.push({ label: '수비왕', color: '#455A64' });
    if (player.hatTricks > 0) badges.push({ label: `해트트릭x${player.hatTricks}`, color: '#C62828' });

    return badges;
  };

  const headerCellStyle = {
    fontWeight: 'bold',
    backgroundColor: '#E9EEF8',
    color: '#111827',
    fontSize: isMobile ? '0.75rem' : '0.85rem',
    textAlign: 'center',
    padding: isMobile ? '6px 3px' : '8px 4px',
    whiteSpace: 'nowrap',
  };

  const cellStyle = {
    fontSize: isMobile ? '0.75rem' : '0.85rem',
    textAlign: 'center',
    padding: isMobile ? '6px 3px' : '8px 4px',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ backgroundColor: '#F0F2F5', minHeight: '100vh', paddingBottom: '50px' }}>
      {/* 상단 헤더 */}
      <Box sx={{ background: 'linear-gradient(135deg, #2D336B 0%, #1a1a4e 100%)', p: 2, mb: 2, display: 'flex', alignItems: 'center' }}>
        <Button onClick={() => navigate(-1)} sx={{ color: 'white', minWidth: 'auto', mr: 2 }}>
          <ArrowBackIcon />
        </Button>
        <Typography variant="h5" sx={{ color: 'white', fontWeight: 'bold' }}>
          제{leagueNumber}회 {clubName} 리그
        </Typography>
      </Box>

      <Container maxWidth="sm" sx={{ px: isMobile ? 1 : 2 }}>
        <Box sx={{ mb: 2, textAlign: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#555' }}>
            기간: {startDate} ~ {endDate}
          </Typography>
        </Box>

        {/* ===== 팀 순위표 ===== */}
        {loading ? (
          <Box display="flex" justifyContent="center" mt={5}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellStyle}>순위</TableCell>
                  <TableCell sx={headerCellStyle}>팀</TableCell>
                  <TableCell sx={headerCellStyle}>승점</TableCell>
                  <TableCell sx={headerCellStyle}>승</TableCell>
                  <TableCell sx={headerCellStyle}>무</TableCell>
                  <TableCell sx={headerCellStyle}>패</TableCell>
                  <TableCell sx={headerCellStyle}>득실</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leagueTable.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3 }}>데이터가 없습니다.</TableCell></TableRow>
                ) : (
                  leagueTable.map((row) => (
                    <TableRow key={row.teamName} sx={{ backgroundColor: row.rank === 1 ? '#FFF8E1' : row.rank <= 3 ? '#FFFDE7' : 'white' }}>
                      <TableCell sx={{ ...cellStyle, fontWeight: 'bold' }}>
                        {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank}
                      </TableCell>
                      <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#1565C0' }}>{row.teamName}</TableCell>
                      <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#D32F2F' }}>{row.points}</TableCell>
                      <TableCell sx={cellStyle}>{row.wins}</TableCell>
                      <TableCell sx={cellStyle}>{row.draws}</TableCell>
                      <TableCell sx={cellStyle}>{row.losses}</TableCell>
                      <TableCell sx={{ ...cellStyle, color: row.gd >= 0 ? 'red' : 'blue' }}>
                        {row.gd > 0 ? '+' : ''}{row.gd}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* ===== 선수별 통계 ===== */}
        <Box sx={{ mt: 4, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#2D336B', mb: 1 }}>
            선수별 통계
          </Typography>

          {/* 정렬 버튼 */}
          <ToggleButtonGroup
            value={sortBy}
            exclusive
            onChange={(e, val) => val && setSortBy(val)}
            size="small"
            sx={{ mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { fontSize: '0.75rem', py: 0.5, px: 1.2 } }}
          >
            <ToggleButton value="attackPts">공격P</ToggleButton>
            <ToggleButton value="goals">골</ToggleButton>
            <ToggleButton value="assists">어시</ToggleButton>
            <ToggleButton value="mvp">MVP</ToggleButton>
            <ToggleButton value="winRate">승률</ToggleButton>
            <ToggleButton value="games">출전</ToggleButton>
            <ToggleButton value="cleanSheets">클린시트</ToggleButton>
            <ToggleButton value="concededPG">실점</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {playerLoading ? (
          <Box display="flex" justifyContent="center" mt={3}>
            <CircularProgress size={28} />
            <Typography sx={{ ml: 2, color: '#888' }}>선수 통계 집계 중...</Typography>
          </Box>
        ) : (
          <>
            {/* 뱃지 요약 카드 */}
            {playerStats.length > 0 && (
              <Box sx={{
                display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, p: 1.5,
                bgcolor: 'white', borderRadius: 2, boxShadow: 1
              }}>
                {playerStats.filter(p => getBadges(p).length > 0).map(p => (
                  getBadges(p).map((b, i) => (
                    <Chip
                      key={`${p.name}-${i}`}
                      label={`${b.label} ${p.name}`}
                      size="small"
                      sx={{
                        bgcolor: b.color, color: 'white', fontWeight: 'bold',
                        fontSize: '0.75rem',
                      }}
                    />
                  ))
                ))}
              </Box>
            )}

            {/* 선수 통계 테이블 - 카테고리별 컬럼 표시 */}
            <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerCellStyle}>#</TableCell>
                    <TableCell sx={headerCellStyle}>이름</TableCell>
                    {/* 공격P 뷰 */}
                    {sortBy === 'attackPts' && <><TableCell sx={headerCellStyle}>골</TableCell><TableCell sx={headerCellStyle}>어시</TableCell><TableCell sx={{ ...headerCellStyle, color: '#D32F2F' }}>공격P</TableCell><TableCell sx={headerCellStyle}>출전</TableCell></>}
                    {/* 골 뷰 */}
                    {sortBy === 'goals' && <><TableCell sx={{ ...headerCellStyle, color: '#D32F2F' }}>골</TableCell><TableCell sx={headerCellStyle}>경기당골</TableCell><TableCell sx={headerCellStyle}>출전</TableCell><TableCell sx={headerCellStyle}>해트트릭</TableCell></>}
                    {/* 어시 뷰 */}
                    {sortBy === 'assists' && <><TableCell sx={{ ...headerCellStyle, color: '#1565C0' }}>어시</TableCell><TableCell sx={headerCellStyle}>골</TableCell><TableCell sx={headerCellStyle}>공격P</TableCell><TableCell sx={headerCellStyle}>출전</TableCell></>}
                    {/* MVP 뷰 */}
                    {sortBy === 'mvp' && <><TableCell sx={{ ...headerCellStyle, color: '#F57C00' }}>MVP</TableCell><TableCell sx={headerCellStyle}>공격P</TableCell><TableCell sx={headerCellStyle}>승률</TableCell><TableCell sx={headerCellStyle}>출전</TableCell></>}
                    {/* 승률 뷰 */}
                    {sortBy === 'winRate' && <><TableCell sx={{ ...headerCellStyle, color: '#388E3C' }}>승률</TableCell><TableCell sx={headerCellStyle}>승</TableCell><TableCell sx={headerCellStyle}>무</TableCell><TableCell sx={headerCellStyle}>패</TableCell><TableCell sx={headerCellStyle}>출전</TableCell></>}
                    {/* 출전 뷰 */}
                    {sortBy === 'games' && <><TableCell sx={headerCellStyle}>출전</TableCell><TableCell sx={headerCellStyle}>승률</TableCell><TableCell sx={headerCellStyle}>공격P</TableCell><TableCell sx={headerCellStyle}>MVP</TableCell></>}
                    {/* 클린시트 뷰 */}
                    {sortBy === 'cleanSheets' && <><TableCell sx={{ ...headerCellStyle, color: '#455A64' }}>클린시트</TableCell><TableCell sx={headerCellStyle}>경기당실점</TableCell><TableCell sx={headerCellStyle}>실점</TableCell><TableCell sx={headerCellStyle}>출전</TableCell></>}
                    {/* 실점 뷰 */}
                    {sortBy === 'concededPG' && <><TableCell sx={headerCellStyle}>경기당실점</TableCell><TableCell sx={headerCellStyle}>실점</TableCell><TableCell sx={{ ...headerCellStyle, color: '#455A64' }}>클린시트</TableCell><TableCell sx={headerCellStyle}>출전</TableCell></>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedPlayers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>데이터가 없습니다.</TableCell></TableRow>
                  ) : (
                    sortedPlayers.map((p, idx) => {
                      const badges = getBadges(p);
                      return (
                        <TableRow
                          key={p.name}
                          sx={{
                            backgroundColor: idx < 3 ? '#FFF8E1' : idx % 2 === 0 ? 'white' : '#FAFAFA',
                            '&:hover': { backgroundColor: '#E3F2FD' },
                          }}
                        >
                          <TableCell sx={{ ...cellStyle, fontWeight: 'bold' }}>{idx + 1}</TableCell>
                          <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#1565C0', textAlign: 'left' }}>
                            {p.name}
                            {badges.length > 0 && (
                              <Box sx={{ display: 'flex', gap: 0.3, mt: 0.3, flexWrap: 'wrap' }}>
                                {badges.map((b, i) => (
                                  <Box key={i} sx={{
                                    fontSize: '0.55rem', bgcolor: b.color, color: 'white',
                                    borderRadius: 0.5, px: 0.5, lineHeight: 1.4, fontWeight: 'bold',
                                  }}>
                                    {b.label}
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </TableCell>

                          {/* 공격P 뷰 */}
                          {sortBy === 'attackPts' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: p.goals > 0 ? 'bold' : 'normal' }}>{p.goals}</TableCell>
                            <TableCell sx={cellStyle}>{p.assists}</TableCell>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#D32F2F' }}>{p.attackPts}</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                          </>}
                          {/* 골 뷰 */}
                          {sortBy === 'goals' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#D32F2F' }}>{p.goals}</TableCell>
                            <TableCell sx={cellStyle}>{p.gpg}</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: p.hatTricks > 0 ? '#C62828' : 'inherit', fontWeight: p.hatTricks > 0 ? 'bold' : 'normal' }}>{p.hatTricks}</TableCell>
                          </>}
                          {/* 어시 뷰 */}
                          {sortBy === 'assists' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#1565C0' }}>{p.assists}</TableCell>
                            <TableCell sx={cellStyle}>{p.goals}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: '#D32F2F' }}>{p.attackPts}</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                          </>}
                          {/* MVP 뷰 */}
                          {sortBy === 'mvp' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#F57C00' }}>{p.mvp}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: '#D32F2F' }}>{p.attackPts}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: p.winRate >= 60 ? '#388E3C' : 'inherit' }}>{p.winRate}%</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                          </>}
                          {/* 승률 뷰 */}
                          {sortBy === 'winRate' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: p.winRate >= 60 ? '#388E3C' : p.winRate <= 30 ? '#D32F2F' : 'inherit' }}>{p.winRate}%</TableCell>
                            <TableCell sx={cellStyle}>{p.wins}</TableCell>
                            <TableCell sx={cellStyle}>{p.draws}</TableCell>
                            <TableCell sx={cellStyle}>{p.losses}</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                          </>}
                          {/* 출전 뷰 */}
                          {sortBy === 'games' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold' }}>{p.games}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: p.winRate >= 60 ? '#388E3C' : 'inherit' }}>{p.winRate}%</TableCell>
                            <TableCell sx={{ ...cellStyle, color: '#D32F2F' }}>{p.attackPts}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: p.mvp > 0 ? '#F57C00' : 'inherit' }}>{p.mvp}</TableCell>
                          </>}
                          {/* 클린시트 뷰 */}
                          {sortBy === 'cleanSheets' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: '#455A64' }}>{p.cleanSheets}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: parseFloat(p.concededPG) <= 1 ? '#388E3C' : parseFloat(p.concededPG) >= 3 ? '#D32F2F' : 'inherit' }}>{p.concededPG}</TableCell>
                            <TableCell sx={cellStyle}>{p.conceded}</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                          </>}
                          {/* 실점 뷰 */}
                          {sortBy === 'concededPG' && <>
                            <TableCell sx={{ ...cellStyle, fontWeight: 'bold', color: parseFloat(p.concededPG) <= 1 ? '#388E3C' : parseFloat(p.concededPG) >= 3 ? '#D32F2F' : 'inherit' }}>{p.concededPG}</TableCell>
                            <TableCell sx={cellStyle}>{p.conceded}</TableCell>
                            <TableCell sx={{ ...cellStyle, color: '#455A64' }}>{p.cleanSheets}</TableCell>
                            <TableCell sx={cellStyle}>{p.games}</TableCell>
                          </>}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Container>
    </div>
  );
}

export default LeaguePage;

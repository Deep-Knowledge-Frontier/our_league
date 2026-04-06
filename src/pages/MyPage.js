import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../config/firebase';
import { ref, get } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button, Card, CardContent,
  Avatar, Divider, Chip, FormControl, InputLabel, Select, MenuItem, LinearProgress
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import GroupIcon from '@mui/icons-material/Group';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StarIcon from '@mui/icons-material/Star';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { signOut } from 'firebase/auth';
import { Radar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, RadialLinearScale, PointElement,
  LineElement, Filler, Tooltip, CategoryScale, LinearScale
} from 'chart.js';
import ForceGraph2D from 'react-force-graph-2d';
import { useAuth } from '../contexts/AuthContext';
import { calcMean, calcStd, calculateArchetype } from '../utils/stats';
import { DEMO_CLUB, createNameMap, anonymize } from '../utils/demo';

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
  const { clubName, userName, emailKey, user, isMaster, viewingClub, setViewingClub, realClubName, authReady } = useAuth();

  const [loading, setLoading] = useState(true);
  const [clubList, setClubList] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [memberInfo, setMemberInfo] = useState(null);
  const [allMembers, setAllMembers] = useState({});
  const [clickedBox, setClickedBox] = useState(null); // 프로필 박스 클릭 상태
  const [demoMode, setDemoMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState('6m');
  const [periodMatchStats, setPeriodMatchStats] = useState(null);
  const statsCache = useRef({});
  const [playerStats, setPlayerStats] = useState(null);
  const [matchStats, setMatchStats] = useState(null);
  const [teammates, setTeammates] = useState(null);
  const [weeklyStandings, setWeeklyStandings] = useState(null);
  const [rankThreshold, setRankThreshold] = useState(10);
  const [networkGraph, setNetworkGraph] = useState(null);
  const [allPlayerStats, setAllPlayerStats] = useState(null);
  const [graphPeriod, setGraphPeriod] = useState('6m');
  const [graphStatsMap, setGraphStatsMap] = useState(null);
  const graphStatsCache = useRef({});
  const [allStatsForRank, setAllStatsForRank] = useState(null);
  const [showMoreTeammates, setShowMoreTeammates] = useState({ best: false, worst: false, mostPlayed: false });
  const [mvpBreakdown, setMvpBreakdown] = useState({ daily: 0, game: 0 });
  const [teamWinCount, setTeamWinCount] = useState(0);
  const [teammatePeriod, setTeammatePeriod] = useState('6m');
  const [teammateLoading, setTeammateLoading] = useState(false);
  const teammateCache = useRef({});

  // 마스터: 클럽 목록 로드
  useEffect(() => {
    if (!isMaster) return;
    (async () => {
      const snap = await get(ref(db, 'clubs'));
      if (snap.exists()) {
        setClubList(Object.keys(snap.val()));
      }
    })();
  }, [isMaster]);

  useEffect(() => {
    if (!authReady) return; // auth 로딩 중이면 대기
    if (!user) { navigate('/login'); return; }
    if (!clubName) return;
    // 클럽 전환 시 기존 데이터 초기화
    setPlayerStats(null);
    setMatchStats(null);
    setTeammates(null);
    setWeeklyStandings(null);
    setNetworkGraph(null);
    setAllPlayerStats(null);
    setAllStatsForRank(null);
    setMemberInfo(null);
    setLoading(true);

    const loadData = async () => {
      try {
        // 유저 기본 정보
        const userSnap = await get(ref(db, `Users/${emailKey}`));
        if (userSnap.exists()) {
          setUserInfo(userSnap.val());
        }

        // 회원 상세 정보 (전체 + 개인)
        const [memberSnap, allMembersSnap] = await Promise.all([
          get(ref(db, `MemberInfo/${clubName}/${userName}`)),
          get(ref(db, `MemberInfo/${clubName}`)),
        ]);
        if (memberSnap.exists()) setMemberInfo(memberSnap.val());
        const allMembersData = allMembersSnap.exists() ? allMembersSnap.val() : {};
        setAllMembers(allMembersData);

        // 선수 통계 (백업) - 개인 + 전체 (순위 계산용)
        const [statsSnap, allRankSnap] = await Promise.all([
          get(ref(db, `PlayerStatsBackup_6m/${clubName}/${userName}`)),
          get(ref(db, `PlayerStatsBackup_6m/${clubName}`)),
        ]);
        if (statsSnap.exists()) setPlayerStats(statsSnap.val());
        if (allRankSnap.exists()) setAllStatsForRank(allRankSnap.val());

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

        // MVP 일별/경기별 분리 + 팀 우승 횟수 계산
        const dailySnap2 = await get(ref(db, `DailyResultsBackup/${clubName}`));
        if (dailySnap2.exists()) {
          const dailyData = dailySnap2.val();
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
          const cutoff = sixMonthsAgo.toISOString().slice(0, 10);
          let dailyMvp = 0, gameMvp = 0, teamWins = 0;

          // 선수-팀 매핑 로드
          const selSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}`));
          const selData = selSnap.exists() ? selSnap.val() : {};

          for (const [date, dayInfo] of Object.entries(dailyData)) {
            if (date < cutoff) continue;
            if (dayInfo?.dailyMvp === userName) dailyMvp++;
            if (dayInfo?.matches) {
              Object.values(dayInfo.matches).forEach(m => {
                if (m.mvp === userName) gameMvp++;
              });
            }
            // 팀 우승 횟수: 일별 1위 팀에 내가 속해있으면 +1
            const matches = dayInfo?.matches ? Object.values(dayInfo.matches) : [];
            if (matches.length > 0) {
              const teamPts = {};
              matches.forEach(m => {
                const t1 = m.team1, t2 = m.team2;
                const s1 = Number(m.score1 || 0), s2 = Number(m.score2 || 0);
                if (!teamPts[t1]) teamPts[t1] = { pts: 0, gd: 0 };
                if (!teamPts[t2]) teamPts[t2] = { pts: 0, gd: 0 };
                teamPts[t1].gd += (s1 - s2); teamPts[t2].gd += (s2 - s1);
                if (s1 > s2) teamPts[t1].pts += 3;
                else if (s2 > s1) teamPts[t2].pts += 3;
                else { teamPts[t1].pts += 1; teamPts[t2].pts += 1; }
              });
              const winner = Object.keys(teamPts).sort((a, b) =>
                teamPts[b].pts !== teamPts[a].pts ? teamPts[b].pts - teamPts[a].pts : teamPts[b].gd - teamPts[a].gd
              )[0];
              // 내가 해당 팀에 속했는지 확인
              if (winner && selData[date]) {
                const att = selData[date]?.AttandPlayer || {};
                for (const [code, players] of Object.entries(att)) {
                  if (!Array.isArray(players)) continue;
                  const winnerCode = winner.replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
                  if (code === winnerCode && players.includes(userName)) {
                    teamWins++;
                    break;
                  }
                }
              }
            }
          }
          setMvpBreakdown({ daily: dailyMvp, game: gameMvp });
          setTeamWinCount(teamWins);
        }

      } catch (e) {
        console.error('MyPage load error:', e);
      }
      setLoading(false);
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate, emailKey, clubName, userName, authReady]);

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

  // 기간별 동료 분석 로드
  const loadTeammatesForPeriod = useCallback(async (period) => {
    if (!clubName || !userName) return;
    if (teammateCache.current[period]) {
      setTeammates(teammateCache.current[period]);
      return;
    }
    setTeammateLoading(true);
    try {
      let cutoff = '';
      if (period === '6m') {
        const d = new Date(); d.setMonth(d.getMonth() - 6);
        cutoff = d.toISOString().slice(0, 10);
      } else if (period === 'season') {
        cutoff = new Date().getFullYear() + '-01-01';
      }
      // cutoff === '' means 'all'

      const dailySnap = await get(ref(db, `DailyResultsBackup/${clubName}`));
      if (!dailySnap.exists()) { setTeammateLoading(false); return; }
      const dailyData = dailySnap.val();
      const dates = Object.keys(dailyData).filter(d => !cutoff || d >= cutoff).sort();
      if (dates.length === 0) { setTeammateLoading(false); return; }

      const tmMap = {};
      const minGames = period === 'all' ? 15 : period === 'season' ? 10 : 13;

      for (const date of dates) {
        const [rosterSnap, dateSnap] = await Promise.all([
          get(ref(db, `PlayerSelectionByDate/${clubName}/${date}`)),
          get(ref(db, `${clubName}/${date}`)),
        ]);
        if (!dateSnap.exists() || !rosterSnap.exists()) continue;

        dateSnap.forEach(gameChild => {
          if (!gameChild.key.startsWith('game')) return;
          const g = gameChild.val();
          const s1 = g.goalCount1 || 0, s2 = g.goalCount2 || 0;
          const t1Name = g.team1_name || '', t2Name = g.team2_name || '';

          const gameRoster = rosterSnap.child(gameChild.key);
          if (!gameRoster.exists()) return;
          const rd = gameRoster.val();
          const t1p = extractTeamRoster(rd, t1Name, 'team1');
          const t2p = extractTeamRoster(rd, t2Name, 'team2');

          let myTeammates = [], won = false;
          if (t1p.includes(userName)) {
            myTeammates = t1p.filter(n => n !== userName);
            won = s1 > s2;
          } else if (t2p.includes(userName)) {
            myTeammates = t2p.filter(n => n !== userName);
            won = s2 > s1;
          } else return;

          myTeammates.forEach(tm => {
            if (!tmMap[tm]) tmMap[tm] = { games: 0, wins: 0 };
            tmMap[tm].games++;
            if (won) tmMap[tm].wins++;
          });
        });
      }

      const tmArr = Object.entries(tmMap)
        .filter(([, v]) => v.games >= minGames)
        .map(([name, v]) => ({
          name, games: v.games, wins: v.wins,
          winRate: Math.round((v.wins / v.games) * 100),
        }));

      const result = {
        best: [...tmArr].sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 6),
        worst: [...tmArr].sort((a, b) => a.winRate - b.winRate || b.games - a.games).slice(0, 6),
        mostPlayed: [...tmArr].sort((a, b) => b.games - a.games || b.winRate - a.winRate).slice(0, 6),
      };
      teammateCache.current[period] = result;
      setTeammates(result);
    } catch (e) {
      console.error('Teammate period load error:', e);
    }
    setTeammateLoading(false);
  }, [clubName, userName]);

  // 기간 변경 시 로드
  useEffect(() => {
    if (!teammates && !loading) return; // 초기 데이터 없으면 스킵
    if (teammatePeriod === '6m' && teammates && !teammateCache.current['6m']) {
      // 초기 로드된 6m 데이터 캐시
      teammateCache.current['6m'] = teammates;
      return;
    }
    loadTeammatesForPeriod(teammatePeriod);
  }, [teammatePeriod, loadTeammatesForPeriod]);

  // 통계 기간별 로드
  const loadStatsForPeriod = useCallback(async (period) => {
    if (!clubName || !userName) return;
    if (statsCache.current[period]) {
      setPeriodMatchStats(statsCache.current[period]);
      return;
    }
    const pathMap = { '6m': 'PlayerDetailStats', 'season': 'PlayerStatsBackup_season', 'all': 'PlayerStatsBackup' };
    try {
      const snap = await get(ref(db, `${pathMap[period]}/${clubName}/${userName}`));
      if (snap.exists()) {
        const d = snap.val();
        const stats = {
          totalGames: d.totalGames || d.participatedMatches || 0,
          totalGoals: d.totalGoals || d.goals || 0,
          totalAssists: d.totalAssists || d.assists || 0,
          totalWins: d.totalWins || d.wins || 0,
          totalLosses: d.totalLosses || d.losses || 0,
          totalDraws: d.totalDraws || d.draws || 0,
          totalConceded: d.totalConceded || d.goalsConceded || 0,
          totalCleanSheets: d.totalCleanSheets || d.cleanSheets || 0,
          mvpCount: d.mvpCount || 0,
          goalsPerGame: d.goalsPerGame || (d.participatedMatches > 0 ? (d.goals / d.participatedMatches).toFixed(2) : '0'),
          assistsPerGame: d.assistsPerGame || (d.participatedMatches > 0 ? (d.assists / d.participatedMatches).toFixed(2) : '0'),
          concededPerGame: d.concededPerGame || (d.participatedMatches > 0 ? (d.goalsConceded / d.participatedMatches).toFixed(2) : '0'),
          goalDiffPerGame: d.goalDiffPerGame || (d.participatedMatches > 0 ? (((d.goals || 0) - (d.goalsConceded || 0)) / d.participatedMatches).toFixed(2) : '0'),
          winRate: d.winRate || (d.participatedMatches > 0 ? Math.round(((d.wins || 0) / d.participatedMatches) * 100) : 0),
        };
        statsCache.current[period] = stats;
        setPeriodMatchStats(stats);
      } else {
        setPeriodMatchStats(null);
      }
    } catch (e) {
      console.error('Stats period load error:', e);
    }
  }, [clubName, userName]);

  useEffect(() => {
    if (statsPeriod === '6m' && matchStats && !statsCache.current['6m']) {
      statsCache.current['6m'] = matchStats;
      setPeriodMatchStats(matchStats);
      return;
    }
    loadStatsForPeriod(statsPeriod);
  }, [statsPeriod, matchStats, loadStatsForPeriod]);

  // 관계도 기간별 스탯 로드
  const loadGraphStats = useCallback(async (period) => {
    if (!clubName) return;
    if (graphStatsCache.current[period]) {
      setGraphStatsMap(graphStatsCache.current[period]);
      return;
    }
    const pathMap = { '6m': 'PlayerDetailStats', 'season': 'PlayerStatsBackup_season', 'all': 'PlayerStatsBackup' };
    try {
      const snap = await get(ref(db, `${pathMap[period]}/${clubName}`));
      const data = snap.exists() ? snap.val() : {};
      graphStatsCache.current[period] = data;
      setGraphStatsMap(data);
    } catch (e) {
      console.error('Graph stats load error:', e);
    }
  }, [clubName]);

  useEffect(() => {
    if (graphPeriod === '6m' && allPlayerStats && !graphStatsCache.current['6m']) {
      graphStatsCache.current['6m'] = allPlayerStats;
      setGraphStatsMap(allPlayerStats);
      return;
    }
    loadGraphStats(graphPeriod);
  }, [graphPeriod, allPlayerStats, loadGraphStats]);

  // 데모 모드: 한강FC 데이터를 익명화해서 보여주기
  const loadDemoData = async () => {
    setDemoLoading(true);
    try {
      const regSnap = await get(ref(db, `registeredPlayers/${DEMO_CLUB}`));
      const realNames = regSnap.exists() ? Object.values(regSnap.val()).map(p => p.name).filter(Boolean) : [];
      const nameMap = createNameMap(realNames);
      // 상위 선수 1명 선택 (데모용)
      const allStatsSnap = await get(ref(db, `PlayerDetailStats/${DEMO_CLUB}`));
      const allRankSnap = await get(ref(db, `PlayerStatsBackup_6m/${DEMO_CLUB}`));
      if (allStatsSnap.exists()) setAllPlayerStats(allStatsSnap.val());
      if (allRankSnap.exists()) setAllStatsForRank(allRankSnap.val());

      // 출전수 많은 선수 1명 골라서 개인 통계로 사용
      const detailData = allStatsSnap.exists() ? allStatsSnap.val() : {};
      const topPlayer = Object.entries(detailData)
        .filter(([, d]) => d.totalGames > 10)
        .sort((a, b) => (b[1].totalGames || 0) - (a[1].totalGames || 0))[0];

      if (topPlayer) {
        const [, d] = topPlayer;
        setMatchStats({
          totalGames: d.totalGames, totalGoals: d.totalGoals, totalAssists: d.totalAssists,
          totalWins: d.totalWins, totalLosses: d.totalLosses, totalDraws: d.totalDraws,
          totalConceded: d.totalConceded, totalCleanSheets: d.totalCleanSheets,
          totalMatchDays: d.totalMatchDays, mvpCount: d.mvpCount || 0,
          goalsPerGame: d.goalsPerGame, assistsPerGame: d.assistsPerGame,
          concededPerGame: d.concededPerGame, goalDiffPerGame: d.goalDiffPerGame, winRate: d.winRate,
        });
        if (d.teammates) {
          // 동료 이름 익명화
          const anonTeammates = {};
          ['best', 'worst', 'mostPlayed'].forEach(key => {
            if (Array.isArray(d.teammates[key])) {
              anonTeammates[key] = d.teammates[key].map(t => ({
                ...t, name: anonymize(t.name, nameMap),
              }));
            }
          });
          setTeammates(anonTeammates);
        }
      }

      // 선수 통계 (레이더 차트용)
      const rankData = allRankSnap.exists() ? allRankSnap.val() : {};
      if (topPlayer && rankData[topPlayer[0]]) {
        setPlayerStats(rankData[topPlayer[0]]);
      }

      // 관계도
      const netSnap = await get(ref(db, `PlayerNetworkGraph/${DEMO_CLUB}`));
      if (netSnap.exists()) setNetworkGraph(netSnap.val());

      setDemoMode(true);
    } catch (e) {
      console.error('Demo load error:', e);
    }
    setDemoLoading(false);
  };

  const hasData = matchStats || playerStats;

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

  // 현재 순위: PlayerStatsBackup_6m 기준 (ResultsPage와 동일)
  const currentRank = useMemo(() => {
    if (!allStatsForRank || !userName) return null;
    const eligible = Object.entries(allStatsForRank)
      .filter(([, p]) => (p.attendanceRate || 0) >= rankThreshold)
      .sort((a, b) => (b[1].abilityScore || 0) - (a[1].abilityScore || 0));
    const myIdx = eligible.findIndex(([n]) => n === userName);
    if (myIdx === -1) return null;
    return { rank: myIdx + 1, total: eligible.length };
  }, [allStatsForRank, userName, rankThreshold]);

  // 주차별 순위 추이 (차트용) + 마지막에 현재 순위 반영
  const rankHistory = useMemo(() => {
    if (!weeklyStandings || !userName) return null;
    const history = Object.keys(weeklyStandings).sort().map(weekKey => {
      const weekData = weeklyStandings[weekKey];
      const eligible = Object.entries(weekData)
        .filter(([, p]) => (p.attendanceRate || 0) >= rankThreshold)
        .sort((a, b) => (b[1].abilityScore || 0) - (a[1].abilityScore || 0));
      const myIdx = eligible.findIndex(([n]) => n === userName);
      if (myIdx === -1) return null;
      return { week: weekKey, rank: myIdx + 1, total: eligible.length };
    }).filter(Boolean);
    // 현재 순위로 마지막 포인트 교체/추가 (차트와 현재 순위 일치)
    if (currentRank && history.length > 0) {
      const lastWeek = history[history.length - 1].week;
      const now = new Date();
      const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      const yr = tmp.getUTCFullYear();
      const ys = new Date(Date.UTC(yr, 0, 1));
      const wn = Math.ceil(((tmp - ys) / 86400000 + 1) / 7);
      const curWeek = `${yr}-W${String(wn).padStart(2, '0')}`;
      if (curWeek === lastWeek) {
        history[history.length - 1] = { week: curWeek, ...currentRank };
      } else {
        history.push({ week: curWeek, ...currentRank });
      }
    }
    return history;
  }, [weeklyStandings, userName, rankThreshold, currentRank]);

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
    const statsMap = graphStatsMap || allPlayerStats;

    const playerSet = new Set();
    Object.keys(networkGraph).forEach(a => {
      playerSet.add(a);
      Object.keys(networkGraph[a]).forEach(b => playerSet.add(b));
    });

    const getGames = (n) => statsMap?.[n]?.totalGames || statsMap?.[n]?.participatedMatches || 0;
    const MIN_NODE_GAMES = graphPeriod === 'all' ? 15 : graphPeriod === 'season' ? 8 : 12;
    const eligibleSet = new Set(
      [...playerSet].filter(n => getGames(n) > MIN_NODE_GAMES)
    );

    const allGames = [...eligibleSet].map(n => getGames(n));
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

    const wrList = [...connectedNames].map(name => {
      const s = statsMap?.[name];
      return s?.winRate ?? (s?.pointRate ? Math.round(s.pointRate) : 50);
    });
    const avgWr = wrList.length > 0 ? wrList.reduce((a, b) => a + b, 0) / wrList.length : 50;

    const nodes = [...connectedNames].map(name => {
      const g = getGames(name);
      const s = statsMap?.[name];
      const wr = s?.winRate ?? (s?.pointRate ? Math.round(s.pointRate) : 50);
      const baseSize = 3 + Math.pow(wr / 100, 3) * 57;
      const scale = wr >= avgWr ? 1.2 : 0.8;
      const size = baseSize * scale;
      const gNorm = (g - minG) / (maxG - minG || 1);
      return { id: name, totalGames: g, winRate: wr, size, gNorm, isMe: name === userName };
    });

    return nodes.length > 0 ? { nodes, links } : null;
  }, [networkGraph, graphStatsMap, allPlayerStats, userName, graphPeriod]);

  // 선수 아키타입 (선수순위와 동일한 calculateArchetype 사용)
  const playerAnalysis = useMemo(() => {
    if (!allStatsForRank || !userName || !matchStats) return null;
    const myStats = allStatsForRank[userName];
    if (!myStats) return null;

    const goals = Number(myStats.goals || 0);
    const participated = Number(myStats.participatedMatches || 0);
    let attRate = Number(myStats.attendanceRate || 0);
    if (attRate <= 1.0) attRate *= 100;
    const avgDiff = Number(myStats.avgGoalDiffPerGame || 0);

    // 전체 선수 기준 env 계산
    const gpgList = [], diffList = [];
    Object.values(allStatsForRank).forEach(p => {
      const pm = Number(p.participatedMatches || 0);
      if (pm > 0) {
        gpgList.push(Number(p.goals || 0) / pm);
        diffList.push(Number(p.avgGoalDiffPerGame || 0));
      }
    });
    const env = {
      meanGpg: calcMean(gpgList), stdGpg: calcStd(gpgList),
      meanDiff: calcMean(diffList), stdDiff: calcStd(diffList),
    };

    const archetype = calculateArchetype(goals, participated, attRate, avgDiff, env);

    // 보조 특징/개선점
    const atk = playerStats?.finalAttack ?? 50;
    const def = playerStats?.finalDefense ?? 50;
    const stm = playerStats?.finalStamina ?? 50;
    const bal = playerStats?.finalBalance ?? 50;
    const con = playerStats?.finalContribution ?? 50;
    const statsList = [
      { key: '공격', val: atk }, { key: '수비', val: def },
      { key: '체력', val: stm }, { key: '밸런스', val: bal }, { key: '기여도', val: con },
    ].sort((a, b) => b.val - a.val);
    const best = statsList[0];
    const weak = statsList[statsList.length - 1];
    const gpg = Number(matchStats.goalsPerGame || 0);
    const apg = Number(matchStats.assistsPerGame || 0);

    const traits = [];
    if (best.val >= 75) traits.push(`${best.key}(${best.val.toFixed(0)}) 최고`);
    if (gpg >= 0.4) traits.push(`경기당 ${gpg}골`);
    else if (apg >= 0.3) traits.push(`경기당 ${apg} 어시`);
    if ((matchStats.winRate || 0) >= 55) traits.push(`승률 ${matchStats.winRate}%`);

    const improve = [];
    if (weak.val < 65) improve.push(`${weak.key} 향상 필요`);
    if ((matchStats.winRate || 0) < 40) improve.push('승률 개선');

    return { ...archetype, traits, improve, ability: Number(myStats.abilityScore || 0) };
  }, [allStatsForRank, userName, matchStats, playerStats]);

  // 프로필 퍼센타일 계산
  const profilePercentiles = useMemo(() => {
    const result = {};
    // 실력 퍼센타일
    if (allPlayerStats && playerStats && userName) {
      const all = Object.entries(allPlayerStats);
      if (all.length >= 3) {
        const myAvg = ((playerStats.finalAttack ?? 50) + (playerStats.finalDefense ?? 50) +
          (playerStats.finalStamina ?? 50) + (playerStats.finalBalance ?? 50) +
          (playerStats.finalContribution ?? 50)) / 5;
        const allAvgs = all.map(([n]) => allStatsForRank?.[n]?.abilityScore || 0).filter(v => v > 0);
        if (allAvgs.length > 0) {
          const below = allAvgs.filter(v => v <= myAvg).length;
          result.ability = Math.round((below / allAvgs.length) * 100);
        }
      }
    }
    // 나이 퍼센타일
    if (allMembers && userName) {
      const myBirth = userInfo?.birthYear && userInfo.birthYear !== '출생연도'
        ? Number(userInfo.birthYear)
        : Number(memberInfo?.birthYear || 0);
      if (myBirth > 0) {
        const currentYear = new Date().getFullYear();
        const myAge = currentYear - myBirth;
        const allAges = Object.values(allMembers)
          .map(m => Number(m.birthYear || 0))
          .filter(y => y > 0)
          .map(y => currentYear - y);
        if (allAges.length >= 3) {
          // 나이가 적을수록(젊을수록) 상위
          const younger = allAges.filter(a => a >= myAge).length;
          result.age = Math.round((younger / allAges.length) * 100);
          result.ageValue = myAge;
          result.ageTotal = allAges.length;
        }
      }
    }
    return result;
  }, [allPlayerStats, allStatsForRank, playerStats, userName, allMembers, userInfo, memberInfo]);

  // 주간 운세 (이름 + 주차 해시 기반, 직장/가족/건강)
  const weeklyFortune = useMemo(() => {
    if (!userName) return null;
    const now = new Date();
    const weekNum = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
    let hash = 0;
    for (let i = 0; i < userName.length; i++) hash = ((hash << 5) - hash + userName.charCodeAt(i)) | 0;
    hash = Math.abs(hash + weekNum * 31);

    const luckScore = (hash % 30) + 70; // 70~99

    const work = [
      '직장에서 인정받는 한 주! 적극적으로 의견을 내보세요.',
      '업무 효율이 높아지는 주간, 밀린 일을 처리하기 좋아요.',
      '동료와의 협업이 빛나는 한 주입니다.',
      '새로운 프로젝트에 도전하면 좋은 성과가 기대돼요.',
      '차분하게 계획을 세우면 큰 성과가 따라올 거예요.',
      '리더십을 발휘할 기회가 찾아오는 한 주입니다.',
      '꼼꼼한 마무리가 빛을 발하는 주간이에요.',
      '회의에서 좋은 아이디어가 떠오르는 한 주!',
    ];
    const family = [
      '가족과 함께하는 시간이 행복을 가져다주는 주간.',
      '오랜만에 가족에게 안부를 전해보세요. 따뜻한 한 주가 될 거예요.',
      '가정에 화목한 기운이 넘치는 한 주입니다.',
      '아이들과 함께 운동하면 좋은 에너지를 얻을 수 있어요.',
      '가족과의 대화에서 좋은 영감을 받는 한 주!',
      '주말에 가족 나들이를 계획해보세요.',
      '감사한 마음을 표현하면 관계가 더 깊어지는 주간.',
      '가족의 응원이 큰 힘이 되는 한 주입니다.',
    ];
    const health = [
      '체력이 좋은 한 주! 운동 강도를 높여보세요.',
      '수분 섭취를 신경 쓰면 컨디션이 좋아질 거예요.',
      '스트레칭으로 부상을 예방하는 것이 중요한 주간.',
      '규칙적인 수면이 경기력 향상의 열쇠입니다.',
      '이번 주는 무리하지 말고 컨디션 관리에 집중!',
      '가벼운 조깅으로 체력을 유지하면 좋은 한 주.',
      '건강한 식단이 활력을 가져다주는 주간이에요.',
      '충분한 휴식이 최고의 보약인 한 주입니다.',
    ];

    return {
      score: luckScore,
      emoji: luckScore >= 90 ? '🔥' : luckScore >= 80 ? '⭐' : luckScore >= 70 ? '✨' : '💪',
      work: work[hash % work.length],
      family: family[(hash >> 3) % family.length],
      health: health[(hash >> 6) % health.length],
    };
  }, [userName]);

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

        {/* -- 마스터 관리자: 클럽 전환 -- */}
        {isMaster && clubList.length > 0 && (
          <Paper sx={{ borderRadius: 3, p: 2, mb: 2, boxShadow: 2, bgcolor: '#FFF8E1', border: '1px solid #FFE082' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#F57F17', mb: 1 }}>
              🔑 마스터 관리자
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>클럽 조회</InputLabel>
              <Select
                value={viewingClub || realClubName}
                label="클럽 조회"
                onChange={(e) => {
                  const val = e.target.value;
                  setViewingClub(val === realClubName ? '' : val);
                }}
                sx={{ bgcolor: 'white', fontWeight: 700 }}
              >
                {clubList.map(c => (
                  <MenuItem key={c} value={c}>
                    {c}{c === realClubName ? ' (내 클럽)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {viewingClub && viewingClub !== realClubName && (
              <Chip
                label={`${viewingClub} 조회 중`}
                onDelete={() => setViewingClub('')}
                sx={{ mt: 1, bgcolor: '#FF9800', color: 'white', fontWeight: 700 }}
              />
            )}
          </Paper>
        )}

        {/* 데모 모드 배너 */}
        {demoMode && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 2, py: 0.8, borderRadius: 2, bgcolor: '#FFF3E0', border: '1px solid #FFE0B2' }}>
            <Typography sx={{ fontSize: '0.82rem', color: '#E65100', fontWeight: 700 }}>샘플 데이터를 보고 있습니다</Typography>
            <Button size="small" onClick={() => { setDemoMode(false); setMatchStats(null); setPlayerStats(null); setTeammates(null); setNetworkGraph(null); setAllPlayerStats(null); setAllStatsForRank(null); }}
              sx={{ fontSize: '0.75rem', color: '#E65100', fontWeight: 700, minWidth: 'auto' }}>닫기</Button>
          </Box>
        )}

        {/* 데이터 없을 때 샘플 보기 */}
        {!loading && !hasData && !demoMode && (
          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 2, textAlign: 'center' }}>
            <CardContent sx={{ py: 3 }}>
              <SportsSoccerIcon sx={{ fontSize: 40, color: '#ccc', mb: 1 }} />
              <Typography sx={{ color: '#888', fontSize: '0.95rem', mb: 0.5 }}>아직 경기 데이터가 없습니다</Typography>
              <Typography sx={{ color: '#bbb', fontSize: '0.78rem', mb: 2 }}>샘플 데이터로 미리 확인해보세요</Typography>
              <Button variant="contained" onClick={loadDemoData} disabled={demoLoading}
                startIcon={demoLoading ? <CircularProgress size={16} color="inherit" /> : <EmojiEventsIcon />}
                sx={{ borderRadius: 2, fontWeight: 700, px: 3, background: 'linear-gradient(135deg, #F57C00, #E65100)' }}>
                {demoLoading ? '로딩중...' : '샘플 데이터 보기'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* -- 기본 정보 (유리 박스, 한 줄) -- */}
        {(() => {
          const birth = userInfo?.birthYear && userInfo.birthYear !== '출생연도'
            ? Number(userInfo.birthYear) : Number(memberInfo?.birthYear || 0);
          const age = birth > 0 ? new Date().getFullYear() - birth : null;
          const position = userInfo?.position && userInfo.position !== '포지션' ? userInfo.position : null;
          const district = memberInfo?.district && memberInfo.district !== '미기재' ? memberInfo.district : null;
          const items = [
            position && { key: 'pos', label: '포지션', value: position },
            age && { key: 'age', label: '나이', value: `${age}세`,
              clickInfo: profilePercentiles.age != null ? `등록선수 중 상위 ${100 - profilePercentiles.age}%` : null },
            district && { key: 'area', label: '지역', value: district },
            skillGrade && { key: 'skill', label: '실력', value: skillGrade.label, color: skillGrade.color },
          ].filter(Boolean);
          if (items.length === 0) return null;
          return (
            <Box sx={{ display: 'flex', gap: 0.8, mb: 2 }}>
              {items.map(item => (
                <Box key={item.key}
                  onClick={() => {
                    if (item.clickInfo) setClickedBox(prev => prev === item.key ? null : item.key);
                    else setClickedBox(item.key);
                    setTimeout(() => setClickedBox(null), 1200);
                  }}
                  sx={{
                    flex: 1, textAlign: 'center', py: 1, px: 0.5,
                    borderRadius: 2.5, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.6)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
                    transition: 'all 0.2s',
                    animation: clickedBox === item.key ? 'glassShake 0.4s ease' : 'none',
                    '@keyframes glassShake': {
                      '0%': { transform: 'translateX(0)' },
                      '15%': { transform: 'translateX(-3px) rotate(-1deg)' },
                      '30%': { transform: 'translateX(3px) rotate(1deg)' },
                      '45%': { transform: 'translateX(-2px) rotate(-0.5deg)' },
                      '60%': { transform: 'translateX(2px) rotate(0.5deg)' },
                      '75%': { transform: 'translateX(-1px)' },
                      '100%': { transform: 'translateX(0)' },
                    },
                    '&:active': { transform: 'scale(0.95)' },
                  }}>
                  <Typography sx={{ fontSize: '0.65rem', color: '#aaa', mb: 0.1 }}>{item.label}</Typography>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: item.color || '#333', lineHeight: 1.3 }}>
                    {clickedBox === item.key && item.clickInfo ? '' : item.value}
                  </Typography>
                  {clickedBox === item.key && item.clickInfo && (
                    <Typography sx={{ fontSize: '0.72rem', color: '#1565C0', fontWeight: 700, lineHeight: 1.3 }}>
                      {item.clickInfo}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          );
        })()}

        {/* -- 능력치 + AI 분석 통합 카드 -- */}
        {radarData && (
          <Paper sx={{ borderRadius: 3, mb: 2, boxShadow: 2, overflow: 'hidden' }}>
            {/* 선수 아키타입 헤더 (선수순위와 동일 데이터) */}
            {playerAnalysis && (
              <Box sx={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                p: 2, pb: 1.5,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.8 }}>
                  <Box>
                    <Typography sx={{ color: playerAnalysis.color, fontWeight: 900, fontSize: '1.2rem', lineHeight: 1.2 }}>
                      {playerAnalysis.title}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', mt: 0.2 }}>
                      {playerAnalysis.desc}
                    </Typography>
                  </Box>
                  {playerAnalysis.ability > 0 && (
                    <Box sx={{ textAlign: 'center', ml: 1 }}>
                      <Typography sx={{ fontSize: '1.8rem', fontWeight: 900, color: '#FFD700', lineHeight: 1 }}>
                        {playerAnalysis.ability.toFixed(1)}
                      </Typography>
                      <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>OVR</Typography>
                    </Box>
                  )}
                </Box>
                {(playerAnalysis.traits.length > 0 || playerAnalysis.improve.length > 0) && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
                    {playerAnalysis.traits.map((t, i) => (
                      <Chip key={`t${i}`} label={t} size="small"
                        sx={{ fontSize: '0.68rem', height: 20, bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.1)' }} />
                    ))}
                    {playerAnalysis.improve.map((t, i) => (
                      <Chip key={`i${i}`} label={t} size="small"
                        sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'rgba(255,183,77,0.15)', color: '#FFB74D', border: '1px solid rgba(255,183,77,0.2)' }} />
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {/* 레이더 차트 */}
            <Box sx={{ p: 2.5, pt: playerAnalysis ? 1.5 : 2.5 }}>
              {!playerAnalysis && (
                <Typography sx={{ fontWeight: 'bold', color: '#1565C0', mb: 1, fontSize: '1rem' }}>
                  능력치
                </Typography>
              )}
              <Box sx={{ maxWidth: 340, mx: 'auto' }}>
                <Radar data={radarData} options={radarOptions} plugins={[radarLabelPlugin]} />
              </Box>
            </Box>

            {/* 주간 운세 */}
            {weeklyFortune && (
              <Box sx={{
                mx: 2.5, mb: 2, p: 1.5, borderRadius: 2.5,
                background: 'linear-gradient(135deg, #FFF8E1, #FFFDE7)',
                border: '1px solid #FFE082',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.9rem' }}>{weeklyFortune.emoji}</Typography>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#E65100' }}>이번 주 운세</Typography>
                  </Box>
                  <Chip label={`행운 ${weeklyFortune.score}점`} size="small"
                    sx={{ fontSize: '0.7rem', height: 22, fontWeight: 800,
                      bgcolor: weeklyFortune.score >= 85 ? '#FF6F00' : '#FFA000',
                      color: 'white' }} />
                </Box>
                {[
                  { icon: '💼', label: '직장', text: weeklyFortune.work },
                  { icon: '👨‍👩‍👧‍👦', label: '가족', text: weeklyFortune.family },
                  { icon: '💪', label: '건강', text: weeklyFortune.health },
                ].map(f => (
                  <Box key={f.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.4 }}>
                    <Typography sx={{ fontSize: '0.75rem', flexShrink: 0 }}>{f.icon}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: '#BF360C', fontWeight: 700, flexShrink: 0 }}>{f.label}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#5D4037' }}>{f.text}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        )}

        {/* -- 주별 순위 추이 -- */}
        {(currentRank || (rankHistory && rankHistory.length >= 2)) && (() => {
          const prevRank = rankHistory && rankHistory.length >= 2 ? rankHistory[rankHistory.length - 2].rank : null;
          const displayRank = currentRank || (rankHistory ? rankHistory[rankHistory.length - 1] : null);
          if (!displayRank) return null;
          const diff = prevRank ? prevRank - displayRank.rank : 0;

          // 순위 변동 사유 계산 (역산 포함)
          let rankReason = null;
          if (weeklyStandings && rankHistory && rankHistory.length >= 2 && allStatsForRank) {
            const prevWeekKey = rankHistory[rankHistory.length - 2].week;
            const prevData = weeklyStandings[prevWeekKey]?.[userName];
            const curData = allStatsForRank[userName];
            if (prevData && curData) {
              const changes = [];
              const abDiff = +(curData.abilityScore || 0).toFixed(1) - +(prevData.abilityScore || 0).toFixed(1);

              if (prevData.pointRate != null) {
                // 백업 후: 정확한 비교
                const prDiff = +(curData.pointRate || 0).toFixed(1) - +(prevData.pointRate).toFixed(1);
                if (Math.abs(prDiff) >= 0.5) changes.push({ label: '승률', value: `${prDiff > 0 ? '+' : ''}${prDiff.toFixed(1)}%`, positive: prDiff > 0 });
                const gdDiff = +(curData.avgGoalDiffPerGame || 0).toFixed(2) - +(prevData.avgGoalDiffPerGame || 0).toFixed(2);
                if (Math.abs(gdDiff) >= 0.01) changes.push({ label: '득실', value: `${gdDiff > 0 ? '+' : ''}${gdDiff.toFixed(2)}`, positive: gdDiff > 0 });
              } else {
                // 역산: 정규화 범위로 출석 기여분 추정 → 나머지 = 승률·득실 기여
                const eligible = Object.values(allStatsForRank).filter(p => (p.attendanceRate || 0) >= 30 && (p.participatedMatches || 0) > 0);
                if (eligible.length >= 2) {
                  const atVals = eligible.map(p => p.attendanceRate || 0);
                  const mnAt = Math.min(...atVals), mxAt = Math.max(...atVals);
                  const normAt = (v) => mxAt > mnAt ? 60 + Math.max(0, Math.min(1, (v - mnAt) / (mxAt - mnAt))) * 40 : 80;
                  const atContrib = (normAt(curData.attendanceRate || 0) - normAt(prevData.attendanceRate || 0)) * 0.15;
                  const prGdContrib = abDiff - atContrib;
                  if (Math.abs(prGdContrib) >= 0.1) changes.push({ label: '승률·득실', value: `${prGdContrib > 0 ? '+' : ''}${prGdContrib.toFixed(1)}`, positive: prGdContrib > 0 });
                }
              }
              const atDiff = +(curData.attendanceRate || 0).toFixed(1) - +(prevData.attendanceRate || 0).toFixed(1);
              if (Math.abs(atDiff) >= 0.5) changes.push({ label: '출전', value: `${atDiff > 0 ? '+' : ''}${atDiff.toFixed(1)}%`, positive: atDiff > 0 });

              if (changes.length > 0 || Math.abs(abDiff) >= 0.1) {
                rankReason = { changes, abDiff, prevScore: +(prevData.abilityScore || 0).toFixed(1), curScore: +(curData.abilityScore || 0).toFixed(1) };
              }
            }
          }
          return (
            <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                  순위 추이
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <FormControl size="small" sx={{ minWidth: 75 }}>
                    <Select
                      value={rankThreshold}
                      onChange={e => setRankThreshold(e.target.value)}
                      sx={{ fontSize: '0.75rem', height: 28 }}
                    >
                      {[5, 10, 20, 30, 50].map(v => (
                        <MenuItem key={v} value={v} sx={{ fontSize: '0.8rem' }}>{v}%</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.72rem', color: '#999', mb: 1.5 }}>
                최근 6개월 기준 · 주차별 능력치 순위 · 출전률 {rankThreshold}% 이상 선수 대상
              </Typography>
              {/* 현재 순위 */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#D32F2F', lineHeight: 1 }}>
                    {displayRank.rank}위
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#999', mt: 0.3 }}>
                    전체 {displayRank.total}명 중
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
              {/* 순위 변동 사유 */}
              {rankReason && (
                <Box sx={{ bgcolor: '#F5F7FA', borderRadius: 2, p: 1.5, mb: 2 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#666', mb: 0.5, fontWeight: 600 }}>
                    지난 주 대비 변동 사유
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#333' }}>
                      능력치 {rankReason.prevScore} → {rankReason.curScore}
                    </Typography>
                    <Chip
                      label={rankReason.abDiff > 0 ? `+${rankReason.abDiff.toFixed(1)}` : rankReason.abDiff.toFixed(1)}
                      size="small"
                      sx={{
                        height: 20, fontSize: '0.7rem', fontWeight: 'bold',
                        bgcolor: rankReason.abDiff > 0 ? '#E8F5E9' : rankReason.abDiff < 0 ? '#FFEBEE' : '#F5F5F5',
                        color: rankReason.abDiff > 0 ? '#388E3C' : rankReason.abDiff < 0 ? '#D32F2F' : '#999',
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {rankReason.changes.map((c, i) => (
                      <Chip key={i} label={`${c.label} ${c.value}`} size="small" variant="outlined"
                        sx={{
                          height: 22, fontSize: '0.7rem', fontWeight: 600,
                          borderColor: c.positive ? '#A5D6A7' : '#EF9A9A',
                          color: c.positive ? '#2E7D32' : '#C62828',
                          bgcolor: c.positive ? '#F1F8E9' : '#FFF3F3',
                        }} />
                    ))}
                  </Box>
                </Box>
              )}
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

        {/* -- 통계 -- */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <SportsSoccerIcon sx={{ color: '#1565C0', mr: 1, fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>통계</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.3 }}>
              {[
                { value: '6m', label: '6개월' },
                { value: 'season', label: `${new Date().getFullYear()}` },
                { value: 'all', label: '전체' },
              ].map(p => (
                <Chip key={p.value} label={p.label} size="small"
                  onClick={() => setStatsPeriod(p.value)}
                  sx={{
                    fontSize: '0.7rem', height: 24, fontWeight: statsPeriod === p.value ? 700 : 400,
                    bgcolor: statsPeriod === p.value ? '#1565C0' : '#f0f0f0',
                    color: statsPeriod === p.value ? 'white' : '#888',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: statsPeriod === p.value ? '#1565C0' : '#e0e0e0' },
                  }} />
              ))}
            </Box>
          </Box>

          {(periodMatchStats || matchStats) ? (() => {
            const ms = periodMatchStats || matchStats;
            const totalGames = ms.totalGames || 1;
            const winPct = ms.totalWins / totalGames;
            const drawPct = ms.totalDraws / totalGames;
            const lossPct = ms.totalLosses / totalGames;

            const statBarRow = (icon, label, value, max, color, suffix = '') => (
              <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {icon}
                    <Typography sx={{ fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{label}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 800, color }}>{value}{suffix}</Typography>
                </Box>
                <LinearProgress variant="determinate" value={max > 0 ? Math.min((value / max) * 100, 100) : 0}
                  sx={{ height: 6, borderRadius: 3, bgcolor: '#f0f0f0',
                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 } }} />
              </Box>
            );

            return (
              <>
                {/* 핵심 지표 카드 */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mb: 2 }}>
                  {[
                    { label: '출전', value: ms.totalGames, color: '#1565C0', icon: <SportsSoccerIcon sx={{ fontSize: 18 }} /> },
                    { label: '골', value: ms.totalGoals, color: '#D32F2F', icon: '⚽' },
                    { label: '어시스트', value: ms.totalAssists, color: '#F57C00', icon: '🅰️' },
                  ].map(item => (
                    <Box key={item.label} sx={{
                      textAlign: 'center', py: 1.2, borderRadius: 2.5,
                      background: `linear-gradient(135deg, ${item.color}15 0%, ${item.color}08 100%)`,
                      border: `1px solid ${item.color}20`,
                    }}>
                      <Typography sx={{ fontSize: '1.6rem', fontWeight: 900, color: item.color, lineHeight: 1.2 }}>
                        {item.value}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>{item.label}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* 승/무/패 비율 바 */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.8rem', color: '#388E3C', fontWeight: 700 }}>
                      {ms.totalWins}승
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>
                      {ms.totalDraws}무
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: '#D32F2F', fontWeight: 700 }}>
                      {ms.totalLosses}패
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: '#f0f0f0' }}>
                    <Box sx={{ width: `${winPct * 100}%`, bgcolor: '#388E3C', transition: 'width 0.5s' }} />
                    <Box sx={{ width: `${drawPct * 100}%`, bgcolor: '#BDBDBD', transition: 'width 0.5s' }} />
                    <Box sx={{ width: `${lossPct * 100}%`, bgcolor: '#EF5350', transition: 'width 0.5s' }} />
                  </Box>
                  <Box sx={{ textAlign: 'center', mt: 0.5 }}>
                    <Typography sx={{ fontSize: '0.85rem', color: '#7B1FA2', fontWeight: 800 }}>
                      승률 {ms.winRate}%
                    </Typography>
                  </Box>
                </Box>

                {/* MVP & 팀 우승 하이라이트 */}
                {(mvpBreakdown.daily > 0 || mvpBreakdown.game > 0 || teamWinCount > 0) && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: teamWinCount > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 1, mb: 2 }}>
                    {mvpBreakdown.daily > 0 && (
                      <Box sx={{
                        textAlign: 'center', py: 1.2, borderRadius: 2.5,
                        background: 'linear-gradient(135deg, #FFF8E1, #FFF3E0)',
                        border: '1px solid #FFE0B2',
                      }}>
                        <EmojiEventsIcon sx={{ color: '#F57C00', fontSize: 22, mb: 0.3 }} />
                        <Typography sx={{ fontSize: '1.3rem', fontWeight: 900, color: '#E65100' }}>{mvpBreakdown.daily}</Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: '#999', fontWeight: 600 }}>일별 MVP</Typography>
                      </Box>
                    )}
                    {mvpBreakdown.game > 0 && (
                      <Box sx={{
                        textAlign: 'center', py: 1.2, borderRadius: 2.5,
                        background: 'linear-gradient(135deg, #FFF8E1, #FFFDE7)',
                        border: '1px solid #FFF9C4',
                      }}>
                        <StarIcon sx={{ color: '#FFA000', fontSize: 22, mb: 0.3 }} />
                        <Typography sx={{ fontSize: '1.3rem', fontWeight: 900, color: '#FF8F00' }}>{mvpBreakdown.game}</Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: '#999', fontWeight: 600 }}>경기별 MVP</Typography>
                      </Box>
                    )}
                    {teamWinCount > 0 && (
                      <Box sx={{
                        textAlign: 'center', py: 1.2, borderRadius: 2.5,
                        background: 'linear-gradient(135deg, #E8F5E9, #F1F8E9)',
                        border: '1px solid #C8E6C9',
                      }}>
                        <WorkspacePremiumIcon sx={{ color: '#388E3C', fontSize: 22, mb: 0.3 }} />
                        <Typography sx={{ fontSize: '1.3rem', fontWeight: 900, color: '#2E7D32' }}>{teamWinCount}</Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: '#999', fontWeight: 600 }}>팀 우승</Typography>
                      </Box>
                    )}
                  </Box>
                )}

                <Divider sx={{ my: 1 }} />

                {/* 프로그레스 바 기반 상세 기록 */}
                {statBarRow(
                  <SportsSoccerIcon sx={{ fontSize: 16, color: '#D32F2F' }} />,
                  '골/경기', Number(ms.goalsPerGame), 2, '#D32F2F'
                )}
                {statBarRow(
                  <Typography sx={{ fontSize: 14, lineHeight: 1 }}>🅰️</Typography>,
                  '어시/경기', Number(ms.assistsPerGame), 2, '#F57C00'
                )}
                {statBarRow(
                  <MilitaryTechIcon sx={{ fontSize: 16, color: '#388E3C' }} />,
                  '클린시트', ms.totalCleanSheets, totalGames, '#388E3C'
                )}

                <Divider sx={{ my: 1 }} />
                {statRow('실점/경기', ms.concededPerGame, '#999')}
                {statRow('득실차/경기', ms.goalDiffPerGame,
                  Number(ms.goalDiffPerGame) >= 0 ? '#388E3C' : '#D32F2F')}
              </>
            );
          })() : playerStats ? (
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <GroupIcon sx={{ color: '#1565C0', mr: 1, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                    선수 관계도
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.3 }}>
                  {[
                    { value: '6m', label: '6개월' },
                    { value: 'season', label: `${new Date().getFullYear()}` },
                    { value: 'all', label: '전체' },
                  ].map(p => (
                    <Chip key={p.value} label={p.label} size="small"
                      onClick={() => setGraphPeriod(p.value)}
                      sx={{
                        fontSize: '0.7rem', height: 24, fontWeight: graphPeriod === p.value ? 700 : 400,
                        bgcolor: graphPeriod === p.value ? '#1565C0' : '#f0f0f0',
                        color: graphPeriod === p.value ? 'white' : '#888',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: graphPeriod === p.value ? '#1565C0' : '#e0e0e0' },
                      }} />
                  ))}
                </Box>
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
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    // 흰색 테두리 (글자 모양대로)
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 3 / globalScale;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(node.id, node.x, node.y);
                    // 글자 채우기
                    ctx.fillStyle = node.isMe ? '#1B5E20' : '#222';
                    ctx.fillText(node.id, node.x, node.y);
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
              <Typography sx={{ fontSize: '0.7rem', color: '#1B5E20', fontWeight: 'bold' }}>녹색 이름 = 나</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>버블 크기 = 승률</Typography>
            </Box>
          </Paper>
        )}

        {/* -- 함께한 동료 분석 -- */}
        {teammates && (teammates.best.length > 0 || teammates.worst.length > 0) && (
          <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <GroupIcon sx={{ color: '#1565C0', mr: 1, fontSize: 20 }} />
                <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                  함께한 동료 분석
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.3 }}>
                {[
                  { value: '6m', label: '6개월' },
                  { value: 'season', label: `${new Date().getFullYear()}` },
                  { value: 'all', label: '전체' },
                ].map(p => (
                  <Chip key={p.value} label={p.label} size="small"
                    onClick={() => setTeammatePeriod(p.value)}
                    sx={{
                      fontSize: '0.7rem', height: 24, fontWeight: teammatePeriod === p.value ? 700 : 400,
                      bgcolor: teammatePeriod === p.value ? '#1565C0' : '#f0f0f0',
                      color: teammatePeriod === p.value ? 'white' : '#888',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: teammatePeriod === p.value ? '#1565C0' : '#e0e0e0' },
                    }} />
                ))}
              </Box>
            </Box>

            {teammateLoading ? (
              <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={24} /></Box>
            ) : [
              { key: 'best', label: 'Best 동료', sub: '높은 승률', color: '#388E3C', bg: '#E8F5E9', accent: '#2E7D32', icon: '🔥' },
              { key: 'worst', label: '도전 동료', sub: '낮은 승률', color: '#D32F2F', bg: '#FFEBEE', accent: '#C62828', icon: '💪' },
              { key: 'mostPlayed', label: '단짝 동료', sub: '최다 출전', color: '#1565C0', bg: '#E3F2FD', accent: '#0D47A1', icon: '🤝' },
            ].filter(s => teammates[s.key] && teammates[s.key].length > 0).map((section, si) => {
              const list = teammates[section.key];
              const expanded = showMoreTeammates[section.key];
              const visible = expanded ? list : list.slice(0, 3);
              const hasMore = list.length > 3;
              const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
              return (
                <React.Fragment key={section.key}>
                  {si > 0 && <Divider sx={{ my: 1.5 }} />}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <Typography sx={{ fontSize: '1rem' }}>{section.icon}</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: section.color, fontWeight: 800 }}>
                      {section.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#999' }}>({section.sub})</Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                    {visible.map((tm, i) => {
                      const isTop = i === 0;
                      const barValue = section.key === 'mostPlayed'
                        ? (tm.games / (list[0]?.games || 1)) * 100
                        : tm.winRate;
                      return (
                        <Box key={tm.name} sx={{
                          p: 1, borderRadius: 2.5, textAlign: 'center',
                          bgcolor: isTop ? section.bg : '#FAFAFA',
                          border: isTop ? `1.5px solid ${section.color}30` : '1px solid #f0f0f0',
                        }}>
                          {/* 메달 */}
                          {i < 3 ? (
                            <Box sx={{
                              width: 26, height: 26, borderRadius: '50%', mx: 'auto', mb: 0.5,
                              bgcolor: medalColors[i], display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: isTop ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                            }}>
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: 'white' }}>{i + 1}</Typography>
                            </Box>
                          ) : (
                            <Typography sx={{ fontSize: '0.8rem', color: '#bbb', fontWeight: 600, mb: 0.5 }}>{i + 1}</Typography>
                          )}
                          {/* 이름 */}
                          <Typography sx={{
                            fontSize: '0.85rem', fontWeight: isTop ? 800 : 500,
                            color: isTop ? section.accent : '#333', mb: 0.5,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {tm.name}
                          </Typography>
                          {/* 핵심 수치 */}
                          <Typography sx={{ fontSize: '1.2rem', fontWeight: 900, color: section.color, lineHeight: 1.2 }}>
                            {section.key === 'mostPlayed' ? tm.games : `${tm.winRate}%`}
                          </Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: '#999', mb: 0.5 }}>
                            {section.key === 'mostPlayed' ? '경기' : '승률'}
                          </Typography>
                          {/* 프로그레스 바 */}
                          <Box sx={{ height: 4, borderRadius: 2, bgcolor: '#e8e8e8', overflow: 'hidden', mx: 0.5 }}>
                            <Box sx={{
                              width: `${Math.min(barValue, 100)}%`, height: '100%',
                              bgcolor: section.color, borderRadius: 2,
                              opacity: isTop ? 1 : 0.5,
                            }} />
                          </Box>
                          {/* 보조 정보 */}
                          <Typography sx={{ fontSize: '0.6rem', color: '#bbb', mt: 0.3 }}>
                            {section.key === 'mostPlayed' ? `승률 ${tm.winRate}%` : `${tm.games}경기`}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                  {hasMore && (
                    <Button size="small" fullWidth
                      onClick={() => setShowMoreTeammates(p => ({ ...p, [section.key]: !p[section.key] }))}
                      sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999', borderRadius: 2 }}>
                      {expanded ? '접기' : `나머지 ${list.length - 3}명 더보기`}
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

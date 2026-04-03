import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { ref, get, set, push, remove, update } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button,
  TextField, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip, Select, MenuItem, FormControl, InputLabel,
  Divider, Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PeopleIcon from '@mui/icons-material/People';
import SecurityIcon from '@mui/icons-material/Security';
import BackupIcon from '@mui/icons-material/Backup';
import PlaceIcon from '@mui/icons-material/Place';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EventIcon from '@mui/icons-material/Event';
import HistoryIcon from '@mui/icons-material/History';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/app.config';

export default function AdminPage() {
  const navigate = useNavigate();
  const { clubName, isAdmin, isMaster, user, emailKey, loading: authLoading, authReady } = useAuth();
  const canAccess = isAdmin || isMaster;

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  // 마스터 전용: 팀 관리
  const [clubsList, setClubsList] = useState([]);
  const [newClubName, setNewClubName] = useState('');
  const [clubsExpanded, setClubsExpanded] = useState(false);

  // 경기일 관리
  const [matchDates, setMatchDates] = useState([]);
  const [matchDialog, setMatchDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [matchForm, setMatchForm] = useState({ date: '', time: '', location: '', address: '' });
  const [locationPreset, setLocationPreset] = useState('custom');
  const [showPast, setShowPast] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const [expandPerms, setExpandPerms] = useState(false);
  const [expandPlayers, setExpandPlayers] = useState(false);
  const [expandLeagues, setExpandLeagues] = useState(false);

  // 권한 관리
  const [allowedUsers, setAllowedUsers] = useState([]);

  // 선수 관리
  const [players, setPlayers] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');

  // 권한 추가 다이얼로그
  const [permDialog, setPermDialog] = useState(false);
  const [permName, setPermName] = useState('');
  const [permRole, setPermRole] = useState('verified');

  // 리그 관리
  const [leagues, setLeagues] = useState([]);
  const [leagueDialog, setLeagueDialog] = useState(false);
  const [editingLeague, setEditingLeague] = useState(null);
  const [leagueForm, setLeagueForm] = useState({ leagueName: '', startDate: '', endDate: '' });

  // 백업
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupResults, setBackupResults] = useState([]);

  /* ── 경기일 로드 ── */
  const loadMatchDates = useCallback(async () => {
    const snap = await get(ref(db, `MatchDates/${clubName}`));
    if (!snap.exists()) { setMatchDates([]); return; }
    const data = snap.val();
    const arr = Object.keys(data).map(key => ({
      dateKey: key,
      time: data[key].time || '',
      location: data[key].location || '',
      address: data[key].address || data[key].location || '',
    })).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    setMatchDates(arr);
  }, [clubName]);

  /* ── 권한 관리 ── */
  const loadAllowedUsers = useCallback(async () => {
    const snap = await get(ref(db, 'AllowedUsers'));
    if (!snap.exists()) { setAllowedUsers([]); return; }
    const data = snap.val();
    const arr = [];
    for (const role of ['admin', 'moderator', 'verified']) {
      if (!data[role]) continue;
      Object.entries(data[role]).forEach(([ek, val]) => {
        arr.push({
          emailKey: ek,
          name: val.name || ek.replace(/,/g, '.'),
          email: val.email || ek.replace(/,/g, '.'),
          role,
        });
      });
    }
    setAllowedUsers(arr);
  }, []);

  /* ── 선수 관리 ── */
  const loadPlayers = useCallback(async () => {
    const snap = await get(ref(db, `registeredPlayers/${clubName}`));
    if (!snap.exists()) { setPlayers([]); return; }
    const data = snap.val();
    const arr = Object.entries(data).map(([key, val]) => ({
      key,
      name: val.name || '',
      date: val.date || '',
    })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    setPlayers(arr);
  }, [clubName]);

  /* ── 리그 관리 ── */
  const loadLeagues = useCallback(async () => {
    const snap = await get(ref(db, `LeagueMaker/${clubName}`));
    if (!snap.exists()) { setLeagues([]); return; }
    const data = snap.val();
    const arr = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    arr.sort((a, b) => Number(b.id) - Number(a.id));
    setLeagues(arr);
  }, [clubName]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) { navigate('/login'); return; }
    if (!canAccess) { setLoading(false); return; }

    const loadData = async () => {
      try {
        // 이름
        const userSnap = await get(ref(db, `Users/${emailKey}`));
        if (userSnap.exists()) setUserName(userSnap.val().name || '');

        // 마스터: 팀 목록 로드
        if (isMaster) {
          const clubsSnap = await get(ref(db, 'clubs'));
          if (clubsSnap.exists()) {
            const data = clubsSnap.val();
            setClubsList(Object.entries(data).map(([key, val]) => ({ key, ...val })));
          }
        }

        // 관리자: 팀 데이터 로드
        if (isAdmin || isMaster) {
          await Promise.all([loadMatchDates(), loadAllowedUsers(), loadPlayers(), loadLeagues()]);
        }
      } catch (e) {
        console.error('AdminPage load error:', e);
      }
      setLoading(false);
    };
    loadData();
  }, [authReady, user, canAccess, isAdmin, isMaster, emailKey, navigate, loadMatchDates, loadAllowedUsers, loadPlayers, loadLeagues]);

  /* ── 경기일 저장 ── */
  const saveMatchDate = async () => {
    if (!matchForm.date) return;
    const data = {
      time: matchForm.time,
      location: matchForm.location,
      address: matchForm.address || matchForm.location,
      isActive: true,
      updatedAt: Date.now(),
    };

    if (editingMatch && editingMatch.dateKey !== matchForm.date) {
      await remove(ref(db, `MatchDates/${clubName}/${editingMatch.dateKey}`));
    }
    await set(ref(db, `MatchDates/${clubName}/${matchForm.date}`), data);
    setMatchDialog(false);
    setEditingMatch(null);
    await loadMatchDates();
  };

  const deleteMatchDate = async (dateKey) => {
    if (!window.confirm(`${dateKey} 경기일을 삭제하시겠습니까?`)) return;
    await remove(ref(db, `MatchDates/${clubName}/${dateKey}`));
    await loadMatchDates();
  };

  const openMatchEdit = (item) => {
    setEditingMatch(item);
    setMatchForm({
      date: item.dateKey,
      time: item.time,
      location: item.location,
      address: item.address,
    });
    const preset = APP_CONFIG.locationPresets.find(p => p.name === item.location);
    setLocationPreset(preset ? item.location : 'custom');
    setMatchDialog(true);
  };

  const openMatchAdd = () => {
    setEditingMatch(null);
    setMatchForm({ date: '', time: '', location: '', address: '' });
    setLocationPreset('custom');
    setMatchDialog(true);
  };

  const addPermission = async () => {
    if (!permName.trim()) return;
    // Users에서 이름으로 검색
    const usersSnap = await get(ref(db, 'Users'));
    if (!usersSnap.exists()) { alert('사용자를 찾을 수 없습니다.'); return; }
    let foundKey = null, foundEmail = null;
    usersSnap.forEach(child => {
      if (child.val().name === permName.trim()) {
        foundKey = child.key;
        foundEmail = child.key.replace(/,/g, '.');
      }
    });
    if (!foundKey) { alert('해당 이름의 사용자를 찾을 수 없습니다.'); return; }

    await set(ref(db, `AllowedUsers/${permRole}/${foundKey}`), {
      name: permName.trim(),
      email: foundEmail,
    });
    setPermDialog(false);
    setPermName('');
    await loadAllowedUsers();
  };

  const removePermission = async (u) => {
    if (!window.confirm(`${u.name} (${u.role})을 삭제하시겠습니까?`)) return;
    await remove(ref(db, `AllowedUsers/${u.role}/${u.emailKey}`));
    await loadAllowedUsers();
  };

  const addPlayer = async () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (players.some(p => p.name === name)) { alert('이미 등록된 선수입니다.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    await push(ref(db, `registeredPlayers/${clubName}`), { name, date: today });
    setNewPlayerName('');
    await loadPlayers();
  };

  const removePlayer = async (player) => {
    if (!window.confirm(`${player.name}을(를) 삭제하시겠습니까?`)) return;
    await remove(ref(db, `registeredPlayers/${clubName}/${player.key}`));
    await loadPlayers();
  };

  const openLeagueAdd = () => {
    setEditingLeague(null);
    const nextId = leagues.length > 0 ? String(Math.max(...leagues.map(l => Number(l.id))) + 1) : '1';
    setLeagueForm({ id: nextId, leagueName: `${clubName} 리그`, startDate: '', endDate: '' });
    setLeagueDialog(true);
  };

  const openLeagueEdit = (league) => {
    setEditingLeague(league);
    setLeagueForm({
      id: league.id,
      leagueName: league.leagueName || '',
      startDate: league.startDate || '',
      endDate: league.endDate || '',
    });
    setLeagueDialog(true);
  };

  const saveLeague = async () => {
    if (!leagueForm.startDate || !leagueForm.endDate) return;
    const id = editingLeague ? editingLeague.id : leagueForm.id;
    await set(ref(db, `LeagueMaker/${clubName}/${id}`), {
      leagueName: leagueForm.leagueName || `${clubName} 리그`,
      startDate: leagueForm.startDate,
      endDate: leagueForm.endDate,
    });
    setLeagueDialog(false);
    setEditingLeague(null);
    await loadLeagues();
  };

  const deleteLeague = async (league) => {
    if (!window.confirm(`제${league.id}회 리그를 삭제하시겠습니까?`)) return;
    await remove(ref(db, `LeagueMaker/${clubName}/${league.id}`));
    await loadLeagues();
  };

  /* ── 기록 백업 ── */
  const runBackup = async () => {
    if (!window.confirm('전체 기록 백업을 실행하시겠습니까?\n(통계 계산, 데이터 백업 등)')) return;
    setBackupRunning(true);
    setBackupResults([]);
    const results = [];

    try {
      // 1) 클럽 데이터 백업
      const clubSnap = await get(ref(db, clubName));
      if (clubSnap.exists()) {
        await set(ref(db, `${clubName}_backup`), clubSnap.val());
        results.push({ name: '클럽 데이터 백업', ok: true });
      } else {
        results.push({ name: '클럽 데이터 백업', ok: false, msg: '데이터 없음' });
      }

      // 2) PlayerSelectionByDate 백업
      const psbdSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}`));
      if (psbdSnap.exists()) {
        await set(ref(db, `PlayerSelectionByDateBackup/${clubName}`), psbdSnap.val());
        results.push({ name: '선수 선발 백업', ok: true });
      } else {
        results.push({ name: '선수 선발 백업', ok: false, msg: '데이터 없음' });
      }

      // 3) DailyResultsBackup + MVP 재계산 (Android DailyResultsBackupHelper 로직 동일)
      const dailySnap = await get(ref(db, clubName));
      const selectionSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}`));
      const abilitySnap = await get(ref(db, `PlayerStatsBackup_6m/${clubName}`));

      // 능력치 맵 구성
      const abilityMap = {};
      if (abilitySnap.exists()) {
        Object.entries(abilitySnap.val()).forEach(([name, data]) => {
          abilityMap[name] = data.abilityScore || 0;
        });
      }

      const selectionData = selectionSnap.exists() ? selectionSnap.val() : {};

      // 골 기록 파싱 헬퍼
      const parseGoalRecord = (record) => {
        if (!record || typeof record !== 'string') return null;
        let scorer = null, assister = null;
        if (record.includes('|')) {
          const parts = record.split('|');
          if (parts.length >= 2) {
            const content = parts[1].trim();
            if (content.includes('-')) {
              const inner = content.split('-');
              scorer = inner[0].trim();
              if (inner.length > 1) assister = inner[1].trim();
            } else { scorer = content; }
          }
        } else { scorer = record.trim(); }
        return { scorer, assister };
      };

      // 팀 선수 목록 추출
      const getPlayersList = (teamData) => {
        if (!teamData) return [];
        if (Array.isArray(teamData)) return teamData.filter(Boolean).map(s => String(s).trim());
        if (typeof teamData === 'object') return Object.values(teamData).filter(Boolean).map(s => String(s).trim());
        return [];
      };

      if (dailySnap.exists()) {
        const clubData = dailySnap.val();
        const dates = Object.keys(clubData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
        const dailyResults = {};
        const gameUpdates = {};

        for (const date of dates) {
          const dateData = clubData[date];
          const games = Object.keys(dateData).filter(k => k.startsWith('game')).sort();
          if (games.length === 0) continue;

          const matchResults = [];
          const dailyAggPoints = {};

          for (const gameKey of games) {
            const g = dateData[gameKey];
            const t1 = g.team1_name || 'A', t2 = g.team2_name || 'B';
            const s1 = g.goalCount1 || 0, s2 = g.goalCount2 || 0;

            // 팀 선수 목록
            const gameSel = selectionData[date]?.[gameKey];
            let p1, p2;
            if (gameSel) {
              p1 = getPlayersList(gameSel[t1] || gameSel[`Team ${t1}`]);
              p2 = getPlayersList(gameSel[t2] || gameSel[`Team ${t2}`]);
            } else {
              const att = selectionData[date]?.AttandPlayer;
              p1 = getPlayersList(att?.[t1]);
              p2 = getPlayersList(att?.[t2]);
            }

            // 포인트 집계 (골1 + 어시1)
            const matchPoints = {}, matchGoals = {};
            const allGoals = [...(Array.isArray(g.goalList1) ? g.goalList1 : []), ...(Array.isArray(g.goalList2) ? g.goalList2 : [])];
            allGoals.forEach(record => {
              const parsed = parseGoalRecord(record);
              if (!parsed) return;
              if (parsed.scorer) { matchPoints[parsed.scorer] = (matchPoints[parsed.scorer] || 0) + 1; matchGoals[parsed.scorer] = (matchGoals[parsed.scorer] || 0) + 1; }
              if (parsed.assister && parsed.assister !== '없음') { matchPoints[parsed.assister] = (matchPoints[parsed.assister] || 0) + 1; }
            });

            // 일별 합산
            Object.entries(matchPoints).forEach(([k, v]) => { dailyAggPoints[k] = (dailyAggPoints[k] || 0) + v; });

            // 경기별 MVP: 이긴 팀 선수 중 포인트 → 골 → 능력치
            let candidates = s1 > s2 ? [...p1] : s2 > s1 ? [...p2] : [...p1, ...p2];
            let mvp = '없음';
            if (candidates.length > 0) {
              let best = candidates[0], maxPt = -1, maxG = -1, maxAb = -1;
              for (const p of candidates) {
                const pt = matchPoints[p] || 0, gl = matchGoals[p] || 0, ab = abilityMap[p] || 0;
                if (pt > maxPt || (pt === maxPt && gl > maxG) || (pt === maxPt && gl === maxG && ab > maxAb)) {
                  best = p; maxPt = pt; maxG = gl; maxAb = ab;
                }
              }
              mvp = best;
            }

            gameUpdates[`${clubName}/${date}/${gameKey}/mvp`] = mvp;

            const gameNum = parseInt(gameKey.replace('game', ''), 10);
            matchResults.push({ gameNumber: `${gameNum}경기`, team1: t1, team2: t2, score1: s1, score2: s2, mvp, team1Players: p1, team2Players: p2 });
          }

          // 일별 우승팀 (승점→골득실→득점)
          const pts = {}, gd = {}, gs = {};
          matchResults.forEach(m => {
            gs[m.team1] = (gs[m.team1] || 0) + m.score1; gs[m.team2] = (gs[m.team2] || 0) + m.score2;
            gd[m.team1] = (gd[m.team1] || 0) + (m.score1 - m.score2); gd[m.team2] = (gd[m.team2] || 0) + (m.score2 - m.score1);
            const p1 = m.score1 > m.score2 ? 3 : m.score1 === m.score2 ? 1 : 0;
            const p2 = m.score2 > m.score1 ? 3 : m.score1 === m.score2 ? 1 : 0;
            pts[m.team1] = (pts[m.team1] || 0) + p1; pts[m.team2] = (pts[m.team2] || 0) + p2;
          });
          const winner = Object.keys(pts).sort((a, b) => (pts[b]||0)-(pts[a]||0) || (gd[b]||0)-(gd[a]||0) || (gs[b]||0)-(gs[a]||0))[0] || null;

          // 일별 MVP: 우승팀 선수 중 포인트3+ 최고, 없으면 능력치 최고
          let dailyMvp = '없음';
          if (winner) {
            const cands = new Set();
            matchResults.forEach(m => {
              if (winner === m.team1 && m.team1Players) m.team1Players.forEach(p => cands.add(p));
              if (winner === m.team2 && m.team2Players) m.team2Players.forEach(p => cands.add(p));
            });
            let best = null, maxPt = -1;
            for (const p of cands) { const pt = dailyAggPoints[p] || 0; if (pt >= 3 && pt > maxPt) { maxPt = pt; best = p; } }
            if (!best) { let maxAb = -1; for (const p of cands) { const ab = abilityMap[p] || 0; if (ab > maxAb) { maxAb = ab; best = p; } } }
            if (best) dailyMvp = best;
          }

          dailyResults[date] = { dailyMvp, matches: matchResults.map(({ team1Players, team2Players, ...rest }) => rest) };
        }

        // 게임별 MVP 업데이트
        const entries = Object.entries(gameUpdates);
        for (let i = 0; i < entries.length; i += 500) {
          const batch = Object.fromEntries(entries.slice(i, i + 500));
          await update(ref(db), batch);
        }

        await set(ref(db, `DailyResultsBackup/${clubName}`), dailyResults);
        results.push({ name: '일별 결과 + MVP 재계산', ok: true, msg: `${Object.keys(dailyResults).length}일, ${entries.length}경기 MVP 갱신` });
      }

      // 4) 선수 통계 계산 (전체 + 6개월) — Android PlayerStatsCalculator 포팅
      if (dailySnap.exists() && selectionSnap.exists()) {
        const VOTE_START_DATE = '2025-12-25';
        const todayStr = new Date().toISOString().slice(0, 10);

        const normalizeTeamKey = (key) => {
          if (!key) return '';
          return key.replace(/^team\s*/i, '').trim().toLowerCase();
        };
        const normalizeTeamName = (name) => name ? name.trim().toLowerCase() : '';
        const toArr = (v) => {
          if (!v) return [];
          if (Array.isArray(v)) return v.filter(Boolean);
          if (typeof v === 'object') return Object.values(v).filter(Boolean);
          return [v];
        };

        const calcStats = (scoreData, selData, cutoffDate, maxDate = null, minDate = null) => {
          const pStats = {};
          const dates = Object.keys(scoreData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
          let totalMatches = 0;

          const init = (name) => {
            if (!pStats[name]) pStats[name] = {
              goals: 0, assists: 0, participatedMatches: 0,
              wins: 0, losses: 0, draws: 0,
              goalsConceded: 0, cleanSheets: 0, goalDiffSum: 0,
              totalVotes: 0, totalVoteDates: 0,
            };
          };

          const parseGoals = (goalList) => {
            if (!goalList) return [];
            return Object.values(goalList).map(str => {
              if (!str || !str.includes('|')) return null;
              const [, rest] = str.split('|');
              if (!rest) return null;
              const [scorer, assist] = rest.split('-');
              return { scorer: scorer?.trim(), assist: assist?.trim() };
            }).filter(Boolean);
          };

          // Phase 1: 경기 데이터 집계
          for (const date of dates) {
            if (cutoffDate && date < cutoffDate) continue;
            if (maxDate && date > maxDate) continue;
            if (minDate && date < minDate) continue;
            const dateData = scoreData[date];
            const games = Object.keys(dateData).filter(k => k.startsWith('game'));
            totalMatches += games.length;

            for (const gameKey of games) {
              const g = dateData[gameKey];
              const s1 = g.goalCount1 || 0;
              const s2 = g.goalCount2 || 0;
              const t1Name = g.team1_name || '';
              const t2Name = g.team2_name || '';

              const goals1 = parseGoals(g.goalList1);
              const goals2 = parseGoals(g.goalList2);

              goals1.forEach(gl => {
                if (gl.scorer) { init(gl.scorer); pStats[gl.scorer].goals++; }
                if (gl.assist && gl.assist !== '없음') { init(gl.assist); pStats[gl.assist].assists++; }
              });
              goals2.forEach(gl => {
                if (gl.scorer) { init(gl.scorer); pStats[gl.scorer].goals++; }
                if (gl.assist && gl.assist !== '없음') { init(gl.assist); pStats[gl.assist].assists++; }
              });

              // 로스터 기반 출전/승패 (normalizeTeamKey 매칭)
              let team1Players = [], team2Players = [];
              if (selData && selData[date]) {
                const gameRoster = selData[date][gameKey];
                const normT1 = normalizeTeamName(t1Name);
                const normT2 = normalizeTeamName(t2Name);

                if (gameRoster) {
                  const rKeys = Object.keys(gameRoster);
                  let t1Key = rKeys.find(k => normalizeTeamKey(k) === normT1);
                  let t2Key = rKeys.find(k => normalizeTeamKey(k) === normT2);
                  if (!t1Key || !t2Key) {
                    const sorted = rKeys.sort();
                    if (!t1Key && sorted[0]) t1Key = sorted[0];
                    if (!t2Key && sorted.length > 1) t2Key = sorted[1];
                  }
                  team1Players = toArr(gameRoster[t1Key]);
                  team2Players = toArr(gameRoster[t2Key]);
                } else {
                  const att = selData[date].AttandPlayer || selData[date];
                  const aKeys = Object.keys(att).filter(k => k !== 'all');
                  let t1Key = aKeys.find(k => normalizeTeamKey(k) === normT1);
                  let t2Key = aKeys.find(k => normalizeTeamKey(k) === normT2);
                  if (!t1Key || !t2Key) {
                    const sorted = aKeys.sort();
                    if (!t1Key && sorted[0]) t1Key = sorted[0];
                    if (!t2Key && sorted.length > 1) t2Key = sorted[1];
                  }
                  if (t1Key) team1Players = toArr(att[t1Key]);
                  if (t2Key) team2Players = toArr(att[t2Key]);
                }
              }

              const addResult = (name, myScore, oppScore) => {
                if (!name) return;
                init(name);
                const p = pStats[name];
                p.participatedMatches++;
                p.goalsConceded += oppScore;
                p.goalDiffSum += (myScore - oppScore);
                if (oppScore === 0) p.cleanSheets++;
                if (myScore > oppScore) p.wins++;
                else if (myScore < oppScore) p.losses++;
                else p.draws++;
              };

              team1Players.filter(Boolean).forEach(n => addResult(n, s1, s2));
              team2Players.filter(Boolean).forEach(n => addResult(n, s2, s1));
            }
          }

          // Phase 2: 투표율 계산
          if (selData) {
            const allVoteDates = Object.keys(selData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
            let totalVoteDates = 0;
            for (const date of allVoteDates) {
              if (date < VOTE_START_DATE || date > todayStr) continue;
              if (cutoffDate && date < cutoffDate) continue;
              if (maxDate && date > maxDate) continue;
              if (minDate && date < minDate) continue;
              totalVoteDates++;
              const dayData = selData[date];
              const votedUsers = new Set();
              const collectNames = (list) => {
                toArr(list).forEach(name => {
                  if (name && name.trim() && !name.includes('(용병)')) votedUsers.add(name);
                });
              };
              collectNames(dayData?.AttandPlayer?.all);
              collectNames(dayData?.AbsentPlayer?.all);
              collectNames(dayData?.UndecidedPlayer?.all);
              votedUsers.forEach(name => { init(name); pStats[name].totalVotes++; });
            }
            for (const p of Object.values(pStats)) p.totalVoteDates = totalVoteDates;
          }

          // Phase 3: 파생 통계 계산
          for (const [, p] of Object.entries(pStats)) {
            const pm = p.participatedMatches;
            if (pm === 0) continue;
            p.totalMatches = totalMatches;
            p.attendanceRate = totalMatches > 0 ? (pm * 100.0) / totalMatches : 0;
            p.pointRate = ((p.wins * 3 + p.draws) * 100.0) / (pm * 3);
            p.winLossRate = (p.wins - p.losses) / pm;
            p.avgGoalsPerGame = p.goals / pm;
            p.avgAssistsPerGame = p.assists / pm;
            p.avgGoalsConcededPerGame = p.goalsConceded / pm;
            p.avgGoalDiff = p.goals - p.goalsConceded;
            p.avgGoalDiffPerGame = p.goalDiffSum / pm;
            p.voteRate = p.totalVoteDates > 0 ? (p.totalVotes * 100.0) / p.totalVoteDates : 0;
          }

          // Phase 4: 육각형 능력치 (Android PlayerStatsCalculator)
          const allEntries = Object.entries(pStats).filter(([, p]) => p.participatedMatches > 0);
          let maxGoalAssistSum = 0, maxGD = -Infinity, minGD = Infinity, maxPR = 0;
          for (const [, p] of allEntries) {
            const gpg = p.avgGoalsPerGame, apg = p.avgAssistsPerGame;
            maxGoalAssistSum = Math.max(maxGoalAssistSum, gpg + apg);
            maxGD = Math.max(maxGD, p.avgGoalDiffPerGame);
            minGD = Math.min(minGD, p.avgGoalDiffPerGame);
            maxPR = Math.max(maxPR, p.pointRate);
          }

          for (const [, p] of allEntries) {
            const gpg = p.avgGoalsPerGame, apg = p.avgAssistsPerGame;
            p.rawStamina = p.attendanceRate;
            p.rawAttack = maxGoalAssistSum > 0 ? ((gpg + apg) / maxGoalAssistSum) * 100 : 0;
            const attackPenalty = maxGoalAssistSum > 0 ? (gpg / maxGoalAssistSum) : 0;
            const gdRange = maxGD - minGD;
            const gdContrib = gdRange !== 0 ? (p.avgGoalDiffPerGame - minGD) / gdRange : 0;
            p.rawDefense = maxGoalAssistSum > 0
              ? (apg * 50 / maxGoalAssistSum) - (attackPenalty * 30) + (gdContrib * 30)
              : gdContrib * 30;
            p.rawBalance = 50 + (100 - Math.abs(p.rawAttack - p.rawDefense)) * 0.48;
            const relPR = maxPR > 0 ? (p.pointRate / maxPR) : 0;
            p.rawContribution = p.attendanceRate * 0.8 + relPR + ((gpg + apg) / (maxGoalAssistSum || 1));
          }

          // adjustToRange: eligible = attendance >= 30%
          const eligible = allEntries.filter(([, p]) => p.attendanceRate >= 30);
          let minS = Infinity, maxS = -Infinity, minA = Infinity, maxA = -Infinity, minD = Infinity, maxD = -Infinity;
          for (const [, p] of eligible) {
            minS = Math.min(minS, p.rawStamina); maxS = Math.max(maxS, p.rawStamina);
            minA = Math.min(minA, p.rawAttack);  maxA = Math.max(maxA, p.rawAttack);
            minD = Math.min(minD, p.rawDefense);  maxD = Math.max(maxD, p.rawDefense);
          }
          const adjustToRange = (raw, mn, mx) => {
            if (mx === mn) return 50.0;
            return Math.max(50, Math.min(98, 50 + ((raw - mn) / (mx - mn)) * 48));
          };
          for (const [, p] of allEntries) {
            p.finalStamina = adjustToRange(p.rawStamina, minS, maxS);
            p.finalAttack = adjustToRange(p.rawAttack, minA, maxA);
            p.finalDefense = adjustToRange(p.rawDefense, minD, maxD);
            const adDiff = Math.abs(p.finalAttack - p.finalDefense);
            const balRatio = adDiff > 50 ? 0 : (100 - adDiff * 2);
            p.finalBalance = 50 + (balRatio * 0.48);
            p.finalContribution = p.finalStamina * 0.2 + p.finalDefense * 0.3 + p.finalAttack * 0.3 + p.finalBalance * 0.2;
          }

          // Phase 5: abilityScore (computeRateDiffAbility)
          let mnR = Infinity, mxR = -Infinity, mnDf = Infinity, mxDf = -Infinity, mnAt = Infinity, mxAt = -Infinity;
          for (const [, p] of allEntries) {
            mnR = Math.min(mnR, p.pointRate); mxR = Math.max(mxR, p.pointRate);
            mnDf = Math.min(mnDf, p.avgGoalDiffPerGame); mxDf = Math.max(mxDf, p.avgGoalDiffPerGame);
            mnAt = Math.min(mnAt, p.attendanceRate); mxAt = Math.max(mxAt, p.attendanceRate);
          }
          const norm = (val, mn, mx, base, range) => {
            if (mx === mn) return base + range / 2;
            return base + ((val - mn) / (mx - mn)) * range;
          };
          for (const [, p] of allEntries) {
            p.abilityScore = norm(p.pointRate, mnR, mxR, 60, 40) * 0.6
              + norm(p.avgGoalDiffPerGame, mnDf, mxDf, 60, 40) * 0.25
              + norm(p.attendanceRate, mnAt, mxAt, 60, 40) * 0.15;
            p.abilityScoreWinRateGoalLoss = p.abilityScore * 0.7 + p.pointRate * 0.3;
          }

          // Phase 6: Android 포맷으로 출력
          const output = {};
          for (const [name, p] of Object.entries(pStats)) {
            if (p.participatedMatches === 0 && !p.totalVotes) continue;
            output[name] = {
              goals: p.goals, assists: p.assists,
              participatedMatches: p.participatedMatches,
              wins: p.wins, losses: p.losses, draws: p.draws,
              goalsConceded: p.goalsConceded, cleanSheets: p.cleanSheets,
              totalMatches: p.totalMatches || totalMatches,
              pointRate: p.pointRate || 0,
              attendanceRate: p.attendanceRate || 0,
              avgGoalsPerGame: p.avgGoalsPerGame || 0,
              avgAssistsPerGame: p.avgAssistsPerGame || 0,
              avgGoalsConcededPerGame: p.avgGoalsConcededPerGame || 0,
              avgGoalDiff: p.avgGoalDiff || 0,
              avgGoalDiffPerGame: p.avgGoalDiffPerGame || 0,
              voteRate: p.voteRate || 0,
              totalVotes: p.totalVotes || 0,
              totalVoteDates: p.totalVoteDates || 0,
              winLossRate: ((p.winLossRate || 0) + 1) * 50,
              finalAttack: p.finalAttack || 50,
              finalDefense: p.finalDefense || 50,
              finalStamina: p.finalStamina || 50,
              finalBalance: p.finalBalance || 50,
              finalContribution: p.finalContribution || 50,
              abilityScore: p.abilityScore || 0,
              abilityScoreWinRateGoalLoss: p.abilityScoreWinRateGoalLoss || 0,
            };
          }
          return output;
        };

        const scoreData = dailySnap.val();
        const selData = selectionSnap.val();

        // 전체 통계
        const allStats = calcStats(scoreData, selData, null);
        await set(ref(db, `PlayerStatsBackup/${clubName}`), allStats);
        results.push({ name: '전체 선수 통계', ok: true, msg: `${Object.keys(allStats).length}명` });

        // 6개월 통계
        const sixAgo = new Date();
        sixAgo.setMonth(sixAgo.getMonth() - 6);
        const cutoff = sixAgo.toISOString().slice(0, 10);
        const recentStats = calcStats(scoreData, selData, cutoff);
        await set(ref(db, `PlayerStatsBackup_6m/${clubName}`), recentStats);
        results.push({ name: '6개월 선수 통계', ok: true, msg: `${Object.keys(recentStats).length}명` });

        // 5) 개인별 상세 통계 (PlayerDetailStats) - per-game, 동료 분석, MVP
        const dailyResultsSnap = await get(ref(db, `DailyResultsBackup/${clubName}`));
        const dailyResultsData = dailyResultsSnap.exists() ? dailyResultsSnap.val() : {};

        const calcDetailStats = (scoreData2, selData2, cutoffDate2) => {
          const detail = {}; // { playerName: { ...stats, teammates: {...} } }
          const dates = Object.keys(scoreData2).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));

          // 먼저 matchDays 카운트 (날짜 수)
          const matchDaysSet = new Set();

          for (const date of dates) {
            if (cutoffDate2 && date < cutoffDate2) continue;
            matchDaysSet.add(date);
            const dateData = scoreData2[date];
            const games = Object.keys(dateData).filter(k => k.startsWith('game'));

            // MVP 체크 (DailyResultsBackup에서)
            const dayInfo = dailyResultsData[date];

            for (const gameKey of games) {
              const g = dateData[gameKey];
              const s1 = g.goalCount1 || 0;
              const s2 = g.goalCount2 || 0;
              const t1Name = g.team1_name || '';
              const t2Name = g.team2_name || '';

              // 골/어시스트 파싱
              const parseGoals2 = (goalList) => {
                if (!goalList) return [];
                return Object.values(goalList).map(str => {
                  if (!str || !str.includes('|')) return null;
                  const [, rest] = str.split('|');
                  if (!rest) return null;
                  const [scorer, assist] = rest.split('-');
                  return { scorer: scorer?.trim(), assist: assist?.trim() };
                }).filter(Boolean);
              };

              const goals1 = parseGoals2(g.goalList1);
              const goals2 = parseGoals2(g.goalList2);

              // 로스터 (normalizeTeamKey 매칭)
              let team1Players = [], team2Players = [];
              if (selData2 && selData2[date]) {
                const gameRoster = selData2[date][gameKey];
                const normT1 = normalizeTeamName(t1Name);
                const normT2 = normalizeTeamName(t2Name);

                if (gameRoster) {
                  const rKeys = Object.keys(gameRoster);
                  let t1Key = rKeys.find(k => normalizeTeamKey(k) === normT1);
                  let t2Key = rKeys.find(k => normalizeTeamKey(k) === normT2);
                  if (!t1Key || !t2Key) {
                    const sorted = rKeys.sort();
                    if (!t1Key && sorted[0]) t1Key = sorted[0];
                    if (!t2Key && sorted.length > 1) t2Key = sorted[1];
                  }
                  team1Players = toArr(gameRoster[t1Key]);
                  team2Players = toArr(gameRoster[t2Key]);
                } else {
                  const att = selData2[date].AttandPlayer || selData2[date];
                  const aKeys = Object.keys(att).filter(k => k !== 'all');
                  let t1Key = aKeys.find(k => normalizeTeamKey(k) === normT1);
                  let t2Key = aKeys.find(k => normalizeTeamKey(k) === normT2);
                  if (!t1Key || !t2Key) {
                    const sorted = aKeys.sort();
                    if (!t1Key && sorted[0]) t1Key = sorted[0];
                    if (!t2Key && sorted.length > 1) t2Key = sorted[1];
                  }
                  if (t1Key) team1Players = toArr(att[t1Key]);
                  if (t2Key) team2Players = toArr(att[t2Key]);
                }
              }

              const initPlayer = (name) => {
                if (!detail[name]) detail[name] = {
                  totalGames: 0, totalGoals: 0, totalAssists: 0,
                  totalWins: 0, totalLosses: 0, totalDraws: 0,
                  totalConceded: 0, totalCleanSheets: 0,
                  mvpCount: 0, teammateMap: {},
                };
              };

              // 팀1 선수 처리
              team1Players.forEach(name => {
                if (!name) return;
                initPlayer(name);
                const p = detail[name];
                p.totalGames++;
                p.totalConceded += s2;
                if (s2 === 0) p.totalCleanSheets++;
                if (s1 > s2) p.totalWins++;
                else if (s1 < s2) p.totalLosses++;
                else p.totalDraws++;
                // 동료
                team1Players.forEach(tm => {
                  if (!tm || tm === name) return;
                  if (!p.teammateMap[tm]) p.teammateMap[tm] = { games: 0, wins: 0 };
                  p.teammateMap[tm].games++;
                  if (s1 > s2) p.teammateMap[tm].wins++;
                });
              });

              // 팀2 선수 처리
              team2Players.forEach(name => {
                if (!name) return;
                initPlayer(name);
                const p = detail[name];
                p.totalGames++;
                p.totalConceded += s1;
                if (s1 === 0) p.totalCleanSheets++;
                if (s2 > s1) p.totalWins++;
                else if (s2 < s1) p.totalLosses++;
                else p.totalDraws++;
                // 동료
                team2Players.forEach(tm => {
                  if (!tm || tm === name) return;
                  if (!p.teammateMap[tm]) p.teammateMap[tm] = { games: 0, wins: 0 };
                  p.teammateMap[tm].games++;
                  if (s2 > s1) p.teammateMap[tm].wins++;
                });
              });

              // 골/어시스트 카운트
              goals1.forEach(gl => {
                if (gl.scorer) { initPlayer(gl.scorer); detail[gl.scorer].totalGoals++; }
                if (gl.assist && gl.assist !== '없음') { initPlayer(gl.assist); detail[gl.assist].totalAssists++; }
              });
              goals2.forEach(gl => {
                if (gl.scorer) { initPlayer(gl.scorer); detail[gl.scorer].totalGoals++; }
                if (gl.assist && gl.assist !== '없음') { initPlayer(gl.assist); detail[gl.assist].totalAssists++; }
              });
            }

            // MVP 카운트 (DailyResultsBackup 기반)
            if (dayInfo) {
              if (dayInfo.dailyMvp && dayInfo.dailyMvp !== '없음' && detail[dayInfo.dailyMvp]) {
                detail[dayInfo.dailyMvp].mvpCount++;
              }
              if (dayInfo.matches) {
                Object.values(dayInfo.matches).forEach(m => {
                  if (m.mvp && m.mvp !== '없음' && detail[m.mvp]) {
                    detail[m.mvp].mvpCount++;
                  }
                });
              }
            }
          }

          // 최종: per-game 계산 + 동료 분석 요약
          const totalMatchDays = matchDaysSet.size;

          // 전체 선수 관계 그래프 (5경기 이상 함께한 쌍)
          const networkGraph = {};
          const seenPairs = new Set();
          for (const [name, p] of Object.entries(detail)) {
            for (const [tm, v] of Object.entries(p.teammateMap)) {
              const pairKey = [name, tm].sort().join('|||');
              if (seenPairs.has(pairKey)) continue;
              seenPairs.add(pairKey);
              if (v.games < 5) continue;
              if (!networkGraph[name]) networkGraph[name] = {};
              networkGraph[name][tm] = { games: v.games, winRate: Math.round((v.wins / v.games) * 100) };
            }
          }

          const result = {};
          for (const [name, p] of Object.entries(detail)) {
            if (p.totalGames === 0) continue;

            // 동료 분석
            const tmArr = Object.entries(p.teammateMap)
              .filter(([, v]) => v.games >= 13)
              .map(([tmName, v]) => ({
                name: tmName, games: v.games, wins: v.wins,
                winRate: Math.round((v.wins / v.games) * 100),
              }));

            result[name] = {
              totalGames: p.totalGames,
              totalGoals: p.totalGoals,
              totalAssists: p.totalAssists,
              totalWins: p.totalWins,
              totalLosses: p.totalLosses,
              totalDraws: p.totalDraws,
              totalConceded: p.totalConceded,
              totalCleanSheets: p.totalCleanSheets,
              totalMatchDays,
              mvpCount: p.mvpCount,
              goalsPerGame: +(p.totalGoals / p.totalGames).toFixed(2),
              assistsPerGame: +(p.totalAssists / p.totalGames).toFixed(2),
              concededPerGame: +(p.totalConceded / p.totalGames).toFixed(2),
              goalDiffPerGame: +((p.totalGoals - p.totalConceded) / p.totalGames).toFixed(2),
              winRate: Math.round((p.totalWins / p.totalGames) * 100),
              teammates: {
                best: [...tmArr].sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 6),
                worst: [...tmArr].sort((a, b) => a.winRate - b.winRate || b.games - a.games).slice(0, 6),
                mostPlayed: [...tmArr].sort((a, b) => b.games - a.games || b.winRate - a.winRate).slice(0, 6),
              },
            };
          }
          return { result, networkGraph };
        };

        const { result: detailStats, networkGraph } = calcDetailStats(scoreData, selData, cutoff);
        await set(ref(db, `PlayerDetailStats/${clubName}`), detailStats);
        results.push({ name: '개인별 상세 통계', ok: true, msg: `${Object.keys(detailStats).length}명` });

        // 6) 주별 순위 이력 (PlayerRankHistory)
        const getISOWeekKey = (dateStr) => {
          const d = new Date(dateStr + 'T00:00:00');
          const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
          return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        };

        const todayD = new Date();
        const last12Weeks = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(todayD);
          // 해당 주의 토요일(주 마지막일) 기준
          const dayOfWeek = todayD.getDay(); // 0=일, 6=토
          const daysToSaturday = (6 - dayOfWeek + 7) % 7;
          d.setDate(todayD.getDate() + daysToSaturday - i * 7);
          if (d > todayD) d.setTime(todayD.getTime()); // 미래면 오늘로
          const maxDateStr = d.toISOString().slice(0, 10);
          last12Weeks.push({ weekKey: getISOWeekKey(maxDateStr), maxDate: maxDateStr });
        }

        // 중복 주 제거
        const seenWeeks = new Set();
        const uniqueWeeks = last12Weeks.filter(w => {
          if (seenWeeks.has(w.weekKey)) return false;
          seenWeeks.add(w.weekKey);
          return true;
        });

        const weeklyStandings = {};
        for (const { weekKey, maxDate: wMax } of uniqueWeeks) {
          const wMaxDate = new Date(wMax + 'T00:00:00');
          wMaxDate.setMonth(wMaxDate.getMonth() - 6);
          const wMin = wMaxDate.toISOString().slice(0, 10);
          const wStats = calcStats(scoreData, selData, null, wMax, wMin);
          if (Object.keys(wStats).length === 0) continue;
          const weekData = {};
          Object.entries(wStats).forEach(([name, p]) => {
            if ((p.participatedMatches || 0) === 0) return;
            weekData[name] = {
              abilityScore: +(p.abilityScore || 0).toFixed(2),
              attendanceRate: +(p.attendanceRate || 0).toFixed(1),
            };
          });
          weeklyStandings[weekKey] = weekData;
        }

        await set(ref(db, `PlayerWeeklyStandings/${clubName}`), weeklyStandings);
        results.push({ name: '주별 순위 이력', ok: true, msg: `${Object.keys(weeklyStandings).length}주` });

        // 7) 전체 선수 관계도
        await set(ref(db, `PlayerNetworkGraph/${clubName}`), networkGraph);
        results.push({ name: '선수 관계도', ok: true, msg: `${Object.keys(networkGraph).length}명` });
      }

      results.push({ name: '전체 백업 완료', ok: true });
    } catch (e) {
      console.error('Backup error:', e);
      results.push({ name: '백업 오류', ok: false, msg: e.message });
    }

    setBackupResults(results);
    setBackupRunning(false);
  };

  /* ── 로딩 / 권한 없음 ── */
  if (authLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canAccess) {
    return (
      <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 10 }}>
        <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            관리자 권한이 필요합니다.
          </Alert>
        </Container>
      </Box>
    );
  }

  // 마스터 전용: 팀 추가
  const handleAddClub = async () => {
    const name = newClubName.trim();
    if (!name) { alert('팀 이름을 입력해주세요.'); return; }
    if (clubsList.some(c => c.name === name)) { alert('이미 등록된 팀입니다.'); return; }
    try {
      await set(ref(db, `clubs/${name}`), {
        name,
        createdAt: new Date().toISOString().slice(0, 10),
        createdBy: user.email,
      });
      setClubsList(prev => [...prev, { key: name, name, createdBy: user.email }]);
      setNewClubName('');
      alert(`"${name}" 팀이 등록되었습니다.`);
    } catch (e) {
      alert('팀 등록 실패: ' + e.message);
    }
  };

  const handleDeleteClub = async (clubKey) => {
    if (!window.confirm(`"${clubKey}" 팀을 삭제하시겠습니까?\n(팀 데이터는 삭제되지 않습니다)`)) return;
    try {
      await remove(ref(db, `clubs/${clubKey}`));
      setClubsList(prev => prev.filter(c => c.key !== clubKey));
    } catch (e) {
      alert('팀 삭제 실패: ' + e.message);
    }
  };

  const roleColor = { admin: '#D32F2F', moderator: '#F57C00', verified: '#388E3C' };
  const roleLabel = { admin: '관리자', moderator: '운영진', verified: '인증' };

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 10 }}>
      {/* ── 헤더 ── */}
      <Box sx={{
        background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
        pt: 4, pb: 4, px: 2,
      }}>
        <Typography variant="h5" sx={{ color: 'white', fontWeight: 'bold' }}>
          {clubName}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', mt: 0.5 }}>
          설정 / 관리
        </Typography>
      </Box>

      <Container maxWidth="sm" sx={{ mt: -2, px: 2 }}>

        {/* 0. 마스터 전용: 팀 관리 */}
        {isMaster && (
          <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2, border: '2px solid #7B1FA2' }}>
            <Box onClick={() => setClubsExpanded(!clubsExpanded)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
              <SportsSoccerIcon sx={{ color: '#7B1FA2', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#7B1FA2', fontSize: '1rem', flex: 1 }}>
                팀 관리 (마스터)
              </Typography>
              <Chip label={`${clubsList.length}팀`} size="small" sx={{ bgcolor: '#7B1FA2', color: 'white' }} />
              {clubsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>

            {clubsExpanded && (
              <Box sx={{ mt: 2 }}>
                {/* 팀 추가 */}
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField size="small" fullWidth label="새 팀 이름" value={newClubName}
                    onChange={(e) => setNewClubName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddClub()} />
                  <Button variant="contained" onClick={handleAddClub} startIcon={<AddIcon />}
                    sx={{ whiteSpace: 'nowrap', bgcolor: '#7B1FA2' }}>추가</Button>
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                {/* 팀 목록 */}
                {clubsList.map((club) => (
                  <Box key={club.key} sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    py: 1, px: 1.5, mb: 0.5, bgcolor: '#F5F5F5', borderRadius: 2
                  }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{club.name}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: '#999' }}>
                        {club.createdAt || ''} | {club.createdBy || ''}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => handleDeleteClub(club.key)} sx={{ color: '#D32F2F' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}

                {clubsList.length === 0 && (
                  <Typography color="textSecondary" align="center" sx={{ py: 2 }}>등록된 팀이 없습니다.</Typography>
                )}
              </Box>
            )}
          </Paper>
        )}

        {/* 1. 기록 백업 (최상단) */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <BackupIcon sx={{ color: '#D32F2F', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 'bold', color: '#D32F2F', fontSize: '1rem' }}>
              기록 백업
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8rem', color: '#666', mb: 1.5 }}>
            데이터·통계 전체 백업 및 계산
          </Typography>
          <Button
            fullWidth variant="contained" color="error"
            startIcon={backupRunning ? <CircularProgress size={18} color="inherit" /> : <BackupIcon />}
            disabled={backupRunning}
            onClick={runBackup}
            sx={{ borderRadius: 2, py: 1.2, fontWeight: 'bold' }}
          >
            {backupRunning ? '백업 진행 중...' : '전체 백업 실행'}
          </Button>

          {backupResults.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              {backupResults.map((r, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
                  <CheckCircleIcon sx={{ fontSize: 16, color: r.ok ? '#388E3C' : '#D32F2F' }} />
                  <Typography sx={{ fontSize: '0.8rem', color: r.ok ? '#333' : '#D32F2F' }}>
                    {r.name}{r.msg ? ` (${r.msg})` : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        {/* 2. 경기일 관리 */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const upcoming = matchDates.filter(m => m.dateKey >= today).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
          const past = matchDates.filter(m => m.dateKey < today);
          const PAST_PREVIEW = 5;
          const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW);

          const isToday = (d) => d === today;

          const MatchItem = ({ item, isPast }) => (
            <Box sx={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              py: 1, px: 1.5, borderRadius: 2, mb: 0.5,
              bgcolor: isPast ? '#FAFAFA' : isToday(item.dateKey) ? '#FFF3E0' : '#E3F2FD',
              opacity: isPast ? 0.8 : 1,
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: isPast ? '#888' : '#333' }}>
                    {item.dateKey}
                  </Typography>
                  {isToday(item.dateKey) && (
                    <Chip label="오늘" size="small"
                      sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#F57C00', color: 'white', fontWeight: 'bold' }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.8rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[item.time, item.location].filter(Boolean).join(' | ')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexShrink: 0 }}>
                <IconButton size="small" sx={{ color: '#1565C0' }}
                  onClick={() => navigate(`/player-select?date=${item.dateKey}`)}>
                  <SportsSoccerIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => openMatchEdit(item)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" sx={{ color: '#bbb' }} onClick={() => deleteMatchDate(item.dateKey)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          );

          return (
            <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EventIcon sx={{ color: '#1565C0', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                    예정 경기
                  </Typography>
                  <Chip label={`${upcoming.length}개`} size="small"
                    sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#E3F2FD', color: '#1565C0' }} />
                </Box>
                <Button size="small" startIcon={<AddIcon />} onClick={openMatchAdd}>추가</Button>
              </Box>

              {upcoming.length === 0 ? (
                <Typography sx={{ color: '#999', textAlign: 'center', py: 1.5, fontSize: '0.85rem' }}>
                  예정된 경기가 없습니다.
                </Typography>
              ) : (
                upcoming.map(item => <MatchItem key={item.dateKey} item={item} isPast={false} />)
              )}

              {past.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Box
                    onClick={() => setShowPast(p => !p)}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', py: 0.5 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <HistoryIcon sx={{ color: '#999', fontSize: 18 }} />
                      <Typography sx={{ fontSize: '0.9rem', color: '#666', fontWeight: 'bold' }}>지난 경기</Typography>
                      <Chip label={`${past.length}개`} size="small"
                        sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#F5F5F5', color: '#999' }} />
                    </Box>
                    {showPast ? <ExpandLessIcon sx={{ color: '#999' }} /> : <ExpandMoreIcon sx={{ color: '#999' }} />}
                  </Box>
                  {showPast && (
                    <Box sx={{ mt: 1 }}>
                      {visiblePast.map(item => <MatchItem key={item.dateKey} item={item} isPast={true} />)}
                      {past.length > PAST_PREVIEW && (
                        <Button size="small" fullWidth onClick={() => setShowAllPast(p => !p)}
                          sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
                          {showAllPast ? '접기' : `나머지 ${past.length - PAST_PREVIEW}개 더보기`}
                        </Button>
                      )}
                    </Box>
                  )}
                </>
              )}
            </Paper>
          );
        })()}

        {/* 3. 리그 관리 (3개 미리보기) */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmojiEventsIcon sx={{ color: '#1565C0', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>리그 관리</Typography>
              {leagues.length > 0 && <Chip label={`${leagues.length}개`} size="small"
                sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#E3F2FD', color: '#1565C0' }} />}
            </Box>
            <Button size="small" startIcon={<AddIcon />} onClick={openLeagueAdd}>추가</Button>
          </Box>

          {leagues.length === 0 ? (
            <Typography sx={{ color: '#999', textAlign: 'center', py: 2, fontSize: '0.85rem' }}>등록된 리그가 없습니다.</Typography>
          ) : (
            <>
              {(expandLeagues ? leagues : leagues.slice(0, 3)).map(league => (
                <Box key={league.id} sx={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  py: 1, px: 1.5, borderRadius: 2, mb: 0.5, bgcolor: '#F5F7FA',
                }}>
                  <Box>
                    <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                      제{league.id}회 {league.leagueName || '리그'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: '#666' }}>
                      {league.startDate} ~ {league.endDate}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>
                    <IconButton size="small" onClick={() => openLeagueEdit(league)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" sx={{ color: '#bbb' }} onClick={() => deleteLeague(league)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
              {leagues.length > 3 && (
                <Button size="small" fullWidth onClick={() => setExpandLeagues(p => !p)}
                  sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
                  {expandLeagues ? '접기' : `나머지 ${leagues.length - 3}개 더보기`}
                </Button>
              )}
            </>
          )}
        </Paper>

        {/* 4. 권한 관리 (3개 미리보기) */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon sx={{ color: '#1565C0', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>권한 관리</Typography>
              {allowedUsers.length > 0 && <Chip label={`${allowedUsers.length}명`} size="small"
                sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#E3F2FD', color: '#1565C0' }} />}
            </Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setPermDialog(true)}>추가</Button>
          </Box>

          {allowedUsers.length === 0 ? (
            <Typography sx={{ color: '#999', textAlign: 'center', py: 2, fontSize: '0.85rem' }}>등록된 사용자가 없습니다.</Typography>
          ) : (
            <>
              {(expandPerms ? allowedUsers : allowedUsers.slice(0, 3)).map((u) => (
                <Box key={`${u.role}-${u.emailKey}`} sx={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  py: 0.8, px: 1, borderRadius: 2, mb: 0.5, bgcolor: '#F5F7FA',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.9rem' }}>{u.name}</Typography>
                    <Chip label={roleLabel[u.role]} size="small"
                      sx={{ fontSize: '0.7rem', height: 22, bgcolor: `${roleColor[u.role]}15`, color: roleColor[u.role], fontWeight: 'bold' }} />
                  </Box>
                  <IconButton size="small" sx={{ color: '#bbb' }} onClick={() => removePermission(u)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              {allowedUsers.length > 3 && (
                <Button size="small" fullWidth onClick={() => setExpandPerms(p => !p)}
                  sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
                  {expandPerms ? '접기' : `나머지 ${allowedUsers.length - 3}명 더보기`}
                </Button>
              )}
            </>
          )}
        </Paper>

        {/* 5. 선수 관리 (3줄 미리보기) */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PeopleIcon sx={{ color: '#1565C0', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>선수 관리</Typography>
              <Chip label={`${players.length}명`} size="small"
                sx={{ fontSize: '0.75rem', height: 22, bgcolor: '#E3F2FD', color: '#1565C0' }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <TextField
              size="small" fullWidth placeholder="선수 이름 입력"
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <Button variant="contained" onClick={addPlayer} sx={{ minWidth: 60, borderRadius: 2 }}>추가</Button>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(expandPlayers ? players : players.slice(0, 15)).map(p => (
              <Chip
                key={p.key}
                label={p.name}
                size="small"
                onDelete={() => removePlayer(p)}
                sx={{ fontSize: '0.8rem' }}
              />
            ))}
          </Box>
          {players.length > 15 && (
            <Button size="small" fullWidth onClick={() => setExpandPlayers(p => !p)}
              sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
              {expandPlayers ? '접기' : `나머지 ${players.length - 15}명 더보기`}
            </Button>
          )}
        </Paper>

      </Container>

      {/* 경기일 추가/수정 다이얼로그 */}
      <Dialog open={matchDialog} onClose={() => setMatchDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editingMatch ? '경기일 수정' : '경기일 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="날짜 (필수)" type="date" size="small" fullWidth
            value={matchForm.date}
            onChange={e => setMatchForm(f => ({ ...f, date: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="시간" type="time" size="small" fullWidth
            value={matchForm.time}
            onChange={e => setMatchForm(f => ({ ...f, time: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>장소 선택</InputLabel>
            <Select
              label="장소 선택"
              value={locationPreset}
              onChange={e => {
                const val = e.target.value;
                setLocationPreset(val);
                if (val === 'custom') {
                  setMatchForm(f => ({ ...f, location: '', address: '' }));
                } else {
                  const p = APP_CONFIG.locationPresets.find(p => p.name === val);
                  if (p) setMatchForm(f => ({ ...f, location: p.name, address: p.address }));
                }
              }}
            >
              {APP_CONFIG.locationPresets.map(p => (
                <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>
              ))}
              <MenuItem value="custom">직접 입력</MenuItem>
            </Select>
          </FormControl>
          {locationPreset === 'custom' && (
            <TextField
              label="장소 이름" size="small" fullWidth
              value={matchForm.location}
              onChange={e => setMatchForm(f => ({ ...f, location: e.target.value }))}
            />
          )}
          <TextField
            label="주소 (지도 검색용)" size="small" fullWidth
            value={matchForm.address}
            onChange={e => setMatchForm(f => ({ ...f, address: e.target.value }))}
            slotProps={{ input: { startAdornment: <PlaceIcon sx={{ color: '#999', mr: 0.5, fontSize: 18 }} /> } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMatchDialog(false)}>취소</Button>
          <Button variant="contained" onClick={saveMatchDate} disabled={!matchForm.date}>
            {editingMatch ? '수정' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 권한 추가 다이얼로그 */}
      <Dialog open={permDialog} onClose={() => setPermDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>권한 추가</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="이름" size="small" fullWidth
            value={permName}
            onChange={e => setPermName(e.target.value)}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>역할</InputLabel>
            <Select label="역할" value={permRole} onChange={e => setPermRole(e.target.value)}>
              <MenuItem value="admin">관리자</MenuItem>
              <MenuItem value="moderator">운영진</MenuItem>
              <MenuItem value="verified">인증</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermDialog(false)}>취소</Button>
          <Button variant="contained" onClick={addPermission} disabled={!permName.trim()}>추가</Button>
        </DialogActions>
      </Dialog>

      {/* 리그 추가/수정 다이얼로그 */}
      <Dialog open={leagueDialog} onClose={() => setLeagueDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editingLeague ? '리그 수정' : '새 리그 만들기'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="리그 회차" size="small" fullWidth
            value={leagueForm.id}
            disabled={!!editingLeague}
            onChange={e => setLeagueForm(f => ({ ...f, id: e.target.value }))}
          />
          <TextField
            label="리그 이름" size="small" fullWidth
            value={leagueForm.leagueName}
            onChange={e => setLeagueForm(f => ({ ...f, leagueName: e.target.value }))}
          />
          <TextField
            label="시작일 (필수)" type="date" size="small" fullWidth
            value={leagueForm.startDate}
            onChange={e => setLeagueForm(f => ({ ...f, startDate: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="종료일 (필수)" type="date" size="small" fullWidth
            value={leagueForm.endDate}
            onChange={e => setLeagueForm(f => ({ ...f, endDate: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeagueDialog(false)}>취소</Button>
          <Button variant="contained" onClick={saveLeague}
            disabled={!leagueForm.startDate || !leagueForm.endDate}>
            {editingLeague ? '수정' : '만들기'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

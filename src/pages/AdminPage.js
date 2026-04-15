import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../config/firebase';
import { ref, get, set, push, remove, update } from 'firebase/database';
import {
  Container, Box, Typography, CircularProgress, Paper, Button, Card, CardContent,
  TextField, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip, Select, MenuItem, FormControl, InputLabel,
  Divider, Alert
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
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
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useAuth } from '../contexts/AuthContext';
import OnboardingModal from '../components/OnboardingModal';
import { useOnboarding } from '../hooks/useOnboarding';

export default function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clubName, isAdmin, isModerator, isMaster, user, emailKey, loading: authLoading, authReady } = useAuth();
  const canAccess = isAdmin || isModerator || isMaster;

  // 관리자 온보딩 투어 (첫 방문 시 자동 표시)
  const adminOnboarding = useOnboarding({
    role: 'admin',
    emailKey,
    enabled: (isAdmin || isModerator) && authReady && !!emailKey,
  });

  const [loading, setLoading] = useState(true);

  // 마스터 전용: 팀 관리
  const [clubsList, setClubsList] = useState([]);
  const [clubRequests, setClubRequests] = useState([]);
  const [newClubName, setNewClubName] = useState('');
  const [clubsExpanded, setClubsExpanded] = useState(false);
  const [clubAdminDialog, setClubAdminDialog] = useState(false);
  const [selectedClubForAdmin, setSelectedClubForAdmin] = useState(null);
  const [clubAdminName, setClubAdminName] = useState('');
  const [clubAdminRole, setClubAdminRole] = useState('admin');
  const [clubAdmins, setClubAdmins] = useState([]);

  // 배너 관리
  const [bannerList, setBannerList] = useState([]);
  const [bannerDialog, setBannerDialog] = useState(false);
  const [bannerForm, setBannerForm] = useState({ title: '', imageUrl: '', link: '', order: 0 });
  const [bannersExpanded, setBannersExpanded] = useState(false);

  // 경기일 관리
  const [matchDates, setMatchDates] = useState([]);
  const [matchDialog, setMatchDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [matchForm, setMatchForm] = useState({ date: '', time: '', location: '', address: '' });
  // eslint-disable-next-line no-unused-vars
  const [locationPreset, setLocationPreset] = useState('custom');
  const [locationPresets, setLocationPresets] = useState([]);
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
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerEditDialog, setPlayerEditDialog] = useState(null); // { key, name, jerseyNumber, position, subPosition }

  // 권한 추가 다이얼로그
  const [permDialog, setPermDialog] = useState(false);
  const [permName, setPermName] = useState('');
  const [permRole, setPermRole] = useState('verified');

  // 권한 수정 다이얼로그
  const [editPermDialog, setEditPermDialog] = useState(false);
  const [editPermUser, setEditPermUser] = useState(null);
  const [editPermRole, setEditPermRole] = useState('');

  // 리그 관리
  const [leagues, setLeagues] = useState([]);
  const [leagueDialog, setLeagueDialog] = useState(false);
  const [editingLeague, setEditingLeague] = useState(null);
  const [leagueForm, setLeagueForm] = useState({ leagueName: '', startDate: '', endDate: '' });

  // 백업
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupResults, setBackupResults] = useState([]);

  /* ── 장소 프리셋 로드 ── */
  const loadLocationPresets = useCallback(async () => {
    if (!clubName) return;
    const snap = await get(ref(db, `LocationPresets/${clubName}`));
    if (snap.exists()) {
      const data = snap.val();
      setLocationPresets(Object.values(data).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } else {
      setLocationPresets([]);
    }
  }, [clubName]);

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
    // Users에서 이름/클럽 조회용
    const usersSnap = await get(ref(db, 'Users'));
    const usersData = usersSnap.exists() ? usersSnap.val() : {};
    const arr = [];
    for (const role of ['admin', 'moderator', 'verified']) {
      if (!data[role]) continue;
      Object.entries(data[role]).forEach(([ek, val]) => {
        const userName = (val && typeof val === 'object') ? val.name : null;
        const userEmail = (val && typeof val === 'object') ? val.email : null;
        const userClub = usersData[ek]?.club || '';
        arr.push({
          emailKey: ek,
          name: userName || usersData[ek]?.name || ek.replace(/,/g, '.'),
          email: userEmail || ek.replace(/,/g, '.'),
          role,
          club: userClub,
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
      jerseyNumber: val.jerseyNumber ?? null,
      position: val.position || '',
      subPosition: val.subPosition || '',
    })).sort((a, b) => {
      // 등번호가 있으면 등번호 순, 없으면 이름순
      const aNum = a.jerseyNumber ?? null;
      const bNum = b.jerseyNumber ?? null;
      if (aNum !== null && bNum !== null) return aNum - bNum;
      if (aNum !== null) return -1;
      if (bNum !== null) return 1;
      return a.name.localeCompare(b.name, 'ko');
    });
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
        // 마스터: 팀 목록 + 클럽 생성 요청 로드
        if (isMaster) {
          const [clubsSnap, reqSnap] = await Promise.all([
            get(ref(db, 'clubs')),
            get(ref(db, 'ClubRequests')),
          ]);
          if (clubsSnap.exists()) {
            const data = clubsSnap.val();
            setClubsList(Object.entries(data).map(([key, val]) => ({ key, ...val })));
          }
          if (reqSnap.exists()) {
            setClubRequests(Object.entries(reqSnap.val())
              .map(([key, val]) => ({ key, ...val }))
              .filter(r => r.status === 'pending'));
          }
        }

        // 배너 로드
        const bannerSnap = await get(ref(db, 'banners'));
        if (bannerSnap.exists()) {
          const data = bannerSnap.val();
          setBannerList(Object.entries(data).map(([key, val]) => ({ key, ...val })).sort((a, b) => (a.order || 0) - (b.order || 0)));
        }

        // 관리자: 팀 데이터 로드
        if (isAdmin || isMaster) {
          await Promise.all([loadMatchDates(), loadAllowedUsers(), loadPlayers(), loadLeagues(), loadLocationPresets()]);
        }

        // 클럽 종목/포메이션 로드
      } catch (e) {
        console.error('AdminPage load error:', e);
      }
      setLoading(false);
    };
    loadData();
  }, [authReady, user, canAccess, isAdmin, isModerator, isMaster, emailKey, navigate, loadMatchDates, loadAllowedUsers, loadPlayers, loadLeagues, loadLocationPresets]);

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

    // 새 장소면 팀별 프리셋에 자동 저장
    if (matchForm.location.trim() && !locationPresets.some(p => p.name === matchForm.location.trim())) {
      await push(ref(db, `LocationPresets/${clubName}`), {
        name: matchForm.location.trim(),
        address: matchForm.address || matchForm.location,
      });
      await loadLocationPresets();
    }

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
    const preset = locationPresets.find(p => p.name === item.location);
    setLocationPreset(preset ? item.location : 'custom');
    setMatchDialog(true);
  };

  const openMatchAdd = () => {
    setEditingMatch(null);
    setMatchForm({ date: '', time: '', location: '', address: '' });
    setLocationPreset('custom');
    setMatchDialog(true);
  };

  // 다음(Kakao) 우편번호 검색 — 건물명을 자동으로 장소명으로 사용
  const openDaumSearch = () => {
    if (!window.daum || !window.daum.Postcode) {
      alert('주소 검색 서비스를 불러오지 못했습니다.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const addr = data.roadAddress || data.jibunAddress || data.address || '';
        // 건물명 우선, 없으면 시군구+법정동, 최종 fallback은 주소 마지막 단어
        const name =
          (data.buildingName && data.buildingName.trim()) ||
          [data.sigungu, data.bname].filter(Boolean).join(' ') ||
          addr.split(' ').pop() ||
          '새 장소';
        setMatchForm((f) => ({ ...f, location: name, address: addr }));
        setLocationPreset('custom');
      },
    }).open();
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

  // 권한 등급 수정 가능 여부
  const ROLE_RANK = { admin: 3, moderator: 2, verified: 1 };
  const canEditRole = (targetRole) => {
    if (isMaster) return true; // 마스터: 전부 수정 가능
    if (isAdmin) return ROLE_RANK[targetRole] < ROLE_RANK['admin']; // 관리자: 자기보다 낮은 등급만
    return false;
  };

  const openEditPerm = (u) => {
    setEditPermUser(u);
    setEditPermRole(u.role);
    setEditPermDialog(true);
  };

  const saveEditPerm = async () => {
    if (!editPermUser || editPermRole === editPermUser.role) {
      setEditPermDialog(false);
      return;
    }
    try {
      // 기존 역할 삭제 → 새 역할에 추가
      await remove(ref(db, `AllowedUsers/${editPermUser.role}/${editPermUser.emailKey}`));
      await set(ref(db, `AllowedUsers/${editPermRole}/${editPermUser.emailKey}`), {
        name: editPermUser.name,
        email: editPermUser.email,
      });
      setEditPermDialog(false);
      await loadAllowedUsers();
    } catch (e) {
      alert('권한 변경 실패: ' + e.message);
    }
  };

  const addPlayer = async () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (players.some(p => p.name === name)) { alert('이미 등록된 선수입니다.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const num = newPlayerNumber ? parseInt(newPlayerNumber, 10) : null;
    if (num !== null && (Number.isNaN(num) || num < 0 || num > 99)) {
      alert('등번호는 0~99 사이 숫자여야 합니다.'); return;
    }
    await push(ref(db, `registeredPlayers/${clubName}`), {
      name,
      date: today,
      jerseyNumber: num,
      position: '',
      subPosition: '',
    });
    setNewPlayerName('');
    setNewPlayerNumber('');
    await loadPlayers();
  };

  const removePlayer = async (player) => {
    if (!window.confirm(`${player.name}을(를) 삭제하시겠습니까?`)) return;
    await remove(ref(db, `registeredPlayers/${clubName}/${player.key}`));
    await loadPlayers();
  };

  const updatePlayerInfo = async (player) => {
    const updates = {
      name: player.name,
      jerseyNumber: player.jerseyNumber,
      position: player.position || '',
      subPosition: player.subPosition || '',
    };
    const existingSnap = await get(ref(db, `registeredPlayers/${clubName}/${player.key}`));
    if (existingSnap.exists()) {
      updates.date = existingSnap.val().date || '';
    }
    await update(ref(db, `registeredPlayers/${clubName}/${player.key}`), updates);
    await loadPlayers();
  };

  const openLeagueAdd = () => {
    setEditingLeague(null);
    const nextId = leagues.length > 0 ? String(Math.max(...leagues.map(l => Number(l.id))) + 1) : '1';
    const currentYear = new Date().getFullYear();
    setLeagueForm({ id: nextId, leagueName: `${currentYear}년 ${clubName} 리그`, startDate: '', endDate: '' });
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
  const runBackup = async (opts = {}) => {
    if (!opts.skipConfirm && !window.confirm('전체 기록 백업을 실행하시겠습니까?\n(통계 계산, 데이터 백업 등)')) return;
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
            const t1Code = t1.replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
            const t2Code = t2.replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim();
            const s1 = g.goalCount1 || 0, s2 = g.goalCount2 || 0;

            // 팀 선수 목록
            const gameSel = selectionData[date]?.[gameKey];
            let p1, p2;
            if (gameSel) {
              p1 = getPlayersList(gameSel[t1] || gameSel[`Team ${t1}`] || gameSel[t1Code] || gameSel[`Team ${t1Code}`]);
              p2 = getPlayersList(gameSel[t2] || gameSel[`Team ${t2}`] || gameSel[t2Code] || gameSel[`Team ${t2Code}`]);
            } else {
              const att = selectionData[date]?.AttandPlayer;
              p1 = getPlayersList(att?.[t1] || att?.[t1Code]);
              p2 = getPlayersList(att?.[t2] || att?.[t2Code]);
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

            // 경기별 MVP: 기존 MVP가 없을 때만 재계산
            const existingMvp = g.mvp;
            let mvp = (existingMvp && existingMvp !== '없음') ? existingMvp : '없음';
            if (mvp === '없음') {
              let candidates = s1 > s2 ? [...p1] : s2 > s1 ? [...p2] : [...p1, ...p2];
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
          const arr = Array.isArray(v) ? v : (typeof v === 'object' ? Object.values(v) : [v]);
          return arr.filter(x => x && typeof x === 'string');
        };

        const calcStats = (scoreData, selData, cutoffDate, maxDate = null, minDate = null) => {
          const pStats = {};
          const dates = Object.keys(scoreData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
          let totalMatches = 0;

          const init = (name) => {
            if (!name || typeof name !== 'string' || !name.trim()) return false;
            if (!pStats[name]) pStats[name] = {
              goals: 0, assists: 0, participatedMatches: 0,
              wins: 0, losses: 0, draws: 0,
              goalsConceded: 0, cleanSheets: 0, goalDiffSum: 0,
              totalVotes: 0, totalVoteDates: 0,
            };
            return true;
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
                if (gl.scorer && init(gl.scorer)) pStats[gl.scorer].goals++;
                if (gl.assist && gl.assist !== '없음' && init(gl.assist)) pStats[gl.assist].assists++;
              });
              goals2.forEach(gl => {
                if (gl.scorer && init(gl.scorer)) pStats[gl.scorer].goals++;
                if (gl.assist && gl.assist !== '없음' && init(gl.assist)) pStats[gl.assist].assists++;
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
                if (!init(name)) return;
                const p = pStats[name];
                p.participatedMatches++;
                p.goalsConceded += oppScore;
                p.goalDiffSum += (myScore - oppScore);
                if (oppScore === 0) p.cleanSheets++;
                if (myScore > oppScore) p.wins++;
                else if (myScore < oppScore) p.losses++;
                else p.draws++;
              };

              team1Players.filter(n => n && typeof n === 'string').forEach(n => addResult(n, s1, s2));
              team2Players.filter(n => n && typeof n === 'string').forEach(n => addResult(n, s2, s1));
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
            // Firebase key 검증: 문자열이고 금지 문자 없어야 함
            if (typeof name !== 'string' || !name.trim() || /[.#$/[\]]/.test(name)) continue;
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

        // 시즌 통계 (올해 1월 1일부터)
        const seasonCutoff = new Date().getFullYear() + '-01-01';
        const seasonStats = calcStats(scoreData, selData, seasonCutoff);
        await set(ref(db, `PlayerStatsBackup_season/${clubName}`), seasonStats);
        results.push({ name: '시즌 선수 통계', ok: true, msg: `${Object.keys(seasonStats).length}명` });

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
          // 해당 주의 일요일(주 마지막일) 기준
          const dayOfWeek = todayD.getDay(); // 0=일, 6=토
          const daysToSunday = (7 - dayOfWeek) % 7;
          d.setDate(todayD.getDate() + daysToSunday - i * 7);
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
        for (let wi = 0; wi < uniqueWeeks.length; wi++) {
          const { weekKey, maxDate: wMax } = uniqueWeeks[wi];
          const isLatest = wi === uniqueWeeks.length - 1;
          let wStats;
          if (isLatest) {
            // 마지막 주는 6개월 통계와 동일하게 (maxDate 없이)
            wStats = recentStats;
          } else {
            const wCutoff = new Date(wMax + 'T00:00:00');
            wCutoff.setMonth(wCutoff.getMonth() - 6);
            const cutoffStr = wCutoff.toISOString().slice(0, 10);
            wStats = calcStats(scoreData, selData, cutoffStr, wMax);
          }
          if (Object.keys(wStats).length === 0) continue;
          const weekData = {};
          Object.entries(wStats).forEach(([name, p]) => {
            if ((p.participatedMatches || 0) === 0) return;
            weekData[name] = {
              abilityScore: +(p.abilityScore || 0).toFixed(2),
              attendanceRate: +(p.attendanceRate || 0).toFixed(1),
              pointRate: +(p.pointRate || 0).toFixed(1),
              avgGoalDiffPerGame: +(p.avgGoalDiffPerGame || 0).toFixed(2),
              participatedMatches: p.participatedMatches || 0,
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

  // URL query로 통계 재계산 자동 실행 (경기 기록 삭제 후 flow)
  const [autoTriggered, setAutoTriggered] = useState(false);
  useEffect(() => {
    if (autoTriggered || loading || !canAccess) return;
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'rebuild-stats') {
      setAutoTriggered(true);
      // query 제거 (새로고침 시 재실행 방지)
      navigate('/admin', { replace: true });
      // 약간의 지연 후 자동 실행
      setTimeout(() => {
        runBackup({ skipConfirm: true });
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canAccess, location.search]);

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
      <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 12 }}>
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

  const handleApproveClub = async (req) => {
    try {
      // 클럽 생성
      await set(ref(db, `clubs/${req.name}`), {
        name: req.name,
        type: req.type || 'futsal',
        region: req.region || '',
        createdAt: new Date().toISOString().slice(0, 10),
        createdBy: req.requestedBy,
      });
      // 신청자를 admin으로 등록
      const ek = req.requestedBy.replace(/\./g, ',');
      await set(ref(db, `AllowedUsers/admin/${ek}`), true);
      // 요청 상태 업데이트
      await set(ref(db, `ClubRequests/${req.key}/status`), 'approved');
      setClubRequests(prev => prev.filter(r => r.key !== req.key));
      setClubsList(prev => [...prev, { key: req.name, name: req.name, type: req.type, createdBy: req.requestedBy }]);
      alert(`"${req.name}" 클럽이 승인되었습니다.`);
    } catch (e) {
      alert('승인 실패: ' + e.message);
    }
  };

  const handleRejectClub = async (req) => {
    if (!window.confirm(`"${req.name}" 클럽 신청을 거절하시겠습니까?`)) return;
    try {
      await set(ref(db, `ClubRequests/${req.key}/status`), 'rejected');
      setClubRequests(prev => prev.filter(r => r.key !== req.key));
    } catch (e) {
      alert('거절 실패: ' + e.message);
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

  // 팀별 관리자 보기
  const openClubAdminDialog = async (club) => {
    setSelectedClubForAdmin(club);
    setClubAdminName('');
    setClubAdminRole('admin');
    // 해당 팀 소속 관리자 로드
    const admins = [];
    const snap = await get(ref(db, 'AllowedUsers'));
    if (snap.exists()) {
      const data = snap.val();
      const usersSnap = await get(ref(db, 'Users'));
      const usersData = usersSnap.exists() ? usersSnap.val() : {};
      for (const role of ['admin', 'moderator', 'verified']) {
        if (!data[role]) continue;
        Object.entries(data[role]).forEach(([ek, val]) => {
          const userClub = usersData[ek]?.club;
          if (userClub === club.name) {
            admins.push({
              emailKey: ek,
              name: val.name || usersData[ek]?.name || ek.replace(/,/g, '.'),
              role,
            });
          }
        });
      }
    }
    setClubAdmins(admins);
    setClubAdminDialog(true);
  };

  const addClubAdmin = async () => {
    if (!clubAdminName.trim() || !selectedClubForAdmin) return;
    const usersSnap = await get(ref(db, 'Users'));
    if (!usersSnap.exists()) { alert('사용자를 찾을 수 없습니다.'); return; }
    let foundKey = null, foundEmail = null, foundClub = null;
    usersSnap.forEach(child => {
      if (child.val().name === clubAdminName.trim()) {
        foundKey = child.key;
        foundEmail = child.key.replace(/,/g, '.');
        foundClub = child.val().club;
      }
    });
    if (!foundKey) { alert('해당 이름의 사용자를 찾을 수 없습니다.'); return; }
    if (foundClub !== selectedClubForAdmin.name) {
      if (!window.confirm(`${clubAdminName.trim()}님은 "${foundClub}" 소속입니다.\n"${selectedClubForAdmin.name}" 관리자로 추가하시겠습니까?`)) return;
    }
    await set(ref(db, `AllowedUsers/${clubAdminRole}/${foundKey}`), { name: clubAdminName.trim(), email: foundEmail });
    setClubAdminName('');
    // 리스트 갱신
    setClubAdmins(prev => [...prev, { emailKey: foundKey, name: clubAdminName.trim(), role: clubAdminRole }]);
    await loadAllowedUsers();
  };

  const removeClubAdmin = async (admin) => {
    if (!window.confirm(`${admin.name}의 ${admin.role} 권한을 삭제하시겠습니까?`)) return;
    await remove(ref(db, `AllowedUsers/${admin.role}/${admin.emailKey}`));
    setClubAdmins(prev => prev.filter(a => !(a.emailKey === admin.emailKey && a.role === admin.role)));
    await loadAllowedUsers();
  };

  // 배너 관리 함수
  const saveBanner = async () => {
    if (!bannerForm.title.trim()) { alert('배너 제목을 입력해주세요.'); return; }
    try {
      const newRef = push(ref(db, 'banners'));
      await set(newRef, { ...bannerForm, active: true, createdAt: new Date().toISOString().slice(0, 10) });
      setBannerList(prev => [...prev, { key: newRef.key, ...bannerForm, active: true }]);
      setBannerDialog(false);
      setBannerForm({ title: '', imageUrl: '', link: '', order: 0 });
    } catch (e) { alert('배너 저장 실패: ' + e.message); }
  };

  const removeBanner = async (key) => {
    if (!window.confirm('이 배너를 삭제하시겠습니까?')) return;
    await remove(ref(db, `banners/${key}`));
    setBannerList(prev => prev.filter(b => b.key !== key));
  };

  const roleColor = { admin: '#D32F2F', moderator: '#F57C00', verified: '#388E3C', master: '#7B1FA2' };
  const roleLabel = { admin: '관리자', moderator: '운영진', verified: '인증', master: '마스터' };
  const roleBg = { admin: '#FFEBEE', moderator: '#FFF3E0', verified: '#E8F5E9', master: '#F3E5F5' };

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 12 }}>
      <Container maxWidth="sm" sx={{ pt: 2, px: 2 }}>

        {/* ── 헤더 카드 ── */}
        <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)' }}>
          <CardContent sx={{ py: 3, textAlign: 'center' }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', letterSpacing: 2 }}>
              설정 / 관리
            </Typography>
            <Typography variant="h4" sx={{ color: 'white', fontWeight: 900, mt: 0.5 }}>
              {clubName}
            </Typography>
          </CardContent>
        </Card>

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
                {/* 클럽 생성 요청 */}
                {clubRequests.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#F57C00', mb: 1 }}>
                      승인 대기 ({clubRequests.length}건)
                    </Typography>
                    {clubRequests.map(req => (
                      <Box key={req.key} sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        py: 1, px: 1.5, mb: 0.5, bgcolor: '#FFF3E0', borderRadius: 2, border: '1px solid #FFE0B2',
                      }}>
                        <Box>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{req.name}</Typography>
                          <Typography sx={{ fontSize: '0.72rem', color: '#999' }}>
                            {req.type === 'football' ? '축구' : '풋살'}{req.region ? ` · ${req.region}` : ''} · {req.requestedBy}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Button size="small" variant="contained" onClick={() => handleApproveClub(req)}
                            sx={{ fontSize: '0.72rem', minWidth: 'auto', px: 1.5, py: 0.5, bgcolor: '#388E3C', color: 'white', borderRadius: 2 }}>
                            승인
                          </Button>
                          <Button size="small" variant="outlined" onClick={() => handleRejectClub(req)}
                            sx={{ fontSize: '0.72rem', minWidth: 'auto', px: 1, py: 0.5, borderColor: '#D32F2F', color: '#D32F2F', borderRadius: 2 }}>
                            거절
                          </Button>
                        </Box>
                      </Box>
                    ))}
                    <Divider sx={{ mt: 1.5, mb: 1.5 }} />
                  </Box>
                )}

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
                        {club.type === 'football' ? '축구' : '풋살'} · {club.createdAt || ''}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" variant="outlined" onClick={() => openClubAdminDialog(club)}
                        sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1, borderColor: '#7B1FA2', color: '#7B1FA2' }}>
                        <SecurityIcon sx={{ fontSize: 14, mr: 0.3 }} />관리자
                      </Button>
                      <IconButton size="small" onClick={() => handleDeleteClub(club.key)} sx={{ color: '#D32F2F' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}

                {clubsList.length === 0 && (
                  <Typography color="textSecondary" align="center" sx={{ py: 2 }}>등록된 팀이 없습니다.</Typography>
                )}
              </Box>
            )}
          </Paper>
        )}

        {/* 배너 관리 (마스터 전용) */}
        {isMaster && (
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box onClick={() => setBannersExpanded(!bannersExpanded)}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
            <HomeIcon sx={{ color: '#F57C00', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 'bold', color: '#F57C00', fontSize: '1rem', flex: 1 }}>
              배너 관리
            </Typography>
            <Chip label={`${bannerList.length}개`} size="small" sx={{ bgcolor: '#FFF3E0', color: '#F57C00', fontWeight: 'bold', fontSize: '0.7rem', height: 20 }} />
            {bannersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>

          {bannersExpanded && (
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" fullWidth startIcon={<AddIcon />}
                onClick={() => setBannerDialog(true)}
                sx={{ mb: 1.5, borderColor: '#F57C00', color: '#F57C00' }}>
                배너 추가
              </Button>

              {bannerList.map(b => (
                <Box key={b.key} sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  py: 1, px: 1.5, mb: 0.5, bgcolor: '#FFF8E1', borderRadius: 2,
                  borderLeft: '4px solid #F57C00',
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{b.title}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.imageUrl || '텍스트 배너'} {b.link && `→ ${b.link}`}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => removeBanner(b.key)} sx={{ color: '#D32F2F' }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}

              {bannerList.length === 0 && (
                <Typography color="textSecondary" align="center" sx={{ py: 2, fontSize: '0.85rem' }}>
                  등록된 배너가 없습니다. 배너를 추가하면 홈 화면 상단에 표시됩니다.
                </Typography>
              )}
            </Box>
          )}
        </Paper>
        )}

        {/* 0. 시작 가이드 (리그 또는 경기일 미설정 시) */}
        {(isAdmin || isMaster) && (leagues.length === 0 || matchDates.length === 0) && (
        <Paper sx={{
          borderRadius: 3, p: 2.5, mb: 2, boxShadow: 3,
          background: 'linear-gradient(135deg, #E8EAF6 0%, #C5CAE9 100%)',
          border: '1px solid #9FA8DA',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SportsSoccerIcon sx={{ color: '#2D336B', fontSize: 22 }} />
            <Typography sx={{ fontWeight: 'bold', color: '#2D336B', fontSize: '1.05rem' }}>
              시작 가이드
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.82rem', color: '#444', mb: 2 }}>
            팀 운영을 위해 아래 순서대로 설정해주세요.
          </Typography>

          {/* Step 1: 리그 만들기 */}
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            bgcolor: 'rgba(255,255,255,0.85)', borderRadius: 2, px: 2, py: 1.5, mb: 1,
            border: leagues.length > 0 ? '1px solid #81C784' : '1px solid #90CAF9',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: leagues.length > 0 ? '#388E3C' : '#1565C0', color: 'white', fontWeight: 'bold', fontSize: '0.85rem',
              }}>
                {leagues.length > 0 ? '✓' : '1'}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: leagues.length > 0 ? '#388E3C' : '#333' }}>
                  리그 만들기
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#777' }}>
                  리그 기간을 설정하세요
                </Typography>
              </Box>
            </Box>
            {leagues.length === 0 && (
              <Button size="small" variant="contained" onClick={openLeagueAdd}
                sx={{ borderRadius: 2, fontSize: '0.8rem', bgcolor: '#1565C0', minWidth: 60 }}>
                설정
              </Button>
            )}
          </Box>

          {/* Step 2: 경기일 추가 */}
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            bgcolor: 'rgba(255,255,255,0.85)', borderRadius: 2, px: 2, py: 1.5,
            border: matchDates.length > 0 ? '1px solid #81C784' : '1px solid #90CAF9',
            opacity: leagues.length === 0 ? 0.5 : 1,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: matchDates.length > 0 ? '#388E3C' : '#1565C0', color: 'white', fontWeight: 'bold', fontSize: '0.85rem',
              }}>
                {matchDates.length > 0 ? '✓' : '2'}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: matchDates.length > 0 ? '#388E3C' : '#333' }}>
                  경기일 추가
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#777' }}>
                  첫 경기 일정을 등록하세요
                </Typography>
              </Box>
            </Box>
            {matchDates.length === 0 && leagues.length > 0 && (
              <Button size="small" variant="contained" onClick={openMatchAdd}
                sx={{ borderRadius: 2, fontSize: '0.8rem', bgcolor: '#1565C0', minWidth: 60 }}>
                설정
              </Button>
            )}
          </Box>
        </Paper>
        )}

        {/* 1. 경기일 관리 (운영진 이상) */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          // 다가올 경기 중 가장 가까운 것 (오늘 포함)
          const allUpcoming = matchDates.filter(m => m.dateKey >= today).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
          const nextMatch = allUpcoming.length > 0 ? allUpcoming[0] : null;
          const upcoming = nextMatch ? allUpcoming.filter(m => m.dateKey !== nextMatch.dateKey) : [];
          const past = matchDates.filter(m => m.dateKey < today);
          const PAST_PREVIEW = 5;
          const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW);

          const MatchItem = ({ item, isPast }) => (
            <Box sx={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              py: 1, px: 1.5, borderRadius: 2, mb: 0.5,
              bgcolor: isPast ? '#FAFAFA' : '#E3F2FD',
              opacity: isPast ? 0.8 : 1,
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: isPast ? '#888' : '#333' }}>
                  {item.dateKey}
                </Typography>
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
            <>
              {/* 오늘 경기 카드 */}
              {nextMatch && (
                <Card sx={{
                  mb: 2, borderRadius: 3, overflow: 'hidden',
                  boxShadow: '0 6px 24px rgba(21, 101, 192, 0.25)',
                  background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
                }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SportsSoccerIcon sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 22 }} />
                        <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: 1 }}>
                          {nextMatch.dateKey === today ? 'TODAY MATCH' : 'NEXT MATCH'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white' } }}
                          onClick={() => openMatchEdit(nextMatch)}>
                          <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Box>
                    </Box>

                    <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '1.3rem', mb: 0.5 }}>
                      {nextMatch.dateKey}
                    </Typography>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                      {nextMatch.time && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AccessTimeIcon sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }} />
                          <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem' }}>{nextMatch.time}</Typography>
                        </Box>
                      )}
                      {nextMatch.location && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PlaceIcon sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }} />
                          <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem' }}>{nextMatch.location}</Typography>
                        </Box>
                      )}
                    </Box>

                    <Button
                      variant="contained" fullWidth
                      startIcon={<PlayArrowIcon />}
                      onClick={() => navigate(`/player-select?date=${nextMatch.dateKey}`)}
                      sx={{
                        py: 1.3, borderRadius: 2, fontWeight: 800, fontSize: '1rem',
                        bgcolor: 'white', color: '#1565C0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        '&:hover': { bgcolor: '#F5F5F5' },
                      }}>
                      경기 운영
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* 예정 경기 + 지난 경기 */}
              <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EventIcon sx={{ color: '#1565C0', fontSize: 20 }} />
                    <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>
                      예정 경기
                    </Typography>
                    {upcoming.length > 0 && (
                      <Chip label={`${upcoming.length}개`} size="small"
                        sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#E3F2FD', color: '#1565C0' }} />
                    )}
                  </Box>
                  <Button size="small" startIcon={<AddIcon />} onClick={openMatchAdd}>추가</Button>
                </Box>

                {upcoming.length === 0 ? (
                  <Typography sx={{ color: '#999', textAlign: 'center', py: 1.5, fontSize: '0.85rem' }}>
                    {nextMatch ? '다음 예정 경기가 없습니다.' : '예정된 경기가 없습니다.'}
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
            </>
          );
        })()}

        {/* 2. 리그 관리 (3개 미리보기) */}
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
                      {league.leagueName || `${clubName} 리그`}
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

        {/* 3. 권한 관리 (관리자+마스터) */}
        {(isAdmin || isMaster) && (() => {
          const filteredUsers = allowedUsers.filter(u => u.club === clubName);
          return (
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon sx={{ color: '#1565C0', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>권한 관리</Typography>
              {filteredUsers.length > 0 && <Chip label={`${filteredUsers.length}명`} size="small"
                sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#E3F2FD', color: '#1565C0' }} />}
            </Box>
            {(isAdmin || isMaster) && <Button size="small" startIcon={<AddIcon />} onClick={() => setPermDialog(true)}>추가</Button>}
          </Box>

          {filteredUsers.length === 0 ? (
            <Typography sx={{ color: '#999', textAlign: 'center', py: 2, fontSize: '0.85rem' }}>등록된 사용자가 없습니다.</Typography>
          ) : (
            <>
              {(expandPerms ? filteredUsers : filteredUsers.slice(0, 3)).map((u) => (
                <Box key={`${u.role}-${u.emailKey}`} sx={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  py: 0.8, px: 1.5, borderRadius: 2, mb: 0.5,
                  bgcolor: roleBg[u.role] || '#F5F7FA',
                  borderLeft: `4px solid ${roleColor[u.role]}`,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#333' }}>{u.name}</Typography>
                    <Chip label={roleLabel[u.role]} size="small"
                      sx={{ fontSize: '0.7rem', height: 22, bgcolor: roleColor[u.role], color: 'white', fontWeight: 'bold' }} />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {canEditRole(u.role) && (
                      <IconButton size="small" sx={{ color: '#90A4AE' }} onClick={() => openEditPerm(u)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    {(isAdmin || isMaster) && (
                      <IconButton size="small" sx={{ color: '#bbb' }} onClick={() => removePermission(u)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              ))}
              {filteredUsers.length > 3 && (
                <Button size="small" fullWidth onClick={() => setExpandPerms(p => !p)}
                  sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
                  {expandPerms ? '접기' : `나머지 ${filteredUsers.length - 3}명 더보기`}
                </Button>
              )}
            </>
          )}
        </Paper>
          );
        })()}

        {/* 4. 선수 관리 (운영진 이상) */}
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PeopleIcon sx={{ color: '#1565C0', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1rem' }}>선수 관리</Typography>
              <Chip label={`${players.length}명`} size="small"
                sx={{ fontSize: '0.75rem', height: 22, bgcolor: '#E3F2FD', color: '#1565C0' }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small" placeholder="선수 이름"
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              sx={{ flex: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              size="small" placeholder="등번호"
              type="number"
              value={newPlayerNumber}
              onChange={e => {
                const v = e.target.value;
                if (v === '') { setNewPlayerNumber(''); return; }
                const n = parseInt(v, 10);
                if (Number.isNaN(n) || n < 0 || n > 99) return;
                setNewPlayerNumber(String(n));
              }}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              inputProps={{ min: 0, max: 99 }}
              sx={{ width: 80, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <Button variant="contained" onClick={addPlayer} sx={{ minWidth: 60, borderRadius: 2 }}>추가</Button>
          </Box>

          {/* 검색 */}
          <TextField
            size="small" fullWidth placeholder="🔍 선수 검색"
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
            sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#F5F5F7' } }}
          />

          {(() => {
            const filtered = playerSearch.trim()
              ? players.filter(p => (p.name || '').toLowerCase().includes(playerSearch.trim().toLowerCase()))
              : players;
            const showList = (playerSearch.trim() || expandPlayers) ? filtered : filtered.slice(0, 15);
            return (
              <>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                  {showList.map(p => {
                    const hasNum = p.jerseyNumber !== null && p.jerseyNumber !== undefined && p.jerseyNumber !== '';
                    const hasPos = !!p.position;
                    const label = (
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                        {hasNum && (
                          <Box component="span" sx={{
                            bgcolor: '#1565C0', color: 'white', fontWeight: 900,
                            px: 0.6, borderRadius: 0.8, fontSize: '0.7rem', minWidth: 18, textAlign: 'center',
                          }}>
                            {p.jerseyNumber}
                          </Box>
                        )}
                        <Box component="span" sx={{ fontSize: '0.8rem' }}>{p.name}</Box>
                        {hasPos && (
                          <Box component="span" sx={{
                            color: '#7E57C2', fontSize: '0.65rem', fontWeight: 700,
                            bgcolor: '#F3E5F5', px: 0.5, borderRadius: 0.5,
                          }}>
                            {p.position}{p.subPosition ? `/${p.subPosition}` : ''}
                          </Box>
                        )}
                      </Box>
                    );
                    return (
                      <Chip
                        key={p.key}
                        label={label}
                        size="small"
                        onClick={() => setPlayerEditDialog({ ...p })}
                        onDelete={() => removePlayer(p)}
                        sx={{ fontSize: '0.8rem', cursor: 'pointer', bgcolor: '#F5F5F5' }}
                      />
                    );
                  })}
                  {filtered.length === 0 && (
                    <Typography sx={{ fontSize: '0.8rem', color: '#999', p: 1 }}>검색 결과 없음</Typography>
                  )}
                </Box>
                {!playerSearch.trim() && filtered.length > 15 && (
                  <Button size="small" fullWidth onClick={() => setExpandPlayers(p => !p)}
                    sx={{ mt: 0.5, fontSize: '0.8rem', color: '#999' }}>
                    {expandPlayers ? '접기' : `나머지 ${filtered.length - 15}명 더보기`}
                  </Button>
                )}
                <Typography sx={{ fontSize: '0.72rem', color: '#999', mt: 1, textAlign: 'center' }}>
                  💡 선수를 클릭하면 등번호/포지션을 수정할 수 있습니다
                </Typography>
              </>
            );
          })()}
        </Paper>

        {/* 5. 기록 백업 (관리자+마스터) — 하단 배치 */}
        {(isAdmin || isMaster) && (
        <Paper sx={{ borderRadius: 3, p: 2.5, mb: 2, boxShadow: 2, opacity: 0.95 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <BackupIcon sx={{ color: '#90A4AE', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 'bold', color: '#546E7A', fontSize: '1rem' }}>
              기록 백업 (고급)
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8rem', color: '#666', mb: 1.5 }}>
            데이터·통계 전체 백업 및 재계산 (경기 기록 삭제 후 사용)
          </Typography>
          <Button
            fullWidth variant="contained"
            startIcon={backupRunning ? <CircularProgress size={18} color="inherit" /> : <BackupIcon />}
            disabled={backupRunning}
            onClick={runBackup}
            sx={{
              borderRadius: 2, py: 1.2, fontWeight: 'bold',
              bgcolor: '#455A64',
              color: 'white',
              boxShadow: '0 3px 10px rgba(69,90,100,0.3)',
              '&:hover': {
                bgcolor: '#37474F',
                boxShadow: '0 4px 14px rgba(55,71,79,0.4)',
              },
              '&.Mui-disabled': {
                bgcolor: '#CFD8DC', color: '#90A4AE',
              },
            }}
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
        )}

      </Container>

      {/* 선수 정보 수정 다이얼로그 (A3) */}
      <Dialog open={!!playerEditDialog} onClose={() => setPlayerEditDialog(null)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: '#1565C0' }}>
          선수 정보 수정
        </DialogTitle>
        <DialogContent dividers>
          {playerEditDialog && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="이름"
                size="small"
                value={playerEditDialog.name || ''}
                onChange={e => setPlayerEditDialog(p => ({ ...p, name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="등번호 (0~99)"
                size="small"
                type="number"
                value={playerEditDialog.jerseyNumber ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '') { setPlayerEditDialog(p => ({ ...p, jerseyNumber: null })); return; }
                  const n = parseInt(v, 10);
                  if (Number.isNaN(n) || n < 0 || n > 99) return;
                  setPlayerEditDialog(p => ({ ...p, jerseyNumber: n }));
                }}
                inputProps={{ min: 0, max: 99 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#666', mb: 0.8 }}>1순위 포지션</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.8 }}>
                  <Chip
                    label="없음"
                    size="small"
                    onClick={() => setPlayerEditDialog(p => ({ ...p, position: '', subPosition: '' }))}
                    sx={{
                      fontSize: '0.72rem', fontWeight: 700,
                      bgcolor: !playerEditDialog.position ? '#78909C' : '#F5F5F5',
                      color: !playerEditDialog.position ? 'white' : '#555',
                    }}
                  />
                  {['GK', 'DF', 'DM', 'MF', 'AM', 'FW'].map(pos => (
                    <Chip
                      key={pos}
                      label={pos}
                      size="small"
                      onClick={() => setPlayerEditDialog(p => ({
                        ...p,
                        position: pos,
                        subPosition: p.subPosition === pos ? '' : p.subPosition,
                      }))}
                      sx={{
                        fontSize: '0.75rem', fontWeight: 700,
                        bgcolor: playerEditDialog.position === pos ? '#2D336B' : '#F5F5F5',
                        color: playerEditDialog.position === pos ? 'white' : '#555',
                      }}
                    />
                  ))}
                </Box>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#666', mb: 0.8 }}>
                  2순위 포지션 <Typography component="span" sx={{ fontSize: '0.7rem', color: '#999' }}>(선택)</Typography>
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.8 }}>
                  <Chip
                    label="없음"
                    size="small"
                    onClick={() => setPlayerEditDialog(p => ({ ...p, subPosition: '' }))}
                    sx={{
                      fontSize: '0.72rem', fontWeight: 700,
                      bgcolor: !playerEditDialog.subPosition ? '#78909C' : '#F5F5F5',
                      color: !playerEditDialog.subPosition ? 'white' : '#555',
                    }}
                  />
                  {['GK', 'DF', 'DM', 'MF', 'AM', 'FW'].filter(pos => pos !== playerEditDialog.position).map(pos => (
                    <Chip
                      key={pos}
                      label={pos}
                      size="small"
                      onClick={() => setPlayerEditDialog(p => ({ ...p, subPosition: pos }))}
                      sx={{
                        fontSize: '0.75rem', fontWeight: 700,
                        bgcolor: playerEditDialog.subPosition === pos ? '#7E57C2' : '#F5F5F5',
                        color: playerEditDialog.subPosition === pos ? 'white' : '#555',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlayerEditDialog(null)}>취소</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!playerEditDialog?.name?.trim()) { alert('이름을 입력하세요.'); return; }
              await updatePlayerInfo(playerEditDialog);
              setPlayerEditDialog(null);
            }}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      {/* 경기일 추가/수정 다이얼로그 */}
      <Dialog open={matchDialog} onClose={() => setMatchDialog(false)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
        <Box sx={{
          background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
          py: 2.5, px: 3, display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <EventIcon sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 24 }} />
          <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>
            {editingMatch ? '경기일 수정' : '경기일 추가'}
          </Typography>
        </Box>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 0, pt: '20px !important', px: 3, pb: 1 }}>

          {/* 날짜 & 시간 */}
          <Typography sx={{ fontSize: '0.78rem', color: '#999', fontWeight: 600, mb: 0.8, letterSpacing: 0.5 }}>
            일정
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
              <DatePicker
                label="날짜 *"
                value={matchForm.date ? dayjs(matchForm.date) : null}
                onChange={(v) => setMatchForm((f) => ({ ...f, date: v ? v.format('YYYY-MM-DD') : '' }))}
                format="YYYY년 MM월 DD일"
                slotProps={{
                  textField: {
                    size: 'small', fullWidth: true,
                    sx: { '& .MuiOutlinedInput-root': { borderRadius: 2 } },
                  },
                }}
              />
              <MobileTimePicker
                label="시간"
                value={matchForm.time ? dayjs(`2000-01-01T${matchForm.time}`) : null}
                onChange={(v) => setMatchForm((f) => ({ ...f, time: v ? v.format('HH:mm') : '' }))}
                minutesStep={30}
                ampm={false}
                views={['hours', 'minutes']}
                format="HH:mm"
                slotProps={{
                  textField: {
                    size: 'small', fullWidth: true,
                    sx: { '& .MuiOutlinedInput-root': { borderRadius: 2 } },
                  },
                }}
              />
            </Box>
          </LocalizationProvider>

          {/* 장소 */}
          <Typography sx={{ fontSize: '0.78rem', color: '#999', fontWeight: 600, mb: 0.8, letterSpacing: 0.5 }}>
            장소
          </Typography>

          {/* 자주 쓰는 장소 (프리셋) */}
          {locationPresets.length > 0 && (
            <Box sx={{ mb: 1.2 }}>
              <Typography sx={{ fontSize: '0.7rem', color: '#bbb', mb: 0.6, fontWeight: 600 }}>
                자주 쓰는 장소
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                {locationPresets.map((p) => {
                  const active = matchForm.location === p.name && matchForm.address === p.address;
                  return (
                    <Chip
                      key={p.name}
                      label={p.name}
                      size="small"
                      onClick={() => {
                        setLocationPreset(p.name);
                        setMatchForm((f) => ({ ...f, location: p.name, address: p.address }));
                      }}
                      sx={{
                        borderRadius: 2, height: 30, px: 0.5,
                        fontWeight: 700, fontSize: '0.8rem',
                        bgcolor: active ? '#2D336B' : '#F0F2F5',
                        color: active ? 'white' : '#555',
                        border: active ? '2px solid #2D336B' : '1px solid transparent',
                        transition: 'all 0.15s',
                        transform: active ? 'scale(1.02)' : 'scale(1)',
                        '&:hover': { bgcolor: active ? '#1A1D4E' : '#E3E5E8' },
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* 선택된 장소 카드 OR 검색 버튼 */}
          {matchForm.address ? (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.2,
              p: 1.5, mb: 0.5, borderRadius: 2,
              bgcolor: '#FAFBFF',
              border: '2px solid #E8EAF6',
              transition: 'all 0.2s',
            }}>
              <Box sx={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
                color: 'white', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 3px 8px rgba(45,51,107,0.25)',
              }}>
                <PlaceIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontWeight: 800, fontSize: '0.95rem', color: '#222',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.3,
                }}>
                  {matchForm.location || '이름 없음'}
                </Typography>
                <Typography sx={{
                  fontSize: '0.74rem', color: '#888', mt: 0.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  📍 {matchForm.address}
                </Typography>
              </Box>
              <Button
                size="small" variant="outlined"
                startIcon={<SearchIcon sx={{ fontSize: '14px !important' }} />}
                onClick={openDaumSearch}
                sx={{
                  borderRadius: 2, fontSize: '0.72rem', fontWeight: 700,
                  minWidth: 'auto', px: 1.3, flexShrink: 0,
                  borderColor: '#2D336B', color: '#2D336B',
                  '&:hover': { borderColor: '#1A1D4E', bgcolor: '#F0F2F5' },
                }}
              >
                변경
              </Button>
            </Box>
          ) : (
            <Button
              fullWidth
              variant="outlined"
              startIcon={<SearchIcon />}
              onClick={openDaumSearch}
              sx={{
                py: 1.8, borderRadius: 2,
                borderColor: '#2D336B', color: '#2D336B',
                borderWidth: 2, borderStyle: 'dashed',
                fontWeight: 800, fontSize: '0.9rem',
                mb: 0.5,
                '&:hover': {
                  borderColor: '#1A1D4E', borderWidth: 2, borderStyle: 'dashed',
                  bgcolor: '#F0F2F5',
                },
              }}
            >
              주소 검색으로 장소 추가
            </Button>
          )}

        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
          <Button onClick={() => setMatchDialog(false)} sx={{ borderRadius: 2, color: '#999' }}>취소</Button>
          <Button variant="contained" onClick={saveMatchDate} disabled={!matchForm.date}
            sx={{ borderRadius: 2, bgcolor: '#2D336B', px: 3, fontWeight: 'bold',
              '&:hover': { bgcolor: '#1A1D4E' } }}>
            {editingMatch ? '수정' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 배너 추가 다이얼로그 */}
      <Dialog open={bannerDialog} onClose={() => setBannerDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>배너 추가</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="제목 (필수)" size="small" fullWidth value={bannerForm.title}
            onChange={e => setBannerForm(f => ({ ...f, title: e.target.value }))} />
          <TextField label="이미지 URL (선택)" size="small" fullWidth value={bannerForm.imageUrl}
            onChange={e => setBannerForm(f => ({ ...f, imageUrl: e.target.value }))}
            helperText="비워두면 제목만 표시되는 텍스트 배너" />
          <TextField label="클릭 시 이동 URL (선택)" size="small" fullWidth value={bannerForm.link}
            onChange={e => setBannerForm(f => ({ ...f, link: e.target.value }))} />
          <TextField label="순서 (숫자)" size="small" type="number" fullWidth value={bannerForm.order}
            onChange={e => setBannerForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBannerDialog(false)}>취소</Button>
          <Button variant="contained" onClick={saveBanner} disabled={!bannerForm.title.trim()}
            sx={{ bgcolor: '#F57C00' }}>추가</Button>
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

      {/* 권한 등급 변경 다이얼로그 */}
      <Dialog open={editPermDialog} onClose={() => setEditPermDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>권한 등급 변경</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600 }}>{editPermUser?.name}</Typography>
            <Chip label={roleLabel[editPermUser?.role]} size="small"
              sx={{ fontSize: '0.7rem', height: 22, bgcolor: roleColor[editPermUser?.role], color: 'white', fontWeight: 'bold' }} />
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>변경할 등급</InputLabel>
            <Select label="변경할 등급" value={editPermRole} onChange={e => setEditPermRole(e.target.value)}>
              {isMaster && <MenuItem value="admin">관리자</MenuItem>}
              <MenuItem value="moderator">운영진</MenuItem>
              <MenuItem value="verified">인증</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditPermDialog(false)}>취소</Button>
          <Button variant="contained" onClick={saveEditPerm}
            disabled={editPermRole === editPermUser?.role}>변경</Button>
        </DialogActions>
      </Dialog>

      {/* 리그 추가/수정 다이얼로그 — 모던 리디자인 */}
      <Dialog open={leagueDialog} onClose={() => setLeagueDialog(false)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden', boxShadow: '0 20px 60px rgba(13, 71, 161, 0.25)' } }}>
        {/* 헤더: 트로피 아이콘 + 타이틀 */}
        <Box sx={{
          position: 'relative',
          background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 70%, #01579B 100%)',
          pt: 3.5, pb: 2.8, px: 3, textAlign: 'center',
          overflow: 'hidden',
        }}>
          {/* 배경 장식 */}
          <Box sx={{
            position: 'absolute', top: -30, right: -30,
            width: 130, height: 130, borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.08)',
          }} />
          <Box sx={{
            position: 'absolute', bottom: -40, left: -20,
            width: 100, height: 100, borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.05)',
          }} />
          {/* 트로피 + 제목 */}
          <Box sx={{
            width: 56, height: 56, mx: 'auto', mb: 1.2, borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            position: 'relative', zIndex: 1,
          }}>
            <EmojiEventsIcon sx={{ color: '#FFD54F', fontSize: 32 }} />
          </Box>
          <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '1.25rem', letterSpacing: 0.3, position: 'relative', zIndex: 1 }}>
            {editingLeague ? '리그 수정' : '새 리그 만들기'}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', mt: 0.3, position: 'relative', zIndex: 1 }}>
            {editingLeague ? '리그 정보를 업데이트합니다' : '새로운 리그 시즌을 시작합니다'}
          </Typography>
        </Box>

        <DialogContent sx={{ px: 3, pt: '20px !important', pb: 2, bgcolor: '#FAFBFC' }}>

          {/* 🎯 리그 이름 */}
          <Typography sx={{ fontSize: '0.78rem', color: '#5E6A78', fontWeight: 800, mb: 1, letterSpacing: 0.5 }}>
            🎯 리그 이름
          </Typography>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder={`예: ${new Date().getFullYear()}년 ${clubName} 리그`}
            value={leagueForm.leagueName}
            onChange={e => setLeagueForm(f => ({ ...f, leagueName: e.target.value }))}
            sx={{
              mb: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5, bgcolor: 'white',
                fontSize: '0.95rem', fontWeight: 600,
                '& fieldset': { borderColor: '#E0E6ED' },
                '&:hover fieldset': { borderColor: '#90CAF9' },
                '&.Mui-focused fieldset': { borderColor: '#1565C0', borderWidth: 2 },
              },
            }}
          />
          {/* 빠른 이름 프리셋 */}
          <Box sx={{ display: 'flex', gap: 0.7, mb: 2.5, flexWrap: 'wrap' }}>
            {[
              { label: `${new Date().getFullYear()}년 ${clubName} 리그`, tag: '올해' },
              { label: `${new Date().getFullYear()}년 상반기 리그`, tag: '상반기' },
              { label: `${new Date().getFullYear()}년 하반기 리그`, tag: '하반기' },
            ].map((preset) => (
              <Chip
                key={preset.tag}
                label={preset.tag}
                size="small"
                onClick={() => setLeagueForm(f => ({ ...f, leagueName: preset.label }))}
                sx={{
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  bgcolor: leagueForm.leagueName === preset.label ? '#1565C0' : '#E3F2FD',
                  color: leagueForm.leagueName === preset.label ? 'white' : '#1565C0',
                  '&:hover': { bgcolor: leagueForm.leagueName === preset.label ? '#0D47A1' : '#BBDEFB' },
                }}
              />
            ))}
          </Box>

          {/* 📅 리그 기간 */}
          <Typography sx={{ fontSize: '0.78rem', color: '#5E6A78', fontWeight: 800, mb: 1, letterSpacing: 0.5 }}>
            📅 리그 기간
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
            <Box sx={{
              display: 'flex', gap: 1, alignItems: 'center',
              p: 1.2, borderRadius: 2.5, bgcolor: 'white',
              border: '1px solid #E0E6ED', mb: 1,
            }}>
              <DatePicker
                value={leagueForm.startDate ? dayjs(leagueForm.startDate) : null}
                onChange={(v) => setLeagueForm((f) => ({ ...f, startDate: v ? v.format('YYYY-MM-DD') : '' }))}
                format="YYYY.MM.DD"
                maxDate={leagueForm.endDate ? dayjs(leagueForm.endDate) : undefined}
                slotProps={{
                  textField: {
                    size: 'small', fullWidth: true, placeholder: '시작일',
                    sx: {
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2, fontSize: '0.88rem', fontWeight: 600,
                        '& fieldset': { border: 'none' },
                      },
                    },
                  },
                }}
              />
              <Box sx={{
                width: 24, height: 2, bgcolor: '#CFD8DC', flexShrink: 0,
              }} />
              <DatePicker
                value={leagueForm.endDate ? dayjs(leagueForm.endDate) : null}
                onChange={(v) => setLeagueForm((f) => ({ ...f, endDate: v ? v.format('YYYY-MM-DD') : '' }))}
                format="YYYY.MM.DD"
                minDate={leagueForm.startDate ? dayjs(leagueForm.startDate) : undefined}
                slotProps={{
                  textField: {
                    size: 'small', fullWidth: true, placeholder: '종료일',
                    sx: {
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2, fontSize: '0.88rem', fontWeight: 600,
                        '& fieldset': { border: 'none' },
                      },
                    },
                  },
                }}
              />
            </Box>
          </LocalizationProvider>

          {/* 기간 빠른 설정 */}
          <Box sx={{ display: 'flex', gap: 0.7, mb: 2, flexWrap: 'wrap' }}>
            {[
              { label: '1개월', months: 1 },
              { label: '3개월', months: 3 },
              { label: '6개월', months: 6 },
              { label: '1년', months: 12 },
            ].map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                size="small"
                onClick={() => {
                  const start = leagueForm.startDate ? dayjs(leagueForm.startDate) : dayjs();
                  const end = start.add(preset.months, 'month').subtract(1, 'day');
                  setLeagueForm(f => ({
                    ...f,
                    startDate: start.format('YYYY-MM-DD'),
                    endDate: end.format('YYYY-MM-DD'),
                  }));
                }}
                sx={{
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  bgcolor: '#F0F4F8', color: '#546E7A',
                  '&:hover': { bgcolor: '#E0E6ED', color: '#1565C0' },
                }}
              />
            ))}
          </Box>

          {/* 기간 요약 (라이브 피드백) */}
          {leagueForm.startDate && leagueForm.endDate && (() => {
            const s = dayjs(leagueForm.startDate);
            const e = dayjs(leagueForm.endDate);
            const days = e.diff(s, 'day') + 1;
            const months = Math.round((days / 30) * 10) / 10;
            return (
              <Box sx={{
                p: 1.5, borderRadius: 2, bgcolor: '#E3F2FD',
                display: 'flex', alignItems: 'center', gap: 1,
                border: '1px solid #BBDEFB',
              }}>
                <Typography sx={{ fontSize: '1.2rem' }}>⏱</Typography>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#0D47A1' }}>
                    총 {days}일 ({months}개월)
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#1565C0' }}>
                    {s.format('YYYY년 M월 D일')} ~ {e.format('YYYY년 M월 D일')}
                  </Typography>
                </Box>
              </Box>
            );
          })()}

        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1, bgcolor: '#FAFBFC' }}>
          <Button
            onClick={() => setLeagueDialog(false)}
            sx={{
              borderRadius: 2.5, color: '#78909C', fontWeight: 700, px: 2.5,
              '&:hover': { bgcolor: '#ECEFF1' },
            }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            onClick={saveLeague}
            disabled={!leagueForm.startDate || !leagueForm.endDate}
            startIcon={editingLeague ? <EditIcon sx={{ fontSize: '18px !important' }} /> : <EmojiEventsIcon sx={{ fontSize: '18px !important' }} />}
            sx={{
              borderRadius: 2.5, px: 3, py: 0.9, fontWeight: 800, fontSize: '0.88rem',
              background: 'linear-gradient(135deg, #1565C0, #0D47A1)',
              boxShadow: '0 4px 14px rgba(13, 71, 161, 0.35)',
              '&:hover': {
                background: 'linear-gradient(135deg, #0D47A1, #01579B)',
                boxShadow: '0 6px 20px rgba(13, 71, 161, 0.45)',
              },
              '&.Mui-disabled': {
                background: '#CFD8DC', color: '#90A4AE',
              },
            }}
          >
            {editingLeague ? '수정 저장' : '리그 만들기'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 마스터: 팀별 관리자 설정 다이얼로그 */}
      <Dialog open={clubAdminDialog} onClose={() => setClubAdminDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#7B1FA2' }}>
            {selectedClubForAdmin?.name} 관리자
          </Typography>
        </DialogTitle>
        <DialogContent>
          {/* 관리자 추가 */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1, alignItems: 'center' }}>
            <TextField size="small" label="이름" value={clubAdminName}
              onChange={e => setClubAdminName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addClubAdmin()}
              sx={{ flex: 2 }} />
            <FormControl size="small" sx={{ flex: 1.2 }}>
              <Select value={clubAdminRole} onChange={e => setClubAdminRole(e.target.value)}>
                <MenuItem value="admin">관리자</MenuItem>
                <MenuItem value="moderator">운영진</MenuItem>
                <MenuItem value="verified">인증</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={addClubAdmin} startIcon={<AddIcon />}
              sx={{ whiteSpace: 'nowrap', bgcolor: '#7B1FA2', minWidth: 'auto', flexShrink: 0 }}>추가</Button>
          </Box>

          <Divider sx={{ mb: 1.5 }}>현재 관리자</Divider>

          {clubAdmins.length === 0 ? (
            <Typography color="textSecondary" align="center" sx={{ py: 2 }}>등록된 관리자가 없습니다.</Typography>
          ) : (
            clubAdmins.map((a, idx) => (
              <Box key={`${a.role}-${a.emailKey}-${idx}`} sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                py: 0.8, px: 1.5, mb: 0.5, borderRadius: 2,
                bgcolor: roleBg[a.role] || '#F5F7FA',
                borderLeft: `4px solid ${roleColor[a.role]}`,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 600 }}>{a.name}</Typography>
                  <Chip label={roleLabel[a.role]} size="small"
                    sx={{ fontSize: '0.7rem', height: 22, bgcolor: roleColor[a.role], color: 'white', fontWeight: 'bold' }} />
                </Box>
                <IconButton size="small" onClick={() => removeClubAdmin(a)} sx={{ color: '#bbb' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
          <Button onClick={() => setClubAdminDialog(false)} variant="outlined">닫기</Button>
        </DialogActions>
      </Dialog>

      {/* 관리자 온보딩 튜토리얼 (첫 방문 시 자동) */}
      <OnboardingModal
        open={adminOnboarding.shouldShow}
        role="admin"
        onComplete={adminOnboarding.markSeen}
        onSkip={adminOnboarding.markSeen}
      />

    </Box>
  );
}

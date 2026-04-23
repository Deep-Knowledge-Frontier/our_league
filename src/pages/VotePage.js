import React, { useState, useEffect, useCallback } from 'react';
import { ref, onValue, runTransaction, get } from 'firebase/database';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Card, CardContent, Button,
  Grid, CircularProgress, Chip, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, Slide,
  List, ListItem, ListItemText, Divider, ListItemButton, ListItemIcon,
  TextField, IconButton, Avatar,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpIcon from '@mui/icons-material/Help';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import LockIcon from '@mui/icons-material/Lock';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PlaceIcon from '@mui/icons-material/Place';
import MapIcon from '@mui/icons-material/Map';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/app.config';
import {
  parseDateKeyLocal, normalizeNames, ensureArray, getDaysDiff,
  extractHourMinute, formatHHMM, formatDateWithDay
} from '../utils/format';

const SlideUp = React.forwardRef((props, ref) => <Slide direction="up" ref={ref} {...props} />);
// 🆕 중앙 정렬 + 모든 모서리 둥글게 (이전에는 화면 하단에 고정되어 웹/PC에서 너무 내려 붙었음)
const bottomSheetProps = {
  TransitionComponent: SlideUp,
  PaperProps: { sx: { borderRadius: 3, m: 2, maxHeight: '85vh', width: { xs: 'calc(100% - 32px)', sm: 'auto' } } },
};

function VotePage() {
  const navigate = useNavigate();
  const { userName, emailKey, clubName, authReady, user, isDemoGuest } = useAuth();

  const [loading, setLoading] = useState(true);
  const [matchList, setMatchList] = useState([]);
  const [votesData, setVotesData] = useState({});
  const [teamExistence, setTeamExistence] = useState({});
  // 🆕 날짜별 팀/드래프트/포메이션 공개 상태 (관리탭 변경 사항 실시간 반영)
  const [teamInfo, setTeamInfo] = useState({}); // {[date]: { hasTeam, draftStatus, formationOpen }}

  // 다이얼로그 상태
  const [openList, setOpenList] = useState(false);
  const [dialogDateStr, setDialogDateStr] = useState('');
  const [dialogSubTitle, setDialogSubTitle] = useState('');
  const [listNames, setListNames] = useState([]);
  const [dialogType, setDialogType] = useState('');
  const [dialogDateKey, setDialogDateKey] = useState('');

  const [openAlert, setOpenAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const [openGuestDialog, setOpenGuestDialog] = useState(false);
  const [selectedMatchDate, setSelectedMatchDate] = useState('');
  const [guestInputName, setGuestInputName] = useState('');
  const [myGuests, setMyGuests] = useState([]);

  const [openMapDialog, setOpenMapDialog] = useState(false);
  const [mapQuery, setMapQuery] = useState('');

  const [openAttendMode, setOpenAttendMode] = useState(false);
  const [openAttendTime, setOpenAttendTime] = useState(false);
  const [attendDateKey, setAttendDateKey] = useState('');
  const [attendMatchTime, setAttendMatchTime] = useState('');
  const [timeSlots, setTimeSlots] = useState([]);
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(1);

  const [weatherByDate, setWeatherByDate] = useState({});
  const [weatherRequested, setWeatherRequested] = useState({});

  const { lat: WEATHER_LAT, lon: WEATHER_LON } = APP_CONFIG.weatherLocation;
  const SLOT_MIN = APP_CONFIG.timeSlotMinutes;
  const WINDOW_MIN = APP_CONFIG.timeWindowMinutes;

  const getIsVotingAllowed = (dateStr) => getDaysDiff(dateStr) >= 1;

  const getIsTimeReady = (dateStr) => {
    const now = new Date();
    const matchDate = parseDateKeyLocal(dateStr);
    const openTime = new Date(matchDate);
    openTime.setDate(openTime.getDate() - 1);
    openTime.setHours(18, 0, 0, 0);
    return now >= openTime;
  };

  const windLevelLabel = (ms) => {
    if (!Number.isFinite(ms)) return '';
    if (ms < 2.0) return '약함';
    if (ms < 5.0) return '보통';
    if (ms < 9.0) return '강함';
    return '매우강함';
  };

  const roundToNearestHour = (hour, minute) => {
    if (hour < 0) return -1;
    let h = hour;
    if (minute >= 30) h += 1;
    return Math.min(Math.max(h, 0), 23);
  };

  const findHourlyIndex = (times, dateKey, targetHour) => {
    if (!Array.isArray(times)) return -1;
    for (let i = 0; i < times.length; i++) {
      const t = String(times[i] || '');
      if (!t.startsWith(dateKey + 'T')) continue;
      if (parseInt(t.substring(11, 13), 10) === targetHour) return i;
    }
    for (let i = 0; i < times.length; i++) {
      if (String(times[i] || '').startsWith(dateKey + 'T')) return i;
    }
    return -1;
  };

  const fetchWeatherForDate = useCallback(async (dateKey, matchTime) => {
    const { hour, minute } = extractHourMinute(matchTime);
    const targetHour = hour >= 0 ? roundToNearestHour(hour, minute) : 9;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&hourly=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&start_date=${dateKey}&end_date=${dateKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
    const data = await res.json();
    const hourly = data?.hourly;
    if (!hourly) throw new Error('No hourly data');

    const times = hourly.time || [];
    let idx = findHourlyIndex(times, dateKey, targetHour);
    if (idx < 0) idx = 0;

    return {
      dateKey, hourUsed: targetHour,
      temp: hourly.temperature_2m?.[idx] ?? null,
      feelsLike: hourly.apparent_temperature?.[idx] ?? null,
      precipitationMm: hourly.precipitation?.[idx] ?? null,
      windSpeedMs: hourly.wind_speed_10m?.[idx] ?? null,
    };
  }, [WEATHER_LAT, WEATHER_LON]);

  const renderWeatherLine = (w) => {
    if (!w) return '날씨 불러오는 중…';
    const parts = [];
    if (Number.isFinite(w.temp)) {
      const t = Math.round(w.temp);
      parts.push(Number.isFinite(w.feelsLike) ? `${t}°C (체감 ${Math.round(w.feelsLike)}°C)` : `${t}°C`);
    }
    if (Number.isFinite(w.precipitationMm) && w.precipitationMm > 0)
      parts.push(`강수 ${Number(w.precipitationMm).toFixed(1)}mm`);
    const wl = windLevelLabel(w.windSpeedMs);
    if (wl) parts.push(`바람 ${wl}`);
    return parts.length ? parts.join(' | ') : '날씨 정보를 불러올 수 없어요.';
  };

  // 데이터 리스너
  useEffect(() => {
    if (isDemoGuest) {
      setLoading(false);
      // 데모 게스트: 한강FC 다음 경기 샘플 로드
      get(ref(db, `MatchDates/한강FC`)).then(snap => {
        if (!snap.exists()) return;
        const data = snap.val();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const active = Object.keys(data)
          .filter(dk => {
            const isActive = data[dk]?.isActive === true || data[dk]?.isActive === 'true';
            const d = parseDateKeyLocal(dk);
            return isActive && !isNaN(d) && d >= today;
          })
          .sort()
          .slice(0, 2)
          .map(dk => ({ date: dk, time: data[dk]?.time || '', location: data[dk]?.location || '', address: data[dk]?.address || '' }));
        setMatchList(active);
      });
      return;
    }
    if (!authReady || !user || !clubName) return;
    setLoading(true);

    const matchesRef = ref(db, `MatchDates/${clubName}`);
    const votesRef = ref(db, `PlayerSelectionByDate/${clubName}`);

    const unsubMatches = onValue(matchesRef, (snap) => {
      const data = snap.val();
      if (!data) { setMatchList([]); return; }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const active = Object.keys(data)
        .filter((dk) => {
          const isActive = data[dk]?.isActive === true || data[dk]?.isActive === 'true';
          const matchDate = parseDateKeyLocal(dk);
          return isActive && !isNaN(matchDate) && matchDate >= today;
        })
        .sort()
        .map((dk) => ({
          date: dk,
          time: data[dk]?.time || '',
          location: data[dk]?.location || '',
          address: data[dk]?.address || '',
        }));
      setMatchList(active);
    });

    const unsubVotes = onValue(votesRef, (snap) => {
      if (snap.exists()) {
        const vd = snap.val();
        setVotesData(vd);
        const em = {};
        Object.keys(vd).forEach((dk) => { if (vd[dk]?.AttandPlayer?.A) em[dk] = true; });
        setTeamExistence(em);
      } else {
        setVotesData({});
        setTeamExistence({});
      }
      setLoading(false);
    });

    return () => { unsubMatches(); unsubVotes(); };
  }, [authReady, user, clubName]);

  // 날씨 로드
  useEffect(() => {
    if (!matchList?.length) return;
    matchList.forEach((m) => {
      if (!m.date || weatherByDate[m.date] || weatherRequested[m.date]) return;
      setWeatherRequested((prev) => ({ ...prev, [m.date]: true }));
      fetchWeatherForDate(m.date, m.time)
        .then((info) => setWeatherByDate((prev) => ({ ...prev, [m.date]: info })))
        .catch(() => setWeatherByDate((prev) => ({ ...prev, [m.date]: { dateKey: m.date } })));
    });
  }, [matchList, fetchWeatherForDate]); // eslint-disable-line

  // 🆕 날짜별 팀/드래프트/포메이션 실시간 구독 — 관리탭 변경사항이 투표 탭에 즉시 반영
  useEffect(() => {
    if (!clubName || !matchList?.length) return;
    const offs = [];
    matchList.forEach(({ date }) => {
      if (!date) return;
      const base = `PlayerSelectionByDate/${clubName}/${date}`;
      // A팀 로스터 — 팀 구성 완료 여부 판단 (비어있지 않은 배열)
      const offTeam = onValue(ref(db, `${base}/AttandPlayer/A`), (snap) => {
        const v = snap.val();
        const hasTeam = Array.isArray(v) && v.filter(Boolean).length > 0;
        setTeamInfo((prev) => ({
          ...prev,
          [date]: { ...(prev[date] || {}), hasTeam },
        }));
      });
      // 주장 드래프트 상태
      const offDraft = onValue(ref(db, `${base}/Draft/status`), (snap) => {
        const v = snap.exists() ? snap.val() : null;
        setTeamInfo((prev) => ({
          ...prev,
          [date]: { ...(prev[date] || {}), draftStatus: v },
        }));
      });
      // 포메이션 공개 여부
      const offFO = onValue(ref(db, `${base}/FormationOpen`), (snap) => {
        const v = snap.val() === true;
        setTeamInfo((prev) => ({
          ...prev,
          [date]: { ...(prev[date] || {}), formationOpen: v },
        }));
      });
      offs.push(offTeam, offDraft, offFO);
    });
    return () => offs.forEach((f) => f());
  }, [clubName, matchList]);

  const getMyStatus = (date) => {
    const dd = votesData[date];
    if (!dd || !userName) return null;
    if (ensureArray(dd.AttandPlayer?.all).includes(userName)) return 'attend';
    if (ensureArray(dd.AbsentPlayer?.all).includes(userName)) return 'absent';
    if (ensureArray(dd.UndecidedPlayer?.all).includes(userName)) return 'undecided';
    return null;
  };

  const getListByType = (date, type) => {
    const dd = votesData[date] || {};
    if (type === 'attend') return normalizeNames(dd.AttandPlayer?.all);
    if (type === 'absent') return normalizeNames(dd.AbsentPlayer?.all);
    if (type === 'undecided') return normalizeNames(dd.UndecidedPlayer?.all);
    return [];
  };

  const getCount = (date, type) => getListByType(date, type).length;

  const getTotalGuestCount = (date) => {
    const guests = votesData[date]?.Guests;
    if (!guests) return 0;
    return Object.values(guests).reduce((c, g) => c + normalizeNames(g).length, 0);
  };

  const getAttendLabel = (dayData, name) => {
    if (String(name).includes('(용병)')) return '전체';
    if (!dayData?.AttendTime) return '전체';
    const values = Object.values(dayData.AttendTime || {});
    for (const r of values) {
      if (!r || r.name !== name) continue;
      if (r.full === true) return '전체';
      if (r.full === false && r.start && r.end) return `${r.start}~${r.end}`;
    }
    return '전체';
  };

  const openNameListDialog = (date, type) => {
    const names = getListByType(date, type);
    const typeLabel = type === 'attend' ? '참석' : type === 'absent' ? '불참' : '미정';
    setDialogDateStr(formatDateWithDay(date));
    setDialogSubTitle(`${typeLabel} 명단 (${names.length}명)`);
    setListNames(names);
    setDialogType(type);
    setDialogDateKey(date);
    setOpenList(true);
  };

  const closeNameListDialog = () => { setOpenList(false); setListNames([]); };

  const handleLocationClick = (address, locationName) => {
    const query = address || locationName;
    if (!query) return;
    setMapQuery(query);
    setOpenMapDialog(true);
  };

  const openMap = (service) => {
    const q = encodeURIComponent(mapQuery);
    const urls = {
      kakao: `https://map.kakao.com/link/search/${q}`,
      naver: `https://m.map.naver.com/search2/search.naver?query=${q}`,
      google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    };
    if (urls[service]) window.open(urls[service], '_blank');
    setOpenMapDialog(false);
  };

  const buildTimeSlots = (dateKey, matchTime) => {
    const base = parseDateKeyLocal(dateKey);
    let { hour, minute } = extractHourMinute(matchTime);
    if (hour < 0) { hour = 9; minute = 0; }
    const start = new Date(base); start.setHours(hour, minute, 0, 0);
    const slots = [];
    const c = new Date(start);
    for (let m = 0; m <= WINDOW_MIN; m += SLOT_MIN) {
      if (c.getDate() !== start.getDate()) break;
      slots.push(formatHHMM(c));
      c.setMinutes(c.getMinutes() + SLOT_MIN);
    }
    return slots;
  };

  const handleVote = (date, type, isFull = true, start = null, end = null) => {
    if (!getIsVotingAllowed(date)) { setAlertMessage('투표가 마감되었습니다.'); setOpenAlert(true); return; }
    if (!userName || !emailKey) { setAlertMessage('사용자 정보를 불러오는 중입니다.'); setOpenAlert(true); return; }

    const dateRef = ref(db, `PlayerSelectionByDate/${clubName}/${date}`);
    runTransaction(dateRef, (cur) => {
      if (!cur) cur = { AttandPlayer: { all: [] }, AbsentPlayer: { all: [] }, UndecidedPlayer: { all: [] } };
      if (!cur.AttandPlayer) cur.AttandPlayer = {};
      if (!cur.AbsentPlayer) cur.AbsentPlayer = {};
      if (!cur.UndecidedPlayer) cur.UndecidedPlayer = {};

      let attend = normalizeNames(cur.AttandPlayer.all).filter((n) => n !== userName);
      let absent = normalizeNames(cur.AbsentPlayer.all).filter((n) => n !== userName);
      let undecided = normalizeNames(cur.UndecidedPlayer.all).filter((n) => n !== userName);

      if (type === 'attend') attend.push(userName);
      else if (type === 'absent') absent.push(userName);
      else if (type === 'undecided') undecided.push(userName);

      cur.AttandPlayer.all = attend;
      cur.AbsentPlayer.all = absent;
      cur.UndecidedPlayer.all = undecided;

      if (!cur.AttendTime) cur.AttendTime = {};
      if (type === 'attend') {
        cur.AttendTime[emailKey] = { name: userName, full: !!isFull, start: isFull ? null : start, end: isFull ? null : end };
      } else if (cur.AttendTime[emailKey]) {
        delete cur.AttendTime[emailKey];
      }
      return cur;
    }).catch((err) => alert('투표 에러: ' + err.message));
  };

  const openAttendModeDialog = (dateKey, matchTime) => {
    if (!getIsVotingAllowed(dateKey)) { setAlertMessage('투표가 마감되었습니다.'); setOpenAlert(true); return; }
    setAttendDateKey(dateKey);
    setAttendMatchTime(matchTime || '');
    setOpenAttendMode(true);
  };

  const openAttendTimeDialog = () => {
    const slots = buildTimeSlots(attendDateKey, attendMatchTime);
    if (slots.length < 2) { setOpenAttendMode(false); handleVote(attendDateKey, 'attend'); return; }
    setTimeSlots(slots);
    setStartIdx(0);
    // 🆕 기본값: 첫 시간 ~ 마지막에서 30분 전까지 (마지막 30분 슬롯 제외)
    // 길이가 2면 (슬롯 1개뿐) 어쩔 수 없이 full 범위 사용
    setEndIdx(Math.max(1, slots.length - 2));
    setOpenAttendMode(false);
    setOpenAttendTime(true);
  };

  useEffect(() => {
    if (!openAttendTime || timeSlots.length < 2) return;
    const minEnd = startIdx + 1;
    if (endIdx < minEnd) setEndIdx(minEnd);
    if (endIdx > timeSlots.length - 1) setEndIdx(timeSlots.length - 1);
  }, [startIdx, openAttendTime, timeSlots.length]); // eslint-disable-line

  const confirmAttendTime = () => {
    const s = timeSlots[startIdx], e = timeSlots[endIdx];
    if (!s || !e) { setAlertMessage('시간 선택이 올바르지 않습니다.'); setOpenAlert(true); return; }
    setOpenAttendTime(false);
    handleVote(attendDateKey, 'attend', false, s, e);
  };

  // 용병 관리
  const handleOpenGuestDialog = (date) => {
    if (!getIsVotingAllowed(date)) { setAlertMessage('용병 등록/삭제가 마감되었습니다.'); setOpenAlert(true); return; }
    setSelectedMatchDate(date);
    setGuestInputName('');
    setMyGuests(emailKey && votesData[date]?.Guests?.[emailKey] ? normalizeNames(votesData[date].Guests[emailKey]) : []);
    setOpenGuestDialog(true);
  };

  const handleAddGuest = () => {
    const name = guestInputName.trim();
    if (!name) { setAlertMessage('용병 이름을 입력해주세요.'); setOpenAlert(true); return; }

    const dateRef = ref(db, `PlayerSelectionByDate/${clubName}/${selectedMatchDate}`);
    runTransaction(dateRef, (cur) => {
      if (!cur) cur = {};
      if (!cur.Guests) cur.Guests = {};
      if (!cur.Guests[emailKey]) cur.Guests[emailKey] = [];
      let myG = normalizeNames(cur.Guests[emailKey]);
      if (!myG.includes(name)) myG.push(name);
      cur.Guests[emailKey] = myG;

      if (!cur.AttandPlayer) cur.AttandPlayer = {};
      let attend = normalizeNames(cur.AttandPlayer.all);
      const displayName = `${name} (용병)`;
      if (!attend.includes(displayName)) attend.push(displayName);
      cur.AttandPlayer.all = attend;
      return cur;
    }).then(() => {
      setGuestInputName('');
      setMyGuests((prev) => prev.includes(name) ? prev : [...prev, name]);
    }).catch((err) => alert('용병 추가 실패: ' + err.message));
  };

  const handleRemoveGuest = (guestName) => {
    const dateRef = ref(db, `PlayerSelectionByDate/${clubName}/${selectedMatchDate}`);
    runTransaction(dateRef, (cur) => {
      if (!cur) return cur;
      if (cur.Guests?.[emailKey]) {
        cur.Guests[emailKey] = normalizeNames(cur.Guests[emailKey]).filter((n) => n !== guestName);
      }
      if (cur.AttandPlayer) {
        cur.AttandPlayer.all = normalizeNames(cur.AttandPlayer.all).filter((n) => n !== `${guestName} (용병)`);
      }
      return cur;
    }).then(() => setMyGuests((prev) => prev.filter((n) => n !== guestName)))
      .catch((err) => alert('용병 삭제 실패: ' + err.message));
  };

  // 🆕 날짜별 팀 구성 버튼 상태 계산 (관리탭 상태에 따라 동적 문구/색/이동 경로)
  const getTeamButtonState = (date) => {
    const info = teamInfo[date] || {};
    const isTimeReady = getIsTimeReady(date);
    const { hasTeam, draftStatus, formationOpen } = info;

    // 1. 주장 드래프트 진행 중
    if (draftStatus === 'active') {
      return { text: '⚔️ 주장 드래프트 진행 중', disabled: false, target: 'draft', bg: '#7B1FA2', hoverBg: '#4A148C' };
    }
    // 2. 주장 드래프트 결과 검토 중
    if (draftStatus === 'review') {
      return { text: '🔍 드래프트 결과 확인 중', disabled: false, target: 'draft', bg: '#6A1B9A', hoverBg: '#4A148C' };
    }
    // 3. 주장 드래프트 확정 — 팀 보기
    if (draftStatus === 'confirmed' && hasTeam) {
      return { text: '✅ 팀 확정 — 팀 보기', disabled: false, target: 'team', bg: '#2E7D32', hoverBg: '#1B5E20' };
    }
    // 4. 팀 + 포메이션 공개
    if (hasTeam && formationOpen) {
      return { text: '📋 팀 + 포메이션 보기', disabled: false, target: 'team', bg: '#1565C0', hoverBg: '#0D47A1' };
    }
    // 5. 팀 구성만 완료
    if (hasTeam) {
      return { text: '▶ 팀 구성 보기', disabled: false, target: 'team', bg: '#1565C0', hoverBg: '#0D47A1' };
    }
    // 6. 시간 도달했지만 팀 미구성
    if (isTimeReady) {
      return { text: '⏳ 팀 구성 준비 중', disabled: true, target: null, bg: '#E0E0E0', hoverBg: '#E0E0E0' };
    }
    // 7. 시간 전
    return { text: '🔒 팀 구성 대기 (오픈 전)', disabled: true, target: null, bg: '#E0E0E0', hoverBg: '#E0E0E0' };
  };

  const goToTeamBuild = (date) => {
    const st = getTeamButtonState(date);
    if (st.disabled) {
      setAlertMessage(!getIsTimeReady(date)
        ? '팀 구성은 경기 전날 오후 6시(18:00)부터 공개됩니다.'
        : '아직 팀구성이 완료되지 않았습니다.\n(운영진이 팀을 구성 중입니다)');
      setOpenAlert(true); return;
    }
    if (st.target === 'draft') { navigate(`/draft/${date}`); return; }
    if (st.target === 'team') { navigate(`/team/${date}`); return; }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 5, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>데이터를 불러오는 중입니다...</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 12 }}>
    <Container maxWidth="sm" sx={{ pt: 2, pb: 12 }}>
      <Card sx={{
        mb: 2.5, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
        background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
      }}>
        <CardContent sx={{ py: 2.5, textAlign: 'center' }}>
          <CalendarMonthIcon sx={{ fontSize: 28, color: 'rgba(255,255,255,0.4)', mb: 0.5 }} />
          <Typography variant="h5" sx={{ color: 'white', fontWeight: 900 }}>
            경기 일정 투표
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', mt: 0.3 }}>
            {userName ? <strong>{userName}</strong> : '회원'}님, 경기 참여 여부를 선택해주세요.
          </Typography>
        </CardContent>
      </Card>

      {matchList.length === 0 ? (
        <Alert severity="warning" sx={{ justifyContent: 'center' }}>현재 진행 중인 투표가 없습니다.</Alert>
      ) : (
        matchList.map((match) => {
          const { date, time, location, address } = match;
          const myStatus = getMyStatus(date);
          const formattedDate = formatDateWithDay(date);
          const isVotingAllowed = getIsVotingAllowed(date);
          const totalGuests = getTotalGuestCount(date);
          const weatherInfo = weatherByDate[date];
          // 🆕 팀 구성 버튼 상태 (관리탭 상태별 동적 문구/색/disabled)
          const teamBtn = getTeamButtonState(date);

          return (
            <Card key={date} sx={{ mb: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  <Typography variant="h5" fontWeight="bold">{formattedDate}</Typography>
                  {!isVotingAllowed && <Chip icon={<LockIcon fontSize="small" />} label="투표 마감" color="error" size="small" variant="outlined" />}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 1.2, color: 'text.secondary', flexWrap: 'wrap' }}>
                  {time && (
                    <Box sx={{ display: 'flex', alignItems: 'center', backgroundColor: '#f5f5f5', px: 1.5, py: 0.5, borderRadius: 2 }}>
                      <AccessTimeIcon fontSize="small" sx={{ mr: 0.5, color: 'primary.main' }} />
                      <Typography variant="body1" fontWeight="medium">{time}</Typography>
                    </Box>
                  )}
                  {location && (
                    <Box onClick={() => handleLocationClick(address, location)}
                      sx={{ display: 'flex', alignItems: 'center', backgroundColor: '#e3f2fd', px: 1.5, py: 0.5, borderRadius: 2, cursor: 'pointer', '&:hover': { backgroundColor: '#bbdefb' } }}>
                      <PlaceIcon fontSize="small" sx={{ mr: 0.5, color: 'primary.main' }} />
                      <Typography variant="body1" fontWeight="bold" color="primary.main">{location}</Typography>
                    </Box>
                  )}
                </Box>

                <Typography variant="body2" sx={{ mb: 2.5, color: 'text.secondary' }}>{renderWeatherLine(weatherInfo)}</Typography>

                <Stack direction="row" justifyContent="center" spacing={1} sx={{ mb: 3 }}>
                  <Chip clickable onClick={() => openNameListDialog(date, 'attend')} label={`참석 ${getCount(date, 'attend')}명 ›`} color="success" variant={myStatus === 'attend' ? 'filled' : 'outlined'} />
                  <Chip clickable onClick={() => openNameListDialog(date, 'absent')} label={`불참 ${getCount(date, 'absent')}명 ›`} color="error" variant={myStatus === 'absent' ? 'filled' : 'outlined'} />
                  <Chip clickable onClick={() => openNameListDialog(date, 'undecided')} label={`미정 ${getCount(date, 'undecided')}명 ›`} color="default" variant={myStatus === 'undecided' ? 'filled' : 'outlined'} />
                </Stack>

                <Grid container spacing={1} justifyContent="center" sx={{ mb: 2 }}>
                  <Grid item xs={4} sm={3}>
                    <Button fullWidth variant={myStatus === 'attend' ? 'contained' : 'outlined'} color="success" startIcon={<CheckCircleIcon />}
                      onClick={() => isVotingAllowed ? openAttendModeDialog(date, time) : (setAlertMessage('투표가 마감되었습니다.'), setOpenAlert(true))}
                      sx={{ height: 45, fontSize: '0.9rem', opacity: isVotingAllowed ? 1 : 0.5 }}>참석</Button>
                  </Grid>
                  <Grid item xs={4} sm={3}>
                    <Button fullWidth variant={myStatus === 'absent' ? 'contained' : 'outlined'} color="error" startIcon={<CancelIcon />}
                      onClick={() => handleVote(date, 'absent')}
                      sx={{ height: 45, fontSize: '0.9rem', opacity: isVotingAllowed ? 1 : 0.5 }}>불참</Button>
                  </Grid>
                  <Grid item xs={4} sm={3}>
                    <Button fullWidth variant={myStatus === 'undecided' ? 'contained' : 'outlined'} color="inherit" startIcon={<HelpIcon />}
                      onClick={() => handleVote(date, 'undecided')}
                      sx={{ height: 45, fontSize: '0.9rem', borderColor: 'grey.400', opacity: isVotingAllowed ? 1 : 0.5 }}>미정</Button>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Button variant="outlined" color="primary" disabled={!isVotingAllowed} startIcon={<PersonAddIcon />}
                  onClick={() => handleOpenGuestDialog(date)} sx={{ mb: 2, borderRadius: 2, width: '80%' }}>
                  용병(지인) 등록/관리 {totalGuests > 0 && `(현재 ${totalGuests}명)`}
                </Button>

                <Box>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<GroupIcon />}
                    onClick={() => goToTeamBuild(date)}
                    disabled={teamBtn.disabled}
                    sx={{
                      height: 48, borderRadius: 2, fontWeight: 'bold',
                      backgroundColor: teamBtn.bg,
                      color: teamBtn.disabled ? '#757575' : 'white',
                      boxShadow: teamBtn.disabled ? 'none' : '0 2px 8px rgba(21,101,192,0.25)',
                      '&:hover': { backgroundColor: teamBtn.hoverBg },
                      '&.Mui-disabled': { backgroundColor: teamBtn.bg, color: '#757575' },
                    }}
                  >
                    {teamBtn.text}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* 참석 모드 선택 */}
      <Dialog open={openAttendMode} onClose={() => setOpenAttendMode(false)} {...bottomSheetProps}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>참석</DialogTitle>
        <DialogContent><DialogContentText>시간을 선택하지 않으면 전체 운동 시간 참석으로 처리됩니다.</DialogContentText></DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAttendMode(false)} color="inherit">취소</Button>
          <Button onClick={() => { setOpenAttendMode(false); handleVote(attendDateKey, 'attend'); }} variant="contained" color="success">전체 참석</Button>
          <Button onClick={openAttendTimeDialog} variant="outlined" color="success">시간 선택</Button>
        </DialogActions>
      </Dialog>

      {/* 시간 선택 — 타임라인 + 프리셋 기반 직관적 범위 선택 */}
      <Dialog open={openAttendTime} onClose={() => setOpenAttendTime(false)} fullWidth maxWidth="xs" {...bottomSheetProps}>
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center', pb: 0.5, fontSize: '1.05rem' }}>참석 시간 선택</DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          {(() => {
            // 총 참석 시간 (분) 계산 — 시간 문자열 '07:30' → 450분
            const toMinutes = (hhmm) => {
              if (!hhmm) return 0;
              const [h, m] = hhmm.split(':').map(Number);
              return (h || 0) * 60 + (m || 0);
            };
            const formatDuration = (mins) => {
              if (mins <= 0) return '0분';
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              if (h === 0) return `${m}분`;
              if (m === 0) return `${h}시간`;
              return `${h}시간 ${m}분`;
            };
            const startTime = timeSlots[startIdx] || '';
            const endTime = timeSlots[endIdx] || '';
            const durationMin = Math.max(0, toMinutes(endTime) - toMinutes(startTime));
            const lastIdx = Math.max(0, timeSlots.length - 1);
            // 타임라인 Chip의 "가까운 쪽 끝" 당기기 로직
            const handleSlotTap = (idx) => {
              if (idx === startIdx || idx === endIdx) return;
              const distToStart = Math.abs(idx - startIdx);
              const distToEnd = Math.abs(idx - endIdx);
              if (distToStart <= distToEnd) {
                // 시작점 이동 — endIdx - 1 을 넘지 않도록
                setStartIdx(Math.max(0, Math.min(idx, endIdx - 1)));
              } else {
                // 끝점 이동 — startIdx + 1 이상 유지
                setEndIdx(Math.min(lastIdx, Math.max(idx, startIdx + 1)));
              }
            };
            const applyPreset = (kind) => {
              if (lastIdx < 1) return;
              if (kind === 'full') { setStartIdx(0); setEndIdx(lastIdx); }
              else if (kind === 'firstHalf') { setStartIdx(0); setEndIdx(Math.max(1, Math.ceil(lastIdx / 2))); }
              else if (kind === 'secondHalf') { setStartIdx(Math.floor(lastIdx / 2)); setEndIdx(lastIdx); }
            };
            const isFull = startIdx === 0 && endIdx === lastIdx;
            const isFirstHalf = startIdx === 0 && endIdx === Math.max(1, Math.ceil(lastIdx / 2));
            const isSecondHalf = startIdx === Math.floor(lastIdx / 2) && endIdx === lastIdx;

            return (
              <>
                {/* ── 선택 요약 카드 ── */}
                <Box sx={{
                  background: 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                  color: 'white', borderRadius: 3, p: 2, mb: 2,
                  textAlign: 'center', boxShadow: '0 4px 12px rgba(46,125,50,0.25)',
                }}>
                  <Typography sx={{ fontSize: '0.72rem', opacity: 0.9, letterSpacing: 1, mb: 0.4 }}>
                    참석 시간
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.2 }}>
                    <Typography sx={{ fontSize: '1.7rem', fontWeight: 900, fontFeatureSettings: '"tnum"' }}>
                      {startTime || '--:--'}
                    </Typography>
                    <Typography sx={{ fontSize: '1.1rem', opacity: 0.85 }}>→</Typography>
                    <Typography sx={{ fontSize: '1.7rem', fontWeight: 900, fontFeatureSettings: '"tnum"' }}>
                      {endTime || '--:--'}
                    </Typography>
                  </Box>
                  <Chip
                    icon={<AccessTimeIcon sx={{ fontSize: '14px !important', color: 'white !important' }} />}
                    label={`총 ${formatDuration(durationMin)}`}
                    size="small"
                    sx={{
                      mt: 0.8, bgcolor: 'rgba(255,255,255,0.22)', color: 'white',
                      fontWeight: 700, fontSize: '0.72rem', border: '1px solid rgba(255,255,255,0.3)',
                    }}
                  />
                </Box>

                {/* ── 빠른 선택 프리셋 ── */}
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#666', mb: 0.6 }}>
                    ⚡ 빠른 선택
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
                    <Chip
                      label="전체"
                      onClick={() => applyPreset('full')}
                      size="small"
                      sx={{
                        fontWeight: 700, fontSize: '0.78rem', py: 1.6, px: 0.6,
                        bgcolor: isFull ? '#2E7D32' : '#E8F5E9',
                        color: isFull ? 'white' : '#2E7D32',
                        border: isFull ? '1px solid #1B5E20' : '1px solid #C8E6C9',
                        '&:hover': { bgcolor: isFull ? '#1B5E20' : '#C8E6C9' },
                      }}
                    />
                    <Chip
                      label="앞 절반"
                      onClick={() => applyPreset('firstHalf')}
                      size="small"
                      sx={{
                        fontWeight: 700, fontSize: '0.78rem', py: 1.6, px: 0.6,
                        bgcolor: isFirstHalf ? '#1565C0' : '#E3F2FD',
                        color: isFirstHalf ? 'white' : '#1565C0',
                        border: isFirstHalf ? '1px solid #0D47A1' : '1px solid #BBDEFB',
                        '&:hover': { bgcolor: isFirstHalf ? '#0D47A1' : '#BBDEFB' },
                      }}
                    />
                    <Chip
                      label="뒤 절반"
                      onClick={() => applyPreset('secondHalf')}
                      size="small"
                      sx={{
                        fontWeight: 700, fontSize: '0.78rem', py: 1.6, px: 0.6,
                        bgcolor: isSecondHalf ? '#E65100' : '#FFF3E0',
                        color: isSecondHalf ? 'white' : '#E65100',
                        border: isSecondHalf ? '1px solid #BF360C' : '1px solid #FFE0B2',
                        '&:hover': { bgcolor: isSecondHalf ? '#BF360C' : '#FFE0B2' },
                      }}
                    />
                  </Box>
                </Box>

                {/* ── 직접 선택 타임라인 ── */}
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#666', mb: 0.8 }}>
                  🎯 직접 선택 <span style={{ fontWeight: 400, color: '#999' }}>· 시간을 터치하면 가까운 쪽이 당겨집니다</span>
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                  {timeSlots.map((t, idx) => {
                    const isStart = idx === startIdx;
                    const isEnd = idx === endIdx;
                    const isEndpoint = isStart || isEnd;
                    const isInside = idx > startIdx && idx < endIdx;
                    return (
                      <Chip
                        key={t + idx}
                        label={t}
                        size="small"
                        onClick={() => handleSlotTap(idx)}
                        sx={{
                          fontWeight: isEndpoint ? 900 : isInside ? 700 : 500,
                          fontSize: isEndpoint ? '0.8rem' : '0.74rem',
                          minWidth: 52,
                          height: isEndpoint ? 30 : 26,
                          transition: 'all 0.18s',
                          bgcolor: isStart ? '#2E7D32'
                            : isEnd ? '#E65100'
                            : isInside ? '#C8E6C9'
                            : '#F5F5F5',
                          color: isEndpoint ? 'white' : isInside ? '#1B5E20' : '#666',
                          border: isStart ? '2px solid #1B5E20'
                            : isEnd ? '2px solid #BF360C'
                            : isInside ? '1px solid #A5D6A7'
                            : '1px solid #E0E0E0',
                          boxShadow: isEndpoint ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                          cursor: 'pointer',
                          '&:hover': {
                            bgcolor: isStart ? '#1B5E20'
                              : isEnd ? '#BF360C'
                              : isInside ? '#A5D6A7'
                              : '#E0E0E0',
                          },
                        }}
                      />
                    );
                  })}
                </Box>

                {/* ── 범례 ── */}
                <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', mt: 1.2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <Box sx={{ width: 12, height: 12, bgcolor: '#2E7D32', borderRadius: 0.5 }} />
                    <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>시작</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <Box sx={{ width: 12, height: 12, bgcolor: '#C8E6C9', border: '1px solid #A5D6A7', borderRadius: 0.5 }} />
                    <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>참석</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <Box sx={{ width: 12, height: 12, bgcolor: '#E65100', borderRadius: 0.5 }} />
                    <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>종료</Typography>
                  </Box>
                </Box>
              </>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
          <Button onClick={() => setOpenAttendTime(false)} variant="outlined" sx={{ fontWeight: 700, borderRadius: 2, px: 2.5 }}>취소</Button>
          <Button onClick={confirmAttendTime} variant="contained" color="success" sx={{ fontWeight: 800, borderRadius: 2, px: 3 }}>저장</Button>
        </DialogActions>
      </Dialog>

      {/* 명단 보기 — 타입별 테마 + 아바타 + 시간 Chip */}
      <Dialog open={openList} onClose={closeNameListDialog} fullWidth maxWidth="xs" {...bottomSheetProps}>
        {(() => {
          // 타입별 테마
          const theme = dialogType === 'attend'
            ? { label: '참석', main: '#2E7D32', light: '#E8F5E9', dark: '#1B5E20', grad: 'linear-gradient(135deg,#43A047,#2E7D32)', emoji: '✅' }
            : dialogType === 'absent'
            ? { label: '불참', main: '#C62828', light: '#FFEBEE', dark: '#B71C1C', grad: 'linear-gradient(135deg,#EF5350,#C62828)', emoji: '❌' }
            : { label: '미정', main: '#E65100', light: '#FFF3E0', dark: '#BF360C', grad: 'linear-gradient(135deg,#FB8C00,#E65100)', emoji: '❓' };

          // 참석 명단: 전체 / 부분으로 분리하고 각 사람의 시간 라벨 계산
          const enriched = listNames.map((raw) => {
            const isGuest = String(raw).includes('(용병)');
            const cleanName = isGuest ? String(raw).replace(/\s*\(용병\)\s*/, '') : String(raw);
            const timeLabel = dialogType === 'attend' ? getAttendLabel(votesData[dialogDateKey], raw) : null;
            const isPartial = timeLabel && timeLabel !== '전체';
            return { raw, cleanName, isGuest, timeLabel, isPartial };
          });
          const fullCount = dialogType === 'attend' ? enriched.filter((e) => !e.isPartial).length : 0;
          const partialCount = dialogType === 'attend' ? enriched.filter((e) => e.isPartial).length : 0;

          // 이름 첫 글자로 아바타 배경 색 결정 (해시)
          const avatarPalette = ['#1976D2', '#388E3C', '#D32F2F', '#F57C00', '#7B1FA2', '#00796B', '#5D4037', '#455A64', '#C2185B', '#303F9F'];
          const pickAvatarColor = (name) => {
            let h = 0;
            for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
            return avatarPalette[h % avatarPalette.length];
          };

          return (
            <>
              {/* 헤더 — 타입별 그라데이션 */}
              <Box sx={{ background: theme.grad, color: 'white', px: 2.5, pt: 2, pb: 1.8 }}>
                <Typography sx={{ fontSize: '0.75rem', opacity: 0.9, fontWeight: 600, letterSpacing: 0.5 }}>
                  {dialogDateStr}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.4 }}>
                  <Typography sx={{ fontSize: '1.3rem', fontWeight: 800 }}>
                    {theme.emoji} {theme.label} 명단
                  </Typography>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 900, ml: 'auto', fontFeatureSettings: '"tnum"' }}>
                    {listNames.length}
                    <Typography component="span" sx={{ fontSize: '0.9rem', fontWeight: 700, opacity: 0.9, ml: 0.3 }}>명</Typography>
                  </Typography>
                </Box>
                {/* 참석 통계 (참석 타입만) */}
                {dialogType === 'attend' && listNames.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.8, mt: 1.2 }}>
                    <Chip
                      size="small"
                      label={`전체 참석 ${fullCount}명`}
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.22)', color: 'white', fontWeight: 700,
                        fontSize: '0.72rem', border: '1px solid rgba(255,255,255,0.3)', height: 24,
                      }}
                    />
                    {partialCount > 0 && (
                      <Chip
                        size="small"
                        icon={<AccessTimeIcon sx={{ fontSize: '13px !important', color: 'white !important' }} />}
                        label={`부분 참석 ${partialCount}명`}
                        sx={{
                          bgcolor: 'rgba(255,255,255,0.22)', color: 'white', fontWeight: 700,
                          fontSize: '0.72rem', border: '1px solid rgba(255,255,255,0.3)', height: 24,
                        }}
                      />
                    )}
                  </Box>
                )}
              </Box>

              {/* 리스트 본문 */}
              <DialogContent sx={{ p: 1.2, bgcolor: '#FAFBFC' }}>
                {listNames.length === 0 ? (
                  <Box sx={{ py: 4, textAlign: 'center', color: '#999' }}>
                    <Typography sx={{ fontSize: '2rem', mb: 0.5, opacity: 0.3 }}>📭</Typography>
                    <Typography sx={{ fontSize: '0.88rem' }}>명단이 없습니다.</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                    {enriched.map((e, idx) => (
                      <Box
                        key={`${e.raw}-${idx}`}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.2,
                          bgcolor: 'white', borderRadius: 2, px: 1.2, py: 0.9,
                          borderLeft: `4px solid ${e.isPartial ? '#FF9800' : theme.main}`,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          transition: 'all 0.15s',
                          '&:hover': { boxShadow: '0 2px 6px rgba(0,0,0,0.08)', transform: 'translateY(-1px)' },
                        }}
                      >
                        {/* 순번 */}
                        <Typography sx={{
                          fontSize: '0.7rem', fontWeight: 700, color: '#999',
                          minWidth: 18, textAlign: 'right', fontFeatureSettings: '"tnum"',
                        }}>
                          {idx + 1}
                        </Typography>
                        {/* 아바타 */}
                        <Avatar sx={{
                          width: 32, height: 32, fontSize: '0.85rem', fontWeight: 800,
                          bgcolor: e.isGuest ? '#888' : pickAvatarColor(e.cleanName),
                          color: 'white',
                          border: e.isGuest ? '2px dashed #BDBDBD' : 'none',
                        }}>
                          {e.cleanName.charAt(0)}
                        </Avatar>
                        {/* 이름 + 용병 배지 */}
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{
                            fontSize: '0.92rem', fontWeight: 700, color: '#222',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {e.cleanName}
                          </Typography>
                          {e.isGuest && (
                            <Chip label="용병" size="small" sx={{
                              height: 18, fontSize: '0.62rem', fontWeight: 700,
                              bgcolor: '#F5F5F5', color: '#666', border: '1px solid #E0E0E0',
                            }} />
                          )}
                        </Box>
                        {/* 참석 시간 Chip */}
                        {dialogType === 'attend' && (
                          e.isPartial ? (
                            <Chip
                              icon={<AccessTimeIcon sx={{ fontSize: '13px !important' }} />}
                              label={e.timeLabel}
                              size="small"
                              sx={{
                                height: 24, fontSize: '0.7rem', fontWeight: 700,
                                bgcolor: '#FFF3E0', color: '#E65100',
                                border: '1px solid #FFE0B2',
                                '& .MuiChip-icon': { color: '#E65100' },
                              }}
                            />
                          ) : (
                            <Chip label="전체" size="small" sx={{
                              height: 24, fontSize: '0.72rem', fontWeight: 800,
                              bgcolor: theme.light, color: theme.dark,
                              border: `1px solid ${theme.main}33`,
                            }} />
                          )
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </DialogContent>

              <DialogActions sx={{ justifyContent: 'center', pb: 2, pt: 1.2 }}>
                <Button
                  onClick={closeNameListDialog}
                  variant="contained"
                  sx={{
                    bgcolor: theme.main, fontWeight: 700, borderRadius: 2, px: 4,
                    '&:hover': { bgcolor: theme.dark },
                  }}
                >
                  닫기
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* 용병 관리 */}
      <Dialog open={openGuestDialog} onClose={() => setOpenGuestDialog(false)} fullWidth maxWidth="xs" {...bottomSheetProps}>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>
          용병(지인) 관리
          <Typography variant="body2" color="textSecondary">{userName}님의 지인을 등록해주세요.</Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 3, px: 4 }}>
            <TextField fullWidth size="small" label="이름 입력" value={guestInputName}
              onChange={(e) => setGuestInputName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGuest()} />
            <Button variant="contained" onClick={handleAddGuest} startIcon={<AddCircleIcon />} sx={{ whiteSpace: 'nowrap' }}>추가</Button>
          </Box>
          <Divider>내가 등록한 용병 목록</Divider>
          <List dense sx={{ mt: 1 }}>
            {myGuests.length === 0 ? <Typography color="textSecondary" align="center" sx={{ py: 2 }}>아직 등록한 용병이 없습니다.</Typography> : (
              myGuests.map((g, idx) => (
                <ListItem key={idx} secondaryAction={<IconButton edge="end" onClick={() => handleRemoveGuest(g)}><DeleteIcon color="error" /></IconButton>}>
                  <ListItemText primary={`${idx + 1}. ${g} (용병)`} />
                </ListItem>
              ))
            )}
          </List>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}><Button onClick={() => setOpenGuestDialog(false)} variant="outlined">닫기</Button></DialogActions>
      </Dialog>

      {/* 지도 앱 선택 */}
      <Dialog open={openMapDialog} onClose={() => setOpenMapDialog(false)} {...bottomSheetProps}>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>지도 앱 선택</DialogTitle>
        <List sx={{ pt: 0 }}>
          {[{ key: 'kakao', label: '카카오맵', color: '#FEE500' }, { key: 'naver', label: '네이버 지도', color: '#2DB400' }, { key: 'google', label: '구글 지도', color: '#1976D2' }].map((m, i) => (
            <React.Fragment key={m.key}>
              {i > 0 && <Divider />}
              <ListItem disableGutters>
                <ListItemButton onClick={() => openMap(m.key)} sx={{ py: 2 }}>
                  <ListItemIcon><MapIcon sx={{ color: m.color }} /></ListItemIcon>
                  <ListItemText primary={m.label} />
                </ListItemButton>
              </ListItem>
            </React.Fragment>
          ))}
        </List>
        <DialogActions><Button onClick={() => setOpenMapDialog(false)} color="inherit">닫기</Button></DialogActions>
      </Dialog>

      {/* 알림 */}
      <Dialog open={openAlert} onClose={() => setOpenAlert(false)} {...bottomSheetProps}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>알림</DialogTitle>
        <DialogContent><DialogContentText sx={{ color: 'text.primary', whiteSpace: 'pre-line' }}>{alertMessage}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setOpenAlert(false)} variant="contained" autoFocus>확인</Button></DialogActions>
      </Dialog>
    </Container>
    </Box>
  );
}

export default VotePage;

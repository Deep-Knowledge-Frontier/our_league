import React, { useState, useEffect, useCallback } from 'react';
import { ref, onValue, runTransaction } from 'firebase/database';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Card, CardContent, Button,
  Grid, CircularProgress, Chip, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, Slide,
  List, ListItem, ListItemText, Divider, ListItemButton, ListItemIcon,
  TextField, IconButton,
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
const bottomSheetProps = { TransitionComponent: SlideUp, PaperProps: { sx: { borderRadius: '20px 20px 0 0', position: 'fixed', bottom: 0, m: 0, maxHeight: '80vh' } } };

function VotePage() {
  const navigate = useNavigate();
  const { userName, emailKey, clubName, authReady, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [matchList, setMatchList] = useState([]);
  const [votesData, setVotesData] = useState({});
  const [teamExistence, setTeamExistence] = useState({});

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
    setEndIdx(Math.min(slots.length - 1, 1));
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

  const goToTeamBuild = (date) => {
    if (teamExistence[date]) { navigate(`/team/${date}`); return; }
    if (!getIsTimeReady(date)) {
      setAlertMessage('팀 구성은 경기 전날 오후 6시(18:00)부터 공개됩니다.');
      setOpenAlert(true); return;
    }
    setAlertMessage('아직 팀구성이 완료되지 않았습니다.\n(운영진이 팀을 구성 중입니다)');
    setOpenAlert(true);
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
          const isTimeReady = getIsTimeReady(date);
          const hasTeamData = !!teamExistence[date];
          const totalGuests = getTotalGuestCount(date);
          const weatherInfo = weatherByDate[date];

          let teamBtnText = '팀 구성 준비 중';
          let teamBtnBg = '#001BB7';
          let teamBtnColor = '#FFFFFF';
          let teamBtnOpacity = 0.6;

          if (hasTeamData) { teamBtnText = '팀 구성 넘어가기'; teamBtnOpacity = 0.8; }
          else if (!isTimeReady) { teamBtnText = '팀 구성으로 넘어가기 (오픈 전)'; teamBtnBg = '#E0E0E0'; teamBtnColor = '#757575'; }

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
                  <Chip clickable onClick={() => openNameListDialog(date, 'attend')} label={`참석 ${getCount(date, 'attend')}명`} color="success" variant={myStatus === 'attend' ? 'filled' : 'outlined'} />
                  <Chip clickable onClick={() => openNameListDialog(date, 'absent')} label={`불참 ${getCount(date, 'absent')}명`} color="error" variant={myStatus === 'absent' ? 'filled' : 'outlined'} />
                  <Chip clickable onClick={() => openNameListDialog(date, 'undecided')} label={`미정 ${getCount(date, 'undecided')}명`} color="default" variant={myStatus === 'undecided' ? 'filled' : 'outlined'} />
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
                  <Button fullWidth variant="contained" startIcon={<GroupIcon />} onClick={() => goToTeamBuild(date)}
                    sx={{ height: 48, borderRadius: 2, fontWeight: 'bold', opacity: teamBtnOpacity, backgroundColor: teamBtnBg, color: teamBtnColor, '&:hover': { backgroundColor: teamBtnBg } }}>
                    {teamBtnText}
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

      {/* 시간 선택 */}
      <Dialog open={openAttendTime} onClose={() => setOpenAttendTime(false)} fullWidth maxWidth="xs" {...bottomSheetProps}>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>참석 시간 선택</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', mb: 2 }}>참석 가능한 시간을 선택해주세요.</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>시작 시간</InputLabel>
              <Select label="시작 시간" value={startIdx} onChange={(e) => setStartIdx(Number(e.target.value))}>
                {timeSlots.slice(0, -1).map((t, idx) => <MenuItem key={t} value={idx}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>종료 시간</InputLabel>
              <Select label="종료 시간" value={endIdx} onChange={(e) => setEndIdx(Number(e.target.value))}>
                {timeSlots.slice(startIdx + 1).map((t, offset) => <MenuItem key={t} value={startIdx + 1 + offset}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
          <Button onClick={() => setOpenAttendTime(false)} variant="outlined">취소</Button>
          <Button onClick={confirmAttendTime} variant="contained" color="success">확인</Button>
        </DialogActions>
      </Dialog>

      {/* 명단 보기 */}
      <Dialog open={openList} onClose={closeNameListDialog} {...bottomSheetProps}>
        <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
          <Typography variant="h6" fontWeight="bold">{dialogDateStr}</Typography>
          <Typography variant="subtitle1" color="primary" sx={{ mt: 0.5 }}>{dialogSubTitle}</Typography>
        </DialogTitle>
        <DialogContent dividers>
          {listNames.length === 0 ? <Typography color="textSecondary" align="center" sx={{ px: 2 }}>명단이 없습니다.</Typography> : (
            <List dense sx={{ p: 0 }}>
              {listNames.map((n, idx) => {
                const suffix = dialogType === 'attend' ? ` (${getAttendLabel(votesData[dialogDateKey], n)})` : '';
                return (
                  <React.Fragment key={`${n}-${idx}`}>
                    <ListItem sx={{ justifyContent: 'center', px: 3 }}>
                      <ListItemText primary={`${idx + 1}. ${n}${suffix}`} primaryTypographyProps={{ align: 'center', fontSize: '0.9rem' }} />
                    </ListItem>
                    {idx !== listNames.length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}><Button onClick={closeNameListDialog} variant="contained" size="small">닫기</Button></DialogActions>
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
  );
}

export default VotePage;

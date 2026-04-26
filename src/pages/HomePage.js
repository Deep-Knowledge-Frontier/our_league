import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, onValue, set, update } from 'firebase/database';
import {
  Container, Box, Typography, Card, CardContent, Button,
  CircularProgress, Chip, Badge, Stack
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import PlaceIcon from '@mui/icons-material/Place';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ShieldIcon from '@mui/icons-material/Shield';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { parseDateKeyLocal, getDaysDiff, formatDateWithDay } from '../utils/format';
import { HomePageSkeleton } from '../components/common/SkeletonLoading';
import { touchCard } from '../utils/styles';

import { DEMO_CLUB, createNameMap, anonymize } from '../utils/demo';

function HomePage() {
  const navigate = useNavigate();
  const { clubName, userName, emailKey, authReady, user, isDemoGuest, isAdmin, isModerator } = useAuth();
  const canAdmin = isAdmin || isModerator;

  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [nextMatch, setNextMatch] = useState(null);
  const [nextMatchAttend, setNextMatchAttend] = useState(0);
  const [myVoteStatus, setMyVoteStatus] = useState(null);
  const [myAttendTime, setMyAttendTime] = useState(null);
  const [extraMatches, setExtraMatches] = useState([]); // 2번째, 3번째 예정 경기
  const [recentResults, setRecentResults] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [teamStats, setTeamStats] = useState({ totalPlayers: 0, avgAttend: 0 });
  const [mvpRanking, setMvpRanking] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [activeDraft, setActiveDraft] = useState(null); // { date, status, myCode, captains, pickOrder, currentPickIdx, snake }
  const [draftSession, setDraftSession] = useState(null); // 전체 Draft 세션 (confirmed 포함, 재드래프트 요청용)
  const [myCaptainCode, setMyCaptainCode] = useState(null); // 확정된 팀의 내 주장 코드 (포메이션 편집용)

  // 배너 자동 슬라이드
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setBannerIndex(prev => (prev + 1) % banners.length), 15000);
    return () => clearInterval(timer);
  }, [banners.length]);

  // 드래프트 세션 실시간 구독 (주장/관리자 진입점 + 재드래프트 요청 UI)
  useEffect(() => {
    if (isDemoGuest || !clubName || !nextMatch?.date) {
      setActiveDraft(null); setDraftSession(null); return;
    }
    const draftRef = ref(db, `PlayerSelectionByDate/${clubName}/${nextMatch.date}/Draft`);
    const unsub = onValue(draftRef, (snap) => {
      if (!snap.exists()) { setActiveDraft(null); setDraftSession(null); return; }
      const d = snap.val();
      setDraftSession(d);
      // 진행 중(active/review)만 상단 카드로 표시
      if (d.status !== 'active' && d.status !== 'review') { setActiveDraft(null); return; }
      const myCode = Object.keys(d.captains || {}).find((c) => d.captains[c] === userName) || null;
      setActiveDraft({
        date: nextMatch.date,
        status: d.status,
        myCode,
        captains: d.captains || {},
        pickOrder: d.pickOrder || [],
        currentPickIdx: d.currentPickIdx || 0,
        snake: !!d.snake,
      });
    });
    return () => unsub();
  }, [clubName, nextMatch?.date, userName, isDemoGuest]);

  // 데모 게스트: 자동으로 한강FC 데이터 로드
  useEffect(() => {
    if (isDemoGuest && !demoMode && !loading) {
      loadDemoData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoGuest, loading]);

  useEffect(() => {
    if (isDemoGuest) { setLoading(false); return; }
    if (!authReady || !user || !clubName) return;
    // 클럽 전환 시 기존 데이터 초기화
    setNextMatch(null);
    setNextMatchAttend(0);
    setMyVoteStatus(null);
    setMyAttendTime(null);
    setMyCaptainCode(null);
    setRecentResults([]);
    setLeaderboard([]);
    setTeamStats({ totalPlayers: 0, avgAttend: 0 });
    setLoading(true);

    const loadData = async () => {
      try {
        // 1. 배너
        const bannerSnap = await get(ref(db, 'banners'));
        if (bannerSnap.exists()) {
          setBanners(Object.values(bannerSnap.val()).filter(b => b.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)));
        }

        // 2. 다음 경기 (오늘 경기 결과가 이미 있으면 다음 날짜로)
        const matchSnap = await get(ref(db, `MatchDates/${clubName}`));
        if (matchSnap.exists()) {
          const data = matchSnap.val();
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const todayStr = today.toISOString().slice(0, 10);
          const upcoming = Object.keys(data)
            .filter(dk => (data[dk]?.isActive === true || data[dk]?.isActive === 'true') && parseDateKeyLocal(dk) >= today)
            .sort();
          // 오늘 경기 결과가 있으면 스킵 + 유효한 경기만 수집
          const validDks = [];
          for (const dk of upcoming) {
            if (dk === todayStr) {
              const resultSnap = await get(ref(db, `DailyResultsBackup/${clubName}/${dk}`));
              if (resultSnap.exists()) continue;
            }
            validDks.push(dk);
            if (validDks.length >= 3) break; // 최대 3개
          }
          const selectedDk = validDks[0] || null;
          // 2번째, 3번째 경기를 extraMatches에 저장 — 출석 인원 + 내 투표 상태도 로드
          const extras = [];
          for (let i = 1; i < validDks.length; i++) {
            const dk = validDks[i];
            const [aSnap, bSnap, uSnap, atSnap] = await Promise.all([
              get(ref(db, `PlayerSelectionByDate/${clubName}/${dk}/AttandPlayer/all`)),
              get(ref(db, `PlayerSelectionByDate/${clubName}/${dk}/AbsentPlayer/all`)),
              get(ref(db, `PlayerSelectionByDate/${clubName}/${dk}/UndecidedPlayer/all`)),
              emailKey ? get(ref(db, `PlayerSelectionByDate/${clubName}/${dk}/AttendTime/${emailKey}`)) : Promise.resolve(null),
            ]);
            const toArr2 = snap => (snap.exists() && Array.isArray(snap.val())) ? snap.val().filter(Boolean) : [];
            const atL = toArr2(aSnap);
            const abL = toArr2(bSnap);
            const ucL = toArr2(uSnap);
            let myStatus = null;
            if (atL.includes(userName)) myStatus = 'attend';
            else if (abL.includes(userName)) myStatus = 'absent';
            else if (ucL.includes(userName)) myStatus = 'undecided';
            extras.push({
              date: dk,
              time: data[dk]?.time || '',
              location: data[dk]?.location || '',
              attendCount: atL.length,
              myVoteStatus: myStatus,
              myAttendTime: (atSnap && atSnap.exists()) ? atSnap.val() : null,
            });
          }
          setExtraMatches(extras);
          if (selectedDk) {
            setNextMatch({ date: selectedDk, time: data[selectedDk]?.time || '', location: data[selectedDk]?.location || '' });
            const [attendSnap, absentSnap, undecidedSnap, attendTimeSnap, captainsSnap] = await Promise.all([
              get(ref(db, `PlayerSelectionByDate/${clubName}/${selectedDk}/AttandPlayer/all`)),
              get(ref(db, `PlayerSelectionByDate/${clubName}/${selectedDk}/AbsentPlayer/all`)),
              get(ref(db, `PlayerSelectionByDate/${clubName}/${selectedDk}/UndecidedPlayer/all`)),
              emailKey ? get(ref(db, `PlayerSelectionByDate/${clubName}/${selectedDk}/AttendTime/${emailKey}`)) : Promise.resolve(null),
              get(ref(db, `PlayerSelectionByDate/${clubName}/${selectedDk}/TeamCaptains`)),
            ]);
            // 내가 어느 팀 주장인지 확인 (확정된 팀 편성 후)
            if (captainsSnap.exists() && userName) {
              const caps = captainsSnap.val() || {};
              const myCode = Object.keys(caps).find((c) => caps[c] === userName) || null;
              setMyCaptainCode(myCode);
            }
            const toArr = snap => (snap.exists() && Array.isArray(snap.val())) ? snap.val().filter(Boolean) : [];
            const attendList = toArr(attendSnap);
            if (attendList.length > 0) setNextMatchAttend(attendList.length);
            if (attendList.includes(userName)) {
              setMyVoteStatus('attend');
              if (attendTimeSnap && attendTimeSnap.exists()) setMyAttendTime(attendTimeSnap.val());
            } else if (toArr(absentSnap).includes(userName)) setMyVoteStatus('absent');
            else if (toArr(undecidedSnap).includes(userName)) setMyVoteStatus('undecided');
            else setMyVoteStatus(null);
          }
        }

        // 3. 최근 경기 결과 + 우승팀 계산
        const dailySnap = await get(ref(db, `DailyResultsBackup/${clubName}`));
        if (dailySnap.exists()) {
          const data = dailySnap.val();
          setRecentResults(Object.keys(data).sort().reverse().slice(0, 3).map(dk => {
            const matches = data[dk].matches || [];
            // 우승팀 계산 (승점→골득실→득점)
            const pts = {}, gd = {}, gs = {};
            matches.forEach(m => {
              const t1 = m.team1, t2 = m.team2, s1 = m.score1, s2 = m.score2;
              gs[t1] = (gs[t1]||0)+s1; gs[t2] = (gs[t2]||0)+s2;
              gd[t1] = (gd[t1]||0)+(s1-s2); gd[t2] = (gd[t2]||0)+(s2-s1);
              pts[t1] = (pts[t1]||0)+(s1>s2?3:s1===s2?1:0);
              pts[t2] = (pts[t2]||0)+(s2>s1?3:s1===s2?1:0);
            });
            const winner = Object.keys(pts).sort((a,b)=>(pts[b]||0)-(pts[a]||0)||(gd[b]||0)-(gd[a]||0)||(gs[b]||0)-(gs[a]||0))[0]||null;
            return { date: dk, dailyMvp: data[dk].dailyMvp || '없음', matches, winner };
          }));

          // MVP 랭킹 계산
          const dailyMvpMap = {}, gameMvpMap = {};
          Object.values(data).forEach(dayInfo => {
            if (dayInfo?.dailyMvp && dayInfo.dailyMvp !== '없음')
              dailyMvpMap[dayInfo.dailyMvp] = (dailyMvpMap[dayInfo.dailyMvp] || 0) + 1;
            (dayInfo?.matches ? Object.values(dayInfo.matches) : []).forEach(m => {
              if (m.mvp && m.mvp !== '없음') gameMvpMap[m.mvp] = (gameMvpMap[m.mvp] || 0) + 1;
            });
          });
          const toSorted = (map) => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
          setMvpRanking({
            daily: toSorted(dailyMvpMap).slice(0, 5),
            game: toSorted(gameMvpMap).slice(0, 5),
          });
        }

        // 4. 선수순위 리더보드 (abilityScore 기준 TOP 5)
        const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${clubName}`));
        if (statsSnap.exists()) {
          const data = statsSnap.val();
          setLeaderboard(
            Object.entries(data)
              .filter(([, s]) => (s.attendanceRate || 0) >= 15)
              .map(([name, s]) => ({
                name,
                abilityScore: s.abilityScore || 0,
                goals: s.goals || s.totalGoals || 0,
                assists: s.assists || s.totalAssists || 0,
                attendanceRate: s.attendanceRate || 0,
                pointRate: s.pointRate || 0,
                gd: s.avgGoalDiffPerGame || 0,
                matches: s.participatedMatches || 0,
              }))
              // 🔧 정렬 우선순위: 능력치(내림) → 승점율(내림) → 골득실(내림)
              .sort((a, b) => {
                if (b.abilityScore !== a.abilityScore) return b.abilityScore - a.abilityScore;
                if (b.pointRate !== a.pointRate) return b.pointRate - a.pointRate;
                return b.gd - a.gd;
              })
              .slice(0, 5)
          );
        }

        // 5. 팀 현황 — registeredPlayers 기준
        const regSnap = await get(ref(db, `registeredPlayers/${clubName}`));
        let regNames = [];
        if (regSnap.exists()) {
          regNames = Object.values(regSnap.val()).map(p => p.name).filter(Boolean);
        }
        // 등록선수들의 평균 참석율
        let avgAtt = 0;
        if (statsSnap && statsSnap.exists() && regNames.length > 0) {
          const statsData = statsSnap.val();
          let sum = 0, cnt = 0;
          regNames.forEach(name => {
            if (statsData[name]?.attendanceRate) { sum += statsData[name].attendanceRate; cnt++; }
          });
          avgAtt = cnt > 0 ? Math.round(sum / cnt) : 0;
        }
        setTeamStats({ totalPlayers: regNames.length, avgAttend: avgAtt });

      } catch (e) {
        console.error('HomePage load error:', e);
      }
      setLoading(false);
    };
    loadData();
  }, [authReady, user, clubName, emailKey, userName]);


  const loadDemoData = async () => {
    setDemoLoading(true);
    try {
      // 선수 이름 수집 → 매핑 생성
      const regSnap = await get(ref(db, `registeredPlayers/${DEMO_CLUB}`));
      const realNames = regSnap.exists() ? Object.values(regSnap.val()).map(p => p.name).filter(Boolean) : [];
      const nameMap = createNameMap(realNames);

      // 최근 경기
      const dailySnap = await get(ref(db, `DailyResultsBackup/${DEMO_CLUB}`));
      if (dailySnap.exists()) {
        const data = dailySnap.val();
        setRecentResults(Object.keys(data).sort().reverse().slice(0, 3).map(dk => {
          const matches = (data[dk].matches || []).map(m => ({
            ...m, mvp: anonymize(m.mvp, nameMap),
          }));
          const pts = {}, gd2 = {}, gs = {};
          matches.forEach(m => {
            const t1 = m.team1, t2 = m.team2, s1 = m.score1, s2 = m.score2;
            gs[t1] = (gs[t1]||0)+s1; gs[t2] = (gs[t2]||0)+s2;
            gd2[t1] = (gd2[t1]||0)+(s1-s2); gd2[t2] = (gd2[t2]||0)+(s2-s1);
            pts[t1] = (pts[t1]||0)+(s1>s2?3:s1===s2?1:0);
            pts[t2] = (pts[t2]||0)+(s2>s1?3:s1===s2?1:0);
          });
          const winner = Object.keys(pts).sort((a,b)=>(pts[b]||0)-(pts[a]||0)||(gd2[b]||0)-(gd2[a]||0)||(gs[b]||0)-(gs[a]||0))[0]||null;
          return { date: dk, dailyMvp: anonymize(data[dk].dailyMvp, nameMap), matches, winner };
        }));

        // MVP 랭킹
        const dailyMvpMap = {}, gameMvpMap = {};
        Object.values(data).forEach(dayInfo => {
          const dm = anonymize(dayInfo?.dailyMvp, nameMap);
          if (dm && dm !== '없음') dailyMvpMap[dm] = (dailyMvpMap[dm] || 0) + 1;
          (dayInfo?.matches ? Object.values(dayInfo.matches) : []).forEach(m => {
            const gm = anonymize(m.mvp, nameMap);
            if (gm && gm !== '없음') gameMvpMap[gm] = (gameMvpMap[gm] || 0) + 1;
          });
        });
        const toSorted = (map) => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        setMvpRanking({ daily: toSorted(dailyMvpMap).slice(0, 5), game: toSorted(gameMvpMap).slice(0, 5) });
      }

      // 선수순위
      const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${DEMO_CLUB}`));
      if (statsSnap.exists()) {
        setLeaderboard(
          Object.entries(statsSnap.val())
            .filter(([, s]) => (s.attendanceRate || 0) >= 15)
            .map(([name, s]) => ({
              name: nameMap[name] || name,
              abilityScore: s.abilityScore || 0, goals: s.goals || 0,
              assists: s.assists || 0, attendanceRate: s.attendanceRate || 0,
              pointRate: s.pointRate || 0,
              gd: s.avgGoalDiffPerGame || 0,
              matches: s.participatedMatches || 0,
            }))
            // 🔧 정렬 우선순위: 능력치(내림) → 승점율(내림) → 골득실(내림)
            .sort((a, b) => {
              if (b.abilityScore !== a.abilityScore) return b.abilityScore - a.abilityScore;
              if (b.pointRate !== a.pointRate) return b.pointRate - a.pointRate;
              return b.gd - a.gd;
            }).slice(0, 5)
        );

        let sum = 0, cnt = 0;
        realNames.forEach(name => {
          const s = statsSnap.val()[name];
          if (s?.attendanceRate) { sum += s.attendanceRate; cnt++; }
        });
        setTeamStats({ totalPlayers: realNames.length, avgAttend: cnt > 0 ? Math.round(sum / cnt) : 0 });
      }

      setDemoMode(true);
    } catch (e) {
      console.error('Demo load error:', e);
    }
    setDemoLoading(false);
  };

  const hasData = recentResults.length > 0 || leaderboard.length > 0;

  // ── 재드래프트 요청 / 관리자 즉시 승인 ──
  // 주장이 요청 → 전원 동의 시 자동으로 active 상태로 리셋
  // 관리자는 즉시 승인 가능 (consent 무시)
  const handleReDraftRequest = async (bypassConsent = false) => {
    if (!draftSession || !nextMatch?.date || !clubName) return;
    const codes = draftSession.pickOrder || [];
    const captains = draftSession.captains || {};
    const myCode = Object.keys(captains).find((c) => captains[c] === userName) || null;
    if (!myCode && !canAdmin) return;

    const current = draftSession.reDraftRequests || {};
    const updated = myCode ? { ...current, [myCode]: true } : current;
    const allAgreed = codes.length > 0 && codes.every((c) => updated[c]);

    if (bypassConsent || allAgreed) {
      // 참석자 다시 로드 (혹시 바뀐 경우 대비)
      const attendSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${nextMatch.date}/AttandPlayer/all`));
      const attendees = (attendSnap.exists() && Array.isArray(attendSnap.val()))
        ? attendSnap.val().filter(Boolean) : [];
      const fresh = {
        ...draftSession,
        status: 'active',
        currentPickIdx: 0,
        pool: attendees.filter((n) => !Object.values(captains).includes(n)),
        teams: Object.fromEntries(codes.map((c) => [c, [captains[c]]])),
        picks: [],
        trades: null,
        resetRequests: null,
        reDraftRequests: null,
        restartedAt: Date.now(),
      };
      await set(ref(db, `PlayerSelectionByDate/${clubName}/${nextMatch.date}/Draft`), fresh);
      navigate(`/draft/${nextMatch.date}`);
    } else {
      await update(ref(db, `PlayerSelectionByDate/${clubName}/${nextMatch.date}/Draft`), {
        reDraftRequests: updated,
      });
    }
  };

  const handleCancelReDraftRequest = async () => {
    if (!draftSession || !nextMatch?.date || !clubName) return;
    const captains = draftSession.captains || {};
    const myCode = Object.keys(captains).find((c) => captains[c] === userName) || null;
    if (!myCode) return;
    const updated = { ...(draftSession.reDraftRequests || {}), [myCode]: false };
    await update(ref(db, `PlayerSelectionByDate/${clubName}/${nextMatch.date}/Draft`), {
      reDraftRequests: updated,
    });
  };

  // ─── 예정 경기 카드 공통 렌더 (다음 경기 + 추가 예정 경기) ───
  const renderUpcomingCard = ({
    date, time, location, attendCount, myVoteStatus: voteStatus, myAttendTime: attendTime,
    isFirst, children,
  }) => {
    const cardDday = getDaysDiff(date);
    const partialTime = (voteStatus === 'attend' && attendTime && attendTime.full === false && attendTime.start && attendTime.end)
      ? `${attendTime.start}-${attendTime.end}`
      : null;
    const urgent = voteStatus === null && cardDday >= 0 && cardDday <= 3;
    const critical = voteStatus === null && cardDday === 0;
    const cfg =
      voteStatus === 'attend' ? {
        label: partialTime ? `참석 · ${partialTime}` : '참석',
        Icon: CheckCircleIcon,
        bg: '#2E7D32', bgHover: '#1B5E20', shadow: '0 2px 8px rgba(46,125,50,0.3)',
      } :
      voteStatus === 'absent' ? {
        label: '불참', Icon: CancelIcon,
        bg: '#546E7A', bgHover: '#37474F', shadow: '0 2px 8px rgba(84,110,122,0.3)',
      } :
      voteStatus === 'undecided' ? {
        label: '미정', Icon: HelpOutlineIcon,
        bg: '#F57C00', bgHover: '#E65100', shadow: '0 2px 8px rgba(245,124,0,0.3)',
      } :
      critical ? {
        label: '지금 투표!', Icon: HowToVoteIcon,
        bg: '#D32F2F', bgHover: '#B71C1C', shadow: '0 2px 12px rgba(211,47,47,0.5)',
      } :
      urgent ? {
        label: '투표하기', Icon: HowToVoteIcon,
        bg: '#EF6C00', bgHover: '#E65100', shadow: '0 2px 10px rgba(239,108,0,0.4)',
      } : {
        label: '투표하기', Icon: HowToVoteIcon,
        bg: '#1565C0', bgHover: '#0D47A1', shadow: '0 2px 8px rgba(21,101,192,0.3)',
      };
    const BtnIcon = cfg.Icon;
    const pulseSpeed = critical ? '0.9s' : '1.4s';

    return (
      <Card sx={{
        minWidth: 300, maxWidth: 320, flexShrink: 0, scrollSnapAlign: 'start',
        borderRadius: 3, boxShadow: 3, overflow: 'hidden',
        border: '1px solid #E0E0E0',
      }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '0.92rem', flex: 1 }}>
              {isFirst ? '다음 경기' : '예정 경기'}
            </Typography>
            <Chip
              label={cardDday === 0 ? 'D-DAY' : `D-${cardDday}`}
              size="small"
              sx={{
                bgcolor: '#1565C0', color: 'white',
                fontWeight: 900, fontSize: '0.8rem', height: 26, px: 0.5,
              }}
            />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', color: '#222', mb: 0.5 }}>
            {formatDateWithDay(date)}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1.5, color: '#666' }}>
            {time && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <AccessTimeIcon sx={{ fontSize: 17 }} />
                <Typography sx={{ fontSize: '0.92rem' }}>{time}</Typography>
              </Box>
            )}
            {location && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <PlaceIcon sx={{ fontSize: 17 }} />
                <Typography sx={{
                  fontSize: '0.92rem',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170,
                }}>
                  {location}
                </Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Chip icon={<PeopleIcon sx={{ fontSize: '16px !important' }} />}
              label={`${attendCount || 0}명 참석`} size="small"
              sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 'bold', fontSize: '0.8rem', height: 28 }} />
            <Badge
              variant="dot"
              invisible={voteStatus !== null}
              sx={{
                '& .MuiBadge-dot': {
                  bgcolor: '#FF1744', width: 10, height: 10,
                  border: '2px solid white',
                  animation: `voteAlert ${pulseSpeed} ease-in-out infinite`,
                  '@keyframes voteAlert': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                    '50%': { transform: 'scale(1.6)', opacity: 0.6 },
                  },
                },
              }}
            >
              <Button
                variant="contained" size="small"
                startIcon={<BtnIcon sx={{ fontSize: '18px !important' }} />}
                endIcon={voteStatus === null ? <ArrowForwardIcon /> : null}
                onClick={() => navigate('/vote')}
                sx={{
                  borderRadius: 2, fontWeight: 'bold', px: 2.2, py: 0.8,
                  bgcolor: cfg.bg, boxShadow: cfg.shadow,
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: cfg.bgHover, boxShadow: cfg.shadow },
                  '&:active': { transform: 'scale(0.96)' },
                }}
              >
                {cfg.label}
              </Button>
            </Badge>
          </Box>
          {children}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 12 }}>
        <Container maxWidth="sm" sx={{ pt: 2, px: 2 }}>
          <HomePageSkeleton />
        </Container>
      </Box>
    );
  }

  const medalLabels = ['🥇', '🥈', '🥉', '4', '5'];
  const dday = nextMatch ? getDaysDiff(nextMatch.date) : -1;

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 12 }}>

      <Container maxWidth="sm" sx={{ pt: 2, px: 2 }}>

        {/* ── 헤더 카드 ── */}
        <Card sx={{
          mb: 2, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
        }}>
          <CardContent sx={{ py: 3, textAlign: 'center' }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', letterSpacing: 2 }}>
              우리들의 리그
            </Typography>
            <Typography variant="h4" sx={{ color: 'white', fontWeight: 900, mt: 0.5 }}>
              {clubName}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', mt: 0.5 }}>
              {userName}님, 환영합니다
            </Typography>
          </CardContent>
        </Card>

        {/* ── 배너 ── */}
        {banners.length > 0 && (
          <Card sx={{ mb: 2, borderRadius: 3, overflow: 'hidden', boxShadow: 4 }}>
            <Box onClick={() => banners[bannerIndex]?.link && window.open(banners[bannerIndex].link, '_blank')}
              sx={{ cursor: banners[bannerIndex]?.link ? 'pointer' : 'default', position: 'relative' }}>
              {banners[bannerIndex]?.imageUrl ? (
                <Box component="img" src={banners[bannerIndex].imageUrl} alt="배너"
                  sx={{ width: '100%', height: 180, objectFit: 'cover' }} />
              ) : (
                <Box sx={{
                  width: '100%', height: 180,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  overflow: 'hidden', position: 'relative',
                }}>
                  <Typography
                    key={bannerIndex}
                    sx={{
                      position: 'absolute', top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'white', fontWeight: 'bold', fontSize: '1.2rem',
                      whiteSpace: 'nowrap',
                      animation: 'marquee 14s linear infinite',
                      '@keyframes marquee': {
                        '0%': { left: '100%' },
                        '100%': { left: '-250%' },
                      },
                    }}
                  >
                    {banners[bannerIndex]?.title || '공지사항'}
                  </Typography>
                </Box>
              )}
              {banners.length > 1 && (
                <Box sx={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                  {banners.map((_, i) => (
                    <Box key={i} onClick={(e) => { e.stopPropagation(); setBannerIndex(i); }}
                      sx={{
                        width: i === bannerIndex ? 20 : 6, height: 6, borderRadius: 3,
                        bgcolor: i === bannerIndex ? 'white' : 'rgba(255,255,255,0.4)',
                        transition: 'all 0.3s', cursor: 'pointer',
                      }} />
                  ))}
                </Box>
              )}
            </Box>
          </Card>
        )}

        {/* ── 데모 모드 배너 ── */}
        {demoMode && (
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            mb: 2, px: 2, py: 1, borderRadius: 2,
            bgcolor: '#FFF3E0', border: '1px solid #FFE0B2',
          }}>
            <Typography sx={{ fontSize: '0.82rem', color: '#E65100', fontWeight: 700 }}>
              샘플 데이터를 보고 있습니다
            </Typography>
            <Button size="small" onClick={() => { setDemoMode(false); setRecentResults([]); setLeaderboard([]); setMvpRanking(null); setTeamStats({ totalPlayers: 0, avgAttend: 0 }); }}
              sx={{ fontSize: '0.75rem', color: '#E65100', fontWeight: 700, minWidth: 'auto' }}>닫기</Button>
          </Box>
        )}

        {/* ── 샘플 데이터 보기 (데이터 없을 때) ── */}
        {!loading && !hasData && !demoMode && (
          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 2, textAlign: 'center' }}>
            <CardContent sx={{ py: 3 }}>
              <SportsSoccerIcon sx={{ fontSize: 40, color: '#ccc', mb: 1 }} />
              <Typography sx={{ color: '#888', fontSize: '0.95rem', mb: 0.5 }}>아직 경기 데이터가 없습니다</Typography>
              <Typography sx={{ color: '#bbb', fontSize: '0.78rem', mb: 2 }}>다른 클럽의 샘플 데이터로 미리 확인해보세요</Typography>
              <Button variant="contained" onClick={loadDemoData} disabled={demoLoading}
                startIcon={demoLoading ? <CircularProgress size={16} color="inherit" /> : <EmojiEventsIcon />}
                sx={{
                  borderRadius: 2, fontWeight: 700, px: 3,
                  background: 'linear-gradient(135deg, #F57C00, #E65100)',
                }}>
                {demoLoading ? '로딩중...' : '샘플 데이터 보기'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── 드래프트 진행 중 알림 (주장 전용, 관리자는 보이지 않음) ── */}
        {activeDraft && activeDraft.myCode && (() => {
          const currentTeam = (() => {
            if (activeDraft.status !== 'active') return null;
            const n = activeDraft.pickOrder.length;
            if (n === 0) return null;
            const round = Math.floor(activeDraft.currentPickIdx / n);
            const posInRound = activeDraft.currentPickIdx % n;
            const reversed = activeDraft.snake && round % 2 === 1;
            return reversed ? activeDraft.pickOrder[n - 1 - posInRound] : activeDraft.pickOrder[posInRound];
          })();
          const isMyTurn = activeDraft.status === 'active' && activeDraft.myCode && currentTeam === activeDraft.myCode;
          const reviewMode = activeDraft.status === 'review';
          return (
            <Card sx={{
              mb: 2, borderRadius: 3, boxShadow: 4, overflow: 'hidden',
              border: isMyTurn ? '3px solid #FF6F00' : '2px solid #7B1FA2',
              background: isMyTurn
                ? 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)'
                : 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)',
              animation: isMyTurn ? 'draftTurnPulse 1.5s ease-in-out infinite' : 'none',
              '@keyframes draftTurnPulse': {
                '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,111,0,0.4)' },
                '50%': { boxShadow: '0 0 0 12px rgba(255,111,0,0)' },
              },
            }}>
              <CardContent sx={{ pb: '16px !important' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ShieldIcon sx={{ color: isMyTurn ? '#FF6F00' : '#7B1FA2', fontSize: 24 }} />
                  <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: isMyTurn ? '#E65100' : '#4A148C', flex: 1 }}>
                    {isMyTurn ? '🔥 내 픽 차례!' : reviewMode ? '드래프트 검토 단계' : '드래프트 진행 중'}
                  </Typography>
                  <Chip
                    label={activeDraft.myCode ? `${activeDraft.myCode}팀 주장` : '관리자'}
                    size="small"
                    sx={{ bgcolor: '#7B1FA2', color: 'white', fontWeight: 800, fontSize: '0.72rem' }}
                  />
                </Box>
                <Typography sx={{ fontSize: '0.88rem', color: '#555', mb: 1.5 }}>
                  {activeDraft.status === 'active' && !isMyTurn &&
                    `${activeDraft.captains[currentTeam]} (${currentTeam}팀) 차례를 기다리는 중...`}
                  {isMyTurn && '선수 풀에서 픽할 선수를 선택하세요.'}
                  {reviewMode && '팀 구성을 검토하고 트레이드/재시작/확정을 진행하세요.'}
                </Typography>
                <Button
                  fullWidth variant="contained" size="medium"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate(`/draft/${activeDraft.date}`)}
                  sx={{
                    borderRadius: 2, fontWeight: 900, py: 1.1,
                    bgcolor: isMyTurn ? '#FF6F00' : '#7B1FA2',
                    '&:hover': { bgcolor: isMyTurn ? '#E65100' : '#4A148C' },
                  }}
                >
                  {isMyTurn ? '지금 픽하러 가기' : '드래프트 입장'}
                </Button>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── 예정 경기 (가로 스크롤, 모두 동일한 카드 구조) ── */}
        {nextMatch && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1, px: 0.5 }}>
              <CalendarMonthIcon sx={{ color: '#1565C0', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '1.05rem', flex: 1 }}>예정 경기</Typography>
              {extraMatches.length > 0 && (
                <Typography sx={{ fontSize: '0.72rem', color: '#999' }}>← 좌우로 밀어보기 →</Typography>
              )}
            </Box>
            <Box sx={{
              display: 'flex', gap: 1.2, overflowX: 'auto', pb: 1,
              scrollSnapType: 'x mandatory',
              '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
              mx: -0.5, px: 0.5,
            }}>
              {/* 첫 카드: 다음 경기 + 주장 전용 섹션 */}
              {renderUpcomingCard({
                date: nextMatch.date,
                time: nextMatch.time,
                location: nextMatch.location,
                attendCount: nextMatchAttend,
                myVoteStatus, myAttendTime,
                isFirst: true,
                children: (myCaptainCode && !activeDraft) ? (() => {
                  const confirmedDraft = draftSession?.status === 'confirmed';
                  const codes = draftSession?.pickOrder || [];
                  const reDraftReq = draftSession?.reDraftRequests || {};
                  const agreedCount = codes.filter((c) => reDraftReq[c]).length;
                  const myRequested = myCaptainCode && reDraftReq[myCaptainCode];
                  return (
                    <Box sx={{ mt: 1.2, pt: 1.2, borderTop: '1px dashed #E0E0E0' }}>
                      <Typography sx={{ fontSize: '0.7rem', color: '#E65100', fontWeight: 800, mb: 0.7, letterSpacing: 0.3 }}>
                        🎖 {myCaptainCode ? `${myCaptainCode}팀 주장 권한` : '관리자 권한'}
                      </Typography>
                      {myCaptainCode && (
                        <Button
                          fullWidth variant="outlined" size="small"
                          startIcon={<ShieldIcon sx={{ fontSize: '18px !important' }} />}
                          onClick={() => navigate(`/player-select?date=${nextMatch.date}`)}
                          sx={{
                            borderRadius: 2, fontWeight: 'bold', py: 0.8, mb: 0.7,
                            borderColor: '#FF6F00', color: '#E65100', borderWidth: 2,
                            bgcolor: '#FFF8E1',
                            '&:hover': { bgcolor: '#FFECB3', borderColor: '#E65100', borderWidth: 2 },
                          }}
                        >
                          ⚽ 내 팀 포메이션 설정
                        </Button>
                      )}
                      {confirmedDraft && codes.length > 0 && (
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#F3E5F5', border: '1px solid #E1BEE7' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.7 }}>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#6A1B9A', flex: 1 }}>
                              🔄 재드래프트 요청
                            </Typography>
                            {agreedCount > 0 && (
                              <Chip label={`${agreedCount}/${codes.length} 동의`} size="small"
                                sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#7B1FA2', color: 'white', fontWeight: 700 }} />
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.3, mb: 0.7 }}>
                            {codes.map((c) => {
                              const agreed = reDraftReq[c];
                              return (
                                <Chip key={c} label={`${c}${agreed ? ' ✓' : ''}`} size="small"
                                  sx={{
                                    height: 18, fontSize: '0.62rem', px: 0.2,
                                    bgcolor: agreed ? '#2E7D32' : '#EEEEEE',
                                    color: agreed ? 'white' : '#888', fontWeight: 700,
                                  }} />
                              );
                            })}
                          </Box>
                          <Stack direction="row" spacing={0.5}>
                            {myCaptainCode && (
                              myRequested ? (
                                <Button size="small" variant="outlined" onClick={handleCancelReDraftRequest}
                                  sx={{ fontSize: '0.7rem', py: 0.3, px: 1, minWidth: 'auto', borderColor: '#999', color: '#666' }}>
                                  요청 취소
                                </Button>
                              ) : (
                                <Button size="small" variant="contained" onClick={() => handleReDraftRequest(false)}
                                  sx={{
                                    fontSize: '0.7rem', py: 0.3, px: 1, minWidth: 'auto', fontWeight: 700,
                                    bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6A1B9A' },
                                  }}>
                                  동의
                                </Button>
                              )
                            )}
                            {canAdmin && (
                              <Button size="small" variant="contained" onClick={() => handleReDraftRequest(true)}
                                sx={{
                                  fontSize: '0.7rem', py: 0.3, px: 1, minWidth: 'auto', fontWeight: 700,
                                  bgcolor: '#E65100', '&:hover': { bgcolor: '#BF360C' },
                                }}>
                                즉시 재시작 (admin)
                              </Button>
                            )}
                          </Stack>
                        </Box>
                      )}
                    </Box>
                  );
                })() : null,
              })}

              {/* 추가 예정 경기 카드들 */}
              {extraMatches.map((m) => (
                <React.Fragment key={m.date}>
                  {renderUpcomingCard({
                    date: m.date,
                    time: m.time,
                    location: m.location,
                    attendCount: m.attendCount,
                    myVoteStatus: m.myVoteStatus,
                    myAttendTime: m.myAttendTime,
                    isFirst: false,
                  })}
                </React.Fragment>
              ))}
            </Box>
          </Box>
        )}

        {/* ── 최근 경기 결과 (가로 스크롤) ── */}
        {recentResults.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.2, px: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <SportsSoccerIcon sx={{ color: '#333', fontSize: 22 }} />
                <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>최근 경기</Typography>
              </Box>
              <Button size="small" onClick={() => navigate('/results')} endIcon={<ArrowForwardIcon sx={{ fontSize: 15 }} />}
                sx={{ fontSize: '0.82rem', color: '#999', fontWeight: 600 }}>전체보기</Button>
            </Box>
            <Box sx={{
              display: 'flex', gap: 1.2, overflowX: 'auto', pb: 1,
              scrollSnapType: 'x mandatory',
              '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
              mx: -0.5, px: 0.5,
            }}>
              {recentResults.map((r) => (
                <Card key={r.date} onClick={() => navigate('/results')}
                  sx={{
                    minWidth: 260, maxWidth: 300, flexShrink: 0, scrollSnapAlign: 'start',
                    borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)',
                    cursor: 'pointer', ...touchCard,
                  }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.2 }}>
                      <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#333' }}>
                        {formatDateWithDay(r.date)}
                      </Typography>
                      {r.winner && (
                        <Chip label={`우승 ${r.winner.replace(/^(팀\s*|Team\s*)/i, '')}`} size="small"
                          sx={{ fontSize: '0.78rem', height: 26, bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 800, px: 0.3 }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 1 }}>
                      {r.matches.slice(0, 6).map((m, mi) => {
                        const isTeam1Win = m.score1 > m.score2;
                        const isTeam2Win = m.score2 > m.score1;
                        return (
                          <Box key={mi} sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            bgcolor: '#F5F7FA', borderRadius: 1.5, px: 1, py: 0.4,
                          }}>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: isTeam1Win ? 800 : 500, color: isTeam1Win ? '#1565C0' : '#999' }}>{m.team1?.replace(/^(팀\s*|Team\s*)/i, '')}</Typography>
                            <Typography sx={{ fontSize: '0.92rem', fontWeight: 900, color: '#333' }}>{m.score1}:{m.score2}</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: isTeam2Win ? 800 : 500, color: isTeam2Win ? '#1565C0' : '#999' }}>{m.team2?.replace(/^(팀\s*|Team\s*)/i, '')}</Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    {r.dailyMvp !== '없음' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.8, pt: 0.8, borderTop: '1px dashed #EEE' }}>
                        <EmojiEventsIcon sx={{ fontSize: 17, color: '#F57C00' }} />
                        <Typography sx={{ fontSize: '0.85rem', color: '#E65100', fontWeight: 700 }}>
                          오늘의 MVP · {r.dailyMvp}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        )}

        {/* ── 선수순위 TOP 5 ── */}
        {leaderboard.length > 0 && (
          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 2 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmojiEventsIcon sx={{ color: '#F57C00', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 'bold', fontSize: '1.08rem' }}>선수순위</Typography>
                  <Chip label="6개월" size="small" sx={{ fontSize: '0.72rem', height: 20, bgcolor: '#FFF3E0', color: '#F57C00' }} />
                </Box>
                <Button size="small" onClick={() => navigate('/results?tab=1')} endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.8rem', color: '#999' }}>전체보기</Button>
              </Box>

              {/* 헤더 */}
              <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, mb: 0.5 }}>
                <Typography sx={{ width: 30, fontSize: '0.78rem', color: '#999', textAlign: 'center' }}>#</Typography>
                <Typography sx={{ flex: 1, fontSize: '0.78rem', color: '#999' }}>선수</Typography>
                <Typography sx={{ width: 48, fontSize: '0.78rem', color: '#999', textAlign: 'center' }}>능력치</Typography>
                <Typography sx={{ width: 38, fontSize: '0.78rem', color: '#999', textAlign: 'center' }}>골</Typography>
                <Typography sx={{ width: 38, fontSize: '0.78rem', color: '#999', textAlign: 'center' }}>도움</Typography>
                <Typography sx={{ width: 44, fontSize: '0.78rem', color: '#999', textAlign: 'center' }}>승률</Typography>
              </Box>

              {leaderboard.map((p, i) => (
                <Box key={p.name} sx={{
                  display: 'flex', alignItems: 'center', px: 1, py: 0.8,
                  borderRadius: 2, mb: 0.3,
                  bgcolor: i === 0 ? '#FFFDE7' : i === 1 ? '#FAFAFA' : i === 2 ? '#FFF8E1' : 'transparent',
                  borderLeft: i < 3 ? `3px solid ${['#FFD700', '#C0C0C0', '#CD7F32'][i]}` : '3px solid transparent',
                }}>
                  <Typography sx={{ width: 30, fontSize: i < 3 ? '1.15rem' : '0.92rem', textAlign: 'center' }}>
                    {medalLabels[i]}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#999' }}>{p.matches}경기</Typography>
                  </Box>
                  <Typography sx={{ width: 48, textAlign: 'center', fontWeight: 800, fontSize: '0.92rem', color: '#2D336B' }}>
                    {p.abilityScore.toFixed(0)}
                  </Typography>
                  <Typography sx={{ width: 38, textAlign: 'center', fontWeight: 600, fontSize: '0.9rem', color: '#1565C0' }}>
                    {p.goals}
                  </Typography>
                  <Typography sx={{ width: 38, textAlign: 'center', fontWeight: 600, fontSize: '0.9rem', color: '#388E3C' }}>
                    {p.assists}
                  </Typography>
                  <Typography sx={{ width: 44, textAlign: 'center', fontWeight: 600, fontSize: '0.9rem', color: '#F57C00' }}>
                    {p.pointRate.toFixed(0)}%
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── MVP 랭킹 ── */}
        {mvpRanking && (mvpRanking.daily.length > 0 || mvpRanking.game.length > 0) && (
          <Box sx={{ mb: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.2, px: 0.5 }}>
              <EmojiEventsIcon sx={{ color: '#F57C00', fontSize: 22 }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>MVP 랭킹</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {[
                { title: '일별 MVP', data: mvpRanking.daily, color: '#E65100', iconColor: '#F57C00' },
                { title: '경기별 MVP', data: mvpRanking.game, color: '#FF8F00', iconColor: '#FFA000' },
              ].filter(s => s.data.length > 0).map(section => {
                const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];
                return (
                  <Card key={section.title} sx={{ flex: 1, borderRadius: 3, boxShadow: 2, overflow: 'hidden' }}>
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 0.6,
                      px: 1.8, pt: 1.3, pb: 0.8,
                      borderBottom: '1px solid #F5F5F5',
                    }}>
                      <EmojiEventsIcon sx={{ color: section.iconColor, fontSize: 20 }} />
                      <Typography sx={{ fontWeight: 900, fontSize: '0.95rem', color: section.color }}>
                        {section.title}
                      </Typography>
                    </Box>
                    <CardContent sx={{ pt: 1, pb: 1.2, px: 1.5, '&:last-child': { pb: 1.2 } }}>
                      {section.data.map((p, i) => (
                        <Box key={p.name} sx={{
                          display: 'flex', alignItems: 'center', gap: 0.8, py: 0.6,
                          borderBottom: i < section.data.length - 1 ? '1px solid #FAFAFA' : 'none',
                        }}>
                          {i < 3 ? (
                            <Box sx={{
                              width: 22, height: 22, borderRadius: '50%', bgcolor: medals[i],
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              boxShadow: `0 2px 4px ${medals[i]}50`,
                            }}>
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: 'white' }}>{i + 1}</Typography>
                            </Box>
                          ) : (
                            <Typography sx={{
                              fontSize: '0.82rem', color: '#bbb', width: 22, textAlign: 'center', fontWeight: 700,
                            }}>{i + 1}</Typography>
                          )}
                          <Typography sx={{
                            fontSize: '0.92rem', fontWeight: i === 0 ? 800 : 600, flex: 1,
                            color: i === 0 ? '#222' : '#444',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {p.name}
                          </Typography>
                          <Box sx={{
                            bgcolor: `${section.color}12`, borderRadius: 1.2, px: 0.9, py: 0.2,
                          }}>
                            <Typography sx={{
                              fontSize: '0.9rem', fontWeight: 900, color: section.color,
                            }}>
                              {p.count}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Box>
        )}

        {/* ── 팀 현황 ── */}
        <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 2, overflow: 'hidden' }}>
          <Box sx={{ background: 'linear-gradient(135deg, #388E3C 0%, #2E7D32 100%)', px: 2.5, py: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PeopleIcon sx={{ color: 'white', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '1.08rem', color: 'white' }}>팀 현황</Typography>
            </Box>
          </Box>
          <CardContent sx={{ pb: '16px !important' }}>
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
              <Box sx={{ textAlign: 'center', flex: 1, py: 1.5, bgcolor: '#E8F5E9', borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 900, fontSize: '1.8rem', color: '#2E7D32' }}>{teamStats.totalPlayers}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: '#666', fontWeight: 500 }}>등록 선수</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', flex: 1, py: 1.5, bgcolor: '#E3F2FD', borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 900, fontSize: '1.8rem', color: '#1565C0' }}>{teamStats.avgAttend}%</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: '#666', fontWeight: 500 }}>평균 참석율</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', flex: 1, py: 1.5, bgcolor: '#FFF3E0', borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 900, fontSize: '1.8rem', color: '#E65100' }}>
                  {recentResults.length > 0 ? recentResults[0].matches.length : 0}
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', color: '#666', fontWeight: 500 }}>최근 경기수</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

      </Container>
    </Box>
  );
}

export default HomePage;

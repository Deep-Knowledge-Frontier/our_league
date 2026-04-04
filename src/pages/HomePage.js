import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import {
  Container, Box, Typography, Card, CardContent, Button,
  CircularProgress, Chip, Divider
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import PlaceIcon from '@mui/icons-material/Place';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { parseDateKeyLocal, getDaysDiff, formatDateWithDay } from '../utils/format';

function HomePage() {
  const navigate = useNavigate();
  const { clubName, userName, authReady, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [nextMatch, setNextMatch] = useState(null);
  const [nextMatchAttend, setNextMatchAttend] = useState(0);
  const [recentResults, setRecentResults] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [teamStats, setTeamStats] = useState({ totalPlayers: 0, avgAttend: 0 });

  // 배너 자동 슬라이드
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setBannerIndex(prev => (prev + 1) % banners.length), 15000);
    return () => clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    if (!authReady || !user || !clubName) return;
    // 클럽 전환 시 기존 데이터 초기화
    setNextMatch(null);
    setNextMatchAttend(0);
    setRecentResults([]);
    setLeaderboard([]);
    setTeamStats({ totalPlayers: 0, avgAttend: 0 });
    setLoading(true);
    let cancelled = false;

    const loadData = async () => {
      try {
        // 1. 배너
        const bannerSnap = await get(ref(db, 'banners'));
        if (cancelled) return;
        if (bannerSnap.exists()) {
          setBanners(Object.values(bannerSnap.val()).filter(b => b.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)));
        }

        // 2. 다음 경기
        const matchSnap = await get(ref(db, `MatchDates/${clubName}`));
        if (cancelled) return;
        if (matchSnap.exists()) {
          const data = matchSnap.val();
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const upcoming = Object.keys(data)
            .filter(dk => (data[dk]?.isActive === true || data[dk]?.isActive === 'true') && parseDateKeyLocal(dk) >= today)
            .sort();
          if (upcoming.length > 0) {
            const dk = upcoming[0];
            setNextMatch({ date: dk, time: data[dk]?.time || '', location: data[dk]?.location || '' });
            const attendSnap = await get(ref(db, `PlayerSelectionByDate/${clubName}/${dk}/AttandPlayer/all`));
            if (attendSnap.exists() && Array.isArray(attendSnap.val())) {
              setNextMatchAttend(attendSnap.val().filter(Boolean).length);
            }
          }
        }

        if (cancelled) return;
        // 3. 최근 경기 결과 + 우승팀 계산
        const dailySnap = await get(ref(db, `DailyResultsBackup/${clubName}`));
        if (cancelled) return;
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
        }

        if (cancelled) return;
        // 4. 선수순위 리더보드 (abilityScore 기준 TOP 5)
        const statsSnap = await get(ref(db, `PlayerStatsBackup_6m/${clubName}`));
        if (cancelled) return;
        if (statsSnap.exists()) {
          const data = statsSnap.val();
          setLeaderboard(
            Object.entries(data)
              .filter(([, s]) => (s.attendanceRate || 0) >= 10)
              .map(([name, s]) => ({
                name,
                abilityScore: s.abilityScore || 0,
                goals: s.goals || s.totalGoals || 0,
                assists: s.assists || s.totalAssists || 0,
                attendanceRate: s.attendanceRate || 0,
                pointRate: s.pointRate || 0,
                matches: s.participatedMatches || 0,
              }))
              .sort((a, b) => b.abilityScore - a.abilityScore)
              .slice(0, 5)
          );
        }

        if (cancelled) return;
        // 5. 팀 현황 — registeredPlayers 기준
        const regSnap = await get(ref(db, `registeredPlayers/${clubName}`));
        if (cancelled) return;
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
      if (!cancelled) setLoading(false);
    };
    loadData();
    return () => { cancelled = true; };
  }, [authReady, user, clubName]);


  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F0F2F5' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress sx={{ color: '#2D336B' }} />
          <Typography sx={{ mt: 2, color: '#666' }}>로딩 중...</Typography>
        </Box>
      </Box>
    );
  }

  const medalLabels = ['🥇', '🥈', '🥉', '4', '5'];
  const dday = nextMatch ? getDaysDiff(nextMatch.date) : -1;

  return (
    <Box sx={{ bgcolor: '#F0F2F5', minHeight: '100vh', pb: 10 }}>

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

        {/* ── 다음 경기 ── */}
        {nextMatch && (
          <Card sx={{
            mb: 2, borderRadius: 3, boxShadow: 3, overflow: 'hidden',
            border: '1px solid #E0E0E0',
          }}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <CalendarMonthIcon sx={{ color: '#1565C0', fontSize: 22 }} />
                <Typography sx={{ fontWeight: 'bold', color: '#1565C0', fontSize: '1.05rem', flex: 1 }}>다음 경기</Typography>
                <Chip
                  label={dday === 0 ? 'D-DAY' : `D-${dday}`}
                  size="small"
                  sx={{
                    bgcolor: '#1565C0', color: 'white',
                    fontWeight: 900, fontSize: '0.8rem', height: 26, px: 0.5,
                  }}
                />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', color: '#222', mb: 0.5 }}>
                {formatDateWithDay(nextMatch.date)}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1.5, color: '#666' }}>
                {nextMatch.time && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                    <AccessTimeIcon sx={{ fontSize: 17 }} />
                    <Typography sx={{ fontSize: '0.92rem' }}>{nextMatch.time}</Typography>
                  </Box>
                )}
                {nextMatch.location && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                    <PlaceIcon sx={{ fontSize: 17 }} />
                    <Typography sx={{ fontSize: '0.92rem' }}>{nextMatch.location}</Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Chip icon={<PeopleIcon sx={{ fontSize: '16px !important' }} />}
                  label={`${nextMatchAttend}명 참석`} size="small"
                  sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 'bold', fontSize: '0.8rem', height: 28 }} />
                <Button variant="contained" size="small" endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate('/vote')}
                  sx={{ borderRadius: 2, bgcolor: '#1565C0', fontWeight: 'bold', px: 2.5, py: 0.8 }}>
                  투표하기
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* ── 최근 경기 결과 ── */}
        {recentResults.length > 0 && (
          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: 2 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SportsSoccerIcon sx={{ color: '#333', fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 'bold', fontSize: '1.08rem' }}>최근 경기</Typography>
                </Box>
                <Button size="small" onClick={() => navigate('/results')} endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.8rem', color: '#999' }}>전체보기</Button>
              </Box>
              {recentResults.map((r, ri) => (
                <Box key={r.date}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#333' }}>
                      {formatDateWithDay(r.date)}
                    </Typography>
                    {r.winner && (
                      <Chip label={`우승 ${r.winner}`} size="small"
                        sx={{ fontSize: '0.78rem', height: 24, bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 'bold' }} />
                    )}
                    {r.dailyMvp !== '없음' && (
                      <Chip icon={<EmojiEventsIcon sx={{ fontSize: '14px !important', color: '#F57C00 !important' }} />}
                        label={r.dailyMvp} size="small"
                        sx={{ fontSize: '0.78rem', height: 24, bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 'bold' }} />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.2 }}>
                    {r.matches.map((m, mi) => {
                      const isTeam1Win = m.score1 > m.score2;
                      const isTeam2Win = m.score2 > m.score1;
                      return (
                        <Box key={mi} sx={{
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          bgcolor: '#FAFAFA', borderRadius: 1.5, px: 1, py: 0.4,
                          border: '1px solid #EEEEEE',
                        }}>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: isTeam1Win ? 800 : 400, color: isTeam1Win ? '#1565C0' : '#999' }}>{m.team1}</Typography>
                          <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: '#333' }}>{m.score1}:{m.score2}</Typography>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: isTeam2Win ? 800 : 400, color: isTeam2Win ? '#1565C0' : '#999' }}>{m.team2}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                  {ri < recentResults.length - 1 && <Divider sx={{ mb: 1 }} />}
                </Box>
              ))}
            </CardContent>
          </Card>
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
                <Button size="small" onClick={() => navigate('/results')} endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
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

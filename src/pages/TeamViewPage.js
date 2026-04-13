import React, { useEffect, useMemo, useState } from "react";
import { db } from "../config/firebase";
import { ref, onValue, get } from "firebase/database";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Paper,
  Chip,
  Stack,
  Button,
  Card,
  CardContent,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import ShareIcon from "@mui/icons-material/Share";
import GroupsIcon from "@mui/icons-material/Groups";
import VpnKeyIcon from "@mui/icons-material/VpnKey";

import { useAuth } from "../contexts/AuthContext";
import { normalizeNames, formatDateWithDay } from "../utils/format";
import { softmaxPercent } from "../utils/stats";
import { getFormations, getDefaultFormation } from "../config/formations";
import { shareFormationImage } from "../utils/shareFormation";
import FormationField from "../components/FormationField";

// (xx.x%) 포맷
function fmt(p) {
  return `${p.toFixed(1)}%`;
}

// 점수가 없는(0점) 사람을 제외하고 평균을 구하는 헬퍼 함수
function calculateAverageExcludeZero(teamMembers, rateMap) {
  if (!teamMembers || teamMembers.length === 0) return 0;

  let sum = 0;
  let count = 0;

  teamMembers.forEach((name) => {
    const score = rateMap[name] || 0;
    if (score > 0) {
      sum += score;
      count++;
    }
  });

  if (count === 0) return 0;
  return sum / count;
}

export default function TeamViewPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const { clubName, userName } = useAuth();

  const [loading, setLoading] = useState(true);

  const [teams, setTeams] = useState({ A: [], B: [], C: [] });
  const [keyPop, setKeyPop] = useState([]);
  const [playerPointRate, setPlayerPointRate] = useState({});
  const [playerAbility, setPlayerAbility] = useState({});

  // 포메이션
  const [clubType, setClubType] = useState('futsal');
  const [teamFormations, setTeamFormations] = useState({});
  const [expandFormation, setExpandFormation] = useState('A');
  const [teamNames, setTeamNames] = useState({ A: '', B: '', C: '' });
  const [teamCaptains, setTeamCaptains] = useState({ A: '', B: '', C: '' });

  // 🆕 쿼터 시스템
  const [quarterCount, setQuarterCount] = useState(0);
  const [quarterFormations, setQuarterFormations] = useState({});
  const [teamQuarterTab, setTeamQuarterTab] = useState({ A: 'Q1', B: 'Q1' }); // 팀별 쿼터 기억
  const activeQuarter = teamQuarterTab[expandFormation === 'B' ? 'B' : 'A'] || 'Q1';
  const setActiveQuarter = (qKey) => {
    const teamCode = expandFormation === 'B' ? 'B' : 'A';
    setTeamQuarterTab(prev => ({ ...prev, [teamCode]: qKey }));
  };
  const useQuarterView = clubType === 'football' && quarterCount >= 2 && !teams.C.length;

  useEffect(() => {
    setLoading(true);
    const teamsRef = ref(db, `PlayerSelectionByDate/${clubName}/${date}/AttandPlayer`);
    const keyPopRef = ref(db, `PlayerSelectionByDate/${clubName}/${date}/keyPop`);

    const off1 = onValue(teamsRef, (snap) => {
      const v = snap.val() || {};
      setTeams({
        A: normalizeNames(v.A),
        B: normalizeNames(v.B),
        C: normalizeNames(v.C),
      });
      setLoading(false);
    });

    const off2 = onValue(keyPopRef, (snap) => {
      setKeyPop(normalizeNames(snap.val()));
    });

    // 클럽 종목 (1회 로드)
    get(ref(db, `clubs/${clubName}`)).then(snap => {
      if (snap.exists()) setClubType(snap.val().type || 'futsal');
    });

    // 실시간 구독 — 관리탭에서 변경 시 즉시 반영
    const off3 = onValue(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamFormation`), snap => {
      setTeamFormations(snap.val() || {});
    });
    const off4 = onValue(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamNames`), snap => {
      if (snap.exists()) setTeamNames(prev => ({ ...prev, ...snap.val() }));
    });
    const off5 = onValue(ref(db, `PlayerSelectionByDate/${clubName}/${date}/TeamCaptains`), snap => {
      if (snap.exists()) setTeamCaptains(prev => ({ ...prev, ...snap.val() }));
    });
    const off6 = onValue(ref(db, `PlayerSelectionByDate/${clubName}/${date}/QuarterConfig`), snap => {
      if (snap.exists() && snap.val()?.count >= 2) setQuarterCount(snap.val().count);
      else setQuarterCount(0);
    });
    const off7 = onValue(ref(db, `PlayerSelectionByDate/${clubName}/${date}/QuarterFormation`), snap => {
      setQuarterFormations(snap.val() || {});
    });

    return () => {
      off1(); off2(); off3(); off4(); off5(); off6(); off7();
    };
  }, [clubName, date]);

  useEffect(() => {
    const statsRef = ref(db, `PlayerStatsBackup_6m/${clubName}`);
    const off = onValue(statsRef, (snap) => {
      const v = snap.val() || {};
      const rateMap = {}, abilMap = {};
      Object.keys(v).forEach((player) => {
        rateMap[player] = Number(v[player]?.pointRate || 0);
        abilMap[player] = Number(v[player]?.abilityScore || 0);
      });
      setPlayerPointRate(rateMap);
      setPlayerAbility(abilMap);
    });
    return () => off();
  }, [clubName]);

  const formattedDate = useMemo(() => formatDateWithDay(date), [date]);

  const scoreA = useMemo(() => calculateAverageExcludeZero(teams.A, playerPointRate), [teams.A, playerPointRate]);
  const scoreB = useMemo(() => calculateAverageExcludeZero(teams.B, playerPointRate), [teams.B, playerPointRate]);
  const scoreC = useMemo(() => calculateAverageExcludeZero(teams.C, playerPointRate), [teams.C, playerPointRate]);

  const teamCount = useMemo(() => (teams.C?.length ? 3 : 2), [teams.C]);

  const probs = useMemo(() => {
    const scores = teamCount === 3 ? [scoreA, scoreB, scoreC] : [scoreA, scoreB];
    const percents = softmaxPercent(scores, 20);
    return {
      A: percents[0] || 0,
      B: percents[1] || 0,
      C: teamCount === 3 ? (percents[2] || 0) : 0,
    };
  }, [scoreA, scoreB, scoreC, teamCount]);

  const theme = {
    A: { chipBg: "#1E66D0", bar: "#1E66D0", cardBg: "#EAF2FF", border: "#BBD3FF" },
    B: { chipBg: "#1F7A2E", bar: "#1F7A2E", cardBg: "#EAF7EE", border: "#BFE8C7" },
    C: { chipBg: "#D12A2A", bar: "#D12A2A", cardBg: "#FFECEC", border: "#FFC2C2" },
  };

  // TeamCard: 가로 배치에 최적화
  const TeamCard = ({ code, title, players, percent }) => {
    const t = theme[code];
    return (
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.8 }}>
        <Chip label={`우승 ${fmt(percent)}`}
          sx={{ bgcolor: t.chipBg, color: "white", fontWeight: 700, fontSize: "0.75rem", borderRadius: "16px", height: 26 }} />
        <Box sx={{
          width: "100%", borderRadius: 2.5, overflow: "hidden",
          border: `1px solid ${t.border}`, bgcolor: t.cardBg,
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}>
          <Box sx={{ bgcolor: t.bar, color: "white", textAlign: "center", fontWeight: 800, py: 0.7, fontSize: "0.9rem" }}>
            {title}
          </Box>
          <Box sx={{ p: 0.8, display: "flex", flexDirection: "column", gap: 0.5 }}>
            {(() => {
              if (players.length === 0) {
                return (
                  <Typography sx={{ color: "text.secondary", textAlign: "center", py: 2, fontSize: "0.85rem" }}>없음</Typography>
                );
              }
              // 주장을 맨 위(1번)로 정렬 — 표시 순서만, 원본 배열은 유지
              const cap = teamCaptains[code];
              const sorted = cap && players.includes(cap)
                ? [cap, ...players.filter((p) => p !== cap)]
                : players;
              return sorted.map((name, idx) => {
                const isCaptain = cap === name;
                const isMe = name === userName;
                const ability = playerAbility[name];
                return (
                  <Box key={`${code}-${name}-${idx}`} sx={{
                    bgcolor: isMe ? '#E3F2FD' : isCaptain ? "#FFF3E0" : "white",
                    border: isMe ? '1.5px solid #1565C0' : isCaptain ? "1.5px solid #FF9800" : "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 1.5, px: 0.8, py: 0.5,
                    display: "flex", alignItems: "center", gap: 0.4,
                  }}>
                    <Typography sx={{ fontSize: "0.72rem", color: "#aaa", fontWeight: 600, flexShrink: 0 }}>{idx + 1}</Typography>
                    <Typography sx={{
                      fontWeight: isMe ? 800 : isCaptain ? 800 : 500, fontSize: "0.85rem", flex: 1,
                      color: isMe ? '#1565C0' : isCaptain ? "#E65100" : "#333",
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{name}</Typography>
                    {ability > 0 && (
                      <Typography sx={{ fontSize: '0.65rem', color: '#999', fontWeight: 600, flexShrink: 0 }}>
                        {ability.toFixed(0)}
                      </Typography>
                    )}
                  </Box>
                );
              });
            })()}
          </Box>
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Container sx={{ mt: 6, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>팀 구성 정보를 불러오는 중입니다...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ pt: 2, pb: 5 }}>
      <Card sx={{
        mb: 2, borderRadius: 3, overflow: 'hidden',
        background: 'linear-gradient(135deg, #2D336B 0%, #1A1D4E 100%)',
        boxShadow: 3,
      }}>
        <CardContent sx={{ py: 2.5, textAlign: 'center', position: 'relative' }}>
          <Button onClick={() => navigate(-1)}
            sx={{ position: 'absolute', left: 8, top: 12, minWidth: 'auto', color: 'rgba(255,255,255,0.6)' }}>
            <ArrowBackIcon />
          </Button>
          <GroupsIcon sx={{ fontSize: 28, color: 'rgba(255,255,255,0.4)', mb: 0.5 }} />
          <Typography variant="h5" sx={{ color: 'white', fontWeight: 900 }}>팀 구성</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', mt: 0.3 }}>{formattedDate}</Typography>
        </CardContent>
      </Card>


      <Paper
        elevation={3}
        sx={{
          borderRadius: 3,
          p: { xs: 1.5, sm: 2.5 },
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "nowrap",
            alignItems: "stretch",
          }}
        >
          <TeamCard code="A" title={teamNames.A || "A"} players={teams.A} percent={probs.A} />
          <TeamCard code="B" title={teamNames.B || "B"} players={teams.B} percent={probs.B} />
          {teamCount === 3 && (
            <TeamCard code="C" title={teamNames.C || "C"} players={teams.C} percent={probs.C} />
          )}
        </Box>

        <Box sx={{ my: 2.2, height: 1, bgcolor: "rgba(0,0,0,0.12)" }} />

        {/* 축구 2팀 쿼터 뷰 — 관리탭과 동일한 스타일 */}
        {useQuarterView && (Object.keys(teamFormations).length > 0 || Object.keys(quarterFormations).length > 0) && (() => {
          const activeTeamCode = expandFormation === 'B' ? 'B' : 'A';
          const tf = quarterFormations?.[activeTeamCode]?.[activeQuarter] || teamFormations[activeTeamCode] || {};
          const fmId = tf.formationId;
          const fmDef = fmId ? getFormations(clubType)[fmId] : null;
          const fieldW = Math.min(280, window.innerWidth - 80);

          return (
            <Box>
              {/* 1️⃣ 팀 선택 탭 (좌우) */}
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                {['A', 'B'].map((c) => {
                  const t = theme[c];
                  const active = activeTeamCode === c;
                  const cTf = quarterFormations?.[c]?.[activeQuarter] || teamFormations[c] || {};
                  const cFmId = cTf.formationId || '';
                  return (
                    <Box
                      key={c}
                      onClick={() => setExpandFormation(c)}
                      sx={{
                        flex: 1, py: 1.2, textAlign: 'center',
                        borderRadius: 2, cursor: 'pointer',
                        bgcolor: active ? t.chipBg : t.cardBg,
                        color: active ? 'white' : t.chipBg,
                        fontWeight: 900, fontSize: '0.9rem',
                        border: `2px solid ${active ? t.chipBg : t.border}`,
                        boxShadow: active ? `0 4px 12px ${t.chipBg}44` : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {teamNames[c] || c}
                      {cFmId && (
                        <Typography component="span" sx={{ fontSize: '0.65rem', ml: 0.5, opacity: 0.7 }}>
                          {cFmId}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>

              {/* 2️⃣ 쿼터 탭 */}
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                {Array.from({ length: quarterCount }).map((_, i) => {
                  const qKey = `Q${i + 1}`;
                  const active = activeQuarter === qKey;
                  return (
                    <Box
                      key={qKey}
                      onClick={() => setActiveQuarter(qKey)}
                      sx={{
                        flex: 1, py: 0.7, textAlign: 'center',
                        borderRadius: '8px 8px 0 0',
                        cursor: 'pointer',
                        bgcolor: active ? '#2D336B' : 'transparent',
                        color: active ? 'white' : '#888',
                        fontWeight: active ? 900 : 600,
                        fontSize: '0.82rem',
                        borderBottom: active ? '3px solid #2D336B' : '3px solid #E0E0E0',
                        transition: 'all 0.15s',
                        '&:hover': !active ? { color: '#555', borderBottomColor: '#999' } : {},
                      }}
                    >
                      {qKey}
                    </Box>
                  );
                })}
              </Box>

              {/* 3️⃣ 포메이션 제목 + 공유 */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.8, gap: 0.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#444' }}>
                  <SportsSoccerIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5, color: '#2E7D32' }} />
                  {activeQuarter} 포메이션
                </Typography>
                <IconButton
                  size="small"
                  onClick={async () => {
                    try {
                      const activeTeamCode = expandFormation === 'B' ? 'B' : 'A';
                      const teamLabel = teamNames[activeTeamCode] || activeTeamCode;
                      const blob = await shareFormationImage({
                        clubType, teamLabel, date, quarterCount,
                        quarterFormations, teamFormations, teamCode: activeTeamCode,
                      });
                      const file = new File([blob], `${teamLabel}_formation.png`, { type: 'image/png' });
                      if (navigator.share && navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title: `${teamLabel} 포메이션` });
                      } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${teamLabel}_formation.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    } catch (e) {
                      console.error('share error', e);
                    }
                  }}
                  sx={{ color: '#888', '&:hover': { color: '#2D336B' } }}
                >
                  <ShareIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>

              {fmDef ? (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <FormationField
                    clubType={clubType}
                    positions={fmDef.positions}
                    players={tf.players || {}}
                    readOnly={true}
                    width={fieldW}
                  />
                </Box>
              ) : (
                <Typography sx={{ textAlign: 'center', color: '#999', fontSize: '0.85rem', py: 2 }}>
                  포메이션이 설정되지 않았습니다
                </Typography>
              )}
            </Box>
          );
        })()}

        {/* 풋살/3팀 포메이션 — 아코디언 스타일 */}
        {!useQuarterView && (Object.keys(teamFormations).length > 0) && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', mb: 1, textAlign: 'center' }}>
              <SportsSoccerIcon sx={{ fontSize: 18, verticalAlign: 'middle', mr: 0.5, color: '#2E7D32' }} />
              팀별 포메이션
            </Typography>
            {['A', 'B', 'C'].map(code => {
              const tf = teamFormations[code];
              if (!tf || !tf.formationId) return null;
              const fmDef = getFormations(clubType)[tf.formationId];
              if (!fmDef) return null;
              const isExpanded = expandFormation === code;
              return (
                <Box key={code} sx={{ mb: 1 }}>
                  <Box onClick={() => setExpandFormation(isExpanded ? null : code)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.6, px: 1,
                      bgcolor: theme[code].cardBg, borderRadius: 1.5, border: `1px solid ${theme[code].border}` }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: theme[code].chipBg }} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{teamNames[code] || code}</Typography>
                    <Chip label={tf.formationId} size="small" sx={{ fontSize: '0.7rem', height: 20, fontWeight: 600 }} />
                    {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                  </Box>
                  {isExpanded && (
                    <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
                      <FormationField
                        clubType={clubType}
                        positions={fmDef.positions}
                        players={tf.players || {}}
                        readOnly={true}
                        width={Math.min(280, window.innerWidth - 80)}
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>

      {userName ? (
        <Box sx={{ mt: 2, textAlign: "center", color: "text.secondary" }}>
          <Typography variant="body2">
            {userName}님, {clubName} 팀구성을 확인하세요.
          </Typography>
        </Box>
      ) : null}
    </Container>
  );
}

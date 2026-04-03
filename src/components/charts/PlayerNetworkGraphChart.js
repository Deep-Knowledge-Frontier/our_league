import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  Box, Typography, Paper, IconButton, Chip,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import GroupIcon from '@mui/icons-material/Group';

/* ── 포지션별 색상 ── */
const POS_COLOR = {
  FW: '#E53935', AM: '#5C6BC0', MF: '#1E88E5',
  DM: '#0097A7', DF: '#43A047', GK: '#FB8C00',
};
const posColor = (pos) => POS_COLOR[pos] || '#78909C';

const MIN_GAMES = 5;
const MIN_NODE_GAMES = 12;

export default function PlayerNetworkGraphChart({
  networkData,
  playerStats6m,
  playerDetailStats,
  playerPositions,
  userName,
  mode = 'full',
  height = 380,
}) {
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [graphWidth, setGraphWidth] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filter, setFilter] = useState('all');
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());

  /* ── 컨테이너 너비 측정 ── */
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setGraphWidth(containerRef.current.offsetWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [networkData]);

  /* ── 그래프 데이터 빌드 ── */
  const graphData = useMemo(() => {
    if (!networkData) return null;

    const getGames = (name) =>
      playerDetailStats?.[name]?.totalGames
      || playerStats6m?.[name]?.participatedMatches
      || 0;

    /* 노드 후보 */
    const playerSet = new Set();
    Object.keys(networkData).forEach(a => {
      playerSet.add(a);
      if (networkData[a]) Object.keys(networkData[a]).forEach(b => playerSet.add(b));
    });

    let eligibleSet;
    if (mode === 'ego' && userName) {
      const direct = new Set();
      if (networkData[userName]) {
        Object.entries(networkData[userName]).forEach(([b, d]) => {
          if (d.games >= MIN_GAMES) direct.add(b);
        });
      }
      Object.entries(networkData).forEach(([a, conns]) => {
        if (conns[userName] && conns[userName].games >= MIN_GAMES) direct.add(a);
      });
      eligibleSet = new Set(
        [userName, ...direct].filter(n => n === userName || getGames(n) > MIN_NODE_GAMES)
      );
    } else {
      eligibleSet = new Set([...playerSet].filter(n => getGames(n) > MIN_NODE_GAMES));
    }

    /* 능력치 범위 (노드 크기) */
    const abilities = [...eligibleSet].map(n => playerStats6m?.[n]?.abilityScore || 50);
    const maxA = Math.max(...abilities, 60);
    const minA = Math.min(...abilities, 40);

    /* 링크 빌드 */
    const drawn = new Set();
    const links = [];
    const connectedNames = new Set();
    let maxEdge = 1;
    Object.values(networkData).forEach(conns => {
      if (conns) Object.values(conns).forEach(d => { if (d.games > maxEdge) maxEdge = d.games; });
    });

    Object.entries(networkData).forEach(([a, conns]) => {
      if (!conns) return;
      Object.entries(conns).forEach(([b, data]) => {
        const key = [a, b].sort().join('|');
        if (drawn.has(key) || data.games < MIN_GAMES) return;
        if (!eligibleSet.has(a) || !eligibleSet.has(b)) return;

        // ego 모드: 나와 연결된 링크만 (star 형태)
        if (mode === 'ego' && a !== userName && b !== userName) return;

        if (filter === 'best' && (data.winRate || 50) < 55) return;
        drawn.add(key);
        connectedNames.add(a);
        connectedNames.add(b);

        const wr = (data.winRate || 50) / 100;
        const synergy = Math.pow(wr, 2) * Math.log(data.games + 1);

        // ego 모드는 더 넓은 거리, full 모드는 기존 거리
        let distance;
        if (mode === 'ego') {
          // 승률 높을수록 가까이: 60%→120, 50%→180, 40%→250
          distance = Math.max(320 / (1 + synergy * 1.2), 80);
        } else {
          distance = Math.max(220 / (1 + synergy * 1.5), 40);
        }

        links.push({
          source: a, target: b,
          games: data.games,
          winRate: data.winRate || 50,
          maxEdge,
          distance,
          linkKey: key,
        });
      });
    });

    if (mode === 'ego' && userName) connectedNames.add(userName);

    /* 노드 빌드 */
    const nodes = [...connectedNames].map(name => {
      const ability = playerStats6m?.[name]?.abilityScore || 50;
      const detail = playerDetailStats?.[name];
      const s6 = playerStats6m?.[name];
      const g = getGames(name);
      const wr = s6?.winLossRate ?? detail?.winRate ?? 50;
      const position = playerPositions?.[name] || null;
      const mvpCount = detail?.mvpCount || 0;
      const aN = (ability - minA) / (maxA - minA || 1);
      const size = 5 + aN * 25;
      const isMe = name === userName;

      return {
        id: name,
        totalGames: g,
        winRate: wr,
        abilityScore: ability,
        size: isMe && mode === 'ego' ? size * 1.5 : size,
        position,
        mvpCount,
        isMe,
        goalsPerGame: detail?.goalsPerGame || 0,
        assistsPerGame: detail?.assistsPerGame || 0,
        totalGoals: detail?.totalGoals || s6?.totalGoals || s6?.goals || 0,
        totalAssists: detail?.totalAssists || s6?.totalAssists || s6?.assists || 0,
        attendanceRate: s6?.attendanceRate || 0,
        ...(isMe && mode === 'ego' ? { fx: 0, fy: 0 } : {}),
      };
    });

    return nodes.length > 0 ? { nodes, links } : null;
  }, [networkData, playerStats6m, playerDetailStats, playerPositions, userName, mode, filter]);

  /* ── ego 모드: charge force 강화 (노드 간 반발력 증가) ── */
  useEffect(() => {
    if (!fgRef.current) return;
    const strength = mode === 'ego' ? -300 : -100;
    fgRef.current.d3Force('charge')?.strength(strength);
  }, [mode, graphData]);

  /* ── 노드 클릭 ── */
  const handleNodeClick = useCallback((node) => {
    let myRelation = null;
    if (userName && networkData) {
      const d = networkData[userName]?.[node.id] || networkData[node.id]?.[userName];
      if (d) myRelation = { games: d.games, winRate: d.winRate };
    }
    setSelectedNode({ ...node, myRelation });

    const conn = new Set([node.id]);
    const connL = new Set();
    if (graphData) {
      graphData.links.forEach(link => {
        const src = typeof link.source === 'object' ? link.source.id : link.source;
        const tgt = typeof link.target === 'object' ? link.target.id : link.target;
        if (src === node.id || tgt === node.id) {
          conn.add(src); conn.add(tgt);
          connL.add(link.linkKey);
        }
      });
    }
    setHighlightNodes(conn);
    setHighlightLinks(connL);
  }, [userName, networkData, graphData]);

  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  if (!graphData) return null;

  const hasHL = highlightNodes.size > 0;

  return (
    <>
      {/* ── 필터 토글 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 0.5 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, v) => { if (v) { setFilter(v); clearSelection(); } }}
          size="small"
          sx={{ '& .MuiToggleButton-root': { fontSize: '0.72rem', py: 0.3, px: 1.5 } }}
        >
          <ToggleButton value="all">전체</ToggleButton>
          <ToggleButton value="best">Best 시너지</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── 그래프 ── */}
      <Box ref={containerRef} sx={{ bgcolor: '#ffffff', position: 'relative' }}>
        {graphWidth > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={graphWidth}
            height={height}
            backgroundColor="#ffffff"
            nodeVal={n => n.size}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const r = Math.sqrt(node.size) * 2.5;
              const isHL = !hasHL || highlightNodes.has(node.id);
              ctx.globalAlpha = isHL ? 1 : 0.15;

              // 포지션 색상 원
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = posColor(node.position);
              ctx.fill();

              // 이름 라벨
              const fs = Math.max(11 / globalScale, 3);
              ctx.font = `${node.isMe ? 'bold ' : ''}${fs}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillStyle = node.isMe ? '#D4A017' : '#222';
              ctx.fillText(node.id, node.x, node.y - r - 2 / globalScale);

              ctx.globalAlpha = 1;
            }}
            nodeCanvasObjectMode={() => 'replace'}
            linkWidth={link => {
              const isHL = !hasHL || highlightLinks.has(link.linkKey);
              const base = 1 + (link.games / link.maxEdge) * 4;
              return isHL ? base : base * 0.3;
            }}
            linkColor={link => {
              const isHL = !hasHL || highlightLinks.has(link.linkKey);
              const wr = link.winRate;
              if (wr >= 60) return isHL ? 'rgba(67,160,71,0.55)' : 'rgba(67,160,71,0.07)';
              if (wr >= 45) return isHL ? 'rgba(158,158,158,0.4)' : 'rgba(158,158,158,0.07)';
              return isHL ? 'rgba(229,57,53,0.45)' : 'rgba(229,57,53,0.07)';
            }}
            linkCurvature={0.08}
            linkDirectionalParticles={0}
            d3VelocityDecay={mode === 'ego' ? 0.4 : 0.3}
            d3AlphaDecay={0.02}
            linkDistance={link => link.distance || 100}
            cooldownTicks={200}
            onNodeClick={handleNodeClick}
            onBackgroundClick={clearSelection}
            onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
          />
        )}

        {/* ── 선수 정보 팝업 ── */}
        {selectedNode && (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute', bottom: 8, left: 8, right: 8,
              p: 2, borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.97)',
              backdropFilter: 'blur(8px)',
              zIndex: 10,
            }}
          >
            <IconButton size="small" onClick={clearSelection}
              sx={{ position: 'absolute', top: 4, right: 4 }}>
              <CloseIcon fontSize="small" />
            </IconButton>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              {selectedNode.position && (
                <Chip label={selectedNode.position} size="small"
                  sx={{ bgcolor: posColor(selectedNode.position), color: 'white', fontWeight: 'bold', fontSize: '0.7rem', height: 22 }} />
              )}
              <Typography sx={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
                {selectedNode.id}
              </Typography>
              {selectedNode.mvpCount >= 1 && (
                <Chip
                  icon={<EmojiEventsIcon sx={{ fontSize: '14px !important', color: '#F57C00 !important' }} />}
                  label={`MVP ${selectedNode.mvpCount}회`} size="small"
                  sx={{ fontSize: '0.68rem', height: 22, bgcolor: '#FFF3E0', color: '#E65100' }} />
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 1 }}>
              {[
                { label: '능력치', value: Math.round(selectedNode.abilityScore), color: '#2D336B' },
                { label: '경기', value: selectedNode.totalGames, color: '#333' },
                { label: '승률', value: `${Math.round(selectedNode.winRate)}%`, color: '#7B1FA2' },
                { label: '골/경기', value: Number(selectedNode.goalsPerGame || 0).toFixed(1), color: '#D32F2F' },
                { label: '도움/경기', value: Number(selectedNode.assistsPerGame || 0).toFixed(1), color: '#F57C00' },
              ].map(s => (
                <Box key={s.label} sx={{
                  textAlign: 'center', flex: '1 1 55px',
                  bgcolor: '#F5F7FA', borderRadius: 1.5, py: 0.5, px: 0.3,
                }}>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 'bold', color: s.color }}>{s.value}</Typography>
                  <Typography sx={{ fontSize: '0.62rem', color: '#999' }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>

            {selectedNode.myRelation && !selectedNode.isMe && (
              <Box sx={{
                bgcolor: selectedNode.myRelation.winRate >= 55 ? '#E8F5E9' : selectedNode.myRelation.winRate >= 45 ? '#E3F2FD' : '#FFEBEE',
                borderRadius: 2, p: 1, display: 'flex', alignItems: 'center', gap: 1,
              }}>
                <GroupIcon sx={{ color: '#1565C0', fontSize: 18 }} />
                <Typography sx={{ fontSize: '0.82rem', color: '#333', fontWeight: 500 }}>
                  나와 함께 <b>{selectedNode.myRelation.games}경기</b> · 승률{' '}
                  <b style={{ color: selectedNode.myRelation.winRate >= 55 ? '#388E3C' : selectedNode.myRelation.winRate >= 45 ? '#1565C0' : '#D32F2F' }}>
                    {Math.round(selectedNode.myRelation.winRate)}%
                  </b>
                </Typography>
              </Box>
            )}
          </Paper>
        )}
      </Box>

      {/* ── 범례 ── */}
      <Box sx={{ px: 1.5, pt: 1, pb: 0.3, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, rowGap: 0.3 }}>
        {Object.entries(POS_COLOR).map(([pos, color]) => (
          <Box key={pos} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
            <Typography sx={{ fontSize: '0.65rem', color: '#666' }}>{pos}</Typography>
          </Box>
        ))}
        <Typography sx={{ fontSize: '0.65rem', color: '#D4A017', fontWeight: 'bold' }}>노란이름=나</Typography>
        <Typography sx={{ fontSize: '0.65rem', color: '#999' }}>크기=능력치</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, pb: 1 }}>
        {[
          { color: 'rgba(67,160,71,0.7)', label: '승률 60%↑' },
          { color: 'rgba(158,158,158,0.55)', label: '45~60%' },
          { color: 'rgba(229,57,53,0.6)', label: '45%↓' },
        ].map(l => (
          <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Box sx={{ width: 16, height: 3, bgcolor: l.color, borderRadius: 1 }} />
            <Typography sx={{ fontSize: '0.65rem', color: '#666' }}>{l.label}</Typography>
          </Box>
        ))}
      </Box>
    </>
  );
}

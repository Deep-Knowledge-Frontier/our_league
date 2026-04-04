import React from 'react';
import { Box, Typography } from '@mui/material';

// 풋살 코트 SVG
function FutsalCourt({ width, height }) {
  const w = width, h = height;
  const cx = w / 2, cy = h / 2;
  return (
    <g>
      {/* 바닥 */}
      <rect x={0} y={0} width={w} height={h} rx={8} fill="#2E7D32" />
      {/* 외곽선 */}
      <rect x={w * 0.05} y={h * 0.04} width={w * 0.9} height={h * 0.92} rx={4} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
      {/* 중앙선 */}
      <line x1={w * 0.05} y1={cy} x2={w * 0.95} y2={cy} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
      {/* 중앙 원 */}
      <circle cx={cx} cy={cy} r={h * 0.1} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={3} fill="rgba(255,255,255,0.35)" />
      {/* 상단 페널티 에어리어 */}
      <rect x={w * 0.25} y={h * 0.04} width={w * 0.5} height={h * 0.14} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
      <path d={`M ${w * 0.35} ${h * 0.04} A ${w * 0.15} ${h * 0.08} 0 0 1 ${w * 0.65} ${h * 0.04}`} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      {/* 하단 페널티 에어리어 */}
      <rect x={w * 0.25} y={h * 0.82} width={w * 0.5} height={h * 0.14} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
      <path d={`M ${w * 0.35} ${h * 0.96} A ${w * 0.15} ${h * 0.08} 0 0 0 ${w * 0.65} ${h * 0.96}`} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
    </g>
  );
}

// 축구 필드 SVG
function FootballPitch({ width, height }) {
  const w = width, h = height;
  const cx = w / 2, cy = h / 2;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={8} fill="#388E3C" />
      {/* 외곽선 */}
      <rect x={w * 0.04} y={h * 0.03} width={w * 0.92} height={h * 0.94} rx={2} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
      {/* 중앙선 */}
      <line x1={w * 0.04} y1={cy} x2={w * 0.96} y2={cy} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
      {/* 중앙 원 */}
      <circle cx={cx} cy={cy} r={h * 0.08} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2.5} fill="rgba(255,255,255,0.35)" />
      {/* 상단 페널티 에어리어 */}
      <rect x={w * 0.2} y={h * 0.03} width={w * 0.6} height={h * 0.15} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
      <rect x={w * 0.33} y={h * 0.03} width={w * 0.34} height={h * 0.06} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <path d={`M ${w * 0.32} ${h * 0.18} A ${w * 0.12} ${h * 0.06} 0 0 1 ${w * 0.68} ${h * 0.18}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* 하단 페널티 에어리어 */}
      <rect x={w * 0.2} y={h * 0.82} width={w * 0.6} height={h * 0.15} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
      <rect x={w * 0.33} y={h * 0.91} width={w * 0.34} height={h * 0.06} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <path d={`M ${w * 0.32} ${h * 0.82} A ${w * 0.12} ${h * 0.06} 0 0 0 ${w * 0.68} ${h * 0.82}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* 코너 아크 */}
      <path d={`M ${w * 0.04} ${h * 0.06} A ${w * 0.025} ${w * 0.025} 0 0 1 ${w * 0.065} ${h * 0.03}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <path d={`M ${w * 0.935} ${h * 0.03} A ${w * 0.025} ${w * 0.025} 0 0 1 ${w * 0.96} ${h * 0.06}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <path d={`M ${w * 0.04} ${h * 0.94} A ${w * 0.025} ${w * 0.025} 0 0 0 ${w * 0.065} ${h * 0.97}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <path d={`M ${w * 0.935} ${h * 0.97} A ${w * 0.025} ${w * 0.025} 0 0 0 ${w * 0.96} ${h * 0.94}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
    </g>
  );
}

// 포지션 색상
function getPosColor(label) {
  if (label === 'GK') return '#FF9800';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DF'].includes(label)) return '#42A5F5';
  if (['CM', 'CDM', 'AM', 'LM', 'RM', 'MF', 'DM'].includes(label)) return '#66BB6A';
  return '#EF5350'; // FW, ST, LW, RW, LF, RF
}

export default function FormationField({
  clubType = 'futsal',
  positions = [],
  players = {},       // { positionId: playerName }
  selectedPos = null, // 선택된 포지션 ID
  onPositionClick,    // callback(positionId)
  width: containerWidth,
  readOnly = false,
}) {
  const isFutsal = clubType === 'futsal';
  const W = containerWidth || 340;
  const H = isFutsal ? W * 1.35 : W * 1.45;

  return (
    <Box sx={{ width: W, mx: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <defs>
          <filter id="selectedGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* 필드 배경 */}
        {isFutsal ? <FutsalCourt width={W} height={H} /> : <FootballPitch width={W} height={H} />}

        {/* 포지션 마커 */}
        {positions.map((pos) => {
          const px = (pos.x / 100) * W;
          const py = (pos.y / 100) * H;
          const playerName = players[pos.id];
          const color = getPosColor(pos.label);
          const r = isFutsal ? 22 : 19;
          const isSelected = selectedPos === pos.id;

          return (
            <g key={pos.id}
              onClick={() => !readOnly && onPositionClick && onPositionClick(pos.id)}
              style={{ cursor: readOnly ? 'default' : 'pointer' }}>
              {/* 선택 링 */}
              {isSelected && (
                <circle cx={px} cy={py} r={r + 6} fill="none" stroke="#FFD600" strokeWidth={3} opacity={0.9}>
                  <animate attributeName="r" values={`${r + 5};${r + 8};${r + 5}`} dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.5;0.9" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 외곽 원 */}
              <circle cx={px} cy={py} r={r + 2} fill="rgba(0,0,0,0.2)" />
              <circle cx={px} cy={py} r={r} fill={isSelected ? '#FFD600' : color} stroke="white" strokeWidth={2}
                filter={isSelected ? 'url(#selectedGlow)' : undefined} />

              {/* 포지션 라벨 */}
              <text x={px} y={py - (playerName ? 3 : 0)} textAnchor="middle" dominantBaseline="central"
                fill={isSelected ? '#333' : 'white'} fontSize={playerName ? 9 : 11} fontWeight="bold" fontFamily="sans-serif"
                style={{ pointerEvents: 'none' }}>
                {pos.label}
              </text>

              {/* 선수 이름 */}
              {playerName && (
                <text x={px} y={py + 9} textAnchor="middle" dominantBaseline="central"
                  fill={isSelected ? '#333' : 'white'} fontSize={9.5} fontWeight="600" fontFamily="sans-serif"
                  style={{ pointerEvents: 'none' }}>
                  {playerName.length > 3 ? playerName.slice(0, 3) : playerName}
                </text>
              )}

              {/* 빈 포지션 표시 */}
              {!playerName && !readOnly && (
                <text x={px} y={py + 12} textAnchor="middle" dominantBaseline="central"
                  fill={isSelected ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'} fontSize={8} fontFamily="sans-serif"
                  style={{ pointerEvents: 'none' }}>
                  {isSelected ? '선택됨' : '터치'}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

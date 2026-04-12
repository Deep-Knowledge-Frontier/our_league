import React from 'react';
import { Box, Avatar } from '@mui/material';

/**
 * 포지션별 축구 선수 일러스트 아바타
 *
 * Props:
 *   - position: 'GK' | 'DF' | 'DM' | 'MF' | 'AM' | 'FW' (기타는 MF로 처리)
 *   - size: number (기본 56)
 *   - imageUrl: string (있으면 일러스트 대신 실제 이미지 사용)
 *   - showLabel: boolean (기본 true — 포지션 라벨 뱃지 표시)
 */

// 포지션별 유니폼/배경 컬러
const POSITION_STYLE = {
  GK: { jersey: '#F9A825', gradient: 'linear-gradient(135deg, #FFB300 0%, #FF8F00 100%)', label: 'GK', hasGloves: true,  hasBall: false },
  DF: { jersey: '#1565C0', gradient: 'linear-gradient(135deg, #1E88E5 0%, #1565C0 100%)', label: 'DF', hasGloves: false, hasBall: false },
  DM: { jersey: '#00838F', gradient: 'linear-gradient(135deg, #0097A7 0%, #006064 100%)', label: 'DM', hasGloves: false, hasBall: false },
  MF: { jersey: '#2E7D32', gradient: 'linear-gradient(135deg, #43A047 0%, #1B5E20 100%)', label: 'MF', hasGloves: false, hasBall: false },
  AM: { jersey: '#EF6C00', gradient: 'linear-gradient(135deg, #FB8C00 0%, #E65100 100%)', label: 'AM', hasGloves: false, hasBall: true  },
  FW: { jersey: '#C62828', gradient: 'linear-gradient(135deg, #E53935 0%, #B71C1C 100%)', label: 'FW', hasGloves: false, hasBall: true  },
};

function getStyle(position) {
  if (!position) return POSITION_STYLE.MF;
  const p = String(position).toUpperCase();
  return POSITION_STYLE[p] || POSITION_STYLE.MF;
}

// 축구 선수 SVG 일러스트
function PlayerSvg({ style, size }) {
  const { jersey, label, hasGloves, hasBall } = style;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      {/* 머리 */}
      <circle cx="50" cy="24" r="11" fill="#F4C6A5" stroke="#D4A574" strokeWidth="0.5" />
      {/* 머리카락 (앞머리) */}
      <path d="M40 21 Q40 13, 50 11 Q60 13, 60 21 L60 18 Q55 14, 50 14 Q45 14, 40 18 Z" fill="#3E2723" />
      {/* 목 */}
      <rect x="46" y="32" width="8" height="4" fill="#F4C6A5" />
      {/* 유니폼 상의 */}
      <path d="M30 42 Q30 35, 38 35 L42 35 Q45 38, 50 38 Q55 38, 58 35 L62 35 Q70 35, 70 42 L70 66 L30 66 Z" fill={jersey} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
      {/* 유니폼 번호(포지션 라벨) */}
      <text x="50" y="58" textAnchor="middle" fill="white" fontSize="11" fontWeight="900" fontFamily="Arial, sans-serif">
        {label}
      </text>
      {/* 왼쪽 팔 */}
      <rect x="22" y="40" width="8" height="22" rx="4" fill={jersey} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
      {/* 오른쪽 팔 */}
      <rect x="70" y="40" width="8" height="22" rx="4" fill={jersey} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
      {/* 손 */}
      {hasGloves ? (
        <>
          {/* 골키퍼 장갑 */}
          <circle cx="26" cy="66" r="5" fill="#FFECB3" stroke="#FFA000" strokeWidth="1" />
          <circle cx="74" cy="66" r="5" fill="#FFECB3" stroke="#FFA000" strokeWidth="1" />
        </>
      ) : (
        <>
          <circle cx="26" cy="65" r="3.5" fill="#F4C6A5" />
          <circle cx="74" cy="65" r="3.5" fill="#F4C6A5" />
        </>
      )}
      {/* 반바지 */}
      <path d="M32 66 L68 66 L66 80 L52 80 L51 68 L49 68 L48 80 L34 80 Z" fill="#263238" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
      {/* 다리 */}
      <rect x="38" y="80" width="7" height="11" fill="#F4C6A5" />
      <rect x="55" y="80" width="7" height="11" fill="#F4C6A5" />
      {/* 양말 */}
      <rect x="37" y="89" width="9" height="4" fill="#FFFFFF" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
      <rect x="54" y="89" width="9" height="4" fill="#FFFFFF" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
      {/* 축구화 */}
      <ellipse cx="41" cy="95" rx="5.5" ry="2.5" fill="#212121" />
      <ellipse cx="58" cy="95" rx="5.5" ry="2.5" fill="#212121" />
      {/* 공 (공격수/미드필더) */}
      {hasBall && (
        <g>
          <circle cx="65" cy="94" r="4" fill="white" stroke="#212121" strokeWidth="0.8" />
          <path d="M63 92 L65 94 L67 92 M63 96 L65 94 L67 96" stroke="#212121" strokeWidth="0.6" fill="none" />
        </g>
      )}
    </svg>
  );
}

export default function PositionAvatar({ position, size = 56, imageUrl, showLabel = false, sx }) {
  const style = getStyle(position);

  // 실제 프로필 이미지가 있으면 그대로 사용
  if (imageUrl) {
    return (
      <Avatar
        src={imageUrl}
        sx={{
          width: size,
          height: size,
          border: '3px solid rgba(255,255,255,0.35)',
          ...sx,
        }}
      />
    );
  }

  return (
    <Box sx={{ position: 'relative', display: 'inline-block', ...sx }}>
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: style.gradient,
          border: '3px solid rgba(255,255,255,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 3px 10px rgba(0,0,0,0.2)',
        }}
      >
        <PlayerSvg style={style} size={size * 0.88} />
      </Box>
      {showLabel && (
        <Box
          sx={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            bgcolor: style.jersey,
            color: 'white',
            fontSize: size * 0.18,
            fontWeight: 900,
            px: 0.7,
            py: 0.1,
            borderRadius: 1,
            border: '2px solid white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            letterSpacing: 0.3,
          }}
        >
          {style.label}
        </Box>
      )}
    </Box>
  );
}

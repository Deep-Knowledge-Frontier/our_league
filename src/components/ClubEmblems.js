import React from 'react';

// 수성FC 엠블럼: 다이아몬드 + 방패, 빨강+금색
export function SusungFCEmblem({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 방패 외곽 */}
      <path d="M60 6L110 26V70C110 96 85 114 60 120C35 114 10 96 10 70V26L60 6Z" fill="#8B0000" stroke="#DAA520" strokeWidth="3.5"/>
      {/* 방패 내부 */}
      <path d="M60 13L103 30V70C103 92 81 108 60 113C39 108 17 92 17 70V30L60 13Z" fill="#A80000"/>
      {/* 별 */}
      <polygon points="60,11 61.5,15 66,15 62.5,17.5 63.5,21.5 60,19 56.5,21.5 57.5,17.5 54,15 58.5,15" fill="#DAA520"/>
      {/* 다이아몬드 */}
      <path d="M60 30L85 60L60 90L35 60Z" fill="#DAA520" stroke="#B8860B" strokeWidth="2"/>
      <path d="M60 36L80 60L60 84L40 60Z" fill="#FFD700" stroke="#DAA520" strokeWidth="1"/>
      {/* 다이아몬드 내부 빛 반사 */}
      <path d="M60 36L50 55L60 48L70 55Z" fill="#FFF8DC" opacity="0.5"/>
      <path d="M40 60L50 55L60 48L50 65Z" fill="#FFFACD" opacity="0.3"/>
      {/* 팀명 배너 */}
      <path d="M25 92L95 92L92 100L25 100Z" fill="#DAA520" opacity="0.9"/>
      <text x="60" y="99" textAnchor="middle" fill="#8B0000" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="11" letterSpacing="1.5">
        수성FC
      </text>
    </svg>
  );
}

// 한강FC 엠블럼: 물결 + 원형, 파랑+하양
export function HangangFCEmblem({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 외곽 원 */}
      <circle cx="60" cy="60" r="56" fill="#0D47A1" stroke="#1565C0" strokeWidth="3"/>
      {/* 내부 원 테두리 */}
      <circle cx="60" cy="60" r="50" fill="none" stroke="#FFD700" strokeWidth="2"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      {/* 상단 호: 한강FC 텍스트 */}
      <path id="topArc" d="M24 60 A36 36 0 0 1 96 60" fill="none"/>
      <text fill="#FFD700" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="11" letterSpacing="3">
        <textPath href="#topArc" startOffset="50%" textAnchor="middle">한강FC</textPath>
      </text>
      {/* 물결 패턴 (3개 레이어) */}
      <path d="M20 55 Q30 48 40 55 Q50 62 60 55 Q70 48 80 55 Q90 62 100 55" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.9"/>
      <path d="M20 66 Q30 59 40 66 Q50 73 60 66 Q70 59 80 66 Q90 73 100 66" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"/>
      <path d="M20 77 Q30 70 40 77 Q50 84 60 77 Q70 70 80 77 Q90 84 100 77" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5"/>
      {/* 다리 실루엣 */}
      <rect x="35" y="50" width="3" height="18" rx="1" fill="rgba(255,255,255,0.3)"/>
      <rect x="58" y="50" width="3" height="18" rx="1" fill="rgba(255,255,255,0.3)"/>
      <rect x="82" y="50" width="3" height="18" rx="1" fill="rgba(255,255,255,0.3)"/>
      <rect x="32" y="49" width="58" height="2.5" rx="1" fill="rgba(255,255,255,0.25)"/>
      {/* 하단 장식 */}
      <text x="60" y="100" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="7" letterSpacing="2">
        EST. 2024
      </text>
      {/* 축구공 아이콘 */}
      <circle cx="60" cy="40" r="6" fill="white" stroke="#0D47A1" strokeWidth="1"/>
      <path d="M57 38L60 35L63 38M57 42L60 45L63 42M55 40H65" stroke="#0D47A1" strokeWidth="0.8" fill="none"/>
    </svg>
  );
}

// 클럽명 → 엠블럼 컴포넌트 매핑
export const CLUB_EMBLEM_MAP = {
  '수성FC': SusungFCEmblem,
  '한강FC': HangangFCEmblem,
};

export function ClubEmblem({ clubName, size = 48 }) {
  const EmblemComponent = CLUB_EMBLEM_MAP[clubName];
  if (EmblemComponent) return <EmblemComponent size={size} />;
  return null;
}

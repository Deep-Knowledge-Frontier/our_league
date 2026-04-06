// 공통 스타일 유틸리티 (토스/카카오뱅크 스타일)

// 카드 터치 인터랙션 (눌리는 효과)
export const touchCard = {
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  '&:active': { transform: 'scale(0.98)', boxShadow: '0 1px 8px rgba(0,0,0,0.08)' },
};

// 모던 카드 스타일
export const modernCard = {
  borderRadius: 4,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  border: '1px solid rgba(0,0,0,0.04)',
  ...touchCard,
};

// 스켈레톤 애니메이션
export const skeletonPulse = {
  '@keyframes skeletonPulse': {
    '0%': { opacity: 0.6 },
    '50%': { opacity: 0.3 },
    '100%': { opacity: 0.6 },
  },
  animation: 'skeletonPulse 1.5s ease-in-out infinite',
};

// 스켈레톤 박스
export const skeletonBox = (height = 20, width = '100%') => ({
  height, width, borderRadius: 2, bgcolor: '#E8E8E8',
  ...skeletonPulse,
});

// 바텀시트 스타일
export const bottomSheetPaper = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  borderRadius: '20px 20px 0 0',
  maxHeight: '85vh',
  boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
};

import React, { useState, useEffect } from 'react';
import {
  Dialog, Box, Typography, Button, IconButton, Stack, LinearProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getTour } from '../data/onboardingSteps';

/**
 * 풀스크린 온보딩 투어 모달
 *
 * Props:
 *   - open: boolean
 *   - role: 'admin' | 'captain' | (기타)
 *   - onComplete: () => void   // 사용자가 "완료" 클릭 시
 *   - onSkip: () => void       // 사용자가 "건너뛰기" 또는 X 클릭 시
 */
export default function OnboardingModal({ open, role, onComplete, onSkip }) {
  const [stepIdx, setStepIdx] = useState(0);
  const tour = getTour(role);

  // 열릴 때마다 첫 스텝으로 리셋
  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open, role]);

  if (!tour) return null;
  const steps = tour.steps;
  const currentStep = steps[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;
  const progress = ((stepIdx + 1) / steps.length) * 100;

  const handleNext = () => {
    if (isLast) {
      onComplete?.();
    } else {
      setStepIdx((i) => i + 1);
    }
  };
  const handleBack = () => {
    if (!isFirst) setStepIdx((i) => i - 1);
  };

  return (
    <Dialog
      open={open}
      onClose={onSkip}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
          maxHeight: '92vh',
        },
      }}
    >
      {/* 그라데이션 헤더 */}
      <Box sx={{
        background: tour.gradient,
        color: 'white',
        px: 2.5, py: 2,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', flex: 1 }}>
          📖 {tour.title}
        </Typography>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.8 }}>
          {stepIdx + 1} / {steps.length}
        </Typography>
        <IconButton size="small" onClick={onSkip} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* 프로그레스 바 */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 4,
          bgcolor: '#E0E0E0',
          '& .MuiLinearProgress-bar': { background: tour.gradient },
        }}
      />

      {/* 본문 */}
      <Box sx={{ px: 3, py: 3, minHeight: 340 }}>
        {/* 이모지 + 타이틀 */}
        <Box sx={{ textAlign: 'center', mb: 2.5 }}>
          <Typography
            sx={{
              fontSize: '4rem',
              lineHeight: 1.1,
              mb: 1.2,
              filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.15))',
              animation: 'stepPop 0.4s ease-out',
              '@keyframes stepPop': {
                '0%': { transform: 'scale(0.7)', opacity: 0 },
                '100%': { transform: 'scale(1)', opacity: 1 },
              },
            }}
          >
            {currentStep.emoji}
          </Typography>
          <Typography
            sx={{
              fontWeight: 900,
              fontSize: '1.25rem',
              color: tour.accentColor,
              lineHeight: 1.3,
            }}
          >
            {currentStep.title}
          </Typography>
        </Box>

        {/* 설명 */}
        <Typography
          sx={{
            fontSize: '0.9rem',
            color: '#444',
            lineHeight: 1.7,
            textAlign: 'center',
            mb: currentStep.tips && currentStep.tips.length > 0 ? 2 : 0,
          }}
        >
          {currentStep.description}
        </Typography>

        {/* 팁 */}
        {currentStep.tips && currentStep.tips.length > 0 && (
          <Box
            sx={{
              mt: 1.5, p: 1.5, borderRadius: 2,
              bgcolor: '#FAFBFF',
              border: `1px dashed ${tour.accentColor}40`,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: tour.accentColor,
                mb: 0.8,
                letterSpacing: 0.3,
              }}
            >
              💡 TIP
            </Typography>
            <Stack spacing={0.6}>
              {currentStep.tips.map((tip, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-start' }}>
                  <Typography sx={{ fontSize: '0.78rem', color: tour.accentColor, fontWeight: 900, mt: '1px' }}>•</Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.55, flex: 1 }}>
                    {tip}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Box>

      {/* 하단 네비게이션 */}
      <Box
        sx={{
          px: 2.5, py: 2,
          borderTop: '1px solid #EEE',
          bgcolor: '#FAFAFA',
          display: 'flex', alignItems: 'center', gap: 1,
        }}
      >
        {/* 스텝 점 인디케이터 */}
        <Box sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
          {steps.map((_, i) => (
            <Box
              key={i}
              onClick={() => setStepIdx(i)}
              sx={{
                width: i === stepIdx ? 20 : 6,
                height: 6,
                borderRadius: 3,
                bgcolor: i === stepIdx ? tour.accentColor : i < stepIdx ? `${tour.accentColor}66` : '#DDD',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
            />
          ))}
        </Box>

        {/* Back */}
        <Button
          size="small"
          onClick={handleBack}
          disabled={isFirst}
          startIcon={<ArrowBackIcon />}
          sx={{ color: '#666', minWidth: 'auto', visibility: isFirst ? 'hidden' : 'visible' }}
        >
          이전
        </Button>

        {/* Next / Complete */}
        <Button
          variant="contained"
          size="small"
          onClick={handleNext}
          endIcon={isLast ? <CheckCircleIcon /> : <ArrowForwardIcon />}
          sx={{
            fontWeight: 800, px: 2.5, py: 0.8, borderRadius: 2,
            background: tour.gradient,
            '&:hover': { background: tour.gradient, filter: 'brightness(0.95)' },
          }}
        >
          {isLast ? '시작하기' : '다음'}
        </Button>
      </Box>
    </Dialog>
  );
}

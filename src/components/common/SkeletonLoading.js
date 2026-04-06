import React from 'react';
import { Box, Card, CardContent } from '@mui/material';

const pulse = {
  '@keyframes pulse': {
    '0%': { opacity: 0.6 },
    '50%': { opacity: 0.3 },
    '100%': { opacity: 0.6 },
  },
  animation: 'pulse 1.5s ease-in-out infinite',
};

const Bar = ({ w = '100%', h = 14, mb = 1, radius = 2 }) => (
  <Box sx={{ width: w, height: h, borderRadius: radius, bgcolor: '#E8E8E8', mb, ...pulse }} />
);

// 홈페이지 스켈레톤
export function HomePageSkeleton() {
  return (
    <Box sx={{ px: 2 }}>
      {/* 헤더 카드 */}
      <Card sx={{ mb: 2, borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ height: 100, bgcolor: '#E0E0E0', ...pulse }} />
      </Card>
      {/* 다음 경기 */}
      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <CardContent>
          <Bar w="40%" h={16} />
          <Bar w="70%" h={12} mb={0.5} />
          <Bar w="50%" h={12} />
        </CardContent>
      </Card>
      {/* 최근 경기 */}
      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <CardContent>
          <Bar w="30%" h={16} mb={1.5} />
          {[1, 2, 3].map(i => (
            <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              {[1, 2, 3].map(j => <Bar key={j} w="30%" h={28} radius={1.5} />)}
            </Box>
          ))}
        </CardContent>
      </Card>
      {/* 선수순위 */}
      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <CardContent>
          <Bar w="35%" h={16} mb={1.5} />
          {[1, 2, 3, 4, 5].map(i => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Bar w={24} h={24} radius="50%" mb={0} />
              <Bar w="40%" h={14} mb={0} />
              <Box sx={{ flex: 1 }} />
              <Bar w="15%" h={14} mb={0} />
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

// 내 정보 스켈레톤
export function MyPageSkeleton() {
  return (
    <Box sx={{ px: 2 }}>
      <Card sx={{ mb: 2, borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ height: 120, bgcolor: '#E0E0E0', ...pulse }} />
      </Card>
      <Box sx={{ display: 'flex', gap: 0.8, mb: 2 }}>
        {[1, 2, 3, 4].map(i => <Bar key={i} w="25%" h={56} radius={2.5} mb={0} />)}
      </Box>
      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <CardContent>
          <Box sx={{ height: 200, bgcolor: '#E8E8E8', borderRadius: 2, ...pulse }} />
        </CardContent>
      </Card>
      <Card sx={{ mb: 2, borderRadius: 3 }}>
        <CardContent>
          <Bar w="40%" h={16} mb={1.5} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
            {[1, 2, 3].map(i => <Bar key={i} h={60} radius={2.5} mb={0} />)}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// 경기결과 스켈레톤
export function ResultsPageSkeleton() {
  return (
    <Box sx={{ px: 2 }}>
      {[1, 2, 3].map(i => (
        <Card key={i} sx={{ mb: 2, borderRadius: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Bar w="45%" h={18} mb={0} />
              <Bar w="25%" h={18} mb={0} />
            </Box>
            {[1, 2, 3].map(j => (
              <Box key={j} sx={{ display: 'flex', gap: 0.8, mb: 0.8 }}>
                {[1, 2, 3].map(k => <Bar key={k} w="30%" h={30} radius={1.5} mb={0} />)}
              </Box>
            ))}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

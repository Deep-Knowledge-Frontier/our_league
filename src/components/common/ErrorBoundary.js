import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';

const MAX_AUTO_RETRY = 2;

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0, retrying: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    if (this.state.retryCount < MAX_AUTO_RETRY) {
      this.setState({ retrying: true });
      setTimeout(() => {
        this.setState(prev => ({
          hasError: false, error: null,
          retryCount: prev.retryCount + 1, retrying: false,
        }));
      }, 1000);
    }
  }

  render() {
    if (this.state.retrying) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <CircularProgress size={24} sx={{ color: '#2D336B' }} />
        </Box>
      );
    }

    if (this.state.hasError && this.state.retryCount >= MAX_AUTO_RETRY) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', p: 3 }}>
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>😵</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>문제가 발생했습니다</Typography>
          <Typography sx={{ color: '#999', fontSize: '0.82rem', mb: 2, textAlign: 'center' }}>
            자동 복구에 실패했습니다
          </Typography>
          <Button variant="outlined" size="small"
            onClick={() => this.setState({ hasError: false, error: null, retryCount: 0 })}
            sx={{ borderRadius: 2, fontWeight: 600 }}>
            다시 시도
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

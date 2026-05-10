// 글로벌 Toast(Snackbar) 시스템
// - useToast() 훅으로 어디서든 호출
// - 4가지 타입: success / error / info / warning
// - 한 번에 하나만 표시 (자동 큐잉)

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 3500;

export function ToastProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState({ message: '', severity: 'info', duration: DEFAULT_DURATION });
  const queueRef = useRef([]);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      setCurrent(next);
      setOpen(true);
    }
  }, []);

  const enqueue = useCallback((message, severity = 'info', duration = DEFAULT_DURATION) => {
    if (!message) return;
    queueRef.current.push({ message: String(message), severity, duration });
    if (!open) showNext();
  }, [open, showNext]);

  const handleClose = useCallback((_e, reason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  }, []);

  // Snackbar transition end → 다음 큐 표시
  const handleExited = useCallback(() => {
    showNext();
  }, [showNext]);

  const api = useMemo(() => ({
    show:    (msg, dur) => enqueue(msg, 'info', dur),
    success: (msg, dur) => enqueue(msg, 'success', dur),
    error:   (msg, dur) => enqueue(msg, 'error', dur ?? 5000),       // 에러는 길게
    warning: (msg, dur) => enqueue(msg, 'warning', dur),
    info:    (msg, dur) => enqueue(msg, 'info', dur),
  }), [enqueue]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={current.message + (current.severity || '')}
        open={open}
        autoHideDuration={current.duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        TransitionProps={{ onExited: handleExited }}
        sx={{ bottom: { xs: 90, sm: 24 } }} // 하단 네비게이션바 위로
      >
        <Alert
          onClose={handleClose}
          severity={current.severity}
          variant="filled"
          sx={{
            width: '100%',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            whiteSpace: 'pre-line', // \n 줄바꿈 지원
          }}
        >
          {current.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

/**
 * 어디서든 Toast 호출
 * @example
 *   const toast = useToast();
 *   toast.error('저장 실패');
 *   toast.success('저장 완료');
 *   toast.warning('확인 필요');
 *   toast.info('알려드립니다');
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Provider 외부 호출 시 alert로 fallback (안전)
    return {
      show: (m) => window.alert(m),
      success: (m) => window.alert(m),
      error: (m) => window.alert(m),
      warning: (m) => window.alert(m),
      info: (m) => window.alert(m),
    };
  }
  return ctx;
}

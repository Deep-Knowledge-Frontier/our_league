import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { ref, get, child } from 'firebase/database';
import { Container, Button, Typography, Paper, Box } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { auth, googleProvider, db } from '../config/firebase';
import { getSafeEmailKey } from '../utils/format';
import { APP_CONFIG } from '../config/app.config';

// =========================================================================
// Particle Intro Animation
// =========================================================================
const ParticleIntro = ({ isDataLoaded, onReveal, onComplete }) => {
  const pCanvasRef = useRef(null);
  const fCanvasRef = useRef(null);
  const [step, setStep] = useState('playing');
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const pCanvas = pCanvasRef.current;
    const fCanvas = fCanvasRef.current;
    if (!pCanvas || !fCanvas) return;

    const pCtx = pCanvas.getContext('2d');
    const fCtx = fCanvas.getContext('2d');
    let animationFrameId;
    let particles = [];
    let currentFontSize = 80;

    const resizeCanvases = () => {
      pCanvas.width = window.innerWidth;
      pCanvas.height = window.innerHeight;
      fCanvas.width = window.innerWidth;
      fCanvas.height = window.innerHeight;
      const maxFontSize = 80;
      pCtx.font = `bold ${maxFontSize}px Arial`;
      const textWidth = pCtx.measureText(APP_CONFIG.logoText).width;
      currentFontSize = textWidth > window.innerWidth * 0.9
        ? maxFontSize * ((window.innerWidth * 0.9) / textWidth) : maxFontSize;
    };

    const drawLogoText = (ctx, width, height, isFinal) => {
      ctx.clearRect(0, 0, width, height);
      ctx.font = `bold ${currentFontSize}px Arial`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      // 로고 텍스트에서 마지막 단어를 빨간색으로
      const parts = APP_CONFIG.logoText.split(' ');
      const lastWord = parts.pop();
      const firstPart = parts.join(' ') + ' ';

      const w1 = ctx.measureText(firstPart).width;
      const w2 = ctx.measureText(lastWord).width;
      const startX = (width - w1 - w2) / 2;
      const startY = height / 2;

      if (isFinal) {
        ctx.shadowBlur = currentFontSize / 5;
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(255,255,255,0.4)';
        ctx.fillText(firstPart, startX, startY);
        ctx.fillStyle = '#ff4747';
        ctx.shadowColor = 'rgba(255,71,71,0.6)';
        ctx.fillText(lastWord, startX + w1, startY);
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        ctx.fillText(firstPart, startX, startY);
        ctx.fillText(lastWord, startX + w1, startY);
      }
    };

    const getTextCoordinates = () => {
      const tmp = document.createElement('canvas');
      const tmpCtx = tmp.getContext('2d');
      tmp.width = pCanvas.width;
      tmp.height = pCanvas.height;
      drawLogoText(tmpCtx, tmp.width, tmp.height, false);
      const data = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
      const coords = [];
      const gap = Math.max(Math.floor(currentFontSize / 15), 3);
      for (let y = 0; y < data.height; y += gap) {
        for (let x = 0; x < data.width; x += gap) {
          if (data.data[(y * data.width + x) * 4 + 3] > 128) coords.push({ x, y });
        }
      }
      return coords;
    };

    class Particle {
      constructor(tx, ty) {
        this.x = Math.random() * pCanvas.width * 2 - pCanvas.width / 2;
        this.y = Math.random() * pCanvas.height * 2 - pCanvas.height / 2;
        this.targetX = tx; this.targetY = ty;
        this.size = Math.random() * (currentFontSize / 40) + currentFontSize / 80;
        this.color = Math.random() > 0.8 ? '#ff4747' : '#ffffff';
        this.speed = Math.random() * 0.08 + 0.04;
        this.angle = Math.random() * Math.PI * 2;
      }
      update() {
        this.x += (this.targetX - this.x) * this.speed;
        this.y += (this.targetY - this.y) * this.speed;
        if (Math.abs(this.targetX - this.x) < 1) {
          this.x += Math.sin(this.angle) * 0.3;
          this.y += Math.cos(this.angle) * 0.3;
          this.angle += 0.05;
        }
      }
      draw() {
        pCtx.beginPath();
        pCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        pCtx.fillStyle = this.color;
        pCtx.shadowBlur = 10;
        pCtx.shadowColor = this.color;
        pCtx.fill();
      }
    }

    resizeCanvases();
    drawLogoText(fCtx, fCanvas.width, fCanvas.height, true);
    particles = getTextCoordinates().map((c) => new Particle(c.x, c.y));

    const animate = () => {
      pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
      particles.forEach((p) => { p.update(); p.draw(); });
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', resizeCanvases);
    const t1 = setTimeout(() => setStep('crossfade'), 2000);
    const t2 = setTimeout(() => setMinTimePassed(true), 3500);

    return () => {
      window.removeEventListener('resize', resizeCanvases);
      cancelAnimationFrame(animationFrameId);
      clearTimeout(t1); clearTimeout(t2);
      document.body.style.overflow = 'auto';
    };
  }, []);

  useEffect(() => {
    if (minTimePassed && isDataLoaded && step !== 'slideup') {
      setStep('slideup');
      onReveal?.();
      setTimeout(() => { onComplete?.(); document.body.style.overflow = 'auto'; }, 1000);
    }
  }, [minTimePassed, isDataLoaded, step, onReveal, onComplete]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 20000,
      background: 'radial-gradient(circle, #500000 0%, #1a0505 100%)',
      transition: 'transform 1s cubic-bezier(0.7,0,0.3,1), opacity 1s ease',
      transform: step === 'slideup' ? 'translateY(-100%)' : 'translateY(0)',
      opacity: step === 'slideup' ? 0 : 1,
      pointerEvents: step === 'slideup' ? 'none' : 'auto',
    }}>
      <canvas ref={fCanvasRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1,
        transition: 'opacity 1s ease-in-out',
        opacity: step === 'crossfade' || step === 'slideup' ? 1 : 0,
      }} />
      <canvas ref={pCanvasRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2,
        transition: 'opacity 1s ease-in-out',
        opacity: step === 'playing' ? 1 : 0,
      }} />
    </div>
  );
};

// =========================================================================
// LoginPage
// =========================================================================
function LoginPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [targetPath, setTargetPath] = useState(null);
  const [introStage, setIntroStage] = useState('playing');
  const [introDone, setIntroDone] = useState(false);

  // 카카오톡 인앱 브라우저 대응
  useEffect(() => {
    const ua = navigator.userAgent;
    if (ua.match(/KAKAOTALK/i)) {
      if (ua.match(/Android/i)) {
        const target = window.location.href.replace(/https?:\/\//i, '');
        window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
      } else {
        alert('구글 로그인은 카카오톡 인앱 브라우저에서 보안상 제한됩니다.\n\n화면 우측 하단 [⋮] 점 세 개 버튼을 누른 후 [Safari로 열기]를 선택해주세요.');
      }
    }
  }, []);

  // 자동 로그인 체크
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u || null);
      if (u) {
        try {
          const emailKey = getSafeEmailKey(u.email);
          const snapshot = await get(child(ref(db), `Users/${emailKey}`));
          if (snapshot.exists() && snapshot.val()?.consentGiven && snapshot.val()?.club) {
            setTargetPath('/vote');
          } else {
            // 클럽 미선택 또는 미등록 유저 → 회원가입
            setTargetPath('/register');
          }
        } catch {
          setTargetPath('/register');
        }
      } else {
        setTargetPath(null);
      }
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  const handleIntroReveal = useCallback(() => setIntroStage('revealed'), []);
  const handleIntroComplete = useCallback(() => { setIntroStage('done'); setIntroDone(true); }, []);

  useEffect(() => {
    if (introDone && authChecked && user && targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [introDone, authChecked, user, targetPath, navigate]);

  const handleGoogleLogin = async () => {
    if (navigator.userAgent.match(/KAKAOTALK/i)) {
      if (navigator.userAgent.match(/Android/i)) return;
      alert('화면 우측 하단의 메뉴를 눌러 [브라우저로 열기]를 해주세요.');
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('로그인 에러:', error);
      alert('로그인 실패: ' + error.message);
    }
  };

  const showLoginForm = authChecked && !user;

  return (
    <>
      <Box sx={{
        visibility: introStage === 'playing' ? 'hidden' : 'visible',
        pointerEvents: introStage === 'playing' ? 'none' : 'auto',
        opacity: introStage === 'revealed' || introStage === 'done' ? 1 : 0,
        transform: introStage === 'revealed' || introStage === 'done' ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 1s cubic-bezier(0.7,0,0.3,1)',
        minHeight: '100vh', backgroundColor: '#050505',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
      }}>
        {showLoginForm && (
          <Container maxWidth="xs" style={{ textAlign: 'center' }}>
            <Paper elevation={3} style={{ padding: '40px' }}>
              <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#474E93', mb: '20px' }}>
                우리들의 리그
              </Typography>
              <Box mb={4} sx={{ fontSize: '50px' }}>⚽</Box>
              <Typography variant="body1" sx={{ color: '#474E93', mb: '30px' }}>
                Google 계정으로 로그인하세요
              </Typography>
              <Button
                variant="contained" fullWidth startIcon={<GoogleIcon />}
                onClick={handleGoogleLogin}
                sx={{ backgroundColor: '#DB4437', color: 'white', padding: '10px' }}
              >
                Google 계정으로 시작하기
              </Button>
            </Paper>
          </Container>
        )}
      </Box>
      {!introDone && (
        <ParticleIntro
          isDataLoaded={authChecked}
          onReveal={handleIntroReveal}
          onComplete={handleIntroComplete}
        />
      )}
    </>
  );
}

export default LoginPage;

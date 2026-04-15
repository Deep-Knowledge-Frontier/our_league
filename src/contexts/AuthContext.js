import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, db } from '../config/firebase';
import { getSafeEmailKey } from '../utils/format';
import { APP_CONFIG } from '../config/app.config';

// ── Dev 전용: 로그인 없이 자동으로 admin@test.com 진입 ──
// .env의 REACT_APP_DEV_AUTO_LOGIN=true 설정 시 활성화 (emulator 전제)
const DEV_AUTO_LOGIN =
  process.env.NODE_ENV === 'development' && process.env.REACT_APP_DEV_AUTO_LOGIN === 'true';
let devAutoLoginAttempted = false;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         // Firebase Auth user
  const [userData, setUserData] = useState(null);  // DB user data
  const [emailKey, setEmailKey] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isMasterDb, setIsMasterDb] = useState(false); // DB에서 조회한 마스터 여부
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  // 게스트 데모 모드 (로그인 없이 체험)
  const [isDemoGuest, setIsDemoGuest] = useState(() => sessionStorage.getItem('demoGuest') === 'true');
  const enterDemoGuest = () => { sessionStorage.setItem('demoGuest', 'true'); setIsDemoGuest(true); };
  const exitDemoGuest = () => { sessionStorage.removeItem('demoGuest'); setIsDemoGuest(false); };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Dev 자동 로그인: 유저가 없으면 1회 시도
      if (!firebaseUser && DEV_AUTO_LOGIN && !devAutoLoginAttempted) {
        devAutoLoginAttempted = true;
        try {
          await signInWithEmailAndPassword(auth, 'admin@test.com', 'test1234');
          // eslint-disable-next-line no-console
          console.log('%c🧪 Dev 자동 로그인: admin@test.com (이순신)', 'color:#E91E63;font-weight:bold');
          return; // onAuthStateChanged가 다시 트리거됨
        } catch (e) {
          console.warn('Dev 자동 로그인 실패:', e.message);
        }
      }

      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser) {
        const key = getSafeEmailKey(firebaseUser.email);
        setEmailKey(key);

        try {
          // 유저 데이터 로드
          const userSnap = await get(ref(db, `Users/${key}`));
          if (userSnap.exists()) {
            setUserData(userSnap.val());
          } else {
            setUserData(null);
          }

          // 권한 체크
          const [adminSnap, modSnap] = await Promise.all([
            get(ref(db, `AllowedUsers/admin/${key}`)),
            get(ref(db, `AllowedUsers/moderator/${key}`)),
          ]);
          setIsAdmin(adminSnap.exists());
          setIsModerator(modSnap.exists());
          // 마스터 체크 (DB 기반, rules 배포 전엔 실패할 수 있으므로 별도 try/catch)
          try {
            const masterSnap = await get(ref(db, `MasterUsers/${key}`));
            setIsMasterDb(masterSnap.exists() && masterSnap.val() === true);
          } catch {
            setIsMasterDb(false); // env fallback 사용됨
          }
        } catch (e) {
          console.error('유저 정보 로드 실패:', e);
          setUserData(null);
          setIsAdmin(false);
          setIsModerator(false);
          setIsMasterDb(false);
        }
      } else {
        setEmailKey('');
        setUserData(null);
        setIsAdmin(false);
        setIsModerator(false);
        setIsMasterDb(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const userName = isDemoGuest ? '체험 사용자' : (userData?.name || user?.displayName || user?.email?.split('@')[0] || '');
  const realClubName = userData?.club || '';
  // 🆕 가입 승인 대기 상태
  const isPending = !!(userData?.pending === true);
  // 마스터 체크: DB `MasterUsers/{emailKey}` 우선, env 이메일 리스트는 하위 호환 fallback
  // (env 이메일은 빌드 번들에 포함되므로 점진적으로 제거 예정 — 초기 seed 전환 후)
  const isMasterEnv = !!(user?.email && APP_CONFIG.masterEmails?.includes(user.email.toLowerCase()));
  const isMaster = isMasterDb || isMasterEnv;

  // 마스터 전용: 다른 클럽 조회
  const [viewingClub, setViewingClub] = useState('');
  const clubName = isDemoGuest ? '한강FC' : ((isMaster && viewingClub) ? viewingClub : realClubName);

  const value = {
    user,
    userData,
    emailKey,
    userName,
    clubName,
    realClubName,
    isAdmin,
    isModerator,
    isMaster,
    isPending,
    authReady,
    loading,
    viewingClub,
    setViewingClub,
    isDemoGuest,
    enterDemoGuest,
    exitDemoGuest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

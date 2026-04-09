import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, db } from '../config/firebase';
import { getSafeEmailKey } from '../utils/format';
import { APP_CONFIG } from '../config/app.config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         // Firebase Auth user
  const [userData, setUserData] = useState(null);  // DB user data
  const [emailKey, setEmailKey] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  // 게스트 데모 모드 (로그인 없이 체험)
  const [isDemoGuest, setIsDemoGuest] = useState(() => sessionStorage.getItem('demoGuest') === 'true');
  const enterDemoGuest = () => { sessionStorage.setItem('demoGuest', 'true'); setIsDemoGuest(true); };
  const exitDemoGuest = () => { sessionStorage.removeItem('demoGuest'); setIsDemoGuest(false); };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
        } catch (e) {
          console.error('유저 정보 로드 실패:', e);
          setUserData(null);
          setIsAdmin(false);
          setIsModerator(false);
        }
      } else {
        setEmailKey('');
        setUserData(null);
        setIsAdmin(false);
        setIsModerator(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const userName = isDemoGuest ? '체험 사용자' : (userData?.name || user?.displayName || user?.email?.split('@')[0] || '');
  const realClubName = userData?.club || '';
  const isMaster = !!(user?.email && APP_CONFIG.masterEmails?.includes(user.email));

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

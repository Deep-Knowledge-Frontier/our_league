import { useState, useEffect, useCallback } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from '../config/firebase';

/**
 * useOnboarding — 튜토리얼 완료 상태를 Firebase에 저장/조회하는 훅
 *
 * Usage:
 *   const { shouldShow, markSeen, resetTour, loading } = useOnboarding({
 *     role: 'admin',
 *     emailKey: 'user@gmail,com',
 *     enabled: isAdmin,
 *   });
 *
 *   if (shouldShow) <OnboardingModal onComplete={markSeen} ... />
 *
 * Firebase 경로: Users/{emailKey}/tutorialSeen/{role}: true
 */
export function useOnboarding({ role, emailKey, enabled = true }) {
  const [loading, setLoading] = useState(true);
  const [shouldShow, setShouldShow] = useState(false);

  // 최초 로드: tutorialSeen[role] 읽음
  useEffect(() => {
    if (!enabled || !emailKey || !role) {
      setLoading(false);
      setShouldShow(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    get(ref(db, `Users/${emailKey}/tutorialSeen/${role}`))
      .then((snap) => {
        if (cancelled) return;
        // 존재하고 true면 이미 봤음 → 안 보여줌
        setShouldShow(!snap.exists() || snap.val() !== true);
      })
      .catch((e) => {
        console.warn('[useOnboarding] 로드 실패:', e);
        if (!cancelled) setShouldShow(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [role, emailKey, enabled]);

  // 완료 표시 (Firebase + 로컬 state)
  const markSeen = useCallback(async () => {
    setShouldShow(false);
    if (!emailKey || !role) return;
    try {
      await update(ref(db, `Users/${emailKey}/tutorialSeen`), { [role]: true });
    } catch (e) {
      console.warn('[useOnboarding] 저장 실패:', e);
    }
  }, [emailKey, role]);

  // 다시 보기 (완료 플래그 초기화 + 모달 표시)
  const resetTour = useCallback(async () => {
    if (!emailKey || !role) return;
    try {
      await update(ref(db, `Users/${emailKey}/tutorialSeen`), { [role]: null });
    } catch (e) {
      console.warn('[useOnboarding] 리셋 실패:', e);
    }
    setShouldShow(true);
  }, [emailKey, role]);

  return { shouldShow, markSeen, resetTour, loading };
}

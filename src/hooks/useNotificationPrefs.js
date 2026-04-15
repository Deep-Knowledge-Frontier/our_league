import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../config/firebase';

const DEFAULT_PREFS = {
  enabled: false,
  voteDeadline: true,
  draftStart: true,
  draftTurn: true,
  matchResult: true,
};

/**
 * 사용자 알림 환경설정 + 브라우저 Notification API 통합 훅
 *
 * - Firebase `Users/{emailKey}/notificationPrefs`에 opt-in 저장
 * - 브라우저 권한 상태 추적
 * - `notify(title, body, options)` 헬퍼 제공
 * - `dedupeKey` 옵션으로 localStorage 기반 중복 방지 (1시간 TTL)
 */
export function useNotificationPrefs(emailKey) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const supported = typeof Notification !== 'undefined';

  // Firebase에서 prefs 로드
  useEffect(() => {
    if (!emailKey) return;
    const prefsRef = ref(db, `Users/${emailKey}/notificationPrefs`);
    return onValue(prefsRef, (snap) => {
      const v = snap.val();
      if (v) setPrefs({ ...DEFAULT_PREFS, ...v });
    });
  }, [emailKey]);

  // prefs 저장
  const savePrefs = useCallback(
    async (partial) => {
      if (!emailKey) return;
      const next = { ...prefs, ...partial };
      setPrefs(next);
      await set(ref(db, `Users/${emailKey}/notificationPrefs`), next);
    },
    [emailKey, prefs]
  );

  // 권한 요청 + 활성화
  const requestPermission = useCallback(async () => {
    if (!supported) return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await savePrefs({ enabled: true });
    }
    return result;
  }, [supported, savePrefs]);

  // 알림 발송 (권한 + 사용자 opt-in 체크)
  const notify = useCallback(
    (title, body, { dedupeKey, url, icon } = {}) => {
      if (!supported) return false;
      if (permission !== 'granted') return false;
      if (!prefs.enabled) return false;

      // 중복 방지 (1시간 TTL)
      if (dedupeKey) {
        const storageKey = `notif-dedupe-${dedupeKey}`;
        const lastFired = localStorage.getItem(storageKey);
        if (lastFired && Date.now() - parseInt(lastFired, 10) < 3600_000) {
          return false;
        }
        localStorage.setItem(storageKey, String(Date.now()));
      }

      try {
        const n = new Notification(title, {
          body,
          icon: icon || '/logo192.png',
          badge: '/logo192.png',
          tag: dedupeKey,
        });
        if (url) {
          n.onclick = () => {
            window.focus();
            window.location.href = url;
            n.close();
          };
        }
        return true;
      } catch {
        return false;
      }
    },
    [supported, permission, prefs]
  );

  return {
    supported,
    permission,
    prefs,
    savePrefs,
    requestPermission,
    notify,
  };
}

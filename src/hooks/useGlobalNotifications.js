import { useEffect, useRef } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationPrefs } from './useNotificationPrefs';

/**
 * 앱 전역 알림 리스너 — 클라이언트 전용 (앱이 열려있을 때만 동작)
 *
 * 감지하는 이벤트:
 * 1. 투표 마감 D-day/D-1 (미투표 사용자에게)
 * 2. 드래프트 시작 (주장에게)
 * 3. 내 드래프트 차례 (해당 주장에게)
 * 4. 경기 결과/MVP 발표 (당일 경기 참가자에게)
 * 5. 🆕 신규 가입 신청 (관리자/운영진에게)
 *
 * App.js 또는 TabLayout에서 한 번만 호출하면 됨.
 */
export function useGlobalNotifications() {
  const { clubName, userName, emailKey, authReady, isAdmin, isModerator } = useAuth();
  const { prefs, notify } = useNotificationPrefs(emailKey);
  // 이전 상태 추적 (상태 변화 감지)
  const prevDraftStatusRef = useRef(null);
  const prevPickIdxRef = useRef(-1);
  const prevMvpRef = useRef(null);
  const prevJoinKeysRef = useRef(null);

  // ─── 1. 투표 마감 D-day/D-1 체크 (앱 로드 시 + 30분 간격) ───
  useEffect(() => {
    if (!authReady || !clubName || !userName) return;
    if (!prefs.enabled || !prefs.voteDeadline) return;

    let cancelled = false;

    const checkVoteDeadlines = async () => {
      try {
        const matchSnap = await get(ref(db, `MatchDates/${clubName}`));
        if (cancelled || !matchSnap.exists()) return;
        const matches = matchSnap.val() || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const [dateKey, match] of Object.entries(matches)) {
          if (!match?.date) continue;
          const matchDate = new Date(match.date);
          matchDate.setHours(0, 0, 0, 0);
          const daysDiff = Math.round((matchDate - today) / (24 * 3600 * 1000));
          if (daysDiff !== 0 && daysDiff !== 1) continue;

          // 내가 이미 투표했는지 확인
          const voteSnap = await get(
            ref(db, `PlayerSelectionByDate/${clubName}/${match.date}/AttandPlayer`)
          );
          const voteData = voteSnap.val() || {};
          const allVoted = [
            ...(voteData.A || []),
            ...(voteData.B || []),
            ...(voteData.C || []),
          ].filter(Boolean);
          const keyPopSnap = await get(
            ref(db, `PlayerSelectionByDate/${clubName}/${match.date}/keyPop`)
          );
          const keyPop = Object.values(keyPopSnap.val() || {}).filter(Boolean);
          const hasVoted =
            allVoted.includes(userName) || keyPop.includes(userName);
          if (hasVoted) continue;

          const label = daysDiff === 0 ? '오늘' : '내일';
          notify(
            `⚽ 투표 마감 임박 (${label})`,
            `${match.location || match.date} 경기 투표를 아직 안 하셨어요.`,
            {
              dedupeKey: `vote-deadline-${match.date}-d${daysDiff}`,
              url: '/vote',
            }
          );
        }
      } catch (e) {
        console.error('[notif] vote deadline check failed:', e);
      }
    };

    checkVoteDeadlines();
    const interval = setInterval(checkVoteDeadlines, 30 * 60 * 1000); // 30분
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authReady, clubName, userName, prefs.enabled, prefs.voteDeadline, notify]);

  // ─── 2+3. 드래프트 상태 실시간 구독 (시작 + 내 차례) ───
  useEffect(() => {
    if (!authReady || !clubName || !userName) return;
    if (!prefs.enabled) return;

    // 진행 중인 경기일의 드래프트를 찾기 위해 MatchDates에서 가장 가까운 경기 찾음
    let cancelled = false;
    let draftUnsub = null;

    const setupDraftListener = async () => {
      try {
        const matchSnap = await get(ref(db, `MatchDates/${clubName}`));
        if (cancelled || !matchSnap.exists()) return;
        const matches = Object.values(matchSnap.val() || {});
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // 가장 가까운 미래 경기 찾기
        const upcoming = matches
          .filter((m) => m?.date)
          .map((m) => ({ ...m, _dt: new Date(m.date) }))
          .filter((m) => m._dt >= today)
          .sort((a, b) => a._dt - b._dt)[0];
        if (!upcoming) return;

        const draftRef = ref(
          db,
          `PlayerSelectionByDate/${clubName}/${upcoming.date}/Draft`
        );
        draftUnsub = onValue(draftRef, (snap) => {
          const draft = snap.val();
          if (!draft) return;

          // 주장인지 확인
          const captains = draft.captains || {};
          const myTeamCode = Object.keys(captains).find(
            (code) => captains[code] === userName
          );

          // (2) 드래프트 시작 감지: status prev → active 변화
          if (
            prefs.draftStart &&
            myTeamCode &&
            prevDraftStatusRef.current !== 'active' &&
            draft.status === 'active'
          ) {
            notify('🎯 드래프트 시작!', `${upcoming.date} 경기 드래프트가 시작되었습니다.`, {
              dedupeKey: `draft-start-${upcoming.date}`,
              url: `/draft/${upcoming.date}`,
            });
          }
          prevDraftStatusRef.current = draft.status;

          // (3) 내 차례 감지: pickOrder[currentPickIdx] === myTeamCode
          if (prefs.draftTurn && myTeamCode && draft.status === 'active') {
            const pickOrder = draft.pickOrder || [];
            const pickIdx = draft.currentPickIdx || 0;
            const currentTurn = pickOrder[pickIdx];
            // 차례가 바뀌었고, 지금 내 차례면
            if (
              pickIdx !== prevPickIdxRef.current &&
              currentTurn === myTeamCode
            ) {
              notify('⏰ 내 차례!', '드래프트 픽 차례가 돌아왔어요.', {
                dedupeKey: `draft-turn-${upcoming.date}-${pickIdx}`,
                url: `/draft/${upcoming.date}`,
              });
            }
            prevPickIdxRef.current = pickIdx;
          }
        });
      } catch (e) {
        console.error('[notif] draft listener setup failed:', e);
      }
    };

    setupDraftListener();
    return () => {
      cancelled = true;
      if (draftUnsub) draftUnsub();
      prevDraftStatusRef.current = null;
      prevPickIdxRef.current = -1;
    };
  }, [
    authReady,
    clubName,
    userName,
    prefs.enabled,
    prefs.draftStart,
    prefs.draftTurn,
    notify,
  ]);

  // ─── 4. 오늘 경기 MVP 발표 감지 ───
  useEffect(() => {
    if (!authReady || !clubName || !userName) return;
    if (!prefs.enabled || !prefs.matchResult) return;

    const today = new Date().toISOString().split('T')[0];
    const resultRef = ref(db, `DailyResultsBackup/${clubName}/${today}`);

    const unsub = onValue(resultRef, (snap) => {
      const result = snap.val();
      if (!result?.dailyMvp || result.dailyMvp === '-') return;
      if (result.dailyMvp === prevMvpRef.current) return;

      // 이전에 값이 없었으면 스킵 (초기 로드)
      if (prevMvpRef.current !== null) {
        notify(
          '🏆 오늘의 MVP 발표!',
          `${result.dailyMvp}님이 오늘의 MVP로 선정되었어요.`,
          {
            dedupeKey: `mvp-${today}`,
            url: '/results',
          }
        );
      }
      prevMvpRef.current = result.dailyMvp;
    });

    return () => {
      unsub();
      prevMvpRef.current = null;
    };
  }, [authReady, clubName, userName, prefs.enabled, prefs.matchResult, notify]);

  // ─── 5. 🆕 신규 가입 신청 감지 (관리자/운영진) ───
  useEffect(() => {
    if (!authReady || !clubName) return;
    if (!isAdmin && !isModerator) return;
    if (!prefs.enabled || !prefs.joinRequest) return;

    const joinRef = ref(db, `JoinRequests/${clubName}`);
    const unsub = onValue(joinRef, (snap) => {
      const data = snap.val() || {};
      const currentKeys = new Set(Object.keys(data));
      const prev = prevJoinKeysRef.current;

      // 첫 로드는 알림 생략 (현재 pending 상태를 기준점으로 저장)
      if (prev === null) {
        prevJoinKeysRef.current = currentKeys;
        return;
      }

      // 새로 추가된 신청 찾기
      const newOnes = [...currentKeys].filter((k) => !prev.has(k));
      newOnes.forEach((emailKey) => {
        const req = data[emailKey];
        if (req?.status === 'pending') {
          notify(
            '🔔 새 가입 신청',
            `${req.name || '신청자'}님이 ${clubName} 가입을 신청했어요.`,
            {
              dedupeKey: `join-${emailKey}`,
              url: '/admin',
            }
          );
        }
      });

      prevJoinKeysRef.current = currentKeys;
    });

    return () => {
      unsub();
      prevJoinKeysRef.current = null;
    };
  }, [authReady, clubName, isAdmin, isModerator, prefs.enabled, prefs.joinRequest, notify]);
}

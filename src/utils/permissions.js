import { ref, get } from 'firebase/database';
import { db } from '../config/firebase';
import { getSafeEmailKey } from './format';

// 권한 체크
export const checkPermission = async (email, role = 'admin') => {
  if (!email) return false;
  const emailKey = getSafeEmailKey(email);
  try {
    const snap = await get(ref(db, `AllowedUsers/${role}/${emailKey}`));
    return snap.exists();
  } catch {
    return false;
  }
};

// 관리자 확인
export const isAdmin = (email) => checkPermission(email, 'admin');

// 운영진 확인
export const isModerator = (email) => checkPermission(email, 'moderator');

// 인증된 사용자 확인
export const isVerified = (email) => checkPermission(email, 'verified');

// 어떤 권한이든 하나라도 있는지 확인
export const hasAnyRole = async (email) => {
  const results = await Promise.all([
    checkPermission(email, 'admin'),
    checkPermission(email, 'moderator'),
    checkPermission(email, 'verified'),
  ]);
  return results.some(Boolean);
};

// 이메일을 Firebase key로 변환 (. → ,)
export const getSafeEmailKey = (email) => email?.replace(/\./g, ',') || '';

// 날짜 키(YYYY-MM-DD)를 로컬 Date로 파싱
export const parseDateKeyLocal = (dateKey) => {
  try {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (!y || !m || !d) return new Date(dateKey);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  } catch {
    return new Date(dateKey);
  }
};

// 배열 보장
export const ensureArray = (arr) => (Array.isArray(arr) ? arr : []);

// 이름 배열 정리 (빈 값, 공백 제거)
export const normalizeNames = (arr) =>
  ensureArray(arr)
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0);

// 숫자를 2자리로 패딩
export const pad2 = (n) => String(n).padStart(2, '0');

// Date → HH:MM 포맷
export const formatHHMM = (dt) => `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

// 요일 이름 (한국어)
export const getDayName = (date) => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[date.getDay()];
};

// 날짜 포맷 (YYYY-MM-DD (요일))
export const formatDateWithDay = (dateKey) => {
  const dateObj = parseDateKeyLocal(dateKey);
  const dayName = isNaN(dateObj.getTime()) ? '?' : getDayName(dateObj);
  return `${dateKey} (${dayName})`;
};

// 경기 시간에서 시/분 추출
export const extractHourMinute = (timeStr) => {
  try {
    if (!timeStr) return { hour: -1, minute: 0 };
    let t = String(timeStr).trim();
    if (!t) return { hour: -1, minute: 0 };
    t = t.replace('분', '');
    if (t.includes('시')) t = t.replace('시', ':00');
    const parts = t.split(':');
    const hour = parts[0] != null ? parseInt(parts[0].trim(), 10) : -1;
    const minute = parts[1] != null ? parseInt(parts[1].trim(), 10) : 0;
    if (!Number.isFinite(hour)) return { hour: -1, minute: 0 };
    return { hour, minute: Number.isFinite(minute) ? minute : 0 };
  } catch {
    return { hour: -1, minute: 0 };
  }
};

// D-day 계산
export const getDaysDiff = (matchDateStr) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDateKeyLocal(matchDateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

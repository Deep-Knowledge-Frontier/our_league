// Firebase 경로/키 안전성 및 입력 검증 유틸
//
// Firebase RTDB는 키에 다음 문자를 사용할 수 없음: .  $  #  [  ]  /
// 사용자 입력이 DB 경로 일부로 쓰일 때는 반드시 sanitize 필요.

/** Firebase 키로 안전하지 않은 문자 */
const PATH_UNSAFE_CHARS = /[.$#[\]/]/g;

/**
 * 문자열을 Firebase 키로 쓸 수 있도록 정규화.
 * - 앞뒤 공백 제거
 * - 안전하지 않은 문자를 '_'로 치환
 * - 최대 길이 제한 (기본 100)
 *
 * @param {*} value 원본 값
 * @param {number} maxLen 최대 길이 (기본 100)
 * @returns {string} 정규화된 문자열 (빈 입력이면 '')
 */
export const sanitizeForPath = (value, maxLen = 100) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.replace(PATH_UNSAFE_CHARS, '_').slice(0, maxLen);
};

/** 이름 필드 유효성 (1~50자, 개행/탭 없음) */
export const isValidName = (value) => {
  const s = String(value ?? '').trim();
  return s.length > 0 && s.length <= 50 && !/[\n\r\t]/.test(s);
};

/** 이메일 형식 간이 검증 */
export const isValidEmail = (value) => {
  const s = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
};

/** 숫자 범위 검증 */
export const isInRange = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
};

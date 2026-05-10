// 환경별 로거 — production에서 디버그 로그를 자동으로 무음 처리
//
// 사용 패턴:
//   import { devLog, devWarn } from '../utils/logger';
//   devLog('[X] 어떤 정보:', value);   // dev 환경에서만 출력
//   devWarn('[X] 경고:', value);
//
// 에러 로깅(production 포함)이 필요한 경우는 평소처럼 console.error 사용.

const isDev = process.env.NODE_ENV !== 'production';

/** 개발 환경에서만 출력되는 console.log 대체 */
export const devLog = (...args) => {
  if (isDev) console.log(...args);
};

/** 개발 환경에서만 출력되는 console.warn 대체 */
export const devWarn = (...args) => {
  if (isDev) console.warn(...args);
};

/** 개발 환경에서만 출력되는 console.info 대체 */
export const devInfo = (...args) => {
  if (isDev) console.info(...args);
};

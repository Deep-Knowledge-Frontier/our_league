import {
  getSafeEmailKey,
  parseDateKeyLocal,
  ensureArray,
  normalizeNames,
  pad2,
  formatHHMM,
  getDayName,
  formatDateWithDay,
  extractHourMinute,
  getDaysDiff,
} from '../format';

describe('format utils', () => {
  describe('getSafeEmailKey', () => {
    test('replaces dots with commas', () => {
      expect(getSafeEmailKey('user.name@example.com')).toBe('user,name@example,com');
    });
    test('handles empty/null/undefined', () => {
      expect(getSafeEmailKey('')).toBe('');
      expect(getSafeEmailKey(null)).toBe('');
      expect(getSafeEmailKey(undefined)).toBe('');
    });
    test('replaces multiple dots', () => {
      expect(getSafeEmailKey('a.b.c.d@e.f.g')).toBe('a,b,c,d@e,f,g');
    });
  });

  describe('parseDateKeyLocal', () => {
    test('parses YYYY-MM-DD as local midnight', () => {
      const d = parseDateKeyLocal('2026-05-10');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4);   // 0-indexed
      expect(d.getDate()).toBe(10);
      expect(d.getHours()).toBe(0);
    });
    test('returns Date for invalid input without throwing', () => {
      const d = parseDateKeyLocal('not-a-date');
      expect(d instanceof Date).toBe(true);
    });
  });

  describe('ensureArray', () => {
    test('returns array as-is', () => {
      expect(ensureArray([1, 2, 3])).toEqual([1, 2, 3]);
    });
    test('returns empty array for non-array', () => {
      expect(ensureArray(null)).toEqual([]);
      expect(ensureArray(undefined)).toEqual([]);
      expect(ensureArray('str')).toEqual([]);
      expect(ensureArray({})).toEqual([]);
    });
  });

  describe('normalizeNames', () => {
    test('trims whitespace and removes empty', () => {
      expect(normalizeNames([' 김정수 ', '', '이훈화', null, '  '])).toEqual(['김정수', '이훈화']);
    });
    test('handles non-string entries by stringifying', () => {
      expect(normalizeNames([123, 'abc'])).toEqual(['123', 'abc']);
    });
    test('returns empty array for null input', () => {
      expect(normalizeNames(null)).toEqual([]);
    });
  });

  describe('pad2', () => {
    test('pads single digit', () => {
      expect(pad2(5)).toBe('05');
      expect(pad2(0)).toBe('00');
    });
    test('keeps two-digit numbers', () => {
      expect(pad2(42)).toBe('42');
    });
  });

  describe('formatHHMM', () => {
    test('formats Date correctly', () => {
      const dt = new Date(2026, 4, 10, 9, 5);
      expect(formatHHMM(dt)).toBe('09:05');
    });
    test('formats midnight', () => {
      const dt = new Date(2026, 0, 1, 0, 0);
      expect(formatHHMM(dt)).toBe('00:00');
    });
  });

  describe('getDayName', () => {
    test('returns Korean weekday', () => {
      // 2026-05-10 is Sunday
      expect(getDayName(new Date(2026, 4, 10))).toBe('일');
      // 2026-05-11 is Monday
      expect(getDayName(new Date(2026, 4, 11))).toBe('월');
    });
  });

  describe('formatDateWithDay', () => {
    test('appends Korean weekday', () => {
      expect(formatDateWithDay('2026-05-10')).toBe('2026-05-10 (일)');
    });
  });

  describe('extractHourMinute', () => {
    test('parses HH:MM format', () => {
      expect(extractHourMinute('09:30')).toEqual({ hour: 9, minute: 30 });
    });
    test('parses Korean format "9시 30분"', () => {
      expect(extractHourMinute('9시 30분')).toEqual({ hour: 9, minute: 30 });
    });
    test('parses Korean format "9시"', () => {
      expect(extractHourMinute('9시')).toEqual({ hour: 9, minute: 0 });
    });
    test('returns -1 for invalid input', () => {
      expect(extractHourMinute('').hour).toBe(-1);
      expect(extractHourMinute(null).hour).toBe(-1);
    });
  });

  describe('getDaysDiff', () => {
    test('returns 0 for today', () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      expect(getDaysDiff(`${yyyy}-${mm}-${dd}`)).toBe(0);
    });
    test('returns positive for future', () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const yyyy = future.getFullYear();
      const mm = String(future.getMonth() + 1).padStart(2, '0');
      const dd = String(future.getDate()).padStart(2, '0');
      expect(getDaysDiff(`${yyyy}-${mm}-${dd}`)).toBe(7);
    });
  });
});

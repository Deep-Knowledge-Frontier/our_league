import {
  softmaxPercent,
  calcMean,
  averageExcludeZero,
  calcStd,
  calcAbilityScore,
  getSkillGrade,
} from '../stats';

describe('stats utils', () => {
  describe('calcMean', () => {
    test('average of numbers', () => {
      expect(calcMean([1, 2, 3, 4, 5])).toBe(3);
    });
    test('returns 0 for empty array', () => {
      expect(calcMean([])).toBe(0);
      expect(calcMean(null)).toBe(0);
      expect(calcMean(undefined)).toBe(0);
    });
    test('handles single element', () => {
      expect(calcMean([42])).toBe(42);
    });
  });

  describe('averageExcludeZero', () => {
    test('excludes zeros and falsy values', () => {
      const map = { A: 80, B: 0, C: 60, D: null };
      const result = averageExcludeZero(['A', 'B', 'C', 'D'], (n) => map[n]);
      expect(result).toBe(70);  // (80 + 60) / 2
    });
    test('returns 0 when all values are zero', () => {
      expect(averageExcludeZero(['A', 'B'], () => 0)).toBe(0);
    });
    test('returns 0 for empty names', () => {
      expect(averageExcludeZero([], () => 100)).toBe(0);
      expect(averageExcludeZero(null, () => 100)).toBe(0);
    });
  });

  describe('calcStd', () => {
    test('standard deviation of varied values', () => {
      // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, std=2
      expect(calcStd([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    });
    test('returns 0 for less than 2 elements', () => {
      expect(calcStd([5])).toBe(0);
      expect(calcStd([])).toBe(0);
    });
  });

  describe('softmaxPercent', () => {
    test('returns array summing close to 100', () => {
      const result = softmaxPercent([1, 2, 3]);
      const sum = result.reduce((a, b) => a + b, 0);
      // Rounding may cause ±1
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(2);
    });
    test('returns empty for empty input', () => {
      expect(softmaxPercent([])).toEqual([]);
    });
    test('higher value gets higher percentage', () => {
      const [a, b, c] = softmaxPercent([1, 5, 10]);
      expect(c).toBeGreaterThan(b);
      expect(b).toBeGreaterThan(a);
    });
  });

  describe('calcAbilityScore', () => {
    test('weighted formula', () => {
      // goals*3 + assists*2 + attendance*0.5 + pointRate*2
      // 5*3 + 3*2 + 80*0.5 + 60*2 = 15 + 6 + 40 + 120 = 181
      expect(calcAbilityScore({
        totalGoals: 5,
        totalAssists: 3,
        attendanceRate: 80,
        pointRate: 60,
      })).toBe(181);
    });
    test('handles missing fields with defaults', () => {
      expect(calcAbilityScore({})).toBe(0);
    });
  });

  describe('getSkillGrade', () => {
    const allScores = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    test('top score → S+', () => {
      expect(getSkillGrade(100, allScores).grade).toBe('S+');
    });
    test('lower scores get lower tier', () => {
      const top = getSkillGrade(100, allScores).tier;
      const bot = getSkillGrade(10, allScores).tier;
      expect(top).toBeGreaterThan(bot);
    });
    test('returns dash for empty allScores', () => {
      expect(getSkillGrade(50, []).grade).toBe('-');
    });
  });
});

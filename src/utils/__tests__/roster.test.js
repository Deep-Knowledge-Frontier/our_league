import { extractTeamRoster } from '../roster';

describe('extractTeamRoster', () => {
  test('returns names matched by exact team name (case-insensitive)', () => {
    const data = {
      'Team A': { 0: '김정수', 1: '이훈화' },
      'Team B': { 0: '윤종문', 1: '박용록' },
    };
    expect(extractTeamRoster(data, 'Team A', 'team1')).toEqual(['김정수', '이훈화']);
    expect(extractTeamRoster(data, 'team a', 'team1')).toEqual(['김정수', '이훈화']);
    expect(extractTeamRoster(data, 'Team B', 'team2')).toEqual(['윤종문', '박용록']);
  });

  test('falls back to team1/team2 keys', () => {
    const data = {
      team1: { 0: '김정수' },
      team2: { 0: '이훈화' },
    };
    expect(extractTeamRoster(data, 'someName', 'team1')).toEqual(['김정수']);
    expect(extractTeamRoster(data, 'otherName', 'team2')).toEqual(['이훈화']);
  });

  test('falls back to sorted-key order', () => {
    const data = {
      'Z팀': { 0: '윤종문' },
      'A팀': { 0: '김정수' },
    };
    // sorted: A팀 first, Z팀 second
    expect(extractTeamRoster(data, 'unknown', 'team1')).toEqual(['김정수']);
    expect(extractTeamRoster(data, 'unknown', 'team2')).toEqual(['윤종문']);
  });

  test('returns empty array for missing data', () => {
    expect(extractTeamRoster(null, 'any', 'team1')).toEqual([]);
    expect(extractTeamRoster(undefined, 'any', 'team1')).toEqual([]);
    expect(extractTeamRoster({}, 'any', 'team1')).toEqual([]);
  });

  test('handles array roster value (not just object)', () => {
    const data = {
      'Team A': ['김정수', '이훈화'],
    };
    expect(extractTeamRoster(data, 'Team A', 'team1')).toEqual(['김정수', '이훈화']);
  });

  test('filters out null/undefined entries', () => {
    const data = {
      'Team A': { 0: '김정수', 1: null, 2: '', 3: '이훈화' },
    };
    expect(extractTeamRoster(data, 'Team A', 'team1')).toEqual(['김정수', '이훈화']);
  });

  test('matches with whitespace', () => {
    const data = {
      '  Team A  ': { 0: '김정수' },
    };
    expect(extractTeamRoster(data, 'Team A', 'team1')).toEqual(['김정수']);
  });
});

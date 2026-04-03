// Softmax with temperature (팀 승률 계산용)
export const softmaxPercent = (values, temperature = 1.0) => {
  if (!values || values.length === 0) return [];
  const maxVal = Math.max(...values);
  const exps = values.map((v) => Math.exp((v - maxVal) / temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => Math.round((e / sumExps) * 100));
};

// 평균
export const calcMean = (arr) => {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

// 표준편차
export const calcStd = (arr) => {
  if (!arr || arr.length < 2) return 0;
  const mean = calcMean(arr);
  const variance = arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
};

// 능력치 점수 계산
export const calcAbilityScore = (stats) => {
  const { totalGoals = 0, totalAssists = 0, attendanceRate = 0, pointRate = 0 } = stats;
  return totalGoals * 3 + totalAssists * 2 + attendanceRate * 0.5 + pointRate * 2;
};

// 선수 아키타입 분류 (25+ 유형)
export const getPlayerArchetype = (stats) => {
  const { avgGoalsPerGame = 0, avgAssistsPerGame = 0, attendanceRate = 0 } = stats;

  if (avgGoalsPerGame >= 1.5 && avgAssistsPerGame >= 1.0) return '완벽한 공격수';
  if (avgGoalsPerGame >= 1.5) return '골 머신';
  if (avgGoalsPerGame >= 1.0 && avgAssistsPerGame >= 0.5) return '공격 핵심';
  if (avgGoalsPerGame >= 1.0) return '스트라이커';
  if (avgGoalsPerGame >= 0.5 && avgAssistsPerGame >= 1.0) return '공격형 미드필더';
  if (avgAssistsPerGame >= 1.5) return '어시스트 머신';
  if (avgAssistsPerGame >= 1.0) return '플레이메이커';
  if (avgAssistsPerGame >= 0.5 && avgGoalsPerGame >= 0.3) return '미드필더';
  if (avgAssistsPerGame >= 0.5) return '패서';
  if (attendanceRate >= 80) return '철인';
  if (avgGoalsPerGame >= 0.3) return '기회주의자';
  if (avgAssistsPerGame >= 0.3) return '서포터';
  return '올라운더';
};

// 실력 등급 계산 (9단계)
export const getSkillGrade = (abilityScore, allScores) => {
  if (!allScores || allScores.length === 0) return { grade: '-', tier: 0 };

  const sorted = [...allScores].sort((a, b) => b - a);
  const rank = sorted.indexOf(abilityScore);
  const percentile = (rank / sorted.length) * 100;

  if (percentile <= 5) return { grade: 'S+', tier: 9 };
  if (percentile <= 10) return { grade: 'S', tier: 8 };
  if (percentile <= 20) return { grade: 'A+', tier: 7 };
  if (percentile <= 30) return { grade: 'A', tier: 6 };
  if (percentile <= 45) return { grade: 'B+', tier: 5 };
  if (percentile <= 60) return { grade: 'B', tier: 4 };
  if (percentile <= 75) return { grade: 'C+', tier: 3 };
  if (percentile <= 90) return { grade: 'C', tier: 2 };
  return { grade: 'D', tier: 1 };
};

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

// 선수 아키타입 계산 (z-score 기반, ResultsPage와 동일)
export const calculateArchetype = (goals, matches, attendanceRate, avgDiff, env) => {
  if (matches <= 0) return { title: "데이터 없음", desc: "경기 데이터가 부족합니다.", color: "#FFFFFF" };
  if (matches < 3) return { title: "루키", desc: "이제 막 그라운드에 발을 디딘 신인입니다.", color: "#FFFFFF" };
  const gpg = goals / matches;
  const { meanGpg, stdGpg, meanDiff, stdDiff } = env;
  const zGpg = stdGpg > 0 ? (gpg - meanGpg) / stdGpg : 0;
  const zDiff = stdDiff > 0 ? (avgDiff - meanDiff) / stdDiff : 0;
  if (attendanceRate < 20.0) {
    if (zGpg > 1.0 && zDiff > 0.5) return { title: "전설의 용병", desc: "그가 오면 승리와 골이 따라옵니다.", color: "#FFD700" };
    if (zGpg > 1.5) return { title: "폭격기", desc: "압도적인 득점력을 가진 특급 게스트.", color: "#FF4081" };
    if (zDiff > 1.0) return { title: "승리 요정", desc: "골은 없어도 팀을 이기게 만듭니다.", color: "#00E5FF" };
    if (zDiff < -1.0) {
      if (matches < 5) {
        if (zGpg > 0.5) return { title: "단기 체험러", desc: "몇 경기만으로 판단하긴 이르지만, 한 방은 있어요.", color: "#B0BEC5" };
        return { title: "초행길", desc: "아직 팀 템포를 익히는 중.", color: "#CFD8DC" };
      }
      if (zGpg > 0.5) return { title: "고립 관광객", desc: "득점은 하지만 흐름이 끊겨 팀에 손해.", color: "#EF9A9A" };
      if (zGpg < -0.5) return { title: "힐링 관광객", desc: "승패보다 즐거움이 우선!", color: "#E0E0E0" };
      return { title: "관람객", desc: "플레이보다 구경이 더 기억에 남는 날.", color: "#D7CCC8" };
    }
    return { title: "조커", desc: "변수를 창출하는 히든 카드.", color: "#B388FF" };
  }
  if (zGpg > 1.0 && zDiff > 1.0) return { title: "축구의 신", desc: "압도적인 기량으로 리그를 지배합니다.", color: "#FFD700" };
  if (zGpg > 1.0) {
    if (zDiff > 0) return { title: "발롱도르", desc: "팀의 승리를 결정짓는 최고의 공격수.", color: "#FFAB00" };
    return { title: "고독한 에이스", desc: "엄청난 득점력을 가졌으나 팀운이 없네요.", color: "#FF5252" };
  }
  if (zGpg > 0.5) {
    if (zDiff > 0.8) return { title: "라인브레이커", desc: "한 방에 수비 라인을 찢고 경기를 바꿉니다.", color: "#00C853" };
    if (zDiff > 0.5) return { title: "게임 체인저", desc: "흐름을 뒤바꾸는 결정적인 한 방.", color: "#00E676" };
    if (zDiff > 0.2) return { title: "결정적 피니셔", desc: "확실한 찬스를 골로 바꾸는 마무리.", color: "#1E88E5" };
    if (attendanceRate >= 80.0 && zGpg > 0.6) return { title: "고정 타겟맨", desc: "매주 믿고 쓰는 공격 옵션.", color: "#5E35B1" };
    if (zDiff < -0.7) return { title: "고립 타겟", desc: "득점은 하지만 전개가 끊겨 고립되기 쉽습니다.", color: "#EF5350" };
    if (zDiff < -0.2) return { title: "포스트 플레이어", desc: "버티고 받아내며 2선 찬스를 만듭니다.", color: "#8D6E63" };
    return { title: "타겟터", desc: "공격의 구심점이 되어주는 선수.", color: "#FF9E80" };
  }
  if (zDiff > 1.0) return { title: "승리의 토템", desc: "당신이 뛰면 팀은 지지 않습니다.", color: "#69F0AE" };
  if (zDiff > 0.5) return { title: "마에스트로", desc: "공수 조율을 통해 경기를 지배합니다.", color: "#40C4FF" };
  if (zGpg < -0.5 && zDiff > -0.2) {
    if (attendanceRate >= 80.0) return { title: "통곡의 벽", desc: "성실함과 수비력으로 팀을 지탱합니다.", color: "#76FF03" };
    return { title: "언성 히어로", desc: "보이지 않는 곳에서 팀을 위해 헌신합니다.", color: "#CFD8DC" };
  }
  if (Math.abs(zGpg) <= 0.5 && Math.abs(zDiff) <= 0.5) {
    if (zGpg >= 0.2) return { title: "섀도우 스트라이커", desc: "2선에서 언제든 득점을 노립니다.", color: "#BA68C8" };
    if (zDiff >= 0) return { title: "진공 청소기", desc: "중원을 장악하고 상대 공격을 차단합니다.", color: "#4DB6AC" };
    return { title: "링커", desc: "팀의 연결 고리 역할을 수행합니다.", color: "#90CAF9" };
  }
  if (attendanceRate >= 80.0) return { title: "공무원", desc: "눈이 오나 비가 오나 자리를 지키는 살림꾼.", color: "#FFF59D" };
  if (attendanceRate >= 60.0) return { title: "철인 28호", desc: "지치지 않는 체력으로 매주 출전합니다.", color: "#FF9100" };
  if (zDiff < -1.0) {
    if (zGpg > 0) return { title: "소년 가장", desc: "팀이 무너져도 고군분투하고 있습니다.", color: "#F50057" };
    return { title: "인간 승리", desc: "포기하지 않는 불굴의 의지가 아름답습니다.", color: "#FF80AB" };
  }
  if (zGpg < -1.0) return { title: "평화주의자", desc: "골대와 싸우지 않습니다. 평화를 사랑합니다.", color: "#DCE775" };
  if (matches < 10) return { title: "잠재적 유망주", desc: "데이터가 쌓이면 진가를 발휘할 겁니다.", color: "#FFCC80" };
  return { title: "행복 축구 전도사", desc: "승패를 떠나 축구를 즐깁니다.", color: "#FFFFFF" };
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

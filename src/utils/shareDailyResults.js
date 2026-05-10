// 일자별 경기 결과 카드를 공유 이미지(PNG)로 생성 — 모던 디자인 + MVP 통계

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatTeamName = (n) => {
  if (!n) return '';
  const cleaned = String(n).trim().replace(/^팀\s*/, '');
  if (cleaned.toUpperCase().startsWith('TEAM')) return cleaned;
  return `Team ${cleaned}`;
};

// 팀 코드별 컬러 (Team A=빨강, B=노랑, C=파랑)
const teamAccent = (name) => {
  const c = String(name || '').replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim().toUpperCase();
  if (c.startsWith('A')) return '#E53935';
  if (c.startsWith('B')) return '#FB8C00';
  if (c.startsWith('C')) return '#1E88E5';
  return '#546E7A';
};

// 한글/영문 혼합 텍스트의 폭 추정 (font size 기준)
const measureText = (text, fontSize) => {
  let w = 0;
  for (const ch of String(text || '')) {
    if (/[ㄱ-힝一-鿿]/.test(ch)) w += fontSize * 1.05;       // 한글/한자
    else if (/[A-Z가-힣]/i.test(ch)) w += fontSize * 0.62;                    // 대문자
    else if (/\d/.test(ch)) w += fontSize * 0.58;                             // 숫자
    else if (ch === ' ') w += fontSize * 0.32;
    else w += fontSize * 0.55;                                                // 소문자/기타
  }
  return Math.ceil(w);
};

// MVP 통계 계산
const computeMvpStats = (dateMvp, matches) => {
  if (!dateMvp || dateMvp === '없음') return null;
  let gameMvpCount = 0;
  const teamCount = new Map();
  matches.forEach((m) => {
    if (m.mvp !== dateMvp) return;
    gameMvpCount++;
    const s1 = Number(m.score1) || 0, s2 = Number(m.score2) || 0;
    const winTeam = s1 > s2 ? m.team1 : s2 > s1 ? m.team2 : null;
    if (winTeam) teamCount.set(winTeam, (teamCount.get(winTeam) || 0) + 1);
  });
  let mvpTeam = null;
  let max = 0;
  teamCount.forEach((v, k) => { if (v > max) { max = v; mvpTeam = k; } });
  return { gameMvpCount, mvpTeam };
};

/**
 * 일자별 경기 결과 카드를 PNG 이미지로 생성
 * @param {object} props.mvpDayStats - MVP의 그날 상세 통계 (선택)
 *   { goals, assists, wins, draws, losses, played, pointRate }
 * @returns {Promise<Blob>}
 */
export async function shareDailyResultsImage({
  dateStr,
  dailyWinner,
  dateMvp,
  mvpDayStats = null,
  matches = [],
}) {
  // ── 레이아웃 상수 ──
  // 🆕 너비 확장 + 글자 크기 키워서 가독성 향상
  const totalW = 540;
  const padX = 22;
  const headerH = 100;
  const mvpStats = computeMvpStats(dateMvp, matches);
  // 🆕 상세 stat이 있으면 카드 높이 확장 (스탯 행 추가)
  const hasDetailedStats = !!(mvpStats && mvpDayStats && mvpDayStats.played > 0);
  const mvpCardH = mvpStats ? (hasDetailedStats ? 140 : 92) : 0;
  const mvpCardGap = mvpStats ? 16 : 0;
  const rowH = 52;
  const matchesTopGap = 16;
  const matchesH = matches.length * rowH + 8;
  const footerH = 38;
  const totalH = headerH + mvpCardGap + mvpCardH + matchesTopGap + matchesH + footerH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`;

  // ── Defs ──
  svg += `<defs>`;
  svg += `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`;
  svg +=   `<stop offset="0%" stop-color="#FFFFFF"/>`;
  svg +=   `<stop offset="100%" stop-color="#F5F7FA"/>`;
  svg += `</linearGradient>`;
  svg += `<linearGradient id="header" x1="0" y1="0" x2="1" y2="0.5">`;
  svg +=   `<stop offset="0%" stop-color="#2D336B"/>`;
  svg +=   `<stop offset="100%" stop-color="#1A1D4E"/>`;
  svg += `</linearGradient>`;
  svg += `<linearGradient id="mvpCard" x1="0" y1="0" x2="1" y2="0">`;
  svg +=   `<stop offset="0%" stop-color="#FFF8E1"/>`;
  svg +=   `<stop offset="100%" stop-color="#FFE082"/>`;
  svg += `</linearGradient>`;
  svg += `<linearGradient id="scoreBox" x1="0" y1="0" x2="0" y2="1">`;
  svg +=   `<stop offset="0%" stop-color="#FFFFFF"/>`;
  svg +=   `<stop offset="100%" stop-color="#F5F7FA"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="cardShadow" x="-5%" y="-10%" width="110%" height="130%">`;
  svg +=   `<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.08"/>`;
  svg += `</filter>`;
  svg += `</defs>`;

  // ── 외곽 카드 ──
  svg += `<rect width="${totalW}" height="${totalH}" rx="18" fill="url(#bg)"/>`;
  svg += `<rect x="0.5" y="0.5" width="${totalW - 1}" height="${totalH - 1}" rx="18" fill="none" stroke="#E0E4E9" stroke-width="1"/>`;

  // ────────── HEADER ──────────
  svg += `<path d="M 0 18 Q 0 0 18 0 L ${totalW - 18} 0 Q ${totalW} 0 ${totalW} 18 L ${totalW} ${headerH} L 0 ${headerH} Z" fill="url(#header)"/>`;

  // 좌상단: 날짜 (📅 + 텍스트)
  svg += `<text x="${padX}" y="42" fill="white" font-size="22" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" letter-spacing="-0.4">📅 ${esc(dateStr)}</text>`;

  // 좌상단 부제: 경기 수 + 라벨
  svg += `<text x="${padX}" y="68" fill="rgba(255,255,255,0.65)" font-size="13" font-weight="600" font-family="sans-serif" letter-spacing="0.2">${matches.length}경기 · 일자별 결과</text>`;

  // 우상단: 우승팀 배지 (🏆 + 팀명)
  if (dailyWinner) {
    const winnerText = formatTeamName(dailyWinner);
    const trophyW = 24;          // 트로피 자리
    const textW = measureText(winnerText, 16);
    const insidePad = 15;
    const badgeW = trophyW + textW + insidePad * 2 - 8;
    const badgeH = 36;
    const badgeX = totalW - padX - badgeW;
    const badgeY = (headerH - badgeH) / 2 - 4;

    // 반투명 흰 배경
    svg += `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="18" fill="rgba(255,255,255,0.95)" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>`;
    // 트로피
    svg += `<text x="${badgeX + insidePad}" y="${badgeY + 25}" font-size="17" font-family="sans-serif">🏆</text>`;
    // 팀명 (남색 글씨)
    svg += `<text x="${badgeX + insidePad + trophyW}" y="${badgeY + 25}" fill="#1A1D4E" font-size="16" font-weight="900" font-family="sans-serif" letter-spacing="-0.2">${esc(winnerText)}</text>`;
  }

  // ────────── MVP STATS CARD ──────────
  if (mvpStats) {
    const cy = headerH + mvpCardGap;
    const cardX = padX;
    const cardY = cy;
    const cardW = totalW - padX * 2;
    const cardH = mvpCardH;

    // 골드 카드 배경 + 그림자
    svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="url(#mvpCard)" stroke="#FFB300" stroke-width="1.5" filter="url(#cardShadow)"/>`;

    // ── 좌측 영역: 별 + 이름 + 팀 칩 ──
    const leftX = cardX + 22;

    // 별 아이콘 (큰 사이즈)
    svg += `<text x="${leftX}" y="${cardY + 56}" font-size="40" font-family="sans-serif">⭐</text>`;

    // DAY MVP 라벨
    svg += `<text x="${leftX + 56}" y="${cardY + 28}" fill="#BF8500" font-size="11" font-weight="800" font-family="sans-serif" letter-spacing="1.5">DAY MVP</text>`;

    // MVP 이름 (큼직하게)
    svg += `<text x="${leftX + 56}" y="${cardY + 55}" fill="#3E2723" font-size="25" font-weight="900" font-family="sans-serif" letter-spacing="-0.3">${esc(dateMvp)}</text>`;

    // 소속팀 칩 (이름 아래)
    if (mvpStats.mvpTeam) {
      const teamColor = teamAccent(mvpStats.mvpTeam);
      const teamText = formatTeamName(mvpStats.mvpTeam);
      const teamTextW = measureText(teamText, 12);
      const teamChipW = teamTextW + 28;
      const teamChipX = leftX + 56;
      const teamChipY = cardY + 62;
      svg += `<rect x="${teamChipX}" y="${teamChipY}" width="${teamChipW}" height="20" rx="10" fill="white" stroke="${teamColor}" stroke-width="1.3"/>`;
      svg += `<circle cx="${teamChipX + 10}" cy="${teamChipY + 10}" r="4" fill="${teamColor}"/>`;
      svg += `<text x="${teamChipX + 19}" y="${teamChipY + 14}" fill="${teamColor}" font-size="12" font-weight="800" font-family="sans-serif" letter-spacing="-0.1">${esc(teamText)}</text>`;
    }

    // ── 우측 영역: 통계 ──
    const rightEdge = cardX + cardW - 22;

    // 세로 구분선
    const dividerX = cardX + cardW - 124;
    svg += `<line x1="${dividerX}" y1="${cardY + 18}" x2="${dividerX}" y2="${cardY + (hasDetailedStats ? 76 : cardH - 18)}" stroke="#FFB300" stroke-width="1" stroke-opacity="0.3"/>`;

    // "게임 MVP" 라벨
    svg += `<text x="${rightEdge}" y="${cardY + 32}" text-anchor="end" fill="#BF8500" font-size="11" font-weight="800" font-family="sans-serif" letter-spacing="1">게임 MVP</text>`;

    // 큰 숫자 + 회 단위
    const countText = String(mvpStats.gameMvpCount);
    svg += `<text x="${rightEdge}" y="${cardY + 66}" text-anchor="end" fill="#3E2723" font-size="34" font-weight="900" font-family="sans-serif" letter-spacing="-0.5">${countText}<tspan font-size="16" font-weight="700" dx="2" fill="#5D4037">회</tspan></text>`;

    // ── 🆕 하단 영역: MVP의 그날 상세 통계 (득점/도움/승점율) ──
    if (hasDetailedStats) {
      const statsY = cardY + 90;          // 하단 통계 행 시작
      const dividerY = cardY + 86;

      // 가로 구분선 (위 카드 ↔ 통계 행 분리)
      svg += `<line x1="${cardX + 22}" y1="${dividerY}" x2="${cardX + cardW - 22}" y2="${dividerY}" stroke="#FFB300" stroke-width="1" stroke-opacity="0.35"/>`;

      const { goals = 0, assists = 0, wins = 0, draws = 0, losses = 0, played = 0, pointRate = 0 } = mvpDayStats;

      // 3개 영역 균등 분할 (득점, 도움, 승점율)
      const cellW = (cardW - 44) / 3;
      const cellMid = [
        cardX + 22 + cellW * 0.5,
        cardX + 22 + cellW * 1.5,
        cardX + 22 + cellW * 2.5,
      ];

      // 셀 사이 세로 구분선
      svg += `<line x1="${cardX + 22 + cellW}" y1="${statsY + 2}" x2="${cardX + 22 + cellW}" y2="${statsY + 32}" stroke="#FFB300" stroke-width="1" stroke-opacity="0.25"/>`;
      svg += `<line x1="${cardX + 22 + cellW * 2}" y1="${statsY + 2}" x2="${cardX + 22 + cellW * 2}" y2="${statsY + 32}" stroke="#FFB300" stroke-width="1" stroke-opacity="0.25"/>`;

      // 라벨 (작게, 위)
      svg += `<text x="${cellMid[0]}" y="${statsY + 13}" text-anchor="middle" fill="#BF8500" font-size="10" font-weight="800" font-family="sans-serif" letter-spacing="0.5">득점</text>`;
      svg += `<text x="${cellMid[1]}" y="${statsY + 13}" text-anchor="middle" fill="#BF8500" font-size="10" font-weight="800" font-family="sans-serif" letter-spacing="0.5">도움</text>`;
      svg += `<text x="${cellMid[2]}" y="${statsY + 13}" text-anchor="middle" fill="#BF8500" font-size="10" font-weight="800" font-family="sans-serif" letter-spacing="0.5">승점율</text>`;

      // 큰 숫자 + 단위 (아래)
      // 득점
      svg += `<text x="${cellMid[0]}" y="${statsY + 36}" text-anchor="middle" fill="#3E2723" font-size="22" font-weight="900" font-family="sans-serif" letter-spacing="-0.3">${goals}<tspan font-size="13" font-weight="700" dx="2" fill="#5D4037">골</tspan></text>`;
      // 도움
      svg += `<text x="${cellMid[1]}" y="${statsY + 36}" text-anchor="middle" fill="#3E2723" font-size="22" font-weight="900" font-family="sans-serif" letter-spacing="-0.3">${assists}<tspan font-size="13" font-weight="700" dx="2" fill="#5D4037">도움</tspan></text>`;
      // 승점율 + 승무패 부제
      svg += `<text x="${cellMid[2]}" y="${statsY + 34}" text-anchor="middle" fill="#3E2723" font-size="22" font-weight="900" font-family="sans-serif" letter-spacing="-0.3">${pointRate}<tspan font-size="13" font-weight="700" dx="2" fill="#5D4037">%</tspan></text>`;
      // 승무패 부제 (작게)
      const wdlText = `${wins}승 ${draws}무 ${losses}패 (${played}경기)`;
      svg += `<text x="${cellMid[2]}" y="${statsY + 47}" text-anchor="middle" fill="#8D6E63" font-size="9" font-weight="600" font-family="sans-serif">${esc(wdlText)}</text>`;
    }
  }

  // ────────── MATCHES ──────────
  const matchesStartY = headerH + mvpCardGap + mvpCardH + matchesTopGap;
  // 점수 박스 위치 (전체 너비의 약 53%)
  const scoreCx = totalW * 0.53;

  matches.forEach((m, idx) => {
    const y = matchesStartY + idx * rowH;

    // 행 배경 — 흰 카드 (행 높이 52, 카드 46)
    svg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH - 6}" rx="13" fill="white" stroke="#E8EAEC" stroke-width="1" filter="url(#cardShadow)"/>`;

    // 게임 번호 (왼쪽 인디고 칩)
    const gameLabel = String(m.gameNumber || idx + 1).replace(/경기$/, '');
    svg += `<rect x="${padX + 11}" y="${y + 11}" width="30" height="24" rx="12" fill="#EEF2FF"/>`;
    svg += `<text x="${padX + 26}" y="${y + 28}" text-anchor="middle" fill="#3F51B5" font-size="13" font-weight="900" font-family="sans-serif">${esc(gameLabel)}</text>`;

    const score1 = Number(m.score1) || 0;
    const score2 = Number(m.score2) || 0;
    const t1Win = score1 > score2;
    const t2Win = score2 > score1;
    const isDraw = score1 === score2;

    // 점수 박스 (가운데, 그라데이션) — 더 크게
    const scoreText = `${score1} : ${score2}`;
    const scoreBoxW = 70;
    const scoreBoxH = 26;
    svg += `<rect x="${scoreCx - scoreBoxW / 2}" y="${y + 10}" width="${scoreBoxW}" height="${scoreBoxH}" rx="7" fill="url(#scoreBox)" stroke="#D6DBE0" stroke-width="1"/>`;
    svg += `<text x="${scoreCx}" y="${y + 29}" text-anchor="middle" fill="#1A1D4E" font-size="16" font-weight="900" font-family="sans-serif" letter-spacing="0.5">${esc(scoreText)}</text>`;

    // Team 1 (점수 좌측, 우측정렬)
    const t1Color = t1Win ? teamAccent(m.team1) : (isDraw ? '#666' : '#B0BEC5');
    const t1Weight = t1Win ? '900' : '600';
    const t1Name = formatTeamName(m.team1);
    const dotR = 4;
    const dotPad = 7;
    const dotX1 = scoreCx - scoreBoxW / 2 - dotPad - dotR;
    svg += `<circle cx="${dotX1}" cy="${y + 24}" r="${dotR}" fill="${t1Color}" opacity="${t1Win ? 1 : 0.45}"/>`;
    svg += `<text x="${dotX1 - dotR - 5}" y="${y + 29}" text-anchor="end" fill="${t1Color}" font-size="14.5" font-weight="${t1Weight}" font-family="sans-serif">${esc(t1Name)}</text>`;

    // Team 2 (점수 우측, 좌측정렬)
    const t2Color = t2Win ? teamAccent(m.team2) : (isDraw ? '#666' : '#B0BEC5');
    const t2Weight = t2Win ? '900' : '600';
    const t2Name = formatTeamName(m.team2);
    const dotX2 = scoreCx + scoreBoxW / 2 + dotPad + dotR;
    svg += `<circle cx="${dotX2}" cy="${y + 24}" r="${dotR}" fill="${t2Color}" opacity="${t2Win ? 1 : 0.45}"/>`;
    svg += `<text x="${dotX2 + dotR + 5}" y="${y + 29}" text-anchor="start" fill="${t2Color}" font-size="14.5" font-weight="${t2Weight}" font-family="sans-serif">${esc(t2Name)}</text>`;

    // MVP (행 우측 끝) — 일자 MVP는 ⭐ + 주황색 강조
    if (m.mvp && m.mvp !== '없음') {
      const isDayMvp = dateMvp && m.mvp === dateMvp;
      const mvpColor = isDayMvp ? '#E65100' : '#5C6873';
      const mvpIcon = isDayMvp ? '⭐' : '🥇';
      const mvpFontWeight = isDayMvp ? '900' : '700';
      svg += `<text x="${totalW - padX - 14}" y="${y + 29}" text-anchor="end" fill="${mvpColor}" font-size="13.5" font-weight="${mvpFontWeight}" font-family="sans-serif" letter-spacing="-0.1">${mvpIcon} ${esc(m.mvp)}</text>`;
    }
  });

  // ────────── FOOTER ──────────
  const footerY = totalH - 15;
  svg += `<text x="${totalW / 2}" y="${footerY}" text-anchor="middle" fill="#90A4AE" font-size="11" font-weight="600" font-family="sans-serif" letter-spacing="0.8">⚽ uri-league.web.app</text>`;

  svg += `</svg>`;

  // SVG → Canvas → PNG (3x scale)
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement('canvas');
      canvas.width = totalW * scale;
      canvas.height = totalH * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, totalW, totalH);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지 생성 실패'))),
        'image/png'
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 렌더링 실패'));
    };
    img.src = url;
  });
}

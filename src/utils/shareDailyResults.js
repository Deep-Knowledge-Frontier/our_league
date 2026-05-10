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

// 팀 코드별 컬러 (Team A=빨강, B=노랑, C=파랑) — 보조 시각 단서
const teamAccent = (name) => {
  const c = String(name || '').replace(/^팀\s*/, '').replace(/^Team\s*/i, '').trim().toUpperCase();
  if (c.startsWith('A')) return '#E53935';
  if (c.startsWith('B')) return '#FB8C00';
  if (c.startsWith('C')) return '#1E88E5';
  return '#546E7A';
};

// MVP 통계 계산 (matches로부터)
const computeMvpStats = (dateMvp, matches) => {
  if (!dateMvp || dateMvp === '없음') return null;
  let gameMvpCount = 0;
  const teamCount = new Map(); // 팀명 → MVP로 뽑힌 횟수 (소속팀 추정)
  matches.forEach((m) => {
    if (m.mvp !== dateMvp) return;
    gameMvpCount++;
    // MVP가 뽑힐 때 그 게임의 승리팀이 본인 팀일 가능성이 높음
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
 * @returns {Promise<Blob>}
 */
export async function shareDailyResultsImage({
  dateStr,
  dailyWinner,
  dateMvp,
  matches = [],
}) {
  const padX = 18;
  const headerH = 78;
  const mvpStats = computeMvpStats(dateMvp, matches);
  const mvpCardH = mvpStats ? 64 : 0;
  const mvpCardGap = mvpStats ? 12 : 0;
  const rowH = 44;
  const matchesTopGap = 14;
  const matchesH = matches.length * rowH + 8;
  const footerH = 32;

  const totalW = 460;
  const totalH = headerH + mvpCardGap + mvpCardH + matchesTopGap + matchesH + footerH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`;

  // ── Defs (그라데이션 정의) ──
  svg += `<defs>`;
  svg += `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`;
  svg +=   `<stop offset="0%" stop-color="#FFFFFF"/>`;
  svg +=   `<stop offset="100%" stop-color="#F5F7FA"/>`;
  svg += `</linearGradient>`;
  svg += `<linearGradient id="header" x1="0" y1="0" x2="1" y2="0">`;
  svg +=   `<stop offset="0%" stop-color="#2D336B"/>`;
  svg +=   `<stop offset="100%" stop-color="#1A1D4E"/>`;
  svg += `</linearGradient>`;
  svg += `<linearGradient id="mvpCard" x1="0" y1="0" x2="1" y2="0">`;
  svg +=   `<stop offset="0%" stop-color="#FFF8E1"/>`;
  svg +=   `<stop offset="100%" stop-color="#FFECB3"/>`;
  svg += `</linearGradient>`;
  svg += `<linearGradient id="scoreBox" x1="0" y1="0" x2="0" y2="1">`;
  svg +=   `<stop offset="0%" stop-color="#FFFFFF"/>`;
  svg +=   `<stop offset="100%" stop-color="#FAFAFA"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">`;
  svg +=   `<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.08"/>`;
  svg += `</filter>`;
  svg += `</defs>`;

  // ── 외곽 카드 ──
  svg += `<rect width="${totalW}" height="${totalH}" rx="16" fill="url(#bg)"/>`;
  svg += `<rect x="0.5" y="0.5" width="${totalW - 1}" height="${totalH - 1}" rx="16" fill="none" stroke="#E0E4E9" stroke-width="1"/>`;

  // ── Header (그라데이션) ──
  svg += `<path d="M 0 16 Q 0 0 16 0 L ${totalW - 16} 0 Q ${totalW} 0 ${totalW} 16 L ${totalW} ${headerH} L 0 ${headerH} Z" fill="url(#header)"/>`;

  // 좌상단: 날짜 (📅 + 텍스트 흰색)
  svg += `<text x="${padX}" y="34" fill="white" font-size="19" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, sans-serif" letter-spacing="-0.3">📅 ${esc(dateStr)}</text>`;

  // 좌하단: 부제 — "${matches.length}경기"
  svg += `<text x="${padX}" y="58" fill="rgba(255,255,255,0.7)" font-size="11" font-weight="600" font-family="sans-serif">${matches.length}경기 · 일자별 결과</text>`;

  // 우상단: 우승팀 (트로피 + 팀명 — 흰색 강조)
  if (dailyWinner) {
    const winnerText = formatTeamName(dailyWinner);
    const winColor = teamAccent(dailyWinner);
    // 우승팀 배지 (반투명 흰 배경 + 색상 있는 트로피 이모지)
    const badgeW = winnerText.length * 8.5 + 38;
    const badgeX = totalW - padX - badgeW;
    svg += `<rect x="${badgeX}" y="20" width="${badgeW}" height="28" rx="14" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`;
    svg += `<text x="${badgeX + 12}" y="38" fill="#FFD54F" font-size="14" font-family="sans-serif">🏆</text>`;
    svg += `<text x="${badgeX + 30}" y="39" fill="white" font-size="13" font-weight="900" font-family="sans-serif" letter-spacing="-0.2">${esc(winnerText)}</text>`;
    // 팀 컬러 도트
    svg += `<circle cx="${badgeX + badgeW - 12}" cy="34" r="4" fill="${winColor}"/>`;
  }

  // ── MVP Stats Card (헤더 아래 골든 카드) ──
  if (mvpStats) {
    const cy = headerH + mvpCardGap;
    const cardX = padX;
    const cardY = cy;
    const cardW = totalW - padX * 2;
    const cardH = mvpCardH;

    // 골드 그라데이션 배경 + 그림자
    svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12" fill="url(#mvpCard)" stroke="#FFB300" stroke-width="1.5" filter="url(#cardShadow)"/>`;

    // 좌측 큰 별/왕관 아이콘
    svg += `<text x="${cardX + 18}" y="${cardY + 40}" font-size="28" font-family="sans-serif">⭐</text>`;

    // MVP 라벨 (작게)
    svg += `<text x="${cardX + 56}" y="${cardY + 22}" fill="#BF8500" font-size="10" font-weight="800" font-family="sans-serif" letter-spacing="1">DAY MVP</text>`;

    // MVP 이름 (크게)
    svg += `<text x="${cardX + 56}" y="${cardY + 42}" fill="#5D4037" font-size="18" font-weight="900" font-family="sans-serif" letter-spacing="-0.3">${esc(dateMvp)}</text>`;

    // 우측 통계: 게임 MVP 횟수 + 소속팀
    const statsX = cardX + cardW - 14;
    let statsY = cardY + 22;

    if (mvpStats.gameMvpCount > 0) {
      svg += `<text x="${statsX}" y="${statsY}" text-anchor="end" fill="#BF8500" font-size="10" font-weight="800" font-family="sans-serif" letter-spacing="0.5">게임 MVP</text>`;
      svg += `<text x="${statsX}" y="${statsY + 22}" text-anchor="end" fill="#5D4037" font-size="22" font-weight="900" font-family="sans-serif">${mvpStats.gameMvpCount}<tspan font-size="13" font-weight="700">회</tspan></text>`;
    }

    if (mvpStats.mvpTeam) {
      const teamColor = teamAccent(mvpStats.mvpTeam);
      const teamText = formatTeamName(mvpStats.mvpTeam);
      const teamX = cardX + 56;
      const teamY = cardY + 56;
      // 팀 칩
      const teamW = teamText.length * 7 + 20;
      svg += `<rect x="${teamX}" y="${teamY - 11}" width="${teamW}" height="18" rx="9" fill="white" stroke="${teamColor}" stroke-width="1.2"/>`;
      svg += `<circle cx="${teamX + 9}" cy="${teamY - 2}" r="3.5" fill="${teamColor}"/>`;
      svg += `<text x="${teamX + 17}" y="${teamY + 2}" fill="${teamColor}" font-size="10" font-weight="800" font-family="sans-serif">${esc(teamText)}</text>`;
    }
  }

  // ── Matches ──
  const matchesStartY = headerH + mvpCardGap + mvpCardH + matchesTopGap;
  matches.forEach((m, idx) => {
    const y = matchesStartY + idx * rowH;
    // 행 배경 (흰 카드 + 그림자)
    svg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH - 6}" rx="10" fill="white" stroke="#EEEEEE" stroke-width="1" filter="url(#cardShadow)"/>`;

    // 게임 번호 칩 (모던)
    const gameLabel = String(m.gameNumber || idx + 1).replace(/경기$/, '');
    svg += `<rect x="${padX + 8}" y="${y + 9}" width="26" height="22" rx="11" fill="#E8EAF6"/>`;
    svg += `<text x="${padX + 21}" y="${y + 24}" text-anchor="middle" fill="#3F51B5" font-size="12" font-weight="900" font-family="sans-serif">${esc(gameLabel)}</text>`;

    const score1 = Number(m.score1) || 0;
    const score2 = Number(m.score2) || 0;
    const t1Win = score1 > score2;
    const t2Win = score2 > score1;

    // 점수 박스 (가운데, 그라데이션)
    const scoreCx = totalW / 2 - 16; // MVP 영역 확보 위해 살짝 좌측으로
    const scoreText = `${score1} : ${score2}`;
    svg += `<rect x="${scoreCx - 28}" y="${y + 9}" width="56" height="22" rx="6" fill="url(#scoreBox)" stroke="#D6DBE0" stroke-width="1"/>`;
    svg += `<text x="${scoreCx}" y="${y + 24}" text-anchor="middle" fill="#1A1D4E" font-size="13" font-weight="900" font-family="sans-serif" letter-spacing="0.5">${esc(scoreText)}</text>`;

    // Team 1 (좌측) — 팀 컬러 도트 + 이름
    const t1Color = t1Win ? teamAccent(m.team1) : '#90A4AE';
    const t1Weight = t1Win ? '900' : '600';
    const t1Name = formatTeamName(m.team1);
    svg += `<circle cx="${scoreCx - 38}" cy="${y + 20}" r="3.5" fill="${t1Color}" opacity="${t1Win ? 1 : 0.4}"/>`;
    svg += `<text x="${scoreCx - 46}" y="${y + 24}" text-anchor="end" fill="${t1Color}" font-size="12.5" font-weight="${t1Weight}" font-family="sans-serif">${esc(t1Name)}</text>`;

    // Team 2 (우측) — 이름 + 팀 컬러 도트
    const t2Color = t2Win ? teamAccent(m.team2) : '#90A4AE';
    const t2Weight = t2Win ? '900' : '600';
    const t2Name = formatTeamName(m.team2);
    svg += `<circle cx="${scoreCx + 38}" cy="${y + 20}" r="3.5" fill="${t2Color}" opacity="${t2Win ? 1 : 0.4}"/>`;
    svg += `<text x="${scoreCx + 46}" y="${y + 24}" text-anchor="start" fill="${t2Color}" font-size="12.5" font-weight="${t2Weight}" font-family="sans-serif">${esc(t2Name)}</text>`;

    // MVP (행 우측 끝)
    if (m.mvp && m.mvp !== '없음') {
      const isDayMvp = dateMvp && m.mvp === dateMvp;
      const mvpColor = isDayMvp ? '#E65100' : '#666';
      svg += `<text x="${totalW - padX - 10}" y="${y + 24}" text-anchor="end" fill="${mvpColor}" font-size="11.5" font-weight="${isDayMvp ? '900' : '700'}" font-family="sans-serif">${isDayMvp ? '⭐' : '🏅'} ${esc(m.mvp)}</text>`;
    }
  });

  // ── Footer ──
  const footerY = totalH - 12;
  svg += `<text x="${totalW / 2}" y="${footerY}" text-anchor="middle" fill="#B0BEC5" font-size="9.5" font-weight="600" font-family="sans-serif" letter-spacing="0.5">⚽ uri-league.web.app</text>`;

  svg += `</svg>`;

  // SVG → Canvas → PNG (3x scale, 고해상도)
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

// 경기 상세 공유 이미지 생성기
// SVG 를 빌드한 뒤 Canvas 로 PNG Blob 변환

// HTML 특수문자 이스케이프 (SVG <text> 내에서 깨지지 않도록)
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 리그 번호별 색상 (MatchDetailPage 와 동일)
const LEAGUE_PALETTE = [
  '#FFD700', '#C0C0C0', '#CD7F32', '#E91E63', '#9C27B0',
  '#2196F3', '#4CAF50', '#FF5722', '#00BCD4',
];
const colorOfLeague = (leagueKey) => {
  const m = String(leagueKey).match(/(\d+)/);
  const idx = m ? parseInt(m[1], 10) - 1 : 0;
  return LEAGUE_PALETTE[((idx % LEAGUE_PALETTE.length) + LEAGUE_PALETTE.length) % LEAGUE_PALETTE.length];
};

const dailyTeamMedalColor = (count) => {
  if (count >= 30) return '#FFB300';
  if (count >= 10) return '#B0BEC5';
  if (count >= 1) return '#CD7F32';
  return null;
};

/**
 * 경기 상세를 PNG 이미지로 생성
 * @returns {Promise<Blob>}
 */
export async function shareMatchImage({
  dateStr,                // '2026.04.26 (일)'
  team1Name, team2Name,   // 팀명
  score1 = 0, score2 = 0,
  gameNum = 1,
  goalList1 = [],         // [{ scorer, assist, time }]
  goalList2 = [],
  positions = [],         // [{ name, x, y, isHome, posLabel }]
  fieldW = 360,
  fieldH = 580,
  leagueWinsByPlayer = {},
  winningCaptain = null,
  winningCaptainTotalWins = 0,
  dailyTeamWinsByPlayer = {},
}) {
  const padX = 14;
  const headerH = 50;
  const scoreH = 110;
  const maxGoals = Math.max(goalList1.length, goalList2.length, 0);
  const goalsH = maxGoals === 0 ? 8 : (maxGoals * 18 + 14);
  const footerH = 26;

  const totalW = fieldW + padX * 2;
  const totalH = headerH + scoreH + goalsH + fieldH + footerH + 8;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`;

  // 배경
  svg += `<rect width="${totalW}" height="${totalH}" fill="#F5F5F5"/>`;

  // ── 1. Header ──
  svg += `<rect x="0" y="0" width="${totalW}" height="${headerH}" fill="#0C0950"/>`;
  svg += `<text x="${totalW / 2}" y="${headerH / 2 + 6}" text-anchor="middle" fill="white" font-size="17" font-weight="900" font-family="sans-serif">${esc(dateStr)}</text>`;

  let cy = headerH + 8;

  // ── 2. Score ──
  const teamAX = padX + 50;
  const teamBX = totalW - padX - 50;
  const scoreCX = totalW / 2;

  // Team A 유니폼 박스
  svg += `<rect x="${teamAX - 22}" y="${cy}" width="44" height="48" rx="6" fill="#C62828" stroke="white" stroke-width="1.5"/>`;
  svg += `<text x="${teamAX}" y="${cy + 30}" text-anchor="middle" fill="white" font-size="14" font-weight="900" font-family="sans-serif">A</text>`;
  svg += `<text x="${teamAX}" y="${cy + 66}" text-anchor="middle" fill="#333" font-size="12" font-weight="700" font-family="sans-serif">${esc(team1Name || 'Team A')}</text>`;

  // Team B 유니폼 박스
  svg += `<rect x="${teamBX - 22}" y="${cy}" width="44" height="48" rx="6" fill="#FBC02D" stroke="white" stroke-width="1.5"/>`;
  svg += `<text x="${teamBX}" y="${cy + 30}" text-anchor="middle" fill="white" font-size="14" font-weight="900" font-family="sans-serif">B</text>`;
  svg += `<text x="${teamBX}" y="${cy + 66}" text-anchor="middle" fill="#333" font-size="12" font-weight="700" font-family="sans-serif">${esc(team2Name || 'Team B')}</text>`;

  // 점수
  svg += `<text x="${scoreCX}" y="${cy + 40}" text-anchor="middle" fill="#222" font-size="42" font-weight="900" font-family="sans-serif">${score1} : ${score2}</text>`;
  // 게임 라벨
  svg += `<rect x="${scoreCX - 28}" y="${cy + 56}" width="56" height="20" rx="10" fill="#E3F2FD" stroke="#90CAF9" stroke-width="1"/>`;
  svg += `<text x="${scoreCX}" y="${cy + 70}" text-anchor="middle" fill="#1565C0" font-size="11" font-weight="800" font-family="sans-serif">${gameNum}경기</text>`;

  cy += scoreH;

  // ── 3. Goal list (좌우 컬럼) ──
  const colW = (totalW - padX * 2) / 2;
  if (maxGoals > 0) {
    const drawGoal = (g, i, cx, color) => {
      const text = g.assist && g.assist !== '없음'
        ? `⚽ ${g.scorer} (${g.assist})`
        : `⚽ ${g.scorer}`;
      svg += `<text x="${cx}" y="${cy + i * 18 + 14}" fill="${color}" font-size="12.5" font-weight="700" font-family="sans-serif">${esc(text)}</text>`;
    };
    goalList1.forEach((g, i) => drawGoal(g, i, padX + 8, '#C62828'));
    goalList2.forEach((g, i) => drawGoal(g, i, padX + colW + 8, '#F57F17'));
  }
  cy += goalsH;

  // ── 4. Field ──
  const fX = padX;
  const fY = cy;
  svg += `<g transform="translate(${fX},${fY})">`;

  // 잔디 줄무늬 (8 stripes)
  for (let i = 0; i < 8; i++) {
    const stripe = i % 2 === 0 ? '#2e7d32' : '#388e3c';
    svg += `<rect x="0" y="${(i * fieldH) / 8}" width="${fieldW}" height="${fieldH / 8}" fill="${stripe}"/>`;
  }
  // 라인 (border)
  svg += `<rect x="0" y="0" width="${fieldW}" height="${fieldH}" rx="6" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>`;
  // 중앙선/원
  svg += `<line x1="0" y1="${fieldH / 2}" x2="${fieldW}" y2="${fieldH / 2}" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  svg += `<circle cx="${fieldW / 2}" cy="${fieldH / 2}" r="40" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  // 페널티 박스
  svg += `<rect x="${fieldW * 0.2}" y="0" width="${fieldW * 0.6}" height="${fieldH * 0.16}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  svg += `<rect x="${fieldW * 0.2}" y="${fieldH * 0.84}" width="${fieldW * 0.6}" height="${fieldH * 0.16}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  // 골 박스
  svg += `<rect x="${fieldW * 0.35}" y="0" width="${fieldW * 0.3}" height="${fieldH * 0.06}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>`;
  svg += `<rect x="${fieldW * 0.35}" y="${fieldH * 0.94}" width="${fieldW * 0.3}" height="${fieldH * 0.06}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>`;

  // 선수
  positions.forEach((pos) => {
    const px = pos.x;
    const py = pos.y;
    const teamColor = pos.isHome ? '#C62828' : '#FBC02D';

    // 리그 우승 별 (위)
    const lwins = leagueWinsByPlayer[pos.name] || [];
    if (lwins.length > 0) {
      const stars = lwins.slice(0, 5);
      const totalW2 = stars.length * 9;
      stars.forEach((leagueKey, i) => {
        const sx = px - totalW2 / 2 + i * 9 + 4.5;
        const sy = py - 22;
        const c = colorOfLeague(leagueKey);
        svg += `<text x="${sx}" y="${sy}" text-anchor="middle" fill="${c}" font-size="11" font-weight="900" stroke="rgba(0,0,0,0.5)" stroke-width="0.4" font-family="sans-serif">★</text>`;
      });
    }

    // 일별 우승 주장 별 (캡틴 + 누적 승 수)
    if (winningCaptain && pos.name === winningCaptain && winningCaptainTotalWins > 0) {
      let n = winningCaptainTotalWins;
      const t3 = Math.min(Math.floor(n / 27), 9); n -= t3 * 27;
      const t2 = Math.floor(n / 9); n -= t2 * 9;
      const t1 = Math.floor(n / 3); n -= t1 * 3;
      const t0 = n;
      const tiers = [
        { n: t3, color: '#E91E63' },
        { n: t2, color: '#AB47BC' },
        { n: t1, color: '#29B6F6' },
        { n: t0, color: '#FFC107' },
      ];
      const totalCount = tiers.reduce((s, t) => s + t.n, 0);
      let drawnIdx = 0;
      const baseW = totalCount * 8;
      tiers.forEach((tier) => {
        for (let i = 0; i < tier.n; i++) {
          const sx = px - baseW / 2 + drawnIdx * 8 + 4;
          const sy = py - 12;
          svg += `<text x="${sx}" y="${sy}" text-anchor="middle" fill="${tier.color}" font-size="9" font-weight="900" stroke="rgba(0,0,0,0.5)" stroke-width="0.3" font-family="sans-serif">★</text>`;
          drawnIdx++;
        }
      });
    }

    // 유니폼
    svg += `<rect x="${px - 14}" y="${py - 14}" width="28" height="28" rx="4" fill="${teamColor}" stroke="white" stroke-width="1.5"/>`;

    // 포지션 라벨
    if (pos.posLabel) {
      svg += `<rect x="${px - 11}" y="${py + 8}" width="22" height="10" rx="2" fill="rgba(0,0,0,0.7)"/>`;
      svg += `<text x="${px}" y="${py + 16}" text-anchor="middle" fill="#FFD700" font-size="7" font-weight="800" font-family="sans-serif">${esc(pos.posLabel)}</text>`;
    }

    // 이름 (유니폼 아래)
    const name = String(pos.name || '');
    svg += `<text x="${px}" y="${py + 28}" text-anchor="middle" fill="white" font-size="9" font-weight="800" stroke="rgba(0,0,0,0.85)" stroke-width="2" paint-order="stroke" font-family="sans-serif">${esc(name)}</text>`;

    // 일별 우승팀 메달
    const dt = dailyTeamWinsByPlayer[pos.name] || 0;
    const medalColor = dailyTeamMedalColor(dt);
    if (medalColor) {
      svg += `<circle cx="${px}" cy="${py + 36}" r="2.5" fill="${medalColor}" stroke="rgba(0,0,0,0.4)" stroke-width="0.4"/>`;
    }
  });

  svg += `</g>`;
  cy += fieldH;

  // ── 5. Footer ──
  svg += `<text x="${totalW / 2}" y="${totalH - 10}" text-anchor="middle" fill="#999" font-size="9" font-family="sans-serif">uri-league.web.app</text>`;

  svg += `</svg>`;

  // SVG → Canvas → PNG
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const scale = 2;
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

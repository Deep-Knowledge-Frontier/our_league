// 일자별 경기 결과 카드를 공유 이미지(PNG)로 생성

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

/**
 * 일자별 경기 결과 카드를 PNG 이미지로 생성
 * @returns {Promise<Blob>}
 */
export async function shareDailyResultsImage({
  dateStr,           // '2026-04-26 (일)'
  dailyWinner,       // 'Team C' or null
  dateMvp,           // '손범우' or null
  matches = [],      // [{ gameNumber, team1, team2, score1, score2, mvp }]
}) {
  const padX = 14;
  const headerH = 76;
  const rowH = 40;
  const matchesH = matches.length * rowH + 8;
  const footerH = 26;

  const totalW = 420;
  const totalH = headerH + matchesH + footerH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`;

  // 카드 배경
  svg += `<rect width="${totalW}" height="${totalH}" rx="12" fill="#FFFFFF"/>`;
  svg += `<rect x="0.5" y="0.5" width="${totalW - 1}" height="${totalH - 1}" rx="12" fill="none" stroke="#E0E0E0" stroke-width="1"/>`;

  // ── Header ──
  // 좌상단: 📅 날짜 (파랑 큰글씨)
  svg += `<text x="${padX}" y="30" fill="#1565C0" font-size="17" font-weight="900" font-family="sans-serif">📅 ${esc(dateStr)}</text>`;

  // 우상단: 🏆 우승팀
  let topRightY = 22;
  if (dailyWinner) {
    const winnerText = `🏆 ${formatTeamName(dailyWinner)}`;
    svg += `<text x="${totalW - padX}" y="${topRightY}" text-anchor="end" fill="#333" font-size="12" font-weight="800" font-family="sans-serif">${esc(winnerText)}</text>`;
  }

  // 우중간: MVP 칩 (빨간 테두리)
  if (dateMvp) {
    const chipLabel = `MVP: ${dateMvp}`;
    const chipW = chipLabel.length * 7 + 18;
    const chipX = totalW - padX - chipW;
    const chipY = 36;
    svg += `<rect x="${chipX}" y="${chipY}" width="${chipW}" height="20" rx="10" fill="white" stroke="#C62828" stroke-width="1.5"/>`;
    svg += `<text x="${chipX + chipW / 2}" y="${chipY + 14}" text-anchor="middle" fill="#C62828" font-size="11" font-weight="700" font-family="sans-serif">${esc(chipLabel)}</text>`;
  }

  // 헤더 구분선
  svg += `<line x1="${padX}" y1="${headerH - 6}" x2="${totalW - padX}" y2="${headerH - 6}" stroke="#EEEEEE" stroke-width="2"/>`;

  // ── Matches ──
  let cy = headerH;
  matches.forEach((m, idx) => {
    const y = cy + idx * rowH;
    // 행 배경
    svg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH - 6}" rx="8" fill="#F9F9FB"/>`;

    // 게임 번호 칩
    const gameLabel = String(m.gameNumber || idx + 1).replace(/경기$/, '');
    svg += `<rect x="${padX + 8}" y="${y + 9}" width="24" height="20" rx="10" fill="#E3F2FD"/>`;
    svg += `<text x="${padX + 20}" y="${y + 23}" text-anchor="middle" fill="#1565C0" font-size="12" font-weight="900" font-family="sans-serif">${esc(gameLabel)}</text>`;

    const score1 = Number(m.score1) || 0;
    const score2 = Number(m.score2) || 0;
    const t1Win = score1 > score2;
    const t2Win = score2 > score1;

    // 점수 박스 (가운데 고정)
    const scoreCx = totalW / 2;
    const scoreText = `${score1}:${score2}`;
    svg += `<rect x="${scoreCx - 24}" y="${y + 9}" width="48" height="20" rx="6" fill="white" stroke="#DDDDDD" stroke-width="1.5"/>`;
    svg += `<text x="${scoreCx}" y="${y + 23}" text-anchor="middle" fill="#222" font-size="13" font-weight="900" font-family="sans-serif">${esc(scoreText)}</text>`;

    // Team 1 (점수 좌측, 우측정렬)
    const t1Color = t1Win ? '#1565C0' : '#444';
    const t1Weight = t1Win ? '900' : '500';
    svg += `<text x="${scoreCx - 30}" y="${y + 23}" text-anchor="end" fill="${t1Color}" font-size="12.5" font-weight="${t1Weight}" font-family="sans-serif">${esc(formatTeamName(m.team1))}</text>`;

    // Team 2 (점수 우측, 좌측정렬)
    const t2Color = t2Win ? '#1565C0' : '#444';
    const t2Weight = t2Win ? '900' : '500';
    svg += `<text x="${scoreCx + 30}" y="${y + 23}" text-anchor="start" fill="${t2Color}" font-size="12.5" font-weight="${t2Weight}" font-family="sans-serif">${esc(formatTeamName(m.team2))}</text>`;

    // MVP (행 우측 끝)
    if (m.mvp) {
      svg += `<text x="${totalW - padX - 8}" y="${y + 23}" text-anchor="end" fill="#333" font-size="11" font-weight="700" font-family="sans-serif">🏆 ${esc(m.mvp)}</text>`;
    }
  });

  // ── Footer ──
  svg += `<text x="${totalW / 2}" y="${totalH - 10}" text-anchor="middle" fill="#AAA" font-size="9" font-family="sans-serif">uri-league.web.app</text>`;

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

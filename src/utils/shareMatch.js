// 경기 상세 공유 이미지 생성기
// SVG 를 빌드한 뒤 Canvas 로 PNG Blob 변환 + 유니폼 이미지를 캔버스에 직접 drawImage

// HTML 특수문자 이스케이프 (SVG <text> 내에서 깨지지 않도록)
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dailyTeamMedalColor = (count) => {
  if (count >= 30) return '#FFB300';
  if (count >= 10) return '#B0BEC5';
  if (count >= 1) return '#CD7F32';
  return null;
};

// 이미지 로드 헬퍼
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패: ' + src));
    img.src = src;
  });

// 5각 별 path 그리기 (canvas) — 폰트 글리프 누락 방지
const drawStar = (ctx, cx, cy, outerR, innerR, fill, stroke, strokeWidth = 0.5) => {
  ctx.beginPath();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
};

// 🆕 유니폼(티셔츠) 그리기 — SVG path와 동일 모양 (벤치마크 디자인)
const drawJersey = (ctx, cx, cy, w, h, color, posLabel = '') => {
  // 100x83 viewBox 좌표를 실제 좌표로 매핑
  const sx = (px) => cx - w / 2 + (px / 100) * w;
  const sy = (py) => cy - h / 2 + (py / 83) * h;

  ctx.beginPath();
  ctx.moveTo(sx(30), sy(6));
  ctx.lineTo(sx(18), sy(10));
  ctx.lineTo(sx(6), sy(22));
  ctx.quadraticCurveTo(sx(4), sy(28), sx(8), sy(32));
  ctx.lineTo(sx(14), sy(38));
  ctx.lineTo(sx(22), sy(34));
  ctx.lineTo(sx(22), sy(74));
  ctx.quadraticCurveTo(sx(22), sy(80), sx(28), sy(80));
  ctx.lineTo(sx(72), sy(80));
  ctx.quadraticCurveTo(sx(78), sy(80), sx(78), sy(74));
  ctx.lineTo(sx(78), sy(34));
  ctx.lineTo(sx(86), sy(38));
  ctx.lineTo(sx(92), sy(32));
  ctx.quadraticCurveTo(sx(96), sy(28), sx(94), sy(22));
  ctx.lineTo(sx(82), sy(10));
  ctx.lineTo(sx(70), sy(6));
  ctx.lineTo(sx(64), sy(12));
  ctx.quadraticCurveTo(sx(50), sy(22), sx(36), sy(12));
  ctx.lineTo(sx(30), sy(6));
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  // 포지션 라벨 (유니폼 내부 가운데)
  if (posLabel) {
    const labelLen = String(posLabel).length;
    const fontSize = labelLen >= 4 ? h * 0.18 : labelLen === 3 ? h * 0.24 : h * 0.32;
    ctx.font = `900 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeText(posLabel, cx, sy(56));
    ctx.fillStyle = 'white';
    ctx.fillText(posLabel, cx, sy(56));
  }
};

/**
 * 경기 상세를 PNG 이미지로 생성
 * - 별: 리그 우승 = 블루(#29B6F6) ★ 1개/리그, 우승 주장 = 골드(#FFC107) ★ 1개
 * - 유니폼: 실제 PNG (uniform1.png/uniform2.png) drawImage 로 합성
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
  fieldH = 720,
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
  const fieldX = padX;
  const fieldY = headerH + scoreH + goalsH;
  const totalH = fieldY + fieldH + footerH + 8;

  // ── SVG 빌드 (배경, 라인, 텍스트, 별 — 유니폼은 캔버스 후처리) ──
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`;
  svg += `<rect width="${totalW}" height="${totalH}" fill="#F5F5F5"/>`;

  // Header
  svg += `<rect x="0" y="0" width="${totalW}" height="${headerH}" fill="#0C0950"/>`;
  svg += `<text x="${totalW / 2}" y="${headerH / 2 + 6}" text-anchor="middle" fill="white" font-size="17" font-weight="900" font-family="sans-serif">${esc(dateStr)}</text>`;

  let cy = headerH + 8;

  // Score area
  const teamAX = padX + 50;
  const teamBX = totalW - padX - 50;
  const scoreCX = totalW / 2;
  // 팀 이름 (유니폼은 캔버스에서 그릴 예정 → 빈 공간)
  svg += `<text x="${teamAX}" y="${cy + 66}" text-anchor="middle" fill="#333" font-size="12" font-weight="700" font-family="sans-serif">${esc(team1Name || 'Team A')}</text>`;
  svg += `<text x="${teamBX}" y="${cy + 66}" text-anchor="middle" fill="#333" font-size="12" font-weight="700" font-family="sans-serif">${esc(team2Name || 'Team B')}</text>`;
  // 점수
  svg += `<text x="${scoreCX}" y="${cy + 40}" text-anchor="middle" fill="#222" font-size="42" font-weight="900" font-family="sans-serif">${score1} : ${score2}</text>`;
  svg += `<rect x="${scoreCX - 28}" y="${cy + 56}" width="56" height="20" rx="10" fill="#E3F2FD" stroke="#90CAF9" stroke-width="1"/>`;
  svg += `<text x="${scoreCX}" y="${cy + 70}" text-anchor="middle" fill="#1565C0" font-size="11" font-weight="800" font-family="sans-serif">${gameNum}경기</text>`;

  cy += scoreH;

  // Goal list
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

  // Field background + lines
  svg += `<g transform="translate(${fieldX},${fieldY})">`;
  for (let i = 0; i < 8; i++) {
    const stripe = i % 2 === 0 ? '#2e7d32' : '#388e3c';
    svg += `<rect x="0" y="${(i * fieldH) / 8}" width="${fieldW}" height="${fieldH / 8}" fill="${stripe}"/>`;
  }
  svg += `<rect x="0" y="0" width="${fieldW}" height="${fieldH}" rx="6" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>`;
  svg += `<line x1="0" y1="${fieldH / 2}" x2="${fieldW}" y2="${fieldH / 2}" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  svg += `<circle cx="${fieldW / 2}" cy="${fieldH / 2}" r="${Math.min(fieldH * 0.07, 50)}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  svg += `<rect x="${fieldW * 0.2}" y="0" width="${fieldW * 0.6}" height="${fieldH * 0.16}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  svg += `<rect x="${fieldW * 0.2}" y="${fieldH * 0.84}" width="${fieldW * 0.6}" height="${fieldH * 0.16}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
  svg += `<rect x="${fieldW * 0.35}" y="0" width="${fieldW * 0.3}" height="${fieldH * 0.06}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>`;
  svg += `<rect x="${fieldW * 0.35}" y="${fieldH * 0.94}" width="${fieldW * 0.3}" height="${fieldH * 0.06}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>`;
  svg += `</g>`;

  // Footer
  svg += `<text x="${totalW / 2}" y="${totalH - 10}" text-anchor="middle" fill="#999" font-size="9" font-family="sans-serif">uri-league.web.app</text>`;
  svg += `</svg>`;

  // ── 캔버스에 SVG + 유니폼 이미지 + 텍스트(별/이름) 합성 ──
  // 🔧 해상도 향상 (2x → 3x)
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) SVG → 이미지로 변환 후 캔버스에 그리기 (배경/라인/스코어 텍스트/골 리스트)
  const baseImg = await new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 렌더링 실패')); };
    img.src = url;
  });
  ctx.drawImage(baseImg, 0, 0, totalW, totalH);

  // 2) 스코어 영역 유니폼 — PNG 이미지 (사용자 요청: 이전 유니폼 그대로)
  let uniform1Img = null, uniform2Img = null;
  try {
    [uniform1Img, uniform2Img] = await Promise.all([
      loadImage('/uniform1.png'),
      loadImage('/uniform2.png'),
    ]);
  } catch { /* 폴백 */ }

  const scoreUniformSize = 50;
  const scoreUniformY = headerH + 16;
  if (uniform1Img) {
    ctx.drawImage(uniform1Img, padX + 50 - scoreUniformSize / 2, scoreUniformY, scoreUniformSize, scoreUniformSize);
  } else {
    drawJersey(ctx, padX + 50, scoreUniformY + scoreUniformSize / 2, scoreUniformSize, scoreUniformSize * 0.83, '#C62828');
  }
  if (uniform2Img) {
    ctx.drawImage(uniform2Img, totalW - padX - 50 - scoreUniformSize / 2, scoreUniformY, scoreUniformSize, scoreUniformSize);
  } else {
    drawJersey(ctx, totalW - padX - 50, scoreUniformY + scoreUniformSize / 2, scoreUniformSize, scoreUniformSize * 0.83, '#F9A825');
  }

  // 4) 필드 위 선수 — 유니폼 + 별 + 라벨 + 이름 + 메달
  // 🆕 SVG 유니폼 + 포지션 라벨 내장 → 살짝 크게
  const uniformW = 36;
  const uniformH = 30;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  positions.forEach((pos) => {
    const cx = fieldX + pos.x;
    const cy2 = fieldY + pos.y;
    const uTop = cy2 - uniformH / 2;

    // 4-1) 유니폼 (벤치마크 SVG 티셔츠 + 포지션 라벨 내장)
    drawJersey(
      ctx,
      cx,
      cy2,
      uniformW,
      uniformH,
      pos.isHome ? '#C62828' : '#F9A825',
      pos.posLabel || ''
    );

    // 4-2) 캡틴 누적 별 (3진법 + 크기 차등) — 유니폼 위쪽 머리 부분
    const captainTiers = [];
    if (winningCaptain && pos.name === winningCaptain && winningCaptainTotalWins > 0) {
      let n = winningCaptainTotalWins;
      const t3 = Math.min(Math.floor(n / 27), 9); n -= t3 * 27;
      const t2 = Math.floor(n / 9); n -= t2 * 9;
      const t1 = Math.floor(n / 3); n -= t1 * 3;
      const t0 = n;
      const tiers = [
        { count: t3, color: '#E91E63', stroke: 'rgba(0,0,0,0.55)', size: 9 },   // Pink — 큼
        { count: t2, color: '#AB47BC', stroke: 'rgba(0,0,0,0.55)', size: 7.5 },
        { count: t1, color: '#29B6F6', stroke: 'rgba(0,0,0,0.55)', size: 6.5 },
        { count: t0, color: '#FFC107', stroke: 'rgba(0,0,0,0.55)', size: 5.5 }, // Gold — 작음
      ];
      tiers.forEach((tier) => {
        for (let i = 0; i < tier.count; i++) {
          captainTiers.push(tier);
        }
      });
    }

    // 4-2a) 캡틴 별 (유니폼 위 첫째 줄)
    if (captainTiers.length > 0) {
      const stars = captainTiers.slice(0, 9);
      const totalW2 = stars.reduce((sum, s) => sum + s.size * 2 + 0.5, 0);
      let currentX = cx - totalW2 / 2;
      const captainRowY = uTop - 9;
      stars.forEach((tier) => {
        const sx = currentX + tier.size;
        drawStar(ctx, sx, captainRowY, tier.size, tier.size * 0.45, tier.color, tier.stroke, 0.5);
        currentX += tier.size * 2 + 0.5;
      });
    }

    // 4-2b) 리그 우승 별 (블루, 캡틴 줄 위쪽)
    const lwins = leagueWinsByPlayer[pos.name] || [];
    if (lwins.length > 0) {
      const sCount = Math.min(lwins.length, 9);
      const starR = 6;
      const gap = starR * 2 + 1;
      const baseW = sCount * gap;
      // 캡틴 줄이 있으면 그 위, 없으면 유니폼 위
      const sy = captainTiers.length > 0 ? uTop - 22 : uTop - 9;
      for (let i = 0; i < sCount; i++) {
        const sx = cx - baseW / 2 + i * gap + gap / 2;
        drawStar(ctx, sx, sy, starR, starR * 0.45, '#29B6F6', 'rgba(0,0,0,0.6)', 0.6);
      }
    }

    // 4-4) 포지션 라벨은 drawJersey 내부에 통합됨 (별도 그리지 않음)

    // 4-5) 이름 (유니폼 아래)
    ctx.font = 'bold 9.5px sans-serif';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(pos.name || '', cx, uTop + uniformH + 8);
    ctx.fillStyle = 'white';
    ctx.fillText(pos.name || '', cx, uTop + uniformH + 8);

    // 4-6) 일별 우승팀 누적 메달 (이름 아래 작은 점)
    const dt = dailyTeamWinsByPlayer[pos.name] || 0;
    const medalColor = dailyTeamMedalColor(dt);
    if (medalColor) {
      ctx.fillStyle = medalColor;
      ctx.beginPath();
      ctx.arc(cx, uTop + uniformH + 16, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.stroke();
    }
  });

  // 5) Blob 생성
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 생성 실패'))),
      'image/png'
    );
  });
}

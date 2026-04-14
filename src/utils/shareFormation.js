import { getFormations } from '../config/formations';

function getPosColor(label) {
  if (label === 'GK') return '#FF9800';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DF'].includes(label)) return '#42A5F5';
  if (['CM', 'CDM', 'AM', 'LM', 'RM', 'MF', 'DM'].includes(label)) return '#66BB6A';
  return '#EF5350';
}

function fieldSvg(clubType, w, h) {
  const cx = w / 2, cy = h / 2;
  if (clubType === 'futsal') {
    return [
      `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="#2E7D32"/>`,
      `<rect x="${w * 0.05}" y="${h * 0.04}" width="${w * 0.9}" height="${h * 0.92}" rx="4" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
      `<line x1="${w * 0.05}" y1="${cy}" x2="${w * 0.95}" y2="${cy}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${h * 0.1}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
      `<rect x="${w * 0.25}" y="${h * 0.04}" width="${w * 0.5}" height="${h * 0.14}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>`,
      `<rect x="${w * 0.25}" y="${h * 0.82}" width="${w * 0.5}" height="${h * 0.14}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>`,
    ].join('');
  }
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="#388E3C"/>`,
    `<rect x="${w * 0.04}" y="${h * 0.03}" width="${w * 0.92}" height="${h * 0.94}" rx="2" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
    `<line x1="${w * 0.04}" y1="${cy}" x2="${w * 0.96}" y2="${cy}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${h * 0.08}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="2.5" fill="rgba(255,255,255,0.35)"/>`,
    `<rect x="${w * 0.2}" y="${h * 0.03}" width="${w * 0.6}" height="${h * 0.15}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>`,
    `<rect x="${w * 0.33}" y="${h * 0.03}" width="${w * 0.34}" height="${h * 0.06}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`,
    `<rect x="${w * 0.2}" y="${h * 0.82}" width="${w * 0.6}" height="${h * 0.15}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>`,
    `<rect x="${w * 0.33}" y="${h * 0.91}" width="${w * 0.34}" height="${h * 0.06}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`,
  ].join('');
}

function positionsSvg(positions, players, w, h, isFutsal) {
  const r = isFutsal ? 20 : 17;
  return positions.map((pos) => {
    const px = (pos.x / 100) * w;
    const py = (pos.y / 100) * h;
    const name = players[pos.id] || '';
    const color = getPosColor(pos.label);
    const displayName = name.length > 3 ? name.slice(0, 3) : name;
    let s = '';
    s += `<circle cx="${px}" cy="${py}" r="${r + 2}" fill="rgba(0,0,0,0.2)"/>`;
    s += `<circle cx="${px}" cy="${py}" r="${r}" fill="${color}" stroke="white" stroke-width="1.5"/>`;
    // 포지션 라벨
    s += `<text x="${px}" y="${name ? py - 5 : py}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${name ? 7.5 : 10}" font-weight="bold" font-family="sans-serif">${pos.label}</text>`;
    // 선수 이름
    if (name) {
      s += `<text x="${px}" y="${py + 5}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="8.5" font-weight="700" font-family="sans-serif">${displayName}</text>`;
    }
    return s;
  }).join('');
}

/**
 * 팀의 전체 쿼터 포메이션을 2열 그리드 이미지로 생성
 */
export async function shareFormationImage({
  clubType,
  teamLabel,
  date,
  quarterCount,
  quarterFormations,
  teamFormations,
  teamCode,
}) {
  const formations = getFormations(clubType);
  const isFutsal = clubType === 'futsal';

  const fieldW = 240;
  const fieldH = isFutsal ? fieldW * 1.35 : fieldW * 1.4;
  const cols = 2;
  const rows = Math.ceil(quarterCount / cols);
  const gap = 10;
  const padX = 14;
  const padY = 14;
  const headerH = 52;
  const labelH = 24;
  const footerH = 28;

  const totalW = padX * 2 + cols * fieldW + (cols - 1) * gap;
  const totalH = padY * 2 + headerH + rows * (labelH + fieldH) + (rows - 1) * gap + footerH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`;

  // 배경
  svg += `<rect width="${totalW}" height="${totalH}" rx="12" fill="#F5F5F5"/>`;

  // 헤더 배경
  svg += `<rect x="0" y="0" width="${totalW}" height="${headerH + padY}" rx="12" fill="#2D336B"/>`;
  svg += `<rect x="0" y="${headerH}" width="${totalW}" height="${padY}" fill="#2D336B"/>`;

  // 팀명 + 날짜
  svg += `<text x="${totalW / 2}" y="${padY + 20}" text-anchor="middle" font-size="17" font-weight="900" fill="white" font-family="sans-serif">${teamLabel}</text>`;
  svg += `<text x="${totalW / 2}" y="${padY + 40}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.7)" font-family="sans-serif">${date}</text>`;

  for (let q = 0; q < quarterCount; q++) {
    const col = q % cols;
    const row = Math.floor(q / cols);
    const x = padX + col * (fieldW + gap);
    const y = padY + headerH + row * (labelH + fieldH + gap);
    const qKey = `Q${q + 1}`;
    const qf = quarterFormations?.[teamCode]?.[qKey] || teamFormations?.[teamCode] || {};
    const fmId = qf.formationId;
    const fmDef = fmId ? formations[fmId] : null;
    const qPlayers = qf.players || {};
    // 라벨: 축구 = "Q1", 풋살 = "1경기"
    const displayLabel = clubType === 'football' ? qKey : `${q + 1}경기`;

    // 쿼터 라벨 배경
    svg += `<rect x="${x}" y="${y}" width="${fieldW}" height="${labelH}" rx="4" fill="#E8EAF6"/>`;
    svg += `<text x="${x + fieldW / 2}" y="${y + 15}" text-anchor="middle" font-size="12" font-weight="800" fill="#2D336B" font-family="sans-serif">${displayLabel}  ${fmId || ''}</text>`;

    // 필드
    const fy = y + labelH;
    svg += `<g transform="translate(${x},${fy})">`;
    svg += fieldSvg(clubType, fieldW, fieldH);
    if (fmDef) {
      svg += positionsSvg(fmDef.positions, qPlayers, fieldW, fieldH, isFutsal);
    } else {
      svg += `<text x="${fieldW / 2}" y="${fieldH / 2}" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.5)" font-size="13" font-family="sans-serif">-</text>`;
    }
    svg += `</g>`;
  }

  // 푸터
  svg += `<text x="${totalW / 2}" y="${totalH - 10}" text-anchor="middle" font-size="9" fill="#BBB" font-family="sans-serif">uri-league.web.app</text>`;

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
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('이미지 생성 실패'));
        },
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

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'logo.svg');

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);

  // logo512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'logo512.png'));
  console.log('logo512.png 생성 완료');

  // logo192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'logo192.png'));
  console.log('logo192.png 생성 완료');

  // favicon 32x32 → ico (png로 생성 후 ico 대체)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32.png'));

  // favicon.ico 대체 (48x48 png)
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  // apple-touch-icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('apple-touch-icon.png 생성 완료');

  // OG image (1200x630) - 축구장 아이콘 + 텍스트
  const ogWidth = 1200;
  const ogHeight = 630;
  const iconSize = 200;

  // 아이콘을 OG 이미지 중앙 상단에 배치
  const iconBuf = await sharp(svgBuffer)
    .resize(iconSize, iconSize)
    .png()
    .toBuffer();

  // OG 배경 SVG
  const ogSvg = `<svg width="${ogWidth}" height="${ogHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="${ogWidth}" y2="${ogHeight}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2D336B"/>
        <stop offset="1" stop-color="#1A1D4E"/>
      </linearGradient>
    </defs>
    <rect width="${ogWidth}" height="${ogHeight}" fill="url(#bg)"/>
    <text x="600" y="420" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="60" fill="white">우리들의 리그</text>
    <text x="600" y="480" text-anchor="middle" font-family="sans-serif" font-size="28" fill="rgba(255,255,255,0.6)">투표부터 MVP까지, 우리 팀의 모든 것</text>
    <text x="600" y="570" text-anchor="middle" font-family="sans-serif" font-size="22" fill="rgba(255,255,255,0.3)">uri-league.web.app</text>
  </svg>`;

  await sharp(Buffer.from(ogSvg))
    .composite([{
      input: iconBuf,
      top: 80,
      left: Math.round((ogWidth - iconSize) / 2),
    }])
    .png()
    .toFile(path.join(publicDir, 'og-image.png'));
  console.log('og-image.png 생성 완료');

  // logo192.svg (아이콘 전용 SVG 복사)
  fs.copyFileSync(svgPath, path.join(publicDir, 'logo192.svg'));
  fs.copyFileSync(svgPath, path.join(publicDir, 'logo512.svg'));
  console.log('SVG 아이콘 복사 완료');

  console.log('\n모든 아이콘 생성 완료!');
}

generateIcons().catch(console.error);

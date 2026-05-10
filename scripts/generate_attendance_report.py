"""
한강FC 회원 출석 현황 리포트 생성 (2026년 전체)
- 백업 JSON에서 PlayerSelectionByDate, MemberInfo 추출
- 회원별: 출석/불참/미정/무응답 + 첫·마지막 출석일 + 출석률 계산
- PNG 이미지 표로 출력
"""
import json
import os
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# ── 설정 ──
BACKUP = 'backups/prod-snapshot-20260510-after-josunghoon.json'
CLUB = '한강FC'
YEAR = '2026'
TODAY = '2026-05-10'
OUTPUT = 'backups/attendance_report_20260510_v3.png'

# ── 폰트 ──
def load_font(size, bold=False):
    candidates = [
        'C:/Windows/Fonts/malgunbd.ttf' if bold else 'C:/Windows/Fonts/malgun.ttf',
        'C:/Windows/Fonts/NanumGothicBold.ttf' if bold else 'C:/Windows/Fonts/NanumGothic.ttf',
        'C:/Windows/Fonts/gulim.ttc',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

# ── 데이터 로드 ──
with open(BACKUP, encoding='utf-8') as f:
    db = json.load(f)

members = db.get('MemberInfo', {}).get(CLUB, {})
psd = db.get('PlayerSelectionByDate', {}).get(CLUB, {})

# ── 2026년 일자만 ──
year_dates = sorted(d for d in psd.keys() if d.startswith(YEAR) and d <= TODAY)
total_dates = len(year_dates)

# ── 회원별 통계 계산 ──
def to_list(x):
    if isinstance(x, list): return [n for n in x if isinstance(n, str)]
    if isinstance(x, dict): return [v for v in x.values() if isinstance(v, str)]
    return []

stats = {}
for name in members.keys():
    stats[name] = {
        'name': name,
        'attend': 0,         # 출석 (AttandPlayer.all)
        'absent': 0,         # 불참 응답
        'undecided': 0,      # 미정
        'no_vote': 0,        # 무응답
        'first_attend': None,
        'last_attend': None,
        'last_vote_date': None,  # 마지막 어떤 형태로든 응답한 날
    }

for d in year_dates:
    day = psd[d] or {}
    att = set(to_list((day.get('AttandPlayer') or {}).get('all', [])))
    abs_set = set(to_list((day.get('AbsentPlayer') or {}).get('all', [])))
    und_set = set(to_list((day.get('UndecidedPlayer') or {}).get('all', [])))

    for name, s in stats.items():
        # 용병 표기 "(용병)" 제외하고 매칭
        is_attend = name in att or any(a.startswith(name + ' ') or a == name for a in att)
        if is_attend:
            s['attend'] += 1
            if s['first_attend'] is None: s['first_attend'] = d
            s['last_attend'] = d
            s['last_vote_date'] = d
        elif name in abs_set:
            s['absent'] += 1
            s['last_vote_date'] = d
        elif name in und_set:
            s['undecided'] += 1
            s['last_vote_date'] = d
        else:
            s['no_vote'] += 1

# ── 정렬: 출석 횟수 내림차순 → 출석률 → 이름 ──
rows = list(stats.values())
for r in rows:
    r['rate'] = (r['attend'] / total_dates * 100.0) if total_dates else 0.0
rows.sort(key=lambda r: (-r['attend'], -r['rate'], r['name']))

# ── 마지막 출석일로부터 경과일 ──
def days_since(date_str):
    if not date_str: return None
    try:
        d1 = datetime.strptime(date_str, '%Y-%m-%d')
        d2 = datetime.strptime(TODAY, '%Y-%m-%d')
        return (d2 - d1).days
    except Exception:
        return None

# ── 분류 (정리 의사결정용) ──
def categorize(r):
    if r['attend'] == 0 and r['no_vote'] >= total_dates * 0.8:
        return ('🔴 정리 후보', '#C62828')
    if r['attend'] == 0:
        return ('🟠 휴면', '#EF6C00')
    last_d = days_since(r['last_attend'])
    if last_d is not None and last_d <= 30:
        return ('🟢 활동중', '#2E7D32')
    if last_d is not None and last_d <= 60:
        return ('🟡 부분참여', '#F9A825')
    if last_d is not None and last_d <= 90:
        return ('🟠 휴면 의심', '#EF6C00')
    return ('🔴 정리 후보', '#C62828')

for r in rows:
    cat, color = categorize(r)
    r['category'] = cat
    r['cat_color'] = color
    r['days_no_attend'] = days_since(r['last_attend'])

# ── PNG 표 생성 ──
COL_HEADERS = [
    ('분류', 90),
    ('이름', 70),
    ('출석', 50),
    ('출석률', 70),
    ('불참', 50),
    ('미정', 50),
    ('무응답', 60),
    ('마지막 출석', 100),
    ('경과', 80),
]
COL_X = []
x = 16
for _, w in COL_HEADERS:
    COL_X.append(x); x += w
TOTAL_W = x + 16
ROW_H = 28
HEADER_H = 100
TABLE_HEAD_H = 36
SUMMARY_H = 60
FOOTER_H = 32
TOTAL_H = HEADER_H + TABLE_HEAD_H + len(rows) * ROW_H + SUMMARY_H + FOOTER_H + 16

img = Image.new('RGB', (TOTAL_W, TOTAL_H), '#FFFFFF')
d = ImageDraw.Draw(img)

font_h1 = load_font(22, bold=True)
font_h2 = load_font(13, bold=True)
font_b = load_font(12)
font_b_bold = load_font(12, bold=True)
font_s = load_font(10)
font_xs = load_font(9)

# ── 헤더 (그라데이션 효과 — 단순 직사각형 두 색) ──
d.rectangle([0, 0, TOTAL_W, HEADER_H], fill='#1A1D4E')
d.text((20, 14), f'⚽ {CLUB} 회원 출석 현황', fill='white', font=font_h1)
d.text((20, 50), f'{YEAR}년 (1/1 ~ {TODAY}) · 총 {total_dates}일 모임 · 회원 {len(rows)}명',
       fill='#B0BEC5', font=font_b)
d.text((20, 72), '🟢 활동중 (30일 내)  🟡 부분참여 (60일 내)  🟠 휴면 (90일 내)  🔴 정리후보',
       fill='#90A4AE', font=font_xs)

# ── 표 헤더 ──
y = HEADER_H
d.rectangle([0, y, TOTAL_W, y + TABLE_HEAD_H], fill='#37474F')
for (label, w), x_pos in zip(COL_HEADERS, COL_X):
    d.text((x_pos + 6, y + 10), label, fill='white', font=font_h2)
y += TABLE_HEAD_H

# ── 데이터 행 ──
for i, r in enumerate(rows):
    bg = '#F8F9FA' if i % 2 == 0 else '#FFFFFF'
    d.rectangle([0, y, TOTAL_W, y + ROW_H], fill=bg)

    # 분류 (컬러 텍스트)
    d.text((COL_X[0] + 6, y + 7), r['category'], fill=r['cat_color'], font=font_b_bold)
    # 이름
    d.text((COL_X[1] + 6, y + 7), r['name'], fill='#212121', font=font_b_bold)
    # 출석
    d.text((COL_X[2] + 6, y + 7), str(r['attend']), fill='#1565C0' if r['attend'] > 0 else '#999', font=font_b_bold)
    # 출석률
    rate_color = '#2E7D32' if r['rate'] >= 50 else ('#F9A825' if r['rate'] >= 20 else '#C62828')
    d.text((COL_X[3] + 6, y + 7), f"{r['rate']:.0f}%", fill=rate_color, font=font_b_bold)
    # 불참
    d.text((COL_X[4] + 6, y + 7), str(r['absent']), fill='#666', font=font_b)
    # 미정
    d.text((COL_X[5] + 6, y + 7), str(r['undecided']), fill='#666', font=font_b)
    # 무응답
    nv_color = '#C62828' if r['no_vote'] >= total_dates * 0.7 else '#666'
    d.text((COL_X[6] + 6, y + 7), str(r['no_vote']), fill=nv_color, font=font_b)
    # 마지막 출석
    last_attend_text = r['last_attend'] or '─'
    d.text((COL_X[7] + 6, y + 7), last_attend_text, fill='#212121' if r['last_attend'] else '#BDBDBD', font=font_b)
    # 미출석 일수
    if r['last_attend']:
        days_text = f"{r['days_no_attend']}일 전"
        days_color = '#2E7D32' if r['days_no_attend'] <= 30 else ('#F9A825' if r['days_no_attend'] <= 60 else '#C62828')
    else:
        days_text = '출석 없음'
        days_color = '#C62828'
    d.text((COL_X[8] + 6, y + 7), days_text, fill=days_color, font=font_b_bold)

    y += ROW_H

# ── 요약 (분류별 카운트) ──
from collections import Counter
cat_count = Counter(r['category'] for r in rows)

y += 8
d.rectangle([0, y, TOTAL_W, y + SUMMARY_H], fill='#ECEFF1')
d.text((20, y + 8), '📊 요약', fill='#1A1D4E', font=font_h2)
sx = 20
for cat in ['🟢 활동중', '🟡 부분참여', '🟠 휴면 의심', '🟠 휴면', '🔴 정리 후보']:
    cnt = cat_count.get(cat, 0)
    if cnt == 0: continue
    txt = f'{cat}: {cnt}명'
    d.text((sx, y + 32), txt, fill='#37474F', font=font_b_bold)
    # 텍스트 폭 계산
    bbox = d.textbbox((0, 0), txt, font=font_b_bold)
    sx += (bbox[2] - bbox[0]) + 28

# ── 푸터 ──
y += SUMMARY_H + 8
d.text((TOTAL_W // 2, y + 8), f'생성일 {TODAY} · 우리들의 리그 (uri-league.web.app)',
       fill='#90A4AE', font=font_xs, anchor='mm')

img.save(OUTPUT, optimize=True)
print(f'생성 완료: {OUTPUT}')
print(f'크기: {TOTAL_W} x {TOTAL_H}')
print(f'회원 수: {len(rows)}명')
print(f'\n분류별 인원:')
for cat in ['🟢 활동중', '🟡 부분참여', '🟠 휴면 의심', '🟠 휴면', '🔴 정리 후보']:
    cnt = cat_count.get(cat, 0)
    if cnt > 0:
        print(f'  {cat}: {cnt}명')

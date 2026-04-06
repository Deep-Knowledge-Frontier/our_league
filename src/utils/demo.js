// 데모 모드: 선수 이름 익명화 유틸리티
const SURNAMES = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','전'];
const GIVEN = ['민준','서준','도윤','예준','시우','하준','주원','지호','지후','준서','현우','도현','건우','우진','선우','서진','연우','유준','정우','승현'];

export const DEMO_CLUB = '한강FC';

export function createNameMap(realNames) {
  const map = {};
  const shuffled = [...GIVEN].sort(() => Math.random() - 0.5);
  realNames.forEach((name, i) => {
    map[name] = `${SURNAMES[i % SURNAMES.length]}${shuffled[i % shuffled.length]}`;
  });
  return map;
}

export function anonymize(str, nameMap) {
  if (!str || !nameMap) return str;
  let result = str;
  Object.entries(nameMap).forEach(([real, fake]) => { result = result.split(real).join(fake); });
  return result;
}

export function anonymizeMatch(m, nameMap) {
  if (!m || !nameMap) return m;
  return { ...m, mvp: anonymize(m.mvp, nameMap), myTeam: null };
}

// 포메이션 프리셋 정의
// x: 0-100 (좌→우), y: 0-100 (상=공격, 하=수비/GK)

export const FUTSAL_FORMATIONS = {
  '1-3-1': {
    name: '1-3-1',
    label: '1-3-1 (기본)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 88 },
      { id: 'DF', label: 'DF', x: 50, y: 68 },
      { id: 'LM', label: 'LM', x: 20, y: 42 },
      { id: 'CM', label: 'CM', x: 50, y: 42 },
      { id: 'RM', label: 'RM', x: 80, y: 42 },
      { id: 'FW', label: 'FW', x: 50, y: 18 },
    ],
  },
  '2-2-1': {
    name: '2-2-1',
    label: '2-2-1 (밸런스)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 88 },
      { id: 'LB', label: 'LB', x: 30, y: 65 },
      { id: 'RB', label: 'RB', x: 70, y: 65 },
      { id: 'LW', label: 'LW', x: 28, y: 38 },
      { id: 'RW', label: 'RW', x: 72, y: 38 },
      { id: 'FW', label: 'FW', x: 50, y: 18 },
    ],
  },
  '2-1-2': {
    name: '2-1-2',
    label: '2-1-2 (공격형)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 88 },
      { id: 'LB', label: 'LB', x: 30, y: 65 },
      { id: 'RB', label: 'RB', x: 70, y: 65 },
      { id: 'MF', label: 'MF', x: 50, y: 42 },
      { id: 'LF', label: 'LF', x: 30, y: 18 },
      { id: 'RF', label: 'RF', x: 70, y: 18 },
    ],
  },
  '3-1-1': {
    name: '3-1-1',
    label: '3-1-1 (수비형)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 88 },
      { id: 'LB', label: 'LB', x: 22, y: 65 },
      { id: 'CB', label: 'CB', x: 50, y: 68 },
      { id: 'RB', label: 'RB', x: 78, y: 65 },
      { id: 'MF', label: 'MF', x: 50, y: 40 },
      { id: 'FW', label: 'FW', x: 50, y: 18 },
    ],
  },
};

export const FOOTBALL_FORMATIONS = {
  '4-3-3': {
    name: '4-3-3',
    label: '4-3-3 (공격형)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'LB', label: 'LB', x: 15, y: 73 },
      { id: 'CB1', label: 'CB', x: 37, y: 77 },
      { id: 'CB2', label: 'CB', x: 63, y: 77 },
      { id: 'RB', label: 'RB', x: 85, y: 73 },
      { id: 'CM1', label: 'CM', x: 30, y: 52 },
      { id: 'CM2', label: 'CM', x: 50, y: 56 },
      { id: 'CM3', label: 'CM', x: 70, y: 52 },
      { id: 'LW', label: 'LW', x: 18, y: 26 },
      { id: 'ST', label: 'ST', x: 50, y: 18 },
      { id: 'RW', label: 'RW', x: 82, y: 26 },
    ],
  },
  '4-4-2': {
    name: '4-4-2',
    label: '4-4-2 (밸런스)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'LB', label: 'LB', x: 15, y: 73 },
      { id: 'CB1', label: 'CB', x: 37, y: 77 },
      { id: 'CB2', label: 'CB', x: 63, y: 77 },
      { id: 'RB', label: 'RB', x: 85, y: 73 },
      { id: 'LM', label: 'LM', x: 18, y: 50 },
      { id: 'CM1', label: 'CM', x: 40, y: 54 },
      { id: 'CM2', label: 'CM', x: 60, y: 54 },
      { id: 'RM', label: 'RM', x: 82, y: 50 },
      { id: 'ST1', label: 'ST', x: 38, y: 22 },
      { id: 'ST2', label: 'ST', x: 62, y: 22 },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    label: '3-5-2 (미드필드)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'CB1', label: 'CB', x: 25, y: 77 },
      { id: 'CB2', label: 'CB', x: 50, y: 80 },
      { id: 'CB3', label: 'CB', x: 75, y: 77 },
      { id: 'LWB', label: 'LWB', x: 10, y: 52 },
      { id: 'CM1', label: 'CM', x: 35, y: 55 },
      { id: 'CM2', label: 'CM', x: 50, y: 48 },
      { id: 'CM3', label: 'CM', x: 65, y: 55 },
      { id: 'RWB', label: 'RWB', x: 90, y: 52 },
      { id: 'ST1', label: 'ST', x: 38, y: 22 },
      { id: 'ST2', label: 'ST', x: 62, y: 22 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    label: '4-2-3-1 (수비형)',
    positions: [
      { id: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'LB', label: 'LB', x: 15, y: 73 },
      { id: 'CB1', label: 'CB', x: 37, y: 77 },
      { id: 'CB2', label: 'CB', x: 63, y: 77 },
      { id: 'RB', label: 'RB', x: 85, y: 73 },
      { id: 'CDM1', label: 'CDM', x: 38, y: 58 },
      { id: 'CDM2', label: 'CDM', x: 62, y: 58 },
      { id: 'LW', label: 'LW', x: 18, y: 36 },
      { id: 'AM', label: 'AM', x: 50, y: 33 },
      { id: 'RW', label: 'RW', x: 82, y: 36 },
      { id: 'ST', label: 'ST', x: 50, y: 16 },
    ],
  },
};

export function getFormations(clubType) {
  return clubType === 'futsal' ? FUTSAL_FORMATIONS : FOOTBALL_FORMATIONS;
}

export function getDefaultFormation(clubType) {
  return clubType === 'futsal' ? '1-3-1' : '4-3-3';
}

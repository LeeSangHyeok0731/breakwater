/** 공용 패시브 트리: 무기와 상관없이 항상 적용된다. 스킬 포인트 1로 1단계씩 올린다. */
export interface PassiveDef {
  id: string;
  name: string;
  maxRank: number;
  reqLevel: number;
  /** 단계당 효과 설명 */
  desc: string;
}

export const PASSIVES: PassiveDef[] = [
  {
    id: 'mana_flow',
    name: '마력 순환',
    maxRank: 3,
    reqLevel: 1,
    desc: '단계마다 힘의 10%만큼 마력이 늘어난다. 늘어난 마력은 최대 마나와 마나 회복에만 적용된다.',
  },
  {
    id: 'wind_breath',
    name: '바람의 호흡',
    maxRank: 3,
    reqLevel: 1,
    desc: '단계마다 민첩의 10%만큼 마력이 늘어난다. 늘어난 마력은 최대 마나와 마나 회복에만 적용된다.',
  },
  {
    id: 'tough_body',
    name: '강인한 육체',
    maxRank: 3,
    reqLevel: 1,
    desc: '단계마다 최대 HP가 6% 늘어난다.',
  },
  {
    id: 'meditation',
    name: '명상',
    maxRank: 3,
    reqLevel: 1,
    desc: '단계마다 마나 회복 속도가 15% 빨라진다.',
  },
  {
    id: 'swiftness',
    name: '신속',
    maxRank: 3,
    reqLevel: 2,
    desc: '단계마다 이동속도가 4% 늘어난다. 스탯 이동속도의 상한과 별개로 적용된다.',
  },
  {
    id: 'evasion',
    name: '회피 숙련',
    maxRank: 2,
    reqLevel: 2,
    desc: '단계마다 구르기 대기 시간이 15% 줄어든다.',
  },
  {
    id: 'keen_sense',
    name: '날카로운 감각',
    maxRank: 3,
    reqLevel: 3,
    desc: '단계마다 치명타 확률이 2% 늘어난다. 총은 치명타 보정으로 들어간다.',
  },
  {
    id: 'parry_master',
    name: '패링 숙련',
    maxRank: 1,
    reqLevel: 4,
    desc: '패링 판정 시간이 0.1초 길어지고, 패링에 성공하면 마나를 15 더 회복한다.',
  },
];

export const PASSIVE_BY_ID: Record<string, PassiveDef> = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));

export interface PassiveBonus {
  strToInt: number;
  dexToInt: number;
  hpMul: number;
  regenMul: number;
  speedMul: number;
  critBonus: number;
  dodgeCdMul: number;
  parryWindow: number;
  parryMana: number;
}

export function passiveBonus(ranks: Record<string, number>): PassiveBonus {
  const r = (id: string): number => Math.min(ranks[id] ?? 0, PASSIVE_BY_ID[id]?.maxRank ?? 0);
  return {
    strToInt: 0.1 * r('mana_flow'),
    dexToInt: 0.1 * r('wind_breath'),
    hpMul: 0.06 * r('tough_body'),
    regenMul: 0.15 * r('meditation'),
    speedMul: 0.04 * r('swiftness'),
    critBonus: 0.02 * r('keen_sense'),
    dodgeCdMul: 1 - 0.15 * r('evasion'),
    parryWindow: 0.1 * r('parry_master'),
    parryMana: 15 * r('parry_master'),
  };
}

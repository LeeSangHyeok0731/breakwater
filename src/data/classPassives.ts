import type { WeaponType } from './weapons';

/**
 * 직업 패시브 [초안]: 레벨이 오르면 저절로 배우고 단계가 오른다. 무기와 상관없이 늘 적용된다.
 * 가장 높은 기본 스탯이 그 캐릭터의 계열을 정하고, 그 계열의 패시브 하나만 켜진다
 * (힘 → 근접, 민첩 → 사격, 마력 → 마법). 그래서 여러 패시브가 겹쳐 같은 스탯을 두 번 받지 않는다.
 * 늘어난 스탯은 장비·분배까지 더한 스탯에서 계산하고, 늘어난 스탯끼리 다시 늘리지는 않는다.
 */

export type ClassLine = 'melee' | 'ranged' | 'magic';

export interface ClassPassiveDef {
  line: ClassLine;
  name: string;
  /** 이 패시브를 쓰는 직업 (무기 종류) */
  classes: WeaponType[];
  /** 계열을 정하는 스탯 */
  stat: 'str' | 'dex' | 'int';
  /** 단계 설명 (비율 r을 받는다) */
  desc: (r: number) => string;
}

/** 단계별 [필요 레벨, 전환 비율] */
export const CLASS_PASSIVE_TIERS: [number, number][] = [
  [10, 0.2],
  [30, 0.35],
  [50, 0.5],
];

const pct = (r: number): string => `${Math.round(r * 100)}%`;

export const CLASS_PASSIVES: ClassPassiveDef[] = [
  { line: 'melee', name: '투기 순환', classes: ['sword', 'dao'], stat: 'str', desc: (r) => `힘의 ${pct(r)}만큼 마력이 늘어난다.` },
  { line: 'ranged', name: '사냥꾼의 직감', classes: ['bow', 'gun'], stat: 'dex', desc: (r) => `민첩과 힘을 더한 값의 ${pct(r)}만큼 마력이, 민첩의 ${pct(r)}만큼 힘이 늘어난다.` },
  { line: 'magic', name: '마력 공명', classes: ['staff'], stat: 'int', desc: (r) => `마력의 ${pct(r)}만큼 힘과 민첩이 각각 늘어난다.` },
];

export interface StatLike {
  str: number;
  dex: number;
  int: number;
}

/** 레벨에 따른 단계 (0이면 아직 없음)와 전환 비율 */
export function classPassiveTier(level: number): { tier: number; rate: number } {
  let tier = 0;
  let rate = 0;
  CLASS_PASSIVE_TIERS.forEach(([lv, r], i) => {
    if (level >= lv) {
      tier = i + 1;
      rate = r;
    }
  });
  return { tier, rate };
}

/** 가장 높은 기본 스탯으로 계열을 정한다. 같으면 힘 → 민첩 → 마력 순. */
export function classLineOf(s: StatLike): ClassLine {
  if (s.str >= s.dex && s.str >= s.int) return 'melee';
  if (s.dex >= s.int) return 'ranged';
  return 'magic';
}

export interface ClassPassiveBonus {
  def: ClassPassiveDef;
  tier: number;
  rate: number;
  add: StatLike;
}

/**
 * 총 숙련 (모든 직업 패시브에 붙는다): 총은 스탯이 피해에 반영되지 않고 치명타 확률·피해로 강해지므로,
 * 총을 쓸 때만 주 스탯 × 비율 %만큼 치명타 피해, 비율의 10%만큼 치명타 확률이 늘어난다.
 * 주 스탯은 가장 높은 스탯이다 (직업 패시브로 늘어난 스탯은 주 스탯을 넘지 않는다).
 */
export function gunCritBonus(s: StatLike, level: number): { chance: number; damage: number } {
  const { rate } = classPassiveTier(level);
  const main = Math.max(s.str, s.dex, s.int);
  return { chance: rate * 0.1, damage: (main * rate) / 100 };
}

/** 이 스탯과 레벨에서 켜지는 직업 패시브와 늘어나는 스탯 */
export function classPassiveBonus(s: StatLike, level: number): ClassPassiveBonus {
  const def = CLASS_PASSIVES.find((p) => p.line === classLineOf(s))!;
  const { tier, rate } = classPassiveTier(level);
  const add: StatLike = { str: 0, dex: 0, int: 0 };
  if (def.line === 'melee') add.int = Math.floor(s.str * rate);
  else if (def.line === 'ranged') {
    add.int = Math.floor((s.dex + s.str) * rate);
    add.str = Math.floor(s.dex * rate);
  }
  else {
    add.str = Math.floor(s.int * rate);
    add.dex = Math.floor(s.int * rate);
  }
  return { def, tier, rate, add };
}

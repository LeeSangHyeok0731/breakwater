import type { SaveData } from '../core/save';
import type { WeaponDef, WeaponType } from '../data/weapons';
import { passiveBonus, type PassiveBonus } from '../data/passives';

export interface Stats {
  str: number;
  dex: number;
  int: number;
  hp: number;
}

export const BASE_STAT = 10;
export const STAT_POINTS_PER_LEVEL = 5;
/** 치명타 시 원래 피해에서 200% 추가 (최종 ×3) */
export const CRIT_DAMAGE = 2.0;
/** 스탯으로 얻는 이동속도 증가 상한 */
export const DEX_SPEED_CAP = 0.5;

export function totalStats(save: SaveData): Stats {
  const auto = BASE_STAT + (save.level - 1);
  return {
    str: auto + save.allocated.str,
    dex: auto + save.allocated.dex,
    int: auto + save.allocated.int,
    hp: auto + save.allocated.hp,
  };
}

export interface Derived {
  maxHp: number;
  maxMp: number;
  mpRegen: number;
  /** 스탯으로 정해지는 이동속도 (상한 적용). 스킬·패시브 보너스는 따로 더한다. */
  moveSpeed: number;
  /** 마나 계산에 쓰는 마력 (스탯 전환 패시브 포함) */
  manaInt: number;
  passive: PassiveBonus;
}

export function derive(s: Stats, passives: Record<string, number> = {}): Derived {
  const pb = passiveBonus(passives);
  // 전환 패시브로 얻은 마력은 마나에만 쓴다. 마법 피해에는 원래 마력만 반영된다.
  const manaInt = s.int + s.str * pb.strToInt + s.dex * pb.dexToInt;
  return {
    maxHp: Math.round((100 + s.hp * 10) * (1 + pb.hpMul)),
    maxMp: Math.round(50 + manaInt * 5),
    mpRegen: (2 + manaInt * 0.05) * (1 + pb.regenMul),
    moveSpeed: 5 * (1 + Math.min(s.dex * 0.005, DEX_SPEED_CAP)),
    manaInt,
    passive: pb,
  };
}

export function enhanceMultiplier(type: WeaponType, level: number): number {
  return Math.pow(type === 'gun' ? 1.15 : 1.08, level);
}

export function statScaling(type: WeaponType, s: Stats): number {
  switch (type) {
    case 'sword':
    case 'dao':
      return s.str;
    case 'bow':
      return s.dex * 0.7 + s.str * 0.3;
    case 'staff':
      return s.int;
    case 'gun':
      return 0;
  }
}

/** 기본 피해 = 무기 공격력 × 강화 배율 × (1 + 스탯 반영치 / 100) */
export function basicDamage(def: WeaponDef, enhance: number, s: Stats): number {
  return def.attack * enhanceMultiplier(def.type, enhance) * (1 + statScaling(def.type, s) / 100);
}

export function expToNext(level: number): number {
  return Math.round(100 * Math.pow(1.15, level - 1));
}

/** 경험치를 더하고 올라간 레벨 수를 돌려준다. */
export function addExp(save: SaveData, amount: number): number {
  save.exp += amount;
  let gained = 0;
  while (save.exp >= expToNext(save.level)) {
    save.exp -= expToNext(save.level);
    save.level++;
    save.statPoints += STAT_POINTS_PER_LEVEL;
    save.skillPoints += 1;
    gained++;
  }
  return gained;
}

export function resetCost(level: number): number {
  return level * 100;
}

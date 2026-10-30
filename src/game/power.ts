import type { SaveData } from '../core/save';
import { gearBonus } from '../data/gear';
import { PHASES } from '../data/phases';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { BASE_STAT, CRIT_DAMAGE, STAT_POINTS_PER_LEVEL, basicDamage, derive, enhanceMultiplier, expToNext, totalStats, type Stats } from './stats';

/**
 * 전투력 [초안]: 100 × √(한 방 기대 피해 × 최대 HP).
 * 공격과 체력 중 하나만 2배가 되면 √2배라서, 둘을 고르게 키울수록 더 많이 오른다.
 */
function powerOf(hit: number, maxHp: number): number {
  return Math.round(100 * Math.sqrt(Math.max(0, hit) * Math.max(0, maxHp)));
}

/** 치명타까지 반영한 한 방 기대 피해. 총은 치명타 대신 항상 오르는 규칙을 쓴다 (battleScene과 같다). */
function expectedHit(def: WeaponDef, enhance: number, s: Stats, critBonus: number): number {
  const c = Math.min(1, def.critChance + critBonus);
  const mul = def.type === 'gun' ? 1 + (CRIT_DAMAGE + c) * 0.8 : 1 + c * CRIT_DAMAGE;
  return basicDamage(def, enhance, s) * mul;
}

/** 내 전투력: 장착한 두 무기 중 센 쪽 기준 */
export function combatPower(save: SaveData): number {
  const stats = totalStats(save);
  const d = derive(stats, save.passives, gearBonus(save.gear.equipped));
  let hit = 0;
  for (const uid of save.equipped) {
    const w = save.weapons.find((o) => o.uid === uid);
    const def = w && WEAPONS[w.defId];
    if (def) hit = Math.max(hit, expectedHit(def, w.enhance, stats, d.passive.critBonus));
  }
  return powerOf(hit, d.maxHp);
}

/**
 * 챕터별 예상 무기 [초안]: 검 기준 공격력과, 챕터 첫 페이즈 → 마지막 페이즈의 강화 수치.
 * 챕터 안에서는 강화가 고르게 오른다.
 */
const EXPECTED_WEAPON: Record<number, { attack: number; enhance: [number, number] }> = {
  1: { attack: 20, enhance: [0, 3] },
  2: { attack: 32, enhance: [2, 5] },
  3: { attack: 48, enhance: [3, 6] },
  4: { attack: 70, enhance: [2, 5] },
  5: { attack: 70, enhance: [5, 9] },
};
/** 분배 포인트 중 주 스탯에 넣는 비율 (나머지는 체력) */
const MAIN_STAT_SHARE = 0.8;
const BOSS_POWER_MUL = 1.1;

/** 그 페이즈에 막 도착한 평범한 캐릭터의 전투력 */
function expectedPower(level: number, chapter: number, progress: number, boss: boolean): number {
  const auto = BASE_STAT + (level - 1);
  const points = STAT_POINTS_PER_LEVEL * (level - 1);
  const main = Math.round(points * MAIN_STAT_SHARE);
  const s: Stats = { str: auto + main, dex: auto, int: auto, hp: auto + points - main };
  const w = EXPECTED_WEAPON[chapter] ?? EXPECTED_WEAPON[5];
  const enhance = Math.round(w.enhance[0] + (w.enhance[1] - w.enhance[0]) * progress);
  // 검: 치명타 5%, 힘이 그대로 반영된다.
  const hit = w.attack * enhanceMultiplier('sword', enhance) * (1 + s.str / 100) * (1 + 0.05 * CRIT_DAMAGE);
  return Math.round(powerOf(hit, derive(s).maxHp) * (boss ? BOSS_POWER_MUL : 1));
}

let recommended: Map<string, number> | null = null;

/** 페이즈 권장 전투력. 레벨은 앞 페이즈들을 한 번씩 깼을 때의 레벨로 잡는다. */
export function recommendedPower(phaseId: string): number {
  if (!recommended) {
    recommended = new Map();
    let level = 1;
    let exp = 0;
    for (const p of PHASES) {
      const list = PHASES.filter((q) => q.chapter === p.chapter);
      const progress = list.length > 1 ? list.indexOf(p) / (list.length - 1) : 0;
      recommended.set(p.id, expectedPower(level, p.chapter, progress, p.type === 'boss'));
      exp += p.clearReward.exp;
      while (exp >= expToNext(level)) {
        exp -= expToNext(level);
        level++;
      }
    }
  }
  return recommended.get(phaseId) ?? 0;
}

export interface PowerVerdict {
  label: string;
  /** CSS 클래스 이름 */
  cls: 'easy' | 'fair' | 'risky' | 'deadly';
}

/** 내 전투력 ÷ 권장 전투력으로 판정한다. */
export function powerVerdict(mine: number, need: number): PowerVerdict {
  const r = need > 0 ? mine / need : 99;
  if (r >= 1.2) return { label: '여유', cls: 'easy' };
  if (r >= 0.9) return { label: '적정', cls: 'fair' };
  if (r >= 0.7) return { label: '위험', cls: 'risky' };
  return { label: '매우 위험', cls: 'deadly' };
}

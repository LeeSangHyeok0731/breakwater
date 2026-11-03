import type { SaveData } from '../core/save';
import { ARMOR_SLOTS, CD_REDUCE_CAP, DAMAGE_REDUCE_CAP, GEAR, gearBonus, SETS, type GearSlot, type GearStats, type SetLine } from './gear';
import type { PhaseDef } from './phases';
import { GRADES, WEAPONS, type WeaponType } from './weapons';

/**
 * 마왕 레이드: 군단장 기지의 마왕성 문으로 들어간다 (docs/superpowers/specs/2026-11-03-demon-king-raid-design.md).
 * 마왕이 공격 스탯을 봉인하고, 페이즈마다 약점 무기가 바뀐다. 무기 5자루를 Tab으로 돌리고 방어구 세 벌을 한꺼번에 입는다.
 */

/** 마왕성 문이 열리는 조건 */
export const RAID_UNLOCK_PHASE = '10-5';
export const RAID_BOSS = 'demon_lord_raid' as const;
export const RAID_ESSENCE = 'demon_essence';

/** [초안] 봉인 단계: 피해 계산에 쓰는 힘·민첩·마력 비율. 해제 기믹에 성공할 때마다 한 단계 오른다. */
export const SEAL_STAGES = [0.1, 0.25, 0.5, 1];
/** [초안] 약점 무기 / 다른 무기 피해 배율 */
export const WEAK_MUL = 3;
export const OFF_MUL = 0.3;
/** 봉인 해제 기믹이 나오는 체력 비율 */
export const RAID_PHASE_AT = [0.75, 0.5, 0.25];
/** [초안] 봉인의 결정: 개수, 결정당 맞아야 하는 횟수, 제한 시간 */
export const CRYSTAL_COUNT = 3;
export const CRYSTAL_HITS = 8;
export const CRYSTAL_TIME = 15;
/** [초안] 해제 성공 시 그로기 (받는 피해 200%) */
export const RAID_GROGGY = 5;
/** [초안] 해제 실패 시 심판 예고 */
export const RAID_JUDGE_WARN = 2.2;
/** [초안] 제한 시간 (초) */
export const RAID_TIME = 360;
/** [초안] 마지막 페이즈 광폭화: 패턴 대기 시간 배율 */
export const RAID_ENRAGE_PACE = 0.8;

/** Tab으로 도는 무기 순서 */
export const RAID_WEAPON_ORDER: WeaponType[] = ['sword', 'dao', 'bow', 'gun', 'staff'];
export const RAID_LINES: SetLine[] = ['melee', 'ranged', 'magic'];

export type RaidDifficulty = 'normal' | 'hard';

export interface RaidDifficultyDef {
  name: string;
  hpMul: number;
  dmgMul: number;
  /** 패턴 대기 시간 배율 (작을수록 빠르다) */
  pace: number;
  /** 마왕의 정수 [최소, 최대] (PR 3에서 신화 보상으로 바뀐다) */
  essence: [number, number];
}

/** [초안] 난이도 */
export const RAID_DIFFICULTY: Record<RaidDifficulty, RaidDifficultyDef> = {
  normal: { name: '노멀', hpMul: 1, dmgMul: 1, pace: 1, essence: [3, 5] },
  hard: { name: '하드', hpMul: 2.5, dmgMul: 1.6, pace: 0.8, essence: [9, 13] },
};

export type RaidArmor = Record<SetLine, Partial<Record<GearSlot, string>>>;

export interface RaidLoadout {
  /** 종류마다 무기 하나 (uid). 비면 그 종류 없이 들어간다. */
  weapons: Partial<Record<WeaponType, string>>;
  /** 근접·사격·마법 줄마다 방어구 4칸 */
  armor: RaidArmor;
}

/** 출격 정보: 전투 씬에 넘긴다. */
export interface RaidRun {
  difficulty: RaidDifficulty;
  /** 들고 가는 무기 uid (RAID_WEAPON_ORDER 순서, 빈 종류는 빠진다) */
  weapons: string[];
  armor: RaidArmor;
}

const gradeRank = (g: string): number => Object.keys(GRADES).indexOf(g);

/** 그 종류에서 가장 센 무기 (등급 → 강화 순) */
function bestWeapon(save: SaveData, type: WeaponType): string | undefined {
  return save.weapons
    .filter((w) => WEAPONS[w.defId]?.type === type)
    .sort((a, b) => gradeRank(WEAPONS[b.defId].grade) - gradeRank(WEAPONS[a.defId].grade) || b.enhance - a.enhance)[0]?.uid;
}

/**
 * 저장된 레이드 장비를 확인하고 빈 칸은 기본값으로 채운다.
 * 무기: 종류마다 가장 센 무기. 방어구: 줄마다 그 계열 세트 중 등급이 가장 높은 보유 부위 (한 방어구는 한 칸에만).
 */
export function raidLoadout(save: SaveData): RaidLoadout {
  const saved = save.raid.loadout;
  const weapons: Partial<Record<WeaponType, string>> = {};
  for (const type of RAID_WEAPON_ORDER) {
    const uid = saved?.weapons[type];
    const ok = uid !== undefined && WEAPONS[save.weapons.find((w) => w.uid === uid)?.defId ?? '']?.type === type;
    // 일부러 비워 둔 칸('')은 그대로 둔다.
    if (uid === '') weapons[type] = '';
    else weapons[type] = ok ? uid : bestWeapon(save, type);
  }

  const used = new Set<string>();
  const armor: RaidArmor = { melee: {}, ranged: {}, magic: {} };
  // 먼저 저장된 칸 중 유효한 것을 넣는다.
  for (const line of RAID_LINES) {
    for (const slot of ARMOR_SLOTS) {
      const id = saved?.armor[line]?.[slot];
      if (id === '') armor[line][slot] = '';
      else if (id && save.gear.owned.includes(id) && GEAR[id]?.slot === slot && !used.has(id)) {
        armor[line][slot] = id;
        used.add(id);
      }
    }
  }
  // 빈 칸은 그 계열 세트 중 가장 높은 등급의 보유 부위로.
  for (const line of RAID_LINES) {
    const sets = Object.values(SETS)
      .filter((s) => s.line === line)
      .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade));
    for (const slot of ARMOR_SLOTS) {
      if (armor[line][slot] !== undefined) continue;
      const id = sets.map((s) => `${s.id}_${slot}`).find((x) => save.gear.owned.includes(x) && !used.has(x));
      if (id) {
        armor[line][slot] = id;
        used.add(id);
      }
    }
  }
  return { weapons, armor };
}

/** 들고 가는 무기 uid (Tab 순서) */
export function raidWeaponUids(lo: RaidLoadout): string[] {
  return RAID_WEAPON_ORDER.map((t) => lo.weapons[t]).filter((uid): uid is string => !!uid);
}

/** 방어구 세 벌 + 장신구의 보너스. 세트·강화 합 효과는 줄마다 따로 켜진다. 감소 상한은 합친 뒤 한 번. */
export function raidGearBonus(save: SaveData, armor: RaidArmor): Required<GearStats> {
  const acc: Partial<Record<GearSlot, string>> = { ring: save.gear.equipped.ring, necklace: save.gear.equipped.necklace };
  const parts = [gearBonus(acc, save.gear.enhance), ...RAID_LINES.map((line) => gearBonus(armor[line], save.gear.enhance))];
  const total = parts[0];
  for (const p of parts.slice(1)) for (const k of Object.keys(total) as (keyof GearStats)[]) total[k] += p[k];
  total.damageReduce = Math.min(total.damageReduce, DAMAGE_REDUCE_CAP);
  total.cdReduce = Math.min(total.cdReduce, CD_REDUCE_CAP);
  return total;
}

/** 레이드 전투용 페이즈 (전투 씬은 페이즈 정보로 맵을 만든다. 보스는 RaidFight가 세운다.) */
export function raidPhase(run: RaidRun): PhaseDef {
  const diff = RAID_DIFFICULTY[run.difficulty];
  return {
    id: 'R-demon',
    name: `종언의 마왕 · ${diff.name}`,
    type: 'boss',
    chapter: 0,
    desc: '마왕이 스탯을 봉인한다. 약점 무기로 치고, 봉인의 결정을 깨 힘을 되찾아라.',
    hpMul: diff.hpMul,
    dmgMul: diff.dmgMul,
    width: 1100,
    platforms: [],
    theme: 'throne',
    waves: [],
    clearReward: { gold: 0, exp: 0, materials: {}, sweepTickets: 0 },
  };
}

/** [초안] 임시 보상: 마왕의 정수 (PR 3에서 신화 장비로 바뀐다) */
export function raidReward(run: RaidRun): Record<string, number> {
  const [lo, hi] = RAID_DIFFICULTY[run.difficulty].essence;
  return { [RAID_ESSENCE]: lo + Math.floor(Math.random() * (hi - lo + 1)) };
}

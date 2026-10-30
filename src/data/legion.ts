import type { SetLine } from './gear';
import type { MonsterKind } from './monsters';
import type { PhaseDef } from './phases';
import type { WeaponType } from './weapons';

/**
 * 군단장: 전투 기지에서 도전하는 강력한 보스. 세트 방어구 계열마다 하나씩 있고,
 * 그 계열 무기로만 도전할 수 있다. 잡으면 조각을 주고, 조각으로 세트 방어구를 사고 강화한다.
 */

export type LegionId = 'knight' | 'elf' | 'darklord';
export type LegionDifficulty = 'normal' | 'hard';

export interface LegionDef {
  id: LegionId;
  name: string;
  title: string;
  line: SetLine;
  /** 도전할 수 있는 무기 종류 */
  weapons: WeaponType[];
  monster: MonsterKind;
  /** 잡으면 주는 조각 (재료 id) */
  shard: string;
  /** 보스의 기믹 설명 (작전 지휘관 창에 보인다) */
  gimmick: string;
  /** 아직 만들지 않은 군단장 */
  locked?: boolean;
}

export const LEGIONS: Record<LegionId, LegionDef> = {
  knight: {
    id: 'knight',
    name: '침묵의 기사단장',
    title: '근접 군단장',
    line: 'melee',
    weapons: ['sword', 'dao'],
    monster: 'silent_knight',
    shard: 'silence_shard',
    gimmick: '보라색 공격에 맞으면 잠시 스킬을 쓸 수 없고 침묵 스택이 쌓인다. 스택이 가득 차면 즉사한다.',
  },
  elf: {
    id: 'elf',
    name: '타락한 엘프',
    title: '원거리 군단장',
    line: 'ranged',
    weapons: ['bow', 'gun'],
    monster: 'silent_knight',
    shard: 'corrupt_shard',
    gimmick: '패턴이 끝나면 파란 화살을 쏜다. 가드키로 패링하면 엘프가 잠시 멈추고 피해를 2배로 받는다.',
    locked: true,
  },
  darklord: {
    id: 'darklord',
    name: '암흑의 군주',
    title: '마법 군단장',
    line: 'magic',
    weapons: ['staff'],
    monster: 'silent_knight',
    shard: 'dark_shard',
    gimmick: '피해를 받을 때마다 20회 보호막을 두르고 중앙에서 한쪽 절반을 즉사 공격한다. 보호막을 깨면 그로기.',
    locked: true,
  },
};

export const LEGION_ORDER: LegionId[] = ['knight', 'elf', 'darklord'];

/** 전투 기지가 열리는 조건 */
export const LEGION_UNLOCK_PHASE = '5-5';
export const HOPE_SHARD = 'hope_shard';

export interface DifficultyDef {
  name: string;
  hpMul: number;
  dmgMul: number;
  /** 패턴 속도 (대기 시간에 곱한다, 작을수록 빠르다) */
  pace: number;
  /** 조각 [최소, 최대] */
  shards: [number, number];
  /** 희망의 조각이 나올 확률 */
  hopeChance: number;
}

/** [초안] 난이도 */
export const DIFFICULTY: Record<LegionDifficulty, DifficultyDef> = {
  normal: { name: '노멀', hpMul: 1, dmgMul: 1, pace: 1, shards: [8, 12], hopeChance: 0 },
  hard: { name: '하드', hpMul: 2.5, dmgMul: 1.6, pace: 0.8, shards: [22, 28], hopeChance: 0.15 },
};

export type ModId =
  | 'atk'
  | 'guard'
  | 'vigor'
  | 'revive'
  | 'boss_hp'
  | 'boss_atk'
  | 'boss_slow'
  | 'gimmick';

export interface ModDef {
  id: ModId;
  kind: 'buff' | 'debuff';
  name: string;
  desc: string;
}

/** [초안] 출격 전에 고르는 버프(나)·디버프(보스). 고를수록 보상이 줄어든다. */
export const MODS: ModDef[] = [
  { id: 'atk', kind: 'buff', name: '전의 고양', desc: '주는 피해 +20%' },
  { id: 'guard', kind: 'buff', name: '수호의 가호', desc: '받는 피해 -20%' },
  { id: 'vigor', kind: 'buff', name: '강인한 생명', desc: '최대 HP +30%' },
  { id: 'revive', kind: 'buff', name: '불사조의 깃털', desc: '쓰러지면 한 번 HP 50%로 되살아난다' },
  { id: 'boss_hp', kind: 'debuff', name: '약화의 저주', desc: '군단장 체력 -20%' },
  { id: 'boss_atk', kind: 'debuff', name: '무딘 칼날', desc: '군단장 공격력 -20%' },
  { id: 'boss_slow', kind: 'debuff', name: '둔화의 사슬', desc: '군단장 패턴 속도 -15%' },
  { id: 'gimmick', kind: 'debuff', name: '기믹 완화', desc: '침묵 스택 +2칸 · 그로기 시간 +50% · 즉사 예고 +1초' },
];

export const MOD_PENALTY = 0.15;
export const MIN_REWARD_MUL = 0.3;

/** 고른 버프·디버프 수에 따른 보상 배율 */
export function rewardMul(mods: ModId[]): number {
  return Math.max(MIN_REWARD_MUL, 1 - MOD_PENALTY * mods.length);
}

/** 침묵 스택 칸 수 */
export const SILENCE_STACKS = 5;
/** 침묵 지속 시간 */
export const SILENCE_TIME = 3;

/** 출격 정보: 전투 씬에 넘긴다. */
export interface LegionRun {
  id: LegionId;
  difficulty: LegionDifficulty;
  mods: ModId[];
  /** 고른 무기 2개 (uid) */
  weapons: [string, string];
}

/** 군단장 전투용 페이즈 (전투 씬은 페이즈 정보로 맵과 웨이브를 만든다) */
export function legionPhase(run: LegionRun): PhaseDef {
  const def = LEGIONS[run.id];
  const diff = DIFFICULTY[run.difficulty];
  const hp = diff.hpMul * (run.mods.includes('boss_hp') ? 0.8 : 1);
  const dmg = diff.dmgMul * (run.mods.includes('boss_atk') ? 0.8 : 1);
  return {
    id: `L-${run.id}`,
    name: `${def.name} · ${diff.name}`,
    type: 'boss',
    chapter: 0,
    desc: def.gimmick,
    hpMul: hp,
    dmgMul: dmg,
    width: 960,
    platforms: [],
    theme: 'castle',
    waves: [[{ kind: def.monster, count: 1 }]],
    clearReward: { gold: 0, exp: 0, materials: {}, sweepTickets: 0 },
  };
}

// ───────── 조각으로 세트 방어구 사기·강화 [초안] ─────────

/** 부위 하나의 값: 영웅은 조각만, 전설은 조각 + 희망의 조각 (상반신은 희망 2개) */
export function setPiecePrice(grade: string, slot: string): { shards: number; hope: number } {
  if (grade === 'legendary') return { shards: 80, hope: slot === 'body' ? 2 : 1 };
  return { shards: 30, hope: 0 };
}

/** 세트 방어구 강화 (+level → +level+1) 비용: 조각 */
export function setEnhanceCost(grade: string, level: number): number {
  const base = grade === 'legendary' ? 8 : 5;
  return base + level * (grade === 'legendary' ? 4 : 3);
}

/** 세트 계열 → 군단장 */
export function legionForLine(line: SetLine): LegionDef {
  return Object.values(LEGIONS).find((l) => l.line === line)!;
}

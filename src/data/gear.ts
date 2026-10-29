import type { Grade } from './weapons';

export type GearSlot = 'head' | 'body' | 'legs' | 'feet' | 'ring' | 'necklace';

export const GEAR_SLOTS: GearSlot[] = ['head', 'body', 'legs', 'feet', 'ring', 'necklace'];

export const GEAR_SLOT_NAME: Record<GearSlot, string> = {
  head: '머리',
  body: '상반신',
  legs: '하의',
  feet: '신발',
  ring: '반지',
  necklace: '목걸이',
};

export interface GearStats {
  str?: number;
  dex?: number;
  int?: number;
  hp?: number;
  /** 최대 HP 고정 증가 */
  flatHp?: number;
  /** 마나 회복 비율 증가 */
  regenMul?: number;
  /** 이동속도 비율 증가 (상한 없음) */
  speedMul?: number;
  critBonus?: number;
}

export interface GearDef {
  id: string;
  name: string;
  slot: GearSlot;
  grade: Grade;
  stats: GearStats;
  price?: number;
  exchange?: { gold: number; materials: Record<string, number> };
}

/** 방어구는 방어력 대신 HP·스탯 보너스, 장신구는 특수 효과를 준다. */
export const GEAR: Record<string, GearDef> = {
  leather_hood: { id: 'leather_hood', name: '가죽 두건', slot: 'head', grade: 'common', stats: { hp: 2 }, price: 120 },
  iron_helm: {
    id: 'iron_helm',
    name: '철 투구',
    slot: 'head',
    grade: 'rare',
    stats: { hp: 4, str: 2 },
    exchange: { gold: 600, materials: { bone_shard: 6, golem_core: 2 } },
  },
  sage_hat: {
    id: 'sage_hat',
    name: '현자의 모자',
    slot: 'head',
    grade: 'rare',
    stats: { int: 4, regenMul: 0.1 },
    exchange: { gold: 600, materials: { mana_crystal: 4 } },
  },
  padded_armor: { id: 'padded_armor', name: '누빔 갑옷', slot: 'body', grade: 'common', stats: { hp: 3 }, price: 150 },
  chain_mail: {
    id: 'chain_mail',
    name: '사슬 갑옷',
    slot: 'body',
    grade: 'rare',
    stats: { hp: 6, str: 2 },
    exchange: { gold: 800, materials: { bone_shard: 8, golem_core: 3 } },
  },
  wind_coat: {
    id: 'wind_coat',
    name: '바람의 외투',
    slot: 'body',
    grade: 'rare',
    stats: { dex: 4, speedMul: 0.05 },
    exchange: { gold: 800, materials: { wing_membrane: 5 } },
  },
  leather_pants: { id: 'leather_pants', name: '가죽 바지', slot: 'legs', grade: 'common', stats: { hp: 2 }, price: 100 },
  steel_greaves: {
    id: 'steel_greaves',
    name: '강철 각반',
    slot: 'legs',
    grade: 'rare',
    stats: { hp: 4, str: 1, dex: 1 },
    exchange: { gold: 600, materials: { bone_shard: 6, golem_core: 2 } },
  },
  travel_boots: { id: 'travel_boots', name: '여행자 장화', slot: 'feet', grade: 'common', stats: { speedMul: 0.05 }, price: 120 },
  gale_boots: {
    id: 'gale_boots',
    name: '질풍 장화',
    slot: 'feet',
    grade: 'rare',
    stats: { speedMul: 0.1, dex: 2 },
    exchange: { gold: 700, materials: { wing_membrane: 4 } },
  },
  copper_ring: { id: 'copper_ring', name: '구리 반지', slot: 'ring', grade: 'common', stats: { critBonus: 0.02 }, price: 200 },
  mana_ring: {
    id: 'mana_ring',
    name: '마력의 반지',
    slot: 'ring',
    grade: 'rare',
    stats: { int: 3, regenMul: 0.2 },
    exchange: { gold: 900, materials: { mana_crystal: 6 } },
  },
  bone_necklace: { id: 'bone_necklace', name: '뼈 목걸이', slot: 'necklace', grade: 'common', stats: { flatHp: 30 }, price: 200 },
  elite_pendant: {
    id: 'elite_pendant',
    name: '정예의 목걸이',
    slot: 'necklace',
    grade: 'epic',
    stats: { str: 2, dex: 2, int: 2, hp: 2, critBonus: 0.03 },
    exchange: { gold: 1500, materials: { elite_sigil: 4 } },
  },
};

export function gearStatsText(st: GearStats): string {
  const parts: string[] = [];
  if (st.str) parts.push(`힘 +${st.str}`);
  if (st.dex) parts.push(`민첩 +${st.dex}`);
  if (st.int) parts.push(`마력 +${st.int}`);
  if (st.hp) parts.push(`HP 스탯 +${st.hp}`);
  if (st.flatHp) parts.push(`최대 HP +${st.flatHp}`);
  if (st.regenMul) parts.push(`마나 회복 +${Math.round(st.regenMul * 100)}%`);
  if (st.speedMul) parts.push(`이동속도 +${Math.round(st.speedMul * 100)}%`);
  if (st.critBonus) parts.push(`치명타 +${Math.round(st.critBonus * 100)}%`);
  return parts.join(' · ');
}

/** 장착한 장비의 보너스를 모두 더한다. */
export function gearBonus(equipped: Partial<Record<GearSlot, string>>): Required<GearStats> {
  const total: Required<GearStats> = { str: 0, dex: 0, int: 0, hp: 0, flatHp: 0, regenMul: 0, speedMul: 0, critBonus: 0 };
  for (const id of Object.values(equipped)) {
    const def = id ? GEAR[id] : undefined;
    if (!def) continue;
    for (const k of Object.keys(total) as (keyof GearStats)[]) total[k] += def.stats[k] ?? 0;
  }
  return total;
}

export interface PotionDef {
  id: 'hp' | 'mp';
  name: string;
  desc: string;
  price: number;
}

export const POTIONS: PotionDef[] = [
  { id: 'hp', name: '체력 포션', desc: '최대 HP의 35%를 즉시 회복한다.', price: 50 },
  { id: 'mp', name: '마나 포션', desc: '마나를 60 즉시 회복한다.', price: 50 },
];

/** 한 페이즈에서 포션은 종류마다 이만큼만 쓸 수 있다. */
export const POTION_LIMIT_PER_PHASE = 5;

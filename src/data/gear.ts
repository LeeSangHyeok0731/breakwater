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
  /** 치명타 피해 추가 (0.3 = +30%p) */
  critDamage?: number;
  /** 주는 피해 비율 증가 */
  damageMul?: number;
  /** 받는 피해 비율 감소 */
  damageReduce?: number;
  /** 스킬 쿨타임 비율 감소 */
  cdReduce?: number;
}

export interface GearDef {
  id: string;
  name: string;
  slot: GearSlot;
  grade: Grade;
  stats: GearStats;
  price?: number;
  exchange?: { gold: number; materials: Record<string, number> };
  /** 세트 방어구면 세트 id */
  set?: string;
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
  if (st.critDamage) parts.push(`치명타 피해 +${Math.round(st.critDamage * 100)}%`);
  if (st.damageMul) parts.push(`주는 피해 +${Math.round(st.damageMul * 100)}%`);
  if (st.damageReduce) parts.push(`받는 피해 -${Math.round(st.damageReduce * 100)}%`);
  if (st.cdReduce) parts.push(`스킬 쿨타임 -${Math.round(st.cdReduce * 100)}%`);
  return parts.join(' · ');
}

/** 받는 피해 감소·쿨타임 감소의 상한 */
export const DAMAGE_REDUCE_CAP = 0.5;
export const CD_REDUCE_CAP = 0.4;

function addStats(total: Required<GearStats>, st: GearStats): void {
  for (const k of Object.keys(total) as (keyof GearStats)[]) total[k] += st[k] ?? 0;
}

/** 장착한 장비의 보너스를 모두 더한다. 세트 효과와 세트 강화 합 효과도 들어간다. */
export function gearBonus(equipped: Partial<Record<GearSlot, string>>, enhance: Record<string, number> = {}): Required<GearStats> {
  const total: Required<GearStats> = {
    str: 0,
    dex: 0,
    int: 0,
    hp: 0,
    flatHp: 0,
    regenMul: 0,
    speedMul: 0,
    critBonus: 0,
    critDamage: 0,
    damageMul: 0,
    damageReduce: 0,
    cdReduce: 0,
  };
  for (const id of Object.values(equipped)) {
    const def = id ? GEAR[id] : undefined;
    if (def) addStats(total, def.stats);
  }
  for (const st of setProgress(equipped, enhance)) for (const b of st.active) addStats(total, b);
  total.damageReduce = Math.min(total.damageReduce, DAMAGE_REDUCE_CAP);
  total.cdReduce = Math.min(total.cdReduce, CD_REDUCE_CAP);
  return total;
}

// ───────────────────────── 세트 방어구 ─────────────────────────

export type SetLine = 'melee' | 'ranged' | 'magic';

export const SET_LINE_NAME: Record<SetLine, string> = { melee: '근접', ranged: '사격', magic: '마법' };

export interface SetDef {
  id: string;
  name: string;
  grade: Grade;
  line: SetLine;
  /** 같은 세트를 n부위 입으면 켜지는 효과 [초안] */
  pieces: [number, GearStats][];
  /** 입은 세트 부위들의 강화 수치 합이 n 이상이면 켜지는 효과 [초안] */
  enhance: [number, GearStats][];
}

export const ARMOR_SLOTS: GearSlot[] = ['head', 'body', 'legs', 'feet'];

export const SETS: Record<string, SetDef> = {
  champion: {
    id: 'champion',
    name: '투사의 갑주',
    grade: 'epic',
    line: 'melee',
    pieces: [
      [2, { critBonus: 0.04 }],
      [3, { damageMul: 0.08 }],
      [4, { critDamage: 0.3, damageReduce: 0.1 }],
    ],
    enhance: [
      [10, { damageMul: 0.03 }],
      [20, { critBonus: 0.03 }],
      [30, { damageReduce: 0.05 }],
      [40, { critDamage: 0.25 }],
    ],
  },
  dragonslayer: {
    id: 'dragonslayer',
    name: '용살자의 갑주',
    grade: 'legendary',
    line: 'melee',
    pieces: [
      [2, { critBonus: 0.06 }],
      [3, { damageMul: 0.15 }],
      [4, { critDamage: 0.6, damageReduce: 0.15 }],
    ],
    enhance: [
      [10, { damageMul: 0.05 }],
      [20, { critBonus: 0.05 }],
      [30, { damageReduce: 0.08 }],
      [40, { critDamage: 0.4 }],
    ],
  },
  falconer: {
    id: 'falconer',
    name: '매사냥꾼의 가죽옷',
    grade: 'epic',
    line: 'ranged',
    pieces: [
      [2, { critBonus: 0.06 }],
      [3, { speedMul: 0.08 }],
      [4, { critDamage: 0.4, damageMul: 0.05 }],
    ],
    enhance: [
      [10, { critBonus: 0.03 }],
      [20, { damageMul: 0.04 }],
      [30, { speedMul: 0.05 }],
      [40, { critDamage: 0.3 }],
    ],
  },
  starhunter: {
    id: 'starhunter',
    name: '별사냥꾼의 망토',
    grade: 'legendary',
    line: 'ranged',
    pieces: [
      [2, { critBonus: 0.09 }],
      [3, { speedMul: 0.12 }],
      [4, { critDamage: 0.8, damageMul: 0.1 }],
    ],
    enhance: [
      [10, { critBonus: 0.05 }],
      [20, { damageMul: 0.06 }],
      [30, { speedMul: 0.08 }],
      [40, { critDamage: 0.5 }],
    ],
  },
  arcanist: {
    id: 'arcanist',
    name: '비전학자의 로브',
    grade: 'epic',
    line: 'magic',
    pieces: [
      [2, { regenMul: 0.2 }],
      [3, { cdReduce: 0.1 }],
      [4, { damageMul: 0.12, critBonus: 0.04 }],
    ],
    enhance: [
      [10, { regenMul: 0.1 }],
      [20, { damageMul: 0.04 }],
      [30, { cdReduce: 0.05 }],
      [40, { damageMul: 0.06 }],
    ],
  },
  archmage: {
    id: 'archmage',
    name: '대마도사의 성의',
    grade: 'legendary',
    line: 'magic',
    pieces: [
      [2, { regenMul: 0.35 }],
      [3, { cdReduce: 0.15 }],
      [4, { damageMul: 0.22, critBonus: 0.06 }],
    ],
    enhance: [
      [10, { regenMul: 0.15 }],
      [20, { damageMul: 0.06 }],
      [30, { cdReduce: 0.08 }],
      [40, { damageMul: 0.1 }],
    ],
  },
};

/** 세트 방어구 부위 이름과 능력치 [초안]. 부위 순서는 머리·상반신·하의·신발. */
const SET_PIECES: Record<string, [string, GearStats][]> = {
  champion: [
    ['투사의 투구', { str: 4, hp: 4 }],
    ['투사의 흉갑', { str: 4, hp: 6 }],
    ['투사의 각반', { str: 3, hp: 5 }],
    ['투사의 철화', { str: 3, hp: 3 }],
  ],
  dragonslayer: [
    ['용살자의 투구', { str: 7, hp: 7 }],
    ['용살자의 흉갑', { str: 7, hp: 10 }],
    ['용살자의 각반', { str: 6, hp: 8 }],
    ['용살자의 군화', { str: 5, hp: 6 }],
  ],
  falconer: [
    ['매사냥꾼의 두건', { dex: 4, hp: 3 }],
    ['매사냥꾼의 조끼', { dex: 5, hp: 4 }],
    ['매사냥꾼의 바지', { dex: 4, hp: 3 }],
    ['매사냥꾼의 장화', { dex: 3, hp: 2 }],
  ],
  starhunter: [
    ['별사냥꾼의 두건', { dex: 7, hp: 5 }],
    ['별사냥꾼의 망토', { dex: 8, hp: 7 }],
    ['별사냥꾼의 바지', { dex: 7, hp: 5 }],
    ['별사냥꾼의 장화', { dex: 6, hp: 4 }],
  ],
  arcanist: [
    ['비전학자의 모자', { int: 4, regenMul: 0.05 }],
    ['비전학자의 로브', { int: 5, hp: 3 }],
    ['비전학자의 하의', { int: 4, hp: 2 }],
    ['비전학자의 신발', { int: 3, regenMul: 0.05 }],
  ],
  archmage: [
    ['대마도사의 관', { int: 7, regenMul: 0.08 }],
    ['대마도사의 성의', { int: 8, hp: 5 }],
    ['대마도사의 하의', { int: 7, hp: 4 }],
    ['대마도사의 신발', { int: 6, regenMul: 0.08 }],
  ],
};

for (const set of Object.values(SETS)) {
  SET_PIECES[set.id].forEach(([name, stats], i) => {
    const slot = ARMOR_SLOTS[i];
    const id = `${set.id}_${slot}`;
    GEAR[id] = { id, name, slot, grade: set.grade, stats, set: set.id };
  });
}

/** 세트의 4부위 방어구 id (머리·상반신·하의·신발 순) */
export function setPieces(setId: string): string[] {
  return ARMOR_SLOTS.map((slot) => `${setId}_${slot}`);
}

export interface SetProgress {
  set: SetDef;
  /** 입은 부위 수 */
  worn: number;
  /** 입은 세트 부위들의 강화 수치 합 */
  enhanceSum: number;
  /** 지금 켜진 효과들 */
  active: GearStats[];
}

/** 입은 세트마다 몇 부위를 입었고 어떤 효과가 켜졌는지 */
export function setProgress(equipped: Partial<Record<GearSlot, string>>, enhance: Record<string, number> = {}): SetProgress[] {
  const out: SetProgress[] = [];
  for (const set of Object.values(SETS)) {
    const pieces = setPieces(set.id).filter((id) => Object.values(equipped).includes(id));
    if (!pieces.length) continue;
    const worn = pieces.length;
    const enhanceSum = pieces.reduce((n, id) => n + (enhance[id] ?? 0), 0);
    const active = [...set.pieces.filter(([n]) => worn >= n), ...set.enhance.filter(([n]) => enhanceSum >= n)].map(([, st]) => st);
    out.push({ set, worn, enhanceSum, active });
  }
  return out;
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

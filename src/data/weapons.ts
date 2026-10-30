export type WeaponType = 'sword' | 'dao' | 'bow' | 'staff' | 'gun';
export type Grade = 'common' | 'rare' | 'epic' | 'legendary';

export interface WeaponDef {
  id: string;
  name: string;
  type: WeaponType;
  grade: Grade;
  attack: number;
  critChance: number;
  desc: string;
  /** 총 전용: 탄창 크기 */
  magazine?: number;
  /** 상점에서 골드로 산다 */
  price?: number;
  /** 재료 교환으로 얻는다 */
  exchange?: { gold: number; materials: Record<string, number> };
}

export const WEAPON_TYPE_NAME: Record<WeaponType, string> = {
  sword: '검',
  dao: '도',
  bow: '활',
  staff: '스태프',
  gun: '총',
};

/** 무기 종류가 곧 직업이다. 장착한 두 무기를 오가는 것이 직업 교체다. */
export const CLASS_NAME: Record<WeaponType, string> = {
  sword: '검사',
  dao: '도객',
  bow: '궁수',
  staff: '마법사',
  gun: '총잡이',
};

export const GRADES: Record<Grade, { name: string; color: string }> = {
  common: { name: '일반', color: '#c8ccd2' },
  rare: { name: '희귀', color: '#4aa3ff' },
  epic: { name: '영웅', color: '#b46bff' },
  legendary: { name: '전설', color: '#ffb02e' },
};

export const MELEE_TYPES: ReadonlySet<WeaponType> = new Set(['sword', 'dao']);

export const WEAPONS: Record<string, WeaponDef> = {
  training_sword: {
    id: 'training_sword',
    name: '수련용 장검',
    type: 'sword',
    grade: 'common',
    attack: 20,
    critChance: 0.05,
    desc: '양날 장검. 베기 콤보와 직선을 꿰뚫는 찌르기를 쓸 수 있다.',
  },
  apprentice_staff: {
    id: 'apprentice_staff',
    name: '견습 마법사의 지팡이',
    type: 'staff',
    grade: 'common',
    attack: 18,
    critChance: 0.05,
    desc: '마나볼을 쏘는 지팡이. 우클릭을 누르고 있으면 마나볼이 커진다.',
  },
  training_dao: {
    id: 'training_dao',
    name: '수련용 도',
    type: 'dao',
    grade: 'common',
    attack: 24,
    critChance: 0.05,
    desc: '외날 도. 검보다 한 방이 무겁다. 우클릭을 누르고 있다가 놓으면 크게 휘두른다.',
    price: 300,
  },
  hunting_bow: {
    id: 'hunting_bow',
    name: '사냥꾼의 활',
    type: 'bow',
    grade: 'common',
    attack: 22,
    critChance: 0.08,
    desc: '한 발마다 다시 장전해야 한다. 우클릭으로 당겼다 놓으면 강한 화살이 적을 꿰뚫는다.',
    price: 300,
  },
  old_revolver: {
    id: 'old_revolver',
    name: '낡은 리볼버',
    type: 'gun',
    grade: 'common',
    attack: 12,
    critChance: 0.1,
    magazine: 8,
    desc: '스탯의 영향을 받지 않는다. 치명타 대신 항상 피해가 늘어난다. 우클릭으로 정조준.',
    price: 400,
  },
  steel_sword: {
    id: 'steel_sword',
    name: '강철 장검',
    type: 'sword',
    grade: 'rare',
    attack: 32,
    critChance: 0.08,
    desc: '단단하게 벼린 강철 장검.',
    exchange: { gold: 1200, materials: { bone_shard: 10, golem_core: 4 } },
  },
  moonlight_dao: {
    id: 'moonlight_dao',
    name: '월광도',
    type: 'dao',
    grade: 'rare',
    attack: 38,
    critChance: 0.07,
    desc: '달빛처럼 푸르게 빛나는 도.',
    exchange: { gold: 1200, materials: { bone_shard: 10, golem_core: 4 } },
  },
  gale_bow: {
    id: 'gale_bow',
    name: '바람의 장궁',
    type: 'bow',
    grade: 'rare',
    attack: 34,
    critChance: 0.12,
    desc: '미니언의 날개막으로 시위를 엮은 장궁.',
    exchange: { gold: 1200, materials: { bone_shard: 8, wing_membrane: 6 } },
  },
  rune_staff: {
    id: 'rune_staff',
    name: '룬 지팡이',
    type: 'staff',
    grade: 'rare',
    attack: 30,
    critChance: 0.06,
    desc: '마력 결정을 박아 넣은 지팡이.',
    exchange: { gold: 1200, materials: { bone_shard: 8, mana_crystal: 6 } },
  },
  hunter_rifle: {
    id: 'hunter_rifle',
    name: '사냥용 장총',
    type: 'gun',
    grade: 'rare',
    attack: 20,
    critChance: 0.16,
    magazine: 6,
    desc: '탄창은 작지만 한 발 한 발이 강력하다.',
    exchange: { gold: 1500, materials: { golem_core: 3, wing_membrane: 4 } },
  },
  lord_flame_sword: {
    id: 'lord_flame_sword',
    name: '군주의 화염검',
    type: 'sword',
    grade: 'epic',
    attack: 48,
    critChance: 0.1,
    desc: '악마 군주의 심장석을 녹여 만든 검.',
    exchange: { gold: 4000, materials: { lord_heart: 1, elite_sigil: 3 } },
  },
  magma_heart_staff: {
    id: 'magma_heart_staff',
    name: '용암 심장 지팡이',
    type: 'staff',
    grade: 'epic',
    attack: 44,
    critChance: 0.1,
    desc: '심장석이 맥동하는 지팡이.',
    exchange: { gold: 4000, materials: { lord_heart: 1, elite_sigil: 3 } },
  },
  // ───────── 영웅: 대성당의 깃털로 만든다 ─────────
  crimson_dao: {
    id: 'crimson_dao',
    name: '혈월도',
    type: 'dao',
    grade: 'epic',
    attack: 56,
    critChance: 0.09,
    desc: '핏빛 달 아래 벼려진 도. 휘두를 때마다 붉은 기운이 흩날린다.',
    exchange: { gold: 4500, materials: { angel_feather: 3, lord_heart: 1, elite_sigil: 3 } },
  },
  seraph_bow: {
    id: 'seraph_bow',
    name: '세라핌의 깃활',
    type: 'bow',
    grade: 'epic',
    attack: 50,
    critChance: 0.14,
    desc: '타락천사의 깃털로 엮은 활. 화살이 금빛 꼬리를 끈다.',
    exchange: { gold: 4500, materials: { angel_feather: 4, wing_membrane: 8, elite_sigil: 2 } },
  },
  arcane_rifle: {
    id: 'arcane_rifle',
    name: '마도 소총',
    type: 'gun',
    grade: 'epic',
    attack: 30,
    critChance: 0.18,
    magazine: 7,
    desc: '총신에 룬을 새긴 소총. 탄환이 보랏빛 궤적을 남긴다.',
    exchange: { gold: 5000, materials: { angel_feather: 3, golem_core: 6, elite_sigil: 2 } },
  },
  // ───────── 전설: 마왕성의 파편으로 만든다 ─────────
  holy_sword: {
    id: 'holy_sword',
    name: '성검 아스칼론',
    type: 'sword',
    grade: 'legendary',
    attack: 70,
    critChance: 0.12,
    desc: '심연을 베기 위해 다시 벼려진 성검. 칼끝에서 금빛 성광이 흐른다.',
    exchange: { gold: 9000, materials: { abyss_shard: 6, angel_feather: 4, lord_heart: 2 } },
  },
  thunder_dao: {
    id: 'thunder_dao',
    name: '뇌명도',
    type: 'dao',
    grade: 'legendary',
    attack: 80,
    critChance: 0.1,
    desc: '벼락을 맞고도 부러지지 않은 도. 휘두르면 번개가 튄다.',
    exchange: { gold: 9000, materials: { abyss_shard: 6, golem_core: 10, lord_heart: 2 } },
  },
  abyss_bow: {
    id: 'abyss_bow',
    name: '심연궁',
    type: 'bow',
    grade: 'legendary',
    attack: 70,
    critChance: 0.16,
    desc: '심연의 군주가 쓰던 검은 활. 시위가 보랏빛으로 타오른다.',
    exchange: { gold: 9000, materials: { abyss_shard: 6, wing_membrane: 10, lord_heart: 2 } },
  },
  dragon_cannon: {
    id: 'dragon_cannon',
    name: '용의 포효',
    type: 'gun',
    grade: 'legendary',
    attack: 44,
    critChance: 0.2,
    magazine: 5,
    desc: '용의 아가리를 본뜬 짧은 대포. 탄창은 작지만 탄환이 불꽃을 뿜는다.',
    exchange: { gold: 9500, materials: { abyss_shard: 7, golem_core: 8, lord_heart: 2 } },
  },
  abyss_scepter: {
    id: 'abyss_scepter',
    name: '심연의 홀',
    type: 'staff',
    grade: 'legendary',
    attack: 64,
    critChance: 0.12,
    desc: '심연의 눈이 박힌 홀. 들고 있으면 보랏빛 기운이 피어오른다.',
    exchange: { gold: 9000, materials: { abyss_shard: 6, mana_crystal: 10, lord_heart: 2 } },
  },
};

export const MAX_ENHANCE = 10;

/** 강화는 무조건 성공. 단계가 오를수록 비용이 커진다. */
export function enhanceCost(type: WeaponType, level: number): { gold: number; materials: Record<string, number> } {
  const materials: Record<string, number> = { bone_shard: 2 + level };
  if (level >= 2) materials[type === 'staff' ? 'mana_crystal' : 'golem_core'] = level - 1;
  if (level >= 5) materials.elite_sigil = level - 4;
  return { gold: Math.round(150 * Math.pow(1.45, level)), materials };
}

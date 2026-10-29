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
}

export const WEAPON_TYPE_NAME: Record<WeaponType, string> = {
  sword: '검',
  dao: '도',
  bow: '활',
  staff: '스태프',
  gun: '총',
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
};

export const MAX_ENHANCE = 10;

/** 강화는 무조건 성공. 단계가 오를수록 비용이 커진다. */
export function enhanceCost(type: WeaponType, level: number): { gold: number; materials: Record<string, number> } {
  const materials: Record<string, number> = { bone_shard: 2 + level };
  if (level >= 2) materials[type === 'staff' ? 'mana_crystal' : 'golem_core'] = level - 1;
  if (level >= 5) materials.elite_sigil = level - 4;
  return { gold: Math.round(150 * Math.pow(1.45, level)), materials };
}

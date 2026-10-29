export type MonsterKind = 'zombie' | 'mage' | 'minion' | 'golem' | 'golem_lord';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  /** 공격 사거리 (근접은 몸 반지름 바깥 기준) */
  range: number;
  attackCd: number;
  radius: number;
  height: number;
  flying: boolean;
  boss?: boolean;
  gold: number;
  exp: number;
  /** 처치 시 플레이어 마나 회복량 */
  mana: number;
  drops: { id: string; chance: number }[];
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  zombie: {
    kind: 'zombie',
    name: '좀비',
    hp: 50,
    speed: 3,
    damage: 10,
    range: 1.1,
    attackCd: 1.2,
    radius: 0.45,
    height: 2.1,
    flying: false,
    gold: 5,
    exp: 8,
    mana: 3,
    drops: [{ id: 'bone_shard', chance: 0.35 }],
  },
  mage: {
    kind: 'mage',
    name: '마법사',
    hp: 40,
    speed: 2.5,
    damage: 12,
    range: 20,
    attackCd: 2.6,
    radius: 0.45,
    height: 2.4,
    flying: false,
    gold: 8,
    exp: 12,
    mana: 3,
    drops: [{ id: 'mana_crystal', chance: 0.3 }],
  },
  minion: {
    kind: 'minion',
    name: '미니언',
    hp: 30,
    speed: 6,
    damage: 8,
    range: 1.2,
    attackCd: 3.5,
    radius: 0.5,
    height: 0.8,
    flying: true,
    gold: 6,
    exp: 10,
    mana: 3,
    drops: [{ id: 'wing_membrane', chance: 0.3 }],
  },
  golem: {
    kind: 'golem',
    name: '골렘',
    hp: 300,
    speed: 1.5,
    damage: 30,
    range: 3.2,
    attackCd: 3,
    radius: 1.0,
    height: 3.1,
    flying: false,
    gold: 20,
    exp: 35,
    mana: 8,
    drops: [{ id: 'golem_core', chance: 0.5 }],
  },
  golem_lord: {
    kind: 'golem_lord',
    name: '골렘 군주',
    hp: 3200,
    speed: 2.2,
    damage: 40,
    range: 5,
    attackCd: 2.2,
    radius: 2.2,
    height: 6.8,
    flying: false,
    boss: true,
    gold: 600,
    exp: 900,
    mana: 30,
    drops: [
      { id: 'lord_heart', chance: 1 },
      { id: 'elite_sigil', chance: 1 },
      { id: 'golem_core', chance: 1 },
    ],
  },
};

/** 엘리트: 기본 4종의 강화판 */
export const ELITE_MOD = { hp: 5, damage: 1.5, scale: 1.5, reward: 4 };

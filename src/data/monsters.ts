export type MonsterKind =
  | 'zombie'
  | 'mage'
  | 'minion'
  | 'golem'
  | 'poison_zombie'
  | 'fire_mage'
  | 'grave_knight'
  | 'golem_lord'
  // 챕터 2: 버려진 대성당
  | 'lantern_wraith'
  | 'halo_wraith'
  | 'fire_skull'
  | 'hell_cat'
  | 'blood_skeleton'
  | 'frost_mage'
  | 'fallen_angel'
  // 챕터 3: 마왕성
  | 'hell_hound'
  | 'silver_wolf'
  | 'flame_beast'
  | 'wraith_knight'
  | 'abyss_lord';

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
  /** 미니보스: 보스 체력바로 표시된다 */
  miniboss?: boolean;
  gold: number;
  exp: number;
  /** 처치 시 플레이어 마나 회복량 */
  mana: number;
  drops: { id: string; chance: number }[];
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  zombie: {
    kind: 'zombie',
    name: '해골 병사',
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
    name: '해골 마법사',
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
    name: '유령',
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
    name: '헬 비스트',
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
  poison_zombie: {
    kind: 'poison_zombie',
    name: '독 해골',
    hp: 60,
    speed: 2.8,
    damage: 9,
    range: 1.1,
    attackCd: 1.3,
    radius: 0.45,
    height: 2.1,
    flying: false,
    gold: 7,
    exp: 11,
    mana: 3,
    drops: [{ id: 'bone_shard', chance: 0.4 }],
  },
  fire_mage: {
    kind: 'fire_mage',
    name: '불타는 구울',
    hp: 45,
    speed: 2.4,
    damage: 14,
    range: 22,
    attackCd: 3.2,
    radius: 0.45,
    height: 2.4,
    flying: false,
    gold: 10,
    exp: 15,
    mana: 4,
    drops: [{ id: 'mana_crystal', chance: 0.4 }],
  },
  grave_knight: {
    kind: 'grave_knight',
    name: '악몽마',
    hp: 1100,
    speed: 3.3,
    damage: 22,
    range: 2.6,
    attackCd: 1.6,
    radius: 0.8,
    height: 3.0,
    flying: false,
    miniboss: true,
    gold: 150,
    exp: 220,
    mana: 20,
    drops: [
      { id: 'elite_sigil', chance: 1 },
      { id: 'golem_core', chance: 0.6 },
    ],
  },
  golem_lord: {
    kind: 'golem_lord',
    name: '악마 군주',
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
  // ───────── 챕터 2: 버려진 대성당 ─────────
  lantern_wraith: {
    kind: 'lantern_wraith',
    name: '등불 망령',
    hp: 55,
    speed: 2.2,
    damage: 13,
    range: 20,
    attackCd: 3,
    radius: 0.45,
    height: 2.4,
    flying: true,
    gold: 12,
    exp: 18,
    mana: 4,
    drops: [{ id: 'mana_crystal', chance: 0.35 }],
  },
  halo_wraith: {
    kind: 'halo_wraith',
    name: '후광 망령',
    hp: 90,
    speed: 1.8,
    damage: 8,
    range: 20,
    attackCd: 5,
    radius: 0.45,
    height: 2.4,
    flying: true,
    gold: 16,
    exp: 24,
    mana: 5,
    drops: [{ id: 'wing_membrane', chance: 0.4 }],
  },
  fire_skull: {
    kind: 'fire_skull',
    name: '불타는 해골',
    hp: 35,
    speed: 5,
    damage: 20,
    range: 1,
    attackCd: 2.5,
    radius: 0.4,
    height: 1,
    flying: true,
    gold: 10,
    exp: 14,
    mana: 3,
    drops: [{ id: 'bone_shard', chance: 0.3 }],
  },
  hell_cat: {
    kind: 'hell_cat',
    name: '지옥 고양이',
    hp: 70,
    speed: 3.5,
    damage: 14,
    range: 6,
    attackCd: 2.4,
    radius: 0.7,
    height: 1.2,
    flying: false,
    gold: 12,
    exp: 18,
    mana: 4,
    drops: [{ id: 'wing_membrane', chance: 0.3 }],
  },
  blood_skeleton: {
    kind: 'blood_skeleton',
    name: '핏빛 해골',
    hp: 80,
    speed: 4,
    damage: 14,
    range: 1.1,
    attackCd: 1.1,
    radius: 0.45,
    height: 2.1,
    flying: false,
    gold: 9,
    exp: 14,
    mana: 3,
    drops: [{ id: 'bone_shard', chance: 0.45 }],
  },
  frost_mage: {
    kind: 'frost_mage',
    name: '서리 해골 마법사',
    hp: 60,
    speed: 2.5,
    damage: 12,
    range: 20,
    attackCd: 2.6,
    radius: 0.45,
    height: 2.4,
    flying: false,
    gold: 12,
    exp: 17,
    mana: 4,
    drops: [{ id: 'mana_crystal', chance: 0.4 }],
  },
  fallen_angel: {
    kind: 'fallen_angel',
    name: '타락천사',
    // 보스 페이즈 배율(체력 1.6, 공격 1.4)을 곱하면 체력 5200, 공격 34
    hp: 3250,
    speed: 3,
    damage: 24,
    range: 6,
    attackCd: 2,
    radius: 1.5,
    height: 4,
    flying: true,
    boss: true,
    gold: 1000,
    exp: 1400,
    mana: 40,
    drops: [
      { id: 'lord_heart', chance: 1 },
      { id: 'elite_sigil', chance: 1 },
      { id: 'wing_membrane', chance: 1 },
    ],
  },
  // ───────── 챕터 3: 마왕성 ─────────
  hell_hound: {
    kind: 'hell_hound',
    name: '지옥견',
    hp: 110,
    speed: 6,
    damage: 16,
    range: 1.3,
    attackCd: 1.6,
    radius: 0.8,
    height: 1.2,
    flying: false,
    gold: 15,
    exp: 24,
    mana: 4,
    drops: [{ id: 'golem_core', chance: 0.25 }],
  },
  silver_wolf: {
    kind: 'silver_wolf',
    name: '은빛 늑대',
    hp: 60,
    speed: 7,
    damage: 10,
    range: 1.1,
    attackCd: 1.2,
    radius: 0.7,
    height: 1.1,
    flying: false,
    gold: 10,
    exp: 16,
    mana: 3,
    drops: [{ id: 'bone_shard', chance: 0.3 }],
  },
  flame_beast: {
    kind: 'flame_beast',
    name: '화염 헬비스트',
    hp: 420,
    speed: 1.4,
    damage: 32,
    range: 8,
    attackCd: 3.6,
    radius: 1.0,
    height: 3.1,
    flying: false,
    gold: 30,
    exp: 50,
    mana: 10,
    drops: [{ id: 'golem_core', chance: 0.6 }],
  },
  wraith_knight: {
    kind: 'wraith_knight',
    name: '망령 기사',
    hp: 2600,
    speed: 3.6,
    damage: 30,
    range: 2.6,
    attackCd: 1.4,
    radius: 0.8,
    height: 3.0,
    flying: false,
    miniboss: true,
    gold: 260,
    exp: 400,
    mana: 25,
    drops: [
      { id: 'elite_sigil', chance: 1 },
      { id: 'golem_core', chance: 0.8 },
    ],
  },
  abyss_lord: {
    kind: 'abyss_lord',
    name: '심연의 군주',
    // 보스 페이즈 배율(체력 2.5, 공격 1.9)을 곱하면 체력 8000, 공격 46
    hp: 3200,
    speed: 2.4,
    damage: 24,
    range: 5,
    attackCd: 2,
    radius: 2.2,
    height: 6.8,
    flying: false,
    boss: true,
    gold: 1600,
    exp: 2200,
    mana: 40,
    drops: [
      { id: 'lord_heart', chance: 1 },
      { id: 'elite_sigil', chance: 1 },
      { id: 'golem_core', chance: 1 },
    ],
  },
};

/** 엘리트: 기본 4종의 강화판 */
export const ELITE_MOD = { hp: 5, damage: 1.5, scale: 1.5, reward: 4 };

import type { MonsterKind } from './monsters';

export interface SpawnGroup {
  kind: MonsterKind;
  count: number;
  elite?: boolean;
}

/** 특별 스테이지 미션: 웨이브 대신 몬스터가 계속 몰려온다. */
export type Mission =
  | { kind: 'survive'; seconds: number }
  | { kind: 'kills'; target: number };

export type Theme = 'day' | 'dusk' | 'night' | 'lava';

export interface PhaseDef {
  id: string;
  name: string;
  type: 'normal' | 'special' | 'boss';
  desc: string;
  /** 이 페이즈를 열려면 먼저 클리어해야 하는 페이즈 */
  requires?: string;
  hpMul: number;
  arenaRadius: number;
  theme: Theme;
  /** 일반·보스 페이즈의 웨이브 */
  waves: SpawnGroup[][];
  /** 특별 스테이지 */
  mission?: Mission;
  /** 특별 스테이지에서 계속 나오는 몬스터 (가중치) */
  spawnPool?: { kind: MonsterKind; weight: number; elite?: boolean }[];
  clearReward: { gold: number; exp: number; materials: Record<string, number>; sweepTickets: number };
}

export const PHASES: PhaseDef[] = [
  {
    id: '1-1',
    name: '버려진 묘지 외곽',
    type: 'normal',
    desc: '묘지에서 깨어난 몬스터들이 몰려온다. 5개의 웨이브를 모두 처치하라.',
    hpMul: 1,
    arenaRadius: 30,
    theme: 'day',
    waves: [
      [{ kind: 'zombie', count: 6 }],
      [
        { kind: 'zombie', count: 6 },
        { kind: 'mage', count: 2 },
      ],
      [
        { kind: 'zombie', count: 5 },
        { kind: 'minion', count: 3 },
      ],
      [
        { kind: 'zombie', count: 6 },
        { kind: 'mage', count: 2 },
        { kind: 'golem', count: 1 },
      ],
      [
        { kind: 'zombie', count: 6 },
        { kind: 'mage', count: 2 },
        { kind: 'minion', count: 3 },
        { kind: 'golem', count: 1 },
        { kind: 'zombie', count: 1, elite: true },
        { kind: 'mage', count: 1, elite: true },
      ],
    ],
    clearReward: { gold: 300, exp: 250, materials: { bone_shard: 5 }, sweepTickets: 1 },
  },
  {
    id: '1-2',
    name: '무너진 예배당',
    type: 'normal',
    desc: '독을 품은 좀비와 화염 마법사가 나타났다. 마지막 웨이브에는 무덤 기사가 기다린다.',
    requires: '1-1',
    hpMul: 1.15,
    arenaRadius: 30,
    theme: 'dusk',
    waves: [
      [
        { kind: 'zombie', count: 5 },
        { kind: 'poison_zombie', count: 3 },
      ],
      [
        { kind: 'zombie', count: 4 },
        { kind: 'fire_mage', count: 2 },
        { kind: 'mage', count: 1 },
      ],
      [
        { kind: 'poison_zombie', count: 4 },
        { kind: 'minion', count: 4 },
        { kind: 'golem', count: 1 },
      ],
      [
        { kind: 'zombie', count: 4 },
        { kind: 'fire_mage', count: 2 },
        { kind: 'grave_knight', count: 1 },
      ],
    ],
    clearReward: { gold: 450, exp: 380, materials: { bone_shard: 6, mana_crystal: 2 }, sweepTickets: 1 },
  },
  {
    id: '1-3',
    name: '끝없는 밤',
    type: 'special',
    desc: '특별 스테이지. 밤새 몰려오는 몬스터를 90초 동안 버텨라. 시간이 지날수록 더 많이 몰려온다.',
    requires: '1-2',
    hpMul: 1.1,
    arenaRadius: 28,
    theme: 'night',
    waves: [],
    mission: { kind: 'survive', seconds: 90 },
    spawnPool: [
      { kind: 'zombie', weight: 6 },
      { kind: 'poison_zombie', weight: 2 },
      { kind: 'mage', weight: 1.2 },
      { kind: 'minion', weight: 2 },
      { kind: 'fire_mage', weight: 0.6 },
      { kind: 'golem', weight: 0.4 },
    ],
    clearReward: { gold: 500, exp: 450, materials: { wing_membrane: 3, mana_crystal: 2 }, sweepTickets: 1 },
  },
  {
    id: '1-4',
    name: '망자의 행렬',
    type: 'special',
    desc: '특별 스테이지. 끝없이 이어지는 망자의 행렬. 몬스터 60마리를 처치하라.',
    requires: '1-3',
    hpMul: 1.2,
    arenaRadius: 30,
    theme: 'dusk',
    waves: [],
    mission: { kind: 'kills', target: 60 },
    spawnPool: [
      { kind: 'zombie', weight: 6 },
      { kind: 'poison_zombie', weight: 3 },
      { kind: 'fire_mage', weight: 1.2 },
      { kind: 'minion', weight: 2 },
      { kind: 'golem', weight: 0.5 },
      { kind: 'zombie', weight: 0.3, elite: true },
    ],
    clearReward: { gold: 600, exp: 520, materials: { golem_core: 2, elite_sigil: 1 }, sweepTickets: 1 },
  },
  {
    id: '1-5',
    name: '골렘 군주의 둥지',
    type: 'boss',
    desc: '묘지 깊은 곳의 골렘 군주. 충격파는 점프로 피하고, 소환된 몬스터를 조심하라.',
    requires: '1-4',
    hpMul: 1,
    arenaRadius: 34,
    theme: 'lava',
    waves: [[{ kind: 'golem_lord', count: 1 }]],
    clearReward: { gold: 800, exp: 600, materials: { elite_sigil: 2, golem_core: 3 }, sweepTickets: 1 },
  },
];

export const PHASE_BY_ID: Record<string, PhaseDef> = Object.fromEntries(PHASES.map((p) => [p.id, p]));

/** 소탕 보상 = 일반 클리어 보상의 30% */
export const SWEEP_RATE = 0.3;
export const SWEEP_TICKET_PRICE = 200;

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

export type Theme = 'day' | 'dusk' | 'night' | 'lava' | 'church' | 'castle';

export interface PhaseDef {
  id: string;
  name: string;
  type: 'normal' | 'special' | 'boss';
  /** 챕터 번호 (게시판에서 묶어 보여 준다) */
  chapter: number;
  desc: string;
  /** 이 페이즈를 열려면 먼저 클리어해야 하는 페이즈 */
  requires?: string;
  hpMul: number;
  /** 몬스터 공격력 배율 (없으면 1) */
  dmgMul?: number;
  /** 맵 가로 길이(px) */
  width: number;
  /** 발판 [왼쪽 x, 윗면 y, 너비] (px). 땅의 윗면은 y=312 */
  platforms: [number, number, number][];
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
    chapter: 1,
    desc: '묘지에서 깨어난 몬스터들이 몰려온다. 5개의 웨이브를 모두 처치하라.',
    hpMul: 1,
    width: 1600,
    platforms: [[220, 250, 160], [520, 200, 128], [760, 250, 192], [1060, 196, 160], [1300, 250, 160]],
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
    chapter: 1,
    desc: '독을 품은 해골과 불타는 구울이 나타났다. 마지막 웨이브에는 악몽마가 달려온다.',
    requires: '1-1',
    hpMul: 1.15,
    width: 1700,
    platforms: [[180, 252, 128], [400, 200, 160], [660, 146, 128], [900, 210, 192], [1180, 250, 128], [1380, 190, 160]],
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
    chapter: 1,
    desc: '특별 스테이지. 밤새 몰려오는 몬스터를 90초 동안 버텨라. 시간이 지날수록 더 많이 몰려온다.',
    requires: '1-2',
    hpMul: 1.1,
    width: 1280,
    platforms: [[140, 250, 160], [420, 196, 192], [760, 196, 192], [1000, 250, 160], [560, 136, 160]],
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
    chapter: 1,
    desc: '특별 스테이지. 끝없이 이어지는 망자의 행렬. 몬스터 60마리를 처치하라.',
    requires: '1-3',
    hpMul: 1.2,
    width: 1600,
    platforms: [[200, 250, 192], [480, 196, 128], [720, 250, 160], [980, 190, 192], [1280, 246, 160]],
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
    name: '악마 군주의 제단',
    type: 'boss',
    chapter: 1,
    desc: '묘지 깊은 곳 제단의 악마 군주. 바닥을 훑는 충격파는 점프로 피하고, 소환된 몬스터를 조심하라.',
    requires: '1-4',
    hpMul: 1,
    width: 1024,
    platforms: [[120, 240, 160], [744, 240, 160], [432, 176, 160]],
    theme: 'lava',
    waves: [[{ kind: 'golem_lord', count: 1 }]],
    clearReward: { gold: 800, exp: 600, materials: { elite_sigil: 2, golem_core: 3 }, sweepTickets: 1 },
  },
];

export const PHASE_BY_ID: Record<string, PhaseDef> = Object.fromEntries(PHASES.map((p) => [p.id, p]));

/** 소탕 보상 = 일반 클리어 보상의 30% */
export const SWEEP_RATE = 0.3;
export const SWEEP_TICKET_PRICE = 200;

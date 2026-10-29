import type { MonsterKind } from './monsters';

export interface SpawnGroup {
  kind: MonsterKind;
  count: number;
  elite?: boolean;
}

export interface PhaseDef {
  id: string;
  name: string;
  type: 'normal' | 'boss';
  desc: string;
  /** 이 페이즈를 열려면 먼저 클리어해야 하는 페이즈 */
  requires?: string;
  hpMul: number;
  arenaRadius: number;
  waves: SpawnGroup[][];
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
    name: '골렘 군주의 둥지',
    type: 'boss',
    desc: '묘지 깊은 곳의 골렘 군주. 충격파는 점프로 피하고, 소환된 몬스터를 조심하라.',
    requires: '1-1',
    hpMul: 1,
    arenaRadius: 34,
    waves: [[{ kind: 'golem_lord', count: 1 }]],
    clearReward: { gold: 800, exp: 600, materials: { elite_sigil: 2, golem_core: 3 }, sweepTickets: 1 },
  },
];

export const PHASE_BY_ID: Record<string, PhaseDef> = Object.fromEntries(PHASES.map((p) => [p.id, p]));

/** 소탕 보상 = 일반 클리어 보상의 30% */
export const SWEEP_RATE = 0.3;
export const SWEEP_TICKET_PRICE = 200;

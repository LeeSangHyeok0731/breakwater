import type { PhaseDef } from './phases';

/**
 * 월드 보스: 마을의 골렘 석상에서 도전한다. 공격하지 않는 거대한 골렘을 3분 동안 때려
 * 99줄짜리 겹친 체력바를 최대한 많이 깬다. 깬 줄마다 보상이 쌓이고, 99에 가까울수록 한 줄 보상이 크다.
 * 하루 3번 도전할 수 있고, 최고 기록으로 소탕(보상만 바로 받기)할 수도 있다. 소탕도 하루 횟수를 쓴다.
 */

export const WORLD_BOSS_NAME = '고대 골렘';
/** 체력바 줄 수 */
export const WORLD_BOSS_BARS = 99;
/** 제한 시간 (초) */
export const WORLD_BOSS_TIME = 180;
/** 하루 도전 횟수 (소탕 포함) */
export const WORLD_BOSS_DAILY = 3;

/** [초안] 첫 줄 체력과 줄마다 늘어나는 비율. 5-5를 막 깬 캐릭터가 40줄쯤 깨도록 맞췄다. */
const FIRST_BAR_HP = 2500;
const BAR_GROWTH = 1.06;

/** n번째 줄(1부터)의 체력 */
export function barHp(n: number): number {
  return Math.round(FIRST_BAR_HP * Math.pow(BAR_GROWTH, n - 1));
}

/** 처음부터 n줄까지 체력의 합 */
const CUMULATIVE: number[] = (() => {
  const out = [0];
  for (let n = 1; n <= WORLD_BOSS_BARS; n++) out.push(out[n - 1] + barHp(n));
  return out;
})();

export const WORLD_BOSS_HP = CUMULATIVE[WORLD_BOSS_BARS];

/** 준 피해로 몇 줄을 깼는지, 지금 줄이 얼마나 남았는지 */
export function barProgress(damage: number): { broken: number; left: number } {
  let broken = 0;
  while (broken < WORLD_BOSS_BARS && damage >= CUMULATIVE[broken + 1]) broken++;
  if (broken >= WORLD_BOSS_BARS) return { broken, left: 0 };
  const into = damage - CUMULATIVE[broken];
  return { broken, left: 1 - into / barHp(broken + 1) };
}

export interface Reward {
  gold: number;
  materials: Record<string, number>;
  sweepTickets: number;
}

/** [초안] n번째 줄을 깼을 때 받는 보상. 뒤 줄일수록 골드가 늘고, 비싼 재료가 차례로 열린다. */
export function barReward(n: number): Reward {
  const m: Record<string, number> = {};
  const add = (id: string, k: number): void => {
    if (k > 0) m[id] = (m[id] ?? 0) + k;
  };
  add('bone_shard', 2 + Math.floor(n / 20));
  add('mana_crystal', n % 2 === 0 ? 1 : 0);
  if (n >= 10) add('golem_core', 1);
  if (n >= 20 && n % 3 === 0) add('elite_sigil', 1);
  if (n >= 40 && n % 5 === 0) add('lord_heart', 1);
  if (n >= 50 && n % 10 === 0) {
    add('silence_shard', 2);
    add('corrupt_shard', 2);
    add('dark_shard', 2);
  }
  if (n >= 60 && n % 5 === 0) add('angel_feather', 1);
  if (n >= 80 && n % 5 === 0) add('abyss_shard', 1);
  if (n === WORLD_BOSS_BARS) add('hope_shard', 1);
  return { gold: 60 + 12 * n, materials: m, sweepTickets: n % 10 === 0 ? 1 : 0 };
}

/** 1줄부터 bars줄까지 깼을 때의 보상 합계 */
export function totalReward(bars: number): Reward {
  const out: Reward = { gold: 0, materials: {}, sweepTickets: 0 };
  for (let n = 1; n <= Math.min(bars, WORLD_BOSS_BARS); n++) {
    const r = barReward(n);
    out.gold += r.gold;
    out.sweepTickets += r.sweepTickets;
    for (const [id, k] of Object.entries(r.materials)) out.materials[id] = (out.materials[id] ?? 0) + k;
  }
  return out;
}

/** 보상표에서 보여 줄 구간: 이 줄부터 열리는 보상 */
export const REWARD_TIERS: { from: number; text: string }[] = [
  { from: 1, text: '골드 (줄마다 증가) · 부서진 뼛조각 · 마력 결정' },
  { from: 10, text: '골렘 핵 조각 · 10줄마다 소탕권' },
  { from: 20, text: '정예의 증표' },
  { from: 40, text: '군주의 심장석' },
  { from: 50, text: '군단장 조각 3종 (10줄마다)' },
  { from: 60, text: '타락천사의 깃털' },
  { from: 80, text: '심연의 파편' },
  { from: 99, text: '희망의 조각' },
];

/** 오늘 날짜 (하루 횟수를 되돌리는 기준, 기기 시간) */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 월드 보스 전투용 페이즈 (맵 한가운데 골렘 하나) */
export function worldBossPhase(): PhaseDef {
  return {
    id: 'W-golem',
    name: WORLD_BOSS_NAME,
    type: 'boss',
    chapter: 0,
    desc: '3분 동안 최대한 많은 줄을 깨라.',
    hpMul: 1,
    dmgMul: 1,
    width: 760,
    platforms: [],
    theme: 'castle',
    waves: [[{ kind: 'world_golem', count: 1 }]],
    clearReward: { gold: 0, exp: 0, materials: {}, sweepTickets: 0 },
  };
}

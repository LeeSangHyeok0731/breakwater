// 전투 코드가 함께 쓰는 도우미. 히트박스는 플레이어 앞쪽의 사각형이다.

import type { BattleScene, HitOpts } from '../battleScene';
import type { ActionKind } from '../player2d';
import { meleeLook } from '../weaponArt';
import type { SlashStyle } from '../fxArt';
import type { Palette3 } from '../vfx';

/** 이 동작 중에는 스킬로 끊을 수 없다 (채널링). */
export const CHANNELS: ReadonlySet<ActionKind> = new Set(['laser', 'barrage', 'volley', 'snipe']);

/**
 * 플레이어 앞쪽 사각형 안의 적을 때린다.
 * forward: 몸 가운데에서 앞쪽으로 시작하는 거리, up: 몸 가운데 기준 위쪽 오프셋.
 */
export function box(b: BattleScene, forward: number, w: number, h: number, up: number, damage: number, opts: HitOpts = {}): number {
  const p = b.player;
  const x0 = p.facing === 1 ? p.x + forward : p.x - forward - w;
  const y0 = p.y - up - h / 2;
  return b.hitArea(x0, y0, w, h, damage, opts);
}

/** 몸을 가운데로 양옆까지 */
export function around(b: BattleScene, w: number, h: number, up: number, damage: number, opts: HitOpts = {}): number {
  const p = b.player;
  return b.hitArea(p.x - w / 2, p.y - up - h / 2, w, h, damage, opts);
}

/** 동작 사이에 넘겨주는 값. cleaveCharge: 차징 횡베기를 모은 정도 (입력 처리에서 정하고 타격에서 쓴다), laserTick: 레이저의 다음 판정까지 남은 시간 */
export const combatState = { cleaveCharge: 0, laserTick: 0 };

/** 지금 든 근접 무기의 잔상 생김새 (기운이 없는 무기는 기본 붓결) */
export function slashStyle(b: BattleScene): SlashStyle {
  return meleeLook(b.player.weapon.def).aura ?? 'plain';
}

/** 무기의 개성이 드러나는 휘두르기 연출: 화염검은 불씨, 월광도는 달빛 가루, 강철 장검은 칼끝 반짝임 */
export function swingFx(b: BattleScene, x: number, y: number): void {
  switch (meleeLook(b.player.weapon.def).aura) {
    case 'flame':
      b.fx.embers(x, y, 0xff7a1a, 8, 18, 34, 500);
      b.fx.burst(x, y, 0xffc040, 6, 110, 320);
      break;
    case 'moon':
      b.fx.burst(x, y, 0xbfd4ff, 8, 70, 450);
      b.fx.spark(x, y - 6, 0xbfd4ff, 1, Math.PI / 4);
      break;
    case 'steel':
      b.fx.spark(x + b.player.facing * 6, y - 12, 0xffffff);
      break;
    case 'blood':
      // 핏방울이 흩어지며 떨어진다.
      b.fx.burst(x, y, 0xff3a4a, 9, 90, 480, 1, 420);
      b.fx.spark(x, y, 0xff5a6a);
      break;
    case 'holy':
      b.fx.embers(x, y, 0xffe08a, 8, 18, 40, 600);
      b.fx.spark(x, y - 4, 0xfff0b0, 2);
      break;
    case 'thunder': {
      const f = b.player.facing;
      b.fx.lightning(x - f * 14, y - 16, x + f * 26, y + 8, 0x9fe8ff, 1, 140);
      b.fx.spark(x + f * 20, y, 0xdff8ff);
      break;
    }
  }
}

/** 평타의 사거리 배율 [초안]: 검사는 더 멀리 닿는다. */
const SWORD_REACH = 1.5;
const DAO_REACH = 1.2;
/** 평타 잔상을 앞으로 길게 빼는 비율 [가로, 세로]. 반달이 아니라 길쭉한 궤적이 된다. */
export const LONG: [number, number] = [1.35, 0.8];

export function swordReach(p: BattleScene['player'], v: number): number {
  return v * (p.weapon.def.type === 'sword' ? SWORD_REACH : DAO_REACH);
}

/** 한 색에서 진함 · 밝음 · 거의 하양의 세 단계 팔레트를 만든다. */
export function palOf(c: number): Palette3 {
  const mix = (t: number): number => {
    const ch = (s: number): number => Math.round(((c >> s) & 255) * (1 - t) + 255 * t);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };
  return [c, mix(0.45), mix(0.85)];
}

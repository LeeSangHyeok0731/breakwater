// 상급·궁극 스킬이 함께 쓰는 도우미.
// "화면 안"은 지금 카메라에 보이는 범위다. 연출은 시간차(delayedCall)로 이어 붙인다.

import Phaser from 'phaser';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import type { Monster } from '../monster2d';

export type Cast = (b: BattleScene) => void;

/** 도탄·연쇄 번개가 다음 적으로 튕겨 가는 최대 거리 (px) */
export const CHAIN_RANGE = 380;

/** 카메라에 보이는 범위 */
export function view(b: BattleScene): Phaser.Geom.Rectangle {
  return b.cameras.main.worldView;
}

/** 화면 안의 살아 있는 적 */
export function onScreen(b: BattleScene, pad = 12): Monster[] {
  const v = view(b);
  return b.monsters.filter((m) => m.alive && m.x > v.x - pad && m.x < v.right + pad);
}

/** ms 뒤에 실행한다 (전투가 끝났거나 쓰러졌으면 건너뛴다). */
export function later(b: BattleScene, ms: number, fn: () => void): void {
  b.time.delayedCall(ms, () => {
    if (!b.player.dead) fn();
  });
}

/** 하늘에 마법진 셋을 나란히 연다 (하나를 화면만큼 키우면 도트가 뭉개진다). */
export function skyCircles(b: BattleScene, color: number, ms: number): Phaser.GameObjects.Sprite[] {
  const v = view(b);
  return [0.18, 0.5, 0.82].map((k, i) => b.fx.circle(v.x + v.width * k, v.y + 28 + (i === 1 ? -6 : 0), color, i === 1 ? 210 : 170, ms, false, DEPTH.fx));
}

/** 위에서 아래로 떨어지는 그림 (영검·화살·포탄·운석) */
export function drop(b: BattleScene, key: string, x0: number, y0: number, x1: number, y1: number, ms: number, onLand: () => void, tint?: number, trail?: number): void {
  // 화살 그림은 오른쪽을, 나머지(영검·포탄)는 아래를 향해 그려져 있다.
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const s = b.add.image(x0, y0, key).setDepth(DEPTH.projectile).setRotation(key === 'fx-arrow' ? ang : ang - Math.PI / 2);
  if (tint !== undefined) s.setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
  const tail = trail !== undefined ? b.fx.streak(x0, y0, Math.atan2(y1 - y0, x1 - x0), 34, trail, 0, 1) : null;
  b.tweens.add({
    targets: tail ? [s, tail] : s,
    x: x1,
    y: y1,
    duration: ms,
    ease: 'Quad.In',
    onComplete: () => {
      s.destroy();
      tail?.destroy();
      onLand();
    },
  });
}

/** 궁극기 중에 머리 위·화면에 띄우는 글자 */
export function ultText(b: BattleScene, size: number, color: string): Phaser.GameObjects.Text {
  return b.add
    .text(0, 0, '', { fontFamily: '"Black Han Sans", "Malgun Gothic", sans-serif', fontSize: `${size}px`, color, stroke: '#140608', strokeThickness: 4, resolution: 3 })
    .setOrigin(0.5)
    .setDepth(DEPTH.text);
}

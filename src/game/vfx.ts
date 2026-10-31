import Phaser from 'phaser';
import { DEPTH } from './fx';

/**
 * 스킬용 대형 이펙트. 도트 텍스처를 크게 늘리면 뭉개지므로, 큰 모양(충격파·빛살·초승달·빛기둥)은
 * 벡터 그래픽에 ADD 혼합으로 겹겹이 그리고, 작은 알갱이는 기존 Fx를 쓴다.
 * 색은 팔레트 [진한 색, 밝은 색, 강조색]으로 받아 바깥은 진하게, 안쪽은 밝게, 심은 하얗게 칠한다.
 */

export type Palette3 = [number, number, number];

/** 스킬 계열별 팔레트: 진함 · 밝음 · 강조 */
export const PAL = {
  sky: [0x2a7aff, 0x8fe0ff, 0xffffff] as Palette3,
  gold: [0xff8a1a, 0xffd060, 0xfff6c0] as Palette3,
  crimson: [0xd01a3a, 0xff6a6a, 0xffd0d0] as Palette3,
  flame: [0xff3a00, 0xffa020, 0xfff080] as Palette3,
  violet: [0x7a2aff, 0xc080ff, 0xffe0ff] as Palette3,
  moon: [0xff4a1a, 0xffa040, 0xfff0d0] as Palette3,
  frost: [0x2a9aff, 0x9ff0ff, 0xffffff] as Palette3,
  jade: [0x1ac87a, 0x8affc0, 0xe8fff0] as Palette3,
  arcane: [0x1a8aff, 0x7fe8ff, 0xe0ffff] as Palette3,
  rose: [0xff2a8a, 0xff8ad0, 0xffe0f0] as Palette3,
};

const ADD = Phaser.BlendModes.ADD;

/** 0→1로 흐르는 값으로 매 프레임 다시 그리는 그래픽. 끝나면 지운다. */
function animate(scene: Phaser.Scene, ms: number, draw: (g: Phaser.GameObjects.Graphics, k: number) => void, depth = DEPTH.fx + 1, delay = 0): void {
  const g = scene.add.graphics().setDepth(depth).setBlendMode(ADD);
  draw(g, 0);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: ms,
    delay,
    onUpdate: (tw) => {
      g.clear();
      draw(g, tw.getValue() ?? 1);
    },
    onComplete: () => g.destroy(),
  });
}

const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3);

/** 땅을 따라 납작하게, 또는 둥글게 퍼지는 충격파 (두 겹: 색 + 하얀 심) */
export function shockwave(scene: Phaser.Scene, x: number, y: number, radius: number, pal: Palette3, ms = 420, flat = 0.32, thick = 8): void {
  animate(scene, ms, (g, k) => {
    const r = 6 + radius * easeOut(k);
    const a = 1 - k;
    g.lineStyle(thick * 2.4 * (1 - k * 0.5), pal[0], 0.55 * a).strokeEllipse(x, y, r * 2, r * 2 * flat);
    g.lineStyle(thick * (1 - k * 0.6), pal[1], 0.85 * a).strokeEllipse(x, y, r * 2, r * 2 * flat);
    g.lineStyle(Math.max(1, thick * 0.3), pal[2], a).strokeEllipse(x, y, r * 2, r * 2 * flat);
  });
}

/** 한 점에서 사방으로 뻗는 빛살 */
export function rays(scene: Phaser.Scene, x: number, y: number, count: number, length: number, pal: Palette3, ms = 380, spin = Math.random() * Math.PI): void {
  const angles = Array.from({ length: count }, (_, i) => spin + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3);
  const lens = angles.map(() => length * (0.6 + Math.random() * 0.6));
  animate(scene, ms, (g, k) => {
    const grow = easeOut(Math.min(1, k * 2.2));
    const a = 1 - Math.max(0, (k - 0.35) / 0.65);
    angles.forEach((ang, i) => {
      const len = lens[i] * grow;
      const w = 7 * (1 - k * 0.7);
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const nx = -cy * w;
      const ny = cx * w;
      g.fillStyle(i % 2 ? pal[0] : pal[1], 0.75 * a);
      g.fillTriangle(x + nx, y + ny, x - nx, y - ny, x + cx * len, y + cy * len);
      g.fillStyle(pal[2], 0.9 * a);
      g.fillTriangle(x + nx * 0.3, y + ny * 0.3, x - nx * 0.3, y - ny * 0.3, x + cx * len * 0.7, y + cy * len * 0.7);
    });
  });
}

/** 둥근 섬광: 바깥은 진한 색, 안은 하얗게 확 부풀었다 사라진다. */
export function flare(scene: Phaser.Scene, x: number, y: number, radius: number, pal: Palette3, ms = 300): void {
  animate(scene, ms, (g, k) => {
    const r = radius * (0.4 + 0.6 * easeOut(Math.min(1, k * 2)));
    const a = 1 - k;
    g.fillStyle(pal[0], 0.45 * a).fillCircle(x, y, r * 1.5);
    g.fillStyle(pal[1], 0.5 * a).fillCircle(x, y, r);
    g.fillStyle(pal[2], 0.9 * a).fillCircle(x, y, r * 0.45);
  });
}

/**
 * 거대한 초승달 참격: 바깥 진한 색 → 밝은 색 → 하얀 심의 세 겹 호가 휘둘러지듯 그려졌다 사라진다.
 * from/to는 각도(라디안, 오른쪽을 볼 때 기준), facing으로 좌우를 뒤집는다.
 */
export function crescent(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 1 | -1,
  radius: number,
  pal: Palette3,
  o: { from?: number; to?: number; thick?: number; ms?: number; squash?: number } = {},
): void {
  const from = o.from ?? -1.5;
  const to = o.to ?? 1.3;
  const thick = o.thick ?? radius * 0.32;
  const ms = o.ms ?? 300;
  const sq = o.squash ?? 1;
  const pt = (ang: number, r: number): [number, number] => [x + Math.cos(ang) * r * facing, y + Math.sin(ang) * r * sq];
  animate(scene, ms, (g, k) => {
    // 처음 30%는 휘두르며 그어지고, 나머지는 얇아지며 사라진다.
    const sweep = easeOut(Math.min(1, k / 0.3));
    const end = from + (to - from) * sweep;
    const fade = 1 - Math.max(0, (k - 0.3) / 0.7);
    const steps = 28;
    /** 가운데가 두껍고 양 끝이 뾰족한 초승달 모양을 채워 그린다. */
    const layer = (w: number, color: number, alpha: number, rOff: number): void => {
      const outer: Phaser.Math.Vector2[] = [];
      const inner: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = from + ((end - from) * i) / steps;
        const t = (w * Math.sin((i / steps) * Math.PI) * fade) / 2;
        const [ox, oy] = pt(a, radius + rOff + t);
        const [ix, iy] = pt(a, radius + rOff - t);
        outer.push(new Phaser.Math.Vector2(ox, oy));
        inner.push(new Phaser.Math.Vector2(ix, iy));
      }
      g.fillStyle(color, alpha).fillPoints([...outer, ...inner.reverse()], true);
    };
    layer(thick * 2.2, pal[0], 0.55, -thick * 0.25);
    layer(thick * 1.2, pal[1], 0.9, 0);
    layer(thick * 0.4, pal[2], 1, thick * 0.2);
  });
}

/** 하늘까지 솟는 빛기둥: 넓은 진한 빛 + 밝은 기둥 + 하얀 심, 위로 빛 알갱이 */
export function column(scene: Phaser.Scene, x: number, footY: number, width: number, height: number, pal: Palette3, ms = 600): void {
  animate(scene, ms, (g, k) => {
    const open = easeOut(Math.min(1, k * 4));
    const a = 1 - Math.max(0, (k - 0.4) / 0.6);
    const w = width * open * (1 - Math.max(0, k - 0.6));
    g.fillStyle(pal[0], 0.45 * a).fillRect(x - w, footY - height, w * 2, height);
    g.fillStyle(pal[1], 0.6 * a).fillRect(x - w * 0.55, footY - height, w * 1.1, height);
    g.fillStyle(pal[2], 0.95 * a).fillRect(x - w * 0.18, footY - height, w * 0.36, height);
    g.fillStyle(pal[1], 0.5 * a).fillEllipse(x, footY, w * 4, w * 0.9);
  });
}

/** 여러 색이 섞인 알갱이 폭발 (팔레트에서 골라 뿌린다) */
export function shards(scene: Phaser.Scene, x: number, y: number, pal: Palette3, count = 24, speed = 220, life = 520): void {
  for (let i = 0; i < count; i++) {
    const c = pal[i % 3];
    const p = scene.add.image(x, y, 'fx-px').setTint(c).setDepth(DEPTH.fx + 1).setBlendMode(ADD);
    p.setScale(1 + Math.round(Math.random() * 3));
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.9);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * v * (life / 1000),
      y: y + Math.sin(a) * v * (life / 1000),
      scale: 0,
      alpha: 0.2,
      duration: life * (0.6 + Math.random() * 0.6),
      ease: 'Quad.Out',
      onComplete: () => p.destroy(),
    });
  }
}

/** 화면을 그 색으로 물들였다 빠진다 (가장자리를 더 진하게). */
export function tint(scene: Phaser.Scene, color: number, alpha = 0.25, ms = 400): void {
  const cam = scene.cameras.main;
  const r = scene.add.rectangle(0, 0, cam.width, cam.height, color, alpha).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.text - 2).setBlendMode(ADD);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => r.destroy() });
}

/** 큰 일격을 한 번에: 섬광 + 빛살 + 충격파 + 알갱이 */
export function impactBurst(scene: Phaser.Scene, x: number, y: number, size: number, pal: Palette3, groundY?: number): void {
  flare(scene, x, y, size * 0.6, pal, 260);
  rays(scene, x, y, 10, size * 1.4, pal, 360);
  shards(scene, x, y, pal, Math.round(size / 3), size * 4, 520);
  shockwave(scene, x, groundY ?? y, size * 1.6, pal, 440, groundY !== undefined ? 0.3 : 1);
}

/** 발밑에서 커지는 마법진 고리 여러 겹과 위로 오르는 빛 (버프·시전) */
export function aura(scene: Phaser.Scene, x: number, footY: number, pal: Palette3, size = 60): void {
  for (let i = 0; i < 3; i++) shockwave(scene, x, footY, size + i * 26, pal, 520 + i * 120, 0.3, 6 - i);
  column(scene, x, footY, 14, 170, pal, 700);
  shards(scene, x, footY - 30, pal, 20, 140, 700);
}

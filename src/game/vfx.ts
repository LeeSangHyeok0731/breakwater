import Phaser from 'phaser';
import { DEPTH } from './fx';

/**
 * 스킬용 대형 이펙트. 도트 텍스처를 크게 늘리면 뭉개지므로, 큰 모양(충격파·빛살·초승달·빛기둥)은
 * 벡터 그래픽에 ADD 혼합으로 겹겹이 그리고, 작은 알갱이는 기존 Fx를 쓴다.
 * 색은 팔레트 [진한 색, 밝은 색, 강조색]으로 받아 바깥은 진하게, 안쪽은 밝게, 심은 하얗게 칠한다.
 *
 * 컴퍼스와 자로 그린 듯한 원·직선은 딱딱해 보이므로, 모양마다 불규칙함을 넣는다:
 * 고리는 군데군데 끊기고, 빛살은 굵기와 길이가 제각각이며, 참격은 칼끝으로 갈수록 뻗고 결이 갈라진다.
 * 불규칙함은 이펙트를 만들 때 한 번 뽑아 두어, 사는 동안 모양이 튀지 않게 한다.
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
const TAU = Math.PI * 2;
type V2 = Phaser.Math.Vector2;
const v2 = (x: number, y: number): V2 => new Phaser.Math.Vector2(x, y);

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

/**
 * 땅을 따라 납작하게, 또는 둥글게 퍼지는 충격파.
 * 부드러운 바깥 빛 위에 끊어진 고리 조각들이 저마다 조금씩 다른 속도로 퍼지고, 그 앞으로 짧은 파편이 튄다.
 */
export function shockwave(scene: Phaser.Scene, x: number, y: number, radius: number, pal: Palette3, ms = 420, flat = 0.32, thick = 8): void {
  const N = radius > 110 ? 11 : 8;
  const segs = Array.from({ length: N }, (_, i) => ({
    a0: (i / N) * TAU + Math.random() * 0.25,
    len: (TAU / N) * (0.5 + Math.random() * 0.42),
    wob: 0.94 + Math.random() * 0.12,
    lag: Math.random() * 0.16,
  }));
  const spikes = Array.from({ length: N }, () => ({ a: Math.random() * TAU, len: 0.08 + Math.random() * 0.16 }));
  animate(scene, ms, (g, k) => {
    const r = 6 + radius * easeOut(k);
    const a = 1 - k;
    g.lineStyle(thick * 2.4 * (1 - k * 0.5), pal[0], 0.4 * a).strokeEllipse(x, y, r * 2, r * 2 * flat);
    for (const s of segs) {
      const rr = r * s.wob * (1 - s.lag * (1 - k));
      const len = s.len * (1 - k * 0.5);
      const pts: V2[] = [];
      for (let i = 0; i <= 6; i++) {
        const ang = s.a0 + (len * i) / 6;
        pts.push(v2(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * flat));
      }
      g.lineStyle(thick * (1 - k * 0.6), pal[1], 0.85 * a).strokePoints(pts);
      g.lineStyle(Math.max(1, thick * 0.3), pal[2], a).strokePoints(pts);
    }
    // 고리 앞으로 튀는 짧은 파편
    g.lineStyle(Math.max(1, thick * 0.25), pal[1], 0.8 * a);
    for (const s of spikes) {
      const r0 = r * 1.03;
      const r1 = r * (1.03 + s.len * (1 - k * 0.6));
      const c = Math.cos(s.a);
      const sn = Math.sin(s.a) * flat;
      g.lineBetween(x + c * r0, y + sn * r0, x + c * r1, y + sn * r1);
    }
  });
}

/** 한 점에서 사방으로 뻗는 빛살. 굵기와 길이가 제각각이고, 가운데는 비워 터져 나가는 느낌을 낸다. */
export function rays(scene: Phaser.Scene, x: number, y: number, count: number, length: number, pal: Palette3, ms = 380, spin = Math.random() * Math.PI): void {
  const list = Array.from({ length: count }, (_, i) => ({
    ang: spin + (i / count) * TAU + (Math.random() - 0.5) * 0.45,
    len: length * (0.45 + Math.random() * 0.8),
    w: 3 + Math.random() * 6,
    ph: Math.random() * TAU,
  }));
  animate(scene, ms, (g, k) => {
    const grow = easeOut(Math.min(1, k * 2.2));
    const a = 1 - Math.max(0, (k - 0.35) / 0.65);
    list.forEach((ray, i) => {
      const len = ray.len * grow * (1 + 0.07 * Math.sin(k * 38 + ray.ph));
      const w = ray.w * (1 - k * 0.7);
      const cx = Math.cos(ray.ang);
      const cy = Math.sin(ray.ang);
      // 뿌리는 중심에서 조금 떨어져 시작하고, 시간이 갈수록 바깥으로 밀려난다.
      const r0 = len * (0.1 + 0.35 * k);
      const rm = r0 + (len - r0) * 0.28;
      const bx = x + cx * r0;
      const by = y + cy * r0;
      const mx = x + cx * rm;
      const my = y + cy * rm;
      const tx = x + cx * len;
      const ty = y + cy * len;
      const diamond = (hw: number, color: number, alpha: number): void => {
        const nx = -cy * hw;
        const ny = cx * hw;
        g.fillStyle(color, alpha);
        g.fillTriangle(bx, by, mx + nx, my + ny, tx, ty);
        g.fillTriangle(bx, by, mx - nx, my - ny, tx, ty);
      };
      diamond(w, i % 2 ? pal[0] : pal[1], 0.75 * a);
      diamond(w * 0.35, pal[2], 0.9 * a);
    });
  });
}

/** 섬광: 일렁이는 불규칙한 빛 덩어리가 확 부풀었다 사라지고, 가로세로로 가는 빛줄기가 스친다. */
export function flare(scene: Phaser.Scene, x: number, y: number, radius: number, pal: Palette3, ms = 300): void {
  const M = 12;
  const lump = Array.from({ length: M }, () => 0.78 + Math.random() * 0.4);
  const ph = Array.from({ length: M }, () => Math.random() * TAU);
  const tilt = (Math.random() - 0.5) * 0.5;
  animate(scene, ms, (g, k) => {
    const r = radius * (0.4 + 0.6 * easeOut(Math.min(1, k * 2)));
    const a = 1 - k;
    const blob = (rr: number, color: number, alpha: number): void => {
      const pts: V2[] = [];
      for (let i = 0; i < M; i++) {
        const ang = (i / M) * TAU;
        const q = rr * lump[i] * (1 + 0.1 * Math.sin(k * 30 + ph[i]));
        pts.push(v2(x + Math.cos(ang) * q, y + Math.sin(ang) * q));
      }
      g.fillStyle(color, alpha).fillPoints(pts, true);
    };
    blob(r * 1.5, pal[0], 0.45 * a);
    blob(r, pal[1], 0.5 * a);
    blob(r * 0.45, pal[2], 0.9 * a);
    // 렌즈에 맺히는 빛줄기
    const streak = (ang: number, len: number, hw: number): void => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      g.fillStyle(pal[2], 0.85 * a);
      g.fillTriangle(x - c * len, y - s * len, x - s * hw, y + c * hw, x + s * hw, y - c * hw);
      g.fillTriangle(x + c * len, y + s * len, x - s * hw, y + c * hw, x + s * hw, y - c * hw);
    };
    const open = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    streak(tilt, r * 2.6 * open, r * 0.12);
    streak(tilt + Math.PI / 2, r * 1.5 * open, r * 0.09);
  });
}

/**
 * 거대한 참격: 정확한 반달이 아니라, 휘두르기 시작은 몸 가까이에서 칼끝으로 갈수록 멀리 뻗는 궤적.
 * 머리(칼끝)는 뾰족하고 꼬리는 길게 가늘어지며, 안쪽에는 갈라진 결이 따라 흐른다. 다 그어지면 꼬리부터 빠져나가며 사라진다.
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
  /** u = 전체 휘두르기에서의 위치 (0 시작 → 1 끝). 끝으로 갈수록 반지름이 커진다. */
  const pt = (u: number, rOff: number): V2 => {
    const ang = from + (to - from) * u;
    const r = radius * (1 + 0.24 * (u - 0.6)) + rOff;
    return v2(x + Math.cos(ang) * r * facing, y + Math.sin(ang) * r * sq);
  };
  /** 안쪽 결: [반지름 안쪽 거리 비율, 시작, 끝, 굵기] */
  const strands = Array.from({ length: 6 }, (_, i) => ({
    off: 0.45 + i * 0.22 + Math.random() * 0.12,
    s0: Math.random() * 0.45,
    s1: 0.6 + Math.random() * 0.36,
    w: 1 + Math.random() * 1.6,
  }));
  animate(scene, ms, (g, k) => {
    // 처음 30%는 휘두르며 그어지고, 나머지는 꼬리가 머리를 따라가며 가늘어진다.
    const head = easeOut(Math.min(1, k / 0.3));
    const late = Math.max(0, (k - 0.3) / 0.7);
    const tail = late * 0.55;
    const fade = 1 - late;
    const steps = 26;
    const layer = (w: number, color: number, alpha: number, rOff: number): void => {
      const outer: V2[] = [];
      const inner: V2[] = [];
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const u = tail + (head - tail) * s;
        // 머리 쪽에 치우친 두께
        const t = (w * Math.pow(Math.sin(Math.PI * Math.pow(s, 1.5)), 0.8) * (0.35 + 0.65 * fade)) / 2;
        outer.push(pt(u, rOff + t));
        inner.push(pt(u, rOff - t));
      }
      g.fillStyle(color, alpha).fillPoints([...outer, ...inner.reverse()], true);
    };
    layer(thick * 2.2, pal[0], 0.55, -thick * 0.25);
    layer(thick * 1.2, pal[1], 0.9, 0);
    layer(thick * 0.4, pal[2], 1, thick * 0.2);
    for (const st of strands) {
      const u0 = tail + (head - tail) * st.s0;
      const u1 = tail + (head - tail) * st.s1;
      if (u1 - u0 < 0.04) continue;
      const pts: V2[] = [];
      for (let i = 0; i <= 10; i++) pts.push(pt(u0 + ((u1 - u0) * i) / 10, -thick * st.off));
      g.lineStyle(st.w, pal[1], 0.55 * fade).strokePoints(pts);
    }
  });
}

/**
 * 하늘까지 솟는 빛기둥: 위로 갈수록 좁아지며 일렁이고, 안팎으로 가는 빛줄기가 빠르게 타고 오른다.
 */
export function column(scene: Phaser.Scene, x: number, footY: number, width: number, height: number, pal: Palette3, ms = 600): void {
  const strands = Array.from({ length: 7 }, () => ({
    dx: (Math.random() - 0.5) * 2.6,
    ph: Math.random(),
    sp: 1.5 + Math.random() * 2,
    len: 0.12 + Math.random() * 0.2,
    bright: Math.random() < 0.4,
  }));
  const ph = Math.random() * TAU;
  animate(scene, ms, (g, k) => {
    const open = easeOut(Math.min(1, k * 4));
    const a = 1 - Math.max(0, (k - 0.4) / 0.6);
    const w = width * open * (1 - Math.max(0, k - 0.6)) * (1 + 0.07 * Math.sin(k * 46 + ph));
    const top = footY - height;
    /** 아래가 넓고 위가 좁은 기둥 한 겹 */
    const beam = (hw: number, color: number, alpha: number, taper: number): void => {
      g.fillStyle(color, alpha).fillPoints([v2(x - hw, footY), v2(x + hw, footY), v2(x + hw * taper, top), v2(x - hw * taper, top)], true);
    };
    beam(w, pal[0], 0.45 * a, 0.5);
    beam(w * 0.55, pal[1], 0.6 * a, 0.55);
    beam(w * 0.18, pal[2], 0.95 * a, 0.7);
    for (const s of strands) {
      const t = (k * s.sp + s.ph) % 1;
      const y0 = footY - height * t;
      const y1 = Math.max(top, y0 - height * s.len);
      const sx = x + s.dx * w * (1 - t * 0.45);
      g.lineStyle(s.bright ? 2 : 1, s.bright ? pal[2] : pal[1], (s.bright ? 0.9 : 0.6) * a * (1 - t * 0.5)).lineBetween(sx, y0, sx, y1);
    }
    g.fillStyle(pal[1], 0.5 * a).fillEllipse(x, footY, w * 4, w * 0.9);
    g.fillStyle(pal[2], 0.6 * a).fillEllipse(x, footY, w * 1.8, w * 0.4);
  });
}

/** 여러 색이 섞인 파편 폭발: 네모 알갱이와, 날아가는 쪽으로 길쭉한 빛 조각이 섞여 튄다. */
export function shards(scene: Phaser.Scene, x: number, y: number, pal: Palette3, count = 24, speed = 220, life = 520): void {
  for (let i = 0; i < count; i++) {
    const c = pal[i % 3];
    const a = Math.random() * TAU;
    const v = speed * (0.4 + Math.random() * 0.9);
    const tx = x + Math.cos(a) * v * (life / 1000);
    const ty = y + Math.sin(a) * v * (life / 1000);
    const duration = life * (0.6 + Math.random() * 0.6);
    if (i % 2) {
      const len = 6 + Math.random() * 10;
      const p = scene.add.image(x, y, 'fx-streak').setOrigin(1, 0.5).setTint(c).setDepth(DEPTH.fx + 1).setBlendMode(ADD).setRotation(a).setScale(len / 32, 1 + Math.round(Math.random()));
      scene.tweens.add({ targets: p, x: tx, y: ty, scaleX: 0.05, alpha: 0.2, duration, ease: 'Quad.Out', onComplete: () => p.destroy() });
    } else {
      const p = scene.add.image(x, y, 'fx-px').setTint(c).setDepth(DEPTH.fx + 1).setBlendMode(ADD);
      p.setScale(1 + Math.round(Math.random() * 3));
      scene.tweens.add({ targets: p, x: tx, y: ty, scale: 0, alpha: 0.2, duration, ease: 'Quad.Out', onComplete: () => p.destroy() });
    }
  }
}

/** 화면을 그 색으로 물들였다 빠진다 (가장자리를 더 진하게). */
export function tint(scene: Phaser.Scene, color: number, alpha = 0.25, ms = 400): void {
  const cam = scene.cameras.main;
  const r = scene.add.rectangle(0, 0, cam.width, cam.height, color, alpha).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.text - 2).setBlendMode(ADD);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => r.destroy() });
}

/** 도트로 그린 터지는 고리 (fxArt의 fx-pop) */
export function pop(scene: Phaser.Scene, x: number, y: number, color: number, scale = 1): void {
  const s = scene.add.sprite(x, y, 'fx-pop').setTint(color).setDepth(DEPTH.fx + 1).setBlendMode(ADD).setScale(scale).setRotation(Math.random() * TAU);
  s.play('fx-pop');
  s.once('animationcomplete', () => s.destroy());
}

/** 주변에 시차를 두고 반짝이는 작은 별들 (fxArt의 fx-twinkle) */
export function twinkles(scene: Phaser.Scene, x: number, y: number, spread: number, color: number, count = 4, within = 260): void {
  for (let i = 0; i < count; i++) {
    const s = scene.add
      .sprite(x + (Math.random() - 0.5) * 2 * spread, y + (Math.random() - 0.5) * 2 * spread, 'fx-twinkle')
      .setTint(color)
      .setDepth(DEPTH.fx + 2)
      .setBlendMode(ADD)
      .setScale(Math.random() < 0.3 ? 2 : 1)
      .setVisible(false);
    s.once('animationcomplete', () => s.destroy());
    scene.time.delayedCall(Math.random() * within, () => {
      if (s.active) s.setVisible(true).play('fx-twinkle');
    });
  }
}

/** 큰 일격을 한 번에: 섬광 + 빛살 + 충격파 + 파편 + 터지는 고리와 별빛 */
export function impactBurst(scene: Phaser.Scene, x: number, y: number, size: number, pal: Palette3, groundY?: number): void {
  flare(scene, x, y, size * 0.6, pal, 260);
  rays(scene, x, y, 10, size * 1.4, pal, 360);
  shards(scene, x, y, pal, Math.round(size / 3), size * 4, 520);
  shockwave(scene, x, groundY ?? y, size * 1.6, pal, 440, groundY !== undefined ? 0.3 : 1);
  pop(scene, x, y, pal[2], Math.max(1, size / 16));
  twinkles(scene, x, y, size * 0.9, pal[2], 3);
}

/** 발밑에서 커지는 마법진 고리 여러 겹과 위로 오르는 빛 (버프·시전) */
export function aura(scene: Phaser.Scene, x: number, footY: number, pal: Palette3, size = 60): void {
  for (let i = 0; i < 3; i++) shockwave(scene, x, footY, size + i * 26, pal, 520 + i * 120, 0.3, 6 - i);
  column(scene, x, footY, 14, 170, pal, 700);
  shards(scene, x, footY - 30, pal, 20, 140, 700);
  twinkles(scene, x, footY - 40, size * 0.7, pal[2], 5, 500);
}

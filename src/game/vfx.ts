import Phaser from 'phaser';
import { DEPTH } from './fx';
import { mix, ramp, toneOf, type Tone } from './tone';

/**
 * 스킬용 대형 이펙트. 도트 텍스처를 크게 늘리면 뭉개지므로, 큰 모양(충격파·빛살·초승달·빛기둥)은
 * 벡터 그래픽에 ADD 혼합으로 겹겹이 그리고, 작은 알갱이는 기존 Fx를 쓴다.
 * 색은 팔레트 [진한 색, 밝은 색, 강조색]으로 받는다.
 *
 * 컴퍼스와 자로 그린 듯한 원·직선은 딱딱해 보이므로, 모양마다 불규칙함을 넣는다:
 * 고리는 군데군데 끊기고, 빛살은 굵기와 길이가 제각각이며, 참격은 칼끝으로 갈수록 뻗고 결이 갈라진다.
 * 불규칙함은 이펙트를 만들 때 한 번 뽑아 두어, 사는 동안 모양이 튀지 않게 한다.
 *
 * 색감: 한 가지 색의 밝기 차이로만 칠하지 않는다. 팔레트마다 "테두리 색(rim)"과 "곁들임 색(alt)"이 있어
 * 바깥 빛과 꼬리는 테두리 색으로, 결·알갱이 일부는 곁들임 색으로 칠한다 (하늘색 참격이라면 꼬리는 보라, 결은 민트).
 * PAL에 없는 팔레트는 tone.ts가 기준색에서 색상을 돌려 뽑는다.
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
  /** 벚꽃: 분홍에 보라 테두리, 살구빛 곁들임 */
  sakura: [0xff5a9a, 0xffb0d0, 0xfff0f6] as Palette3,
  /** 뇌운: 남색에 보라 테두리, 번개 노랑 곁들임 */
  storm: [0x4a5aff, 0x9ad0ff, 0xffffff] as Palette3,
  /** 해돋이: 주황·금에 다홍 테두리, 분홍 곁들임 */
  sun: [0xff7a1a, 0xffd040, 0xfffbe0] as Palette3,
  /** 오로라: 청록에 파랑 테두리, 연보라 곁들임 */
  aurora: [0x1ad8a0, 0x7fffd0, 0xf0fff8] as Palette3,
  /** 저주: 보라에 남색 테두리, 독기 어린 연두 곁들임 */
  hex: [0x8a2aff, 0xd080ff, 0xf6e0ff] as Palette3,
};

/** 팔레트마다 손으로 고른 테두리 색·곁들임 색 */
const TONES = new Map<Palette3, Tone>([
  [PAL.sky, { rim: 0x5a3aff, alt: 0x7fffd8 }],
  [PAL.gold, { rim: 0xff3a5a, alt: 0xffa0c8 }],
  [PAL.crimson, { rim: 0x8a1ad0, alt: 0xff9a3a }],
  [PAL.flame, { rim: 0xd0186a, alt: 0xffe85a }],
  [PAL.violet, { rim: 0x3a2ae0, alt: 0xff7ad8 }],
  [PAL.moon, { rim: 0xe01a6a, alt: 0xffe070 }],
  [PAL.frost, { rim: 0x6a4aff, alt: 0xb8ffe8 }],
  [PAL.jade, { rim: 0x1a8ad8, alt: 0xe8ff6a }],
  [PAL.arcane, { rim: 0x8a3aff, alt: 0xff8ae0 }],
  [PAL.rose, { rim: 0x9a2aff, alt: 0xffc08a }],
  [PAL.sakura, { rim: 0xc03ae0, alt: 0xffe0a0 }],
  [PAL.storm, { rim: 0x9a3aff, alt: 0xfff07a }],
  [PAL.sun, { rim: 0xff2a6a, alt: 0xff9ad0 }],
  [PAL.aurora, { rim: 0x3a6aff, alt: 0xc080ff }],
  [PAL.hex, { rim: 0x3a2ad0, alt: 0x9aff6a }],
]);

/** 팔레트의 테두리 색·곁들임 색 */
export function tone(pal: Palette3): Tone {
  return TONES.get(pal) ?? toneOf(pal[0]);
}

/** 알갱이에 돌려 쓰는 다섯 색 (진함·밝음·강조·곁들임·테두리) */
export function hues(pal: Palette3): number[] {
  const t = tone(pal);
  return [pal[0], pal[1], t.alt, pal[2], t.rim];
}

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;
type V2 = Phaser.Math.Vector2;
const v2 = (x: number, y: number): V2 => new Phaser.Math.Vector2(x, y);

/** 0→1로 흐르는 값으로 매 프레임 다시 그리는 그래픽. 끝나면 지운다. */
function animate(scene: Phaser.Scene, ms: number, draw: (g: Phaser.GameObjects.Graphics, k: number) => void, depth = DEPTH.fx + 1, delay = 0): void {
  const g = scene.add.graphics().setDepth(depth).setBlendMode(ADD);
  if (delay <= 0) draw(g, 0);
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

// ───────────────────────── 텍스처 (처음 쓸 때 한 번 그린다) ─────────────────────────

const GLOW = 'vfx-glow';
const GLOW_R = 48;
/** 4×4 바이어 무늬: 빛무리가 매끈한 그라데이션이 아니라 도트 망점으로 옅어지게 한다. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function ensureGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW)) return;
  const size = GLOW_R * 2;
  const tex = scene.textures.createCanvas(GLOW, size, size);
  if (!tex) return;
  const img = tex.context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - GLOW_R, y + 0.5 - GLOW_R) / GLOW_R;
      if (d >= 1) continue;
      // 가운데가 밝고 바깥으로 갈수록 빠르게 옅어진다. 6단계로 끊고 망점으로 잇는다.
      const a = Math.pow(1 - d, 1.8) * 6;
      const step = Math.floor(a) + (a - Math.floor(a) > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, Math.round((step / 6) * 255));
    }
  }
  tex.context.putImageData(img, 0, 0);
  tex.refresh();
}

export type MoteKind = 'petal' | 'leaf' | 'snow' | 'star' | 'flame';
const MOTE = 'vfx-mote';
const MOTE_KINDS: MoteKind[] = ['petal', 'leaf', 'snow', 'star', 'flame'];
const MOTE_FRAMES = 4;
const CELL = 9;

/** 알갱이 그림: 꽃잎·잎·눈 결정·별·불꽃 혀. 회색조로 그려 색을 입혀 쓴다 (밝은 쪽 255, 그늘 쪽 170). */
function ensureMotes(scene: Phaser.Scene): void {
  if (scene.textures.exists(MOTE)) return;
  const tex = scene.textures.createCanvas(MOTE, CELL * MOTE_FRAMES, CELL * MOTE_KINDS.length);
  if (!tex) return;
  const cx = tex.context;
  const put = (kind: number, f: number, x: number, y: number, v: number): void => {
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
    cx.fillStyle = `rgb(${v},${v},${v})`;
    cx.fillRect(f * CELL + x, kind * CELL + y, 1, 1);
  };
  const C = (CELL - 1) / 2;
  for (let f = 0; f < MOTE_FRAMES; f++) {
    // 꽃잎·잎: 프레임마다 돌고, 홀수 프레임은 옆으로 누워 가늘게 보인다 (팔랑거림).
    for (const [kind, leaf] of [
      [0, false],
      [1, true],
    ] as const) {
      const ang = (f * Math.PI) / 4 + (leaf ? 0.4 : 0);
      const a = 3.6;
      const b = (f % 2 ? 1.0 : 1.9) * (leaf ? 0.85 : 1);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const dx = x - C;
          const dy = y - C;
          const u = dx * Math.cos(ang) + dy * Math.sin(ang);
          const v = -dx * Math.sin(ang) + dy * Math.cos(ang);
          const t = u / a;
          if (Math.abs(t) > 1) continue;
          // 꽃잎은 한쪽이 둥글고 한쪽이 뾰족한 물방울, 잎은 양 끝이 뾰족하다.
          const w = leaf ? b * (1 - t * t) : b * Math.sqrt(1 - t * t) * (0.55 + 0.45 * (t + 1) * 0.5);
          if (Math.abs(v) > w + 0.15) continue;
          const vein = leaf && Math.abs(v) < 0.5 && f % 2 === 0;
          put(kind, f, x, y, vein ? 150 : v < 0 ? 255 : 190);
        }
      }
    }
    // 눈 결정: 여섯 가지 → 작은 가지 → 점, 번갈아 반짝인다.
    {
      const arms = f % 2 === 0 ? 3 : 2;
      for (let i = 0; i <= arms; i++) {
        const v = i === 0 ? 255 : 255 - i * 22;
        if (f < 2) {
          put(2, f, C + i, C, v);
          put(2, f, C - i, C, v);
          put(2, f, C, C + i, v);
          put(2, f, C, C - i, v);
          if (i < arms) {
            put(2, f, C + i, C + i, v - 40);
            put(2, f, C - i, C - i, v - 40);
            put(2, f, C + i, C - i, v - 40);
            put(2, f, C - i, C + i, v - 40);
          }
        } else {
          put(2, f, C + i, C + i, v);
          put(2, f, C - i, C - i, v);
          put(2, f, C + i, C - i, v);
          put(2, f, C - i, C + i, v);
          if (i < arms) {
            put(2, f, C + i, C, v - 40);
            put(2, f, C - i, C, v - 40);
            put(2, f, C, C + i, v - 40);
            put(2, f, C, C - i, v - 40);
          }
        }
      }
    }
    // 별: 네 갈래가 길어졌다 짧아진다.
    {
      const len = [4, 3, 2, 3][f];
      for (let i = 0; i <= len; i++) {
        const v = 255 - i * 24;
        put(3, f, C + i, C, v);
        put(3, f, C - i, C, v);
        put(3, f, C, C + i, v);
        put(3, f, C, C - i, v);
      }
      if (len >= 3) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(3, f, C + sx, C + sy, 200);
    }
    // 불꽃 혀: 아래가 통통하고 위가 뾰족하며, 끝이 프레임마다 좌우로 흔들린다.
    {
      const lean = [0, 1, 0, -1][f];
      for (let y = 0; y < CELL; y++) {
        const t = y / (CELL - 1);
        // 위 끝은 한 점, 아래로 갈수록 부풀다가 밑동에서 둥글게 닫힌다.
        const half = t < 0.72 ? 2.5 * Math.pow(t / 0.72, 1.5) : 2.5 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.72) / 0.28, 2)));
        const mid = C + lean * (1 - t) * 1.6;
        for (let x = 0; x < CELL; x++) {
          const d = Math.abs(x - mid);
          if (d > half + 0.3) continue;
          put(4, f, x, y, d < half * 0.5 && t > 0.5 ? 255 : 180);
        }
      }
    }
  }
  tex.refresh();
  MOTE_KINDS.forEach((kind, row) => {
    for (let f = 0; f < MOTE_FRAMES; f++) tex.add(`${kind}${f}`, 0, f * CELL, row * CELL, CELL, CELL);
  });
}

// ───────────────────────── 빛무리 · 알갱이 · 소용돌이 결 ─────────────────────────

/**
 * 색이 고이는 빛무리: 망점으로 옅어지는 둥근 빛이 확 번졌다 사라진다. squash로 납작하게 눕히면 땅에 깔린 빛이 된다.
 * 다른 이펙트 뒤에 깔아 그 자리를 색으로 물들인다.
 */
export function glow(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, ms = 420, alpha = 0.7, squash = 1, depth = DEPTH.fx - 1): void {
  ensureGlow(scene);
  const k = radius / GLOW_R;
  const s = scene.add.image(x, y, GLOW).setTint(color).setBlendMode(ADD).setDepth(depth).setAlpha(alpha).setScale(k * 0.45, k * 0.45 * squash);
  scene.tweens.add({ targets: s, scaleX: k, scaleY: k * squash, duration: Math.min(140, ms * 0.35), ease: 'Quad.Out' });
  scene.tweens.add({ targets: s, alpha: 0, delay: ms * 0.3, duration: ms * 0.7, ease: 'Quad.In', onComplete: () => s.destroy() });
}

/** 한꺼번에 떠 있을 수 있는 알갱이 수 */
const MAX_MOTES = 240;
let liveMotes = 0;

/** 전투가 새로 시작될 때 부른다. 씬이 도중에 끝나면 알갱이의 끝맺음이 불리지 않아 세던 수가 남기 때문이다. */
export function resetVfx(): void {
  liveMotes = 0;
}

export interface FlutterOpts {
  /** 처음 흩어져 있는 범위 (가로, 세로 반지름) */
  spread?: number;
  spreadY?: number;
  /** 터져 나가는 속도 (px/초)와 방향·퍼짐 */
  speed?: number;
  angle?: number;
  cone?: number;
  /** 중력 (px/초². 음수면 떠오른다) */
  gravity?: number;
  /** 좌우로 살랑거리는 폭 */
  sway?: number;
  life?: number;
  /** 이 시간 안에 흩어져서 나타난다 */
  within?: number;
  scale?: number;
  depth?: number;
}

/**
 * 살랑거리는 알갱이: 꽃잎·잎·눈·별·불꽃 혀가 터져 나와 흔들리며 떨어지거나 떠오른다.
 * colors를 돌려 가며 칠한다.
 */
export function flutter(scene: Phaser.Scene, x: number, y: number, kind: MoteKind, colors: number[], count = 10, o: FlutterOpts = {}): void {
  ensureMotes(scene);
  const spread = o.spread ?? 10;
  const spreadY = o.spreadY ?? spread;
  const speed = o.speed ?? 60;
  const cone = o.cone ?? Math.PI;
  const gravity = o.gravity ?? (kind === 'flame' || kind === 'star' ? -40 : 70);
  const sway = o.sway ?? (kind === 'flame' || kind === 'star' ? 4 : 12);
  const life = o.life ?? 900;
  for (let i = 0; i < count; i++) {
    if (liveMotes >= MAX_MOTES) return;
    const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * 2 * cone;
    const v = speed * (0.35 + Math.random() * 0.85);
    const vx = Math.cos(a) * v;
    const vy = Math.sin(a) * v;
    const x0 = x + (Math.random() - 0.5) * 2 * spread;
    const y0 = y + (Math.random() - 0.5) * 2 * spreadY;
    const T = (life * (0.65 + Math.random() * 0.6)) / 1000;
    const ph = Math.random() * TAU;
    const rate = 5 + Math.random() * 6;
    const f0 = Math.floor(Math.random() * MOTE_FRAMES);
    const big = Math.random() < 0.3;
    const s = scene.add
      .image(x0, y0, MOTE, `${kind}${f0}`)
      .setTint(colors[i % colors.length])
      .setBlendMode(ADD)
      .setDepth(o.depth ?? DEPTH.fx + 1)
      .setScale((o.scale ?? 1) * (big ? 2 : 1))
      .setVisible(false);
    liveMotes++;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: T * 1000,
      delay: Math.random() * (o.within ?? 80),
      onStart: () => s.setVisible(true),
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        const t = k * T;
        // 처음에 확 튀고 금세 느려진 뒤, 바람을 타듯 흔들린다.
        const e = (1 - (1 - k) * (1 - k)) * T * 0.6;
        s.setPosition(x0 + vx * e + Math.sin(t * 5 + ph) * sway * k, y0 + vy * e + 0.5 * gravity * t * t);
        s.setFrame(`${kind}${(f0 + Math.floor(t * rate)) % MOTE_FRAMES}`);
        s.setAlpha(k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
      },
      onComplete: () => {
        s.destroy();
        liveMotes--;
      },
    });
  }
}

export interface WispOpts {
  /** 뻗는 방향과 퍼짐 (기본은 사방) */
  angle?: number;
  cone?: number;
  /** 말려 드는 정도 (라디안) */
  curl?: number;
  width?: number;
  delay?: number;
}

/**
 * 소용돌이 결: 붓으로 휘갈긴 듯 말려 드는 빛의 리본. 뿌리는 테두리 색, 끝은 곁들임 색으로 물든다.
 * 머리가 뻗어 나간 뒤 꼬리가 따라가며 사라진다.
 */
export function wisps(scene: Phaser.Scene, x: number, y: number, pal: Palette3, count = 5, reach = 60, ms = 520, o: WispOpts = {}): void {
  const t = tone(pal);
  const colors = [t.rim, pal[0], pal[1], t.alt];
  const N = 14;
  const list = Array.from({ length: count }, (_, i) => {
    const a0 = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * 2 * (o.cone ?? 0.6) : (i / count) * TAU + Math.random() * 0.8;
    const curl = (o.curl ?? 2.6) * (0.5 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1);
    const len = reach * (0.6 + Math.random() * 0.6);
    const pts: V2[] = [v2(0, 0)];
    let px = 0;
    let py = 0;
    for (let j = 1; j <= N; j++) {
      const u = j / N;
      const ang = a0 + curl * Math.pow(u, 1.4);
      px += (Math.cos(ang) * len) / N;
      py += (Math.sin(ang) * len) / N;
      pts.push(v2(px, py));
    }
    return { pts, w: (o.width ?? 5) * (0.6 + Math.random() * 0.7), lag: Math.random() * 0.2 };
  });
  animate(
    scene,
    ms,
    (g, k) => {
      for (const w of list) {
        const kk = Math.max(0, Math.min(1, (k - w.lag) / (1 - w.lag)));
        const head = easeOut(Math.min(1, kk / 0.55));
        const tail = Math.max(0, (kk - 0.3) / 0.7);
        if (head - tail < 0.03) continue;
        const at = (u: number): V2 => {
          const f = u * N;
          const i = Math.min(N - 1, Math.floor(f));
          const p = w.pts[i];
          const q = w.pts[i + 1];
          return v2(x + p.x + (q.x - p.x) * (f - i), y + p.y + (q.y - p.y) * (f - i));
        };
        const steps = 9;
        let prev = at(tail);
        let prevHalf = 0;
        let prevN = v2(0, 0);
        for (let i = 1; i <= steps; i++) {
          const s = i / steps;
          const cur = at(tail + (head - tail) * s);
          const dx = cur.x - prev.x;
          const dy = cur.y - prev.y;
          const d = Math.hypot(dx, dy) || 1;
          const n = v2(-dy / d, dx / d);
          const half = (w.w * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.8)) / 2;
          if (i === 1) prevN = n;
          g.fillStyle(ramp(colors, s), 0.85 * (1 - tail * 0.6));
          g.fillTriangle(prev.x + prevN.x * prevHalf, prev.y + prevN.y * prevHalf, prev.x - prevN.x * prevHalf, prev.y - prevN.y * prevHalf, cur.x + n.x * half, cur.y + n.y * half);
          g.fillTriangle(prev.x - prevN.x * prevHalf, prev.y - prevN.y * prevHalf, cur.x + n.x * half, cur.y + n.y * half, cur.x - n.x * half, cur.y - n.y * half);
          prev = cur;
          prevHalf = half;
          prevN = n;
        }
      }
    },
    DEPTH.fx + 1,
    o.delay ?? 0,
  );
}

// ───────────────────────── 큰 모양 ─────────────────────────

/**
 * 땅을 따라 납작하게, 또는 둥글게 퍼지는 충격파.
 * 테두리 색의 부드러운 바깥 빛 위에 끊어진 고리 조각들이 저마다 조금씩 다른 속도로 퍼지고, 그 앞으로 짧은 파편이 튄다.
 * 고리 조각은 밝은 색과 곁들임 색이 섞이고, 한 박자 늦게 테두리 색의 두 번째 물결이 뒤따른다.
 */
export function shockwave(scene: Phaser.Scene, x: number, y: number, radius: number, pal: Palette3, ms = 420, flat = 0.32, thick = 8): void {
  const t = tone(pal);
  const N = radius > 110 ? 11 : 8;
  const segs = Array.from({ length: N }, (_, i) => ({
    a0: (i / N) * TAU + Math.random() * 0.25,
    len: (TAU / N) * (0.5 + Math.random() * 0.42),
    wob: 0.94 + Math.random() * 0.12,
    lag: Math.random() * 0.16,
    color: i % 3 === 1 ? t.alt : pal[1],
  }));
  const echo = Array.from({ length: Math.ceil(N / 2) }, (_, i) => ({ a0: (i / Math.ceil(N / 2)) * TAU + Math.random() * 0.6, len: (TAU / N) * (0.7 + Math.random() * 0.6) }));
  const spikes = Array.from({ length: N }, (_, i) => ({ a: Math.random() * TAU, len: 0.08 + Math.random() * 0.16, color: i % 2 ? t.alt : pal[1] }));
  animate(scene, ms, (g, k) => {
    const r = 6 + radius * easeOut(k);
    const a = 1 - k;
    g.lineStyle(thick * 2.6 * (1 - k * 0.5), t.rim, 0.42 * a).strokeEllipse(x, y, r * 2, r * 2 * flat);
    g.lineStyle(thick * 1.3 * (1 - k * 0.5), pal[0], 0.3 * a).strokeEllipse(x, y, r * 2, r * 2 * flat);
    const arc = (a0: number, len: number, rr: number): V2[] => {
      const pts: V2[] = [];
      for (let i = 0; i <= 6; i++) {
        const ang = a0 + (len * i) / 6;
        pts.push(v2(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * flat));
      }
      return pts;
    };
    // 뒤따르는 두 번째 물결
    const r2 = 6 + radius * 0.72 * easeOut(Math.max(0, k * 1.15 - 0.15));
    if (k > 0.13) for (const e of echo) g.lineStyle(Math.max(1, thick * 0.5 * (1 - k * 0.6)), t.rim, 0.75 * a).strokePoints(arc(e.a0, e.len * (1 - k * 0.4), r2));
    for (const s of segs) {
      const pts = arc(s.a0, s.len * (1 - k * 0.5), r * s.wob * (1 - s.lag * (1 - k)));
      g.lineStyle(thick * (1 - k * 0.6), s.color, 0.85 * a).strokePoints(pts);
      g.lineStyle(Math.max(1, thick * 0.3), pal[2], a).strokePoints(pts);
    }
    // 고리 앞으로 튀는 짧은 파편
    for (const s of spikes) {
      const r0 = r * 1.03;
      const r1 = r * (1.03 + s.len * (1 - k * 0.6));
      const c = Math.cos(s.a);
      const sn = Math.sin(s.a) * flat;
      g.lineStyle(Math.max(1, thick * 0.25), s.color, 0.8 * a).lineBetween(x + c * r0, y + sn * r0, x + c * r1, y + sn * r1);
    }
  });
}

/** 한 점에서 사방으로 뻗는 빛살. 굵기와 길이, 색이 제각각이고, 가운데는 비워 터져 나가는 느낌을 낸다. */
export function rays(scene: Phaser.Scene, x: number, y: number, count: number, length: number, pal: Palette3, ms = 380, spin = Math.random() * Math.PI): void {
  const t = tone(pal);
  const cycle = [pal[1], pal[0], t.alt, pal[1], t.rim];
  const list = Array.from({ length: count }, (_, i) => ({
    ang: spin + (i / count) * TAU + (Math.random() - 0.5) * 0.45,
    len: length * (0.45 + Math.random() * 0.8),
    w: 3 + Math.random() * 6,
    ph: Math.random() * TAU,
    color: cycle[i % cycle.length],
  }));
  animate(scene, ms, (g, k) => {
    const grow = easeOut(Math.min(1, k * 2.2));
    const a = 1 - Math.max(0, (k - 0.35) / 0.65);
    for (const ray of list) {
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
      diamond(w, ray.color, 0.75 * a);
      diamond(w * 0.35, pal[2], 0.9 * a);
    }
  });
}

/** 섬광: 일렁이는 불규칙한 빛 덩어리가 확 부풀었다 사라지고, 가로세로로 가는 빛줄기가 스친다. 바깥은 테두리 색으로 번진다. */
export function flare(scene: Phaser.Scene, x: number, y: number, radius: number, pal: Palette3, ms = 300): void {
  const t = tone(pal);
  const M = 12;
  const lump = Array.from({ length: M }, () => 0.78 + Math.random() * 0.4);
  const ph = Array.from({ length: M }, () => Math.random() * TAU);
  const tilt = (Math.random() - 0.5) * 0.5;
  if (radius >= 24) glow(scene, x, y, radius * 2.4, t.rim, ms * 1.4, 0.55);
  animate(scene, ms, (g, k) => {
    // 부풀었다가, 사라질 때는 가운데로 오므라든다 (덩어리가 뿌옇게 남지 않게).
    const r = radius * (0.4 + 0.6 * easeOut(Math.min(1, k * 2))) * (1 - 0.45 * Math.max(0, (k - 0.5) / 0.5));
    const a = (1 - k) * (1 - k * 0.5);
    const blob = (rr: number, color: number, alpha: number): void => {
      const pts: V2[] = [];
      for (let i = 0; i < M; i++) {
        const ang = (i / M) * TAU;
        const q = rr * lump[i] * (1 + 0.1 * Math.sin(k * 30 + ph[i]));
        pts.push(v2(x + Math.cos(ang) * q, y + Math.sin(ang) * q));
      }
      g.fillStyle(color, alpha).fillPoints(pts, true);
    };
    blob(r * 1.5, t.rim, 0.4 * a);
    blob(r * 1.2, pal[0], 0.4 * a);
    blob(r * 0.85, pal[1], 0.5 * a);
    blob(r * 0.45, pal[2], 0.9 * a);
    // 렌즈에 맺히는 빛줄기
    const streak = (ang: number, len: number, hw: number, color: number): void => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      g.fillStyle(color, 0.85 * a);
      g.fillTriangle(x - c * len, y - s * len, x - s * hw, y + c * hw, x + s * hw, y - c * hw);
      g.fillTriangle(x + c * len, y + s * len, x - s * hw, y + c * hw, x + s * hw, y - c * hw);
    };
    const open = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    streak(tilt, r * 2.9 * open, r * 0.2, t.alt);
    streak(tilt, r * 2.6 * open, r * 0.1, pal[2]);
    streak(tilt + Math.PI / 2, r * 1.5 * open, r * 0.09, pal[2]);
  });
}

/**
 * 거대한 참격: 정확한 반달이 아니라, 휘두르기 시작은 몸 가까이에서 칼끝으로 갈수록 멀리 뻗는 궤적.
 * 머리(칼끝)는 뾰족하고 꼬리는 길게 가늘어지며, 안쪽에는 갈라진 결이 따라 흐른다. 다 그어지면 꼬리부터 빠져나가며 사라진다.
 * 색은 꼬리에서 칼끝으로 흐른다: 꼬리는 테두리 색, 가운데는 기준색, 칼끝은 밝은 색. 안쪽 결에는 곁들임 색이 섞인다.
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
  const t = tone(pal);
  const outerRamp = [t.rim, t.rim, pal[0], mix(pal[0], pal[1], 0.5)];
  const midRamp = [t.rim, pal[0], pal[1], pal[1], mix(pal[1], pal[2], 0.6)];
  const coreRamp = [pal[1], pal[2], 0xffffff];
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
    color: i % 2 ? t.alt : pal[1],
  }));
  /** 바깥으로 튀는 결: 칼끝 쪽에서 궤적 밖으로 비껴 나간다. */
  const flecks = Array.from({ length: 3 }, () => ({ s: 0.55 + Math.random() * 0.4, off: 0.5 + Math.random() * 0.5, len: 0.06 + Math.random() * 0.08 }));
  // 색 띠 하나가 두 칸씩: 매끈한 그라데이션이 아니라 붓으로 끊어 칠한 듯 보인다.
  const steps = 20;
  animate(scene, ms, (g, k) => {
    // 처음 30%는 휘두르며 그어지고, 나머지는 꼬리가 머리를 따라가며 가늘어진다.
    const head = easeOut(Math.min(1, k / 0.3));
    const late = Math.max(0, (k - 0.3) / 0.7);
    const tail = late * 0.55;
    const fade = 1 - late;
    const layer = (w: number, colors: number[], alpha: number, rOff: number): void => {
      let po = pt(tail, rOff);
      let pi = po;
      for (let i = 1; i <= steps; i++) {
        const s = i / steps;
        const u = tail + (head - tail) * s;
        // 머리 쪽에 치우친 두께
        const half = (w * Math.pow(Math.sin(Math.PI * Math.pow(s, 1.5)), 0.8) * (0.35 + 0.65 * fade)) / 2;
        const no = pt(u, rOff + half);
        const ni = pt(u, rOff - half);
        g.fillStyle(ramp(colors, (Math.floor((i - 1) / 2) * 2 + 1) / steps), alpha);
        g.fillTriangle(po.x, po.y, pi.x, pi.y, no.x, no.y);
        g.fillTriangle(pi.x, pi.y, no.x, no.y, ni.x, ni.y);
        po = no;
        pi = ni;
      }
    };
    layer(thick * 2.3, outerRamp, 0.5, -thick * 0.25);
    layer(thick * 1.2, midRamp, 0.9, 0);
    layer(thick * 0.4, coreRamp, 1, thick * 0.2);
    for (const st of strands) {
      const u0 = tail + (head - tail) * st.s0;
      const u1 = tail + (head - tail) * st.s1;
      if (u1 - u0 < 0.04) continue;
      const pts: V2[] = [];
      for (let i = 0; i <= 10; i++) pts.push(pt(u0 + ((u1 - u0) * i) / 10, -thick * st.off));
      g.lineStyle(st.w, st.color, 0.6 * fade).strokePoints(pts);
    }
    for (const f of flecks) {
      const u0 = tail + (head - tail) * f.s;
      if (u0 > head - 0.02) continue;
      const a = pt(u0, thick * f.off);
      const b2 = pt(Math.min(head, u0 + f.len), thick * (f.off + 0.25));
      g.lineStyle(1.5, t.alt, 0.8 * fade).lineBetween(a.x, a.y, b2.x, b2.y);
    }
  });
}

/**
 * 하늘까지 솟는 빛기둥: 위로 갈수록 좁아지며 일렁이고, 안팎으로 가는 빛줄기가 빠르게 타고 오른다.
 * 바깥은 테두리 색으로 번지고, 곁들임 색의 두 가닥이 기둥을 휘감아 오른다.
 */
export function column(scene: Phaser.Scene, x: number, footY: number, width: number, height: number, pal: Palette3, ms = 600): void {
  const t = tone(pal);
  const strands = Array.from({ length: 7 }, (_, i) => ({
    dx: (Math.random() - 0.5) * 2.6,
    ph: Math.random(),
    sp: 1.5 + Math.random() * 2,
    len: 0.12 + Math.random() * 0.2,
    color: i % 3 === 0 ? pal[2] : i % 3 === 1 ? t.alt : pal[1],
  }));
  const ph = Math.random() * TAU;
  const twist = 5 + Math.random() * 3;
  if (width >= 20) glow(scene, x, footY, width * 3.2, t.rim, ms, 0.6, 0.35);
  animate(scene, ms, (g, k) => {
    const open = easeOut(Math.min(1, k * 4));
    const a = 1 - Math.max(0, (k - 0.4) / 0.6);
    const w = width * open * (1 - Math.max(0, k - 0.6)) * (1 + 0.07 * Math.sin(k * 46 + ph));
    const top = footY - height;
    /** 아래가 넓고 위가 좁은 기둥 한 겹 */
    const beam = (hw: number, color: number, alpha: number, taper: number): void => {
      g.fillStyle(color, alpha).fillPoints([v2(x - hw, footY), v2(x + hw, footY), v2(x + hw * taper, top), v2(x - hw * taper, top)], true);
    };
    beam(w * 1.25, t.rim, 0.35 * a, 0.45);
    beam(w * 0.85, pal[0], 0.45 * a, 0.5);
    beam(w * 0.5, pal[1], 0.6 * a, 0.55);
    beam(w * 0.18, pal[2], 0.95 * a, 0.7);
    for (const s of strands) {
      const tt = (k * s.sp + s.ph) % 1;
      const y0 = footY - height * tt;
      const y1 = Math.max(top, y0 - height * s.len);
      const sx = x + s.dx * w * (1 - tt * 0.45);
      g.lineStyle(s.color === pal[2] ? 2 : 1, s.color, 0.85 * a * (1 - tt * 0.5)).lineBetween(sx, y0, sx, y1);
    }
    // 기둥을 휘감아 오르는 두 가닥: 앞쪽을 지날 때만 보인다.
    if (width >= 14) {
      const reachUp = Math.min(1, k * 2.4);
      for (let strand = 0; strand < 2; strand++) {
        let prev: V2 | null = null;
        for (let i = 0; i <= 22; i++) {
          const u = (i / 22) * reachUp;
          const ang = u * twist * 2 + ph + strand * Math.PI - k * 9;
          const cur = v2(x + Math.sin(ang) * w * 1.15 * (1 - u * 0.4), footY - height * u);
          if (prev && Math.cos(ang) > -0.15) g.lineStyle(2, strand ? t.alt : pal[2], 0.8 * a * (1 - u * 0.6)).lineBetween(prev.x, prev.y, cur.x, cur.y);
          prev = cur;
        }
      }
    }
    g.fillStyle(t.rim, 0.4 * a).fillEllipse(x, footY, w * 5, w * 1.1);
    g.fillStyle(pal[1], 0.5 * a).fillEllipse(x, footY, w * 3.6, w * 0.8);
    g.fillStyle(pal[2], 0.6 * a).fillEllipse(x, footY, w * 1.8, w * 0.4);
  });
}

/** 여러 색이 섞인 파편 폭발: 네모 알갱이와, 날아가는 쪽으로 길쭉한 빛 조각이 섞여 튄다. */
export function shards(scene: Phaser.Scene, x: number, y: number, pal: Palette3, count = 24, speed = 220, life = 520): void {
  const colors = hues(pal);
  for (let i = 0; i < count; i++) {
    const c = colors[i % colors.length];
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

/**
 * 화면을 두 색으로 물들인다: 위쪽은 top, 아래쪽은 bottom 색이 번졌다 빠진다 (노을·오로라처럼).
 */
export function wash(scene: Phaser.Scene, top: number, bottom: number, alpha = 0.22, ms = 500): void {
  const cam = scene.cameras.main;
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.text - 2).setBlendMode(ADD);
  // 여섯 띠로 끊어 칠해 도트 배경과 어울리게 한다.
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = Math.round((cam.height * i) / bands);
    const y1 = Math.round((cam.height * (i + 1)) / bands);
    g.fillStyle(mix(top, bottom, i / (bands - 1)), alpha).fillRect(0, y0, cam.width, y1 - y0);
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => g.destroy() });
}

/** 도트로 그린 터지는 고리 (fxArt의 fx-pop) */
export function pop(scene: Phaser.Scene, x: number, y: number, color: number, scale = 1): void {
  const s = scene.add.sprite(x, y, 'fx-pop').setTint(color).setDepth(DEPTH.fx + 1).setBlendMode(ADD).setScale(scale).setRotation(Math.random() * TAU);
  s.play('fx-pop');
  s.once('animationcomplete', () => s.destroy());
}

/** 주변에 시차를 두고 반짝이는 작은 별들 (fxArt의 fx-twinkle) */
export function twinkles(scene: Phaser.Scene, x: number, y: number, spread: number, color: number, count = 4, within = 260): void {
  const t = toneOf(color);
  for (let i = 0; i < count; i++) {
    const s = scene.add
      .sprite(x + (Math.random() - 0.5) * 2 * spread, y + (Math.random() - 0.5) * 2 * spread, 'fx-twinkle')
      .setTint(i % 3 === 2 ? t.alt : color)
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

/** 큰 일격을 한 번에: 빛무리 + 섬광 + 빛살 + 충격파 + 파편 + 터지는 고리와 별빛 */
export function impactBurst(scene: Phaser.Scene, x: number, y: number, size: number, pal: Palette3, groundY?: number): void {
  const t = tone(pal);
  glow(scene, x, y, size * 2.2, t.rim, 520, 0.6);
  flare(scene, x, y, size * 0.6, pal, 260);
  rays(scene, x, y, 10, size * 1.4, pal, 360);
  shards(scene, x, y, pal, Math.round(size / 3), size * 4, 520);
  shockwave(scene, x, groundY ?? y, size * 1.6, pal, 440, groundY !== undefined ? 0.3 : 1);
  pop(scene, x, y, pal[2], Math.max(1, size / 16));
  pop(scene, x, y, t.alt, Math.max(1, size / 24));
  twinkles(scene, x, y, size * 0.9, pal[2], 3);
}

/** 발밑에서 커지는 마법진 고리 여러 겹과 위로 오르는 빛, 몸을 휘감는 소용돌이 결 (버프·시전) */
export function aura(scene: Phaser.Scene, x: number, footY: number, pal: Palette3, size = 60): void {
  const t = tone(pal);
  for (let i = 0; i < 3; i++) shockwave(scene, x, footY, size + i * 26, pal, 520 + i * 120, 0.3, 6 - i);
  column(scene, x, footY, 14, 170, pal, 700);
  shards(scene, x, footY - 30, pal, 20, 140, 700);
  wisps(scene, x, footY - 6, pal, 6, size * 1.3, 700, { angle: -Math.PI / 2, cone: 1.0, curl: 3.2, width: 5 });
  glow(scene, x, footY - 24, size * 1.5, t.rim, 800, 0.55);
  twinkles(scene, x, footY - 40, size * 0.7, pal[2], 5, 500);
}

/**
 * 큰 일격 뒤에 남는 여운: 땅에 깔린 빛이 천천히 식고, 그 위로 알갱이가 피어오른다.
 */
export function afterglow(scene: Phaser.Scene, x: number, groundY: number, width: number, pal: Palette3, kind: MoteKind = 'star', ms = 1100): void {
  const t = tone(pal);
  glow(scene, x, groundY, width * 0.75, t.rim, ms, 0.6, 0.3);
  glow(scene, x, groundY, width * 0.45, pal[0], ms * 0.8, 0.5, 0.3);
  flutter(scene, x, groundY - 6, kind, hues(pal), Math.max(4, Math.round(width / 14)), { spread: width * 0.45, spreadY: 4, speed: 30, cone: 0.5, gravity: -55, life: ms, within: ms * 0.4 });
}

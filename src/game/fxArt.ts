import Phaser from 'phaser';

// 스킬·타격 이펙트용 도트 그림. 부팅할 때 캔버스에 픽셀 단위로 그려 스프라이트 시트로 등록한다.
// 회색조로 그린 그림(베기 잔상·스파크·마법진·빛기둥·보호막·꼬리)은 색을 입혀(tint) 여러 색으로 쓰고,
// 색이 정해진 그림(폭발·불꽃·얼음·구체·화살·운석)은 팔레트를 그대로 굽는다.

type Px = (x: number, y: number, color: number, alpha?: number) => void;

/** 0~1 사이의 고정 난수 (같은 입력이면 같은 값) */
function hash(x: number, y: number, s = 0): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function gray(v: number): number {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return (c << 16) | (c << 8) | c;
}

/** frames칸짜리 가로 시트를 그린다. 같은 픽셀에 여러 번 칠하면 나중 것이 덮는다. */
function sheet(scene: Phaser.Scene, key: string, fw: number, fh: number, frames: number, draw: (px: Px, f: number) => void): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = fw * frames;
  canvas.height = fh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, fh);
  const d = img.data;
  for (let f = 0; f < frames; f++) {
    const ox = f * fw;
    const px: Px = (x, y, color, alpha = 1) => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= fw || iy >= fh || alpha <= 0) return;
      const i = (iy * canvas.width + ox + ix) * 4;
      d[i] = (color >> 16) & 255;
      d[i + 1] = (color >> 8) & 255;
      d[i + 2] = color & 255;
      d[i + 3] = Math.round(Math.min(1, alpha) * 255);
    };
    draw(px, f);
  }
  ctx.putImageData(img, 0, 0);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * fw, 0, fw, fh);
}

function anim(scene: Phaser.Scene, key: string, frames: number, rate: number, repeat = 0): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }), frameRate: rate, repeat });
}

function line(px: Px, x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, color, alpha);
}

/** 거리 d(0~1)에 따라 팔레트에서 색을 고른다. */
function band(pal: readonly number[], d: number): number {
  return pal[Math.min(pal.length - 1, Math.max(0, Math.floor(d * pal.length)))];
}

// ───────────────────────── 베기 잔상 ─────────────────────────

/** 베기 잔상의 반지름 (그림 기준). 실제 크기는 scale = radius / SLASH_R */
export const SLASH_R = 40;
const SLASH_FRAME = 112;
const SLASH_FRAMES = 7;
const SLASH_C = { x: 40, y: 56 };
/** 잔상 그림에서 원의 중심 (기준점) */
export const SLASH_ORIGIN = { x: SLASH_C.x / SLASH_FRAME, y: 0.5 };

/** 무기의 기운에 따라 잔상의 생김새가 달라진다. */
export const SLASH_STYLES = ['plain', 'steel', 'flame', 'moon', 'blood', 'holy', 'thunder'] as const;
export type SlashStyle = (typeof SLASH_STYLES)[number];

export function slashKey(wide: boolean, style: SlashStyle = 'plain'): string {
  return `fx-slash${wide ? '-w' : ''}${style === 'plain' ? '' : `-${style}`}`;
}

/** 칸마다 잔상이 차지하는 구간 [꼬리, 머리] (0 = 휘두르기 시작, 1 = 끝) */
const SLASH_SEG: [number, number][] = [
  [0, 0.4],
  [0, 0.82],
  [0, 1],
  [0.12, 1],
  [0.36, 1],
  [0.58, 1],
  [0.78, 1],
];

/**
 * 붓으로 그은 듯한 베기 잔상. 칼끝(머리)은 뾰족하고, 뒤로 갈수록 결이 갈라져 흩어진다.
 * 7칸: 그어 나가기(0~2) → 꼬리부터 풀리기(3~4) → 부스러기(5~6). 색은 계단식 명암 + 격자 디더로 도트 느낌을 살린다.
 * core는 그 위에 얹는 하얀 날.
 */
function drawSlash(px: Px, f: number, spanDeg: number, core: boolean, style: SlashStyle): void {
  const { x: cx, y: cy } = SLASH_C;
  const R = SLASH_R;
  const A = (spanDeg * Math.PI) / 180;
  const [tail, head] = SLASH_SEG[f];
  const grow = [0.55, 0.9, 1, 0.95, 0.8, 0.62, 0.45][f];
  const fade = [0.9, 1, 1, 0.9, 0.75, 0.55, 0.35][f];
  const coreFade = [1, 1, 1, 0.8, 0.5, 0.25, 0][f];
  /** 사라지면서 바깥으로 살짝 번진다. */
  const drift = Math.max(0, f - 2) * 1.2;
  const melt = Math.max(0, f - 3) * 0.2;
  const T = (style === 'moon' || style === 'steel' ? 11 : style === 'blood' ? 16 : 14) * grow;

  /** 바깥 날의 굴곡: 불꽃은 혀처럼 솟고, 번개는 톱니, 피는 울퉁불퉁하다. */
  const edge = (u: number): number => reach(u) + wobble(u);
  /** 정확한 원호가 되지 않게: 휘두르기 시작은 몸 가까이, 칼끝으로 갈수록 바깥으로 뻗는다. */
  const reach = (u: number): number => (u - 0.62) * 11;
  const wobble = (u: number): number => {
    if (style === 'flame') return 4.5 * Math.pow(Math.max(0, Math.sin(u * 26 - f * 1.4)), 2) * (0.5 + hash(Math.round(u * 13), f, 5));
    if (style === 'thunder') {
      const z = u * 11 + f * 0.37;
      return (Math.abs((z % 1) - 0.5) * 2 - 0.5) * 3.2 * (0.5 + hash(Math.floor(z), 8, 1));
    }
    if (style === 'blood') return 1.5 * Math.sin(u * 17 + f);
    // 완전한 원호가 아니라 손으로 그은 듯 살짝 일렁인다.
    return 1.4 * Math.sin(u * 2.6 + 0.5);
  };
  /** 호 위의 점: u = 구간 위치, r = 반지름 */
  const at = (u: number, r: number): [number, number] => {
    const ang = u * 2 * A - A;
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
  };
  const tone = (v: number): number => (core ? 0xffffff : gray(v));
  const dot = (u: number, r: number, v: number, alpha = 1): void => {
    const [x, y] = at(u, r);
    px(x, y, tone(v), alpha);
  };
  const inSeg = (u: number): boolean => u >= tail && u <= head;

  for (let y = 0; y < SLASH_FRAME; y++) {
    for (let x = 0; x < SLASH_FRAME; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r < R - 30 || r > R + 18) continue;
      const u = (Math.atan2(dy, dx) + A) / (2 * A);
      if (!inSeg(u)) continue;
      const v = (u - tail) / (head - tail);
      // 머리 쪽에 치우친 두께: 칼끝은 뾰족하고 꼬리는 길게 가늘어진다.
      const thick = Math.max(1.2, T * 1.25 * Math.pow(Math.sin(Math.PI * Math.pow(v, 1.5)), 0.75));
      const outer = R + drift + edge(u);
      if (r > outer + 0.5) continue;
      /** 1 = 바깥 날, 0 = 안쪽 끝 */
      const t = 1 - (outer - r) / thick;
      if (t < 0) continue;
      // 결: 잔상을 붓털 한 올 한 올(반지름 1px 줄)의 묶음으로 본다. 안쪽 올일수록 늦게 시작해 일찍 끝나고,
      // 중간에 끊긴 데가 있어 빗으로 쓸어 놓은 듯 갈라진다.
      const strand = Math.round(outer - r);
      const deep = Math.min(1, strand / (T * 1.25));
      if (v < Math.pow(deep, 0.8) * (0.12 + 0.75 * hash(strand, spanDeg, 3))) continue;
      if (v > 1 - deep * (0.04 + 0.4 * hash(strand, spanDeg, 4))) continue;
      if (deep > 0.3) {
        const gap = hash(strand, spanDeg, 5);
        if (v > gap && v < gap + 0.05 + deep * 0.08) continue;
      }
      if (melt > 0 && hash(x, y, f) < melt * (1.3 - t)) continue;
      if (core) {
        if (t > 1 - 2.2 / thick && v > 0.25) px(x, y, 0xffffff, Math.min(1, (v - 0.25) * 2.5) * coreFade);
        continue;
      }
      // 올마다 밝기가 조금씩 달라 안쪽에도 밝은 줄이 선다.
      const q = t + ((x + y) & 1 ? 0.06 : -0.06) + (hash(strand, spanDeg, 6) > 0.72 ? 0.3 : 0);
      const level = q > 0.72 ? 255 : q > 0.45 ? 200 : q > 0.2 ? 140 : 96;
      const alpha = (q > 0.45 ? 1 : q > 0.2 ? 0.8 : 0.55) * fade * (0.5 + 0.5 * Math.min(1, v * 2.5));
      px(x, y, gray(level), alpha);
    }
  }

  // 바람 결: 안쪽에 끊어진 가는 선
  if (!core && f >= 1 && f <= 4) {
    for (let k = 0; k < 3; k++) {
      const rr = R - T - 3 - k * 3 + drift;
      for (let u = tail; u < head - 0.08; u += 0.006) {
        if (hash(k, Math.round(u * 24), 2) < 0.5) continue;
        dot(u, rr, 165, 0.5 * fade);
      }
    }
  }
  // 날 밖으로 튀는 빛 부스러기
  if (!core && f >= 2 && f <= 5) {
    const n = style === 'flame' ? 16 : 8;
    for (let k = 0; k < n; k++) {
      const u = hash(k, 1, spanDeg);
      if (!inSeg(u) || hash(k, 3, f) < 0.25) continue;
      const rr = R + 3 + hash(k, 2, spanDeg) * 6 + (f - 2) * 1.8;
      dot(u, rr, 255, fade);
      if (k % 3 === 0) dot(u, rr + 1, 200, fade * 0.7);
    }
  }

  switch (style) {
    case 'steel':
      // 칼끝의 반짝임
      if (f === 2 || f === 3) {
        const [gx, gy] = at(0.9, R + drift);
        const L = f === 2 ? 6 : 4;
        for (let i = -L; i <= L; i++) {
          const a = 1 - Math.abs(i) / (L + 1);
          px(gx + i, gy, tone(255), a);
          px(gx, gy + i, tone(255), a);
        }
      }
      break;
    case 'moon':
      // 안쪽에 겹치는 가는 달 그림자와 별빛
      if (f >= 1 && f <= 4) {
        for (let u = tail + 0.12; u < head - 0.08; u += 0.004) {
          const w = Math.sin(((u - tail) / (head - tail)) * Math.PI);
          dot(u, R - 17 + drift, 215, 0.75 * fade * w);
          if (w > 0.6) dot(u, R - 18 + drift, 150, 0.5 * fade);
        }
        for (let k = 0; k < 4; k++) {
          const u = 0.2 + k * 0.2;
          if (!inSeg(u) || (k + f) % 2) continue;
          const [sx, sy] = at(u, R + 6 + k * 1.5 + drift);
          for (let i = -2; i <= 2; i++) {
            px(sx + i, sy, tone(255), 1 - Math.abs(i) * 0.3);
            px(sx, sy + i, tone(255), 1 - Math.abs(i) * 0.3);
          }
        }
      }
      break;
    case 'blood':
      // 날에서 떨어져 나가는 핏방울
      if (!core && f >= 2) {
        for (let k = 0; k < 8; k++) {
          const u = 0.12 + k * 0.11;
          if (u > head) continue;
          const [bx, by] = at(u, R + 2 + (f - 1) * (1.6 + hash(k, 4) * 1.6));
          const rad = f >= 5 ? 0.8 : 1.6 - (k % 2) * 0.6;
          for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (Math.hypot(ox, oy) <= rad) px(bx + ox, by + oy, gray(ox + oy < 0 ? 255 : 190), fade);
        }
      }
      break;
    case 'holy': {
      // 날에서 뻗는 빛살
      const len = [0, 5, 9, 8, 6, 3, 0][f];
      for (let k = 0; k < 10; k++) {
        const u = (k + 0.5) / 10;
        if (!inSeg(u) || len === 0) continue;
        const L = len * (0.6 + hash(k, 6) * 0.7);
        for (let i = 0; i <= L; i++) {
          if (core && i > L * 0.5) break;
          dot(u, R + drift + 1 + i, 255 - (i / L) * 90, (1 - (i / (L + 1)) * 0.7) * fade);
        }
      }
      break;
    }
    case 'thunder':
      // 날에서 갈라져 나가는 잔 번개
      if (f >= 1 && f <= 3) {
        for (let k = 0; k < 4; k++) {
          let u = 0.18 + k * 0.22;
          if (!inSeg(u)) continue;
          let rr = R + drift + 1;
          for (let i = 0; i < 11; i++) {
            u += (hash(k, i, f) - 0.5) * 0.03;
            rr += 0.9;
            dot(u, rr, i < 6 ? 255 : 200, (1 - i / 14) * fade);
          }
        }
      }
      break;
    default:
      break;
  }
}

// ───────────────────────── 폭발 ─────────────────────────

export type Palette = 'fire' | 'arcane' | 'frost' | 'dark' | 'gold';

/** 안쪽부터 바깥쪽 순서. 마지막 두 색은 연기 */
const PALETTES: Record<Palette, number[]> = {
  fire: [0xffffff, 0xfff3a0, 0xffc040, 0xff7a1a, 0xc8301a, 0x5a2a2a, 0x2e2424],
  arcane: [0xffffff, 0xd8fbff, 0x7fe8ff, 0x3a9cff, 0x4a3ad0, 0x2a2a5a, 0x1e1e36],
  frost: [0xffffff, 0xe8fbff, 0xaff0ff, 0x6fc8f0, 0x3a7ac8, 0x3a4a6a, 0x26303e],
  dark: [0xffe8ff, 0xf0a8ff, 0xc060ff, 0x8a2ad8, 0x5a1a9a, 0x2a1a3a, 0x1a1024],
  gold: [0xffffff, 0xfff8d0, 0xffe08a, 0xffb83a, 0xc87a1a, 0x5a4a2a, 0x2e2a20],
};

function drawBoom(px: Px, f: number, pal: number[]): void {
  const c = 24;
  const R = [6, 10, 15, 18, 20, 21, 22, 22][f];
  const smoke = f >= 4;
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const dx = x - c;
      const dy = y - c;
      const ang = Math.atan2(dy, dx);
      const edge = R * (0.84 + 0.07 * Math.sin(ang * 3 + f * 1.7) + 0.06 * Math.sin(ang * 7 - f) + 0.08 * hash(Math.round(ang * 9), f));
      const d = Math.hypot(dx, dy) / edge;
      if (d > 1) continue;
      const h = hash(x, y, f);
      if (!smoke) {
        // 불덩이: 칸이 지날수록 바깥색이 안쪽까지 번진다.
        const shift = f * 0.1;
        const idx = d * 0.75 + shift + (h - 0.5) * 0.15;
        px(x, y, band(pal.slice(0, 5), idx), 1);
      } else {
        // 연기 고리: 안쪽부터 구멍이 뚫리며 흩어진다.
        const hole = (f - 3) * 0.2;
        if (d < hole + 0.25 || h < (f - 4) * 0.22) continue;
        const emberLeft = f === 4 && d < 0.75 && h > 0.6;
        px(x, y, emberLeft ? pal[3] : d > 0.8 ? pal[6] : pal[5], 1 - (f - 4) * 0.2);
      }
    }
  }
  // 첫 칸: 사방으로 튀는 빛줄기
  if (f <= 1) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      const len = f === 0 ? 14 : 20;
      for (let r = R; r < len; r++) px(c + Math.cos(a) * r, c + Math.sin(a) * r, pal[1], 1 - (r - R) / (len - R + 1));
    }
  }
}

// ───────────────────────── 마나 구체 ─────────────────────────

/** 마나 구체의 색 계열 (지팡이마다 다르다) */
export type OrbLook = 'arcane' | 'rune' | 'magma' | 'abyss';

/** 심 → 바깥 순서 */
const ORB_PALETTES: Record<OrbLook, number[]> = {
  arcane: [0xffffff, 0xbff6ff, 0x3fc8ff, 0x2a7ad8],
  rune: [0xffffff, 0xecd0ff, 0xb070ff, 0x6a3ad8],
  magma: [0xffffff, 0xffe6a0, 0xff8a2a, 0xd0301a],
  abyss: [0xffe8ff, 0xf090ff, 0xb030e0, 0x5a1a9a],
};

export function orbKey(look: OrbLook = 'arcane'): string {
  return look === 'arcane' ? 'fx-orb' : `fx-orb-${look}`;
}

// ───────────────────────── 등록 ─────────────────────────

export function createFxArt(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx-px')) return;

  // 한 점 (파티클)
  sheet(scene, 'fx-px', 1, 1, 1, (px) => px(0, 0, 0xffffff));

  // 베기 잔상: 좁은 것(가로 베기)·넓은 것(세로·회전 베기) × 무기 기운별 생김새, 그리고 각각의 하얀 날
  for (const style of SLASH_STYLES) {
    for (const wide of [false, true]) {
      const key = slashKey(wide, style);
      const span = wide ? 100 : 62;
      sheet(scene, key, SLASH_FRAME, SLASH_FRAME, SLASH_FRAMES, (px, f) => drawSlash(px, f, span, false, style));
      sheet(scene, `${key}-core`, SLASH_FRAME, SLASH_FRAME, SLASH_FRAMES, (px, f) => drawSlash(px, f, span, true, style));
      anim(scene, key, SLASH_FRAMES, 34);
      anim(scene, `${key}-core`, SLASH_FRAMES, 34);
    }
  }

  // 타격 스파크: 길이가 제각각인 여덟 갈래 빛이 터졌다가 가늘어지며 부스러기를 뿌린다.
  sheet(scene, 'fx-spark', 32, 32, 6, (px, f) => {
    const c = 16;
    const L = [5, 11, 14, 13, 10, 6][f];
    const a = [1, 1, 1, 0.85, 0.6, 0.35][f];
    const W = [2, 2.5, 1.5, 1, 0.5, 0][f];
    const Q = Math.PI / 4;
    const rays: [number, number][] = [
      [Q, 0.42],
      [3 * Q, 0.3],
      [-3 * Q, 0.45],
      [-Q, 0.32],
      [0, 1],
      [2 * Q, 0.62],
      [4 * Q, 0.8],
      [-2 * Q, 0.7],
    ];
    for (const [ang, k] of rays) {
      const len = L * k;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      // 칸이 지날수록 뿌리 쪽부터 비어 가며 바깥으로 날아간다.
      const from = f >= 4 ? len * 0.45 : f === 3 ? len * 0.2 : 0;
      for (let r = from; r <= len; r += 0.5) {
        const w = W * (1 - r / (len + 0.01)) * (k > 0.5 ? 1 : 0.5);
        for (let o = -w; o <= w; o += 0.5) {
          px(c + cs * r - sn * o, c + sn * r + cs * o, gray(Math.abs(o) < 0.6 ? 255 : 205), a * (1 - (0.5 * r) / (len + 0.01)));
        }
      }
    }
    const blob = [3, 3.2, 2.2, 1.4, 0, 0][f];
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (Math.hypot(x, y) <= blob) px(c + x, c + y, 0xffffff, 1);
    if (f >= 2) {
      for (let k = 0; k < 9; k++) {
        const ang = hash(k, 11) * Math.PI * 2;
        const rr = L * (0.55 + hash(k, 12) * 0.5) + (f - 2) * 1.2;
        if (rr > 15) continue;
        px(c + Math.cos(ang) * rr, c + Math.sin(ang) * rr, gray(235), a);
      }
    }
  });
  anim(scene, 'fx-spark', 6, 30);

  // 터지는 고리: 군데군데 끊긴 채 퍼져 나간다 (타격·발사 순간).
  sheet(scene, 'fx-pop', 32, 32, 5, (px, f) => {
    const R = [4, 8, 11, 13, 14.5][f];
    const th = [3, 3, 2.2, 1.6, 1][f];
    const gap = [0, 0.1, 0.25, 0.45, 0.65][f];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x - 15.5;
        const dy = y - 15.5;
        const r = Math.hypot(dx, dy);
        if (r > R || r < R - th) continue;
        if (hash(Math.round(Math.atan2(dy, dx) * 5), 21, f >> 1) < gap) continue;
        px(x, y, gray(r > R - 1.2 ? 255 : 175), r > R - 1.2 ? 1 : 0.7);
      }
    }
  });
  anim(scene, 'fx-pop', 5, 26);

  // 반짝임: 작은 십자 별
  sheet(scene, 'fx-twinkle', 9, 9, 4, (px, f) => {
    const L = [1, 3, 4, 2][f];
    for (let i = -L; i <= L; i++) {
      const a = 1 - Math.abs(i) / (L + 1.5);
      px(4 + i, 4, gray(255), a);
      px(4, 4 + i, gray(255), a);
    }
    if (f === 1 || f === 2) {
      for (const [x, y] of [
        [3, 3],
        [5, 3],
        [3, 5],
        [5, 5],
      ]) px(x, y, gray(210), 0.7);
    }
    px(4, 4, 0xffffff, 1);
  });
  anim(scene, 'fx-twinkle', 4, 18);

  // 베인 자국: 양 끝이 뾰족한 빛의 바늘
  sheet(scene, 'fx-cut', 64, 9, 1, (px) => {
    for (let x = 0; x < 64; x++) {
      const half = 4 * Math.pow(1 - Math.abs(x - 31.5) / 32, 1.3);
      for (let y = 0; y < 9; y++) {
        const d = Math.abs(y - 4);
        if (d > half) continue;
        px(x, y, gray(d < 1 ? 255 : d < 2.2 ? 205 : 145), 1);
      }
    }
  });

  // 혜성 꼬리 (화살 뒤에 끌리는 빛): 오른쪽 끝이 머리. 가장자리 줄은 짧게 끊겨 흩날린다.
  sheet(scene, 'fx-comet', 40, 9, 3, (px, f) => {
    for (let x = 0; x < 40; x++) {
      const t = x / 39;
      const half = 0.4 + 3.6 * Math.pow(t, 1.6);
      for (let y = 0; y < 9; y++) {
        const d = Math.abs(y - 4);
        if (d > half) continue;
        if (t < hash(y, f, 31) * 0.55 * (d / 4) + (d > 0 && hash(x + f * 3, y, 32) < 0.25 ? 0.5 : 0)) continue;
        px(x, y, gray(d < 1 ? 255 : 190), Math.pow(t, 1.2));
      }
    }
    for (let y = 3; y <= 5; y++) for (let x = 36; x < 40; x++) px(x, y, 0xffffff, 1);
  });
  anim(scene, 'fx-comet', 3, 20, -1);

  // 연기 뭉치
  sheet(scene, 'fx-smoke', 16, 16, 5, (px, f) => {
    const R = [3, 5, 6, 7, 7][f];
    const a = [0.9, 0.8, 0.6, 0.4, 0.22][f];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 8, y - 8 + f * 0.4) / R;
        if (d > 1 || hash(x, y, f + 9) < f * 0.13) continue;
        px(x, y, gray(d < 0.5 ? 230 : 170), a);
      }
    }
  });
  anim(scene, 'fx-smoke', 5, 12);

  // 폭발 (팔레트별)
  for (const name of Object.keys(PALETTES) as Palette[]) {
    sheet(scene, `fx-boom-${name}`, 48, 48, 8, (px, f) => drawBoom(px, f, PALETTES[name]));
    anim(scene, `fx-boom-${name}`, 8, 20);
  }

  // 마법진: 바닥에 누운 타원. 바깥 고리·룬 눈금·육망성이 서로 반대로 돈다. 8칸이 한 바퀴.
  sheet(scene, 'fx-circle', 64, 24, 8, (px, f) => {
    const cx = 32;
    const cy = 12;
    const ell = (rx: number, ry: number, v: number, a = 1): void => {
      for (let t = 0; t < Math.PI * 2; t += 0.02) px(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, gray(v), a);
    };
    ell(30, 10.5, 255);
    ell(28.5, 9.8, 150, 0.7);
    ell(21, 7.2, 210);
    // 룬 눈금 (12개)
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2 - (f / 8) * (Math.PI / 6);
      const x0 = cx + Math.cos(t) * 23;
      const y0 = cy + Math.sin(t) * 8;
      px(x0, y0, gray(255));
      px(x0 + Math.cos(t) * 2, y0 + Math.sin(t) * 0.7, gray(255));
      if (k % 3 === 0) px(x0 + Math.cos(t) * 4, y0 + Math.sin(t) * 1.4, gray(220));
      if (k % 2 === 0) px(x0 - Math.sin(t) * 1.5, y0 + Math.cos(t) * 0.5, gray(200), 0.8);
    }
    // 육망성
    const star = (rot: number): void => {
      const pts = [0, 1, 2].map((i) => {
        const t = rot + (i / 3) * Math.PI * 2;
        return [cx + Math.cos(t) * 21, cy + Math.sin(t) * 7.2];
      });
      for (let i = 0; i < 3; i++) line(px, pts[i][0], pts[i][1], pts[(i + 1) % 3][0], pts[(i + 1) % 3][1], gray(170), 0.85);
    };
    const rot = (f / 8) * (Math.PI / 3);
    star(rot);
    star(rot + Math.PI / 3);
    ell(6, 2, 255, 0.9);
  });
  anim(scene, 'fx-circle', 8, 12, -1);

  // 빛기둥: 아래가 밝고 위로 흐려진다. 반짝이가 올라간다.
  sheet(scene, 'fx-pillar', 24, 96, 4, (px, f) => {
    for (let y = 0; y < 96; y++) {
      const up = Math.pow(y / 95, 0.7);
      for (let x = 0; x < 24; x++) {
        const i = Math.exp(-Math.pow((x - 11.5) / 4.2, 2));
        if (i < 0.08) continue;
        px(x, y, gray(150 + 105 * i), i * up * 0.85);
      }
    }
    for (let k = 0; k < 14; k++) {
      const x = 4 + Math.floor(hash(k, 1) * 16);
      const y = (Math.floor(hash(k, 2) * 96) - f * 6 + 96) % 96;
      px(x, y, 0xffffff, 1);
      px(x, y + 1, gray(200), 0.6);
    }
  });
  anim(scene, 'fx-pillar', 4, 14, -1);

  // 보호막: 육각 무늬가 비치는 구
  sheet(scene, 'fx-hex', 48, 48, 1, (px) => {
    const c = 23.5;
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const r = Math.hypot(x - c, y - c);
        if (r > 22) continue;
        if (r > 20.5) {
          px(x, y, 0xffffff, 1);
          continue;
        }
        // 육각 격자: 세 방향의 줄무늬가 겹치는 곳
        const s = 6;
        const a = (x + y * 0.577) / s;
        const b2 = (x - y * 0.577) / s;
        const c2 = (y * 1.155) / s;
        const near = (v: number): boolean => Math.abs(v - Math.round(v)) < 0.09;
        const edge = Math.pow(r / 22, 3);
        if (near(a) || near(b2) || near(c2)) px(x, y, gray(220), 0.12 + 0.6 * edge);
        else if (edge > 0.5) px(x, y, gray(160), edge * 0.25);
      }
    }
  });

  // 꼬리 (화살·탄·검기 뒤에 끌리는 빛). 오른쪽 끝이 머리.
  sheet(scene, 'fx-streak', 32, 3, 1, (px) => {
    for (let x = 0; x < 32; x++) {
      const t = x / 31;
      px(x, 1, gray(255), t * t);
      px(x, 0, gray(200), t * t * 0.45);
      px(x, 2, gray(200), t * t * 0.45);
    }
  });

  // 마나 구체: 하얀 심을 두 갈래 소용돌이가 감싸고 돈다. 지팡이마다 색이 다르다.
  for (const look of Object.keys(ORB_PALETTES) as OrbLook[]) {
    const pal = ORB_PALETTES[look];
    const key = orbKey(look);
    sheet(scene, key, 24, 24, 6, (px, f) => {
      const c = 11.5;
      const spin = (f / 6) * Math.PI * 2;
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const r = Math.hypot(x - c, y - c);
          if (r > 11) continue;
          const swirl = Math.sin(Math.atan2(y - c, x - c) * 2 + r * 0.7 - spin);
          if (r <= 2.6) px(x, y, pal[0]);
          else if (r <= 4.2 + 0.5 * swirl) px(x, y, pal[1]);
          else if (r <= 6 + 1.2 * swirl) px(x, y, pal[2], 0.9);
          else if (r <= 7.6 + 2.4 * swirl && (x + y + f) & 1) px(x, y, pal[3], 0.65);
        }
      }
      // 소용돌이 끝에서 떨어져 나와 도는 알갱이
      for (let k = 0; k < 5; k++) {
        const t = spin * (k % 2 ? 1 : -1) + k * 1.256;
        const rad = 8.5 + (k % 3);
        px(c + Math.cos(t) * rad, c + Math.sin(t) * rad, k % 2 ? pal[1] : pal[0]);
      }
    });
    anim(scene, key, 6, 18, -1);
  }

  // 적의 마력탄 (자홍)
  sheet(scene, 'fx-orb-enemy', 12, 12, 4, (px, f) => {
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        const r = Math.hypot(x - 5.5, y - 5.5);
        if (r <= 1.6) px(x, y, 0xffffff);
        else if (r <= 2.8) px(x, y, 0xffb0f0);
        else if (r <= 4 + (f % 2) * 0.6) px(x, y, 0xff4fd0, 0.85);
      }
    }
  });
  anim(scene, 'fx-orb-enemy', 4, 14, -1);

  // 화살: 미늘 달린 촉·살대·깃
  sheet(scene, 'fx-arrow', 22, 7, 1, (px) => {
    for (let x = 4; x <= 16; x++) {
      px(x, 3, x % 4 === 0 ? 0x8a6034 : 0xd0a46a);
      if (x % 4 === 2) px(x, 2, 0xf0d09a, 0.7);
    }
    // 촉
    for (const y of [1, 5]) px(16, y, 0x5a6270);
    for (const x of [16, 17, 18]) for (const y of [2, 3, 4]) px(x, y, y === 2 ? 0xffffff : y === 3 ? 0xd8e0ea : 0x98a2b0);
    px(19, 3, 0xe8eef6);
    px(19, 2, 0xb8c0ca, 0.8);
    px(19, 4, 0x7a8492, 0.8);
    px(20, 3, 0xffffff);
    px(21, 3, 0xffffff, 0.8);
    // 깃
    for (let x = 0; x <= 4; x++) {
      px(x, 1, 0xff6a4a);
      px(x, 5, 0xc83a2a);
      if (x < 4) {
        px(x, 0, 0xc83a2a, x === 0 ? 0.6 : 1);
        px(x, 6, 0x8a2218, x === 0 ? 0.6 : 1);
      }
      px(x, 2, 0xffb090);
      px(x, 4, 0xff6a4a);
    }
  });

  // 검기: 앞으로 볼록한 초승달 (청백). 뒤쪽 날은 결이 갈라져 바람에 날린다.
  // 'fx-wave-g'는 같은 모양의 회색조: 스킬이 색을 입혀 쓴다 (청백 그림에 색을 곱하면 전부 파랗게 죽는다).
  for (const [key, pal] of [
    ['fx-wave', [0xffffff, 0xd8f6ff, 0x8fdcff, 0x4aa0f0, 0x2a5ad0]],
    ['fx-wave-g', [0xffffff, 0xf0f0f0, 0xd2d2d2, 0xa8a8a8, 0x808080]],
  ] as const)
  sheet(scene, key, 28, 48, 4, (px, f) => {
    const cx = 8;
    const cy = 23.5;
    for (let y = 0; y < 48; y++) {
      const t = Math.abs(y - cy) / 23;
      if (t > 1) continue;
      const thick = 7.5 * Math.sqrt(1 - t * t) + 0.5;
      const outer = 18 + (f % 2 ? 0.7 : 0);
      // 이 줄에서 뒤로 끌리는 결의 길이
      const wisp = hash(y, f >> 1, 41) > 0.45 ? 3 + hash(y, f, 42) * 9 * (1 - t) : 0;
      for (let x = 0; x < 28; x++) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > outer) continue;
        const d = (outer - r) / thick;
        if (d <= 1) px(x, y, band(pal, d + ((x + y) & 1 ? 0.05 : -0.05)), 1 - t * 0.4);
        else if (outer - r < thick + wisp && x > cx - 6) px(x, y, (x + f) & 1 ? pal[3] : pal[4], 0.6 * (1 - (outer - r - thick) / (wisp + 0.01)));
      }
    }
    // 날 앞에서 튀는 빛
    for (let k = 0; k < 4; k++) {
      const a = (hash(k, f, 43) - 0.5) * 1.8;
      px(cx + Math.cos(a) * 20.5, cy + Math.sin(a) * 20.5, pal[1]);
    }
  });
  anim(scene, 'fx-wave', 4, 18, -1);
  anim(scene, 'fx-wave-g', 4, 18, -1);

  // 운석: 용암 금이 간 돌덩이와 불꼬리 (오른쪽 아래로 떨어진다)
  sheet(scene, 'fx-meteor', 40, 40, 4, (px, f) => {
    const cx = 26;
    const cy = 26;
    const fire = PALETTES.fire;
    // 꼬리: 왼쪽 위로
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const along = ((cx - x) + (cy - y)) / Math.SQRT2;
        const across = Math.abs((cx - x) - (cy - y)) / Math.SQRT2;
        if (along < 0 || along > 30) continue;
        const w = 9 * (1 - along / 32) + 1;
        if (across > w) continue;
        const h = hash(x, y, f);
        if (h < along / 40) continue;
        px(x, y, band(fire.slice(1, 6), along / 30 + across / w * 0.3 + (h - 0.5) * 0.2), 1 - along / 34);
      }
    }
    // 불 테두리와 돌
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const r = Math.hypot(x - cx, y - cy);
        if (r <= 8) {
          // 구불구불한 용암 금 (칸마다 빛이 흐른다)
          const crack = Math.abs(Math.sin(x * 0.75 + Math.sin(y * 0.9) * 2.2)) < 0.16 || Math.abs(Math.sin(y * 0.8 + Math.sin(x * 1.1) * 1.8 + 1)) < 0.12;
          const lit = x - cx + (y - cy) < -4;
          px(x, y, crack ? (f % 2 ? 0xffd060 : 0xff8a2a) : lit ? 0x6a4a3e : 0x3a2a2a);
        } else if (r <= 10.5 + hash(Math.round(Math.atan2(y - cy, x - cx) * 6), f) * 1.5) {
          px(x, y, r < 9.5 ? 0xffd060 : 0xff7a1a, 0.95);
        }
      }
    }
  });
  anim(scene, 'fx-meteor', 4, 14, -1);

  // 불꽃 (장판·불길): 흔들리는 물방울 모양
  sheet(scene, 'fx-flame', 12, 20, 6, (px, f) => {
    const fire = PALETTES.fire;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 12; x++) {
        const t = y / 19; // 0 꼭대기 → 1 바닥
        const sway = Math.sin(f * 1.05 + t * 4) * (1 - t) * 1.6;
        const half = 5 * Math.pow(t, 0.55) * (t > 0.85 ? 1 - (t - 0.85) * 2.4 : 1);
        const dx = Math.abs(x - 5.5 - sway);
        if (dx > half) continue;
        if (hash(x, y, f) < 0.12 * (1 - t)) continue;
        const d = dx / Math.max(0.5, half) * 0.6 + (1 - t) * 0.6;
        px(x, y, band(fire.slice(0, 5), d), 1);
      }
    }
  });
  anim(scene, 'fx-flame', 6, 14, -1);

  // 얼음 가시: 솟아오르고(0~3) 금이 가고(4) 부서진다(5). 바닥 가운데가 기준점.
  sheet(scene, 'fx-ice', 14, 32, 6, (px, f) => {
    const H = [7, 16, 24, 30, 30, 26][f];
    const crack = f >= 4;
    for (let y = 0; y < 32; y++) {
      const fromTop = y - (31 - H);
      if (fromTop < 0) continue;
      const half = 0.5 + (fromTop / H) * 5.5;
      for (let x = 0; x < 14; x++) {
        const dx = x - 6.5;
        if (Math.abs(dx) > half) continue;
        if (f === 5 && hash(x, y, 5) < 0.45) continue;
        const edge = Math.abs(dx) > half - 1;
        let c = dx < 0 ? 0x4aa0d8 : 0xaff0ff;
        if (Math.abs(dx) < 0.8) c = 0xe8fbff;
        if (edge) c = 0x1a3a5a;
        if (crack && Math.abs(dx - Math.sin(y * 0.8) * 2) < 0.6 && fromTop > 3) c = 0xffffff;
        px(x, y, c, f === 5 ? 0.6 : 1);
      }
    }
  });
  // 솟기(0~3)와 부서지기(4~5)를 따로 둬서, 솟은 채로 버티다가 부서지게 한다.
  scene.anims.create({ key: 'fx-ice-rise', frames: scene.anims.generateFrameNumbers('fx-ice', { start: 0, end: 3 }), frameRate: 24 });
  scene.anims.create({ key: 'fx-ice-break', frames: scene.anims.generateFrameNumbers('fx-ice', { start: 4, end: 5 }), frameRate: 10 });

  // 총구 화염: 앞으로 길게, 양옆으로 짧게 갈라지는 불꽃 → 잦아들기 → 연기
  sheet(scene, 'fx-muzzle', 28, 20, 4, (px, f) => {
    const fire = PALETTES.fire;
    if (f === 3) {
      for (let y = 0; y < 20; y++) for (let x = 0; x < 14; x++) if (Math.hypot(x - 6, y - 10) < 4.5 && hash(x, y, 3) > 0.35) px(x, y, 0xb0a8a0, 0.55);
      return;
    }
    /** [각도, 길이, 밑동 폭] */
    const tongues: [number, number, number][][] = [
      [
        [0, 25, 5],
        [0.6, 12, 3],
        [-0.6, 11, 3],
        [1.25, 7, 2],
        [-1.3, 6, 2],
      ],
      [
        [0, 18, 4],
        [0.7, 8, 2.2],
        [-0.65, 9, 2.2],
      ],
      [[0, 10, 2.5]],
    ];
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 28; x++) {
        const dx = x - 1;
        const dy = y - 9.5;
        let best = 9;
        for (const [ang, len, w] of tongues[f]) {
          const along = dx * Math.cos(ang) + dy * Math.sin(ang);
          const across = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
          if (along < 0 || along > len) continue;
          const half = w * Math.pow(1 - along / len, 0.7) * (0.85 + 0.3 * hash(Math.round(along), Math.round(ang * 10), f));
          if (across > half) continue;
          best = Math.min(best, (along / len) * 0.8 + (across / w) * 0.35);
        }
        if (best < 9) px(x, y, band(fire.slice(0, 5), best));
      }
    }
  });
  anim(scene, 'fx-muzzle', 4, 26);

  // 마나검 (천공 섬광): 칼끝이 아래. 회색조라 색을 입혀 쓴다.
  sheet(scene, 'fx-sword', 11, 36, 1, (px) => {
    for (let y = 9; y < 34; y++) {
      const w = y > 29 ? 34 - y : 2;
      for (let x = 5 - w; x <= 5 + w; x++) px(x, y, gray(x === 5 ? 255 : x < 5 ? 190 : 230), 1);
    }
    px(5, 34, gray(255));
    for (let x = 0; x <= 10; x++) px(x, 8, gray(x === 0 || x === 10 ? 170 : 220));
    for (let y = 1; y < 8; y++) px(5, y, gray(150));
    px(4, 0, gray(220));
    px(5, 0, gray(255));
    px(6, 0, gray(220));
  });

  // 혈월: 핏빛 원판에 어두운 얼룩과 밝은 테두리
  sheet(scene, 'fx-moon', 64, 64, 1, (px) => {
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x - 31.5, y - 31.5);
        if (d > 30) {
          if (d < 32) px(x, y, 0xff3a4a, 0.5);
          continue;
        }
        const crater = hash(Math.floor(x / 6), Math.floor(y / 6), 7) > 0.78 && d < 26;
        const shade = (x - 31.5 + (y - 31.5)) / 60;
        let c = d > 28 ? 0xff7a6a : shade > 0.25 ? 0x7a0a1a : 0xc8202a;
        if (crater) c = 0x5a0812;
        px(x, y, c, 1);
      }
    }
  });

  // 조준점 (데드아이): 붉은 고리와 네 개의 눈금
  sheet(scene, 'fx-crosshair', 21, 21, 1, (px) => {
    for (let a = 0; a < Math.PI * 2; a += 0.05) px(10 + Math.cos(a) * 7, 10 + Math.sin(a) * 7, 0xff3a2a);
    for (let i = 0; i <= 4; i++) {
      px(10, i, 0xff6a4a);
      px(10, 20 - i, 0xff6a4a);
      px(i, 10, 0xff6a4a);
      px(20 - i, 10, 0xff6a4a);
    }
    px(10, 10, 0xffffff);
  });

  // 포탄 (포격 요청): 아래가 앞
  sheet(scene, 'fx-shell', 7, 16, 1, (px) => {
    for (let y = 3; y < 13; y++) for (let x = 1; x < 6; x++) px(x, y, x < 3 ? 0x8a9098 : 0x5a616b);
    for (let y = 13; y < 16; y++) for (let x = 2; x < 5; x++) px(x, y, 0xff5a2a);
    for (let x = 0; x < 7; x++) px(x, 2, 0x3a4048);
    px(0, 1, 0x3a4048);
    px(6, 1, 0x3a4048);
    px(3, 0, 0x5a616b);
  });

  // 깃털 (타락천사의 탄): 오른쪽이 끝
  sheet(scene, 'fx-feather', 12, 5, 1, (px) => {
    for (let x = 0; x < 12; x++) {
      const w = x < 2 ? 0 : x > 9 ? 0 : 1 + (x > 3 && x < 8 ? 1 : 0);
      for (let y = 2 - w; y <= 2 + w; y++) px(x, y, y === 2 ? 0xd8c8b0 : x % 2 ? 0xffffff : 0xf0e8f8);
    }
    px(10, 2, 0xffffff);
    px(11, 2, 0xffd0e0);
    px(0, 2, 0xb0a090);
    px(1, 2, 0xb0a090);
  });

  // 수류탄과 탄피
  sheet(scene, 'fx-grenade', 7, 8, 1, (px) => {
    for (let y = 2; y < 8; y++) for (let x = 0; x < 7; x++) if (Math.hypot(x - 3, y - 4.8) <= 3.2) px(x, y, x < 3 ? 0x7a8a40 : 0x4a5a2a);
    for (let x = 1; x <= 5; x++) px(x, 7, 0x1a200a);
    px(3, 1, 0x9aa0a8);
    px(4, 0, 0xc8ccd2);
    px(5, 1, 0xc8ccd2);
  });
  sheet(scene, 'fx-casing', 3, 2, 1, (px) => {
    px(0, 0, 0xffe08a);
    px(1, 0, 0xe0b050);
    px(2, 0, 0xa07020);
    px(0, 1, 0xe0b050);
    px(1, 1, 0xa07020);
    px(2, 1, 0x6a4a18);
  });
}

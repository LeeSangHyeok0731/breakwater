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
function band(pal: number[], d: number): number {
  return pal[Math.min(pal.length - 1, Math.max(0, Math.floor(d * pal.length)))];
}

// ───────────────────────── 베기 잔상 ─────────────────────────

/** 베기 잔상의 반지름 (그림 기준). 실제 크기는 scale = radius / SLASH_R */
export const SLASH_R = 26;
/** 잔상 그림에서 원의 중심 (기준점) */
export const SLASH_ORIGIN = { x: 24 / 64, y: 0.5 };

/** 초승달 모양의 잔상. 바깥 날이 가장 밝고 안쪽으로 흐려진다. 5칸: 휘두르기 → 사라지기 */
function drawSlash(px: Px, f: number, spanDeg: number, core: boolean): void {
  const cx = 24;
  const cy = 32;
  const A = (spanDeg * Math.PI) / 180;
  const seg = [
    [0, 0.45],
    [0, 0.9],
    [0.04, 1],
    [0.35, 1],
    [0.7, 1],
  ][f];
  const fade = [0.95, 1, 0.95, 0.75, 0.45][f];
  const width = [0.6, 1, 1, 0.75, 0.5][f];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const u = (Math.atan2(dy, dx) + A) / (2 * A);
      if (u < seg[0] || u > seg[1]) continue;
      // 가운데가 가장 두껍고, 휘두르는 앞쪽(u가 큰 쪽)이 더 진하다.
      const thick = 9.5 * Math.pow(Math.sin(Math.PI * u), 0.7) * width;
      const inner = SLASH_R - thick;
      if (r > SLASH_R + 0.5 || r < inner) continue;
      const lead = 0.55 + 0.45 * u;
      if (core) {
        if (r >= SLASH_R - 1.3) px(x, y, 0xffffff, fade * lead);
        continue;
      }
      const t = (r - inner) / Math.max(1, thick);
      px(x, y, gray(120 + 135 * t), fade * (0.45 + 0.55 * t) * lead);
    }
  }
  if (core) return;
  // 바람 결: 안쪽에 끊어진 가는 선
  if (f >= 1 && f <= 3) {
    for (let k = 0; k < 3; k++) {
      const rr = SLASH_R - 10 - k * 3;
      for (let a = -A * 0.8; a < A * 0.8; a += 0.03) {
        const u = (a + A) / (2 * A);
        if (u < seg[0] || u > seg[1] || hash(k, Math.round(a * 20), f) < 0.45) continue;
        px(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, gray(170), 0.5 * fade);
      }
    }
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

// ───────────────────────── 등록 ─────────────────────────

export function createFxArt(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx-px')) return;

  // 한 점 (파티클)
  sheet(scene, 'fx-px', 1, 1, 1, (px) => px(0, 0, 0xffffff));

  // 베기 잔상: 좁은 것(가로 베기), 넓은 것(세로·회전 베기), 그리고 각각의 하얀 날
  sheet(scene, 'fx-slash', 64, 64, 5, (px, f) => drawSlash(px, f, 62, false));
  sheet(scene, 'fx-slash-core', 64, 64, 5, (px, f) => drawSlash(px, f, 62, true));
  sheet(scene, 'fx-slash-w', 64, 64, 5, (px, f) => drawSlash(px, f, 100, false));
  sheet(scene, 'fx-slash-w-core', 64, 64, 5, (px, f) => drawSlash(px, f, 100, true));
  for (const k of ['fx-slash', 'fx-slash-core', 'fx-slash-w', 'fx-slash-w-core']) anim(scene, k, 5, 30);

  // 타격 스파크: 십자 빛줄기가 뻗었다가 가늘어진다.
  sheet(scene, 'fx-spark', 24, 24, 5, (px, f) => {
    const c = 12;
    const L = [6, 10, 11, 10, 7][f];
    const a = [1, 1, 0.85, 0.6, 0.35][f];
    const thick = f < 2 ? 1 : 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (let r = 0; r <= L; r++) {
        const fall = 1 - r / (L + 1);
        px(c + dx * r, c + dy * r, gray(255), a * fall);
        if (thick && r < L * 0.6) {
          px(c + dx * r + dy, c + dy * r + dx, gray(200), a * fall * 0.8);
          px(c + dx * r - dy, c + dy * r - dx, gray(200), a * fall * 0.8);
        }
      }
    }
    const D = Math.round(L * 0.5);
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      for (let r = 1; r <= D; r++) px(c + dx * r, c + dy * r, gray(220), a * (1 - r / (D + 1)));
    }
    if (f <= 1) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) px(c + x, c + y, 0xffffff, 1);
    if (f >= 2) {
      // 바깥으로 흩어지는 점
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + 0.4;
        px(c + Math.cos(ang) * (L + 1), c + Math.sin(ang) * (L + 1), gray(230), a);
      }
    }
  });
  anim(scene, 'fx-spark', 5, 28);

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

  // 마나 구체 (청록)
  sheet(scene, 'fx-orb', 16, 16, 4, (px, f) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = Math.hypot(x - 7.5, y - 7.5);
        if (r <= 2.2) px(x, y, 0xffffff);
        else if (r <= 3.6) px(x, y, 0xbff6ff);
        else if (r <= 5) px(x, y, 0x3fc8ff, 0.85);
        else if (r <= 6) px(x, y, 0x2a7ad8, 0.45);
      }
    }
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI * 2 + (f / 4) * (Math.PI / 2);
      px(7.5 + Math.cos(t) * 7, 7.5 + Math.sin(t) * 7, 0xd8fbff);
    }
  });
  anim(scene, 'fx-orb', 4, 16, -1);

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

  // 화살: 촉·살대·깃
  sheet(scene, 'fx-arrow', 18, 5, 1, (px) => {
    for (let x = 3; x <= 13; x++) px(x, 2, x % 3 === 0 ? 0x9a7040 : 0xd0a46a);
    for (const [x, y] of [
      [13, 1],
      [13, 3],
      [14, 1],
      [14, 2],
      [14, 3],
      [15, 2],
      [16, 2],
    ]) px(x, y, 0xe8eef6);
    px(13, 2, 0xb8c0ca);
    px(15, 1, 0x5a6270);
    px(15, 3, 0x5a6270);
    for (let x = 0; x <= 3; x++) {
      px(x, 0, 0xc83a2a);
      px(x, 4, 0xc83a2a);
      px(x, 1, 0xff6a4a);
      px(x, 3, 0xff6a4a);
    }
  });

  // 검기: 앞으로 볼록한 초승달 (청백)
  sheet(scene, 'fx-wave', 20, 44, 2, (px, f) => {
    const pal = [0xffffff, 0xd8f6ff, 0x8fdcff, 0x4aa0f0, 0x2a5ad0];
    for (let y = 0; y < 44; y++) {
      for (let x = 0; x < 20; x++) {
        const r = Math.hypot(x - 1, y - 22);
        const t = Math.abs(y - 22) / 21;
        if (t > 1) continue;
        const thick = 7 * Math.sqrt(1 - t * t) + 0.5;
        const outer = 17 + (f ? 0.6 : 0);
        if (r > outer || r < outer - thick) continue;
        px(x, y, band(pal, (outer - r) / thick), 1 - t * 0.4);
      }
    }
  });
  anim(scene, 'fx-wave', 2, 16, -1);

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

  // 총구 화염: 앞으로 뻗는 불꽃 → 작은 불꽃 → 연기
  sheet(scene, 'fx-muzzle', 18, 12, 3, (px, f) => {
    const fire = PALETTES.fire;
    if (f < 2) {
      const L = f === 0 ? 16 : 9;
      for (let x = 0; x <= L; x++) {
        const w = (1 - x / (L + 1)) * (f === 0 ? 4 : 2.5);
        for (let y = -Math.ceil(w); y <= Math.ceil(w); y++) {
          if (Math.abs(y) > w) continue;
          px(1 + x, 6 + y, band(fire.slice(0, 4), x / (L + 1) + Math.abs(y) / 6));
        }
      }
      for (const dy of [-1, 1]) for (let r = 1; r <= (f === 0 ? 4 : 2); r++) px(3 + r, 6 + dy * (r + 1), fire[1], 0.8);
    } else {
      for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) if (Math.hypot(x - 4, y - 6) < 3.5 && hash(x, y, 3) > 0.3) px(x, y, 0xb0a8a0, 0.6);
    }
  });
  anim(scene, 'fx-muzzle', 3, 24);

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

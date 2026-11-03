import Phaser from 'phaser';
import { PixelArt, ramp, type Pt } from '../legion/pixelArt';
import { recolorTexture, type HueShift } from '../recolor';
import { makeDragonArt, PAL_FLAME, PAL_WHELP, PAL_WYVERN, standPose } from './dragonArt';
import { drawDragon, type DragonPose, type DragonRigDef } from './rig';

// 챕터 6(용들의 둥지) 그림: 용 파츠, 새끼 용·용알 시트, 다시 칠한 몬스터, 화산 동굴 배경과 타일.
// 뒤 챕터(lateArt.ts)도 여기 만든 그리기 함수에 색만 바꿔 쓴다.

/** 보스·미니보스 리그 정의 (부팅 때 만든다) */
export const DRAGON_DEFS: Record<string, DragonRigDef | undefined> = {};

/** 새끼 용 크기 배율 */
export const WHELP_Z = 0.5;
export const FLAME_Z = 1;
export const WYVERN_Z = 0.8;

export function hash(x: number, y: number, s = 0): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/** 캔버스 여러 장을 같은 칸 크기(바닥 가운데 맞춤)로 이어 붙여 시트로 올린다. */
export function sheetFrom(scene: Phaser.Scene, key: string, frames: HTMLCanvasElement[]): void {
  if (scene.textures.exists(key)) return;
  const fw = Math.max(...frames.map((c) => c.width)) + 2;
  const fh = Math.max(...frames.map((c) => c.height)) + 2;
  const out = document.createElement('canvas');
  out.width = fw * frames.length;
  out.height = fh;
  const g = out.getContext('2d')!;
  frames.forEach((c, i) => g.drawImage(c, i * fw + Math.floor((fw - c.width) / 2), fh - c.height - 1));
  const tex = scene.textures.addCanvas(key, out)!;
  frames.forEach((_, i) => tex.add(i, 0, i * fw, 0, fw, fh));
}

export function anim(scene: Phaser.Scene, key: string, sheet: string, frames: number[], rate: number, repeat = -1): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: frames.map((f) => ({ key: sheet, frame: f })), frameRate: rate, repeat });
}

/** 시트 전체를 다시 칠하고 같은 칸 번호로 애니메이션을 만든다. */
export function recolorAnims(scene: Phaser.Scene, src: string, dst: string, shift: HueShift, anims: [string, number, number, number, number?][]): void {
  if (!scene.textures.exists(dst)) recolorTexture(scene, src, dst, shift);
  for (const [key, start, end, rate, repeat] of anims) {
    if (scene.anims.exists(key)) continue;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(dst, { start, end }), frameRate: rate, repeat: repeat ?? -1 });
  }
}

/** 낱장 프레임 묶음(해골 등)을 다시 칠한다. */
export function recolorFrames(scene: Phaser.Scene, prefix: string, dstPrefix: string, n: number, shift: HueShift, key: string, rate: number, repeat = -1): void {
  for (let i = 1; i <= n; i++) if (!scene.textures.exists(`${dstPrefix}-${i}`)) recolorTexture(scene, `${prefix}-${i}`, `${dstPrefix}-${i}`, shift);
  if (scene.anims.exists(key)) return;
  const frames = [];
  for (let i = 1; i <= n; i++) frames.push({ key: `${dstPrefix}-${i}` });
  scene.anims.create({ key, frames, frameRate: rate, repeat });
}

/** 용 한 마리의 서 있는 그림 한 칸 (이야기책 그림, 본체 스프라이트) */
export function dragonPortrait(scene: Phaser.Scene, def: DragonRigDef, key: string, pose: DragonPose): void {
  sheetFrom(scene, key, [drawDragon(scene, def, pose, 0)]);
  anim(scene, key, key, [0], 1, 0);
}

/** 새끼 용 시트: 날개를 퍼덕이는 네 칸 + 입을 벌린 두 칸. 애니메이션 이름은 `${prefix}-fly`, `${prefix}-spit` */
export function whelpSheet(scene: Phaser.Scene, def: DragonRigDef, key: string, prefix: string): void {
  const fly: DragonPose = { ...standPose(WHELP_Z), by: -24, rot: -6, fold: 0.1, wing: -100, flap: 1, neck: -22, curl: 6, head: 12, tail: 6, tailCurl: -2, fFx: 10, fFy: -8, bFx: -10, bFy: -5 };
  // 날갯짓 위상: sin(time * 9)이 1 → 0 → -1 → 0 이 되는 시간
  const phase = [Math.PI / 18, 0, (3 * Math.PI) / 18, (2 * Math.PI) / 18];
  const frames = phase.map((t) => drawDragon(scene, def, fly, t));
  const spit = { ...fly, jaw: 30, neck: -8, curl: 4, head: 14 };
  frames.push(drawDragon(scene, def, spit, phase[0]), drawDragon(scene, def, spit, phase[2]));
  sheetFrom(scene, key, frames);
  anim(scene, `${prefix}-fly`, key, [0, 1, 2, 3], 12);
  anim(scene, `${prefix}-spit`, key, [4, 5, 4, 5], 10, 0);
}

function makeDragons(scene: Phaser.Scene): void {
  DRAGON_DEFS.flame = makeDragonArt(scene, 'dg-flame', PAL_FLAME, 'dragon', FLAME_Z, 2);
  DRAGON_DEFS.wyvern = makeDragonArt(scene, 'dg-wyvern', PAL_WYVERN, 'wyvern', WYVERN_Z, 2);
  DRAGON_DEFS.whelp = makeDragonArt(scene, 'dg-whelp', PAL_WHELP, 'dragon', WHELP_Z, 1);
  dragonPortrait(scene, DRAGON_DEFS.flame, 'flame-dragon-pose', standPose(FLAME_Z));
  dragonPortrait(scene, DRAGON_DEFS.wyvern, 'wyvern-pose', standPose(WYVERN_Z, true));
  whelpSheet(scene, DRAGON_DEFS.whelp, 'whelp', 'whelp');
}

/** 알 시트: 멀쩡한 알 → 금 간 알 → 크게 갈라져 빛이 새는 알. 애니메이션은 `${prefix}-idle/-crack/-hatch` */
export function eggSheet(scene: Phaser.Scene, key: string, prefix: string, shellC: number, spotC: number, glow: number): void {
  if (scene.textures.exists(key)) return;
  const shell = ramp(shellC);
  const spots = ramp(spotC);
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const a = new PixelArt(22, 28);
    // 둥지 (마른 가지와 뼈)
    a.poly(ramp(0x4a3426), [[0, 22], [22, 22], [20, 27], [2, 27]]);
    a.ellipse(shell, 11, 14, 8.5, 11.5);
    for (const [x, y] of [[7, 8], [14, 12], [9, 17], [15, 19], [12, 5]] as Pt[]) a.ellipse(spots, x, y, 1.6, 1.2);
    if (f >= 1) {
      const crack: Pt[] = [[11, 4], [10, 6], [12, 8], [10, 10], [12, 12], [11, 14]];
      if (f >= 2) crack.push([13, 16], [11, 18], [13, 20], [8, 9], [7, 11], [15, 7], [16, 9]);
      a.dots(f >= 2 ? glow : 0x2a1a10, crack);
    }
    for (const x of [3, 8, 13, 18]) a.line(ramp(0x6a5040), x, 22, x + 3, 26);
    frames.push(a.toCanvas());
  }
  sheetFrom(scene, key, frames);
  anim(scene, `${prefix}-idle`, key, [0], 1, 0);
  anim(scene, `${prefix}-crack`, key, [1], 1, 0);
  anim(scene, `${prefix}-hatch`, key, [2, 1, 2], 14);
}

function makeRecolors(scene: Phaser.Scene): void {
  // 용 숭배자: 진홍 로브에 금빛
  recolorAnims(scene, 'wizard', 'wizard-cult', { hue: 4, minSat: 0.65, light: 0.82 }, [
    ['cult-idle', 0, 4, 7],
    ['cult-cast', 5, 14, 14, 0],
  ]);
  // 용암 살쾡이: 주황빛 몸
  recolorAnims(scene, 'hell-cat', 'lava-lizard', { hue: 22, minSat: 0.7, light: 1.05 }, [['lizard-walk', 0, 3, 10]]);
}

// ───────────────────────── 동굴 배경 (색만 바꿔 여러 챕터에서 쓴다) ─────────────────────────

export function pixels(w: number, h: number, draw: (set: (x: number, y: number, c: number, a?: number) => void) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const d = img.data;
  const set = (x: number, y: number, col: number, a = 1): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
    const i = (iy * w + ix) * 4;
    d[i] = (col >> 16) & 255;
    d[i + 1] = (col >> 8) & 255;
    d[i + 2] = col & 255;
    d[i + 3] = Math.round(a * 255);
  };
  draw(set);
  g.putImageData(img, 0, 0);
  return c;
}

export function lerpC(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 가로로 이어지는 높이 곡선 (주기 w) */
export function ridge(x: number, w: number, seed: number, amp: number): number {
  let v = 0;
  for (const [f, a] of [[1, 1], [2, 0.5], [5, 0.25], [11, 0.12]]) v += Math.sin((x / w) * Math.PI * 2 * f + seed * f * 1.7) * a;
  return v * amp;
}

/** 동굴 배경 색 */
export interface CavePalette {
  /** 하늘(동굴 안쪽) 위·아래 */
  top: number;
  bottom: number;
  /** 먼 봉우리 */
  peakA: number;
  peakB: number;
  /** 흘러내리는 줄기와 바닥 강 (밝은 색 → 어두운 색) */
  flowHi: number;
  flowLo: number;
  /** 별처럼 박힌 빛 */
  spark: number;
  /** 가까운 바위 */
  rockA: number;
  rockB: number;
  rockEdge: number;
  /** 바위 틈의 빛 */
  crack: number;
  /** false면 천장 종유석 없이 하늘이 트여 있다 */
  ceiling: boolean;
}

export const CAVE_NEST: CavePalette = { top: 0x0e0608, bottom: 0x3a1210, peakA: 0x1c0a0a, peakB: 0x2a0e0c, flowHi: 0xff8a2a, flowLo: 0x8a1a08, spark: 0xff9a4a, rockA: 0x2a1210, rockB: 0x140808, rockEdge: 0x6a3222, crack: 0xff7a2a, ceiling: true };

export function makeCaveBackdrop(scene: Phaser.Scene, prefix: string, pal: CavePalette): void {
  if (scene.textures.exists(`${prefix}-far`)) return;
  const W = 480;
  const H = 360;
  scene.textures.addCanvas(
    `${prefix}-far`,
    pixels(W, H, (set) => {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const t = y / H;
          let c = lerpC(pal.top, pal.bottom, Math.pow(t, 1.6));
          const peak = 230 + ridge(x, W, 1, 34);
          if (y > peak) c = lerpC(pal.peakA, pal.peakB, (y - peak) / 60);
          const flow = Math.abs(((x + 37) % 160) - 80 + ridge(y, 200, 3, 6));
          if (y > peak && flow < 2.2 && y < 330) c = lerpC(pal.flowHi, pal.flowLo, flow / 2.2);
          if (y > 318) c = lerpC(pal.flowHi, pal.flowLo, (y - 318) / 42 + hash(x, y) * 0.15);
          if (hash(x, y, 5) > 0.997 && y < 200) c = lerpC(c, pal.spark, 0.6);
          set(x, y, c);
        }
    }),
  );
  const MW = 640;
  const MH = 300;
  scene.textures.addCanvas(
    `${prefix}-mid`,
    pixels(MW, MH, (set) => {
      for (let x = 0; x < MW; x++) {
        if (pal.ceiling) {
          const hang = 30 + ridge(x, MW, 2, 18) + Math.max(0, Math.sin(x * 0.11) * 26 * hash(Math.floor(x / 9), 1));
          for (let y = 0; y < hang; y++) set(x, y, lerpC(pal.rockB, pal.rockA, y / hang));
          set(x, Math.round(hang), pal.rockEdge);
        }
        const rise = MH - (70 + ridge(x, MW, 4, 40) + Math.max(0, Math.sin(x * 0.05 + 1) * 60));
        for (let y = Math.round(rise); y < MH; y++) {
          let c = lerpC(pal.rockA, pal.rockB, (y - rise) / 120);
          if (hash(Math.floor(x / 3), Math.floor(y / 5), 9) > 0.985) c = pal.crack;
          set(x, y, c);
        }
        set(x, Math.round(rise), pal.rockEdge);
      }
    }),
  );
}

/** 바닥·발판 타일 색 */
export interface RockTilePalette {
  top: number;
  topDark: number;
  a: number;
  b: number;
  spot: number;
  crackHi: number;
  crackLo: number;
}

export const ROCK_NEST: RockTilePalette = { top: 0x6a4a3a, topDark: 0x52382e, a: 0x3a2420, b: 0x1a0e0e, spot: 0x2a1814, crackHi: 0xff8a2a, crackLo: 0xa03010 };

export function makeRockTiles(scene: Phaser.Scene, key: string, pal: RockTilePalette): void {
  if (scene.textures.exists(key)) return;
  const c = pixels(128, 64, (set) => {
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        let col = lerpC(pal.a, pal.b, y / 48);
        if (hash(x >> 2, y >> 2, 1) > 0.8) col = lerpC(col, pal.spot, 0.6);
        if (y < 3) col = y === 0 ? pal.top : pal.topDark;
        const crack = Math.abs(((x * 7 + y * 3) % 48) - 24) < 1 && y > 10 && hash(x, y >> 3, 2) > 0.4;
        if (crack) col = lerpC(pal.crackHi, pal.crackLo, y / 48);
        set(x, y, col);
      }
    // 발판: 돌 턱 (왼쪽 끝 / 가운데 / 오른쪽 끝)
    for (let y = 0; y < 22; y++)
      for (let x = 0; x < 64; x++) {
        const edgeL = x < 16 ? 16 - x : 0;
        const edgeR = x >= 48 ? x - 47 : 0;
        const cut = Math.max(edgeL, edgeR) * 0.9;
        if (y > 22 - cut * 0.9 - 2 && cut > 0 && y > 6) continue;
        let col = lerpC(lerpC(pal.a, pal.top, 0.25), pal.b, y / 22);
        if (y < 2) col = lerpC(pal.top, 0xffffff, 0.12);
        if (hash(x >> 2, y >> 2, 4) > 0.82) col = lerpC(col, pal.spot, 0.5);
        if (y > 12 && hash(x, y, 6) > 0.97) col = pal.crackHi;
        set(48 + x, y, col);
      }
  });
  const tex = scene.textures.addCanvas(key, c)!;
  tex.add('ground', 0, 0, 0, 48, 48);
  tex.add('plat-l', 0, 48, 0, 16, 22);
  tex.add('plat-m', 0, 64, 0, 32, 22);
  tex.add('plat-r', 0, 96, 0, 16, 22);
}

function makeNestDeco(scene: Phaser.Scene): void {
  if (scene.textures.exists('nest-eggs')) return;
  // 알 무더기: 마른 가지 둥지에 알 셋
  const eggs = new PixelArt(46, 24);
  eggs.poly(ramp(0x4a3426), [[0, 16], [46, 16], [42, 23], [4, 23]]);
  eggs.ellipse(ramp(0xc8743a), 12, 11, 6, 8);
  eggs.ellipse(ramp(0xb06a3a), 23, 9, 6.5, 9);
  eggs.ellipse(ramp(0xd08a4a), 34, 12, 5.5, 7);
  for (const x of [2, 9, 17, 26, 34, 41]) eggs.line(ramp(0x6a5040), x, 16, x + 4, 22);
  eggs.register(scene, 'nest-eggs', [23, 23]);
  // 쓰러진 용의 해골과 갈비뼈
  const bones = new PixelArt(60, 26);
  const bone = ramp(0xd8ccb0);
  for (let i = 0; i < 5; i++) bones.poly(bone, [[22 + i * 7, 25], [24 + i * 7, 6 + i], [27 + i * 7, 4 + i], [26 + i * 7, 25]]);
  bones.poly(bone, [[0, 25], [2, 14], [10, 10], [18, 12], [20, 20], [16, 25]]);
  bones.ellipse(ramp(0x1a0e0e), 9, 16, 2.5, 2);
  bones.poly(bone, [[16, 22], [58, 22], [58, 25], [16, 25]]);
  bones.register(scene, 'nest-bones', [30, 25]);
  // 수정: 회색으로 그려 색을 입혀 쓴다 (불·얼음·번개)
  const crystal = new PixelArt(16, 26);
  crystal.poly(ramp(0xc8c8c8), [[4, 25], [2, 12], [6, 2], [9, 14], [8, 25]]);
  crystal.poly(ramp(0xf0f0f0), [[8, 25], [9, 9], [12, 4], [14, 16], [12, 25]]);
  crystal.register(scene, 'nest-crystal', [8, 25]);
  // 바위 기둥
  const spire = new PixelArt(26, 64);
  spire.poly(ramp(0x3a2420), [[2, 63], [6, 30], [10, 8], [13, 0], [16, 12], [21, 34], [24, 63]]);
  spire.line(ramp(0xff7a2a), 13, 20, 12, 40);
  spire.register(scene, 'nest-spire', [13, 63]);
}

export function createChapter6Art(scene: Phaser.Scene): void {
  makeDragons(scene);
  eggSheet(scene, 'dragon-egg', 'egg', 0xc8743a, 0x7a3422, 0xffe070);
  makeRecolors(scene);
  makeCaveBackdrop(scene, 'nest', CAVE_NEST);
  makeRockTiles(scene, 'nest-tiles', ROCK_NEST);
  makeNestDeco(scene);
}

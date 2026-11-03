import Phaser from 'phaser';
import { PixelArt, ramp, type Pt } from '../legion/pixelArt';
import { recolorTexture } from '../recolor';
import { makeDragonArt, PAL_FLAME, PAL_WHELP, PAL_WYVERN, standPose } from './dragonArt';
import { drawDragon, type DragonPose, type DragonRigDef } from './rig';

// 챕터 6(용들의 둥지) 그림: 용 파츠, 새끼 용·용알 시트, 다시 칠한 몬스터, 화산 동굴 배경과 타일

/** 보스·미니보스 리그 정의 (부팅 때 만든다) */
export const DRAGON_DEFS: { flame?: DragonRigDef; wyvern?: DragonRigDef; whelp?: DragonRigDef } = {};

/** 새끼 용 크기 배율 */
const WHELP_Z = 0.5;
export const FLAME_Z = 1;
export const WYVERN_Z = 0.8;

function hash(x: number, y: number, s = 0): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/** 캔버스 여러 장을 같은 칸 크기(바닥 가운데 맞춤)로 이어 붙여 시트로 올린다. */
function sheetFrom(scene: Phaser.Scene, key: string, frames: HTMLCanvasElement[]): void {
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

function anim(scene: Phaser.Scene, key: string, sheet: string, frames: number[], rate: number, repeat = -1): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: frames.map((f) => ({ key: sheet, frame: f })), frameRate: rate, repeat });
}

/** 용 한 마리: 파츠를 만들고, 이야기책·몸통 스프라이트용 서 있는 그림 한 칸을 만든다. */
function dragonPortrait(scene: Phaser.Scene, def: DragonRigDef, key: string, pose: DragonPose): void {
  sheetFrom(scene, key, [drawDragon(scene, def, pose, 0)]);
  anim(scene, key, key, [0], 1, 0);
}

function makeDragons(scene: Phaser.Scene): void {
  DRAGON_DEFS.flame = makeDragonArt(scene, 'dg-flame', PAL_FLAME, 'dragon', FLAME_Z, 2);
  DRAGON_DEFS.wyvern = makeDragonArt(scene, 'dg-wyvern', PAL_WYVERN, 'wyvern', WYVERN_Z, 2);
  DRAGON_DEFS.whelp = makeDragonArt(scene, 'dg-whelp', PAL_WHELP, 'dragon', WHELP_Z, 1);
  dragonPortrait(scene, DRAGON_DEFS.flame, 'flame-dragon-pose', standPose(FLAME_Z));
  dragonPortrait(scene, DRAGON_DEFS.wyvern, 'wyvern-pose', standPose(WYVERN_Z, true));

  // 새끼 용: 날개를 펴고 퍼덕이는 네 칸 + 입을 벌린 두 칸
  const def = DRAGON_DEFS.whelp;
  const fly: DragonPose = { ...standPose(WHELP_Z), by: -24, rot: -6, fold: 0.1, wing: -100, flap: 1, neck: -22, curl: 6, head: 12, tail: 6, tailCurl: -2, fFx: 10, fFy: -8, bFx: -10, bFy: -5 };
  // 날갯짓 위상: sin(time * 9)이 1 → 0 → -1 → 0 이 되는 시간
  const phase = [Math.PI / 18, 0, (3 * Math.PI) / 18, (2 * Math.PI) / 18];
  const frames = phase.map((t) => drawDragon(scene, def, fly, t));
  const spit = { ...fly, jaw: 30, neck: -8, curl: 4, head: 14 };
  frames.push(drawDragon(scene, def, spit, phase[0]), drawDragon(scene, def, spit, phase[2]));
  sheetFrom(scene, 'whelp', frames);
  anim(scene, 'whelp-fly', 'whelp', [0, 1, 2, 3], 12);
  anim(scene, 'whelp-spit', 'whelp', [4, 5, 4, 5], 10, 0);
}

/** 용알: 멀쩡한 알 → 금 간 알 → 크게 갈라져 빛이 새는 알 */
function makeEgg(scene: Phaser.Scene): void {
  if (scene.textures.exists('dragon-egg')) return;
  const shell = ramp(0xc8743a);
  const spots = ramp(0x7a3422);
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const a = new PixelArt(22, 28);
    // 둥지 (마른 가지와 뼈)
    a.poly(ramp(0x4a3426), [[0, 22], [22, 22], [20, 27], [2, 27]]);
    a.ellipse(shell, 11, 14, 8.5, 11.5);
    for (const [x, y] of [[7, 8], [14, 12], [9, 17], [15, 19], [12, 5]] as Pt[]) a.ellipse(spots, x, y, 1.6, 1.2);
    if (f >= 1) {
      // 금: 위에서 아래로 갈라진다.
      const crack: Pt[] = [[11, 4], [10, 6], [12, 8], [10, 10], [12, 12], [11, 14]];
      if (f >= 2) crack.push([13, 16], [11, 18], [13, 20], [8, 9], [7, 11], [15, 7], [16, 9]);
      a.dots(f >= 2 ? 0xffe070 : 0x3a1a10, crack);
    }
    for (const x of [3, 8, 13, 18]) a.line(ramp(0x6a5040), x, 22, x + 3, 26);
    frames.push(a.toCanvas());
  }
  sheetFrom(scene, 'dragon-egg', frames);
  anim(scene, 'egg-idle', 'dragon-egg', [0], 1, 0);
  anim(scene, 'egg-crack', 'dragon-egg', [1], 1, 0);
  anim(scene, 'egg-hatch', 'dragon-egg', [2, 1, 2], 14);
}

/** 기존 그림을 다시 칠한 몬스터 */
function makeRecolors(scene: Phaser.Scene): void {
  if (scene.anims.exists('cult-idle')) return;
  // 용 숭배자: 진홍 로브에 금빛
  recolorTexture(scene, 'wizard', 'wizard-cult', { hue: 4, minSat: 0.65, light: 0.82 });
  scene.anims.create({ key: 'cult-idle', frames: scene.anims.generateFrameNumbers('wizard-cult', { start: 0, end: 4 }), frameRate: 7, repeat: -1 });
  scene.anims.create({ key: 'cult-cast', frames: scene.anims.generateFrameNumbers('wizard-cult', { start: 5, end: 14 }), frameRate: 14, repeat: 0 });
  // 용암 살쾡이: 주황빛 몸
  recolorTexture(scene, 'hell-cat', 'lava-lizard', { hue: 22, minSat: 0.7, light: 1.05 });
  scene.anims.create({ key: 'lizard-walk', frames: scene.anims.generateFrameNumbers('lava-lizard', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
}

// ───────────────────────── 화산 동굴 (용들의 둥지) 배경 ─────────────────────────

function pixels(w: number, h: number, draw: (set: (x: number, y: number, c: number, a?: number) => void) => void): HTMLCanvasElement {
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

function lerpC(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 가로로 이어지는 높이 곡선 (주기 w) */
function ridge(x: number, w: number, seed: number, amp: number): number {
  let v = 0;
  for (const [f, a] of [[1, 1], [2, 0.5], [5, 0.25], [11, 0.12]]) v += Math.sin(((x / w) * Math.PI * 2 * f) + seed * f * 1.7) * a;
  return v * amp;
}

function makeNestBackdrop(scene: Phaser.Scene): void {
  if (scene.textures.exists('nest-far')) return;
  const W = 480;
  const H = 360;
  // 먼 층: 붉게 달아오른 동굴 안쪽, 먼 화산 봉우리와 흐르는 용암
  scene.textures.addCanvas(
    'nest-far',
    pixels(W, H, (set) => {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          // 아래로 갈수록 용암 빛이 번진다.
          const t = y / H;
          let c = lerpC(0x0e0608, 0x3a1210, Math.pow(t, 1.6));
          const peak = 230 + ridge(x, W, 1, 34);
          if (y > peak) c = lerpC(0x1c0a0a, 0x2a0e0c, (y - peak) / 60);
          // 봉우리 꼭대기에서 흘러내리는 용암 줄기
          const flow = Math.abs(((x + 37) % 160) - 80 + ridge(y, 200, 3, 6));
          if (y > peak && flow < 2.2 && y < 330) c = lerpC(0xff8a2a, 0xc0300a, flow / 2.2);
          if (y > 318) c = lerpC(0xff7a1a, 0x8a1a08, (y - 318) / 42 + hash(x, y) * 0.15);
          if (hash(x, y, 5) > 0.997 && y < 200) c = lerpC(c, 0xff9a4a, 0.6);
          set(x, y, c);
        }
    }),
  );
  // 가까운 층: 천장에서 늘어진 종유석과 바닥에서 솟은 바위 기둥 (투명한 빈칸)
  const MW = 640;
  const MH = 300;
  scene.textures.addCanvas(
    'nest-mid',
    pixels(MW, MH, (set) => {
      for (let x = 0; x < MW; x++) {
        const hang = 30 + ridge(x, MW, 2, 18) + Math.max(0, Math.sin(x * 0.11) * 26 * hash(Math.floor(x / 9), 1));
        for (let y = 0; y < hang; y++) set(x, y, lerpC(0x1a0c0c, 0x3a1a16, y / hang), 1);
        set(x, Math.round(hang), 0x5a2a20);
        const rise = MH - (70 + ridge(x, MW, 4, 40) + Math.max(0, Math.sin(x * 0.05 + 1) * 60));
        for (let y = Math.round(rise); y < MH; y++) {
          let c = lerpC(0x2a1210, 0x140808, (y - rise) / 120);
          // 바위 틈으로 비치는 용암
          if (hash(Math.floor(x / 3), Math.floor(y / 5), 9) > 0.985) c = 0xff7a2a;
          set(x, y, c);
        }
        set(x, Math.round(rise), 0x6a3222);
      }
    }),
  );
}

function makeNestTiles(scene: Phaser.Scene): void {
  if (scene.textures.exists('nest-tiles')) return;
  // 현무암 바닥: 윗면은 밝은 돌, 틈마다 용암이 비친다.
  const c = pixels(128, 64, (set) => {
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        let col = lerpC(0x3a2420, 0x1a0e0e, y / 48);
        if (hash(x >> 2, y >> 2, 1) > 0.8) col = lerpC(col, 0x2a1814, 0.6);
        if (y < 3) col = y === 0 ? 0x6a4a3a : 0x52382e;
        const crack = Math.abs(((x * 7 + y * 3) % 48) - 24) < 1 && y > 10 && hash(x, y >> 3, 2) > 0.4;
        if (crack) col = lerpC(0xff8a2a, 0xa03010, y / 48);
        set(x, y, col);
      }
    // 발판: 돌 턱 (왼쪽 끝 / 가운데 / 오른쪽 끝)
    for (let y = 0; y < 22; y++)
      for (let x = 0; x < 64; x++) {
        const edgeL = x < 16 ? 16 - x : 0;
        const edgeR = x >= 48 ? x - 47 : 0;
        const cut = Math.max(edgeL, edgeR) * 0.9;
        if (y > 22 - cut * 0.9 - 2 && cut > 0 && y > 6) continue;
        let col = lerpC(0x4a3028, 0x1e1010, y / 22);
        if (y < 2) col = 0x7a5242;
        if (hash(x >> 2, y >> 2, 4) > 0.82) col = lerpC(col, 0x2a1814, 0.5);
        if (y > 12 && hash(x, y, 6) > 0.97) col = 0xff7a2a;
        set(48 + x, y, col);
      }
  });
  const tex = scene.textures.addCanvas('nest-tiles', c)!;
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
  // 불의 수정
  const crystal = new PixelArt(16, 26);
  crystal.poly(ramp(0xff6a2a), [[4, 25], [2, 12], [6, 2], [9, 14], [8, 25]]);
  crystal.poly(ramp(0xffb04a), [[8, 25], [9, 9], [12, 4], [14, 16], [12, 25]]);
  crystal.register(scene, 'nest-crystal', [8, 25]);
  // 바위 기둥
  const spire = new PixelArt(26, 64);
  spire.poly(ramp(0x3a2420), [[2, 63], [6, 30], [10, 8], [13, 0], [16, 12], [21, 34], [24, 63]]);
  spire.line(ramp(0xff7a2a), 13, 20, 12, 40);
  spire.register(scene, 'nest-spire', [13, 63]);
}

export function createChapter6Art(scene: Phaser.Scene): void {
  makeDragons(scene);
  makeEgg(scene);
  makeRecolors(scene);
  makeNestBackdrop(scene);
  makeNestTiles(scene);
  makeNestDeco(scene);
}

import type Phaser from 'phaser';
import { PixelArt, ramp, type Pt, type Ramp } from '../legion/pixelArt';
import type { Pose, RigDef } from '../legion/rig';

/**
 * 종언의 마왕 아스타로트 파츠 그림 (오른쪽을 봄, 리그 1픽셀 단위). 군단장보다 크게 (배율 2.6).
 * 잿빛 얼굴과 핏빛 눈, 앞으로 휘어 오른 큰 뿔과 가시 돋친 흑금 왕관, 흩날리는 진홍 머리,
 * 금 세공의 검은 갑주와 가슴에 박힌 핏빛 핵, 세 갈래 가시 어깨, 안감이 진홍인 찢어진 긴 망토,
 * 그리고 몸보다 큰 지옥 낫 (검은 자루에 금테, 안쪽 날이 핏빛으로 빛나는 검은 초승달 날).
 */

const SKIN = ramp(0x8a7078);
const HAIR = ramp(0x7a1020);
const HORN = ramp(0x3a2a30);
const HORN_B = ramp(0x281c22);
const GOLD: Ramp = [0x6a4a14, 0xa87a28, 0xd8b04a, 0xfff0a8];
const ARMOR = ramp(0x2e2028);
const ARMOR_B = ramp(0x1e141a);
const SKIRT = ramp(0x4a1420);
const CAPE = ramp(0x420a16);
const LINING = ramp(0xc8203a);
const SHAFT = ramp(0x2a1c22);
const BLADE = ramp(0x40323a);
const EYE = 0xff4a3a;
const GEM = 0xff2a3a;
const GEM_HI = 0xffb0a8;
const VOID = 0x14080c;

export const ASTAROTH_PARTS = {
  torso: 'as-torso',
  pelvis: 'as-pelvis',
  head: 'as-head',
  upperF: 'as-upper-f',
  foreF: 'as-fore-f',
  handF: 'as-hand-f',
  upperB: 'as-upper-b',
  foreB: 'as-fore-b',
  handB: 'as-hand-b',
  thighF: 'as-thigh-f',
  shinF: 'as-shin-f',
  footF: 'as-foot-f',
  thighB: 'as-thigh-b',
  shinB: 'as-shin-b',
  footB: 'as-foot-b',
  pauldronF: 'as-pauldron-f',
  pauldronB: 'as-pauldron-b',
  weapon: 'as-scythe',
} as const;

/** 지옥의 구슬 (탄막 원) */
export const AS_ORB = 'as-orb';
/** 하늘에서 꽂히는 마검 (칼끝이 아래) */
export const AS_SWORD = 'as-sword';

/** 낫 그림에서 손잡이 → 날 끝 (리그 픽셀, 손잡이 기준 [앞, 위]) */
export const SCYTHE_EDGE: Pt = [24, 18];

export const ASTAROTH_RIG: RigDef = {
  scale: 2.3,
  hipY: 31,
  hipF: [1, 1],
  hipB: [-1, 1],
  thigh: 14,
  shin: 15,
  waist: [0, -1],
  shoulderF: [3, -17],
  shoulderB: [-2, -17],
  neck: [1, -20],
  upper: 10,
  fore: 10,
  grip2: 14,
  reach: 42,
  parts: ASTAROTH_PARTS,
  cloths: [
    // 진홍 안감의 찢어진 긴 망토
    { id: 'cape', on: 'torso', at: [-3, -18], segs: 7, len: 6, w0: 8, w1: 20, mat: CAPE, edge: LINING, tatter: true, rest: 0.1, blow: 1 },
    // 금 단을 두른 검은 갑주 치마 (핏빛 룬)
    {
      id: 'skirt',
      on: 'pelvis',
      at: [0.5, 0],
      segs: 3,
      len: 5.5,
      w0: 11,
      w1: 15,
      mat: SKIRT,
      edge: ramp(0x1e141a),
      spread: [0.9, 1.1],
      rest: 0,
      blow: 0.5,
      tatter: true,
      emblem: (a, mid) => {
        const [bx, by] = mid[mid.length - 1];
        for (let dx = -8; dx <= 8; dx++) a.dot(Math.round(bx + dx), Math.round(by) - 2, (dx & 1) === 0 ? 0xd8b04a : 0xa87a28);
        const [rx, ry] = mid[1];
        a.dot(Math.round(rx) + 1, Math.round(ry), GEM);
        a.dot(Math.round(rx) + 1, Math.round(ry) + 1, 0x8a0a1a);
        a.dot(Math.round(rx) + 2, Math.round(ry) + 2, GEM);
      },
    },
  ],
  plume: { at: [-3, -11], key: 'as-hair', rest: 0.55 },
  order: [
    'cloth:cape',
    'upperB',
    'foreB',
    'handB',
    'pauldronB',
    'thighB',
    'shinB',
    'footB',
    'pelvis',
    'thighF',
    'shinF',
    'footF',
    'cloth:skirt',
    'torso',
    'plume',
    'head',
    'weapon',
    'glow',
    'upperF',
    'pauldronF',
    'foreF',
    'handF',
  ],
};

/** 낫을 곧게 세워 한 손으로 쥐고 가슴을 편 기본 자세 */
export const ASTAROTH_IDLE: Pose = {
  hx: 0,
  hy: 1,
  lean: -3,
  head: -4,
  fFx: 5,
  fFy: 0,
  fBx: -5,
  fBy: 0,
  aFx: 9,
  aFy: 12,
  aBx: -1,
  aBy: 11,
  w: 8,
  two: 0,
};

/** 봉인이 풀려 떨어진 자세: 한쪽 무릎을 꿇고 낫을 땅에 짚는다 */
export const ASTAROTH_GROGGY: Pose = {
  hx: -1,
  hy: 11,
  lean: 30,
  head: 16,
  fFx: 7,
  fFy: 0,
  fBx: -10,
  fBy: 0,
  aFx: 7,
  aFy: 12,
  aBx: 5,
  aBy: 13,
  w: 14,
  two: 0,
};

/** 봉인을 두르고 떠 있을 때: 두 팔을 벌리고 낫을 가로로 든다 */
export const ASTAROTH_FLOAT: Pose = {
  hx: 0,
  hy: -1,
  lean: -6,
  head: -10,
  fFx: 3,
  fFy: -2,
  fBx: -2,
  fBy: 0,
  aFx: 10,
  aFy: -3,
  aBx: -9,
  aBy: -4,
  w: 70,
  two: 0,
};

function head(scene: Phaser.Scene): void {
  const a = new PixelArt(18, 22);
  // 흩날리는 진홍 머리 (뒤통수)
  a.poly(HAIR, [
    [2, 9],
    [9, 7],
    [12, 8],
    [9, 12],
    [7, 13],
    [6, 19],
    [3, 21],
    [1, 14],
  ]);
  // 잿빛 옆얼굴 (턱이 뾰족하다)
  a.poly(SKIN, [
    [8, 9],
    [13, 8],
    [15, 11],
    [16, 13],
    [14, 14],
    [14, 17],
    [11, 21],
    [8, 20],
    [8, 13],
  ]);
  // 먼 쪽 뿔 (어둡게, 뒤로)
  a.poly(HORN_B, [
    [11, 8],
    [10, 3],
    [8, 1],
    [9, 5],
    [9, 8],
  ]);
  // 가까운 뿔: 뒤로 솟았다가 끝이 앞으로 휜다
  a.poly(HORN, [
    [8, 10],
    [5, 6],
    [3, 2],
    [4, 0],
    [7, 1],
    [6, 3],
    [7, 6],
    [10, 9],
  ]);
  a.dots(0xd8b04a, [
    [4, 0],
    [5, 0],
  ]);
  // 가시 돋친 흑금 왕관
  a.poly(GOLD, [
    [7, 7],
    [14, 6],
    [14, 9],
    [7, 10],
  ]);
  a.poly(GOLD, [
    [8, 7],
    [9, 3],
    [10, 7],
  ]);
  a.poly(GOLD, [
    [10, 7],
    [12, 1],
    [13, 6],
  ]);
  a.poly(GOLD, [
    [13, 6],
    [15, 3],
    [14, 7],
  ]);
  a.dot(12, 8, GEM);
  a.dot(11, 8, GEM_HI);
  // 핏빛 눈, 뺨 그늘, 입
  a.dot(14, 12, EYE);
  a.dot(15, 12, 0xffd0c8);
  a.dot(13, 12, VOID);
  a.dot(12, 15, 0x6a5058);
  a.dots(0x4a1018, [
    [13, 17],
    [14, 17],
  ]);
  a.register(scene, ASTAROTH_PARTS.head, [9, 21]);
}

function hair(scene: Phaser.Scene): void {
  const a = new PixelArt(7, 19);
  a.poly(HAIR, [
    [1, 0],
    [6, 0],
    [7, 7],
    [5, 13],
    [3, 19],
    [0, 9],
  ]);
  a.dots(0xb03040, [
    [3, 3],
    [4, 9],
  ]);
  a.register(scene, 'as-hair', [3, 1]);
}

function torso(scene: Phaser.Scene): void {
  const a = new PixelArt(20, 22);
  // 목 뒤로 솟은 진홍 깃
  a.poly(LINING, [
    [1, 0],
    [8, 3],
    [8, 9],
    [1, 7],
  ]);
  a.line(GOLD, 1, 0, 1, 7);
  // 넓은 가슴에서 허리로 좁아지는 검은 갑주 (가슴이 앞)
  a.poly(ARMOR, [
    [2, 6],
    [13, 4],
    [19, 7],
    [18, 13],
    [15, 16],
  ]);
  a.poly(ARMOR, [
    [2, 6],
    [15, 16],
    [14, 20],
    [6, 21],
    [4, 15],
  ]);
  // 배 판금 두 장
  a.poly(ARMOR_B, [
    [6, 16],
    [14, 16],
    [13, 19],
    [6, 19],
  ]);
  // 금 세공: 가슴판 테두리, 갈비 무늬, 허리띠
  a.line(GOLD, 9, 5, 18, 8);
  a.line(GOLD, 18, 11, 13, 15);
  a.line(GOLD, 6, 21, 14, 21);
  a.dots(0xd8b04a, [
    [4, 9],
    [5, 12],
  ]);
  // 가슴에 박힌 핏빛 핵
  a.dots(GEM, [
    [13, 10],
    [14, 11],
    [13, 12],
    [12, 11],
  ]);
  a.dot(13, 11, GEM_HI);
  a.register(scene, ASTAROTH_PARTS.torso, [9, 22]);
}

function pelvis(scene: Phaser.Scene): void {
  const a = new PixelArt(14, 5);
  a.rect(ARMOR_B, 0, 0, 14, 4);
  a.line(GOLD, 0, 1, 13, 1);
  a.dot(9, 1, GEM);
  a.register(scene, ASTAROTH_PARTS.pelvis, [7, 0]);
}

function pauldron(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 세 갈래로 솟은 가시 어깨: 금 테, 핏빛 보석
  const a = new PixelArt(18, 15);
  a.poly(mat, [
    [3, 2],
    [7, 7],
    [3, 7],
  ]);
  a.poly(mat, [
    [8, 0],
    [10, 7],
    [6, 7],
  ]);
  a.poly(mat, [
    [15, 2],
    [13, 8],
    [11, 6],
  ]);
  a.ellipse(mat, 9, 10, 8.5, 4.6);
  a.line(GOLD, 1, 12, 17, 12);
  a.line(GOLD, 3, 8, 15, 8);
  a.dots(0xd8b04a, [
    [3, 2],
    [8, 0],
    [15, 2],
  ]);
  a.dot(10, 10, GEM);
  a.dot(9, 10, GEM_HI);
  a.register(scene, key, [9, 8]);
}

function upper(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(6, 11);
  a.rect(mat, 1, 0, 4, 11);
  a.register(scene, key, [3, 1]);
}

function fore(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 팔꿈치에 가시가 난 건틀릿과 금 소맷부리
  const a = new PixelArt(8, 11);
  a.poly(mat, [
    [2, 0],
    [6, 0],
    [7, 9],
    [1, 9],
  ]);
  a.poly(mat, [
    [1, 1],
    [0, -1],
    [3, 1],
  ]);
  a.line(GOLD, 1, 9, 7, 9);
  a.register(scene, key, [4, 1]);
}

function hand(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 갑주 손, 끝이 뾰족한 발톱
  const a = new PixelArt(6, 7);
  a.ellipse(mat, 3, 3, 3, 3);
  a.dots(0xd8b04a, [
    [1, 6],
    [3, 6],
    [5, 5],
  ]);
  a.register(scene, key, [3, 3]);
}

function leg(scene: Phaser.Scene, key: string, mat: Ramp, len: number, knee: boolean): void {
  const a = new PixelArt(6, len + 1);
  a.rect(mat, 0, 0, 6, len + 1);
  if (knee) {
    a.rect(GOLD, 1, 0, 4, 2);
    a.dot(3, 0, GEM);
  }
  a.register(scene, key, [3, 1]);
}

function foot(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 발끝이 갈퀴처럼 갈라진 장화
  const a = new PixelArt(11, 5);
  a.poly(mat, [
    [0, 0],
    [5, 0],
    [11, 4],
    [11, 5],
    [0, 5],
  ]);
  a.dots(0xd8b04a, [
    [10, 4],
    [8, 4],
  ]);
  a.register(scene, key, [3, 1]);
}

function scythe(scene: Phaser.Scene): void {
  // 세워 그림 (위가 날). 손잡이는 위에서 44픽셀.
  const W = 40;
  const H = 82;
  const a = new PixelArt(W, H);
  // 날: 큰 원 안, 오른쪽 아래로 비켜 난 원 바깥 → 앞으로 휘어 내려가는 검은 초승달
  const blade: Pt[] = [];
  const edge: Pt[] = [];
  for (let y = 2; y <= 31; y++)
    for (let x = 7; x < W; x++) {
      const o = Math.hypot(x + 0.5 - 6, y + 0.5 - 30);
      const i = Math.hypot(x + 0.5 - 11, y + 0.5 - 33);
      if (o > 26 || i <= 23) continue;
      blade.push([x, y]);
      if (i < 24.4) edge.push([x, y]);
    }
  a.pixels(BLADE, blade);
  // 안쪽 날은 핏빛으로 빛난다.
  for (const [x, y] of edge) a.dot(x, y, y < 12 ? 0xff7a6a : GEM);
  // 날 등의 가시와 룬
  a.poly(BLADE, [
    [7, 6],
    [2, 1],
    [8, 3],
  ]);
  a.dots(0xff6a5a, [
    [14, 9],
    [19, 12],
    [23, 16],
  ]);
  // 자루와 금테
  a.rect(SHAFT, 5, 6, 4, 72);
  for (const y of [8, 22, 40, 47, 62, 75]) a.rect(GOLD, 4, y, 6, 2);
  // 자루 머리의 금 장식과 핏빛 보석
  a.poly(GOLD, [
    [4, 4],
    [10, 4],
    [9, 9],
    [5, 9],
  ]);
  a.dot(7, 6, GEM);
  a.dot(6, 6, GEM_HI);
  // 끝의 금 물미
  a.poly(GOLD, [
    [5, 78],
    [9, 78],
    [7, 81],
  ]);
  a.register(scene, ASTAROTH_PARTS.weapon, [7, 44]);
}

function orb(scene: Phaser.Scene): void {
  if (scene.textures.exists(AS_ORB)) return;
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = 14;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      const d = Math.hypot(x - 6.5, y - 6.5);
      if (d > 6.5) continue;
      const hi = Math.hypot(x - 4.5, y - 4.5) < 1.6;
      g.fillStyle = d > 5.6 ? '#2a0610' : d > 4.2 ? '#ff3a4a' : hi ? '#ffe0d8' : d > 2.4 ? '#8a0a1a' : '#ff8a7a';
      g.fillRect(x, y, 1, 1);
    }
  scene.textures.addCanvas(AS_ORB, c);
}

function sword(scene: Phaser.Scene): void {
  // 칼끝이 아래. 검붉은 날, 금 코등이, 핏빛 보석 자루 머리
  const a = new PixelArt(11, 36);
  a.poly(BLADE, [
    [4, 9],
    [7, 9],
    [7, 30],
    [5.5, 35],
    [4, 30],
  ]);
  a.line(ramp(0xd8303a), 5.5, 10, 5.5, 31);
  a.poly(GOLD, [
    [0, 7],
    [11, 7],
    [9, 9],
    [2, 9],
  ]);
  a.rect(SHAFT, 4, 1, 3, 6);
  a.ellipse(GOLD, 5.5, 1.5, 2, 1.5);
  a.dot(5, 1, GEM);
  a.register(scene, AS_SWORD, [5.5, 18]);
}

export function makeAstarothArt(scene: Phaser.Scene): void {
  head(scene);
  hair(scene);
  torso(scene);
  pelvis(scene);
  pauldron(scene, ASTAROTH_PARTS.pauldronF, ARMOR);
  pauldron(scene, ASTAROTH_PARTS.pauldronB, ARMOR_B);
  upper(scene, ASTAROTH_PARTS.upperF, ARMOR);
  upper(scene, ASTAROTH_PARTS.upperB, ARMOR_B);
  fore(scene, ASTAROTH_PARTS.foreF, ARMOR);
  fore(scene, ASTAROTH_PARTS.foreB, ARMOR_B);
  hand(scene, ASTAROTH_PARTS.handF, ARMOR);
  hand(scene, ASTAROTH_PARTS.handB, ARMOR_B);
  leg(scene, ASTAROTH_PARTS.thighF, ARMOR, 14, false);
  leg(scene, ASTAROTH_PARTS.thighB, ARMOR_B, 14, false);
  leg(scene, ASTAROTH_PARTS.shinF, ARMOR, 15, true);
  leg(scene, ASTAROTH_PARTS.shinB, ARMOR_B, 15, true);
  foot(scene, ASTAROTH_PARTS.footF, ARMOR);
  foot(scene, ASTAROTH_PARTS.footB, ARMOR_B);
  scythe(scene);
  orb(scene);
  sword(scene);
}

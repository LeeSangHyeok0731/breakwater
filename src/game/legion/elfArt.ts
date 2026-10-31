import type Phaser from 'phaser';
import { PixelArt, ramp, type Ramp } from './pixelArt';
import type { Pose, RigDef } from './rig';

/**
 * 타락한 엘프 파츠 그림 (오른쪽을 봄, 리그 1픽셀 단위).
 * 창백한 라벤더빛 피부, 뒤로 길게 뻗은 귀, 은발 꽁지머리, 초록으로 빛나는 눈과 은 서클릿,
 * 숯빛 가죽 갑옷과 은 장식, 등의 화살통, 끝이 독기로 빛나는 찢어진 청록 망토, 검보라 나무의 육중한 석궁.
 */

const SKIN = ramp(0xd8d0ec);
const HAIR = ramp(0xe4e4f4);
const LEATHER = ramp(0x343a48);
const LEATHER_B = ramp(0x262a36);
const BROWN = ramp(0x5a3a2a);
const TEAL = ramp(0x2a8a72);
const TEAL_D = ramp(0x1a5a4c);
const SILVER = ramp(0xb8b8d0);
const WOOD = ramp(0x4a2a5a);
const BOOT = ramp(0x3a2a3a);
const BOOT_B = ramp(0x2a1e2c);
const GREEN = 0x7aff9a;
const GREEN_D = 0x2a9a5a;

export const ELF_PARTS = {
  torso: 'elf-torso',
  pelvis: 'elf-pelvis',
  head: 'elf-head',
  upperF: 'elf-upper-f',
  foreF: 'elf-fore-f',
  handF: 'elf-hand-f',
  upperB: 'elf-upper-b',
  foreB: 'elf-fore-b',
  handB: 'elf-hand-b',
  thighF: 'elf-thigh-f',
  shinF: 'elf-shin-f',
  footF: 'elf-foot-f',
  thighB: 'elf-thigh-b',
  shinB: 'elf-shin-b',
  footB: 'elf-foot-b',
  pauldronF: 'elf-pauldron-f',
  pauldronB: 'elf-pauldron-b',
  weapon: 'elf-crossbow-rig',
} as const;

export const ELF_RIG: RigDef = {
  scale: 2,
  hipY: 26,
  hipF: [1.2, 1],
  hipB: [-1.2, 1],
  thigh: 12,
  shin: 12,
  waist: [0, -1],
  shoulderF: [3, -12],
  shoulderB: [0, -12],
  neck: [2, -15],
  upper: 8,
  fore: 8,
  // 뒷손은 손잡이 앞쪽(앞 개머리)을 받친다.
  grip2: -10,
  reach: 22,
  parts: ELF_PARTS,
  cloths: [
    // 끝이 독기로 빛나는 찢어진 청록 망토
    {
      id: 'cloak',
      on: 'torso',
      at: [-2, -14],
      segs: 6,
      len: 5,
      w0: 5,
      w1: 12,
      mat: TEAL,
      edge: TEAL_D,
      tatter: true,
      rest: 0.1,
      blow: 1.2,
      emblem: (a, mid) => {
        const [x, y] = mid[mid.length - 1];
        a.dot(Math.round(x) - 2, Math.round(y) - 1, GREEN);
        a.dot(Math.round(x) - 5, Math.round(y) - 2, GREEN_D);
        a.dot(Math.round(x) - 1, Math.round(y) - 4, GREEN_D);
      },
    },
    // 허리띠에 늘어진 청록 띠
    { id: 'sash', on: 'pelvis', at: [2.5, 0], segs: 3, len: 3.5, w0: 3, w1: 3, mat: TEAL_D, spread: [1, 1], rest: 0.15, blow: 1.4 },
  ],
  plume: { at: [-3, -9], key: 'elf-hair', rest: 0.7 },
  order: [
    'cloth:cloak',
    'upperB',
    'foreB',
    'pauldronB',
    'thighB',
    'shinB',
    'footB',
    'pelvis',
    'thighF',
    'shinF',
    'footF',
    'cloth:sash',
    'torso',
    'plume',
    'handB',
    'weapon',
    'glow',
    'head',
    'upperF',
    'pauldronF',
    'foreF',
    'handF',
  ],
};

/** 석궁을 어깨에 대고 겨눈 기본 자세 (손과 무기 각도는 조준에 따라 바뀐다) */
export const ELF_IDLE: Pose = {
  hx: 0,
  hy: 1.5,
  lean: 3,
  head: 0,
  fFx: 6,
  fFy: 0,
  fBx: -7,
  fBy: 0,
  aFx: 5,
  aFy: 3,
  aBx: 0,
  aBy: 8,
  w: 90,
  two: 1,
};

/** 패링당해 무너진 자세: 한쪽 무릎을 꿇고 석궁을 떨군다 */
export const ELF_GROGGY: Pose = {
  hx: -1,
  hy: 9,
  lean: 32,
  head: 12,
  fFx: 7,
  fFy: 0,
  fBx: -9,
  fBy: 0,
  aFx: 2,
  aFy: 13,
  aBx: 1,
  aBy: 13,
  w: 165,
  two: 0,
};

function head(scene: Phaser.Scene): void {
  const a = new PixelArt(13, 12);
  // 뒤로 넘긴 은발
  a.poly(HAIR, [
    [1, 2],
    [6, 0],
    [10, 0],
    [12, 2],
    [10, 4],
    [6, 4],
    [5, 9],
    [3, 11],
    [0, 7],
  ]);
  // 옆얼굴 (오른쪽이 코)
  a.poly(SKIN, [
    [6, 3],
    [10, 2],
    [12, 4],
    [13, 6],
    [11, 7],
    [11, 10],
    [8, 12],
    [5, 12],
    [5, 7],
  ]);
  // 뒤로 길게 뻗은 귀
  a.poly(SKIN, [
    [5, 6],
    [7, 7],
    [6, 8],
    [0, 3],
  ]);
  // 은 서클릿과 초록 보석
  a.line(SILVER, 5, 2.5, 11, 1.5);
  a.dot(10, 2, GREEN);
  // 독기로 빛나는 눈, 눈썹, 입
  a.dot(10, 5, GREEN);
  a.dot(9, 4, 0x6a608a);
  a.dot(11, 9, 0x8a80b0);
  a.register(scene, ELF_PARTS.head, [7, 12]);
}

function hair(scene: Phaser.Scene): void {
  // 뒤로 늘어진 꽁지머리
  const a = new PixelArt(5, 15);
  a.poly(HAIR, [
    [1, 0],
    [4, 0],
    [5, 5],
    [4, 11],
    [2, 15],
    [0, 8],
  ]);
  a.dots(0xb0b0d0, [
    [2, 3],
    [3, 7],
    [2, 10],
  ]);
  a.register(scene, 'elf-hair', [2, 1]);
}

function torso(scene: Phaser.Scene): void {
  const a = new PixelArt(15, 18);
  // 등의 화살통 (깃이 위로 삐죽)
  a.poly(WOOD, [
    [1, 2],
    [4, 1],
    [5, 13],
    [2, 14],
  ]);
  a.dots(0xe8e8f0, [
    [1, 0],
    [3, 0],
  ]);
  a.dots(GREEN, [
    [2, 1],
    [4, 0],
  ]);
  // 가죽 상의 (가슴이 앞)
  a.poly(LEATHER, [
    [5, 4],
    [11, 3],
    [14, 6],
    [14, 12],
    [13, 17],
    [6, 18],
    [4, 11],
  ]);
  // 청록 깃
  a.poly(TEAL, [
    [7, 3],
    [12, 3],
    [13, 5],
    [8, 6],
  ]);
  // 대각선 가죽끈과 은 버클
  a.line(BROWN, 12, 6, 6, 16);
  a.dot(9, 11, 0xd8d8f0);
  // 가슴의 은 장식
  a.dots(0xb8b8d0, [
    [13, 9],
    [13, 11],
  ]);
  a.register(scene, ELF_PARTS.torso, [8, 18]);
}

function pelvis(scene: Phaser.Scene): void {
  const a = new PixelArt(11, 7);
  // 짧은 가죽 허리 치마
  a.poly(LEATHER_B, [
    [1, 2],
    [10, 2],
    [11, 7],
    [0, 7],
  ]);
  a.rect(BROWN, 1, 0, 9, 3);
  a.dot(7, 1, 0xd8d8f0);
  // 허리 주머니
  a.rect(BROWN, 2, 3, 3, 3);
  a.register(scene, ELF_PARTS.pelvis, [5, 0]);
}

function upper(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(5, 9);
  a.rect(mat, 1, 0, 3, 9);
  a.register(scene, key, [2.5, 1]);
}

function pauldron(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 작은 은 어깨받이
  const a = new PixelArt(7, 5);
  a.ellipse(mat, 3.5, 2.5, 3.5, 2.5);
  a.dot(4, 2, GREEN_D);
  a.register(scene, key, [3.5, 2]);
}

function fore(scene: Phaser.Scene, key: string, bracer: Ramp, glove: Ramp): void {
  const a = new PixelArt(5, 9);
  a.rect(bracer, 1, 0, 3, 6);
  a.line(SILVER, 1, 2, 3, 2);
  a.rect(glove, 1, 6, 3, 3);
  a.register(scene, key, [2.5, 1]);
}

function hand(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(4, 5);
  a.ellipse(mat, 2, 2.5, 2, 2.5);
  a.register(scene, key, [2, 2.5]);
}

function thigh(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(6, 14);
  a.poly(mat, [
    [0, 0],
    [6, 0],
    [5, 14],
    [1, 14],
  ]);
  a.register(scene, key, [3, 1]);
}

function shin(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 무릎까지 오는 장화, 위에 은 테
  const a = new PixelArt(6, 13);
  a.poly(mat, [
    [0, 0],
    [6, 0],
    [5, 13],
    [1, 13],
  ]);
  a.line(SILVER, 0, 1, 5, 1);
  a.register(scene, key, [3, 1]);
}

function foot(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(8, 4);
  a.poly(mat, [
    [0, 0],
    [4, 0],
    [8, 3],
    [8, 4],
    [0, 4],
  ]);
  a.register(scene, key, [3, 1]);
}

function crossbow(scene: Phaser.Scene): void {
  // 세워 그림 (끝이 위). 옆에서 겨누면 활대가 세로로 보인다.
  const a = new PixelArt(22, 32);
  // 활대 (은빛, 양쪽으로 휜다)
  a.poly(SILVER, [
    [0, 9],
    [10, 4],
    [11, 6],
    [1, 11],
  ]);
  a.poly(SILVER, [
    [11, 4],
    [22, 9],
    [21, 11],
    [11, 6],
  ]);
  // 시위 (당겨진 상태)
  a.line(ramp(0x8a8aa8), 1, 11, 10.5, 15);
  a.line(ramp(0x8a8aa8), 21, 11, 11.5, 15);
  // 개머리판
  a.poly(WOOD, [
    [9, 7],
    [13, 7],
    [13, 26],
    [9, 26],
  ]);
  a.poly(ramp(0x341c42), [
    [8, 25],
    [14, 25],
    [14, 32],
    [8, 32],
  ]);
  // 장전된 볼트 (독 묻은 촉)
  a.line(ramp(0xd8d8e8), 11, 1, 11, 15);
  a.dot(11, 0, GREEN);
  a.dot(11, 1, GREEN_D);
  // 방아쇠와 보석
  a.dot(13, 22, 0x130a1b);
  a.dot(11, 18, GREEN);
  a.register(scene, ELF_PARTS.weapon, [11, 22]);
}

export function makeElfArt(scene: Phaser.Scene): void {
  head(scene);
  hair(scene);
  torso(scene);
  pelvis(scene);
  upper(scene, ELF_PARTS.upperF, LEATHER);
  upper(scene, ELF_PARTS.upperB, LEATHER_B);
  pauldron(scene, ELF_PARTS.pauldronF, SILVER);
  pauldron(scene, ELF_PARTS.pauldronB, ramp(0x8a8aa8));
  fore(scene, ELF_PARTS.foreF, TEAL_D, LEATHER);
  fore(scene, ELF_PARTS.foreB, ramp(0x123a32), LEATHER_B);
  hand(scene, ELF_PARTS.handF, LEATHER);
  hand(scene, ELF_PARTS.handB, LEATHER_B);
  thigh(scene, ELF_PARTS.thighF, LEATHER);
  thigh(scene, ELF_PARTS.thighB, LEATHER_B);
  shin(scene, ELF_PARTS.shinF, BOOT);
  shin(scene, ELF_PARTS.shinB, BOOT_B);
  foot(scene, ELF_PARTS.footF, BOOT);
  foot(scene, ELF_PARTS.footB, BOOT_B);
  crossbow(scene);
}

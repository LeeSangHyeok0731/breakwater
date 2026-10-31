import type Phaser from 'phaser';
import { PixelArt, ramp, type Ramp } from './pixelArt';
import type { Pose, RigDef } from './rig';
import type { PixelArt as Art } from './pixelArt';

/**
 * 침묵의 기사단장 파츠 그림 (오른쪽을 봄, 리그 1픽셀 단위).
 * 검게 그을린 판금 갑옷, 보라 룬, 닫힌 대투구와 뒤로 늘어진 보라 말총, 찢어진 보라 망토, 몸만 한 대검.
 * 뒤쪽 팔다리는 한 단계 어두운 색으로 그려 앞뒤가 구분되게 한다.
 */

const ARMOR = ramp(0x585668);
const ARMOR_HI = ramp(0x7a788e);
const ARMOR_B = ramp(0x403e4e);
const ARMOR_HI_B = ramp(0x585668);
const DARK = ramp(0x2a2834);
const TRIM = ramp(0x8a3ad8);
const CLOTH = ramp(0x4a1a7a);
const CLOTH_B = ramp(0x34125a);
const LEATHER = ramp(0x5a3420);
const MAIL = ramp(0x3e3c4a);
const BLADE = ramp(0x9a9cb0);
const FULLER = ramp(0x2a1a40);
const RUNE = 0xb04aff;
const RUNE_HI = 0xf0d0ff;
const EYE = 0xd090ff;
const HOLE = 0x120a1a;

export const KNIGHT_PARTS = {
  torso: 'kn-torso',
  pelvis: 'kn-pelvis',
  head: 'kn-head',
  upperF: 'kn-upper-f',
  foreF: 'kn-fore-f',
  handF: 'kn-hand-f',
  upperB: 'kn-upper-b',
  foreB: 'kn-fore-b',
  handB: 'kn-hand-b',
  thighF: 'kn-thigh-f',
  shinF: 'kn-shin-f',
  footF: 'kn-foot-f',
  thighB: 'kn-thigh-b',
  shinB: 'kn-shin-b',
  footB: 'kn-foot-b',
  pauldronF: 'kn-pauldron-f',
  pauldronB: 'kn-pauldron-b',
  weapon: 'kn-greatsword',
} as const;

export const KNIGHT_RIG: RigDef = {
  scale: 2,
  hipY: 24,
  hipF: [1.5, 1],
  hipB: [-1.5, 1],
  thigh: 11,
  shin: 11,
  waist: [0, -1],
  shoulderF: [2, -12],
  shoulderB: [-1, -12],
  neck: [1, -15],
  upper: 8,
  fore: 9,
  grip2: 5,
  reach: 55,
  parts: KNIGHT_PARTS,
  cloths: [
    // 어깨에서 늘어진 찢어진 보라 망토
    { id: 'cape', on: 'torso', at: [-3, -14], segs: 5, len: 5.2, w0: 5, w1: 10, mat: CLOTH, edge: CLOTH_B, tatter: true, rest: 0.12, blow: 1 },
    // 허리띠 앞에 늘어진 보라 앞자락 (룬 문장)
    {
      id: 'tabard',
      on: 'pelvis',
      at: [2.5, 0],
      segs: 3,
      len: 4,
      w0: 5,
      w1: 6,
      mat: CLOTH,
      spread: [1, 1],
      rest: 0.05,
      blow: 0.7,
      emblem: (a: Art, mid) => {
        const [x, y] = mid[1];
        a.dot(Math.round(x), Math.round(y), RUNE);
        a.dot(Math.round(x), Math.round(y) + 1, RUNE_HI);
        a.dot(Math.round(x), Math.round(y) + 2, RUNE);
      },
    },
  ],
  plume: { at: [-3, -11], key: 'kn-plume', rest: 0.9 },
  order: [
    'cloth:cape',
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
    'cloth:tabard',
    'torso',
    'weapon',
    'glow',
    'plume',
    'head',
    'handB',
    'upperF',
    'pauldronF',
    'foreF',
    'handF',
  ],
};

/** 대검을 어깨에 걸치고 두 손으로 잡은 묵직한 기본 자세 */
export const KNIGHT_IDLE: Pose = {
  hx: 0,
  hy: 2,
  lean: 6,
  head: -4,
  fFx: 6,
  fFy: 0,
  fBx: -6,
  fBy: 0,
  aFx: 5,
  aFy: 8,
  aBx: 0,
  aBy: 8,
  w: -35,
  two: 1,
};

function torso(scene: Phaser.Scene): void {
  const a = new PixelArt(15, 17);
  // 등판과 가슴판 (앞쪽이 불룩)
  a.poly(ARMOR, [
    [2, 3],
    [10, 2],
    [14, 6],
    [14, 11],
    [12, 15],
    [3, 16],
    [1, 10],
  ]);
  // 가슴판 윗면
  a.poly(ARMOR_HI, [
    [7, 4],
    [13, 6],
    [13, 10],
    [8, 9],
  ]);
  // 목가리개
  a.rect(DARK, 4, 0, 7, 3);
  // 허리띠와 보라 버클
  a.rect(LEATHER, 2, 14, 11, 2);
  a.dot(10, 14, RUNE);
  // 가슴의 보라 룬
  a.dots(RUNE, [
    [10, 7],
    [11, 8],
    [10, 9],
    [9, 8],
  ]);
  a.dot(10, 8, RUNE_HI);
  a.register(scene, KNIGHT_PARTS.torso, [6, 16]);
}

function pelvis(scene: Phaser.Scene): void {
  const a = new PixelArt(13, 10);
  // 사슬 치마 (판금 사이로 보인다)
  a.poly(MAIL, [
    [1, 2],
    [12, 2],
    [12, 9],
    [1, 9],
  ]);
  for (let y = 4; y < 9; y += 2) for (let x = 2 + (y % 4 === 0 ? 1 : 0); x < 12; x += 2) a.dot(x, y, 0x24222c);
  // 허리 판금 두 겹
  a.rect(ARMOR, 1, 0, 11, 3);
  a.poly(ARMOR_B, [
    [0, 2],
    [5, 2],
    [5, 7],
    [1, 8],
  ]);
  a.poly(ARMOR_HI, [
    [7, 2],
    [12, 2],
    [13, 7],
    [8, 8],
  ]);
  a.register(scene, KNIGHT_PARTS.pelvis, [6, 0]);
}

function head(scene: Phaser.Scene): void {
  const a = new PixelArt(11, 13);
  // 대투구 몸체
  a.poly(ARMOR, [
    [1, 4],
    [3, 0],
    [8, 0],
    [10, 2],
    [10, 12],
    [1, 12],
  ]);
  // 앞 얼굴 판
  a.poly(ARMOR_HI, [
    [6, 2],
    [11, 4],
    [11, 12],
    [6, 12],
  ]);
  // 정수리 볏
  a.rect(DARK, 3, 0, 5, 1);
  // 눈구멍: 보랏빛이 새어 나온다
  for (let x = 5; x < 11; x++) a.dot(x, 5, HOLE);
  a.dot(7, 5, EYE);
  a.dot(9, 5, EYE);
  // T자 숨구멍
  for (let y = 6; y < 9; y++) a.dot(9, y, HOLE);
  a.dots(HOLE, [
    [8, 10],
    [10, 10],
  ]);
  // 아래 테두리
  a.rect(DARK, 1, 11, 10, 2);
  a.register(scene, KNIGHT_PARTS.head, [5, 12]);
}

function plume(scene: Phaser.Scene): void {
  const a = new PixelArt(6, 14);
  a.poly(TRIM, [
    [1, 0],
    [4, 0],
    [6, 5],
    [5, 10],
    [3, 14],
    [0, 8],
  ]);
  a.dots(0xc070ff, [
    [3, 2],
    [4, 5],
    [3, 8],
  ]);
  a.dots(0x5a2090, [
    [1, 4],
    [2, 9],
  ]);
  a.register(scene, 'kn-plume', [2, 1]);
}

function upper(scene: Phaser.Scene, key: string, mat: Ramp, hi: Ramp): void {
  const a = new PixelArt(6, 11);
  a.rect(mat, 1, 0, 4, 8);
  a.ellipse(hi, 3, 9, 2.6, 2);
  a.register(scene, key, [3, 1]);
}

function pauldron(scene: Phaser.Scene, key: string, mat: Ramp, hi: Ramp): void {
  const a = new PixelArt(11, 10);
  a.ellipse(hi, 5.5, 4, 5.5, 4);
  a.poly(mat, [
    [1, 5],
    [10, 5],
    [9, 8],
    [2, 8],
  ]);
  a.poly(mat, [
    [2, 8],
    [9, 8],
    [8, 10],
    [3, 10],
  ]);
  a.line(TRIM, 1, 5, 9, 5);
  a.register(scene, key, [5, 3]);
}

function fore(scene: Phaser.Scene, key: string, mat: Ramp, hi: Ramp): void {
  const a = new PixelArt(7, 11);
  a.rect(mat, 2, 0, 3, 7);
  // 건틀릿 손목 덮개
  a.poly(hi, [
    [0, 6],
    [7, 6],
    [6, 11],
    [1, 11],
  ]);
  a.register(scene, key, [3, 1]);
}

function hand(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(6, 7);
  a.ellipse(mat, 3, 3.5, 3, 3.5);
  a.dots(mat[0], [
    [4, 2],
    [4, 4],
  ]);
  a.register(scene, key, [3, 3]);
}

function thigh(scene: Phaser.Scene, key: string, mat: Ramp, hi: Ramp): void {
  const a = new PixelArt(8, 13);
  // 허벅지 판금 (위가 넓다)
  a.poly(mat, [
    [0, 0],
    [7, 0],
    [6, 10],
    [1, 10],
  ]);
  a.line(hi, 5.5, 1, 5, 8);
  // 무릎 덮개와 날개
  a.ellipse(hi, 4.5, 11, 3, 2.3);
  a.dot(6, 11, mat[0]);
  a.register(scene, key, [3.5, 1]);
}

function shin(scene: Phaser.Scene, key: string, mat: Ramp, hi: Ramp): void {
  const a = new PixelArt(8, 12);
  // 정강이 판금: 앞이 불룩
  a.poly(mat, [
    [1, 0],
    [7, 1],
    [6, 8],
    [5, 12],
    [2, 12],
    [1, 6],
  ]);
  a.line(hi, 6, 2, 5.4, 9);
  a.register(scene, key, [3.5, 1]);
}

function foot(scene: Phaser.Scene, key: string, mat: Ramp, hi: Ramp): void {
  const a = new PixelArt(10, 5);
  a.poly(mat, [
    [0, 0],
    [5, 0],
    [9, 2],
    [10, 5],
    [0, 5],
  ]);
  a.line(hi, 5, 1, 8, 2.5);
  a.register(scene, key, [3, 1]);
}

function greatsword(scene: Phaser.Scene): void {
  const a = new PixelArt(14, 65);
  // 칼날 (위가 칼끝)
  a.poly(BLADE, [
    [7, 0],
    [11, 6],
    [11, 45],
    [3, 45],
    [3, 6],
  ]);
  // 가운데 홈과 보라 룬
  a.rect(FULLER, 6, 8, 2, 35);
  for (let y = 11; y < 42; y += 6) {
    a.dot(6, y, RUNE);
    a.dot(7, y, RUNE);
    a.dot(6, y + 1, RUNE_HI);
  }
  // 가드
  a.poly(ARMOR_HI, [
    [0, 45],
    [14, 45],
    [13, 49],
    [1, 49],
  ]);
  a.dot(7, 46, RUNE);
  a.dot(6, 46, RUNE_HI);
  // 손잡이 (가죽 감김)
  a.rect(LEATHER, 5, 49, 4, 11);
  for (let y = 50; y < 60; y += 2) a.dot(6, y, 0x8a5a32);
  // 폼멜
  a.ellipse(ARMOR, 7, 62, 3, 2.6);
  a.dot(7, 62, RUNE);
  a.register(scene, KNIGHT_PARTS.weapon, [7, 55]);
}

export function makeKnightArt(scene: Phaser.Scene): void {
  torso(scene);
  pelvis(scene);
  head(scene);
  plume(scene);
  upper(scene, KNIGHT_PARTS.upperF, ARMOR, ARMOR_HI);
  upper(scene, KNIGHT_PARTS.upperB, ARMOR_B, ARMOR_HI_B);
  pauldron(scene, KNIGHT_PARTS.pauldronF, ARMOR, ARMOR_HI);
  pauldron(scene, KNIGHT_PARTS.pauldronB, ARMOR_B, ARMOR_HI_B);
  fore(scene, KNIGHT_PARTS.foreF, ARMOR, ARMOR_HI);
  fore(scene, KNIGHT_PARTS.foreB, ARMOR_B, ARMOR_HI_B);
  hand(scene, KNIGHT_PARTS.handF, ARMOR_HI);
  hand(scene, KNIGHT_PARTS.handB, ARMOR_HI_B);
  thigh(scene, KNIGHT_PARTS.thighF, ARMOR, ARMOR_HI);
  thigh(scene, KNIGHT_PARTS.thighB, ARMOR_B, ARMOR_HI_B);
  shin(scene, KNIGHT_PARTS.shinF, ARMOR, ARMOR_HI);
  shin(scene, KNIGHT_PARTS.shinB, ARMOR_B, ARMOR_HI_B);
  foot(scene, KNIGHT_PARTS.footF, ARMOR, ARMOR_HI);
  foot(scene, KNIGHT_PARTS.footB, ARMOR_B, ARMOR_HI_B);
  greatsword(scene);
}

import type Phaser from 'phaser';
import { PixelArt, ramp, type Ramp } from './pixelArt';
import type { Pose, RigDef } from './rig';

/**
 * 암흑의 군주 파츠 그림 (오른쪽을 봄, 리그 1픽셀 단위).
 * 잿빛 얼굴, 뒤로 휜 뿔과 가시 금관, 보랏빛 눈, 흩날리는 검은 머리,
 * 금 세공이 들어간 검은 갑주와 가시 돋친 어깨, 바닥까지 끌리는 검은 로브와 보라 안감의 긴 망토,
 * 금테 두른 검은 자루 끝에 검은 달을 품은 초승달 지팡이.
 */

const SKIN = ramp(0xb8b0c0);
const HAIR = ramp(0x2a2234);
const HORN = ramp(0x5a5068);
const HORN_B = ramp(0x403850);
const GOLD: Ramp = [0x6a4a14, 0xa87a28, 0xd8b04a, 0xfff0a8];
const ARMOR = ramp(0x3a2e48);
const ARMOR_B = ramp(0x2a2236);
const ROBE = ramp(0x2a1a3a);
const LINING = ramp(0x5a1a8a);
const CAPE = ramp(0x1e1230);
const SHAFT = ramp(0x2a1a3a);
const MOON = ramp(0xd8c8f8);
const VOID = 0x1a0a2a;
const EYE = 0xd090ff;
const GEM = 0xb04aff;

export const DARKLORD_PARTS = {
  torso: 'dl-torso',
  pelvis: 'dl-pelvis',
  head: 'dl-head',
  upperF: 'dl-upper-f',
  foreF: 'dl-fore-f',
  handF: 'dl-hand-f',
  upperB: 'dl-upper-b',
  foreB: 'dl-fore-b',
  handB: 'dl-hand-b',
  thighF: 'dl-thigh-f',
  shinF: 'dl-shin-f',
  footF: 'dl-foot-f',
  thighB: 'dl-thigh-b',
  shinB: 'dl-shin-b',
  footB: 'dl-foot-b',
  pauldronF: 'dl-pauldron-f',
  pauldronB: 'dl-pauldron-b',
  weapon: 'dl-staff-rig',
} as const;

export const DARKLORD_RIG: RigDef = {
  scale: 2,
  hipY: 27,
  hipF: [1, 1],
  hipB: [-1, 1],
  thigh: 12,
  shin: 13,
  waist: [0, -1],
  shoulderF: [2, -13],
  shoulderB: [-1, -13],
  neck: [1, -16],
  upper: 8,
  fore: 9,
  grip2: 0,
  reach: 16,
  parts: DARKLORD_PARTS,
  cloths: [
    // 보라 안감의 긴 망토 (끝이 찢어짐)
    { id: 'cape', on: 'torso', at: [-3, -15], segs: 6, len: 5.5, w0: 6, w1: 15, mat: CAPE, edge: LINING, tatter: true, rest: 0.08, blow: 1 },
    // 바닥까지 끌리는 로브 자락 (금 단, 보라 룬)
    {
      id: 'robe',
      on: 'pelvis',
      at: [0.5, 0],
      segs: 4,
      len: 6.2,
      w0: 11,
      w1: 17,
      mat: ROBE,
      spread: [0.9, 1.1],
      rest: 0,
      blow: 0.6,
      emblem: (a, mid) => {
        const [bx, by] = mid[mid.length - 1];
        for (let dx = -8; dx <= 8; dx++) a.dot(Math.round(bx + dx), Math.round(by) - 1, (dx & 1) === 0 ? 0xd8b04a : 0xa87a28);
        const [rx, ry] = mid[2];
        a.dot(Math.round(rx) + 2, Math.round(ry), GEM);
        a.dot(Math.round(rx) + 2, Math.round(ry) - 1, 0xe0a8ff);
      },
    },
  ],
  plume: { at: [-3, -9], key: 'dl-hair', rest: 0.55 },
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
    'cloth:robe',
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

/** 지팡이를 곧게 세우고 가슴을 편 거만한 기본 자세 */
export const DARKLORD_IDLE: Pose = {
  hx: 0,
  hy: 1,
  lean: -3,
  head: -5,
  fFx: 4,
  fFy: 0,
  fBx: -4,
  fBy: 0,
  aFx: 9,
  aFy: 10,
  aBx: -1,
  aBy: 9,
  w: 10,
  two: 0,
};

/** 보호막이 깨져 떨어진 자세: 무릎을 꿇고 지팡이를 떨군다 */
export const DARKLORD_GROGGY: Pose = {
  hx: -1,
  hy: 10,
  lean: 34,
  head: 12,
  fFx: 6,
  fFy: 0,
  fBx: -9,
  fBy: 0,
  aFx: 3,
  aFy: 13,
  aBx: 4,
  aBy: 12,
  w: 150,
  two: 0,
};

function head(scene: Phaser.Scene): void {
  const a = new PixelArt(15, 17);
  // 흩날리는 검은 머리 (뒤통수)
  a.poly(HAIR, [
    [2, 6],
    [8, 4],
    [11, 5],
    [8, 8],
    [6, 9],
    [5, 14],
    [3, 16],
    [1, 11],
  ]);
  // 잿빛 옆얼굴
  a.poly(SKIN, [
    [7, 6],
    [11, 5],
    [13, 8],
    [14, 10],
    [12, 11],
    [12, 14],
    [9, 16],
    [6, 16],
    [6, 10],
  ]);
  // 뒤로 휜 뿔 (먼 쪽은 어둡게)
  a.poly(HORN_B, [
    [10, 5],
    [9, 1],
    [7, 0],
    [8, 3],
    [8, 5],
  ]);
  a.poly(HORN, [
    [7, 6],
    [4, 2],
    [0, 0],
    [3, 3],
    [5, 7],
  ]);
  // 가시 금관
  a.poly(GOLD, [
    [6, 5],
    [12, 4],
    [12, 6],
    [6, 7],
  ]);
  a.dots(0xd8b04a, [
    [7, 4],
    [9, 3],
    [11, 3],
  ]);
  a.dot(9, 5, GEM);
  // 보랏빛 눈, 뺨 그늘, 입
  a.dot(12, 9, EYE);
  a.dot(11, 9, VOID);
  a.dot(11, 12, 0x8a8098);
  a.dot(13, 13, 0x6a6080);
  a.register(scene, DARKLORD_PARTS.head, [8, 16]);
}

function hair(scene: Phaser.Scene): void {
  const a = new PixelArt(6, 16);
  a.poly(HAIR, [
    [1, 0],
    [5, 0],
    [6, 6],
    [4, 12],
    [2, 16],
    [0, 8],
  ]);
  a.dots(0x4a3a5a, [
    [3, 3],
    [3, 8],
  ]);
  a.register(scene, 'dl-hair', [3, 1]);
}

function torso(scene: Phaser.Scene): void {
  const a = new PixelArt(15, 18);
  // 목 뒤로 솟은 높은 깃
  a.poly(LINING, [
    [1, 0],
    [6, 2],
    [6, 7],
    [1, 6],
  ]);
  a.line(GOLD, 1, 0, 1, 6);
  // 검은 갑주 (가슴이 앞)
  a.poly(ARMOR, [
    [3, 4],
    [10, 3],
    [14, 6],
    [14, 11],
    [12, 17],
    [4, 18],
    [2, 10],
  ]);
  // 금 세공: 가슴판 테두리와 갈비 무늬
  a.line(GOLD, 8, 4, 13, 6);
  a.line(GOLD, 12, 9, 9, 14);
  a.line(GOLD, 5, 16, 12, 16);
  // 가슴의 보라 보석
  a.dot(11, 9, GEM);
  a.dot(11, 8, 0xe0a8ff);
  a.dot(12, 9, 0x6a1aa8);
  a.register(scene, DARKLORD_PARTS.torso, [7, 18]);
}

function pelvis(scene: Phaser.Scene): void {
  const a = new PixelArt(12, 5);
  a.rect(ARMOR_B, 0, 0, 12, 4);
  a.line(GOLD, 0, 1, 11, 1);
  a.dot(8, 1, GEM);
  a.register(scene, DARKLORD_PARTS.pelvis, [6, 0]);
}

function pauldron(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 가시 돋친 어깨: 금 테, 위로 솟은 가시 둘
  const a = new PixelArt(12, 10);
  a.poly(mat, [
    [5, 0],
    [6, 3],
    [4, 3],
  ]);
  a.poly(mat, [
    [9, 1],
    [9, 4],
    [7, 4],
  ]);
  a.ellipse(mat, 6, 6, 6, 3.6);
  a.line(GOLD, 1, 8, 11, 8);
  a.dots(0xd8b04a, [
    [5, 0],
    [9, 1],
  ]);
  a.register(scene, key, [6, 5]);
}

function upper(scene: Phaser.Scene, key: string, mat: Ramp): void {
  const a = new PixelArt(5, 9);
  a.rect(mat, 1, 0, 3, 9);
  a.register(scene, key, [2.5, 1]);
}

function fore(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 끝이 넓게 퍼진 소매와 금 소맷부리
  const a = new PixelArt(7, 10);
  a.poly(mat, [
    [2, 0],
    [5, 0],
    [7, 8],
    [0, 8],
  ]);
  a.line(GOLD, 0, 8, 6, 8);
  a.register(scene, key, [3.5, 1]);
}

function hand(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 잿빛 손, 끝이 뾰족한 손톱
  const a = new PixelArt(5, 6);
  a.ellipse(mat, 2.5, 2.5, 2.5, 2.5);
  a.dots(VOID, [
    [1, 5],
    [3, 5],
  ]);
  a.register(scene, key, [2.5, 2.5]);
}

function leg(scene: Phaser.Scene, key: string, mat: Ramp, len: number): void {
  const a = new PixelArt(5, len + 1);
  a.rect(mat, 0, 0, 5, len + 1);
  a.register(scene, key, [2.5, 1]);
}

function foot(scene: Phaser.Scene, key: string, mat: Ramp): void {
  // 끝에 금을 씌운 뾰족 장화
  const a = new PixelArt(9, 4);
  a.poly(mat, [
    [0, 0],
    [4, 0],
    [9, 3],
    [9, 4],
    [0, 4],
  ]);
  a.dot(8, 3, 0xd8b04a);
  a.register(scene, key, [3, 1]);
}

function staff(scene: Phaser.Scene): void {
  // 세워 그림 (위가 초승달). 손잡이는 위에서 22픽셀 (아래쪽 끝은 땅을 짚는다).
  const a = new PixelArt(16, 58);
  // 초승달: 큰 원에서 오른쪽 위로 비켜 난 원을 뺀다.
  const pts: [number, number][] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const outer = Math.hypot(x + 0.5 - 7.5, y + 0.5 - 8) <= 7.2;
      const inner = Math.hypot(x + 0.5 - 10, y + 0.5 - 5.5) <= 6;
      if (outer && !inner) pts.push([x, y]);
    }
  a.pixels(MOON, pts);
  // 달이 품은 검은 구슬
  a.ellipse(ramp(0x3a1a5a), 9, 7.5, 3.2, 3.2);
  a.dot(9, 7, GEM);
  a.dot(8, 6, 0xe0a8ff);
  // 자루와 금테
  a.rect(SHAFT, 6, 15, 4, 42);
  for (const y of [16, 28, 33, 46]) a.rect(GOLD, 5, y, 6, 2);
  // 끝의 금 물미
  a.poly(GOLD, [
    [6, 56],
    [10, 56],
    [8, 58],
  ]);
  a.register(scene, DARKLORD_PARTS.weapon, [8, 22]);
}

export function makeDarkLordArt(scene: Phaser.Scene): void {
  head(scene);
  hair(scene);
  torso(scene);
  pelvis(scene);
  pauldron(scene, DARKLORD_PARTS.pauldronF, ARMOR);
  pauldron(scene, DARKLORD_PARTS.pauldronB, ARMOR_B);
  upper(scene, DARKLORD_PARTS.upperF, ROBE);
  upper(scene, DARKLORD_PARTS.upperB, ramp(0x1e1230));
  fore(scene, DARKLORD_PARTS.foreF, ROBE);
  fore(scene, DARKLORD_PARTS.foreB, ramp(0x1e1230));
  hand(scene, DARKLORD_PARTS.handF, SKIN);
  hand(scene, DARKLORD_PARTS.handB, ramp(0x8a8098));
  leg(scene, DARKLORD_PARTS.thighF, ROBE, 12);
  leg(scene, DARKLORD_PARTS.thighB, ramp(0x1e1230), 12);
  leg(scene, DARKLORD_PARTS.shinF, ROBE, 13);
  leg(scene, DARKLORD_PARTS.shinB, ramp(0x1e1230), 13);
  foot(scene, DARKLORD_PARTS.footF, ARMOR);
  foot(scene, DARKLORD_PARTS.footB, ARMOR_B);
  staff(scene);
}

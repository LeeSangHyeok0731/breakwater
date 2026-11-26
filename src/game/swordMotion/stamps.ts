import { crop, flipH, fromRows, type Buf } from './pixels';

// 몸 방향(옆·앞·반대 옆·등)마다 머리와 가슴 도트가 다르다.
// 옆모습은 원본 기사 대기 시트 0번 칸(38×48)에서 오리고, 반대 옆은 그것을 뒤집고, 앞·등은 새로 그린다.
// 오린 좌표는 격자로 확대해서 잰 값이다. 조각은 임의 각도로 돌리지 않는다.

export type View = 'R' | 'L' | 'F' | 'B';

export interface ViewStamps {
  head: Buf;
  chest: Buf;
}

export interface Stamps {
  /** 오른쪽을 봄 (원본) */
  R: ViewStamps;
  /** 왼쪽을 봄 (R을 뒤집음) */
  L: ViewStamps;
  /** 정면 (화면 쪽을 봄) */
  F: ViewStamps;
  /** 등 (화면 쪽에 등을 돌림) */
  B: ViewStamps;
  /** 금빛 어깨갑옷 (왼쪽 어깨용은 뒤집은 것) */
  pauldron: Buf;
  pauldronL: Buf;
}

export const STAMP_RECTS = {
  head: { x: 19, y: 7, w: 14, h: 13 },
  chest: { x: 14, y: 19, w: 17, h: 15 },
  pauldron: { x: 11, y: 12, w: 10, h: 9 },
};

const PAL: Record<string, number> = {
  h: 0xffd9b9, // 머리카락 밝은 결
  g: 0xaf9785, // 머리카락 그늘
  s: 0xffc98b, // 피부
  e: 0xed053e, // 눈
  d: 0x130a1b, // 외곽·옷
  p: 0x573b60, // 옷 보랏빛 면
  r: 0xed053e, // 목도리 밝음
  R: 0x810936, // 목도리 어두움
  G: 0xbc6c17, // 금장
  o: 0x983e1d, // 금장 그늘
  y: 0xffcc61, // 금장 밝음
};

// 뒤통수: 흰 머리카락과 목덜미
const HEAD_B = [
  '...hhhhh...',
  '..hhghhhh..',
  '.hhhggghhh.',
  '.hhgghhhgg.',
  'hhgghhhgghh',
  'hggghhhhggh',
  'hhgghhggghg',
  '.hggghhggh.',
  '.ggghhgggg.',
  '..gggghgg..',
  '...ssssss..',
  '....ddd....',
];

// 얼굴: 앞머리와 붉은 두 눈
const HEAD_F = [
  '...hhhhh...',
  '..hhhhhhh..',
  '.hhhhghhhh.',
  'hhhhhhhhhhg',
  'hhgsssssghh',
  '.hssssssshg',
  '.hsesssesh.',
  '.hsssssssh.',
  '..ssssssss.',
  '...ssssss..',
  '....ssss...',
  '..rrrrrrr..',
];

// 가슴 앞: 붉은 목도리, 검은 옷, 금빛 허리띠
const CHEST_F = [
  '..rrrrRrrrr..',
  '.rrrRRRRRrrr.',
  '.dddrRRRrddd.',
  'dddddRRRddddd',
  'dpdddddddddpd',
  'dpdddddddddpd',
  'ddddddddddddd',
  '.ddddddddddd.',
  '.ddpdddddpdd.',
  'GGGGGGGGGGGGG',
  'GoGGGyyyGGGoG',
  '.ddddddddddd.',
  '.dpddddddpdd.',
  '..ddd...ddd..',
];

// 가슴 뒤: 검은 옷 (대부분 망토가 덮는다)
const CHEST_B = [
  '..ddddddddd..',
  '.ddpddddddpd.',
  '.ddddddddddd.',
  'ddddddddddddd',
  'dpdddddddddpd',
  'dpdddddddddpd',
  'ddddddddddddd',
  '.ddddddddddd.',
  '.ddpdddddpdd.',
  'GGGGGGGGGGGGG',
  'GoGGGGGGGGGoG',
  '.ddddddddddd.',
  '.dpddddddpdd.',
  '..ddd...ddd..',
];

/** idle0: hero-idle 시트의 0번 칸 픽셀 */
export function cutStamps(idle0: Buf): Stamps {
  const r = STAMP_RECTS;
  const R: ViewStamps = {
    head: crop(idle0, r.head.x, r.head.y, r.head.w, r.head.h),
    chest: crop(idle0, r.chest.x, r.chest.y, r.chest.w, r.chest.h),
  };
  const pauldron = crop(idle0, r.pauldron.x, r.pauldron.y, r.pauldron.w, r.pauldron.h);
  return {
    R,
    L: { head: flipH(R.head), chest: flipH(R.chest) },
    F: { head: fromRows(HEAD_F, PAL), chest: fromRows(CHEST_F, PAL) },
    B: { head: fromRows(HEAD_B, PAL), chest: fromRows(CHEST_B, PAL) },
    pauldron,
    pauldronL: flipH(pauldron),
  };
}

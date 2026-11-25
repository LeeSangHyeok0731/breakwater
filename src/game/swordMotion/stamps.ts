import { crop, type Buf } from './pixels';

// 원본 기사 대기 시트 0번 칸(38×48)에서 거의 안 변하는 부분을 도트 조각으로 오린다.
// 좌표는 격자로 확대해서 잰 값이다. 조각은 임의 각도로 돌리지 않고 붙이기만 한다.

export interface Stamps {
  /** 머리카락·얼굴 */
  head: Buf;
  /** 목도리와 가슴·배 */
  chest: Buf;
  /** 금빛 어깨갑옷 */
  pauldron: Buf;
}

export const STAMP_RECTS = {
  head: { x: 19, y: 7, w: 14, h: 13 },
  chest: { x: 14, y: 19, w: 17, h: 15 },
  pauldron: { x: 11, y: 12, w: 10, h: 9 },
};

/** idle0: hero-idle 시트의 0번 칸 픽셀 */
export function cutStamps(idle0: Buf): Stamps {
  const r = STAMP_RECTS;
  return {
    head: crop(idle0, r.head.x, r.head.y, r.head.w, r.head.h),
    chest: crop(idle0, r.chest.x, r.chest.y, r.chest.w, r.chest.h),
    pauldron: crop(idle0, r.pauldron.x, r.pauldron.y, r.pauldron.w, r.pauldron.h),
  };
}

// 검사 평타 포즈. 좌표는 96×64 칸 안의 픽셀이고 발바닥은 y=63, 몸통 기준은 x=40이다. 오른쪽을 본다.

export type Pt = [number, number];

export interface Limb {
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
}

export interface SwordPose {
  /** 가슴 조각의 왼쪽 위 */
  chest: Pt;
  /** 머리 조각의 왼쪽 위 */
  head: Pt;
  /** 어깨갑옷 조각의 왼쪽 위 */
  pauldron: Pt;
  /** 가슴을 앞으로 기울이는 정도 (픽셀) */
  lean: number;
  front: Limb;
  back: Limb;
  /** 엉덩이 위치와 두 다리 [무릎, 발] */
  hip: Pt;
  frontLeg: [Pt, Pt];
  backLeg: [Pt, Pt];
  /** 칼날 [손잡이 끝(뒤), 칼끝] */
  blade: [Pt, Pt];
  /** 망토 바깥 둘레 */
  cape: Pt[];
}

/** 1단 타격 칸: 한 발 내디디며 오른쪽 아래로 내려 벤 순간 */
export const COMBO1_STRIKE: SwordPose = {
  chest: [37, 33],
  head: [44, 22],
  pauldron: [37, 27],
  lean: 3,
  front: { shoulder: [49, 38], elbow: [58, 40], hand: [66, 46] },
  back: { shoulder: [43, 39], elbow: [37, 44], hand: [32, 47] },
  hip: [43, 49],
  frontLeg: [[52, 54], [58, 62]],
  backLeg: [[37, 56], [27, 62]],
  blade: [[63, 44], [91, 58]],
  cape: [[40, 31], [47, 33], [43, 40], [36, 43], [30, 40], [18, 47], [8, 58], [12, 62], [22, 62], [30, 58], [38, 55], [44, 50], [46, 44]],
};

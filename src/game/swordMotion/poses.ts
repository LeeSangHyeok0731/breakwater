// 검사 평타 포즈. 좌표는 96×64 칸 안의 픽셀이고 발바닥은 y=62, 몸통 기준은 x=40이다. 오른쪽을 본다.

export type Pt = [number, number];

export interface Limb {
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
}

/** 칼이 지나간 자리 잔상: 앞 어깨를 중심으로 [시작 각도, 끝 각도, 안쪽 반지름, 바깥 반지름] (도, 0=앞, 90=아래) */
export type Smear = [number, number, number, number];

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
  smear?: Smear;
}

/** 포즈를 짧게 적는 입력. 머리·어깨갑옷·어깨·엉덩이는 가슴 위치(t)에서 정해진 만큼 떨어진 곳이다. */
interface Spec {
  /** 가슴 조각의 왼쪽 위 */
  t: Pt;
  lean?: number;
  /** [무릎, 발] — 앞다리, 뒷다리 */
  fl: [Pt, Pt];
  bl: [Pt, Pt];
  /** [팔꿈치, 손] — 앞팔(칼 든 팔), 뒷팔 */
  fa: [Pt, Pt];
  ba?: [Pt, Pt];
  /** 칼 방향 (도, 0=앞, 90=아래, 270=위)과 길이 */
  ang: number;
  len?: number;
  /** 망토 끝 위치와 처짐 */
  cape: [number, number, number?];
  /** 엉덩이를 가슴 기준에서 옮기는 정도 */
  hipDy?: number;
  /** 머리를 기본 위치에서 옮기는 정도 */
  headD?: Pt;
  /** 칼 잔상이 시작하는 각도(도). 끝은 칼끝 방향에 자동으로 맞춘다. */
  smear?: number;
}

function curve(a: Pt, c: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const u = i / n;
    out.push([
      Math.round((1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0]),
      Math.round((1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]),
    ]);
  }
  return out;
}

/** 어깨에서 끝까지 위·아래 두 가장자리를 둥글게 이어 망토 둘레를 만든다. 아래 가장자리는 들쭉날쭉하다. */
function capeOutline(t: Pt, tip: Pt, sag: number): Pt[] {
  const A: Pt = [t[0] + 3, t[1] - 2];
  const B: Pt = [t[0] + 10, t[1] - 1];
  const H: Pt = [t[0] + 9, t[1] + 17];
  const up = curve(A, [(A[0] + tip[0]) / 2, (A[1] + tip[1]) / 2 - sag], tip, 5);
  const low = curve(tip, [(tip[0] + H[0]) / 2, (tip[1] + H[1]) / 2 + sag + 4], H, 6).map((p, i): Pt => [p[0], p[1] + (i % 2 === 0 ? 1 : -1)]);
  return [B, A, ...up, tip, ...low, H];
}

/** 잔상: a0에서 시작해 칼끝이 있는 방향에서 끝나는 부채꼴 (어깨에서 칼끝까지가 바깥 반지름) */
function sweepTo(a0: number, shoulder: Pt, tip: Pt): Smear {
  const dx = tip[0] - shoulder[0];
  const dy = tip[1] - shoulder[1];
  let a1 = (Math.atan2(dy, dx) * 180) / Math.PI;
  while (a1 - a0 > 180) a1 -= 360;
  while (a1 - a0 < -180) a1 += 360;
  const r1 = Math.hypot(dx, dy);
  return [a0, a1, Math.max(10, r1 - 17), r1];
}

function pose(s: Spec): SwordPose {
  const [tx, ty] = s.t;
  const hand = s.fa[1];
  const r = (s.ang * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const len = s.len ?? 30;
  const hd = s.headD ?? [0, 0];
  const blade: [Pt, Pt] = [
    [Math.round(hand[0] - dx * 3), Math.round(hand[1] - dy * 3)],
    [Math.round(hand[0] + dx * len), Math.round(hand[1] + dy * len)],
  ];
  const ba = s.ba ?? [[tx - 2, ty + 10], [tx - 6, ty + 13]];
  return {
    chest: [tx, ty],
    head: [tx + 7 + hd[0], ty - 11 + hd[1]],
    pauldron: [tx, ty - 6],
    lean: s.lean ?? 0,
    front: { shoulder: [tx + 12, ty + 5], elbow: s.fa[0], hand },
    back: { shoulder: [tx + 6, ty + 6], elbow: ba[0], hand: ba[1] },
    hip: [tx + 6, ty + 16 + (s.hipDy ?? 0)],
    frontLeg: s.fl,
    backLeg: s.bl,
    blade,
    cape: capeOutline(s.t, [s.cape[0], s.cape[1]], s.cape[2] ?? 5),
    smear: s.smear === undefined ? undefined : sweepTo(s.smear, [tx + 12, ty + 5], blade[1]),
  };
}

/** 한 단의 칸: 동작이 시작하고 at초가 지나면 이 칸을 보인다. 타격 칸은 타격 시점 직전에 놓는다. */
export interface Key {
  at: number;
  pose: SwordPose;
}

// 다리 자세 묶음 (앞다리 [무릎, 발], 뒷다리)
type Legs = { fl: [Pt, Pt]; bl: [Pt, Pt] };
/** 체중을 뒤에 싣고 젖히는 자세 */
const BACK: Legs = { fl: [[42, 56], [45, 62]], bl: [[32, 57], [28, 62]] };
const MID: Legs = { fl: [[48, 55], [52, 62]], bl: [[36, 56], [29, 62]] };
const LUNGE: Legs = { fl: [[56, 55], [62, 62]], bl: [[39, 57], [24, 62]] };
/** 가장 크게 내디딘 자세 */
const LUNGE2: Legs = { fl: [[58, 56], [65, 62]], bl: [[41, 57], [22, 62]] };

// 흐름: 젖힌다(오래) → 잔상(짧게, 휙) → 타격(맞는 순간 멈춘다) → 여운 → 자세를 되찾는다.

// ───────── 1단: 내려 베기 (동작 0.32초, 타격 0.11초) ─────────
export const COMBO1: Key[] = [
  // 칼을 어깨 뒤로 크게 젖히고 체중을 뒤에 싣는다
  { at: 0, pose: pose({ t: [31, 34], lean: -4, headD: [-2, 1], ...BACK, fa: [[39, 38], [36, 29]], ba: [[36, 42], [42, 43]], ang: 240, len: 32, cape: [6, 47] }) },
  // 휘두름: 머리 위에서 앞으로 칼이 지나간 자리
  { at: 0.05, pose: pose({ t: [36, 33], lean: 1, ...MID, fa: [[53, 34], [57, 29]], ba: [[31, 40], [27, 44]], ang: 330, smear: -125, cape: [6, 52] }) },
  // 타격: 크게 내디디며 사선으로 내려친 채 멈춘다
  { at: 0.09, pose: pose({ t: [40, 34], lean: 6, ...LUNGE, fa: [[60, 41], [69, 47]], ba: [[35, 44], [29, 46]], ang: 28, len: 32, cape: [4, 57] }) },
  // 여운
  { at: 0.2, pose: pose({ t: [39, 35], lean: 5, ...LUNGE, fa: [[60, 43], [68, 51]], ba: [[35, 45], [29, 47]], ang: 18, cape: [7, 58] }) },
  // 자세를 되찾는다
  { at: 0.27, pose: pose({ t: [36, 33], lean: 2, ...MID, fa: [[55, 41], [62, 46]], ba: [[32, 41], [29, 45]], ang: 22, cape: [11, 56] }) },
];

// ───────── 2단: 역베기, 아래에서 위로 (0.32초, 타격 0.11초) ─────────
export const COMBO2: Key[] = [
  // 몸을 깊이 낮추고 칼을 아래로 끌어 둔다
  { at: 0, pose: pose({ t: [33, 39], lean: 4, hipDy: 1, fl: [[48, 58], [52, 62]], bl: [[34, 59], [27, 62]], fa: [[46, 44], [48, 52]], ba: [[29, 46], [26, 50]], ang: 15, cape: [6, 58] }) },
  // 휘두름: 아래에서 위로 칼이 지나간 자리
  { at: 0.06, pose: pose({ t: [35, 36], lean: 3, ...MID, fa: [[52, 42], [58, 45]], ba: [[31, 43], [27, 47]], ang: 350, smear: 75, cape: [6, 57] }) },
  // 타격: 몸을 일으키며 위로 베어 올린 채 멈춘다
  { at: 0.095, pose: pose({ t: [38, 32], lean: 6, fl: [[53, 53], [58, 62]], bl: [[38, 55], [26, 62]], fa: [[56, 37], [62, 29]], ba: [[33, 36], [28, 32]], ang: 312, len: 28, cape: [5, 50] }) },
  // 칼이 위에서 머문다
  { at: 0.18, pose: pose({ t: [36, 31], lean: 1, fl: [[50, 53], [55, 62]], bl: [[37, 55], [29, 62]], fa: [[54, 32], [57, 23]], ba: [[31, 36], [28, 33]], ang: 295, len: 26, cape: [8, 48] }) },
  { at: 0.26, pose: pose({ t: [35, 33], lean: 1, ...MID, fa: [[52, 37], [56, 33]], ba: [[31, 40], [28, 43]], ang: 335, cape: [11, 52] }) },
];

// ───────── 3단: X자로 두 번 (0.38초, 타격 0.09 · 0.21초) ─────────
export const COMBO3: Key[] = [
  { at: 0, pose: pose({ t: [34, 34], lean: -2, ...MID, fa: [[46, 35], [49, 26]], ba: [[30, 40], [27, 43]], ang: 300, len: 30, cape: [8, 50] }) },
  // 첫 휘두름
  { at: 0.04, pose: pose({ t: [37, 33], lean: 2, ...MID, fa: [[54, 35], [58, 29]], ba: [[32, 40], [28, 43]], ang: 335, smear: -125, cape: [7, 53] }) },
  // 첫 타: 오른쪽 아래 사선
  { at: 0.075, pose: pose({ t: [39, 34], lean: 5, ...LUNGE, fa: [[60, 41], [67, 46]], ba: [[35, 45], [30, 48]], ang: 34, cape: [5, 57] }) },
  // 손목을 돌려 칼을 아래에서 끌어올린다
  { at: 0.15, pose: pose({ t: [38, 35], lean: 3, fl: [[53, 56], [58, 62]], bl: [[38, 58], [28, 62]], fa: [[57, 45], [61, 49]], ba: [[35, 46], [31, 50]], ang: 5, smear: 75, cape: [8, 58] }) },
  // 둘째 타: 반대 사선으로 올려 벤 채 멈춘다
  { at: 0.185, pose: pose({ t: [38, 32], lean: 6, fl: [[54, 54], [59, 62]], bl: [[38, 55], [26, 62]], fa: [[59, 37], [64, 30]], ba: [[33, 38], [29, 35]], ang: 318, len: 28, cape: [5, 52] }) },
  { at: 0.28, pose: pose({ t: [36, 33], lean: 2, ...MID, fa: [[54, 37], [58, 31]], ba: [[32, 40], [29, 43]], ang: 335, cape: [10, 53] }) },
];

// ───────── 4단: 한 걸음 크게 (0.42초, 타격 0.15초) ─────────
export const COMBO4: Key[] = [
  // 크게 뒤로 감는다
  { at: 0, pose: pose({ t: [30, 35], lean: -5, headD: [-3, 1], hipDy: 1, fl: [[40, 56], [43, 62]], bl: [[31, 58], [27, 62]], fa: [[32, 41], [29, 45]], ba: [[26, 40], [23, 43]], ang: 195, len: 32, cape: [16, 52] }) },
  // 더 깊이 감는다 (타격 전의 힘 모으기)
  { at: 0.07, pose: pose({ t: [29, 36], lean: -6, headD: [-3, 1], hipDy: 1, fl: [[40, 57], [44, 62]], bl: [[30, 59], [25, 62]], fa: [[30, 39], [26, 37]], ba: [[25, 41], [22, 44]], ang: 190, len: 32, cape: [24, 50] }) },
  // 휘두름: 크게 가로
  { at: 0.115, pose: pose({ t: [36, 34], lean: 2, fl: [[50, 55], [55, 62]], bl: [[36, 57], [26, 62]], fa: [[50, 37], [56, 35]], ba: [[31, 42], [27, 44]], ang: 355, len: 32, smear: -75, cape: [6, 54] }) },
  // 타격: 도약하듯 크게 내디디며 가로로 멈춘다
  { at: 0.14, pose: pose({ t: [42, 33], lean: 7, ...LUNGE2, fa: [[58, 36], [67, 35]], ba: [[38, 41], [31, 43]], ang: 0, len: 32, cape: [4, 55] }) },
  { at: 0.22, pose: pose({ t: [43, 34], lean: 6, fl: [[59, 56], [66, 62]], bl: [[43, 57], [26, 62]], fa: [[60, 38], [68, 41]], ba: [[39, 42], [32, 45]], ang: 10, len: 32, cape: [7, 57] }) },
  { at: 0.32, pose: pose({ t: [38, 34], lean: 3, ...MID, fa: [[56, 41], [62, 46]], ba: [[34, 44], [30, 47]], ang: 26, cape: [10, 58] }) },
];

// ───────── 5단: 돌며 세 번, 마지막은 관통 (0.6초, 타격 0.10 · 0.23 · 0.38초) ─────────
export const COMBO5: Key[] = [
  { at: 0, pose: pose({ t: [32, 35], lean: -4, ...BACK, fa: [[36, 40], [33, 36]], ba: [[27, 41], [24, 44]], ang: 198, len: 32, cape: [14, 52] }) },
  // 첫 휘두름
  { at: 0.05, pose: pose({ t: [36, 33], lean: 1, ...MID, fa: [[50, 35], [54, 32]], ba: [[31, 40], [27, 43]], ang: 350, smear: -75, cape: [8, 52] }) },
  // 첫 타: 앞으로 가로
  { at: 0.085, pose: pose({ t: [39, 33], lean: 5, ...LUNGE, fa: [[58, 37], [65, 36]], ba: [[34, 42], [29, 44]], ang: 4, len: 32, cape: [5, 54] }) },
  // 몸을 돌려 머리 위로 크게 칼을 돌린다 (망토가 앞으로 쏠린다)
  { at: 0.17, pose: pose({ t: [37, 34], lean: -1, fl: [[50, 55], [54, 62]], bl: [[38, 57], [30, 62]], fa: [[34, 31], [30, 26]], ba: [[45, 39], [50, 36]], ang: 250, len: 30, smear: 345, cape: [66, 52, 6] }) },
  // 둘째 타
  { at: 0.21, pose: pose({ t: [39, 33], lean: 5, ...LUNGE, fa: [[59, 36], [66, 33]], ba: [[34, 42], [29, 45]], ang: 352, len: 32, cape: [5, 52] }) },
  // 한 번 더 뒤에서 아래로 쓸어 올린다
  { at: 0.3, pose: pose({ t: [37, 34], lean: -1, fl: [[50, 55], [54, 62]], bl: [[38, 57], [30, 62]], fa: [[32, 36], [27, 36]], ba: [[45, 40], [50, 38]], ang: 183, len: 30, smear: 265, cape: [64, 54, 6] }) },
  // 셋째 타: 가장 크게 내디디며
  { at: 0.36, pose: pose({ t: [41, 33], lean: 7, ...LUNGE2, fa: [[60, 37], [68, 38]], ba: [[38, 43], [32, 46]], ang: 8, len: 34, cape: [4, 56] }) },
  // 관통: 칼을 곧게 뻗은 채 버틴다
  { at: 0.45, pose: pose({ t: [42, 34], lean: 7, ...LUNGE2, fa: [[62, 38], [70, 38]], ba: [[39, 44], [32, 47]], ang: 0, len: 24, cape: [5, 56] }) },
  { at: 0.53, pose: pose({ t: [38, 34], lean: 3, ...MID, fa: [[56, 41], [62, 45]], ba: [[34, 44], [30, 47]], ang: 22, cape: [10, 57] }) },
];

export const COMBOS: Key[][] = [COMBO1, COMBO2, COMBO3, COMBO4, COMBO5];

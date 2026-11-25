// 검사 평타 포즈. 좌표는 96×64 칸 안의 픽셀이고 발바닥은 y=62, 몸통 기준은 x=40이다. 오른쪽을 본다.
//
// 포즈를 칸마다 따로 찍으면 발과 칼이 한 칸에 몇 픽셀씩 튄다. 그래서 핵심 포즈(키)만 정하고,
// 그 사이를 1/60초마다 자동으로 이어 붙인다 (`buildFrames`). 뒷발은 땅에 박아 두고, 앞발은 들었다 내디디며,
// 칼은 천천히 젖힌 뒤 점점 빨라지며 휘두르고, 망토는 몸을 한 박자 늦게 따라온다.

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
  lean: number;
  /** [무릎, 발] — 앞다리, 뒷다리 */
  fl: [Pt, Pt];
  bl: [Pt, Pt];
  /** [팔꿈치, 손] — 앞팔(칼 든 팔), 뒷팔 */
  fa: [Pt, Pt];
  ba: [Pt, Pt];
  /**
   * 칼 방향 (도, 0=앞, 90=아래, 270=위). 이어지는 키끼리 돌아가는 방향대로 이어 쓴 값이다
   * (예: 위에서 아래로 내려치면 240 → 388). 키 사이에서 이 값을 그대로 이어 붙여 칼이 돈다.
   */
  ang: number;
  len: number;
  /** 망토 끝 위치와 처짐 */
  cape: [number, number, number];
  hipDy: number;
  headD: Pt;
}

type SpecIn = Partial<Pick<Spec, 'lean' | 'ba' | 'len' | 'hipDy' | 'headD'>> & Pick<Spec, 't' | 'fl' | 'bl' | 'fa' | 'ang'> & { cape: [number, number, number?] };

function full(s: SpecIn): Spec {
  const [tx, ty] = s.t;
  return {
    t: s.t,
    lean: s.lean ?? 0,
    fl: s.fl,
    bl: s.bl,
    fa: s.fa,
    ba: s.ba ?? [[tx - 2, ty + 10], [tx - 6, ty + 13]],
    ang: s.ang,
    len: s.len ?? 30,
    cape: [s.cape[0], s.cape[1], s.cape[2] ?? 5],
    hipDy: s.hipDy ?? 0,
    headD: s.headD ?? [0, 0],
  };
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
  const A: Pt = [Math.round(t[0]) + 3, Math.round(t[1]) - 2];
  const B: Pt = [Math.round(t[0]) + 10, Math.round(t[1]) - 1];
  const H: Pt = [Math.round(t[0]) + 9, Math.round(t[1]) + 17];
  const up = curve(A, [(A[0] + tip[0]) / 2, (A[1] + tip[1]) / 2 - sag], tip, 5);
  const low = curve(tip, [(tip[0] + H[0]) / 2, (tip[1] + H[1]) / 2 + sag + 4], H, 6).map((p, i): Pt => [p[0], p[1] + (i % 2 === 0 ? 1 : -1)]);
  return [B, A, ...up, tip, ...low, H];
}

function bladeOf(s: Spec): [Pt, Pt] {
  const hand = s.fa[1];
  const r = (s.ang * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  return [
    [Math.round(hand[0] - dx * 3), Math.round(hand[1] - dy * 3)],
    [Math.round(hand[0] + dx * s.len), Math.round(hand[1] + dy * s.len)],
  ];
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

function shoulderOf(s: Spec): Pt {
  return [s.t[0] + 12, s.t[1] + 5];
}

/** 칼끝이 앞 어깨에서 어느 각도에 있는가 (도) */
function tipAngle(s: Spec): number {
  const [sx, sy] = shoulderOf(s);
  const tip = bladeOf(s)[1];
  return (Math.atan2(tip[1] - sy, tip[0] - sx) * 180) / Math.PI;
}

function pose(s: Spec, smearFrom?: number): SwordPose {
  const [tx, ty] = s.t;
  const blade = bladeOf(s);
  return {
    chest: [tx, ty],
    head: [tx + 7 + s.headD[0], ty - 11 + s.headD[1]],
    pauldron: [tx, ty - 6],
    lean: s.lean,
    front: { shoulder: shoulderOf(s), elbow: s.fa[0], hand: s.fa[1] },
    back: { shoulder: [tx + 6, ty + 6], elbow: s.ba[0], hand: s.ba[1] },
    hip: [tx + 6, ty + 16 + s.hipDy],
    frontLeg: s.fl,
    backLeg: s.bl,
    blade,
    cape: capeOutline(s.t, [Math.round(s.cape[0]), Math.round(s.cape[1])], s.cape[2]),
    smear: smearFrom === undefined ? undefined : sweepTo(smearFrom, shoulderOf(s), blade[1]),
  };
}

// ───────── 키 사이를 이어 붙인다 ─────────

export const FPS = 60;

type Ease = 'in' | 'out' | 'io';
const EASE: Record<Ease, (u: number) => number> = {
  /** 점점 빨라진다 (휘두름) */
  in: (u) => Math.pow(u, 1.7),
  /** 처음에 빠르고 끝에서 느려진다 (여운) */
  out: (u) => 1 - Math.pow(1 - u, 2.2),
  io: (u) => u * u * (3 - 2 * u),
};

/** 핵심 포즈. at초에 이 포즈가 되고, 앞 키에서 여기까지 ease로 이어진다. swing이면 그 사이에 칼 잔상이 따라붙는다. */
interface KeySpec {
  at: number;
  spec: Spec;
  ease?: Ease;
  swing?: boolean;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const lerpPt = (p: Pt, q: Pt, u: number): Pt => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];

/** 다리: 발이 멀리 옮겨 가면 들어 올렸다 내딛는다. 가만히 있는 발은 그대로 박혀 있다. */
function lerpLeg(p: [Pt, Pt], q: [Pt, Pt], u: number): [Pt, Pt] {
  const knee = lerpPt(p[0], q[0], u);
  const foot = lerpPt(p[1], q[1], u);
  const travel = Math.abs(q[1][0] - p[1][0]);
  if (travel > 5) {
    const h = Math.sin(Math.PI * u) * Math.min(1, travel / 14);
    foot[1] -= 5 * h;
    knee[1] -= 3 * h;
  }
  return [knee, foot];
}

function lerpSpec(a: Spec, b: Spec, u: number): Spec {
  return {
    t: lerpPt(a.t, b.t, u),
    lean: lerp(a.lean, b.lean, u),
    fl: lerpLeg(a.fl, b.fl, u),
    bl: lerpLeg(a.bl, b.bl, u),
    fa: [lerpPt(a.fa[0], b.fa[0], u), lerpPt(a.fa[1], b.fa[1], u)],
    ba: [lerpPt(a.ba[0], b.ba[0], u), lerpPt(a.ba[1], b.ba[1], u)],
    ang: lerp(a.ang, b.ang, u),
    len: lerp(a.len, b.len, u),
    cape: [lerp(a.cape[0], b.cape[0], u), lerp(a.cape[1], b.cape[1], u), lerp(a.cape[2], b.cape[2], u)],
    hipDy: lerp(a.hipDy, b.hipDy, u),
    headD: lerpPt(a.headD, b.headD, u),
  };
}

/** 키들을 1/60초마다 한 칸씩 이어 붙인다. 칸 i는 동작이 시작하고 i/60초 뒤의 모습이다. */
function buildFrames(keys: KeySpec[], dur: number): SwordPose[] {
  const n = Math.ceil(dur * FPS) + 1;
  const out: SwordPose[] = [];
  // 망토 끝은 몸이 가리키는 곳으로 한 박자 늦게 따라온다
  let cape: [number, number, number] = [...keys[0].spec.cape];
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    let k = 0;
    while (k + 1 < keys.length && keys[k + 1].at <= t) k++;
    const a = keys[k];
    const b = keys[k + 1];
    let spec: Spec;
    let smearFrom: number | undefined;
    if (!b) {
      spec = a.spec;
    } else {
      const u = Math.min(1, (t - a.at) / (b.at - a.at));
      const ease = EASE[b.ease ?? 'io'];
      spec = lerpSpec(a.spec, b.spec, ease(u));
      if (b.swing && u >= 0.15) smearFrom = tipAngle(lerpSpec(a.spec, b.spec, ease(Math.max(0, u - 0.4))));
    }
    cape = [lerp(cape[0], spec.cape[0], 0.25), lerp(cape[1], spec.cape[1], 0.25), spec.cape[2]];
    out.push(pose({ ...spec, cape }, smearFrom));
  }
  return out;
}

// 다리 자세 묶음 (앞다리 [무릎, 발], 뒷다리). 뒷발은 휘두르는 동안 같은 자리에 박혀 있다.
type Legs = { fl: [Pt, Pt]; bl: [Pt, Pt] };
const BACK: Legs = { fl: [[42, 56], [45, 62]], bl: [[32, 57], [27, 62]] };
const MID: Legs = { fl: [[48, 55], [52, 62]], bl: [[36, 56], [29, 62]] };
const LUNGE: Legs = { fl: [[56, 55], [62, 62]], bl: [[39, 57], [27, 62]] };
/** 가장 크게 내디딘 자세 */
const LUNGE2: Legs = { fl: [[58, 56], [65, 62]], bl: [[41, 57], [27, 62]] };

const K = (at: number, s: SpecIn, ease?: Ease, swing?: boolean): KeySpec => ({ at, spec: full(s), ease, swing });

// 흐름: 젖힌다(천천히, 오래) → 휘두른다(점점 빨라져 타격에서 멈춘다) → 여운 → 자세를 되찾는다.

// ───────── 1단: 내려 베기 (동작 0.32초, 타격 0.11초) ─────────
const COMBO1 = buildFrames(
  [
    K(0, { t: [33, 34], lean: -3, fl: [[44, 56], [47, 62]], bl: [[33, 57], [27, 62]], fa: [[40, 38], [37, 29]], ba: [[36, 42], [41, 43]], ang: 240, len: 32, cape: [8, 48] }),
    // 칼을 어깨 뒤로 크게 젖히고 체중을 뒤에 싣는다
    K(0.045, { t: [31, 34], lean: -4, headD: [-2, 1], ...BACK, fa: [[38, 37], [34, 28]], ba: [[36, 42], [42, 43]], ang: 226, len: 32, cape: [5, 46] }, 'io'),
    // 타격: 크게 내디디며 사선으로 내려친다
    K(0.1, { t: [40, 34], lean: 6, ...LUNGE, fa: [[60, 41], [69, 47]], ba: [[35, 44], [29, 46]], ang: 388, len: 32, cape: [4, 57] }, 'in', true),
    // 여운
    K(0.2, { t: [39, 35], lean: 5, ...LUNGE, fa: [[60, 43], [68, 51]], ba: [[35, 45], [29, 47]], ang: 378, cape: [7, 58] }, 'out'),
    K(0.3, { t: [36, 33], lean: 2, ...MID, fa: [[55, 41], [62, 46]], ba: [[32, 41], [29, 45]], ang: 382, cape: [11, 56] }, 'io'),
  ],
  0.32,
);

// ───────── 2단: 역베기, 아래에서 위로 (0.32초, 타격 0.11초) ─────────
const COMBO2 = buildFrames(
  [
    // 몸을 깊이 낮추고 칼을 아래로 끌어 둔다
    K(0, { t: [33, 39], lean: 4, hipDy: 1, fl: [[48, 58], [52, 62]], bl: [[34, 59], [27, 62]], fa: [[46, 44], [48, 52]], ba: [[29, 46], [26, 50]], ang: 15, cape: [6, 58] }),
    K(0.05, { t: [32, 40], lean: 5, hipDy: 1, fl: [[47, 58], [50, 62]], bl: [[33, 59], [27, 62]], fa: [[44, 45], [45, 54]], ba: [[28, 47], [25, 51]], ang: 28, cape: [5, 59] }, 'io'),
    // 몸을 일으키며 위로 베어 올린다
    K(0.1, { t: [38, 32], lean: 6, fl: [[53, 53], [58, 62]], bl: [[38, 55], [27, 62]], fa: [[56, 37], [62, 29]], ba: [[33, 36], [28, 32]], ang: -48, len: 28, cape: [5, 50] }, 'in', true),
    K(0.19, { t: [36, 31], lean: 1, fl: [[50, 53], [55, 62]], bl: [[37, 55], [28, 62]], fa: [[54, 32], [57, 23]], ba: [[31, 36], [28, 33]], ang: -65, len: 26, cape: [8, 48] }, 'out'),
    K(0.29, { t: [35, 33], lean: 1, ...MID, fa: [[52, 37], [56, 33]], ba: [[31, 40], [28, 43]], ang: -25, cape: [11, 52] }, 'io'),
  ],
  0.32,
);

// ───────── 3단: X자로 두 번 (0.38초, 타격 0.09 · 0.21초) ─────────
const COMBO3 = buildFrames(
  [
    K(0, { t: [34, 34], lean: -2, ...MID, fa: [[46, 35], [49, 26]], ba: [[30, 40], [27, 43]], ang: 300, cape: [8, 50] }),
    K(0.04, { t: [33, 34], lean: -3, fl: [[46, 55], [50, 62]], bl: [[35, 56], [28, 62]], fa: [[44, 34], [46, 25]], ba: [[29, 40], [26, 43]], ang: 282, cape: [6, 49] }, 'io'),
    // 첫 타: 오른쪽 아래 사선
    K(0.085, { t: [39, 34], lean: 5, fl: [[55, 55], [60, 62]], bl: [[38, 57], [28, 62]], fa: [[60, 41], [67, 46]], ba: [[35, 45], [30, 48]], ang: 394, cape: [5, 57] }, 'in', true),
    // 손목을 돌려 칼을 아래로 되돌린다
    K(0.15, { t: [38, 35], lean: 3, fl: [[53, 56], [58, 62]], bl: [[38, 58], [28, 62]], fa: [[57, 45], [61, 49]], ba: [[35, 46], [31, 50]], ang: 402, cape: [8, 58] }, 'io'),
    // 둘째 타: 반대 사선으로 올려 벤다
    K(0.2, { t: [38, 32], lean: 6, fl: [[54, 54], [59, 62]], bl: [[38, 55], [28, 62]], fa: [[59, 37], [64, 30]], ba: [[33, 38], [29, 35]], ang: 318, len: 28, cape: [5, 52] }, 'in', true),
    K(0.3, { t: [36, 33], lean: 2, fl: [[50, 54], [54, 62]], bl: [[36, 56], [29, 62]], fa: [[54, 37], [58, 31]], ba: [[32, 40], [29, 43]], ang: 335, cape: [10, 53] }, 'out'),
  ],
  0.38,
);

// ───────── 4단: 한 걸음 크게 (0.42초, 타격 0.15초) ─────────
const COMBO4 = buildFrames(
  [
    // 크게 뒤로 감는다
    K(0, { t: [31, 35], lean: -4, headD: [-2, 1], hipDy: 1, fl: [[41, 56], [44, 62]], bl: [[31, 58], [26, 62]], fa: [[33, 41], [30, 45]], ba: [[26, 40], [23, 43]], ang: 195, len: 32, cape: [14, 52] }),
    // 더 깊이 감는다 (타격 전의 힘 모으기)
    K(0.07, { t: [29, 36], lean: -6, headD: [-3, 1], hipDy: 1, fl: [[40, 57], [44, 62]], bl: [[30, 59], [26, 62]], fa: [[30, 39], [26, 37]], ba: [[25, 41], [22, 44]], ang: 184, len: 32, cape: [24, 50] }, 'io'),
    // 타격: 도약하듯 크게 내디디며 머리 위를 지나 앞으로 크게 가른다
    K(0.14, { t: [42, 33], lean: 7, ...LUNGE2, fa: [[58, 36], [67, 35]], ba: [[38, 41], [31, 43]], ang: 360, len: 32, cape: [4, 55] }, 'in', true),
    K(0.23, { t: [43, 34], lean: 6, fl: [[59, 56], [66, 62]], bl: [[43, 57], [27, 62]], fa: [[60, 38], [68, 41]], ba: [[39, 42], [32, 45]], ang: 370, len: 32, cape: [7, 57] }, 'out'),
    K(0.33, { t: [38, 34], lean: 3, ...MID, fa: [[56, 41], [62, 46]], ba: [[34, 44], [30, 47]], ang: 386, cape: [10, 58] }, 'io'),
  ],
  0.42,
);

// ───────── 5단: 돌며 세 번, 마지막은 관통 (0.6초, 타격 0.10 · 0.23 · 0.38초) ─────────
const COMBO5 = buildFrames(
  [
    K(0, { t: [32, 35], lean: -4, ...BACK, fa: [[36, 40], [33, 36]], ba: [[27, 41], [24, 44]], ang: 198, len: 32, cape: [14, 52] }),
    K(0.05, { t: [31, 35], lean: -5, ...BACK, fa: [[35, 39], [31, 35]], ba: [[26, 42], [23, 45]], ang: 190, len: 32, cape: [16, 51] }, 'io'),
    // 첫 타: 앞으로 가로
    K(0.095, { t: [39, 33], lean: 5, ...LUNGE, fa: [[58, 37], [65, 36]], ba: [[34, 42], [29, 44]], ang: 364, len: 32, cape: [5, 54] }, 'in', true),
    // 몸을 돌려 머리 위로 크게 칼을 돌린다 (망토가 앞으로 쏠린다)
    K(0.17, { t: [37, 34], lean: -1, fl: [[50, 55], [54, 62]], bl: [[38, 57], [27, 62]], fa: [[34, 31], [30, 26]], ba: [[45, 39], [50, 36]], ang: 610, cape: [66, 52, 6] }, 'io', true),
    // 둘째 타
    K(0.205, { t: [39, 33], lean: 5, ...LUNGE, fa: [[59, 36], [66, 33]], ba: [[34, 42], [29, 45]], ang: 712, len: 32, cape: [5, 52] }, 'in', true),
    // 한 번 더 뒤로 돌려 아래에서 쓸어 올린다
    K(0.3, { t: [37, 34], lean: -1, fl: [[50, 55], [54, 62]], bl: [[38, 57], [27, 62]], fa: [[32, 36], [27, 36]], ba: [[45, 40], [50, 38]], ang: 903, cape: [64, 54, 6] }, 'io', true),
    // 셋째 타: 가장 크게 내디디며
    K(0.365, { t: [41, 33], lean: 7, ...LUNGE2, fa: [[60, 37], [68, 38]], ba: [[38, 43], [32, 46]], ang: 1088, len: 34, cape: [4, 56] }, 'in', true),
    // 관통: 칼을 곧게 뻗은 채 버틴다
    K(0.45, { t: [42, 34], lean: 7, ...LUNGE2, fa: [[62, 38], [70, 38]], ba: [[39, 44], [32, 47]], ang: 1080, len: 24, cape: [5, 56] }, 'out'),
    K(0.55, { t: [38, 34], lean: 3, ...MID, fa: [[56, 41], [62, 45]], ba: [[34, 44], [30, 47]], ang: 1102, cape: [10, 57] }, 'io'),
  ],
  0.6,
);

/** 단마다 1/60초 간격의 칸 */
export const COMBOS: SwordPose[][] = [COMBO1, COMBO2, COMBO3, COMBO4, COMBO5];

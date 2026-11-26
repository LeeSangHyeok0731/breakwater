// 검사 평타 동작. 좌표는 96×64 칸 안의 픽셀(발바닥 y=62, 몸통 기준 x≈40)이고 처음엔 오른쪽을 본다.
//
// 포즈를 칸마다 따로 찍으면 발과 칼이 튄다. 그래서 핵심 포즈(키)만 정하고, 그 사이를 1/60초마다 자동으로 이어 붙인다
// (`buildFrames`). 몸의 방향(yaw)·발·손·칼 방향만 정하면 어깨·골반·팔꿈치·무릎·망토·칼 잔상은 여기서 계산한다.
//
//   yaw   0 = 오른쪽을 봄(옆모습), 90 = 정면(화면 쪽), 180 = 왼쪽을 봄, 270(= -90) = 등. 늘어나는 쪽이 오른쪽으로 도는 것.
//   칼   az 0 = 오른쪽, 90 = 화면 쪽, 180 = 왼쪽, 270 = 화면 안쪽 (위에서 내려다본 방향). el = 올려다본 각도.
//        az 0에서 el만 바꾸면 화면 안에서 도는 칼이다 (el 90 = 위, 180 = 왼쪽, 270 = 아래).

import type { View } from './stamps';

export type Pt = [number, number];

/** 칼 잔상의 한 조각: 칼날 안쪽 점(a), 칼끝(b), 얼마나 새것인가(k: 0 오래됨 → 1 방금) */
export interface Seg {
  a: Pt;
  b: Pt;
  k: number;
}

/** 그릴 준비가 끝난 포즈 */
export interface SwordPose {
  view: View;
  headView: View;
  /** 가슴 윗면 가운데 */
  cx: number;
  cy: number;
  /** 가슴을 앞으로 기울이는 정도 (픽셀, 보는 쪽이 +) */
  shear: number;
  headD: Pt;
  sin: number;
  cos: number;
  rs: Pt;
  ls: Pt;
  rEl: Pt;
  lEl: Pt;
  rh: Pt;
  lh: Pt;
  rHip: Pt;
  lHip: Pt;
  rKnee: Pt;
  lKnee: Pt;
  rFoot: Pt;
  lFoot: Pt;
  /** 칼날 [손잡이 끝, 칼끝]과 깊이 (+면 화면 쪽, 몸 앞) */
  blade: [Pt, Pt];
  bladeZ: number;
  /** 빠르게 휘두를 때 칼날 가운데가 칼끝 반대쪽으로 휘는 정도 (픽셀) */
  bladeBend: Pt;
  capeTip: Pt;
  smear?: Seg[];
}

/** 키 하나에 적는 포즈 */
interface P {
  /** 가슴 윗면 가운데 */
  c: Pt;
  yaw: number;
  /** 머리가 보는 방향 (없으면 몸과 같다). 몸이 돌아도 시선은 앞에 둘 때 쓴다. */
  hy?: number;
  lean?: number;
  rf: Pt;
  lf: Pt;
  /** 칼 든 손(오른손) */
  rh: Pt;
  /** 왼손 (없으면 몸 옆에 늘어뜨린다) */
  lh?: Pt;
  az: number;
  el: number;
  len?: number;
  hipDy?: number;
}

type Full = Required<Omit<P, 'lh'>> & { lh?: Pt };

function full(p: P): Full {
  return { ...p, hy: p.hy ?? p.yaw, lean: p.lean ?? 0, len: p.len ?? 30, hipDy: p.hipDy ?? 0 };
}

const RAD = Math.PI / 180;

function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

export function viewOf(yaw: number): View {
  const a = norm360(yaw);
  if (a < 50 || a >= 310) return 'R';
  if (a < 130) return 'F';
  if (a < 230) return 'L';
  return 'B';
}

/** 뼈 두 마디(길이 l씩)로 이은 관절 위치. side가 1이면 pref 방향 쪽으로 꺾는다. */
function bend(a: Pt, b: Pt, l: number, prefer: (nx: number, ny: number) => number, scale = 1): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (d < 0.01 || d >= 2 * l - 0.01) return mid;
  const h = Math.sqrt(l * l - (d / 2) * (d / 2)) * scale;
  const nx = -dy / d;
  const ny = dx / d;
  const s = prefer(nx, ny) >= 0 ? 1 : -1;
  return [mid[0] + nx * h * s, mid[1] + ny * h * s];
}

/** 오른·왼 어깨 위치 */
function shouldersOf(p: Full): [Pt, Pt] {
  const r = p.yaw * RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [p.c[0] + 3.5 * cos - 5 * sin, p.c[1] + 5],
    [p.c[0] - 2.5 * cos + 5 * sin, p.c[1] + 6],
  ];
}

function pose(p: Full, capeTip: Pt, smear: Seg[] | undefined, headD: Pt, bladeBend: Pt): SwordPose {
  const r = p.yaw * RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const [cx, cy] = p.c;
  const rs: Pt = [cx + 3.5 * cos - 5 * sin, cy + 5];
  const ls: Pt = [cx - 2.5 * cos + 5 * sin, cy + 6];
  const lh: Pt = p.lh ?? [ls[0] - 3 * cos, ls[1] + 11];
  const face = cos >= 0 ? 1 : -1;
  // 팔꿈치: 아래쪽(몸 뒤쪽)으로 꺾는다
  const armPref = (_nx: number, ny: number): number => ny + 0.001;
  const hipX = cx + 1;
  const hipY = cy + 16 + p.hipDy;
  const rHip: Pt = [hipX + 1.5 * cos - 3.5 * sin, hipY];
  const lHip: Pt = [hipX - 1.5 * cos + 3.5 * sin, hipY];
  // 무릎: 보는 쪽으로 꺾는다. 정면·등에서는 덜 꺾인다.
  const kneeScale = 0.4 + 0.6 * Math.abs(cos);
  const legPref = (nx: number, _ny: number): number => nx * face;
  const el = p.el * RAD;
  const az = p.az * RAD;
  const vx = p.len * Math.cos(el) * Math.cos(az);
  // 화면 쪽으로 나온 칼끝은 살짝 아래로 보인다 (원근). 가로로 돌리는 칼이 납작한 타원 호를 그린다.
  const vy = -p.len * Math.sin(el) + p.len * Math.cos(el) * Math.sin(az) * 0.28;
  const screen = Math.hypot(vx, vy) || 1;
  const bx = p.rh[0] - (vx / screen) * 3;
  const by = p.rh[1] - (vy / screen) * 3;
  return {
    view: viewOf(p.yaw),
    headView: viewOf(p.hy),
    cx,
    cy,
    shear: p.lean * cos,
    headD,
    sin,
    cos,
    rs,
    ls,
    rEl: bend(rs, p.rh, 11, armPref),
    lEl: bend(ls, lh, 11, armPref),
    rh: p.rh,
    lh,
    rHip,
    lHip,
    rKnee: bend(rHip, p.rf, 9, legPref, kneeScale),
    lKnee: bend(lHip, p.lf, 9, legPref, kneeScale),
    rFoot: p.rf,
    lFoot: p.lf,
    blade: [
      [bx, by],
      [p.rh[0] + vx, p.rh[1] + vy],
    ],
    bladeZ: Math.cos(el) * Math.sin(az),
    bladeBend,
    capeTip,
    smear,
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
  p: Full;
  ease?: Ease;
  swing?: boolean;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const lerpPt = (p: Pt, q: Pt, u: number): Pt => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];

/** 발: 멀리 옮겨 가면 들어 올렸다 내딛는다. 가만히 있는 발은 그대로 박혀 있다. */
function lerpFoot(p: Pt, q: Pt, u: number): Pt {
  const f = lerpPt(p, q, u);
  const travel = Math.abs(q[0] - p[0]);
  if (travel > 5) f[1] -= 5 * Math.sin(Math.PI * u) * Math.min(1, travel / 14);
  return f;
}

function lerpP(a: Full, b: Full, u: number): Full {
  const lh = a.lh && b.lh ? lerpPt(a.lh, b.lh, u) : undefined;
  return {
    c: lerpPt(a.c, b.c, u),
    yaw: lerp(a.yaw, b.yaw, u),
    hy: lerp(a.hy, b.hy, u),
    lean: lerp(a.lean, b.lean, u),
    rf: lerpFoot(a.rf, b.rf, u),
    lf: lerpFoot(a.lf, b.lf, u),
    rh: lerpPt(a.rh, b.rh, u),
    lh,
    az: lerp(a.az, b.az, u),
    el: lerp(a.el, b.el, u),
    len: lerp(a.len, b.len, u),
    hipDy: lerp(a.hipDy, b.hipDy, u),
  };
}

/** 이 포즈에서 칼날 안쪽 점과 칼끝 (잔상·휨 계산용) */
function bladeSeg(p: Full): [Pt, Pt] {
  const el = p.el * RAD;
  const az = p.az * RAD;
  const vx = p.len * Math.cos(el) * Math.cos(az);
  const vy = -p.len * Math.sin(el) + p.len * Math.cos(el) * Math.sin(az) * 0.28;
  return [
    [p.rh[0] + vx * 0.62, p.rh[1] + vy * 0.62],
    [p.rh[0] + vx, p.rh[1] + vy],
  ];
}

/** 키들이 정한 t초의 목표 포즈 */
function evalAt(keys: KeySpec[], t: number): Full {
  let k = 0;
  while (k + 1 < keys.length && keys[k + 1].at <= t) k++;
  const a = keys[k];
  const b = keys[k + 1];
  if (!b) return a.p;
  const u = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
  return lerpP(a.p, b.p, EASE[b.ease ?? 'io'](u));
}

// ───────── 이차 운동: 스프링 ─────────
// 목표를 그대로 따라가면 기계 같다. 칼은 손목이 꺾여 한 박자 늦게 따라오다 목표를 살짝 넘었다가 돌아오고,
// 왼팔은 오른팔의 반대로 출렁이고, 머리는 몸이 움직인 반대쪽으로 살짝 밀린다.

/** 한 프레임의 칼 상태 (잔상을 부드러운 호로 잇는 데 쓴다) */
interface BladeState {
  rh: Pt;
  az: number;
  el: number;
  len: number;
}

const segOfState = (h: BladeState): [Pt, Pt] => bladeSeg(h as unknown as Full);

interface Spring {
  x: number;
  v: number;
}

function stepSpring(s: Spring, target: number, w: number, z: number, dt: number): number {
  const sub = 4;
  const h = dt / sub;
  for (let i = 0; i < sub; i++) {
    s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 칼 목표를 미리 보는 시간: 스프링이 늦게 따라오는 만큼 앞당겨 타격 시점에 칼이 제자리에 있게 한다 */
const BLADE_LEAD = 0.03;

/** 키들을 1/60초마다 한 칸씩 이어 붙인다. 칸 i는 동작이 시작하고 i/60초 뒤의 모습이다. */
function buildFrames(keys: KeySpec[], dur: number): SwordPose[] {
  const n = Math.ceil(dur * FPS) + 1;
  const dt = 1 / FPS;
  const out: SwordPose[] = [];
  const capeTarget = (p: Full): Pt => [p.c[0] - 25 * Math.cos(p.yaw * RAD), p.c[1] + 21 + 3 * Math.abs(Math.sin(p.yaw * RAD))];
  const first = evalAt(keys, 0);
  let cape = capeTarget(first);
  // 상태: 칼 방향, 왼손, 머리
  const az: Spring = { x: first.az, v: 0 };
  const el: Spring = { x: first.el, v: 0 };
  const lhx: Spring = { x: 0, v: 0 };
  const lhy: Spring = { x: 0, v: 0 };
  const hx: Spring = { x: 0, v: 0 };
  const hy: Spring = { x: 0, v: 0 };
  let init = false;
  let prevC: Pt = first.c;
  let prevTip: Pt | null = null;
  const hist: BladeState[] = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const cur = evalAt(keys, t);
    const lead = evalAt(keys, t + BLADE_LEAD);
    const [rs, ls] = shouldersOf(cur);
    const cos = Math.cos(cur.yaw * RAD);
    // 왼손 목표: 키가 정했으면 그것, 아니면 오른손의 반대로 출렁이는 자리
    const rx = cur.rh[0] - rs[0];
    const ry = cur.rh[1] - rs[1];
    const lt: Pt = cur.lh ?? [ls[0] - 3 * cos - 0.28 * rx, ls[1] + 11 - 0.18 * ry];
    if (!init) {
      lhx.x = lt[0];
      lhy.x = lt[1];
      init = true;
    }
    const lx = stepSpring(lhx, lt[0], 15, 0.45, dt);
    const ly = stepSpring(lhy, lt[1], 15, 0.45, dt);
    // 머리: 몸이 빠르게 움직인 반대쪽으로 살짝 밀렸다가 돌아온다
    const vcx = (cur.c[0] - prevC[0]) / dt;
    const vcy = (cur.c[1] - prevC[1]) / dt;
    prevC = cur.c;
    const hdx = stepSpring(hx, clamp(-vcx * 0.012, -2.5, 2.5), 20, 0.5, dt);
    const hdy = stepSpring(hy, clamp(-vcy * 0.012, -2, 2), 20, 0.5, dt);
    // 칼: 손목이 꺾여 늦게 따라오다 목표를 살짝 넘었다 돌아온다
    const baz = stepSpring(az, lead.az, 52, 0.55, dt);
    const bel = stepSpring(el, lead.el, 52, 0.55, dt);
    const final: Full = { ...cur, az: baz, el: bel, lh: [lx, ly] };
    // 칼끝 속도 → 휨, 지나간 자리 → 잔상
    const state: BladeState = { rh: final.rh, az: final.az, el: final.el, len: final.len };
    const tip = segOfState(state)[1];
    const vtx = prevTip ? tip[0] - prevTip[0] : 0;
    const vty = prevTip ? tip[1] - prevTip[1] : 0;
    prevTip = tip;
    const bl = Math.hypot(vtx, vty) || 1;
    const bendLen = Math.min(5, Math.hypot(vtx, vty) * 0.3);
    const bladeBend: Pt = [(-vtx / bl) * bendLen, (-vty / bl) * bendLen];
    hist.push(state);
    if (hist.length > 7) hist.shift();
    // 잔상: 지금 빠르게 움직이고 있을 때만, 빠르게 움직인 직전 몇 프레임을 이어 붙인다.
    // 프레임 사이가 멀면 각도를 나눠 호를 부드럽게 잇는다.
    let smear: Seg[] | undefined;
    const moved = (j: number): number => {
      const p0 = segOfState(hist[j - 1])[1];
      const p1 = segOfState(hist[j])[1];
      return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    };
    if (hist.length > 1 && moved(hist.length - 1) > 3.5) {
      let j0 = hist.length - 1;
      while (j0 > 1 && moved(j0 - 1) > 2.5) j0--;
      j0 = Math.max(0, j0 - 1);
      const raw: Seg[] = [];
      for (let j = j0; j < hist.length - 1; j++) {
        const A = hist[j];
        const B = hist[j + 1];
        const m = clamp(Math.ceil(Math.max(Math.abs(B.az - A.az), Math.abs(B.el - A.el)) / 9), 1, 12);
        for (let q = 0; q < m; q++) {
          const u = q / m;
          const [sa, sb] = segOfState({ rh: lerpPt(A.rh, B.rh, u), az: lerp(A.az, B.az, u), el: lerp(A.el, B.el, u), len: lerp(A.len, B.len, u) });
          raw.push({ a: sa, b: sb, k: 0 });
        }
      }
      const [la, lb] = segOfState(hist[hist.length - 1]);
      raw.push({ a: la, b: lb, k: 0 });
      smear = raw.map((sg, q) => ({ ...sg, k: q / Math.max(1, raw.length - 1) }));
    }
    const tg = capeTarget(cur);
    cape = [lerp(cape[0], tg[0], 0.22), lerp(cape[1], tg[1], 0.22)];
    out.push(pose(final, cape, smear, [hdx, hdy], bladeBend));
  }
  return out;
}

const K = (at: number, p: P, ease?: Ease, swing?: boolean): KeySpec => ({ at, p: full(p), ease, swing });

// 흐름: 젖힌다(천천히) → 휘두른다(점점 빨라져 타격에서 멈춘다) → 여운 → 다음 동작의 시작 자세로 이어진다.
// 뒤 동작의 첫 키는 앞 동작의 마지막 키와 같은 자세라서, 이어 치면 끊김 없이 이어진다.

/** 한 단의 [동작 시간, 타격 시점들] — 포즈의 타격 칸과 맞춰 있다. 도의 평타는 이 표를 쓰지 않는다. */
export const SWORD_TIMING: [number, number[]][] = [
  [0.46, [0.21]],
  [0.6, [0.3]],
  [0.62, [0.27, 0.4]],
  [0.86, [0.32, 0.66]],
  [1.0, [0.26, 0.4, 0.62, 0.8]],
];

// 각 단이 끝나는 자세 (다음 단의 시작과 같다)
const C1: P = { c: [44, 36], yaw: -20, lean: 2, rf: [41, 62], lf: [56, 62], rh: [57, 43], az: -35, el: -25 };
const C2: P = { c: [47, 40], yaw: -85, rf: [52, 62], lf: [43, 62], rh: [41, 43], az: 0, el: 232 };
const C3: P = { c: [52, 37], yaw: 0, rf: [46, 62], lf: [60, 62], rh: [62, 41], az: 0, el: -8, len: 32 };
const C4: P = { c: [53, 39], yaw: 0, lean: 5, rf: [63, 62], lf: [48, 62], rh: [62, 43], az: 0, el: -40, len: 32 };

// ───────── 1타: 왼발을 내디디며 왼쪽에서 오른쪽으로 수평 가로베기 ─────────
const COMBO1 = buildFrames(
  [
    K(0, { c: [38, 35], yaw: 12, rf: [43, 62], lf: [33, 62], rh: [46, 41], az: 0, el: -25 }),
    // 오른팔을 뒤로 감는다: 가슴이 살짝 정면으로 돌지만 시선은 앞에 둔다
    K(0.12, { c: [36, 36], yaw: 60, hy: 10, lean: -2, rf: [42, 62], lf: [32, 62], rh: [30, 39], az: 165, el: 5 }, 'io'),
    // 타격: 왼발이 앞으로 나가며 칼이 몸 앞을 가로질러 오른쪽으로
    K(0.21, { c: [44, 37], yaw: -25, lean: 4, rf: [41, 62], lf: [56, 62], rh: [58, 41], az: -20, el: -8, len: 32 }, 'in', true),
    K(0.32, { c: [45, 37], yaw: -28, lean: 4, rf: [41, 62], lf: [56, 62], rh: [60, 43], az: -32, el: -14, len: 32 }, 'out'),
    K(0.46, C1, 'io'),
  ],
  0.46,
);

// ───────── 2타: 오른발을 교차해 내디디며 돌아서 (등이 보인다), 검을 수평으로 올렸다가 왼쪽 아래로 내려베기 ─────────
const COMBO2 = buildFrames(
  [
    K(0, C1),
    // 몸이 왼쪽으로 돌며 오른발이 앞으로 나간다. 검은 지면과 수평인 채 오른쪽 위로 올라간다.
    K(0.17, { c: [47, 38], yaw: -85, rf: [52, 62], lf: [43, 62], rh: [58, 28], az: 0, el: 0 }, 'io'),
    // 검이 위로 선다
    K(0.23, { c: [47, 39], yaw: -88, rf: [52, 62], lf: [43, 62], rh: [55, 24], az: 0, el: 90 }, 'io'),
    // 타격: 왼쪽 아래로 내려벤다
    K(0.3, { c: [47, 40], yaw: -85, rf: [52, 62], lf: [43, 62], rh: [42, 41], az: 0, el: 232 }, 'in', true),
    K(0.44, { c: [47, 40], yaw: -85, rf: [52, 62], lf: [43, 62], rh: [41, 43], az: 0, el: 232 }, 'out'),
    K(0.6, C2, 'io'),
  ],
  0.6,
);

// ───────── 3타: 왼쪽 아래의 검을 오른쪽으로 돌리며, 왼발을 앞으로 내딛고 한 바퀴 돌며 수평으로 베기 ─────────
const COMBO3 = buildFrames(
  [
    // 2타가 끝난 자세 (같은 칼 방향을 가로 표현으로 바꿔 쓴다)
    K(0, { ...C2, az: 180, el: -52 }),
    // 검을 왼쪽으로 수평하게 펴며 몸을 더 감는다
    K(0.1, { c: [46, 40], yaw: -105, rf: [52, 62], lf: [43, 62], rh: [38, 40], az: 180, el: -5 }, 'io'),
    // 오른쪽으로 한 바퀴 이상 돌며 휘두른다. 칼은 몸보다 늦게 따라 돈다. 왼발이 앞으로 나간다.
    K(0.46, { c: [52, 37], yaw: 360, rf: [46, 62], lf: [60, 62], rh: [62, 40], az: 720, el: -3, len: 32 }, 'io', true),
    K(0.62, { c: [53, 37], yaw: 360, rf: [46, 62], lf: [60, 62], rh: [63, 41], az: 720, el: -8, len: 32 }, 'out'),
  ],
  0.62,
);

// ───────── 4타: 오른발을 내딛고 돌아서 왼쪽 아래로 내려베고, 검을 수직으로 올려 등 뒤에서 넘겨 오른쪽으로 내려베기 ─────────
const COMBO4 = buildFrames(
  [
    K(0, { ...C3, az: 0 }),
    K(0.2, { c: [50, 38], yaw: -85, rf: [56, 62], lf: [46, 62], rh: [61, 28], az: 0, el: 0 }, 'io'),
    K(0.26, { c: [50, 39], yaw: -88, rf: [56, 62], lf: [46, 62], rh: [58, 24], az: 0, el: 90 }, 'io'),
    // 첫 타: 왼쪽 아래로
    K(0.32, { c: [50, 40], yaw: -85, rf: [56, 62], lf: [46, 62], rh: [45, 41], az: 0, el: 232 }, 'in', true),
    K(0.44, { c: [50, 40], yaw: -85, rf: [56, 62], lf: [46, 62], rh: [44, 43], az: 0, el: 232 }, 'io'),
    // 검을 수직으로 들어 올린다
    K(0.52, { c: [50, 38], yaw: -85, rf: [56, 62], lf: [46, 62], rh: [48, 26], az: 0, el: 90 }, 'io'),
    // 등 뒤로 넘긴다
    K(0.58, { c: [49, 38], yaw: -60, rf: [56, 62], lf: [46, 62], rh: [44, 24], az: 0, el: 150 }, 'io'),
    // 둘째 타: 몸이 앞을 향하며 오른발을 크게 내딛고 오른쪽으로 내려벤다
    K(0.66, { c: [52, 38], yaw: 0, lean: 5, rf: [62, 62], lf: [48, 62], rh: [60, 40], az: 0, el: -35, len: 32 }, 'in', true),
    K(0.86, C4, 'out'),
  ],
  0.86,
);

// ───────── 5타: 바로 서서 오른쪽·왼쪽으로 검을 돌리고, 왼발을 빼며 수평으로 베고, 오른발을 내딛으며 찌르기 ─────────
const COMBO5 = buildFrames(
  [
    K(0, C4),
    // 바로 선다
    K(0.16, { c: [44, 35], yaw: 0, rf: [49, 62], lf: [40, 62], rh: [48, 36], az: 0, el: 85 }, 'io'),
    // 오른쪽에서 한 바퀴
    K(0.3, { c: [44, 35], yaw: 0, rf: [49, 62], lf: [40, 62], rh: [53, 35], az: 0, el: -275 }, 'io', true),
    // 왼쪽에서 한 바퀴
    K(0.44, { c: [44, 35], yaw: 0, rf: [49, 62], lf: [40, 62], rh: [36, 36], az: 0, el: -635 }, 'io', true),
    // 왼발을 빼며 칼을 왼쪽으로 수평하게 펴고, 가슴은 정면으로 돌되 시선은 앞에 둔다
    K(0.5, { c: [43, 36], yaw: 70, hy: 0, lean: -2, rf: [41, 62], lf: [48, 62], rh: [30, 40], az: 0, el: -540 }, 'io'),
    K(0.51, { c: [43, 36], yaw: 70, hy: 0, lean: -2, rf: [41, 62], lf: [48, 62], rh: [30, 40], az: 180, el: 0 }),
    // 타격: 왼쪽에서 오른쪽으로 수평하게
    K(0.62, { c: [46, 37], yaw: -10, hy: 0, lean: 3, rf: [40, 62], lf: [56, 62], rh: [56, 40], az: -15, el: -3, len: 32 }, 'in', true),
    // 칼을 허리로 당겼다가
    K(0.72, { c: [44, 37], yaw: 20, hy: 0, rf: [41, 62], lf: [55, 62], rh: [42, 42], az: 0, el: 3 }, 'io'),
    // 오른발을 내딛으며 찌른다
    K(0.8, { c: [52, 38], yaw: -8, lean: 5, rf: [66, 62], lf: [48, 62], rh: [62, 40], az: 0, el: 0, len: 34 }, 'in'),
    K(0.92, { c: [53, 38], yaw: -8, lean: 5, rf: [66, 62], lf: [48, 62], rh: [63, 40], az: 0, el: 0, len: 34 }, 'out'),
    K(1.0, { c: [40, 35], yaw: 10, rf: [44, 62], lf: [34, 62], rh: [47, 41], az: 0, el: -25 }, 'io'),
  ],
  1.0,
);

/** 단마다 1/60초 간격의 칸 */
export const COMBOS: SwordPose[][] = [COMBO1, COMBO2, COMBO3, COMBO4, COMBO5];

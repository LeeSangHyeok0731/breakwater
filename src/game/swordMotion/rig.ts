import { blit, line, newBuf, polySpans, px, rect, thick, type Buf } from './pixels';
import type { Pt, Seg, SwordPose } from './poses';
import type { Stamps } from './stamps';

export const FRAME_W = 96;
export const FRAME_H = 64;

// 원본 기사에서 가져온 색
const DARK = 0x130a1b;
const SUIT_HI = 0x573b60;
const CAPE_HI = 0xed053e;
const CAPE_LO = 0x810936;
const GOLD = [0xffcc61, 0xbc6c17, 0x983e1d];
const GLOVE = [0xbc6c17, 0x983e1d, 0x671915];
const BLADE_EDGE = 0xffd9b9;
const BLADE = 0xaf9785;
const GRIP = 0x671915;

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

/** 옆모습의 망토: 어깨에서 끝까지 위·아래 가장자리를 둥글게 이어 만든다. 아래 가장자리는 들쭉날쭉하다. */
function capeSide(p: SwordPose): Pt[] {
  const s = p.cos >= 0 ? 1 : -1;
  const A: Pt = [Math.round(p.cx - 5 * s), Math.round(p.cy - 2)];
  const B: Pt = [Math.round(p.cx + 2 * s), Math.round(p.cy - 1)];
  const H: Pt = [Math.round(p.cx + 1 * s), Math.round(p.cy + 17)];
  const tip: Pt = [Math.round(p.capeTip[0]), Math.round(p.capeTip[1])];
  const sag = 5;
  const up = curve(A, [(A[0] + tip[0]) / 2, (A[1] + tip[1]) / 2 - sag], tip, 5);
  const low = curve(tip, [(tip[0] + H[0]) / 2, (tip[1] + H[1]) / 2 + sag + 4], H, 6).map((q, i): Pt => [q[0], q[1] + (i % 2 === 0 ? 1 : -1)]);
  return [B, A, ...up, tip, ...low, H];
}

/** 앞이나 등에서 본 망토: 어깨에서 무릎 아래까지 늘어진 사다리꼴. 몸이 움직인 쪽의 반대로 끝이 쏠린다. */
function capeFlat(p: SwordPose): Pt[] {
  const left = Math.min(p.rs[0], p.ls[0]) - 2;
  const right = Math.max(p.rs[0], p.ls[0]) + 2;
  const sway = Math.max(-7, Math.min(7, (p.capeTip[0] - (p.cx - 25 * p.cos)) * 0.25));
  const hy = Math.round(p.cy + 18 + Math.max(-3, Math.min(4, (p.capeTip[1] - (p.cy + 21)) * 0.3)));
  const hl = left - 3 + sway;
  const hr = right + 3 + sway;
  const top = Math.round(p.cy - 1);
  const pts: Pt[] = [
    [left, top],
    [right, top],
    [right + 2, Math.round(p.cy + 10)],
    [Math.round(hr), hy - 1],
  ];
  const n = 6;
  for (let i = 0; i <= n; i++) pts.push([Math.round(hr - ((hr - hl) * i) / n), hy + (i % 2 === 0 ? 2 : 0)]);
  pts.push([Math.round(hl), hy - 1], [left - 2, Math.round(p.cy + 10)]);
  return pts;
}

function drawCape(b: Buf, pts: Pt[]): void {
  const spans = polySpans(pts, b.h);
  const inside = (x: number, y: number): boolean => (spans.get(y) ?? []).some(([a, c]) => x >= a && x <= c);
  for (const [y, row] of spans) {
    for (const [a, c] of row) {
      for (let x = a; x <= c; x++) {
        // 위쪽 가장자리와 바깥 가장자리는 밝은 붉은색, 안쪽은 어두운 자주색
        const rim = !inside(x, y - 1) || !inside(x, y - 2) || x === a || x === c || !inside(x - 2, y);
        px(b, x, y, rim ? CAPE_HI : CAPE_LO);
      }
    }
  }
}

function drawArm(b: Buf, shoulder: Pt, elbow: Pt, hand: Pt, near: boolean): void {
  // 소매: 어깨 쪽은 보랏빛 윗면, 팔뚝은 어둡게
  thick(b, shoulder[0], shoulder[1], elbow[0], elbow[1], 4, (i, n) => (i < n * 0.3 ? SUIT_HI : DARK), 4);
  thick(b, elbow[0], elbow[1], hand[0], hand[1], 4, DARK, 3);
  // 손목 금장 보호대
  const t = 0.78;
  const gx = elbow[0] + (hand[0] - elbow[0]) * t;
  const gy = elbow[1] + (hand[1] - elbow[1]) * t;
  thick(b, gx, gy, hand[0], hand[1], 3, (i) => (i === 0 ? GOLD[0] : GOLD[1]), 3);
  // 장갑
  rect(b, Math.round(hand[0]) - 1, Math.round(hand[1]) - 1, Math.round(hand[0]) + 2, Math.round(hand[1]) + 1, near ? GLOVE[0] : GLOVE[1]);
  px(b, hand[0] + 2, hand[1] + 1, GLOVE[2]);
  px(b, hand[0] - 1, hand[1] + 1, GLOVE[2]);
}

function drawLeg(b: Buf, hip: Pt, knee: Pt, foot: Pt, near: boolean, toe: number): void {
  // 허벅지는 굵고 위쪽에 보랏빛 면, 정강이는 장화
  thick(b, hip[0], hip[1], knee[0], knee[1], 6, (i, n) => (i < n * 0.35 ? SUIT_HI : DARK), 5);
  thick(b, knee[0], knee[1], foot[0], foot[1] - 2, 5, (i, n) => (i < n * 0.25 ? GOLD[1] : GLOVE[1]), 4);
  // 무릎 금장
  rect(b, Math.round(knee[0]) - 1, Math.round(knee[1]) - 2, Math.round(knee[0]) + 1, Math.round(knee[1]) - 1, GOLD[0]);
  px(b, knee[0] + 2 * toe, knee[1] - 1, GOLD[1]);
  // 발목 금장 두름과 발끝이 보는 쪽으로 뻗은 장화
  const fx = Math.round(foot[0]);
  const fy = Math.round(foot[1]);
  const x0 = toe >= 0 ? fx - 3 : fx - 4;
  const x1 = toe >= 0 ? fx + 4 : fx + 3;
  rect(b, x0, fy - 2, x1, fy, GLOVE[1]);
  rect(b, x0, fy - 2, x1 - 1, fy - 2, near ? GLOVE[0] : GLOVE[1]);
  rect(b, x0, fy, x1, fy, GLOVE[2]);
  rect(b, fx - 2, fy - 3, fx + 1, fy - 3, GOLD[0]);
  px(b, toe >= 0 ? x1 : x0, fy - 1, GLOVE[2]);
}

function bezier(base: Pt, ctrl: Pt, tip: Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([(1 - u) * (1 - u) * base[0] + 2 * u * (1 - u) * ctrl[0] + u * u * tip[0], (1 - u) * (1 - u) * base[1] + 2 * u * (1 - u) * ctrl[1] + u * u * tip[1]]);
  }
  return pts;
}

function polyline(b: Buf, pts: Pt[], dx: number, dy: number, color: number): void {
  for (let i = 0; i + 1 < pts.length; i++) line(b, pts[i][0] + dx, pts[i][1] + dy, pts[i + 1][0] + dx, pts[i + 1][1] + dy, color);
}

/** 칼: 빠르게 휘두를 때는 칼끝 반대쪽으로 살짝 휜다 */
function drawBlade(b: Buf, base: Pt, tip: Pt, bend: Pt): void {
  const [bx, by] = base;
  const [tx, ty] = tip;
  const ctrl: Pt = [(bx + tx) / 2 + bend[0] * 2, (by + ty) / 2 + bend[1] * 2];
  const n = Math.max(4, Math.round(Math.hypot(tx - bx, ty - by) / 3));
  const pts = bezier(base, ctrl, tip, n);
  const g = Math.max(1, Math.round(n * 0.16));
  // 손잡이(뒤쪽)와 칼날
  polyline(b, pts.slice(0, g + 1), 0, 0, GRIP);
  const blade = pts.slice(g);
  polyline(b, blade, 0, -1, BLADE_EDGE);
  polyline(b, blade, 0, 0, BLADE);
  polyline(b, blade.slice(0, Math.max(2, Math.round(blade.length * 0.75))), 0, 1, 0x87725f);
  // 날밑
  const [gx, gy] = pts[g];
  const nx = -(ty - by);
  const ny = tx - bx;
  const len = Math.hypot(nx, ny) || 1;
  px(b, gx + (nx / len) * 2, gy + (ny / len) * 2, GOLD[1]);
  px(b, gx - (nx / len) * 2, gy - (ny / len) * 2, GOLD[1]);
  px(b, gx, gy, GOLD[0]);
}

/**
 * 칼이 지나간 자리: 칼날 한 조각(안쪽 점~칼끝)이 시간순으로 이어진 띠. 꼬리(오래된 쪽)는 성기고 얇다.
 * 칼끝 쪽은 크림색, 안쪽으로 갈수록 회색.
 */
function drawSmear(b: Buf, segs: Seg[]): void {
  for (let i = 0; i + 1 < segs.length; i++) {
    const s0 = segs[i];
    const s1 = segs[i + 1];
    for (let r = 0; r <= 1.001; r += 0.05) {
      // 꼬리 쪽은 안쪽을 비워 가늘게 만든다
      if (r < (1 - s0.k) * 0.55) continue;
      // 꼬리 쪽은 성기게
      if (s0.k < 0.45 && (Math.round(r * 20) + i) % 3 !== 0) continue;
      const a0: Pt = [s0.a[0] + (s0.b[0] - s0.a[0]) * r, s0.a[1] + (s0.b[1] - s0.a[1]) * r];
      const a1: Pt = [s1.a[0] + (s1.b[0] - s1.a[0]) * r, s1.a[1] + (s1.b[1] - s1.a[1]) * r];
      line(b, a0[0], a0[1], a1[0], a1[1], r > 0.66 ? BLADE_EDGE : r > 0.3 ? 0xd9bfa6 : BLADE);
    }
  }
}

/** 포즈 하나를 96×64 칸에 그린다. 화면 쪽(깊이 z가 큰 것)이 나중에 그려진다. */
export function drawPose(p: SwordPose, s: Stamps): Buf {
  const b = newBuf(FRAME_W, FRAME_H);
  const items: { z: number; draw: () => void }[] = [];
  const add = (z: number, draw: () => void): void => {
    items.push({ z, draw });
  };
  const sideView = Math.abs(p.sin) < 0.55;
  const capeZ = -4 * p.sin - 0.5;
  // 칼 든 팔은 망토 뒤로 숨지 않는다 (등이 보일 때도 칼이 망토 위로 나와야 한다)
  const rArmZ = Math.max(3.5 * p.sin + 5 * p.cos + 1.5, capeZ + 0.3);
  const lArmZ = -2.5 * p.sin - 5 * p.cos;
  const rLegZ = 1.5 * p.sin + 3.5 * p.cos;
  const lLegZ = -1.5 * p.sin - 3.5 * p.cos;
  const toe = p.cos >= 0 ? 1 : -1;
  const body = s[p.view];
  const sideBody = p.view === 'R' || p.view === 'L';

  add(capeZ, () => drawCape(b, sideView ? capeSide(p) : capeFlat(p)));

  // 몸통: 가슴 조각과 골반
  add(0, () => {
    const hipC: Pt = [(p.rHip[0] + p.lHip[0]) / 2, (p.rHip[1] + p.lHip[1]) / 2];
    thick(b, p.cx + 1 + p.shear * 0.3, p.cy + 12, hipC[0], hipC[1], 8, (i, n) => (!sideBody ? DARK : i < n * 0.3 ? GOLD[1] : DARK), 7);
    blit(b, body.chest, Math.round(p.cx - Math.floor(body.chest.w / 2)), Math.round(p.cy), p.shear);
  });

  // 머리 (시선은 몸과 다를 수 있다)
  add(0.2, () => {
    const h = s[p.headView].head;
    const left = p.headView === 'R' ? p.cx - 1 : p.headView === 'L' ? p.cx - 12 : p.cx - Math.floor(h.w / 2);
    blit(b, h, Math.round(left + p.headD[0] + p.shear * 0.8), Math.round(p.cy - 11 + p.headD[1]));
  });

  // 어깨갑옷: 망토 위에 올라와야 한다
  add(Math.max(0.1, capeZ + 0.1), () => {
    if (sideBody) {
      const st = p.view === 'R' ? s.pauldron : s.pauldronL;
      const left = p.view === 'R' ? p.cx - 8 : p.cx - 1;
      blit(b, st, Math.round(left), Math.round(p.cy - 6), p.shear);
    } else {
      blit(b, s.pauldron, Math.round(p.rs[0]) - 5, Math.round(p.cy - 6));
      blit(b, s.pauldronL, Math.round(p.ls[0]) - 5, Math.round(p.cy - 5));
    }
  });

  add(lArmZ, () => drawArm(b, p.ls, p.lEl, p.lh, lArmZ > 0));
  add(rArmZ, () => drawArm(b, p.rs, p.rEl, p.rh, rArmZ > 0));
  add(rLegZ, () => drawLeg(b, p.rHip, p.rKnee, p.rFoot, rLegZ > 0, toe));
  add(lLegZ, () => drawLeg(b, p.lHip, p.lKnee, p.lFoot, lLegZ > 0, toe));

  // 칼은 몸 앞(화면 쪽)을 지날 때만 몸 위에 그린다. 몸 뒤를 지나면 몸에 가려진다.
  const bladeZ = p.bladeZ >= -0.05 ? rArmZ + 0.3 : -2;
  if (p.smear) add(bladeZ - 0.05, () => drawSmear(b, p.smear!));
  add(bladeZ, () => drawBlade(b, p.blade[0], p.blade[1], p.bladeBend));

  items.sort((x, y) => x.z - y.z);
  for (const it of items) it.draw();
  return b;
}

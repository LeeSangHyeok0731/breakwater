import { blit, line, newBuf, polySpans, px, rect, thick, type Buf } from './pixels';
import type { Limb, Pt, Smear, SwordPose } from './poses';
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

function drawCape(b: Buf, pts: Pt[]): void {
  const spans = polySpans(pts, b.h);
  const inside = (x: number, y: number): boolean => (spans.get(y) ?? []).some(([a, c]) => x >= a && x <= c);
  for (const [y, row] of spans) {
    for (const [a, c] of row) {
      for (let x = a; x <= c; x++) {
        // 위쪽 가장자리와 바깥 가장자리는 밝은 붉은색, 안쪽은 어두운 자주색
        const rim = !inside(x, y - 1) || !inside(x, y - 2) || x === a || !inside(x - 2, y);
        px(b, x, y, rim ? CAPE_HI : CAPE_LO);
      }
    }
  }
}

function drawArm(b: Buf, l: Limb, front: boolean): void {
  // 소매: 어깨 쪽은 보랏빛 윗면, 팔뚝은 어둡게
  thick(b, l.shoulder[0], l.shoulder[1], l.elbow[0], l.elbow[1], 4, (i, n) => (i < n * 0.3 ? SUIT_HI : DARK), 4);
  thick(b, l.elbow[0], l.elbow[1], l.hand[0], l.hand[1], 4, DARK, 3);
  // 손목 금장 보호대
  const t = 0.78;
  const gx = l.elbow[0] + (l.hand[0] - l.elbow[0]) * t;
  const gy = l.elbow[1] + (l.hand[1] - l.elbow[1]) * t;
  thick(b, gx, gy, l.hand[0], l.hand[1], 3, (i) => (i === 0 ? GOLD[0] : GOLD[1]), 3);
  // 장갑
  rect(b, l.hand[0] - 1, l.hand[1] - 1, l.hand[0] + 2, l.hand[1] + 1, front ? GLOVE[0] : GLOVE[1]);
  px(b, l.hand[0] + 2, l.hand[1] + 1, GLOVE[2]);
  px(b, l.hand[0] - 1, l.hand[1] + 1, GLOVE[2]);
}

function drawLeg(b: Buf, hip: Pt, knee: Pt, foot: Pt, front: boolean): void {
  // 허벅지는 굵고 위쪽에 보랏빛 면, 정강이는 장화
  thick(b, hip[0], hip[1], knee[0], knee[1], 6, (i, n) => (i < n * 0.35 ? SUIT_HI : DARK), 5);
  thick(b, knee[0], knee[1], foot[0], foot[1] - 2, 5, (i, n) => (i < n * 0.25 ? GOLD[1] : GLOVE[1]), 4);
  // 무릎 금장
  rect(b, knee[0] - 1, knee[1] - 2, knee[0] + 1, knee[1] - 1, GOLD[0]);
  px(b, knee[0] + 2, knee[1] - 1, GOLD[1]);
  // 발목 금장 두름과 발끝이 앞으로 뻗은 장화
  rect(b, foot[0] - 2, foot[1] - 3, foot[0] + 1, foot[1] - 3, GOLD[0]);
  rect(b, foot[0] - 3, foot[1] - 2, foot[0] + 4, foot[1], GLOVE[1]);
  rect(b, foot[0] - 3, foot[1] - 2, foot[0] + 3, foot[1] - 2, front ? GLOVE[0] : GLOVE[1]);
  rect(b, foot[0] - 3, foot[1], foot[0] + 4, foot[1], GLOVE[2]);
  px(b, foot[0] + 4, foot[1] - 1, GLOVE[2]);
  px(b, foot[0] + 1, foot[1] - 2, GOLD[0]);
}

function drawBlade(b: Buf, base: Pt, tip: Pt): void {
  const [bx, by] = base;
  const [tx, ty] = tip;
  // 손잡이(뒤쪽 30%)와 칼날
  const gx = bx + (tx - bx) * 0.16;
  const gy = by + (ty - by) * 0.16;
  line(b, bx, by, gx, gy, GRIP);
  line(b, gx, gy - 1, tx, ty - 1, BLADE_EDGE);
  line(b, gx, gy, tx, ty, BLADE);
  line(b, gx, gy + 1, tx - (tx - gx) * 0.25, ty - (ty - gy) * 0.25 + 1, 0x87725f);
  // 날밑
  const nx = -(ty - by);
  const ny = tx - bx;
  const len = Math.hypot(nx, ny) || 1;
  px(b, gx + (nx / len) * 2, gy + (ny / len) * 2, GOLD[1]);
  px(b, gx - (nx / len) * 2, gy - (ny / len) * 2, GOLD[1]);
  px(b, gx, gy, GOLD[0]);
}

/**
 * 칼이 지나간 자리: 앞 어깨 둘레의 부채꼴. 시작(꼬리)은 가늘고 성기며 끝(칼이 있는 쪽)은 두껍고 밝다.
 * 바깥은 크림색, 안쪽으로 갈수록 회색. 가장자리는 들쭉날쭉해서 붓결처럼 보인다.
 */
function drawSmear(b: Buf, pivot: Pt, [a0, a1, r0, r1]: Smear): void {
  const span = Math.abs(a1 - a0);
  const dir = Math.sign(a1 - a0) || 1;
  for (let d = 0; d <= span; d += 1.2) {
    const u = d / span;
    const a = ((a0 + dir * d) * Math.PI) / 180;
    // 꼬리일수록 안쪽 반지름이 바깥으로 물러난다 (가늘어짐)
    const lo = r0 + (r1 - r0) * (1 - Math.pow(u, 0.7)) * 0.8;
    // 바깥 가장자리도 살짝 들쭉날쭉
    const hi = r1 - ((Math.floor(d * 1.7) % 3) === 0 ? 1 : 0) - (u < 0.25 ? 2 : 0);
    for (let r = lo; r <= hi; r += 0.8) {
      const k = (r - lo) / Math.max(1, hi - lo);
      // 꼬리 쪽은 성기게
      if (u < 0.45 && ((Math.round(d * 3) + Math.round(r * 2)) % 3 !== 0)) continue;
      const color = k > 0.66 ? BLADE_EDGE : k > 0.3 ? 0xd9bfa6 : BLADE;
      px(b, pivot[0] + Math.cos(a) * r, pivot[1] + Math.sin(a) * r, color);
    }
  }
}

/** 포즈 하나를 96×64 칸에 그린다. 그리는 순서: 망토 → 뒷팔 → 뒷다리 → 가슴 → 머리 → 앞다리 → 앞팔 → 칼 */
export function drawPose(p: SwordPose, s: Stamps): Buf {
  const b = newBuf(FRAME_W, FRAME_H);
  drawCape(b, p.cape);
  drawArm(b, p.back, false);
  drawLeg(b, p.hip, p.backLeg[0], p.backLeg[1], false);
  // 골반: 가슴과 다리를 잇는 어두운 덩어리와 금빛 허리띠
  thick(b, p.chest[0] + 8 + p.lean, p.chest[1] + 12, p.hip[0], p.hip[1], 8, (i, n) => (i < n * 0.3 ? GOLD[1] : DARK), 7);
  blit(b, s.chest, p.chest[0], p.chest[1], p.lean);
  blit(b, s.head, p.head[0], p.head[1]);
  blit(b, s.pauldron, p.pauldron[0], p.pauldron[1], p.lean);
  drawLeg(b, p.hip, p.frontLeg[0], p.frontLeg[1], true);
  if (p.smear) drawSmear(b, p.front.shoulder, p.smear);
  drawBlade(b, p.blade[0], p.blade[1]);
  drawArm(b, p.front, true);
  return b;
}

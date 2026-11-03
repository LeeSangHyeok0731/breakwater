import type Phaser from 'phaser';
import { PixelArt, ramp, type Pt, type Ramp } from '../legion/pixelArt';
import type { DragonPose, DragonRigDef } from './rig';

/**
 * 용 파츠 도트 (코드로 그린다). 크기 배율 z로 새끼 용부터 거대한 용까지 같은 모양을 그리되,
 * 픽셀은 늘 1배로 찍어서 작게 그려도 뭉개지지 않는다.
 */

export interface DragonPalette {
  body: number;
  belly: number;
  wing: number;
  horn: number;
  spike: number;
  eye: number;
  claw: number;
}

export const PAL_FLAME: DragonPalette = { body: 0xb3332b, belly: 0xe0a456, wing: 0x7c2230, horn: 0xe6d6b4, spike: 0x5a1a1e, eye: 0xffd23a, claw: 0x2a1e1e };
export const PAL_WYVERN: DragonPalette = { body: 0x6b7a35, belly: 0xcab47a, wing: 0x8a5a2e, horn: 0xd8c8a0, spike: 0x3e4a22, eye: 0xff7a20, claw: 0x2a2418 };
export const PAL_WHELP: DragonPalette = { body: 0xd0582a, belly: 0xf0c070, wing: 0xa03a2a, horn: 0xf0e0c0, spike: 0x7a2a1a, eye: 0xfff07a, claw: 0x2a1e1e };

/** 몸의 생김새: 네 발 달린 용 / 앞다리 대신 날개로 걷는 와이번 */
export type DragonPlan = 'dragon' | 'wyvern';

const S = (pts: Pt[], z: number, ox = 0, oy = 0): Pt[] => pts.map(([x, y]) => [x * z + ox, y * z + oy]);

function canvas(w: number, h: number): PixelArt {
  return new PixelArt(Math.max(2, Math.ceil(w)), Math.max(2, Math.ceil(h)));
}

/** 용 한 마리의 파츠를 그리고 리그 정의를 돌려준다. id는 텍스처 이름 앞에 붙는다. */
export function makeDragonArt(scene: Phaser.Scene, id: string, pal: DragonPalette, plan: DragonPlan, z: number, scale: number): DragonRigDef {
  const body = ramp(pal.body);
  const belly = ramp(pal.belly);
  const wing = ramp(pal.wing);
  const horn = ramp(pal.horn);
  const spike = ramp(pal.spike);
  const claw = ramp(pal.claw);
  const key = (n: string): string => `${id}-${n}`;
  const wyvern = plan === 'wyvern';
  // 키가 0.6배쯤인 텍스처는 다시 만들지 않는다.
  const done = scene.textures.exists(key('torso'));

  // ── 몸통 ──
  const tw = 58 * z;
  const th = 30 * z;
  if (!done) {
    const a = canvas(tw + 2, th + 6 * z);
    const oy = 5 * z;
    a.poly(body, S([[2, 16], [6, 9], [14, 5], [26, 3], [38, 4], [48, 7], [55, 12], [57, 17], [53, 23], [44, 27], [30, 28], [16, 27], [7, 24]], z, 0, oy));
    a.poly(belly, S([[10, 22], [30, 24.5], [48, 21.5], [53, 19.5], [51, 24.5], [42, 27], [30, 28], [16, 27], [9, 25]], z, 0, oy));
    // 배 비늘 줄
    for (let x = 14; x < 50; x += 6) a.line(ramp(pal.belly), x * z, (23.5 + Math.sin(x) * 0.3) * z + oy, (x + 1) * z, 27 * z + oy);
    // 등가시
    for (let x = 8; x <= 44; x += 7) a.poly(spike, S([[x, 5.5], [x + 2.5, -1.5 + (x % 2)], [x + 5, 4.5]], z, 0, oy));
    // 등 비늘 무늬
    for (let x = 12; x < 50; x += 5) a.dot(Math.round(x * z), Math.round((10 + (x % 3)) * z + oy), mixDark(pal.body));
    a.register(scene, key('torso'), [29 * z, 16 * z + oy]);
  }

  // ── 목 마디 ──
  const ns = 13 * z;
  if (!done) {
    const a = canvas(ns + 1, ns + 4 * z);
    const oy = 3 * z;
    a.poly(body, S([[0, 3], [4, 0.5], [10, 0.5], [13, 3.5], [13, 9.5], [10, 12.5], [4, 12.5], [0, 10]], z, 0, oy));
    a.poly(belly, S([[1, 9], [12, 9], [10.5, 12.5], [3, 12.5]], z, 0, oy));
    a.poly(spike, S([[4, 1], [6.5, -3], [8.5, 1]], z, 0, oy));
    a.register(scene, key('neck'), [2 * z, 6.5 * z + oy]);
  }

  // ── 머리와 아래턱 ──
  if (!done) {
    const a = canvas(42 * z, 24 * z);
    const ox = 11 * z;
    const oy = 8 * z;
    // 뿔: 뒤로 휘어 뻗는다.
    a.poly(horn, S([[6, 2], [-2, -3], [-10, -7], [-4, -2], [1, 3]], z, ox, oy));
    a.poly(horn, S([[12, 1], [8, -4], [5, -6], [9, -1]], z, ox, oy));
    a.poly(body, S([[0, 6], [4, 2], [12, 0], [20, 2], [27, 5], [30, 8], [29.5, 11], [20, 11.5], [8, 12.5], [2, 11]], z, ox, oy));
    // 콧등과 눈두덩
    a.line(ramp(mixDark(pal.body)), 13 * z + ox, 3.5 * z + oy, 26 * z + ox, 6 * z + oy);
    // 윗니
    for (let x = 18; x < 29; x += 3) a.poly(ramp(0xf4ead8), S([[x, 11], [x + 1, 13.5], [x + 2, 11]], z, ox, oy));
    a.dots(pal.eye, [[Math.round(15 * z + ox), Math.round(5 * z + oy)], [Math.round(16 * z + ox), Math.round(5 * z + oy)]]);
    a.dot(Math.round(16 * z + ox), Math.round(5 * z + oy), 0x1a0606);
    a.dot(Math.round(28 * z + ox), Math.round(7 * z + oy), 0x1a0606);
    a.register(scene, key('head'), [2 * z + ox, 7 * z + oy]);

    const j = canvas(26 * z, 9 * z);
    const jy = 2 * z;
    j.poly(body, S([[0, 0], [22, 1], [24, 3], [20, 5.5], [4, 5.5], [0, 3]], z, 0, jy));
    j.poly(belly, S([[3, 3.5], [20, 3.5], [19, 5.5], [5, 5.5]], z, 0, jy));
    for (let x = 8; x < 22; x += 3) j.poly(ramp(0xf4ead8), S([[x, 1], [x + 1, -1.5], [x + 2, 1]], z, 0, jy));
    j.register(scene, key('jaw'), [1 * z, 1 * z + jy]);
  }

  // ── 꼬리 ──
  const widths = [13, 11, 9.5, 8, 6.5, 5, 4];
  const lens = [10, 10, 9, 9, 8, 8, 7];
  const tailKeys: string[] = [];
  widths.forEach((w, i) => {
    const k = key(`tail${i}`);
    tailKeys.push(k);
    if (done) return;
    const L = lens[i] + 3;
    const last = i === widths.length - 1;
    const a = canvas((L + (last ? 12 : 0)) * z, (w + 6) * z);
    const oy = 3 * z;
    const next = widths[i + 1] ?? 2;
    a.poly(body, S([[0, 0], [L, (w - next) / 2], [L, (w + next) / 2], [0, w]], z, 0, oy));
    a.poly(belly, S([[0, w * 0.7], [L, (w - next) / 2 + next * 0.7], [L, (w + next) / 2], [0, w]], z, 0, oy));
    a.poly(spike, S([[2, 0.5], [4, -2.5], [6, 0.5]], z, 0, oy));
    if (last) {
      // 꼬리 끝: 용은 화살촉 모양, 와이번은 독침
      if (wyvern) a.poly(horn, S([[L - 1, w / 2 - 1.5], [L + 10, w / 2], [L - 1, w / 2 + 1.5]], z, 0, oy));
      else a.poly(spike, S([[L - 2, w / 2], [L + 3, w / 2 - 5], [L + 11, w / 2], [L + 3, w / 2 + 5]], z, 0, oy));
    }
    a.register(scene, k, [0, (w / 2) * z + oy]);
  });

  // ── 날개 (가까운 쪽 / 먼 쪽) ──
  const big = wyvern ? 1.18 : 1;
  const innerLen = 30 * z * big;
  const wingKeys = (far: boolean): [string, string] => [key(far ? 'wingInB' : 'wingIn'), key(far ? 'wingOutB' : 'wingOut')];
  if (!done) {
    for (const far of [false, true]) {
      const zz = z * big;
      const mem: Ramp = far ? ramp(mixDark(pal.wing)) : wing;
      const [ki, ko] = wingKeys(far);
      const ai = canvas(32 * zz, 22 * zz);
      const by = 18 * zz;
      ai.poly(mem, S([[0, 0], [30, 0], [28, -16], [12, -12], [2, -4]], zz, 0, by));
      ai.line(body, 0, by, 30 * zz, by, Math.max(2, Math.round(3 * zz)));
      ai.register(scene, ki, [0, by]);
      const ao = canvas(40 * zz, 36 * zz);
      const oy = 32 * zz;
      ao.poly(mem, S([[0, 0], [36, 0], [28, -10], [20, -26], [14, -19], [6, -30], [2, -18]], zz, 0, oy));
      // 날개 뼈 (손가락)
      ao.line(body, 0, oy, 36 * zz, oy, Math.max(1, Math.round(2.5 * zz)));
      ao.line(body, 1 * zz, oy, 20 * zz, oy - 26 * zz, Math.max(1, Math.round(1.6 * zz)));
      ao.line(body, 1 * zz, oy, 6 * zz, oy - 30 * zz, Math.max(1, Math.round(1.6 * zz)));
      ao.poly(claw, S([[0, -1], [-1, -5], [2, -1]], zz, 1 * zz, oy));
      ao.register(scene, ko, [0, oy]);
    }
  }

  // ── 다리 ──
  const limb = (n: string, thighLen: number, thighW: number, shinLen: number, shinW: number): NonNullable<DragonRigDef['arm']> => {
    const keys = { thigh: [key(`${n}Thigh`), key(`${n}ThighB`)] as [string, string], shin: [key(`${n}Shin`), key(`${n}ShinB`)] as [string, string], foot: [key(`${n}Foot`), key(`${n}FootB`)] as [string, string] };
    if (!done) {
      keys.thigh.forEach((k, i) => {
        const a = canvas((thighLen + 4) * z, (thighW + 2) * z);
        const r = i ? ramp(mixDark(pal.body)) : body;
        a.poly(r, S([[0, 0], [thighLen + 2, thighW * 0.25], [thighLen + 2, thighW * 0.75], [0, thighW]], z, 0, 1 * z));
        a.register(scene, k, [1 * z, (thighW / 2 + 1) * z]);
      });
      keys.shin.forEach((k, i) => {
        const a = canvas((shinLen + 3) * z, (shinW + 2) * z);
        const r = i ? ramp(mixDark(pal.body)) : body;
        a.poly(r, S([[0, 0], [shinLen + 1, shinW * 0.2], [shinLen + 1, shinW * 0.8], [0, shinW]], z, 0, 1 * z));
        a.register(scene, k, [1 * z, (shinW / 2 + 1) * z]);
      });
      keys.foot.forEach((k) => {
        const a = canvas(13 * z, 6 * z);
        a.poly(body, S([[0, 0], [7, 0], [9, 2.5], [1, 3]], z));
        for (let c = 0; c < 3; c++) a.poly(claw, S([[6 + c * 1.6, 1.5], [10.5 + c * 0.8, 3 + c * 0.3], [6.5 + c * 1.6, 3.5]], z));
        a.register(scene, k, [2 * z, 2.5 * z]);
      });
    }
    return { ...keys, thighLen: thighLen * z, shinLen: shinLen * z };
  };
  const leg = limb('leg', wyvern ? 16 : 15, wyvern ? 11 : 10, wyvern ? 15 : 14, 6);
  const arm = wyvern ? undefined : limb('arm', 12, 8, 12, 5);

  return {
    scale,
    torso: key('torso'),
    chest: [24 * z, -5 * z],
    hip: [-24 * z, -1 * z],
    shoulder: [5 * z, -11 * z],
    legB: [-16 * z, 5 * z],
    legF: wyvern ? undefined : [17 * z, 6 * z],
    neck: { keys: wyvern ? [key('neck'), key('neck'), key('neck')] : [key('neck'), key('neck'), key('neck'), key('neck')], len: 7.5 * z },
    head: key('head'),
    jaw: key('jaw'),
    jawAt: [4 * z, 4 * z],
    mouth: [26 * z, 4.5 * z],
    tail: { keys: tailKeys, lens: lens.map((l) => l * z) },
    wing: { inner: [wingKeys(false)[0], wingKeys(true)[0]], outer: [wingKeys(false)[1], wingKeys(true)[1]], innerLen },
    leg,
    arm,
  };
}

function mixDark(c: number): number {
  const ch = (s: number): number => Math.round(((c >> s) & 255) * 0.72);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 서 있는 기본 자세 (z배 크기) */
export function standPose(z: number, wyvern = false): DragonPose {
  return {
    bx: 0,
    by: -(wyvern ? 30 : 27) * z,
    rot: wyvern ? -8 : -4,
    neck: -58,
    curl: 13,
    head: 30,
    jaw: 4,
    tail: 14,
    tailCurl: -3,
    tailAmp: 10,
    wing: -125,
    fold: 0.85,
    flap: 0,
    fFx: 19 * z,
    fFy: 0,
    bFx: -14 * z,
    bFy: 0,
  };
}

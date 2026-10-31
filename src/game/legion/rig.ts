import Phaser from 'phaser';
import { DEPTH } from '../fx';
import { FLOOR_Y } from '../world';
import { PixelArt, pivotOf, type Pt, type Ramp } from './pixelArt';

/**
 * 군단장 파츠 리그. 부위마다 따로 그린 도트를 뼈대처럼 조립한다.
 * 손·발은 목표 위치만 정하면 팔꿈치·무릎이 IK로 알아서 굽는다.
 * 무기는 앞손에 쥐고, 두 손으로 잡을 때는 뒷손이 손잡이 아래쪽을 잡는다.
 * 망토·앞자락 같은 천은 매 프레임 스프링으로 흔들리는 모양을 도트로 다시 그린다.
 *
 * 좌표는 오른쪽을 볼 때 기준, 리그 1픽셀 단위 (화면에서는 scale배). 원점은 두 발 사이 바닥, y는 아래가 +.
 */

/** 자세 하나. 모든 값은 숫자라서 두 자세를 섞을 수 있다. */
export interface Pose {
  /** 엉덩이 이동 (y +는 웅크림) */
  hx: number;
  hy: number;
  /** 몸통 기울기 (도, +는 앞으로 숙임) */
  lean: number;
  /** 머리 (도, +는 숙임) */
  head: number;
  /** 앞발·뒷발 위치 (y 0이 바닥, -는 들림) */
  fFx: number;
  fFy: number;
  fBx: number;
  fBy: number;
  /** 앞손 위치 (앞 어깨 기준) */
  aFx: number;
  aFy: number;
  /** 뒷손 위치 (뒤 어깨 기준, 두 손으로 잡으면 무시) */
  aBx: number;
  aBy: number;
  /** 무기 각도 (도, 0은 끝이 위, +는 앞으로 기욺) */
  w: number;
  /** 1이면 뒷손이 무기 손잡이를 잡는다 */
  two: number;
}

export type PoseKey = keyof Pose;
export type Ease = (k: number) => number;

export const EASE = {
  linear: (k: number): number => k,
  out: (k: number): number => 1 - Math.pow(1 - k, 3),
  in: (k: number): number => k * k * k,
  inOut: (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  /** 끝에서 살짝 넘쳤다 돌아온다 */
  back: (k: number): number => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  },
};

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const out = { ...a };
  for (const key of Object.keys(a) as PoseKey[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/** 키프레임: [시간, 바꿀 값, 이 키까지 가는 이징] */
export type Key = [number, Partial<Pose>, Ease?];

/** 키프레임 목록을 t초에서 평가한다. 각 키는 앞 키에 바꿀 값만 덮어쓴다. */
export class Track {
  private full: [number, Pose, Ease][] = [];

  constructor(base: Pose, keys: Key[]) {
    let cur = base;
    for (const [t, p, e] of keys) {
      cur = { ...cur, ...p };
      this.full.push([t, cur, e ?? EASE.inOut]);
    }
  }

  at(t: number): Pose {
    const f = this.full;
    if (t <= f[0][0]) return { ...f[0][1] };
    for (let i = 1; i < f.length; i++) {
      if (t > f[i][0]) continue;
      const [t0, p0] = f[i - 1];
      const [t1, p1, ease] = f[i];
      return lerpPose(p0, p1, ease((t - t0) / Math.max(1e-6, t1 - t0)));
    }
    return { ...f[f.length - 1][1] };
  }

  get end(): number {
    return this.full[this.full.length - 1][0];
  }
}

export type PartName =
  | 'torso'
  | 'pelvis'
  | 'head'
  | 'upperF'
  | 'foreF'
  | 'handF'
  | 'upperB'
  | 'foreB'
  | 'handB'
  | 'thighF'
  | 'shinF'
  | 'footF'
  | 'thighB'
  | 'shinB'
  | 'footB'
  | 'pauldronF'
  | 'pauldronB'
  | 'weapon'
  | 'glow'
  | 'plume';

/** 흔들리는 천 (망토, 앞자락) */
export interface ClothDef {
  id: string;
  /** 매다는 곳: 몸통(허리 기준, 몸통과 함께 기욺) 또는 엉덩이 */
  on: 'torso' | 'pelvis';
  at: Pt;
  /** 마디 수와 마디 길이 */
  segs: number;
  len: number;
  /** 위·아래 폭 */
  w0: number;
  w1: number;
  mat: Ramp;
  /** 뒤쪽 가장자리 띠 (안감) */
  edge?: Ramp;
  /** 끝이 찢어져 있다 */
  tatter?: boolean;
  /** 매단 선에서 앞·뒤로 퍼지는 비율 (폭의 절반 기준). 망토는 뒤로 넓게 [0.4, 1.6], 앞자락은 가운데 [1, 1] */
  spread?: Pt;
  /** 가만히 있을 때 기우는 각도 (라디안, +는 뒤로) */
  rest: number;
  /** 움직임에 날리는 정도 */
  blow: number;
  /** 천 위에 그리는 무늬 (마디 점들을 받는다) */
  emblem?: (a: PixelArt, mid: Pt[]) => void;
}

export interface RigDef {
  /** 화면 배율 */
  scale: number;
  /** 서 있을 때 엉덩이 높이 */
  hipY: number;
  /** 엉덩이 기준 앞·뒤 다리 관절 */
  hipF: Pt;
  hipB: Pt;
  thigh: number;
  shin: number;
  /** 엉덩이 기준 허리 (몸통 회전 중심) */
  waist: Pt;
  /** 허리 기준 (몸통이 곧을 때) 어깨와 목 */
  shoulderF: Pt;
  shoulderB: Pt;
  neck: Pt;
  upper: number;
  fore: number;
  /** 무기 손잡이에서 뒷손까지 (손잡이 아래쪽으로) */
  grip2: number;
  /** 무기 길이 (손잡이에서 끝까지) */
  reach: number;
  /** 부위별 텍스처 */
  parts: Partial<Record<Exclude<PartName, 'plume' | 'glow'>, string>>;
  cloths?: ClothDef[];
  /** 투구 장식: 머리 기준 붙는 곳 + 텍스처 + 뒤로 기우는 각도 */
  plume?: { at: Pt; key: string; rest: number };
  /** 그리는 순서 (뒤 → 앞). 천은 'cloth:아이디' */
  order: (PartName | `cloth:${string}`)[];
}

interface Spring {
  a: number;
  v: number;
}

interface Cloth {
  def: ClothDef;
  img: Phaser.GameObjects.Image;
  tex: Phaser.Textures.CanvasTexture;
  springs: Spring[];
  /** 캔버스에서 매다는 점 */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/** 두 뼈 IK: 어깨(엉덩이) s에서 목표 t로. bend +1이면 (오른쪽을 볼 때) 관절이 시계 방향 쪽으로 굽는다. */
function ik(s: Pt, t: Pt, l1: number, l2: number, bend: number): { mid: Pt; end: Pt } {
  const dx = t[0] - s[0];
  const dy = t[1] - s[1];
  const d = Phaser.Math.Clamp(Math.hypot(dx, dy), 0.001, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const cosA = Phaser.Math.Clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const up = a + bend * Math.acos(cosA);
  const mid: Pt = [s[0] + Math.cos(up) * l1, s[1] + Math.sin(up) * l1];
  const end: Pt = [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d];
  return { mid, end };
}

/** 아래를 향해 그린 파츠를 a → b 방향으로 돌리는 각도 */
function boneRot(a: Pt, b: Pt): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

function rot(p: Pt, a: number): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

let clothSeq = 0;

export class Rig {
  readonly root: Phaser.GameObjects.Container;
  private imgs = new Map<PartName, Phaser.GameObjects.Image>();
  private cloths: Cloth[] = [];
  private plumeSpring: Spring = { a: 0, v: 0 };
  private mask: Phaser.Display.Masks.GeometryMask;
  private maskShape: Phaser.GameObjects.Graphics;
  pose: Pose;
  facing: 1 | -1 = 1;
  /** 무기가 빛난다 */
  glowing = false;
  /** 계산된 앞손 위치 (리그 좌표) */
  private hand: Pt = [0, 0];
  private lastX = 0;
  private lastY = 0;
  private time = 0;
  private first = true;

  constructor(
    readonly scene: Phaser.Scene,
    readonly def: RigDef,
    pose: Pose,
    depth = DEPTH.monster,
  ) {
    this.pose = { ...pose };
    this.root = scene.add.container(0, 0).setDepth(depth).setScale(def.scale);
    const add = (key: string): Phaser.GameObjects.Image => {
      const [px, py] = pivotOf(key);
      const img = scene.add.image(0, 0, key);
      img.setOrigin(px / img.width, py / img.height);
      return img;
    };
    for (const name of def.order) {
      if (name.startsWith('cloth:')) {
        const cd = def.cloths?.find((c) => `cloth:${c.id}` === name);
        if (!cd) continue;
        // 천이 가장 멀리 날려도 들어가도록 넉넉한 캔버스 (여백 1픽셀 포함)
        const reach = cd.segs * cd.len + cd.w1;
        const w = Math.ceil(reach * 2 + 4);
        const h = Math.ceil(reach + 6);
        const key = `rig-cloth-${cd.id}-${clothSeq++}`;
        const tex = scene.textures.createCanvas(key, w + 2, h + 2)!;
        const img = scene.add.image(0, 0, key);
        const ox = Math.round(w / 2);
        const oy = 3;
        img.setOrigin((ox + 1) / (w + 2), (oy + 1) / (h + 2));
        this.cloths.push({ def: cd, img, tex, springs: Array.from({ length: cd.segs }, () => ({ a: cd.rest, v: 0 })), ox, oy, w, h });
        this.root.add(img);
        continue;
      }
      if (name === 'plume') {
        if (def.plume) {
          const img = add(def.plume.key);
          this.imgs.set('plume', img);
          this.root.add(img);
        }
        continue;
      }
      if (name === 'glow') {
        const key = def.parts.weapon;
        if (!key) continue;
        const img = add(key).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        this.imgs.set('glow', img);
        this.root.add(img);
        continue;
      }
      const key = def.parts[name as Exclude<PartName, 'plume' | 'glow'>];
      if (!key) continue;
      const img = add(key);
      this.imgs.set(name as PartName, img);
      this.root.add(img);
    }
    // 바닥 아래로 들어간 부분(땅에 박힌 칼끝)은 가린다.
    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillStyle(0xffffff).fillRect(-200, -2000, 100000, FLOOR_Y + 2002);
    this.mask = this.maskShape.createGeometryMask();
    this.root.setMask(this.mask);
  }

  destroy(): void {
    for (const c of this.cloths) {
      const key = c.tex.key;
      c.img.destroy();
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    this.root.destroy();
    this.maskShape.destroy();
  }

  /** 리그 좌표 → 화면 좌표 */
  world(p: Pt): { x: number; y: number } {
    return { x: this.root.x + p[0] * this.def.scale * this.facing, y: this.root.y + p[1] * this.def.scale };
  }

  /** 무기 끝 쪽 한 점 (화면 좌표). along 1이 끝. */
  tip(along = 1): { x: number; y: number } {
    const a = rad(this.pose.w);
    const r = this.def.reach * along;
    return this.world([this.hand[0] + Math.sin(a) * r, this.hand[1] - Math.cos(a) * r]);
  }

  /** 앞손 (화면 좌표) */
  handPos(): { x: number; y: number } {
    return this.world(this.hand);
  }

  /** 발끝 위치에 놓고, 천·장식의 흔들림을 진행하고, 파츠를 배치한다. */
  update(x: number, y: number, facing: 1 | -1, dt: number): void {
    if (this.first) {
      this.first = false;
      this.lastX = x;
      this.lastY = y;
    }
    const vx = dt > 0 ? (x - this.lastX) / dt : 0;
    const vy = dt > 0 ? (y - this.lastY) / dt : 0;
    this.lastX = x;
    this.lastY = y;
    this.time += dt;
    this.facing = facing;
    this.root.setPosition(Math.round(x), Math.round(y));
    this.root.setScale(this.def.scale * facing, this.def.scale);
    this.layout(vx * facing, vy, dt);
  }

  private layout(fwd: number, vy: number, dt: number): void {
    const d = this.def;
    const p = this.pose;
    const lean = rad(p.lean);
    // 엉덩이와 다리
    const hip: Pt = [p.hx, -d.hipY + p.hy];
    const hipF: Pt = [hip[0] + d.hipF[0], hip[1] + d.hipF[1]];
    const hipB: Pt = [hip[0] + d.hipB[0], hip[1] + d.hipB[1]];
    const legF = ik(hipF, [p.fFx, p.fFy - 1], d.thigh, d.shin, -1);
    const legB = ik(hipB, [p.fBx, p.fBy - 1], d.thigh, d.shin, -1);
    this.place('pelvis', hip, lean * 0.3);
    this.place('thighF', hipF, boneRot(hipF, legF.mid));
    this.place('shinF', legF.mid, boneRot(legF.mid, legF.end));
    this.place('footF', legF.end, 0);
    this.place('thighB', hipB, boneRot(hipB, legB.mid));
    this.place('shinB', legB.mid, boneRot(legB.mid, legB.end));
    this.place('footB', legB.end, 0);
    // 몸통과 머리
    const waist: Pt = [hip[0] + d.waist[0], hip[1] + d.waist[1]];
    const at = (q: Pt): Pt => {
      const r = rot(q, lean);
      return [waist[0] + r[0], waist[1] + r[1]];
    };
    this.place('torso', waist, lean);
    const neck = at(d.neck);
    const headRot = lean + rad(p.head);
    this.place('head', neck, headRot);
    // 앞팔: 앞손 목표로 IK
    const sF = at(d.shoulderF);
    const armF = ik(sF, [sF[0] + p.aFx, sF[1] + p.aFy], d.upper, d.fore, 1);
    this.hand = armF.end;
    const w = rad(p.w);
    this.place('upperF', sF, boneRot(sF, armF.mid));
    this.place('foreF', armF.mid, boneRot(armF.mid, armF.end));
    this.place('handF', armF.end, w);
    this.place('weapon', armF.end, w);
    const glow = this.imgs.get('glow');
    if (glow) {
      this.place('glow', armF.end, w);
      glow.setVisible(this.glowing).setScale(1.12).setAlpha(0.45 + Math.sin(this.time * 18) * 0.2);
    }
    this.place('pauldronF', sF, lean + (boneRot(sF, armF.mid) - lean) * 0.3);
    // 뒷팔: 두 손으로 잡으면 손잡이 아래쪽, 아니면 자세의 뒷손 위치
    const sB = at(d.shoulderB);
    const grip: Pt = [armF.end[0] - Math.sin(w) * d.grip2, armF.end[1] + Math.cos(w) * d.grip2];
    const free: Pt = [sB[0] + p.aBx, sB[1] + p.aBy];
    const k = Phaser.Math.Clamp(p.two, 0, 1);
    const tB: Pt = [free[0] + (grip[0] - free[0]) * k, free[1] + (grip[1] - free[1]) * k];
    const armB = ik(sB, tB, d.upper, d.fore, 1);
    this.place('upperB', sB, boneRot(sB, armB.mid));
    this.place('foreB', armB.mid, boneRot(armB.mid, armB.end));
    this.place('handB', armB.end, k > 0.5 ? w : boneRot(armB.mid, armB.end));
    this.place('pauldronB', sB, lean + (boneRot(sB, armB.mid) - lean) * 0.3);
    // 천: 앞으로 움직이면 뒤로 날리고, 뛰어오르면 위로 들린다.
    for (const c of this.cloths) {
      const base = c.def.on === 'torso' ? at(c.def.at) : ([hip[0] + c.def.at[0], hip[1] + c.def.at[1]] as Pt);
      this.drawCloth(c, base, c.def.on === 'torso' ? lean : lean * 0.3, fwd, vy, dt);
    }
    if (d.plume) {
      const at2 = rot(d.plume.at, headRot);
      const target = headRot + d.plume.rest + Phaser.Math.Clamp(fwd * 0.003, -0.6, 0.8) + Math.sin(this.time * 3) * 0.08;
      spring(this.plumeSpring, target, dt, 60, 8);
      this.place('plume', [neck[0] + at2[0], neck[1] + at2[1]], this.plumeSpring.a);
    }
  }

  /** 천을 마디마다 스프링으로 흔들고, 그 모양을 도트로 다시 그린다. */
  private drawCloth(c: Cloth, base: Pt, parentRot: number, fwd: number, vy: number, dt: number): void {
    const cd = c.def;
    const blow = Phaser.Math.Clamp(fwd * 0.004 * cd.blow, -0.5, 1.1);
    const lift = Phaser.Math.Clamp(-vy * 0.002 * cd.blow, -0.3, 0.5);
    const pts: Pt[] = [[0, 0]];
    const angs: number[] = [];
    let prev = parentRot * 0.6 + cd.rest;
    c.springs.forEach((s, i) => {
      const wave = Math.sin(this.time * 2.4 - i * 0.9) * 0.05 * (i + 1) * cd.blow;
      const target = prev * 0.35 + (parentRot * 0.6 + cd.rest) * 0.65 + blow * (1 + i * 0.25) + lift + wave;
      spring(s, Phaser.Math.Clamp(target, -0.6, 1.7), dt, 45, 9);
      const [x, y] = pts[pts.length - 1];
      pts.push([x - Math.sin(s.a) * cd.len, y + Math.cos(s.a) * cd.len]);
      angs.push(s.a);
      prev = s.a;
    });
    // 양쪽 가장자리: 마디 방향에 수직으로 폭만큼 벌린다. 몸 쪽(앞)은 붙어 있고 바깥쪽(뒤)으로 퍼진다.
    const n = pts.length;
    const front: Pt[] = [];
    const backE: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = angs[Math.min(i, angs.length - 1)];
      const f = i / (n - 1);
      const half = (cd.w0 + (cd.w1 - cd.w0) * f) / 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const [sf, sb] = cd.spread ?? [0.4, 1.6];
      front.push([pts[i][0] + nx * half * sf, pts[i][1] + ny * half * sf]);
      backE.push([pts[i][0] - nx * half * sb, pts[i][1] - ny * half * sb]);
    }
    const ox = c.ox;
    const oy = c.oy;
    const to = (q: Pt): Pt => [q[0] + ox, q[1] + oy];
    const bottom: Pt[] = [];
    const bl = backE[n - 1];
    const fr = front[n - 1];
    if (cd.tatter) {
      // 찢어진 끝: 뾰족뾰족하게
      const teeth = 5;
      for (let i = 0; i <= teeth; i++) {
        const t = i / teeth;
        const x = fr[0] + (bl[0] - fr[0]) * t;
        const y = fr[1] + (bl[1] - fr[1]) * t + (i % 2 ? -2.5 : 1) + (i === 2 ? -1 : 0);
        bottom.push([x, y]);
      }
    } else bottom.push(fr, bl);
    const poly = [...front, ...bottom, ...backE.slice(0, n - 1).reverse()].map(to);
    const art = new PixelArt(c.w, c.h);
    art.poly(cd.mat, poly);
    if (cd.edge) {
      // 바깥쪽 가장자리 띠
      for (let i = 0; i < n - 1; i++) {
        const a = to(backE[i]);
        const b = to(backE[i + 1]);
        art.line(cd.edge, a[0] + 0.5, a[1], b[0] + 0.5, b[1]);
      }
    }
    cd.emblem?.(
      art,
      pts.map((q) => to(q)),
    );
    art.paint(c.tex.getContext());
    c.tex.refresh();
    c.img.setPosition(base[0], base[1]);
  }

  private place(name: PartName, at: Pt, r: number): void {
    this.imgs.get(name)?.setPosition(at[0], at[1]).setRotation(r);
  }

  /** 맞았을 때 번쩍임·투명도를 본체 스프라이트에서 따라 한다. */
  mirror(sprite: Phaser.GameObjects.Sprite): void {
    this.root.setAlpha(sprite.alpha);
    const white = sprite.isTinted && sprite.tintFill;
    for (const img of [...this.imgs.values(), ...this.cloths.map((c) => c.img)]) {
      if (img.blendMode === Phaser.BlendModes.ADD) continue;
      if (white) img.setTintFill(0xffffff);
      else if (img.isTinted) img.clearTint();
    }
  }

  /** 잔상: 지금 모습을 복사해 색을 입히고 서서히 지운다. only를 주면 그 파츠만. */
  ghost(color: number, alpha = 0.5, ms = 200, only?: PartName[]): void {
    const r = this.root;
    const g = this.scene.add.container(r.x, r.y).setScale(r.scaleX, r.scaleY).setDepth(r.depth - 1);
    const copy = (img: Phaser.GameObjects.Image | undefined): void => {
      if (!img || !img.visible || img.blendMode === Phaser.BlendModes.ADD) return;
      g.add(
        this.scene.add
          .image(img.x, img.y, img.texture.key)
          .setOrigin(img.originX, img.originY)
          .setRotation(img.rotation)
          .setTintFill(color)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    };
    if (only) for (const n of only) copy(this.imgs.get(n));
    else for (const img of this.imgs.values()) copy(img);
    g.setAlpha(alpha).setMask(this.mask);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }
}

/** 감쇠 스프링으로 각도를 따라가게 한다. */
function spring(s: Spring, target: number, dt: number, k: number, damp: number): void {
  if (dt <= 0) return;
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += ((target - s.a) * k - s.v * damp) * h;
    s.a += s.v * h;
  }
}

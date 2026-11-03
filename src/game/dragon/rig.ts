import Phaser from 'phaser';
import { DEPTH } from '../fx';
import { FLOOR_Y } from '../world';
import { pivotOf, type Pt } from '../legion/pixelArt';

/**
 * 용 파츠 리그. 몸통을 중심으로 목·꼬리는 마디 사슬, 날개는 두 마디, 다리는 두 뼈 IK로 조립한다.
 * 파츠 그림은 모두 회전 중심에서 오른쪽(+x)으로 뻗게 그린다.
 * 좌표는 오른쪽을 볼 때 기준, 리그 1픽셀 단위 (화면에서는 scale배). 원점은 몸 아래 바닥, y는 아래가 +.
 */

/** 자세 하나. 모든 값은 숫자라서 두 자세를 섞을 수 있다. 각도는 도. */
export interface DragonPose {
  /** 몸통 중심 위치 (y는 바닥 기준, -가 위) */
  bx: number;
  by: number;
  /** 몸통 기울기 (+는 머리 쪽이 아래) */
  rot: number;
  /** 목 뿌리 각도 (몸통 기준, 0은 앞, -는 위) */
  neck: number;
  /** 목 마디마다 더 꺾이는 각도 */
  curl: number;
  /** 머리 각도 (마지막 목 마디 기준) */
  head: number;
  /** 아래턱 벌림 */
  jaw: number;
  /** 꼬리 뿌리 각도 (0은 뒤로 수평, +는 아래) */
  tail: number;
  /** 꼬리 마디마다 더 꺾이는 각도 */
  tailCurl: number;
  /** 꼬리 흔들림 세기 */
  tailAmp: number;
  /** 날개 어깨 각도 (몸통 기준, -90이 위) */
  wing: number;
  /** 날개 접힘 (0 펼침 → 1 접음) */
  fold: number;
  /** 날갯짓 세기 (0 없음 → 1 힘찬 날갯짓) */
  flap: number;
  /** 앞발·뒷발 목표 (원점 기준) */
  fFx: number;
  fFy: number;
  bFx: number;
  bFy: number;
}

export type DragonPoseKey = keyof DragonPose;

export function lerpDragon(a: DragonPose, b: DragonPose, k: number): DragonPose {
  const out = { ...a };
  for (const key of Object.keys(a) as DragonPoseKey[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

export interface DragonRigDef {
  scale: number;
  /** 몸통 그림과 몸통 기준 관절들 (몸통이 곧을 때) */
  torso: string;
  chest: Pt;
  hip: Pt;
  shoulder: Pt;
  /** 다리 뿌리 (앞다리가 없으면 front 없음) */
  legB: Pt;
  legF?: Pt;
  neck: { keys: string[]; len: number };
  head: string;
  jaw: string;
  /** 머리 기준 아래턱 경첩과 입 (불을 뿜는 곳) */
  jawAt: Pt;
  mouth: Pt;
  tail: { keys: string[]; lens: number[] };
  wing: { inner: [string, string]; outer: [string, string]; innerLen: number };
  leg: { thigh: [string, string]; shin: [string, string]; foot: [string, string]; thighLen: number; shinLen: number };
  /** 앞다리 (없으면 뒷다리 그림을 쓰지 않는다) */
  arm?: { thigh: [string, string]; shin: [string, string]; foot: [string, string]; thighLen: number; shinLen: number };
}

/** 파츠 하나의 배치 */
interface Placed {
  key: string;
  x: number;
  y: number;
  rot: number;
  /** 뒤쪽(먼 쪽) 파츠는 어둡게 */
  far: boolean;
}

const rad = (d: number): number => (d * Math.PI) / 180;

function rot(p: Pt, a: number): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

function along(p: Pt, a: number, len: number): Pt {
  return [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
}

/** 두 뼈 IK. bend +1이면 관절이 (오른쪽을 볼 때) 시계 방향 쪽으로 굽는다. */
function ik(s: Pt, t: Pt, l1: number, l2: number, bend: number): { mid: Pt; end: Pt; a1: number; a2: number } {
  const dx = t[0] - s[0];
  const dy = t[1] - s[1];
  const d = Phaser.Math.Clamp(Math.hypot(dx, dy), 0.001, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const cosA = Phaser.Math.Clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a1 = a + bend * Math.acos(cosA);
  const mid: Pt = along(s, a1, l1);
  const end: Pt = [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d];
  return { mid, end, a1, a2: Math.atan2(end[1] - mid[1], end[0] - mid[0]) };
}

const FAR_TINT = 0x8a7a88;

function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 자세와 시간에서 모든 파츠의 배치(그리는 순서대로)와 입 위치를 구한다. */
export function solveDragon(def: DragonRigDef, p: DragonPose, time: number): { parts: Placed[]; mouth: Pt; mouthAng: number; chest: Pt } {
  const out: Placed[] = [];
  const put = (key: string, at: Pt, r: number, far = false): void => {
    out.push({ key, x: at[0], y: at[1], rot: r, far });
  };
  const br = rad(p.rot);
  const c: Pt = [p.bx, p.by];
  const at = (q: Pt): Pt => {
    const r = rot(q, br);
    return [c[0] + r[0], c[1] + r[1]];
  };

  // 날개: 어깨 → 팔꿈치 → 날개 끝. 날갯짓은 어깨 각도를 위아래로 흔든다.
  const flapWave = Math.sin(time * 9) * p.flap;
  const wingA = br + rad(p.wing + flapWave * 38);
  const elbow = rad(-(30 + p.fold * 110) - flapWave * 26);
  const sh = at(def.shoulder);
  const wingPieces = (far: boolean): void => {
    const i = far ? 1 : 0;
    // 먼 날개는 조금 뒤로, 조금 늦게 움직인다.
    const a1 = wingA + (far ? rad(-12) : 0);
    const a2 = a1 + elbow * (far ? 0.9 : 1);
    const s0: Pt = far ? [sh[0] - 3, sh[1] - 1] : sh;
    const e: Pt = along(s0, a1, def.wing.innerLen);
    put(def.wing.inner[i], s0, a1, far);
    put(def.wing.outer[i], e, a2, far);
  };
  wingPieces(true);

  // 다리 (먼 쪽 먼저): 뒷다리는 무릎이 앞으로, 앞다리는 팔꿈치가 뒤로 굽는다.
  const legParts = (root: Pt, foot: Pt, l: NonNullable<DragonRigDef['arm']>, bend: number, far: boolean): void => {
    const i = far ? 1 : 0;
    const r = at(root);
    const s: Pt = far ? [r[0] - 2, r[1] - 1] : r;
    const f: Pt = far ? [foot[0] + 5, foot[1]] : foot;
    const k = ik(s, f, l.thighLen, l.shinLen, bend);
    put(l.thigh[i], s, k.a1, far);
    put(l.shin[i], k.mid, k.a2, far);
    put(l.foot[i], k.end, 0, far);
  };
  legParts(def.legB, [p.bFx, p.bFy], def.leg, -1, true);
  if (def.legF && def.arm) legParts(def.legF, [p.fFx, p.fFy], def.arm, 1, true);

  // 꼬리: 엉덩이에서 뒤로, 끝으로 갈수록 크게 흔들린다.
  let tp = at(def.hip);
  let ta = br + Math.PI - rad(p.tail);
  const tailParts: Placed[] = [];
  def.tail.keys.forEach((key, i) => {
    const wave = Math.sin(time * 2.2 - i * 0.7) * rad(p.tailAmp) * (0.4 + i * 0.25);
    ta += (i === 0 ? 0 : -rad(p.tailCurl)) + wave * 0.5;
    tailParts.push({ key, x: tp[0], y: tp[1], rot: ta, far: false });
    tp = along(tp, ta, def.tail.lens[i]);
  });
  // 꼬리 끝 마디가 몸통 아래에 깔리도록 끝부터 그린다.
  for (let i = tailParts.length - 1; i >= 0; i--) out.push(tailParts[i]);

  put(def.torso, c, br);

  // 목과 머리
  let np = at(def.chest);
  let na = br + rad(p.neck);
  for (const key of def.neck.keys) {
    put(key, np, na);
    np = along(np, na, def.neck.len);
    na += rad(p.curl);
  }
  const ha = na - rad(p.curl) + rad(p.head);
  const jawPos = (() => {
    const r = rot(def.jawAt, ha);
    return [np[0] + r[0], np[1] + r[1]] as Pt;
  })();
  put(def.jaw, jawPos, ha + rad(p.jaw));
  put(def.head, np, ha);
  const m = rot(def.mouth, ha);
  const mouth: Pt = [np[0] + m[0], np[1] + m[1]];

  // 가까운 다리와 날개
  legParts(def.legB, [p.bFx, p.bFy], def.leg, -1, false);
  if (def.legF && def.arm) legParts(def.legF, [p.fFx, p.fFy], def.arm, 1, false);
  wingPieces(false);

  return { parts: out, mouth, mouthAng: ha + rad(p.jaw * 0.5), chest: at(def.chest) };
}

/** 리그를 캔버스 하나에 그린다 (이야기책 그림, 새끼 용 시트). 돌려주는 캔버스는 여백 없이 잘라 낸다. */
export function drawDragon(scene: Phaser.Scene, def: DragonRigDef, pose: DragonPose, time: number, scale = 1): HTMLCanvasElement {
  const { parts } = solveDragon(def, pose, time);
  const S = 400;
  const full = document.createElement('canvas');
  full.width = S;
  full.height = S;
  const g = full.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  for (const q of parts) {
    const img = scene.textures.get(q.key).getSourceImage() as HTMLCanvasElement;
    const [px, py] = pivotOf(q.key);
    g.save();
    g.translate(S / 2 + q.x * scale, S * 0.75 + q.y * scale);
    g.rotate(q.rot);
    g.scale(scale, scale);
    if (q.far) g.filter = 'brightness(0.62)';
    g.drawImage(img, -px, -py);
    g.restore();
  }
  const { data } = g.getImageData(0, 0, S, S);
  let x0 = S;
  let y0 = S;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (data[(y * S + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const c = document.createElement('canvas');
  c.width = Math.max(1, x1 - x0 + 1);
  c.height = Math.max(1, y1 - y0 + 1);
  c.getContext('2d')!.drawImage(full, -x0, -y0);
  return c;
}

/** 전투 중 리그: 파츠 이미지를 컨테이너에 두고 매 프레임 다시 배치한다. */
export class DragonRig {
  readonly root: Phaser.GameObjects.Container;
  private imgs: Phaser.GameObjects.Image[] = [];
  private far: boolean[] = [];
  pose: DragonPose;
  facing: 1 | -1 = 1;
  time = 0;
  private mouthPt: Pt = [0, 0];
  private mouthA = 0;
  private chestPt: Pt = [0, 0];
  private maskShape: Phaser.GameObjects.Graphics;

  constructor(
    readonly scene: Phaser.Scene,
    readonly def: DragonRigDef,
    pose: DragonPose,
    depth = DEPTH.monster,
  ) {
    this.pose = { ...pose };
    this.root = scene.add.container(0, 0).setDepth(depth).setScale(def.scale);
    // 파츠 수는 자세와 상관없이 같으므로 처음 한 번 풀어서 이미지를 만든다.
    const { parts } = solveDragon(def, this.pose, 0);
    for (const q of parts) {
      const [px, py] = pivotOf(q.key);
      const img = scene.add.image(0, 0, q.key);
      img.setOrigin(px / img.width, py / img.height);
      if (q.far) img.setTint(FAR_TINT);
      this.imgs.push(img);
      this.far.push(q.far);
      this.root.add(img);
    }
    // 땅 아래로 내려간 부분(꼬리 끝, 발톱)은 가린다.
    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillStyle(0xffffff).fillRect(-200, -2000, 100000, FLOOR_Y + 4 + 2000);
    this.root.setMask(this.maskShape.createGeometryMask());
  }

  destroy(): void {
    this.root.destroy();
    this.maskShape.destroy();
  }

  /** 리그 좌표 → 화면 좌표 */
  world(p: Pt): { x: number; y: number } {
    return { x: this.root.x + p[0] * this.def.scale * this.facing, y: this.root.y + p[1] * this.def.scale };
  }

  /** 입 위치 (화면 좌표)와 입이 향하는 각도 (화면 기준 라디안) */
  mouth(): { x: number; y: number; ang: number } {
    const w = this.world(this.mouthPt);
    const a = this.facing === 1 ? this.mouthA : Math.PI - this.mouthA;
    return { ...w, ang: a };
  }

  chest(): { x: number; y: number } {
    return this.world(this.chestPt);
  }

  update(x: number, y: number, facing: 1 | -1, dt: number): void {
    this.time += dt;
    this.facing = facing;
    this.root.setPosition(Math.round(x), Math.round(y));
    this.root.setScale(this.def.scale * facing, this.def.scale);
    const { parts, mouth, mouthAng, chest } = solveDragon(this.def, this.pose, this.time);
    this.mouthPt = mouth;
    this.mouthA = mouthAng;
    this.chestPt = chest;
    parts.forEach((q, i) => this.imgs[i]?.setPosition(q.x, q.y).setRotation(q.rot));
  }

  /** 온몸에 섞는 색과 그 세기 (격노, 숨 들이쉬기) */
  private glowColor = 0xffffff;
  private glowK = 0;

  /** 온몸을 한 색으로 물들인다. k가 0이면 원래대로. */
  glow(color: number, k: number): void {
    this.glowColor = color;
    this.glowK = Phaser.Math.Clamp(k, 0, 1);
  }

  /** 맞았을 때 번쩍임·투명도를 본체 스프라이트에서 따라 하고, 물든 색을 입힌다. */
  mirror(sprite: Phaser.GameObjects.Sprite): void {
    this.root.setAlpha(sprite.alpha);
    const white = sprite.isTinted && sprite.tintFill;
    this.imgs.forEach((img, i) => {
      if (white) {
        img.setTintFill(0xffffff);
        return;
      }
      const base = this.far[i] ? FAR_TINT : 0xffffff;
      const tint = this.glowK > 0 ? mixColor(base, this.glowColor, this.glowK) : base;
      if (tint === 0xffffff) img.clearTint();
      else img.setTint(tint);
    });
  }

  /** 잔상: 지금 모습을 복사해 색을 입히고 서서히 지운다. */
  ghost(color: number, alpha = 0.5, ms = 220): void {
    const r = this.root;
    const g = this.scene.add.container(r.x, r.y).setScale(r.scaleX, r.scaleY).setDepth(r.depth - 1);
    for (const img of this.imgs) {
      g.add(this.scene.add.image(img.x, img.y, img.texture.key).setOrigin(img.originX, img.originY).setRotation(img.rotation).setTintFill(color).setBlendMode(Phaser.BlendModes.ADD));
    }
    g.setAlpha(alpha);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }
}

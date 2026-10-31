import Phaser from 'phaser';
import type { WeaponType } from '../data/weapons';

// 주인공 도트는 칼을 든 기사 하나뿐이라, 직업마다 기사 시트를 다시 칠해 쓴다.
// 망토·갑옷 색을 바꾸고, 칸마다 머리 위치를 찾아 직업 소품을 얹고, 원거리 직업은 무기를 등에 멘다.
// 원본 시트는 그대로 두고 부팅할 때 캔버스로 새 텍스처를 만든다. 모든 그림은 오른쪽을 보는 방향이다.

const HERO_ANIMS = ['hero-idle', 'hero-run', 'hero-jump', 'hero-attack', 'hero-hurt', 'hero-crouch', 'hero-crouch-slash', 'hero-jump-attack'];

/** 원거리 직업이 쏘거나 겨눌 때의 자세. 공격 시트 4번째 칸(팔을 앞으로 뻗음)에서 칼을 지워 만든다. */
export const AIM_ANIM = 'hero-aim';
const AIM_FRAME = 3;
/** 조준 칸에서 칼날이 시작하는 x (이 오른쪽은 지운다) */
const AIM_BLADE_X = 66;
/** 조준 칸의 크기와 손 위치 */
const AIM_W = 96;
const AIM_H = 48;
export const AIM_ORIGIN_X = 46 / AIM_W;
/** 발끝 기준점에서 손까지 (오른쪽을 볼 때) */
export const AIM_HAND = { x: 64 - 46, y: 18 - AIM_H };

const OUTLINE = 0x130a1b;

/** 원본 색 → 직업 색. 망토(밝음·어두움 2), 갑옷(밝음·중간·어두움) */
const CAPE = [0xed053e, 0x810936, 0x800735];
const TRIM = [0xffcc61, 0xbc6c17, 0x983e1d];

interface ClassLook {
  cape?: [number, number, number];
  trim?: [number, number, number];
  /** 그 밖의 색 바꾸기 (피부·머리 등) [원본, 바꿀 색] */
  extra?: [number, number][];
  hat?: (d: Painter, cx: number, top: number) => void;
  back?: (d: Painter, cx: number, top: number) => void;
}

/** 칸 하나에 그리는 도구. behind는 빈 픽셀에만 칠한다 (몸 뒤에 있는 것처럼). */
interface Painter {
  px(x: number, y: number, color: number): void;
  behind(x: number, y: number, color: number): void;
}

function line(d: Painter, x0: number, y0: number, x1: number, y1: number, color: (i: number) => number, back = true): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    if (back) d.behind(x, y, color(i));
    else d.px(x, y, color(i));
  }
}

function rect(d: Painter, x0: number, y0: number, x1: number, y1: number, color: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d.px(x, y, color);
}

const LOOKS: Record<Exclude<WeaponType, 'sword'>, ClassLook> = {
  // 도객: 남색 망토, 은빛 갑옷, 휘날리는 머리띠
  dao: {
    cape: [0x3a6fd8, 0x1f3a7a, 0x1e3878],
    trim: [0xe6ebf2, 0x9aa6b8, 0x5c6678],
    hat: (d, cx, top) => {
      rect(d, cx - 4, top + 3, cx + 3, top + 3, 0xf4f6fa);
      rect(d, cx - 4, top + 4, cx + 3, top + 4, 0x8a96aa);
      d.px(cx - 5, top + 4, 0xf4f6fa);
      d.px(cx - 6, top + 5, 0xf4f6fa);
      d.px(cx - 7, top + 5, 0x8a96aa);
      d.px(cx - 8, top + 6, 0x8a96aa);
    },
  },
  // 궁수: 숲색 망토, 가죽 갑옷, 후드, 등에 멘 활
  bow: {
    cape: [0x4fa34a, 0x2a5e2e, 0x295c2d],
    trim: [0xd9b47a, 0x9a7040, 0x6b4a2a],
    hat: (d, cx, top) => {
      rect(d, cx - 4, top - 1, cx + 2, top - 1, OUTLINE);
      rect(d, cx - 5, top, cx + 3, top + 4, 0x2a5e2e);
      rect(d, cx - 3, top, cx + 1, top, 0x4fa34a);
      rect(d, cx - 4, top + 1, cx + 2, top + 1, 0x3f8a3c);
      rect(d, cx - 6, top + 2, cx - 5, top + 8, 0x2a5e2e);
      d.px(cx - 6, top + 1, OUTLINE);
      d.px(cx - 7, top + 3, OUTLINE);
    },
    back: (d, cx, top) => {
      line(d, cx - 9, top + 3, cx + 1, top + 23, (i) => (i % 4 === 0 ? 0x7a4a22 : 0xd09858));
      line(d, cx - 8, top + 3, cx + 2, top + 23, () => 0xf0c890);
      line(d, cx - 10, top + 5, cx - 1, top + 23, () => 0xe8e0d0);
    },
  },
  // 총잡이: 갈색 코트, 놋쇠 장식(원래 금색), 챙 모자, 등에 멘 장총
  gun: {
    cape: [0xa8673a, 0x5e3820, 0x5c3720],
    hat: (d, cx, top) => {
      rect(d, cx - 3, top - 3, cx + 2, top - 3, OUTLINE);
      rect(d, cx - 3, top - 2, cx + 2, top + 1, 0x6b4226);
      rect(d, cx - 2, top - 2, cx + 1, top - 2, 0x8a5a34);
      rect(d, cx - 3, top + 1, cx + 2, top + 1, 0xd0a050);
      rect(d, cx - 6, top + 2, cx + 6, top + 2, 0x4a2c18);
      rect(d, cx - 5, top + 3, cx + 5, top + 3, OUTLINE);
    },
    back: (d, cx, top) => {
      line(d, cx - 10, top + 2, cx + 2, top + 22, (i) => (i < 13 ? 0x5a616b : 0xa86a34));
      line(d, cx - 9, top + 2, cx + 3, top + 22, (i) => (i < 13 ? 0xb8c0ca : 0x6a4220));
    },
  },
  // 마법사: 보라 로브, 청록 장식, 고깔모자, 등에 멘 스태프
  staff: {
    cape: [0x8a4fe0, 0x46247a, 0x452378],
    trim: [0x7fe8ff, 0x3aa0c8, 0x246a8a],
    hat: (d, cx, top) => {
      rect(d, cx - 5, top + 2, cx + 4, top + 2, 0x46247a);
      rect(d, cx - 4, top + 3, cx + 3, top + 3, OUTLINE);
      rect(d, cx - 3, top + 1, cx + 2, top + 1, 0x8a4fe0);
      rect(d, cx - 3, top, cx + 1, top, 0x8a4fe0);
      rect(d, cx - 3, top - 1, cx, top - 1, 0x8a4fe0);
      rect(d, cx - 3, top - 2, cx - 1, top - 2, 0x8a4fe0);
      rect(d, cx - 4, top - 3, cx - 2, top - 3, 0x6a38b8);
      rect(d, cx - 5, top - 4, cx - 3, top - 4, 0x6a38b8);
      rect(d, cx - 6, top - 5, cx - 5, top - 5, 0x46247a);
      d.px(cx - 4, top + 1, 0x46247a);
      d.px(cx - 4, top, 0x46247a);
      d.px(cx - 1, top, 0x7fe8ff);
    },
    back: (d, cx, top) => {
      line(d, cx - 10, top - 3, cx + 3, top + 26, (i) => (i % 7 === 3 ? 0x6a4220 : 0xb07840));
      rect(d, cx - 12, top - 7, cx - 10, top - 5, 0x3fc8ff);
      d.px(cx - 11, top - 6, 0xbff0ff);
    },
  },
};

/** 머리카락 색 (칸마다 머리 위치를 찾는 데 쓴다) */
const HAIR = new Set([0xffd9b9, 0xffdbb9, 0xaf9785, 0xc69985]);

/** 머리 위로 든 칼을 머리카락으로 잘못 읽는 칸은 직접 정한다. [시트][칸] = [x, y] */
const HEAD_OVERRIDE: Record<string, Record<number, [number, number]>> = {
  'hero-jump-attack': { 4: [45, 18], 5: [45, 18] },
};

function findHead(data: Uint8ClampedArray, width: number, fx: number, fw: number, fh: number): [number, number] | null {
  const hair = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4;
    return data[i + 3] > 0 && HAIR.has((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  };
  for (let y = 0; y < fh; y++) {
    let found = false;
    for (let x = fx; x < fx + fw && !found; x++) found = hair(x, y);
    if (!found) continue;
    let sum = 0;
    let n = 0;
    for (let yy = y; yy < Math.min(fh, y + 5); yy++) {
      for (let x = fx; x < fx + fw; x++) {
        if (hair(x, yy)) {
          sum += x - fx;
          n++;
        }
      }
    }
    return [Math.round(sum / n), y];
  }
  return null;
}

export function classAnimKey(cls: WeaponType, base: string): string {
  return cls === 'sword' && base !== AIM_ANIM ? base : `${cls}:${base}`;
}

/** 애니메이션 키에서 직업 접두사를 뗀다. */
export function baseAnimKey(key: string): string {
  const i = key.indexOf(':');
  return i < 0 ? key : key.slice(i + 1);
}

interface SheetOpts {
  look: ClassLook;
  /** 칸 범위 (조준 자세는 공격 시트의 한 칸만 쓴다) */
  frames?: number[];
  /** 등에 멘 무기를 그린다 */
  back: boolean;
  /** 이 x 오른쪽을 지운다 (칼날) */
  eraseFrom?: number;
}

function buildSheet(scene: Phaser.Scene, srcKey: string, dstKey: string, opts: SheetOpts): void {
  const src = scene.textures.get(srcKey);
  const img = src.getSourceImage() as HTMLImageElement;
  const fw = src.get(0).width;
  const fh = src.get(0).height;
  const all = Array.from({ length: Math.floor(img.width / fw) }, (_, i) => i);
  const frames = opts.frames ?? all;

  const canvas = document.createElement('canvas');
  canvas.width = fw * frames.length;
  canvas.height = fh;
  const ctx = canvas.getContext('2d')!;
  frames.forEach((f, i) => ctx.drawImage(img, f * fw, 0, fw, fh, i * fw, 0, fw, fh));
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const W = canvas.width;

  // 색 바꾸기
  const map = new Map<number, number>();
  opts.look.cape?.forEach((c, i) => map.set(CAPE[i], c));
  opts.look.trim?.forEach((c, i) => map.set(TRIM[i], c));
  opts.look.extra?.forEach(([from, to]) => map.set(from, to));

  frames.forEach((f, i) => {
    const fx = i * fw;
    const head = HEAD_OVERRIDE[srcKey]?.[f] ?? findHead(data, W, fx, fw, fh);
    const inFrame = (x: number, y: number): boolean => x >= 0 && x < fw && y >= 0 && y < fh;
    const painter: Painter = {
      px(x, y, color) {
        if (!inFrame(x, y)) return;
        const k = (y * W + fx + x) * 4;
        data[k] = (color >> 16) & 255;
        data[k + 1] = (color >> 8) & 255;
        data[k + 2] = color & 255;
        data[k + 3] = 255;
      },
      behind(x, y, color) {
        if (!inFrame(x, y) || data[(y * W + fx + x) * 4 + 3] > 0) return;
        this.px(x, y, color);
      },
    };

    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const k = (y * W + fx + x) * 4;
        if (data[k + 3] === 0) continue;
        if (opts.eraseFrom !== undefined && x >= opts.eraseFrom) {
          data[k + 3] = 0;
          continue;
        }
        const to = map.get((data[k] << 16) | (data[k + 1] << 8) | data[k + 2]);
        if (to !== undefined) {
          data[k] = (to >> 16) & 255;
          data[k + 1] = (to >> 8) & 255;
          data[k + 2] = to & 255;
        }
      }
    }
    if (!head) return;
    const [cx, top] = head;
    if (opts.back) opts.look.back?.(painter, cx, top);
    opts.look.hat?.(painter, cx, top);
  });
  ctx.putImageData(image, 0, 0);

  const tex = scene.textures.addCanvas(dstKey, canvas)!;
  frames.forEach((_, i) => tex.add(i, 0, i * fw, 0, fw, fh));
}

/** 원본 애니메이션과 같은 설정으로 새 텍스처의 애니메이션을 만든다. */
function copyAnim(scene: Phaser.Scene, base: string, texKey: string, animKey: string): void {
  const a = scene.anims.get(base);
  scene.anims.create({
    key: animKey,
    frames: a.frames.map((fr) => ({ key: texKey, frame: Number(fr.textureFrame) })),
    frameRate: a.frameRate,
    repeat: a.repeat,
  });
}

// ───────── 군단장: 주인공 그림을 바탕으로 만든 보스 ─────────

/** 침묵의 기사단장: 보라 망토, 검은 강철 갑옷, 보랏빛이 새어 나오는 닫힌 투구와 보라 깃털 */
const KNIGHT_LOOK: ClassLook = {
  cape: [0x8a3ad8, 0x4a1a7a, 0x481978],
  trim: [0x6a6878, 0x3a3846, 0x24222c],
  hat: (d, cx, top) => {
    // 투구 뒤로 흩날리는 보라 깃털
    line(d, cx - 1, top - 2, cx - 9, top + 1, (i) => (i % 3 === 0 ? 0xc070ff : 0x8a3ad8));
    line(d, cx - 1, top - 1, cx - 8, top + 3, () => 0x5a2090);
    rect(d, cx - 4, top - 1, cx + 3, top - 1, OUTLINE);
    rect(d, cx - 5, top, cx + 4, top + 8, 0x2a2834);
    rect(d, cx - 4, top, cx + 2, top, 0x5a5868);
    rect(d, cx - 5, top + 1, cx - 5, top + 7, 0x3a3846);
    // 눈구멍: 보랏빛
    rect(d, cx - 2, top + 4, cx + 4, top + 4, 0x120a1a);
    d.px(cx + 1, top + 4, 0xd090ff);
    d.px(cx + 3, top + 4, 0xd090ff);
    rect(d, cx + 4, top + 1, cx + 4, top + 8, 0x1a1822);
    rect(d, cx - 5, top + 9, cx + 4, top + 9, OUTLINE);
  },
};

/** 타락한 엘프: 창백한 라벤더빛 피부, 은발, 뾰족한 귀, 타락한 청록 망토, 초록으로 빛나는 눈 */
const ELF_LOOK: ClassLook = {
  cape: [0x2a8a72, 0x123a36, 0x113834],
  trim: [0xc8c0e0, 0x6a608a, 0x3a3456],
  extra: [
    [0xffd9b9, 0xd8d0ec],
    [0xffc98b, 0xb8b0d8],
    [0xe1924d, 0x8a80b0],
    [0xaf9785, 0xf0f0ff],
    [0x966495, 0xb0b0d0],
    [0x671915, 0x2a1a3a],
    [0x691a17, 0x2a1a3a],
  ],
  hat: (d, cx, top) => {
    // 뒤로 길게 뻗은 뾰족한 귀
    line(d, cx - 3, top + 5, cx - 8, top + 1, (i) => (i < 2 ? 0xb8b0d8 : 0xd8d0ec), false);
    d.px(cx - 9, top, OUTLINE);
    // 이마의 은빛 서클릿과 독기 서린 초록 눈빛
    rect(d, cx - 4, top + 2, cx + 3, top + 2, 0x8a88a8);
    d.px(cx, top + 2, 0x7aff9a);
    d.px(cx + 2, top + 4, 0x7aff9a);
  },
};

/** 암흑의 군주: 칠흑 로브, 낡은 금장, 잿빛 피부, 검은 머리, 뒤로 휜 뿔과 금관, 보랏빛 눈 */
const DARKLORD_LOOK: ClassLook = {
  cape: [0x2a1a3a, 0x140a20, 0x120a1e],
  trim: [0xd8b04a, 0x8a6a2a, 0x5a3a1a],
  extra: [
    [0xffd9b9, 0xb8b0c0],
    [0xffc98b, 0x9a90a8],
    [0xe1924d, 0x6a6080],
    [0xaf9785, 0x2a2234],
    [0x966495, 0x1a1424],
    [0x671915, 0x1a0a2a],
    [0x691a17, 0x1a0a2a],
  ],
  hat: (d, cx, top) => {
    // 뒤로 휘어 솟은 뿔
    line(d, cx - 3, top + 1, cx - 7, top - 4, (i) => (i < 2 ? 0x4a4058 : 0x8a8098));
    line(d, cx + 2, top + 1, cx + 1, top - 4, (i) => (i < 2 ? 0x4a4058 : 0x8a8098));
    d.px(cx - 8, top - 5, OUTLINE);
    d.px(cx + 1, top - 5, OUTLINE);
    // 가시 금관
    rect(d, cx - 4, top, cx + 3, top, 0xd8b04a);
    d.px(cx - 4, top - 1, 0xd8b04a);
    d.px(cx - 1, top - 1, 0xffe08a);
    d.px(cx + 3, top - 1, 0xd8b04a);
    d.px(cx - 1, top + 1, 0xb04aff);
    // 보랏빛으로 타는 눈
    d.px(cx + 1, top + 4, 0xd090ff);
    d.px(cx + 3, top + 4, 0xd090ff);
  },
};

const LEGION_LOOKS: Record<string, ClassLook> = { knight: KNIGHT_LOOK, elf: ELF_LOOK, darklord: DARKLORD_LOOK };

/** 군단장 그림: knight:hero-run 처럼 '군단장:원본' 키로 텍스처와 애니메이션을 만든다. */
export function createLegionSprites(scene: Phaser.Scene): void {
  for (const [id, look] of Object.entries(LEGION_LOOKS)) {
    for (const base of HERO_ANIMS) {
      const tex = `${id}:${base}`;
      if (scene.textures.exists(tex)) continue;
      buildSheet(scene, base, tex, { look, back: false });
      copyAnim(scene, base, tex, tex);
    }
  }
}

export function createClassSprites(scene: Phaser.Scene): void {
  if (scene.anims.exists(classAnimKey('sword', AIM_ANIM))) return;
  const ranged: WeaponType[] = ['bow', 'gun', 'staff'];
  for (const cls of ['sword', 'dao', 'bow', 'gun', 'staff'] as WeaponType[]) {
    const look: ClassLook = cls === 'sword' ? {} : LOOKS[cls];
    if (cls !== 'sword') {
      for (const base of HERO_ANIMS) {
        const tex = `${cls}:${base}`;
        buildSheet(scene, base, tex, { look, back: ranged.includes(cls) });
        copyAnim(scene, base, tex, tex);
      }
    }
    // 조준 자세: 칼을 지우고 무기는 손에 따로 든다 (등에는 없다).
    const aim = classAnimKey(cls, AIM_ANIM);
    buildSheet(scene, 'hero-attack', aim, { look, frames: [AIM_FRAME], back: false, eraseFrom: AIM_BLADE_X });
    scene.anims.create({ key: aim, frames: [{ key: aim, frame: 0 }], frameRate: 1, repeat: -1 });
  }
}

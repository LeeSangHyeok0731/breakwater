import type { WeaponDef } from '../data/weapons';

// 무기마다 다른 도트 그림. 같은 그리기 함수로
// 1) 전투에서 손에 드는 그림(활·총·스태프, weaponSprites.ts가 Phaser 텍스처로 등록)과
// 2) 화면 UI의 무기 아이콘(캔버스 → data URL)을 만든다. Phaser 없이도 쓸 수 있다.
// 손에 드는 그림은 오른쪽을 보는 방향이고, 손잡이 위치가 기준점이다.

export type Px = (x: number, y: number, color: number) => void;

function rect(px: Px, color: number, x: number, y: number, w = 1, h = 1): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, color);
}

/** 그림 크기, 손잡이 위치, 무기 끝(손잡이 기준) */
export interface HeldDef {
  w: number;
  h: number;
  grip: [number, number];
  tip: { x: number; y: number };
}

// ───────────────────────── 활 ─────────────────────────

interface BowPalette {
  wood: number;
  dark: number;
  light: number;
  tip: number;
  string: number;
  /** 활 끝에 다는 깃털 (바람의 장궁) */
  plume?: number;
}

const BOWS: Record<string, BowPalette> = {
  hunting: { wood: 0xd09858, dark: 0x7a4a22, light: 0xf0c890, tip: 0xf6d68e, string: 0xe8e0d0 },
  gale: { wood: 0xd8eedc, dark: 0x3a7a4a, light: 0xffffff, tip: 0x6af0a0, string: 0xe0fff0, plume: 0x6af0a0 },
  seraph: { wood: 0xfff4e0, dark: 0xc8a050, light: 0xffffff, tip: 0xffe08a, string: 0xfff0c0, plume: 0xffffff },
  abyss: { wood: 0x5a3a78, dark: 0x2a1a3a, light: 0xb080e0, tip: 0xd060ff, string: 0xe08aff, plume: 0xb040ff },
};

export const BOW_HELD: HeldDef = { w: 20, h: 32, grip: [8, 16], tip: { x: 12, y: 0 } };

/** 활: 시위를 당긴 정도(0, 1, 2). 크기 20×32, 손잡이 (8, 16). */
function drawBow(px: Px, style: string, pull: number): void {
  const c = BOWS[style] ?? BOWS.hunting;
  const pullX = 8 - pull * 3;
  // 활대: 손잡이(8,16)에서 위아래로 앞쪽으로 휘어진다.
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const x = 8 + Math.round(Math.sin(t * Math.PI * 0.55) * 6) - Math.round(t * t * 3);
    rect(px, i % 4 === 0 ? c.dark : c.wood, x, 16 - i, 3, 1);
    rect(px, i % 4 === 0 ? c.dark : c.wood, x, 16 + i, 3, 1);
    px(x + 2, 16 - i, c.light);
    px(x + 2, 16 + i, c.light);
  }
  rect(px, c.tip, 9, 0, 2, 2);
  rect(px, c.tip, 9, 30, 2, 2);
  if (c.plume) {
    // 활 끝의 깃털 장식
    rect(px, c.plume, 11, 1, 2, 1);
    rect(px, c.plume, 12, 2, 2, 1);
    rect(px, c.plume, 11, 30, 2, 1);
    rect(px, c.plume, 12, 29, 2, 1);
  }
  rect(px, c.dark, 7, 14, 3, 5);
  // 시위: 양끝에서 당긴 점까지
  const mid = { x: pullX, y: 16 };
  for (const end of [
    { x: 10, y: 1 },
    { x: 10, y: 31 },
  ]) {
    const steps = Math.abs(end.y - mid.y);
    for (let s = 0; s <= steps; s++) {
      px(Math.round(end.x + ((mid.x - end.x) * s) / steps), Math.round(end.y + ((mid.y - end.y) * s) / steps), c.string);
    }
  }
  // 당기는 중이면 화살을 건다.
  if (pull > 0) {
    rect(px, 0xb8a080, pullX, 16, 20 - pullX, 1);
    rect(px, 0xdfe6ee, 17, 15, 3, 3);
    rect(px, c.plume ?? 0xc83a2a, pullX, 15, 2, 3);
  }
}

// ───────────────────────── 총 ─────────────────────────

export const GUN_HELD: Record<string, HeldDef> = {
  // 리볼버: 18×10, 손잡이 (4, 7)
  revolver: { w: 18, h: 10, grip: [4, 7], tip: { x: 14, y: -4 } },
  // 장총: 30×10, 손잡이 (10, 7). 총신이 길고 개머리판과 조준경이 있다.
  rifle: { w: 30, h: 10, grip: [10, 7], tip: { x: 19, y: -4 } },
  // 마도 소총: 장총과 같은 틀에 룬이 새겨진 보랏빛 총신
  arcane: { w: 30, h: 10, grip: [10, 7], tip: { x: 19, y: -4 } },
  // 용의 포효: 30×12, 굵은 총신 끝이 용의 아가리
  dragon: { w: 30, h: 12, grip: [9, 9], tip: { x: 20, y: -4 } },
};

function drawGun(px: Px, style: string): void {
  if (style === 'arcane') {
    rect(px, 0x3a2448, 0, 4, 9, 3);
    rect(px, 0x5a3a70, 0, 4, 9, 1);
    rect(px, 0x2a1a30, 0, 7, 3, 2);
    rect(px, 0x4a3a6a, 8, 2, 19, 3);
    rect(px, 0x9a7ad8, 8, 2, 19, 1);
    for (const x of [12, 16, 20, 24]) px(x, 3, 0xd8a8ff);
    rect(px, 0xb070ff, 27, 1, 3, 5);
    rect(px, 0xf0d8ff, 28, 2, 1, 2);
    rect(px, 0x5a3a70, 9, 5, 4, 4);
    rect(px, 0x2a1a30, 9, 8, 4, 1);
    return;
  }
  if (style === 'dragon') {
    rect(px, 0x5a1a1a, 0, 6, 8, 3);
    rect(px, 0x8a2a1a, 0, 6, 8, 1);
    rect(px, 0x3a0a0a, 0, 9, 3, 2);
    rect(px, 0xb8301a, 7, 2, 18, 6);
    rect(px, 0xffb040, 7, 2, 18, 1);
    rect(px, 0x7a1a0a, 7, 7, 18, 1);
    for (const x of [10, 14, 18]) rect(px, 0xffd060, x, 3, 1, 4);
    // 용의 아가리: 위아래 턱과 이빨
    rect(px, 0xb8301a, 25, 1, 5, 2);
    rect(px, 0xb8301a, 25, 7, 5, 2);
    rect(px, 0x2a0a0a, 25, 3, 5, 4);
    for (const x of [26, 28]) {
      px(x, 3, 0xfff0c0);
      px(x + 1, 6, 0xfff0c0);
    }
    px(26, 1, 0xffd060);
    rect(px, 0x8a2a1a, 8, 8, 4, 4);
    rect(px, 0x3a0a0a, 8, 11, 4, 1);
    return;
  }
  if (style === 'rifle') {
    rect(px, 0x8a5a2a, 0, 4, 9, 3);
    rect(px, 0xb07840, 0, 4, 9, 1);
    rect(px, 0x5a3a1a, 0, 7, 3, 2);
    rect(px, 0x5a616b, 8, 2, 21, 3);
    rect(px, 0xb8c0ca, 8, 2, 21, 1);
    rect(px, 0x3a4048, 27, 2, 2, 3);
    rect(px, 0x2a2e34, 12, 0, 7, 2);
    rect(px, 0x9fd8ff, 18, 0, 1, 1);
    rect(px, 0x8a5a2a, 9, 5, 4, 4);
    rect(px, 0x5a3a1a, 9, 8, 4, 1);
    return;
  }
  rect(px, 0x5a616b, 4, 2, 13, 3);
  rect(px, 0xb8c0ca, 4, 2, 13, 1);
  rect(px, 0x7a828c, 7, 1, 5, 5);
  rect(px, 0xd0d6de, 8, 1, 3, 1);
  rect(px, 0x8a9098, 15, 1, 2, 1);
  rect(px, 0xa86a34, 2, 5, 4, 5);
  rect(px, 0x6a4220, 2, 9, 4, 1);
}

// ───────────────────────── 스태프 ─────────────────────────

/** 스태프: 8×36, 손잡이 (4, 22), 끝은 손잡이 위 22px */
export const STAFF_HELD: HeldDef = { w: 8, h: 36, grip: [4, 22], tip: { x: 0, y: -22 } };

function drawStaff(px: Px, style: string): void {
  if (style === 'rune') {
    // 룬 지팡이: 검은 나무 자루에 은 장식, 룬이 새겨지고 보랏빛 수정
    rect(px, 0x4a3050, 3, 8, 2, 28);
    rect(px, 0x7a5a88, 3, 8, 1, 28);
    for (const y of [13, 19, 25, 31]) rect(px, 0xd8a8ff, 3, y, 1, 2);
    rect(px, 0xc8ccd8, 1, 6, 6, 2);
    rect(px, 0xc8ccd8, 1, 3, 1, 3);
    rect(px, 0xc8ccd8, 6, 3, 1, 3);
    rect(px, 0x8a3ad8, 2, 0, 4, 6);
    rect(px, 0xb070ff, 2, 1, 3, 4);
    rect(px, 0xf0d8ff, 3, 1, 1, 2);
    return;
  }
  if (style === 'abyss') {
    // 심연의 홀: 검은 자루, 보랏빛 발톱이 감싼 심연의 눈
    rect(px, 0x2a1a30, 3, 9, 2, 27);
    rect(px, 0x5a3a70, 3, 9, 1, 27);
    for (const y of [16, 24, 32]) rect(px, 0xd060ff, 3, y, 2, 1);
    rect(px, 0x8a3ad8, 0, 2, 1, 7);
    rect(px, 0x8a3ad8, 7, 2, 1, 7);
    rect(px, 0x8a3ad8, 1, 8, 6, 1);
    rect(px, 0x8a3ad8, 1, 0, 1, 2);
    rect(px, 0x8a3ad8, 6, 0, 1, 2);
    rect(px, 0x3a0a4a, 1, 2, 6, 6);
    rect(px, 0xd060ff, 2, 3, 4, 4);
    rect(px, 0xffffff, 3, 4, 2, 2);
    px(4, 4, 0xff3a8a);
    return;
  }
  if (style === 'magma') {
    // 용암 심장 지팡이: 쇠 자루와 세 갈래 발톱이 끓는 용암 구슬을 쥐었다
    rect(px, 0x3a3438, 3, 9, 2, 27);
    rect(px, 0x6a6068, 3, 9, 1, 27);
    rect(px, 0xff6a1a, 3, 20, 2, 1);
    rect(px, 0xff6a1a, 4, 28, 1, 1);
    rect(px, 0x3a3438, 0, 3, 1, 6);
    rect(px, 0x3a3438, 7, 3, 1, 6);
    rect(px, 0x3a3438, 1, 8, 6, 1);
    rect(px, 0xc8301a, 1, 1, 6, 6);
    rect(px, 0xff7a1a, 2, 2, 4, 4);
    rect(px, 0xffd060, 3, 2, 2, 2);
    rect(px, 0xffffff, 3, 2, 1, 1);
    rect(px, 0x3a3438, 3, 0, 2, 1);
    return;
  }
  // 견습 마법사의 지팡이: 나무 자루와 금 장식, 하늘빛 수정
  rect(px, 0xb07840, 3, 8, 2, 28);
  rect(px, 0xe0a868, 3, 8, 1, 28);
  rect(px, 0x6a4220, 3, 14, 2, 1);
  rect(px, 0x6a4220, 3, 26, 2, 1);
  rect(px, 0xd8ae5a, 1, 6, 6, 2);
  rect(px, 0xd8ae5a, 1, 4, 1, 2);
  rect(px, 0xd8ae5a, 6, 4, 1, 2);
  rect(px, 0x3fc8ff, 2, 0, 4, 5);
  rect(px, 0xbff0ff, 3, 1, 2, 2);
}

// ───────────────────────── 무기별 생김새 ─────────────────────────

/** 무기 id → 원거리 그림 종류. 없으면 그 종류의 기본 그림 */
const HELD_STYLE: Record<string, string> = {
  hunting_bow: 'hunting',
  gale_bow: 'gale',
  old_revolver: 'revolver',
  hunter_rifle: 'rifle',
  apprentice_staff: 'apprentice',
  rune_staff: 'rune',
  magma_heart_staff: 'magma',
  seraph_bow: 'seraph',
  abyss_bow: 'abyss',
  arcane_rifle: 'arcane',
  dragon_cannon: 'dragon',
  abyss_scepter: 'abyss',
};

const DEFAULT_STYLE: Record<string, string> = { bow: 'hunting', gun: 'revolver', staff: 'apprentice' };

export function heldStyle(def: WeaponDef): string {
  return HELD_STYLE[def.id] ?? DEFAULT_STYLE[def.type] ?? '';
}

export const BOW_STYLES = Object.keys(BOWS);
export const GUN_STYLES = Object.keys(GUN_HELD);
export const STAFF_STYLES = ['apprentice', 'rune', 'magma', 'abyss'];

/** 손에 드는 그림 그리기 (활은 당긴 정도 pull) */
export function drawHeld(px: Px, type: 'bow' | 'gun' | 'staff', style: string, pull = 0): void {
  if (type === 'bow') drawBow(px, style, pull);
  else if (type === 'gun') drawGun(px, style);
  else drawStaff(px, style);
}

export function heldDef(type: 'bow' | 'gun' | 'staff', style: string): HeldDef {
  if (type === 'bow') return BOW_HELD;
  if (type === 'gun') return GUN_HELD[style] ?? GUN_HELD.revolver;
  return STAFF_HELD;
}

/**
 * 근접 무기의 개성: 휘두를 때 잔상 색과, 들고 있을 때 피어오르는 기운.
 * 칼은 주인공 그림에 그려져 있어 칼날 색을 바꿀 수 없으므로 잔상과 기운으로 구분한다.
 */
export interface MeleeLook {
  slash: number;
  aura?: 'flame' | 'moon' | 'steel' | 'blood' | 'holy' | 'thunder';
}

const MELEE_LOOK: Record<string, MeleeLook> = {
  training_sword: { slash: 0xbfe4ff },
  steel_sword: { slash: 0xe8f6ff, aura: 'steel' },
  lord_flame_sword: { slash: 0xff8a3a, aura: 'flame' },
  training_dao: { slash: 0xffd2a8 },
  moonlight_dao: { slash: 0xa8c8ff, aura: 'moon' },
  crimson_dao: { slash: 0xff3a4a, aura: 'blood' },
  holy_sword: { slash: 0xfff0b0, aura: 'holy' },
  thunder_dao: { slash: 0x9fe8ff, aura: 'thunder' },
};

export function meleeLook(def: WeaponDef): MeleeLook {
  return MELEE_LOOK[def.id] ?? { slash: def.type === 'dao' ? 0xffd2a8 : 0xbfe4ff };
}

/** 원거리 무기를 들고 있을 때 무기 끝에서 피어오르는 기운 */
export const RANGED_AURA: Record<string, number> = {
  gale: 0x9ff0c0,
  rune: 0xc890ff,
  magma: 0xff7a1a,
  seraph: 0xfff0c0,
  abyss: 0xd060ff,
  arcane: 0xb070ff,
  dragon: 0xff7a1a,
};

/** 원거리 무기의 화살 꼬리·총알 궤적 색 */
const SHOT_COLOR: Record<string, number> = {
  hunting: 0xe8dcc0,
  gale: 0xbff8d8,
  seraph: 0xffe08a,
  abyss: 0xd060ff,
  revolver: 0xffd890,
  rifle: 0xffd890,
  arcane: 0xc890ff,
  dragon: 0xff8a3a,
};

export function shotColor(def: WeaponDef): number {
  return SHOT_COLOR[heldStyle(def)] ?? 0xffd890;
}

// ───────────────────────── UI 아이콘 ─────────────────────────

interface BladeLook {
  blade: number;
  edge: number;
  fuller?: number;
  guard: number;
  grip: number;
  /** 도: 외날로 휘었다 */
  curved?: boolean;
  /** 칼날 주위 기운 */
  glow?: number;
}

const BLADES: Record<string, BladeLook> = {
  training_sword: { blade: 0x9aa2ac, edge: 0xd0d6de, guard: 0x7a4a22, grip: 0x5a3a1a },
  steel_sword: { blade: 0xc8d4e4, edge: 0xffffff, fuller: 0x7a9ac8, guard: 0xd8ae5a, grip: 0x3a2a4a },
  lord_flame_sword: { blade: 0xc8301a, edge: 0xffa040, fuller: 0xffd060, guard: 0x2a1a1a, grip: 0x5a1a1a, glow: 0xff7a1a },
  training_dao: { blade: 0x9aa2ac, edge: 0xd8dee6, guard: 0x7a4a22, grip: 0x4a2a1a, curved: true },
  moonlight_dao: { blade: 0xb8ccf0, edge: 0xffffff, guard: 0x8a9ac8, grip: 0x2a3050, curved: true, glow: 0x9fc0ff },
  crimson_dao: { blade: 0x8a1a2a, edge: 0xff5a6a, guard: 0x2a1a1a, grip: 0x4a0a1a, curved: true, glow: 0xff3a4a },
  holy_sword: { blade: 0xf0f4ff, edge: 0xffffff, fuller: 0xffd060, guard: 0xffd060, grip: 0x5a3a8a, glow: 0xfff0b0 },
  thunder_dao: { blade: 0x6a8ab0, edge: 0xdff8ff, fuller: 0x9fe8ff, guard: 0x2a3048, grip: 0x1a2030, curved: true, glow: 0x7fe8ff },
};

/** 칼 아이콘: 왼쪽 아래 손잡이에서 오른쪽 위로 뻗는 칼날 (32×32) */
function drawBladeIcon(px: Px, look: BladeLook): void {
  const along = (t: number): [number, number] => {
    // 손잡이(5,27) → 칼끝(28,4). 도는 칼등 쪽으로 살짝 휜다.
    const x = 5 + t * 23;
    const y = 27 - t * 23 - (look.curved ? Math.sin(t * Math.PI) * 3 : 0);
    return [Math.round(x), Math.round(y)];
  };
  if (look.glow !== undefined) {
    for (let i = 0; i <= 40; i++) {
      const t = 0.3 + (i / 40) * 0.7;
      const [x, y] = along(t);
      if (i % 3 === 0) px(x - 2, y - 2, look.glow);
      if (i % 4 === 1) px(x + 2, y + 2, look.glow);
    }
  }
  for (let i = 0; i <= 60; i++) {
    const t = 0.28 + (i / 60) * 0.72;
    const [x, y] = along(t);
    px(x, y, look.blade);
    px(x + 1, y, look.blade);
    px(x, y - 1, look.edge);
    if (look.fuller !== undefined && t < 0.85) px(x + 1, y + 1, look.fuller);
    else px(x + 1, y + 1, look.blade);
  }
  const [ex, ey] = along(1);
  px(ex, ey, look.edge);
  // 코등이와 손잡이
  const [gx, gy] = along(0.27);
  for (let k = -3; k <= 3; k++) px(gx + k, gy + k, look.guard);
  for (let i = 0; i <= 6; i++) {
    const [x, y] = along(0.04 + i * 0.033);
    px(x, y, look.grip);
    px(x + 1, y, look.grip);
  }
  const [px0, py0] = along(0);
  px(px0, py0, look.guard);
  px(px0 - 1, py0 + 1, look.guard);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx, ctx.createImageData(w, h)];
}

function painter(img: ImageData): Px {
  return (x, y, color) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return;
    const i = (iy * img.width + ix) * 4;
    img.data[i] = (color >> 16) & 255;
    img.data[i + 1] = (color >> 8) & 255;
    img.data[i + 2] = color & 255;
    img.data[i + 3] = 255;
  };
}

/** 손에 드는 그림을 캔버스로 그린다 (Phaser 텍스처 등록에도 쓴다). */
export function heldCanvas(type: 'bow' | 'gun' | 'staff', style: string, pull = 0): HTMLCanvasElement {
  const d = heldDef(type, style);
  const [c, ctx, img] = makeCanvas(d.w, d.h);
  drawHeld(painter(img), type, style, pull);
  ctx.putImageData(img, 0, 0);
  return c;
}

const iconCache = new Map<string, string>();

/** 무기 아이콘 (32×32 도트, data URL). 화면에서는 CSS로 확대해 그린다. */
export function weaponIconUrl(def: WeaponDef): string {
  const hit = iconCache.get(def.id);
  if (hit) return hit;
  const [c, ctx, img] = makeCanvas(32, 32);
  if (def.type === 'sword' || def.type === 'dao') {
    drawBladeIcon(painter(img), BLADES[def.id] ?? BLADES[def.type === 'dao' ? 'training_dao' : 'training_sword']);
    ctx.putImageData(img, 0, 0);
  } else {
    // 원거리는 손에 드는 그림을 비스듬히 눕혀 가운데에 놓는다.
    const src = heldCanvas(def.type, heldStyle(def));
    ctx.imageSmoothingEnabled = false;
    ctx.translate(16, 16);
    ctx.rotate(def.type === 'gun' ? -Math.PI / 6 : Math.PI / 4);
    // 대각선 길이가 아이콘을 꽉 채우도록 (작은 리볼버는 키우고 긴 활은 줄인다)
    const k = Math.min(1.5, 30 / Math.hypot(src.width, src.height));
    ctx.drawImage(src, (-src.width * k) / 2, (-src.height * k) / 2, src.width * k, src.height * k);
  }
  const url = c.toDataURL();
  iconCache.set(def.id, url);
  return url;
}

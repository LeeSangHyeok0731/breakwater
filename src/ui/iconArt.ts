import type { GearDef } from '../data/gear';
import type { PassiveDef } from '../data/passives';
import type { SkillDef } from '../data/skills';

/**
 * 방어구·장신구·스킬·패시브 아이콘 (32×32 도트, data URL). 무기 아이콘(weaponArt)과 같은 크기다.
 * 그림을 다 그린 뒤 바깥쪽에 어두운 외곽선을 한 겹 둘러 도트 느낌을 살린다.
 */

const S = 32;
const OUTLINE = 0x140c18;

class Canvas {
  readonly data = new Int32Array(S * S).fill(-1);

  px(x: number, y: number, c: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return;
    this.data[iy * S + ix] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  disc(cx: number, cy: number, r: number, c: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.px(x, y, c);
  }

  /** 각도 a0→a1(라디안, 0 = 오른쪽, 시계 방향)의 호 */
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: number, thick = 1): void {
    const steps = Math.ceil(Math.abs(a1 - a0) * r * 2) + 1;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      for (let t = 0; t < thick; t++) this.px(cx + Math.cos(a) * (r - t), cy + Math.sin(a) * (r - t), c);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number, thick = 1): void {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      if (thick <= 1) this.px(x, y, c);
      else this.disc(x, y, (thick - 1) / 2, c);
    }
  }

  /** 그려진 픽셀 바깥에 외곽선을 두른다. */
  outline(): void {
    const src = this.data.slice();
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (src[y * S + x] !== -1) continue;
        const near = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < S && ny < S && src[ny * S + nx] !== -1 && src[ny * S + nx] !== OUTLINE;
        });
        if (near) this.data[y * S + x] = OUTLINE;
      }
  }

  toUrl(): string {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = this.data[i];
      if (v === -1) continue;
      img.data[i * 4] = (v >> 16) & 255;
      img.data[i * 4 + 1] = (v >> 8) & 255;
      img.data[i * 4 + 2] = v & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const light = (c: number): number => mix(c, 0xffffff, 0.55);
const dark = (c: number): number => mix(c, 0x000000, 0.5);

const cache = new Map<string, string>();
function cached(key: string, draw: (g: Canvas) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Canvas();
  draw(g);
  g.outline();
  const url = g.toUrl();
  cache.set(key, url);
  return url;
}

// ───────────────────────── 방어구·장신구 ─────────────────────────

interface GearLook {
  shape: 'hood' | 'helm' | 'hat' | 'padded' | 'chain' | 'coat' | 'pants' | 'greaves' | 'boots' | 'ring' | 'necklace';
  base: number;
  accent: number;
}

const GEAR_LOOK: Record<string, GearLook> = {
  leather_hood: { shape: 'hood', base: 0x9a6a3a, accent: 0x6a4424 },
  iron_helm: { shape: 'helm', base: 0xa8b0c0, accent: 0x5a6070 },
  sage_hat: { shape: 'hat', base: 0x5a3a90, accent: 0xffd34a },
  padded_armor: { shape: 'padded', base: 0xb08a5a, accent: 0x7a5a34 },
  chain_mail: { shape: 'chain', base: 0x9aa4b4, accent: 0x5a6070 },
  wind_coat: { shape: 'coat', base: 0x4aa878, accent: 0xd8f0c0 },
  leather_pants: { shape: 'pants', base: 0x8a5a30, accent: 0x5a3a1c },
  steel_greaves: { shape: 'greaves', base: 0xb8c0d0, accent: 0x6a7080 },
  travel_boots: { shape: 'boots', base: 0x8a5a30, accent: 0xc8a070 },
  gale_boots: { shape: 'boots', base: 0x3a9a6a, accent: 0xbff8d8 },
  copper_ring: { shape: 'ring', base: 0xc87a3a, accent: 0x6ad0c0 },
  mana_ring: { shape: 'ring', base: 0xc8ccd8, accent: 0x5a8aff },
  bone_necklace: { shape: 'necklace', base: 0xe8dcc0, accent: 0x8a7a5a },
  elite_pendant: { shape: 'necklace', base: 0xffd34a, accent: 0xff3a6a },
};

const SLOT_SHAPE: Record<string, GearLook['shape']> = { head: 'helm', body: 'padded', legs: 'pants', feet: 'boots', ring: 'ring', necklace: 'necklace' };

function drawGear(g: Canvas, look: GearLook): void {
  const b = look.base;
  const a = look.accent;
  const hi = light(b);
  const lo = dark(b);
  switch (look.shape) {
    case 'hood':
      g.disc(16, 15, 10, b);
      g.rect(6, 15, 20, 10, b);
      g.disc(16, 17, 6, 0x2a1a14);
      g.rect(10, 17, 12, 8, 0x2a1a14);
      g.arc(16, 15, 9, Math.PI * 1.1, Math.PI * 1.6, hi, 2);
      g.rect(6, 25, 20, 2, lo);
      break;
    case 'helm':
      g.disc(16, 16, 10, b);
      g.rect(6, 16, 20, 9, b);
      g.rect(8, 17, 16, 2, 0x1a1a22);
      g.rect(15, 17, 2, 7, lo);
      g.arc(16, 16, 9, Math.PI * 1.1, Math.PI * 1.55, hi, 2);
      g.rect(6, 24, 20, 2, lo);
      g.rect(15, 5, 2, 3, a);
      break;
    case 'hat':
      g.line(16, 3, 9, 21, b, 3);
      g.line(16, 3, 23, 21, b, 3);
      g.rect(10, 12, 12, 10, b);
      g.rect(4, 21, 24, 4, lo);
      g.rect(10, 18, 12, 2, a);
      g.px(16, 10, a);
      g.px(15, 11, a);
      g.px(17, 11, a);
      g.px(16, 12, a);
      g.line(14, 6, 11, 16, hi);
      break;
    case 'padded':
    case 'chain':
    case 'coat': {
      // 몸통: 어깨가 넓고 허리가 좁은 상의
      const len = look.shape === 'coat' ? 26 : 22;
      g.rect(6, 6, 20, 6, b);
      g.rect(9, 6, 14, len, b);
      g.rect(3, 7, 5, 10, b);
      g.rect(24, 7, 5, 10, b);
      g.rect(14, 5, 4, 3, 0x2a1a14);
      if (look.shape === 'padded') {
        for (let y = 10; y < 6 + len; y += 4) g.rect(9, y, 14, 1, lo);
        g.rect(15, 8, 2, len - 2, a);
      } else if (look.shape === 'chain') {
        for (let y = 8; y < 6 + len; y += 2) for (let x = 10 + (y % 4 ? 1 : 0); x < 23; x += 2) g.px(x, y, lo);
        g.rect(9, 18, 14, 2, a);
      } else {
        g.line(14, 6, 11, 14, a, 2);
        g.line(18, 6, 21, 14, a, 2);
        g.rect(15, 14, 2, len - 8, lo);
        g.rect(9, 28, 14, 2, lo);
      }
      g.rect(9, 6, 2, len, hi);
      break;
    }
    case 'pants':
    case 'greaves':
      g.rect(8, 4, 16, 6, b);
      g.rect(8, 9, 7, 19, b);
      g.rect(17, 9, 7, 19, b);
      g.rect(8, 4, 16, 2, a);
      g.rect(8, 9, 2, 19, hi);
      g.rect(17, 9, 2, 19, hi);
      if (look.shape === 'greaves') {
        g.disc(11.5, 17, 3, light(b));
        g.disc(20.5, 17, 3, light(b));
        g.rect(8, 22, 7, 2, lo);
        g.rect(17, 22, 7, 2, lo);
      }
      break;
    case 'boots':
      for (const ox of [0, 12]) {
        g.rect(5 + ox, 6, 8, 16, b);
        g.rect(5 + ox, 20, 12, 6, b);
        g.rect(5 + ox, 26, 12, 2, lo);
        g.rect(5 + ox, 6, 8, 3, a);
        g.rect(5 + ox, 9, 2, 13, hi);
      }
      break;
    case 'ring':
      g.arc(16, 18, 9, 0, Math.PI * 2, b, 3);
      g.arc(16, 18, 9, Math.PI * 1.05, Math.PI * 1.45, hi, 1);
      g.disc(16, 9, 5, a);
      g.disc(15, 8, 2, light(a));
      g.rect(12, 12, 8, 2, lo);
      break;
    case 'necklace':
      g.arc(16, 6, 12, Math.PI * 0.15, Math.PI * 0.85, lo, 1);
      for (let i = 0; i < 9; i++) {
        const t = Math.PI * (0.18 + (i / 8) * 0.64);
        g.disc(16 + Math.cos(t) * 12, 6 + Math.sin(t) * 12, 1, b);
      }
      if (look.base === 0xe8dcc0) {
        // 뼈 목걸이: 송곳니 모양 펜던트
        g.line(16, 18, 16, 28, b, 3);
        g.line(14, 18, 18, 18, a, 2);
        g.px(16, 29, hi);
      } else {
        g.disc(16, 23, 5, b);
        g.disc(16, 23, 3, a);
        g.px(15, 22, light(a));
      }
      break;
  }
}

export function gearIconUrl(def: GearDef): string {
  return cached(`gear:${def.id}`, (g) => drawGear(g, GEAR_LOOK[def.id] ?? { shape: SLOT_SHAPE[def.slot] ?? 'ring', base: 0xa8a8b8, accent: 0xffd34a }));
}

// ───────────────────────── 스킬·패시브 문양 ─────────────────────────

type Motif =
  | 'slash'
  | 'upper'
  | 'flat'
  | 'multi'
  | 'whirl'
  | 'rings'
  | 'cross'
  | 'burst'
  | 'arrow'
  | 'fan'
  | 'rain'
  | 'bullets'
  | 'cross-hair'
  | 'orb'
  | 'amp'
  | 'shield'
  | 'snow'
  | 'bolt'
  | 'flame'
  | 'moon'
  | 'skull'
  | 'wind'
  | 'meteor'
  | 'beam'
  | 'grenade'
  | 'mag';

function drawMotif(g: Canvas, m: Motif, c: number): void {
  const hi = light(c);
  const lo = dark(c);
  switch (m) {
    case 'slash':
      g.arc(4, 30, 24, -Math.PI * 0.48, -Math.PI * 0.02, c, 4);
      g.arc(4, 30, 24, -Math.PI * 0.42, -Math.PI * 0.08, hi, 1);
      break;
    case 'upper':
      g.arc(30, 30, 22, Math.PI * 1.02, Math.PI * 1.48, c, 4);
      g.arc(30, 30, 22, Math.PI * 1.08, Math.PI * 1.42, hi, 1);
      g.line(26, 4, 26, 10, hi);
      g.line(24, 6, 26, 4, hi);
      g.line(28, 6, 26, 4, hi);
      break;
    case 'flat':
      g.line(3, 17, 29, 15, c, 3);
      g.line(5, 16, 27, 14, hi);
      g.line(8, 21, 22, 20, lo, 2);
      break;
    case 'multi':
      for (const [o, col] of [
        [-7, lo],
        [0, c],
        [7, hi],
      ] as [number, number][])
        g.line(5 + o, 27, 27 + o, 5, col, 2);
      break;
    case 'whirl':
      g.arc(16, 16, 12, 0, Math.PI * 1.5, c, 3);
      g.arc(16, 16, 7, Math.PI, Math.PI * 2.4, hi, 2);
      g.line(28, 16, 24, 11, c, 2);
      break;
    case 'rings':
      g.disc(9, 16, 4, c);
      for (const r of [8, 13, 18]) g.arc(9, 16, r, -Math.PI * 0.3, Math.PI * 0.3, r === 13 ? hi : c, 2);
      break;
    case 'cross':
      g.line(5, 5, 27, 27, c, 3);
      g.line(27, 5, 5, 27, c, 3);
      g.line(6, 6, 26, 26, hi);
      g.disc(16, 16, 3, hi);
      break;
    case 'burst':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 9 : 14;
        g.line(16, 16, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, i % 2 ? hi : c, 3);
      }
      g.disc(16, 16, 5, hi);
      g.disc(16, 16, 2, 0xffffff);
      break;
    case 'arrow':
      g.line(4, 28, 26, 6, lo, 2);
      g.line(5, 27, 25, 7, c);
      g.line(26, 6, 20, 7, hi, 2);
      g.line(26, 6, 25, 12, hi, 2);
      g.line(4, 28, 4, 23, c);
      g.line(4, 28, 9, 28, c);
      break;
    case 'fan':
      for (const a of [-0.45, 0, 0.45]) {
        const x = 6 + Math.cos(-Math.PI / 4 + a) * 22;
        const y = 26 + Math.sin(-Math.PI / 4 + a) * 22;
        g.line(6, 26, x, y, a === 0 ? hi : c, 2);
        g.disc(x, y, 1.5, hi);
      }
      break;
    case 'rain':
      for (const [x, y] of [
        [7, 4],
        [16, 9],
        [25, 3],
        [11, 16],
        [22, 15],
      ]) {
        g.line(x, y, x, y + 9, c, 2);
        g.line(x - 2, y + 7, x, y + 10, hi);
        g.line(x + 2, y + 7, x, y + 10, hi);
      }
      break;
    case 'bullets':
      for (const [x, y] of [
        [6, 8],
        [12, 16],
        [6, 24],
      ]) {
        g.rect(x, y - 2, 12, 5, c);
        g.disc(x + 12, y, 2.5, hi);
        g.rect(x, y - 2, 12, 1, hi);
        g.line(x - 5, y, x - 1, y, lo);
      }
      break;
    case 'cross-hair':
      g.arc(16, 16, 11, 0, Math.PI * 2, c, 2);
      g.rect(15, 2, 2, 10, hi);
      g.rect(15, 20, 2, 10, hi);
      g.rect(2, 15, 10, 2, hi);
      g.rect(20, 15, 10, 2, hi);
      g.disc(16, 16, 1.5, 0xff3a2a);
      break;
    case 'orb':
      g.disc(16, 16, 10, lo);
      g.disc(16, 16, 8, c);
      g.disc(13, 13, 3, hi);
      g.px(12, 12, 0xffffff);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        g.px(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, hi);
      }
      break;
    case 'amp':
      g.disc(16, 18, 9, lo);
      g.disc(16, 18, 7, c);
      g.line(16, 4, 16, 18, hi, 3);
      g.line(10, 10, 16, 4, hi, 2);
      g.line(22, 10, 16, 4, hi, 2);
      break;
    case 'shield':
      g.rect(7, 5, 18, 12, c);
      for (let y = 17; y < 28; y++) {
        const w = Math.max(1, 18 - (y - 17) * 1.7);
        g.rect(16 - w / 2, y, w, 1, c);
      }
      g.rect(7, 5, 18, 2, hi);
      g.rect(15, 7, 2, 18, hi);
      g.rect(9, 12, 14, 2, lo);
      break;
    case 'snow':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * 13;
        const dy = Math.sin(a) * 13;
        g.line(16 - dx, 16 - dy, 16 + dx, 16 + dy, c, 2);
        for (const s of [-1, 1]) {
          const bx = 16 + s * dx * 0.6;
          const by = 16 + s * dy * 0.6;
          g.line(bx, by, bx + Math.cos(a + s * 0.9 + Math.PI / 2) * 4, by + Math.sin(a + s * 0.9 + Math.PI / 2) * 4, hi);
          g.line(bx, by, bx + Math.cos(a - s * 0.9 - Math.PI / 2) * 4, by + Math.sin(a - s * 0.9 - Math.PI / 2) * 4, hi);
        }
      }
      g.disc(16, 16, 2, 0xffffff);
      break;
    case 'bolt':
      g.line(20, 2, 10, 16, c, 3);
      g.line(10, 16, 21, 15, c, 3);
      g.line(21, 15, 11, 30, c, 3);
      g.line(19, 4, 11, 15, hi);
      g.line(20, 16, 13, 27, hi);
      break;
    case 'flame':
      g.disc(16, 21, 8, c);
      g.line(16, 3, 10, 18, c, 4);
      g.line(16, 3, 22, 18, c, 4);
      g.line(9, 8, 9, 17, c, 3);
      g.line(23, 9, 23, 17, c, 3);
      g.disc(16, 22, 5, hi);
      g.line(16, 10, 16, 20, hi, 3);
      g.disc(16, 24, 2, 0xffffff);
      break;
    case 'moon':
      g.disc(16, 16, 12, c);
      g.disc(21, 12, 10, -1);
      g.arc(16, 16, 11, Math.PI * 0.55, Math.PI * 1.2, hi, 2);
      g.px(24, 22, hi);
      g.px(27, 18, hi);
      break;
    case 'skull':
      g.disc(16, 13, 10, c);
      g.rect(10, 18, 12, 8, c);
      g.disc(12, 14, 3, 0x1a0a20);
      g.disc(20, 14, 3, 0x1a0a20);
      g.rect(15, 18, 2, 3, 0x1a0a20);
      for (let x = 11; x < 22; x += 2) g.rect(x, 24, 1, 3, 0x1a0a20);
      g.arc(16, 13, 9, Math.PI * 1.1, Math.PI * 1.5, hi, 2);
      break;
    case 'wind':
      for (const [y, w, col] of [
        [8, 20, c],
        [16, 26, hi],
        [24, 16, c],
      ] as [number, number, number][]) {
        g.line(3, y, 3 + w, y, col, 2);
        g.arc(3 + w, y - 3, 3, Math.PI * 0.5, Math.PI * 2, col, 2);
      }
      break;
    case 'meteor':
      g.line(4, 4, 18, 18, lo, 5);
      g.line(6, 4, 19, 16, c, 3);
      g.disc(21, 21, 7, c);
      g.disc(21, 21, 4, hi);
      g.disc(20, 20, 1.5, 0xffffff);
      break;
    case 'beam':
      g.disc(6, 16, 5, c);
      g.rect(6, 12, 24, 9, c);
      g.rect(6, 14, 24, 5, hi);
      g.rect(6, 16, 24, 1, 0xffffff);
      break;
    case 'grenade':
      g.disc(15, 19, 9, c);
      g.rect(12, 7, 6, 4, lo);
      g.arc(22, 8, 4, Math.PI, Math.PI * 2.5, hi, 1);
      for (let y = 14; y < 27; y += 4) g.rect(8, y, 15, 1, lo);
      g.disc(12, 16, 2, hi);
      break;
    case 'mag':
      g.rect(10, 4, 12, 24, c);
      g.rect(10, 4, 12, 2, hi);
      for (let y = 9; y < 26; y += 4) {
        g.rect(13, y, 6, 2, 0xffd890);
        g.px(19, y, 0xffffff);
      }
      g.rect(10, 26, 12, 2, lo);
      break;
  }
}

const SKILL_LOOK: Record<string, [Motif, number]> = {
  sword_whirl: ['whirl', 0x8fe0ff],
  sword_upper: ['upper', 0xdff4ff],
  sword_cry: ['rings', 0xffb040],
  sword_sunder: ['cross', 0xff6a5a],
  sword_waves: ['multi', 0x7fe8ff],
  staff_meteor: ['meteor', 0xff7a2a],
  staff_shield: ['shield', 0x5fc8ff],
  staff_laser: ['beam', 0x7fe8ff],
  staff_frost: ['snow', 0xbfe8ff],
  staff_curse: ['skull', 0xc060ff],
  staff_ward: ['shield', 0xffd34a],
  staff_amp: ['amp', 0xd8a8ff],
  dao_crescent: ['moon', 0xbfd4ff],
  dao_skyfall: ['upper', 0xffe08a],
  dao_hamstring: ['flat', 0xff8a6a],
  dao_rage: ['flame', 0xff4a3a],
  dao_iai: ['flat', 0xffffff],
  bow_fan: ['fan', 0xe8dcc0],
  bow_rain: ['rain', 0xd8c8a0],
  bow_pierce: ['arrow', 0xffe08a],
  bow_haste: ['wind', 0x9ff0c0],
  bow_mana_arrows: ['fan', 0x9fdcff],
  gun_rapid: ['bullets', 0xffd890],
  gun_grenade: ['grenade', 0x8ab060],
  gun_snipe: ['cross-hair', 0xff5a4a],
  gun_tactical: ['mag', 0xc8ccd8],
  gun_barrage: ['bullets', 0xffb040],
  sword_heaven_cleave: ['slash', 0xfff0b0],
  sword_cross_judgment: ['cross', 0xffe08a],
  sword_thousand_blades: ['multi', 0xbfe8ff],
  dao_moon_storm: ['whirl', 0xbfd4ff],
  dao_heaven_fall: ['meteor', 0xffb040],
  dao_blood_moon: ['moon', 0xff3a4a],
  bow_sky_burst: ['burst', 0x9fe8ff],
  bow_meteor_arrow: ['meteor', 0xffe08a],
  bow_aurora: ['rain', 0x9ff0d0],
  gun_ricochet: ['bolt', 0xffd890],
  gun_airstrike: ['burst', 0xff7a2a],
  gun_dead_eye: ['cross-hair', 0xffe08a],
  staff_chain_lightning: ['bolt', 0x9fe8ff],
  staff_blizzard: ['snow', 0xdff4ff],
  staff_armageddon: ['meteor', 0xff4a1a],
};

const PASSIVE_LOOK: Record<string, [Motif, number]> = {
  mana_flow: ['orb', 0x7fbfff],
  wind_breath: ['wind', 0x9ff0c0],
  tough_body: ['shield', 0xff8a6a],
  meditation: ['rings', 0xbfa8ff],
  swiftness: ['wind', 0xffe08a],
  evasion: ['whirl', 0xc8ccd8],
  keen_sense: ['cross-hair', 0xff5a4a],
  parry_master: ['cross', 0xdff4ff],
};

export function skillIconUrl(def: SkillDef): string {
  const [m, c] = SKILL_LOOK[def.id] ?? ['orb', 0xc8ccd8];
  return cached(`skill:${def.id}`, (g) => drawMotif(g, m, c));
}

export function passiveIconUrl(def: PassiveDef): string {
  const [m, c] = PASSIVE_LOOK[def.id] ?? ['orb', 0xc8ccd8];
  return cached(`passive:${def.id}`, (g) => drawMotif(g, m, c));
}

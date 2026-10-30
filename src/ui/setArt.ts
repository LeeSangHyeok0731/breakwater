/**
 * 세트 방어구 아이콘 (32×32 도트). 세트마다 따로 디자인한다.
 * 조각(영역)마다 위·왼쪽 가장자리는 밝게, 아래·오른쪽은 어둡게 칠해 판금 이음새와 입체감을 낸다.
 * 외곽선은 검정 대신 그 조각의 가장 어두운 색으로 둘러 부드럽게 보이게 한다.
 */

const S = 32;
type Pt = [number, number];
type Ramp = [number, number, number, number];

function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 기본색에서 4단계 명암을 만든다 (어두움 → 밝음). */
function ramp(c: number): Ramp {
  return [mix(c, 0x100818, 0.62), mix(c, 0x100818, 0.32), c, mix(c, 0xffffff, 0.42)];
}

// 재질
const STEEL = ramp(0x9aa6ba);
const IRON = ramp(0x4a4452);
const RED = ramp(0xc8303a);
const GOLD: Ramp = [0x7a4a10, 0xc0841c, 0xffc040, 0xfff0a8];
const CRIMSON = ramp(0x8a1e28);
const BONE = ramp(0xd8c8a0);
const LEATHER = ramp(0x8a5a32);
const DARK_LEATHER = ramp(0x5a3a22);
const OLIVE = ramp(0x5e7e3a);
const FUR = ramp(0xc8a878);
const CREAM = ramp(0xece0c4);
const MIDNIGHT = ramp(0x2a3270);
const LINING = ramp(0x4a2070);
const ARCANE = ramp(0x2e52a8);
const TEAL = ramp(0x2a9cc0);
const NAVY = ramp(0x1c2a5a);
const WHITE = ramp(0xe8e2d6);
const PURPLE = ramp(0x9a40e0);
const HOLE = 0x140c14;

class Art {
  private region = new Int16Array(S * S).fill(-1);
  private ramps: Ramp[] = [];
  private flat = new Map<number, number>();

  /** 새 조각을 시작한다. 같은 색이라도 조각이 다르면 경계에 명암이 생긴다. */
  part(r: Ramp): number {
    this.ramps.push(r);
    return this.ramps.length - 1;
  }

  private set(id: number, x: number, y: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return;
    this.region[iy * S + ix] = id;
    this.flat.delete(iy * S + ix);
  }

  poly(r: Ramp, pts: Pt[]): number {
    const id = this.part(r);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(id, x, y);
      }
    return id;
  }

  rect(r: Ramp, x: number, y: number, w: number, h: number): number {
    const id = this.part(r);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(id, x + i, y + j);
    return id;
  }

  ellipse(r: Ramp, cx: number, cy: number, rx: number, ry: number): number {
    const id = this.part(r);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(id, x, y);
    return id;
  }

  line(r: Ramp, x0: number, y0: number, x1: number, y1: number, thick = 1): number {
    const id = this.part(r);
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      for (let dy = 0; dy < thick; dy++) for (let dx = 0; dx < thick; dx++) this.set(id, x + dx - (thick - 1) / 2, y + dy - (thick - 1) / 2);
    }
    return id;
  }

  /** 명암 계산 없이 그대로 찍는 점 (눈, 보석 반짝임, 룬) */
  dot(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    if (this.region[y * S + x] === -1) this.region[y * S + x] = this.part([c, c, c, c]);
    this.flat.set(y * S + x, c);
  }

  dots(c: number, pts: Pt[]): void {
    for (const [x, y] of pts) this.dot(x, y, c);
  }

  /** 네 갈래 별 반짝임 */
  star(x: number, y: number, core: number, arm: number, big = false): void {
    this.dot(x, y, core);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      this.dot(x + dx, y + dy, arm);
    if (big)
      for (const [dx, dy] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ])
        this.dot(x + dx, y + dy, mix(arm, 0xffffff, 0.2));
  }

  toUrl(): string {
    const out = new Int32Array(S * S).fill(-1);
    const bbox = this.ramps.map(() => [S, S, -1, -1]);
    for (let i = 0; i < S * S; i++) {
      const id = this.region[i];
      if (id < 0) continue;
      const b = bbox[id];
      const x = i % S;
      const y = Math.floor(i / S);
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
    const same = (id: number, x: number, y: number): boolean => x >= 0 && y >= 0 && x < S && y < S && this.region[y * S + x] === id;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const id = this.region[i];
        if (id < 0) continue;
        const flat = this.flat.get(i);
        if (flat !== undefined) {
          out[i] = flat;
          continue;
        }
        const r = this.ramps[id];
        const lit = !same(id, x - 1, y) || !same(id, x, y - 1);
        const shade = !same(id, x + 1, y) || !same(id, x, y + 1);
        let k = 2;
        if (lit && !shade) k = 3;
        else if (shade && !lit) k = 0;
        else if (!lit && !shade) {
          // 조각 아래쪽은 조금 어둡게 해서 둥근 느낌을 낸다.
          const b = bbox[id];
          const t = b[3] > b[1] ? (y - b[1]) / (b[3] - b[1]) : 0;
          k = t > 0.68 ? 1 : 2;
        } else k = 1;
        out[i] = r[k];
      }
    // 외곽선: 바깥 빈칸에 이웃 조각의 가장 어두운 색보다 더 어두운 색
    const res = out.slice();
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (out[y * S + x] !== -1) continue;
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const id = this.region[ny * S + nx];
          if (id < 0) continue;
          res[y * S + x] = mix(this.ramps[id][0], 0x08040c, 0.55);
          break;
        }
      }
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = res[i];
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

/** 옆에서 본 부츠 한 짝 (발끝이 오른쪽). ox는 왼쪽 끝. 목·발등·밑창을 따로 칠한다. */
function boot(a: Art, ox: number, mat: Ramp, sole: Ramp, top = 5): void {
  a.poly(mat, [
    [ox + 2, top],
    [ox + 9, top],
    [ox + 9, 18],
    [ox + 2, 18],
  ]);
  a.poly(mat, [
    [ox + 2, 18],
    [ox + 9, 18],
    [ox + 11, 21],
    [ox + 14, 22],
    [ox + 15, 25],
    [ox + 15, 27],
    [ox + 2, 27],
  ]);
  a.rect(sole, ox + 2, 27, 13, 2);
}

/** 판금 다리 한쪽: 허벅지, 각진 무릎 보호대, 정강이 */
function plateLeg(a: Art, x: number, mat: Ramp, knee: Ramp): void {
  a.poly(mat, [
    [x, 7],
    [x + 7, 7],
    [x + 6.5, 17],
    [x + 0.5, 17],
  ]);
  a.poly(mat, [
    [x + 0.5, 18],
    [x + 6.5, 18],
    [x + 6, 29],
    [x + 1, 29],
  ]);
  a.poly(knee, [
    [x - 0.5, 17.5],
    [x + 3.5, 14.5],
    [x + 7.5, 17.5],
    [x + 3.5, 21],
  ]);
}

/** 좌우 대칭 점 */
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [S - x, y]);

// ───────────────────────── 투사의 갑주 (영웅 근접) ─────────────────────────
// 강철 판금에 붉은 말갈기 볏과 띠

function championHead(a: Art): void {
  a.poly(RED, [
    [11, 9],
    [13, 3],
    [18, 1],
    [24, 3],
    [28, 8],
    [28, 14],
    [25, 10],
    [21, 7],
    [16, 7],
  ]);
  a.poly(STEEL, [
    [8, 11],
    [10, 8],
    [22, 8],
    [24, 11],
    [24, 27],
    [22, 29],
    [10, 29],
    [8, 27],
  ]);
  a.rect(STEEL, 8, 12, 16, 3);
  a.rect(STEEL, 15, 15, 2, 13);
  for (let x = 10; x < 22; x++) if (x < 15 || x > 16) a.dot(x, 17, HOLE);
  for (let x = 10; x < 22; x++) if (x < 15 || x > 16) a.dot(x, 18, 0x2a2430);
  a.dots(HOLE, [
    [19, 22],
    [21, 22],
    [19, 24],
    [21, 24],
    [11, 22],
    [13, 22],
    [11, 24],
    [13, 24],
  ]);
  a.dots(0xffe8a0, [
    [9, 13],
    [22, 13],
  ]);
  a.dots(0xff8a7a, [
    [17, 3],
    [21, 4],
    [24, 6],
  ]);
}

function championBody(a: Art): void {
  a.poly(STEEL, [
    [9, 8],
    [23, 8],
    [25, 19],
    [21, 29],
    [11, 29],
    [7, 19],
  ]);
  a.ellipse(STEEL, 7, 11, 5.5, 4.5);
  a.ellipse(STEEL, 25, 11, 5.5, 4.5);
  a.ellipse(STEEL, 7, 14, 4, 2.5);
  a.ellipse(STEEL, 25, 14, 4, 2.5);
  a.rect(STEEL, 11, 20, 10, 3);
  a.rect(STEEL, 12, 23, 8, 3);
  a.poly(RED, [
    [9, 9],
    [12, 9],
    [24, 21],
    [22, 23],
  ]);
  a.ellipse(GOLD, 16.5, 15.5, 2.2, 2.2);
  a.rect(IRON, 13, 6, 6, 3);
  a.dot(16, 15, 0xfff8d0);
  a.dots(0xffe8a0, [
    [5, 9],
    [27, 9],
  ]);
}

function championLegs(a: Art): void {
  a.rect(IRON, 8, 3, 16, 3);
  a.poly(RED, [
    [10, 6],
    [22, 6],
    [21, 13],
    [16, 10],
    [11, 13],
  ]);
  a.dot(16, 4, 0xffc040);
  a.dot(15, 4, 0xffe8a0);
  for (const x of [8, 17]) {
    plateLeg(a, x, STEEL, STEEL);
    a.dot(x + 3, 17, 0xffe8a0);
    a.rect(STEEL, x + 1, 24, 5, 1);
  }
}

function championFeet(a: Art): void {
  for (const ox of [1, 15]) {
    boot(a, ox, STEEL, IRON);
    a.rect(STEEL, ox + 2, 10, 7, 4);
    a.rect(STEEL, ox + 9, 21, 4, 3);
    a.rect(RED, ox + 1, 3, 9, 3);
    a.dot(ox + 4, 8, 0xffe8a0);
  }
}

// ───────────────────────── 용살자의 갑주 (전설 근접) ─────────────────────────
// 검붉은 판금, 휘어진 용뿔, 금 테두리, 붉게 빛나는 눈, 비늘

function dragonHead(a: Art): void {
  for (const side of [(p: Pt[]): Pt[] => p, mirror]) {
    a.poly(BONE, side([
      [10, 13],
      [6, 9],
      [3, 3],
      [6, 4],
      [10, 8],
      [13, 10],
    ]));
    a.poly(IRON, side([
      [3, 3],
      [5, 2],
      [6, 4],
      [4, 5],
    ]));
  }
  a.poly(CRIMSON, [
    [9, 11],
    [12, 8],
    [20, 8],
    [23, 11],
    [24, 22],
    [20, 29],
    [12, 29],
    [8, 22],
  ]);
  a.poly(GOLD, [
    [8, 13],
    [24, 13],
    [24, 15],
    [16, 18],
    [8, 15],
  ]);
  a.rect(IRON, 15, 18, 2, 10);
  for (const x of [11, 12, 13, 19, 20, 21]) a.dot(x, 19, 0xff4030);
  a.dots(0xffc070, [
    [12, 19],
    [20, 19],
  ]);
  a.dots(0x5a0a10, [
    [11, 20],
    [12, 20],
    [13, 20],
    [19, 20],
    [20, 20],
    [21, 20],
  ]);
  a.ellipse(GOLD, 16.5, 11, 1.6, 1.6);
  a.dot(16, 11, 0xff3040);
  a.star(27, 26, 0xfff8d0, 0xffc040);
}

function dragonBody(a: Art): void {
  for (const side of [(p: Pt[]): Pt[] => p, mirror]) {
    a.poly(BONE, side([
      [3, 9],
      [2, 3],
      [6, 8],
    ]));
    a.poly(BONE, side([
      [7, 7],
      [8, 1],
      [10, 7],
    ]));
  }
  a.poly(CRIMSON, [
    [9, 8],
    [23, 8],
    [25, 19],
    [21, 29],
    [11, 29],
    [7, 19],
  ]);
  a.ellipse(CRIMSON, 6, 11, 5, 4.5);
  a.ellipse(CRIMSON, 26, 11, 5, 4.5);
  a.ellipse(GOLD, 6, 13.5, 4, 1.4);
  a.ellipse(GOLD, 26, 13.5, 4, 1.4);
  a.rect(GOLD, 10, 8, 12, 2);
  a.rect(IRON, 13, 6, 6, 2);
  // 비늘 무늬
  for (let y = 18; y < 28; y += 3)
    for (let x = 10 + ((y / 3) % 2) * 2; x < 23; x += 4) {
      if (y > 24 && (x < 12 || x > 20)) continue;
      a.dot(x, y, 0x4a0c14);
      a.dot(x + 1, y + 1, 0x4a0c14);
      a.dot(x - 1, y + 1, 0x4a0c14);
      a.dot(x, y - 1, 0xc04a50);
    }
  // 가슴의 용머리 문장
  a.poly(GOLD, [
    [16, 11],
    [20, 14],
    [16, 18],
    [12, 14],
  ]);
  a.dots(0xff3040, [
    [14, 14],
    [18, 14],
  ]);
  a.dot(16, 13, 0xfff0a8);
  a.star(28, 25, 0xfff8d0, 0xffc040);
}

function dragonLegs(a: Art): void {
  a.rect(GOLD, 8, 3, 16, 2);
  a.rect(CRIMSON, 8, 5, 16, 3);
  for (const x of [8, 17]) {
    plateLeg(a, x, CRIMSON, GOLD);
    a.poly(BONE, [
      [x + 2, 15],
      [x + 3.5, 10],
      [x + 5, 15],
    ]);
    a.dot(x + 3, 17, 0xff4030);
    a.rect(GOLD, x + 1, 27, 5, 2);
    for (let y = 21; y < 27; y += 3) a.dot(x + 2 + ((y / 3) % 2) * 2, y, 0x4a0c14);
  }
  a.star(4, 27, 0xfff8d0, 0xffc040);
}

function dragonFeet(a: Art): void {
  for (const ox of [1, 15]) {
    boot(a, ox, CRIMSON, IRON, 6);
    a.rect(GOLD, ox + 1, 4, 9, 2);
    a.rect(GOLD, ox + 2, 17, 7, 1);
    for (const tx of [9, 12, 15])
      a.poly(BONE, [
        [ox + tx - 2, 25],
        [ox + tx, 25],
        [ox + tx + 1.5, 29],
      ]);
    a.poly(BONE, [
      [ox + 2, 12],
      [ox - 1, 9],
      [ox + 2, 9],
    ]);
    a.dot(ox + 5, 11, 0xff4030);
  }
  a.star(29, 3, 0xfff8d0, 0xffc040);
}

// ───────────────────────── 매사냥꾼의 가죽옷 (영웅 사격) ─────────────────────────
// 가죽과 올리브빛 천, 매 깃털, 털 칼라

function feather(a: Art, x0: number, y0: number, x1: number, y1: number, body: Ramp, tip: Ramp): void {
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const len = Math.hypot(nx, ny);
  const w = 2.2 / len;
  a.poly(body, [
    [x0, y0],
    [x0 + (x1 - x0) * 0.5 + nx * w, y0 + (y1 - y0) * 0.5 + ny * w],
    [x1, y1],
    [x0 + (x1 - x0) * 0.5 - nx * w, y0 + (y1 - y0) * 0.5 - ny * w],
  ]);
  a.poly(tip, [
    [x0 + (x1 - x0) * 0.7 + nx * w * 0.8, y0 + (y1 - y0) * 0.7 + ny * w * 0.8],
    [x1, y1],
    [x0 + (x1 - x0) * 0.7 - nx * w * 0.8, y0 + (y1 - y0) * 0.7 - ny * w * 0.8],
  ]);
  for (let i = 1; i < 8; i++) {
    const t = i / 9;
    a.dot(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 0x5a3a20);
  }
}

function falconHead(a: Art): void {
  // 뾰족한 궁수 모자에 긴 매 깃털을 꽂는다.
  a.poly(LEATHER, [
    [3, 23],
    [9, 13],
    [17, 9],
    [26, 13],
    [29, 23],
  ]);
  a.poly(DARK_LEATHER, [
    [17, 9],
    [26, 13],
    [29, 23],
    [22, 23],
  ]);
  a.poly(OLIVE, [
    [4, 21],
    [28, 21],
    [29, 25],
    [3, 25],
  ]);
  for (let x = 6; x < 27; x += 3) a.dot(x, 22, 0xc8d890);
  feather(a, 21, 22, 30, 2, CREAM, ramp(0x6a4428));
  feather(a, 19, 22, 24, 5, ramp(0x9a6a3a), CREAM);
  a.poly(GOLD, [
    [15, 21],
    [18, 21],
    [18, 25],
    [15, 25],
  ]);
  a.dot(16, 22, 0x5a3a10);
}

function falconBody(a: Art): void {
  a.rect(OLIVE, 3, 11, 5, 10);
  a.rect(OLIVE, 24, 11, 5, 10);
  a.rect(DARK_LEATHER, 3, 19, 5, 2);
  a.rect(DARK_LEATHER, 24, 19, 5, 2);
  a.poly(LEATHER, [
    [8, 9],
    [15, 9],
    [15, 28],
    [7, 28],
  ]);
  a.poly(LEATHER, [
    [17, 9],
    [24, 9],
    [25, 28],
    [17, 28],
  ]);
  for (let y = 12; y < 21; y += 3) {
    a.dot(15, y, 0xece0c4);
    a.dot(16, y + 1, 0xece0c4);
  }
  for (const [x, y] of [
    [9, 9],
    [12, 8],
    [16, 8],
    [20, 8],
    [23, 9],
  ] as Pt[])
    a.ellipse(FUR, x, y, 2.8, 2.4);
  a.rect(DARK_LEATHER, 7, 21, 18, 3);
  a.rect(GOLD, 14, 21, 4, 3);
  a.dot(15, 22, 0x5a3a10);
  a.rect(OLIVE, 19, 24, 4, 4);
  a.dot(20, 25, 0xc8d890);
  // 가슴의 매 문장
  a.poly(CREAM, [
    [9, 15],
    [12, 13],
    [13, 16],
    [11, 18],
  ]);
  a.dot(11, 15, 0x3a2414);
}

function falconLegs(a: Art): void {
  a.rect(DARK_LEATHER, 8, 3, 16, 3);
  a.rect(GOLD, 15, 3, 2, 3);
  for (const x of [9, 17]) {
    a.poly(LEATHER, [
      [x, 6],
      [x + 6, 6],
      [x + 6, 29],
      [x, 29],
    ]);
    a.rect(CREAM, x, 18, 6, 2);
    a.rect(CREAM, x, 22, 6, 2);
    a.rect(CREAM, x, 26, 6, 2);
    a.rect(OLIVE, x + 1, 10, 4, 4);
  }
}

function falconFeet(a: Art): void {
  for (const ox of [1, 15]) {
    boot(a, ox, LEATHER, DARK_LEATHER, 8);
    a.poly(OLIVE, [
      [ox + 1, 4],
      [ox + 10, 4],
      [ox + 10, 9],
      [ox + 1, 9],
    ]);
    for (let y = 11; y < 18; y += 3) a.line(CREAM, ox + 3, y, ox + 8, y + 1);
  }
  feather(a, 11, 9, 7, 1, CREAM, ramp(0x6a4428));
}

// ───────────────────────── 별사냥꾼의 망토 (전설 사격) ─────────────────────────
// 밤하늘색 천에 금빛 별과 별자리, 금 걸쇠

function starfield(a: Art, pts: Pt[]): void {
  for (const [x, y] of pts) a.dot(x, y, 0xfff0b0);
}

function starHead(a: Art): void {
  a.poly(MIDNIGHT, [
    [16, 2],
    [24, 6],
    [28, 16],
    [27, 29],
    [5, 29],
    [4, 16],
    [8, 6],
  ]);
  a.poly([0x0a0c20, 0x0a0c20, 0x0e1028, 0x141838], [
    [10, 15],
    [22, 15],
    [24, 27],
    [8, 27],
  ]);
  a.line(GOLD, 9, 15, 23, 15);
  a.line(GOLD, 9, 15, 7, 27);
  a.line(GOLD, 23, 15, 25, 27);
  a.dots(0xffe08a, [
    [13, 20],
    [19, 20],
  ]);
  a.dots(0xfff8d0, [
    [13, 19],
    [19, 19],
  ]);
  a.star(16, 9, 0xffffff, 0xffc040, true);
  starfield(a, [
    [8, 11],
    [24, 12],
    [26, 21],
    [6, 22],
  ]);
  a.star(28, 27, 0xfff8d0, 0xffc040);
}

function starBody(a: Art): void {
  a.ellipse(MIDNIGHT, 16, 6, 7, 3);
  a.poly(MIDNIGHT, [
    [11, 6],
    [21, 6],
    [28, 29],
    [4, 29],
  ]);
  a.poly(LINING, [
    [17, 9],
    [21, 9],
    [26, 29],
    [18, 29],
  ]);
  a.line(GOLD, 17, 9, 18, 29);
  a.line(ramp(0x1a2050), 10, 12, 7, 28);
  a.ellipse(GOLD, 12.5, 7.5, 2, 2);
  a.ellipse(GOLD, 19.5, 7.5, 2, 2);
  a.line(GOLD, 14, 8, 18, 8);
  a.dots(0xfff8d0, [
    [12, 7],
    [19, 7],
  ]);
  // 별자리
  const cons: Pt[] = [
    [9, 15],
    [12, 19],
    [10, 23],
    [14, 25],
  ];
  for (let i = 0; i < cons.length - 1; i++) {
    const [x0, y0] = cons[i];
    const [x1, y1] = cons[i + 1];
    for (let t = 1; t < 4; t++) a.dot(Math.round(x0 + ((x1 - x0) * t) / 4), Math.round(y0 + ((y1 - y0) * t) / 4), 0x8a7a40);
  }
  for (const [x, y] of cons) a.star(x, y, 0xfff8d0, 0xd8a840);
  starfield(a, [
    [6, 26],
    [15, 14],
    [23, 22],
  ]);
  a.star(27, 3, 0xffffff, 0xffc040, true);
}

function starLegs(a: Art): void {
  a.rect(NAVY, 8, 3, 16, 3);
  a.rect(GOLD, 14, 3, 4, 3);
  a.dot(16, 4, 0xffffff);
  for (const x of [9, 17]) {
    a.poly(MIDNIGHT, [
      [x, 6],
      [x + 6, 6],
      [x + 6, 29],
      [x, 29],
    ]);
    a.rect(GOLD, x, 27, 6, 2);
    a.star(x + 3, 13, 0xfff8d0, 0xd8a840);
  }
  starfield(a, [
    [11, 21],
    [21, 19],
    [19, 24],
  ]);
  a.star(4, 4, 0xffffff, 0xffc040, true);
}

function starFeet(a: Art): void {
  for (const ox of [1, 15]) {
    boot(a, ox, MIDNIGHT, GOLD, 7);
    a.rect(GOLD, ox + 1, 5, 9, 2);
    // 발목의 금빛 날개
    a.poly(GOLD, [
      [ox + 2, 13],
      [ox - 1, 8],
      [ox + 1, 8],
      [ox + 3, 11],
    ]);
    a.poly(GOLD, [
      [ox + 2, 15],
      [ox - 1, 12],
      [ox + 2, 12],
    ]);
    a.star(ox + 9, 22, 0xffffff, 0xd8a840);
  }
  a.star(29, 3, 0xffffff, 0xffc040, true);
}

// ───────────────────────── 비전학자의 로브 (영웅 마법) ─────────────────────────
// 짙은 파랑 로브, 청록 테두리, 빛나는 룬

function runes(a: Art, pts: Pt[]): void {
  for (const [x, y] of pts) {
    a.dot(x, y, 0xbfffff);
    a.dot(x + 1, y, 0x6ae0ff);
  }
}

function arcanistHead(a: Art): void {
  a.poly(ARCANE, [
    [17, 3],
    [21, 6],
    [24, 19],
    [8, 19],
  ]);
  a.poly(ARCANE, [
    [17, 3],
    [22, 1],
    [27, 3],
    [21, 6],
  ]);
  a.ellipse(ramp(0x22408a), 16, 22, 15, 4.5);
  a.rect(NAVY, 8, 16, 16, 4);
  runes(a, [
    [10, 17],
    [14, 18],
    [18, 17],
    [21, 18],
  ]);
  // 초승달 문장
  a.ellipse(TEAL, 15.5, 11, 3, 3);
  a.ellipse(ARCANE, 17, 10, 2.6, 2.6);
  a.dot(27, 3, 0xbfffff);
}

function arcanistBody(a: Art): void {
  a.poly(ARCANE, [
    [9, 9],
    [2, 21],
    [7, 24],
    [12, 14],
  ]);
  a.poly(ARCANE, [
    [23, 9],
    [30, 21],
    [25, 24],
    [20, 14],
  ]);
  a.poly(TEAL, [
    [2, 21],
    [7, 24],
    [6, 25],
    [1, 22],
  ]);
  a.poly(TEAL, [
    [30, 21],
    [25, 24],
    [26, 25],
    [31, 22],
  ]);
  a.poly(ARCANE, [
    [10, 7],
    [22, 7],
    [25, 29],
    [7, 29],
  ]);
  a.poly([HOLE, HOLE, HOLE, HOLE], [
    [13, 7],
    [19, 7],
    [16, 11],
  ]);
  a.rect(TEAL, 15, 11, 3, 18);
  a.rect(NAVY, 9, 16, 15, 2);
  a.rect(GOLD, 15, 16, 3, 2);
  a.rect(TEAL, 7, 27, 18, 2);
  runes(a, [
    [15, 20],
    [16, 23],
    [15, 26],
  ]);
}

function arcanistLegs(a: Art): void {
  a.rect(NAVY, 9, 3, 14, 3);
  a.poly(ARCANE, [
    [9, 6],
    [23, 6],
    [27, 29],
    [5, 29],
  ]);
  a.rect(TEAL, 15, 6, 3, 23);
  a.rect(TEAL, 5, 27, 22, 2);
  runes(a, [
    [15, 10],
    [16, 15],
    [15, 20],
    [8, 26],
    [22, 26],
  ]);
}

function arcanistFeet(a: Art): void {
  for (const ox of [1, 14]) {
    a.rect(TEAL, ox + 2, 12, 8, 2);
    // 앞코가 가늘게 뻗다가 살짝 말려 올라간 마법사 신발
    a.poly(ARCANE, [
      [ox + 2, 14],
      [ox + 9, 14],
      [ox + 11, 19],
      [ox + 15, 21],
      [ox + 17, 18],
      [ox + 18, 19],
      [ox + 17, 23],
      [ox + 14, 26],
      [ox + 2, 26],
    ]);
    a.rect(NAVY, ox + 2, 26, 13, 2);
    a.dot(ox + 17, 18, 0xbfffff);
    runes(a, [[ox + 5, 19]]);
  }
}

// ───────────────────────── 대마도사의 성의 (전설 마법) ─────────────────────────
// 흰 성의에 금 장식, 보랏빛 보석, 후광

function archmageHead(a: Art): void {
  // 후광
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    a.dot(Math.round(16 + Math.cos(t) * 10), Math.round(5 + Math.sin(t) * 2.6), i % 5 === 0 ? 0xffffff : 0xffe890);
  }
  a.poly(GOLD, [
    [6, 18],
    [6, 10],
    [10, 15],
  ]);
  a.poly(GOLD, [
    [11, 18],
    [16, 8],
    [21, 18],
  ]);
  a.poly(GOLD, [
    [26, 18],
    [26, 10],
    [22, 15],
  ]);
  a.rect(PURPLE, 8, 15, 16, 3);
  a.rect(GOLD, 6, 18, 20, 8);
  a.rect(GOLD, 6, 24, 20, 2);
  a.ellipse(PURPLE, 16, 21, 2.8, 2.8);
  a.ellipse(PURPLE, 10, 21.5, 1.6, 1.6);
  a.ellipse(PURPLE, 22, 21.5, 1.6, 1.6);
  a.dots(0xffffff, [
    [15, 20],
    [6, 9],
    [16, 7],
    [26, 9],
  ]);
  a.dots(0xe0b0ff, [
    [10, 21],
    [22, 21],
  ]);
}

function archmageBody(a: Art): void {
  a.poly(WHITE, [
    [9, 8],
    [2, 22],
    [8, 24],
    [12, 13],
  ]);
  a.poly(WHITE, [
    [23, 8],
    [30, 22],
    [24, 24],
    [20, 13],
  ]);
  a.line(GOLD, 2, 22, 8, 24, 2);
  a.line(GOLD, 30, 22, 24, 24, 2);
  a.poly(WHITE, [
    [10, 6],
    [22, 6],
    [26, 29],
    [6, 29],
  ]);
  a.rect(GOLD, 11, 8, 3, 21);
  a.rect(GOLD, 19, 8, 3, 21);
  a.ellipse(GOLD, 16, 6, 6, 2.2);
  a.rect(GOLD, 6, 27, 20, 2);
  a.ellipse(GOLD, 16.5, 13, 3.2, 3.2);
  a.ellipse(PURPLE, 16.5, 13, 2, 2);
  a.dot(16, 12, 0xffffff);
  for (let y = 18; y < 27; y += 4) {
    a.dot(12, y, 0xb040ff);
    a.dot(20, y, 0xb040ff);
  }
  a.star(28, 3, 0xffffff, 0xffc040, true);
}

function archmageLegs(a: Art): void {
  a.rect(GOLD, 9, 3, 14, 3);
  a.dot(16, 4, 0xb040ff);
  a.poly(WHITE, [
    [9, 6],
    [23, 6],
    [27, 29],
    [5, 29],
  ]);
  a.rect(GOLD, 15, 6, 3, 23);
  a.rect(PURPLE, 6, 24, 20, 2);
  a.rect(GOLD, 5, 26, 22, 3);
  a.dots(0xffffff, [
    [16, 12],
    [16, 19],
  ]);
  a.star(4, 4, 0xffffff, 0xffc040, true);
}

function archmageFeet(a: Art): void {
  for (const ox of [1, 15]) {
    boot(a, ox, WHITE, GOLD, 8);
    a.rect(GOLD, ox + 1, 6, 9, 2);
    a.rect(GOLD, ox + 2, 17, 7, 1);
    a.poly(GOLD, [
      [ox + 2, 12],
      [ox - 1, 7],
      [ox + 1, 7],
      [ox + 3, 10],
    ]);
    a.ellipse(PURPLE, ox + 6, 12, 1.6, 1.6);
    a.dot(ox + 5, 11, 0xffffff);
  }
  a.star(29, 3, 0xffffff, 0xffc040, true);
}

const DRAW: Record<string, (a: Art) => void> = {
  champion_head: championHead,
  champion_body: championBody,
  champion_legs: championLegs,
  champion_feet: championFeet,
  dragonslayer_head: dragonHead,
  dragonslayer_body: dragonBody,
  dragonslayer_legs: dragonLegs,
  dragonslayer_feet: dragonFeet,
  falconer_head: falconHead,
  falconer_body: falconBody,
  falconer_legs: falconLegs,
  falconer_feet: falconFeet,
  starhunter_head: starHead,
  starhunter_body: starBody,
  starhunter_legs: starLegs,
  starhunter_feet: starFeet,
  arcanist_head: arcanistHead,
  arcanist_body: arcanistBody,
  arcanist_legs: arcanistLegs,
  arcanist_feet: arcanistFeet,
  archmage_head: archmageHead,
  archmage_body: archmageBody,
  archmage_legs: archmageLegs,
  archmage_feet: archmageFeet,
};

const cache = new Map<string, string>();

/** 세트 방어구 아이콘. 세트 방어구가 아니면 null */
export function setGearIconUrl(id: string): string | null {
  const draw = DRAW[id];
  if (!draw) return null;
  const hit = cache.get(id);
  if (hit) return hit;
  const a = new Art();
  draw(a);
  const url = a.toUrl();
  cache.set(id, url);
  return url;
}

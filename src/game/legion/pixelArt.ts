import type Phaser from 'phaser';

/**
 * 군단장 파츠용 도트 그리기.
 * 조각(영역)마다 위·왼쪽 가장자리는 밝게, 아래·오른쪽은 어둡게 칠해 판금 이음새와 입체감을 낸다.
 * 외곽선은 검정 대신 그 조각의 가장 어두운 색보다 조금 더 어두운 색으로 두른다 (src/ui/setArt.ts와 같은 방식).
 * 캔버스는 외곽선이 들어갈 1픽셀 여백을 두고 만든다.
 */

export type Pt = [number, number];
export type Ramp = [number, number, number, number];

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 기본색에서 4단계 명암을 만든다 (어두움 → 밝음). */
export function ramp(c: number): Ramp {
  return [mix(c, 0x100818, 0.62), mix(c, 0x100818, 0.32), c, mix(c, 0xffffff, 0.42)];
}

/** 파츠 텍스처의 회전 중심 (텍스처 픽셀 기준, 여백 포함) */
const PIVOTS = new Map<string, Pt>();

export function pivotOf(key: string): Pt {
  return PIVOTS.get(key) ?? [0, 0];
}

export class PixelArt {
  private region: Int16Array;
  private ramps: Ramp[] = [];
  private flat = new Map<number, number>();

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.region = new Int16Array(w * h).fill(-1);
  }

  /** 새 조각을 시작한다. 같은 색이라도 조각이 다르면 경계에 명암이 생긴다. */
  part(r: Ramp): number {
    this.ramps.push(r);
    return this.ramps.length - 1;
  }

  private set(id: number, x: number, y: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.region[iy * this.w + ix] = id;
    this.flat.delete(iy * this.w + ix);
  }

  poly(r: Ramp, pts: Pt[]): number {
    const id = this.part(r);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
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
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(id, x, y);
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

  /** 명암 계산 없이 그대로 찍는 점 (눈빛, 보석, 룬) */
  dot(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.region[i] === -1) this.region[i] = this.part([c, c, c, c]);
    this.flat.set(i, c);
  }

  dots(c: number, pts: Pt[]): void {
    for (const [x, y] of pts) this.dot(x, y, c);
  }

  /** 지운다 (찢어진 망토 끝, 구멍) */
  erase(pts: Pt[]): void {
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      this.region[y * this.w + x] = -1;
      this.flat.delete(y * this.w + x);
    }
  }

  /** 명암을 계산해 캔버스로 만든다 (사방 1픽셀 여백에 외곽선) */
  toCanvas(): HTMLCanvasElement {
    const { w, h } = this;
    const out = new Int32Array(w * h).fill(-1);
    const bbox = this.ramps.map(() => [w, h, -1, -1]);
    for (let i = 0; i < w * h; i++) {
      const id = this.region[i];
      if (id < 0) continue;
      const b = bbox[id];
      const x = i % w;
      const y = Math.floor(i / w);
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
    const same = (id: number, x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && this.region[y * w + x] === id;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
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
    const W = w + 2;
    const H = h + 2;
    const res = new Int32Array(W * H).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) res[(y + 1) * W + x + 1] = out[y * w + x];
    // 외곽선: 바깥 빈칸에 이웃 조각의 가장 어두운 색보다 더 어두운 색
    const lined = res.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (res[y * W + x] !== -1) continue;
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ]) {
          const sx = x + dx - 1;
          const sy = y + dy - 1;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const id = this.region[sy * w + sx];
          if (id < 0) continue;
          lined[y * W + x] = mix(this.ramps[id][0], 0x08040c, 0.55);
          break;
        }
      }
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.write(c.getContext('2d')!, lined, W, H);
    return c;
  }

  /** 같은 크기(여백 포함)의 캔버스에 덮어 그린다 (매 프레임 다시 그리는 천에 쓴다). */
  paint(ctx: CanvasRenderingContext2D): void {
    const src = this.toCanvas();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(src, 0, 0);
  }

  private write(ctx: CanvasRenderingContext2D, px: Int32Array, W: number, H: number): void {
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = px[i];
      if (v === -1) continue;
      img.data[i * 4] = (v >> 16) & 255;
      img.data[i * 4 + 1] = (v >> 8) & 255;
      img.data[i * 4 + 2] = v & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  /** 텍스처로 올린다. pivot은 그림 좌표 (여백 제외)로 준다. */
  register(scene: Phaser.Scene, key: string, pivot: Pt): void {
    PIVOTS.set(key, [pivot[0] + 1, pivot[1] + 1]);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, this.toCanvas());
  }
}

// 검사 동작 도트용 작은 픽셀 버퍼. DOM에 기대지 않아서 Node에서도 돌려 볼 수 있다.

export interface Buf {
  w: number;
  h: number;
  /** RGBA */
  data: Uint8ClampedArray;
}

export type Rgb = number;

export function newBuf(w: number, h: number): Buf {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function getAlpha(b: Buf, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.data[(y * b.w + x) * 4 + 3];
}

export function px(b: Buf, x: number, y: number, rgb: Rgb): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const k = (y * b.w + x) * 4;
  b.data[k] = (rgb >> 16) & 255;
  b.data[k + 1] = (rgb >> 8) & 255;
  b.data[k + 2] = rgb & 255;
  b.data[k + 3] = 255;
}

export function rect(b: Buf, x0: number, y0: number, x1: number, y1: number, rgb: Rgb): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(b, x, y, rgb);
}

/** 두 점 사이를 한 픽셀 굵기로 잇는다. color는 색 하나 또는 (몇 번째 점인지, 전체 점 수) → 색. */
export function line(b: Buf, x0: number, y0: number, x1: number, y1: number, color: Rgb | ((i: number, n: number) => Rgb)): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    px(b, x, y, typeof color === 'number' ? color : color(i, n));
  }
}

/** 굵기 w(픽셀)의 네모 붓으로 잇는다. 끝으로 갈수록 w2로 가늘어진다. 굵은 붓은 모서리를 깎아 둥글게 한다. */
export function thick(b: Buf, x0: number, y0: number, x1: number, y1: number, w: number, color: Rgb | ((i: number, n: number) => Rgb), w2 = w): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const cx = x0 + ((x1 - x0) * i) / n;
    const cy = y0 + ((y1 - y0) * i) / n;
    const ww = Math.max(1, Math.round(w + ((w2 - w) * i) / n));
    const c = typeof color === 'number' ? color : color(i, n);
    const lo = -Math.floor((ww - 1) / 2);
    for (let dy = 0; dy < ww; dy++) {
      for (let dx = 0; dx < ww; dx++) {
        const corner = (dx === 0 || dx === ww - 1) && (dy === 0 || dy === ww - 1);
        if (corner && ww >= 4) continue;
        px(b, cx + lo + dx, cy + lo + dy, c);
      }
    }
  }
}

/** 투명 칸에서 잘라낸 조각 */
export function crop(src: Buf, x: number, y: number, w: number, h: number): Buf {
  const out = newBuf(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      const sy = y + j;
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const s = (sy * src.w + sx) * 4;
      const d = (j * w + i) * 4;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = src.data[s + 3];
    }
  }
  return out;
}

/** 조각을 (dx, dy)에 붙인다. shear는 위쪽 줄일수록 앞(오른쪽)으로 밀리는 픽셀 수 (몸을 기울이는 용). */
export function blit(b: Buf, src: Buf, dx: number, dy: number, shear = 0): void {
  for (let j = 0; j < src.h; j++) {
    const off = Math.round((shear * (src.h - 1 - j)) / Math.max(1, src.h - 1));
    for (let i = 0; i < src.w; i++) {
      const s = (j * src.w + i) * 4;
      if (src.data[s + 3] === 0) continue;
      px(b, dx + i + off, dy + j, (src.data[s] << 16) | (src.data[s + 1] << 8) | src.data[s + 2]);
    }
  }
}

/** 다각형 안쪽 (짝홀 규칙) 줄마다 [x0, x1] 구간들 */
export function polySpans(points: [number, number][], h: number): Map<number, [number, number][]> {
  const spans = new Map<number, [number, number][]>();
  for (let y = 0; y < h; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    const row: [number, number][] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) row.push([Math.round(xs[k]), Math.round(xs[k + 1]) - 1]);
    if (row.length) spans.set(y, row);
  }
  return spans;
}

/** 좌우로 뒤집은 조각 */
export function flipH(src: Buf): Buf {
  const out = newBuf(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const s = (y * src.w + x) * 4;
      const d = (y * src.w + (src.w - 1 - x)) * 4;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = src.data[s + 3];
    }
  }
  return out;
}

/** 글자 그림을 조각으로 만든다. 점('.')은 비어 있고, 나머지는 pal의 색이다. */
export function fromRows(rows: string[], pal: Record<string, Rgb>): Buf {
  const w = rows[0].length;
  const out = newBuf(w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.' || c === undefined) continue;
      px(out, x, y, pal[c] ?? 0xff00ff);
    }
  });
  return out;
}

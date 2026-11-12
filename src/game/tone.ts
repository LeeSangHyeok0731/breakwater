/**
 * 색감 도우미. 이펙트를 한 가지 색의 밝기 차이로만 칠하면 밋밋하므로,
 * 기준색에서 색상을 조금 돌린 "테두리 색(rim)"과 "곁들임 색(alt)"을 함께 쓴다.
 * 따뜻한 색은 테두리가 자홍·보라 쪽으로, 곁들임이 노랑 쪽으로 가고,
 * 차가운 색은 테두리가 보라 쪽으로, 곁들임이 민트 쪽으로 간다.
 */

export interface Tone {
  /** 바깥 빛·꼬리에 쓰는 색 (기준색보다 깊고 색상이 돌아가 있다) */
  rim: number;
  /** 알갱이·결 일부에 섞는 두 번째 색 */
  alt: number;
}

export function rgbToHsv(c: number): [number, number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToRgb(h: number, s: number, v: number): number {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** 두 색을 섞는다 (t = 0이면 a, 1이면 b). */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 여러 색을 차례로 잇는 그라데이션에서 t(0~1) 위치의 색 */
export function ramp(colors: number[], t: number): number {
  const k = Math.min(0.9999, Math.max(0, t)) * (colors.length - 1);
  const i = Math.floor(k);
  return mix(colors[i], colors[i + 1], k - i);
}

const cache = new Map<number, Tone>();

/** 기준색에서 테두리 색과 곁들임 색을 뽑는다. 거의 무채색이면 푸른 기운을 조금 준다. */
export function toneOf(color: number): Tone {
  const hit = cache.get(color);
  if (hit) return hit;
  const [h, s, v] = rgbToHsv(color);
  let tone: Tone;
  if (s < 0.12) tone = { rim: hsvToRgb(0.62, 0.45, Math.max(0.55, v * 0.8)), alt: hsvToRgb(0.12, 0.3, 1) };
  else {
    let rimH: number;
    let altH: number;
    if (h < 0.17 || h >= 0.9) {
      // 빨강·주황·노랑
      rimH = h - 0.1;
      altH = h + 0.08;
    } else if (h < 0.45) {
      // 초록
      rimH = h + 0.14;
      altH = h - 0.1;
    } else if (h < 0.7) {
      // 하늘·파랑
      rimH = h + 0.11;
      altH = h - 0.13;
    } else {
      // 보라·자홍
      rimH = h - 0.1;
      altH = h + 0.11;
    }
    tone = { rim: hsvToRgb(rimH, Math.min(1, s * 0.9 + 0.2), Math.min(1, v * 0.9 + 0.05)), alt: hsvToRgb(altH, Math.max(0.35, s * 0.6), 1) };
  }
  cache.set(color, tone);
  return tone;
}

const variants = new Map<number, number[]>();

/**
 * 알갱이 하나하나의 색을 조금씩 다르게: 기준색, 색상을 살짝 돌린 두 색, 곁들임 색, 밝은 색을 돌려 쓴다.
 * i는 알갱이 번호.
 */
export function vary(color: number, i: number): number {
  let list = variants.get(color);
  if (!list) {
    const [h, s, v] = rgbToHsv(color);
    const t = toneOf(color);
    list = s < 0.12 ? [color, color, t.alt, color, mix(color, 0xffffff, 0.5)] : [color, hsvToRgb(h + 0.045, s, v), t.alt, hsvToRgb(h - 0.05, Math.min(1, s + 0.1), v), mix(color, 0xffffff, 0.55), t.rim];
    variants.set(color, list);
  }
  return list[i % list.length];
}

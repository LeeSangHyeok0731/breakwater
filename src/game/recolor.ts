import Phaser from 'phaser';

// 몬스터 색 변종: 원본 텍스처를 캔버스에 옮겨 색상(hue)을 바꾼 새 텍스처를 만든다.
// 스프라이트 시트면 칸 구성까지 그대로 복사하므로 원본과 같은 프레임 번호로 애니메이션을 만들 수 있다.

export interface HueShift {
  /** 바꿀 색상 (0~360). 정하지 않으면 원래 색상을 유지한다. */
  hue?: number;
  /** 원래 색상에 더할 각도 */
  rotate?: number;
  /** 채도 배율과 최소값 */
  sat?: number;
  minSat?: number;
  /** 밝기 배율 */
  light?: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** srcKey 텍스처의 색을 바꿔 dstKey로 등록한다. 이미 있으면 건너뛴다. */
export function recolorTexture(scene: Phaser.Scene, srcKey: string, dstKey: string, shift: HueShift): void {
  if (scene.textures.exists(dstKey)) return;
  const src = scene.textures.get(srcKey);
  const img = src.getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    const nh = ((shift.hue ?? h) + (shift.rotate ?? 0) + 360) % 360;
    const ns = Math.min(1, Math.max(shift.minSat ?? 0, s * (shift.sat ?? 1)));
    const nl = Math.min(1, l * (shift.light ?? 1));
    const [r, g, b] = hslToRgb(nh, ns, nl);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  const tex = scene.textures.addCanvas(dstKey, canvas)!;
  // 스프라이트 시트의 칸을 그대로 옮긴다 (한 장짜리 이미지는 기본 칸만 있다).
  for (const name of src.getFrameNames()) {
    const fr = src.get(name);
    tex.add(name, 0, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight);
  }
}

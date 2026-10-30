import Phaser from 'phaser';
import { BOW_STYLES, GUN_STYLES, heldCanvas, heldDef, STAFF_STYLES } from './weaponArt';

// 손에 드는 활·총·스태프 텍스처. 그림은 무기마다 다르며 weaponArt.ts에서 그린다.

export type HeldType = 'bow' | 'gun' | 'staff';

/** 손에 드는 그림의 텍스처 키 (활은 시위를 당긴 정도별로 따로) */
export function heldKey(type: HeldType, style: string, pull = 0): string {
  return type === 'bow' ? `w-bow-${style}-${pull}` : `w-${type}-${style}`;
}

/** 손잡이 위치 (0~1) */
export function heldOrigin(type: HeldType, style: string): [number, number] {
  const d = heldDef(type, style);
  return [d.grip[0] / d.w, d.grip[1] / d.h];
}

function add(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
}

export function createWeaponSprites(scene: Phaser.Scene): void {
  for (const style of BOW_STYLES) for (let pull = 0; pull <= 2; pull++) add(scene, heldKey('bow', style, pull), heldCanvas('bow', style, pull));
  for (const style of GUN_STYLES) add(scene, heldKey('gun', style), heldCanvas('gun', style));
  for (const style of STAFF_STYLES) add(scene, heldKey('staff', style), heldCanvas('staff', style));

  // 총구 화염: 10×10
  if (!scene.textures.exists('w-flash')) {
    const g = scene.make.graphics({}, false);
    const px = (color: number, x: number, y: number, w = 1, h = 1): void => {
      g.fillStyle(color).fillRect(x, y, w, h);
    };
    px(0xfff2a0, 3, 3, 4, 4);
    px(0xffd060, 0, 4, 10, 2);
    px(0xffd060, 4, 0, 2, 10);
    px(0xffffff, 4, 4, 2, 2);
    g.generateTexture('w-flash', 10, 10);
    g.destroy();
  }
}

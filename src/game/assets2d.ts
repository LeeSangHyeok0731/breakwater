import Phaser from 'phaser';
import { recolorTexture, type HueShift } from './recolor';

// GothicVania (CC0, ansimuz) 픽셀 아트. public/assets2d 아래에 있다.

const BASE = `${import.meta.env.BASE_URL}assets2d/`;

interface SheetDef {
  key: string;
  file: string;
  w: number;
  h: number;
}

/** 프레임이 한 줄로 이어진 시트 */
const SHEETS: SheetDef[] = [
  { key: 'hero-idle', file: 'hero/idle.png', w: 38, h: 48 },
  { key: 'hero-run', file: 'hero/run.png', w: 66, h: 48 },
  { key: 'hero-jump', file: 'hero/jump.png', w: 61, h: 77 },
  { key: 'hero-attack', file: 'hero/attack.png', w: 96, h: 48 },
  { key: 'hero-hurt', file: 'hero/hurt.png', w: 48, h: 48 },
  { key: 'hero-crouch', file: 'hero/crouch.png', w: 48, h: 48 },
  { key: 'hero-crouch-slash', file: 'hero/crouch-slash.png', w: 80, h: 32 },
  { key: 'hero-jump-attack', file: 'hero/jump-attack.png', w: 84, h: 80 },
  { key: 'wizard', file: 'mobs/wizard.png', w: 81, h: 66 },
  { key: 'ghoul', file: 'mobs/burning-ghoul.png', w: 57, h: 60 },
  { key: 'ghost-idle', file: 'mobs/ghost-idle.png', w: 64, h: 80 },
  { key: 'ghost-shriek', file: 'mobs/ghost-shriek.png', w: 64, h: 80 },
  { key: 'beast-idle', file: 'mobs/hell-beast-idle.png', w: 55, h: 67 },
  { key: 'beast-breath', file: 'mobs/hell-beast-breath.png', w: 64, h: 64 },
  { key: 'nightmare-idle', file: 'mobs/nightmare-idle.png', w: 128, h: 96 },
  { key: 'nightmare-gallop', file: 'mobs/nightmare-gallop.png', w: 144, h: 96 },
  { key: 'demon-idle', file: 'mobs/demon-idle.png', w: 160, h: 144 },
  { key: 'demon-attack', file: 'mobs/demon-attack.png', w: 240, h: 192 },
  { key: 'fireball', file: 'fx/fireball.png', w: 26, h: 26 },
  // 챕터 2·3 몬스터
  { key: 'ghost-lantern', file: 'mobs/ghost-lantern.png', w: 37, h: 65 },
  { key: 'ghost-halo', file: 'mobs/ghost-halo.png', w: 37, h: 65 },
  { key: 'fire-skull', file: 'mobs/fire-skull.png', w: 96, h: 112 },
  { key: 'hell-cat', file: 'mobs/hell-cat.png', w: 96, h: 53 },
  { key: 'angel-idle', file: 'mobs/angel-idle.png', w: 122, h: 117 },
  { key: 'angel-attack', file: 'mobs/angel-attack.png', w: 122, h: 117 },
  { key: 'hound-idle', file: 'mobs/hound-idle.png', w: 64, h: 32 },
  { key: 'hound-run', file: 'mobs/hound-run.png', w: 67, h: 32 },
  { key: 'hound-jump', file: 'mobs/hound-jump.png', w: 65, h: 48 },
  { key: 'wolf-run', file: 'mobs/wolf-run.png', w: 56, h: 32 },
  { key: 'beast-burn', file: 'mobs/beast-burn.png', w: 111, h: 160 },
  { key: 'enemy-death', file: 'fx/enemy-death.png', w: 81, h: 66 },
  { key: 'npc-bearded', file: 'npc/bearded-idle.png', w: 40, h: 47 },
  { key: 'npc-hatman', file: 'npc/hat-man-idle.png', w: 39, h: 52 },
  { key: 'npc-oldman', file: 'npc/oldman-idle.png', w: 34, h: 42 },
  { key: 'npc-woman', file: 'npc/woman-idle.png', w: 37, h: 46 },
];

/** 한 장짜리 이미지 */
const IMAGES: [string, string][] = [
  ['cem-tiles', 'cemetery/tileset.png'],
  ['cem-bg', 'cemetery/background.png'],
  ['cem-mountains', 'cemetery/mountains.png'],
  ['cem-graveyard', 'cemetery/graveyard.png'],
  ['castle-bg', 'castle/background.png'],
  ['castle-tiles', 'castle/tileset.png'],
  ['church-bg', 'church/backgrounds.png'],
  ['church-tiles', 'church/tileset.png'],
  ['church-column', 'church/column.png'],
  ['night-sky', 'night/sky.png'],
  ['night-mountains', 'night/mountains.png'],
  ['night-clouds', 'night/clouds.png'],
  ['night-town', 'night/town.png'],
  ['night-forest', 'night/forest.png'],
  ['town-bg', 'town/background.png'],
  ['town-mid', 'town/middleground.png'],
  ['town-tiles', 'town/tileset.png'],
  ['house-a', 'town/house-a.png'],
  ['house-b', 'town/house-b.png'],
  ['house-c', 'town/house-c.png'],
  ['barrel', 'town/barrel.png'],
  ['crate', 'town/crate.png'],
  ['crate-stack', 'town/crate-stack.png'],
  ['sign', 'town/sign.png'],
  ['street-lamp', 'town/street-lamp.png'],
  ['wagon', 'town/wagon.png'],
  ['well', 'town/well.png'],
  ['beast-fireball', 'fx/beast-fireball.png'],
  ['bush-large', 'cemetery/bush-large.png'],
  ['bush-small', 'cemetery/bush-small.png'],
  ['statue', 'cemetery/statue.png'],
  ['stone-1', 'cemetery/stone-1.png'],
  ['stone-2', 'cemetery/stone-2.png'],
  ['stone-3', 'cemetery/stone-3.png'],
  ['stone-4', 'cemetery/stone-4.png'],
  ['tree-1', 'cemetery/tree-1.png'],
  ['tree-2', 'cemetery/tree-2.png'],
  ['tree-3', 'cemetery/tree-3.png'],
];

/** 낱장 프레임으로 된 애니메이션 [키 접두사, 장 수] */
const FRAME_SETS: [string, number][] = [
  ['skeleton', 8],
  ['skeleton-clothed', 8],
  ['skeleton-rise', 6],
  ['skeleton-rise-clothed', 6],
];

export function preloadAssets(scene: Phaser.Scene): void {
  for (const s of SHEETS) scene.load.spritesheet(s.key, BASE + s.file, { frameWidth: s.w, frameHeight: s.h });
  for (const [key, file] of IMAGES) scene.load.image(key, BASE + file);
  for (const [prefix, n] of FRAME_SETS) {
    for (let i = 1; i <= n; i++) scene.load.image(`${prefix}-${i}`, `${BASE}mobs/${prefix}-${i}.png`);
  }
}

/** 애니메이션별 기준점 X (칼 궤적처럼 한쪽으로 긴 프레임은 몸통 위치가 가운데가 아니다) */
export const ORIGIN_X: Record<string, number> = {
  'hero-attack': 0.36,
  'hero-jump-attack': 0.43,
  'hero-crouch-slash': 0.3,
};

function sheetAnim(scene: Phaser.Scene, key: string, sheet: string, start: number, end: number, rate: number, repeat = -1): void {
  scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(sheet, { start, end }), frameRate: rate, repeat });
}

/** 기존 몬스터를 다시 칠한 색 변종 (핏빛 해골, 서리 마법사, 망령 기사, 심연의 군주) */
function createVariants(scene: Phaser.Scene): void {
  const blood: HueShift = { hue: 2, minSat: 0.55, light: 0.95 };
  for (let i = 1; i <= 8; i++) recolorTexture(scene, `skeleton-${i}`, `skeleton-blood-${i}`, blood);
  for (let i = 1; i <= 6; i++) recolorTexture(scene, `skeleton-rise-${i}`, `skeleton-rise-blood-${i}`, blood);
  framesAnim(scene, 'skeleton-blood-walk', 'skeleton-blood', 8, 13);
  framesAnim(scene, 'skeleton-blood-rise', 'skeleton-rise-blood', 6, 9, 0);

  recolorTexture(scene, 'wizard', 'wizard-frost', { hue: 200, minSat: 0.45, light: 1.1 });
  sheetAnim(scene, 'wizard-frost-idle', 'wizard-frost', 0, 4, 7);
  sheetAnim(scene, 'wizard-frost-cast', 'wizard-frost', 5, 14, 14, 0);

  const wraith: HueShift = { hue: 172, sat: 0.8, light: 1.25 };
  recolorTexture(scene, 'nightmare-idle', 'nightmare-wraith-idle', wraith);
  recolorTexture(scene, 'nightmare-gallop', 'nightmare-wraith-gallop', wraith);
  sheetAnim(scene, 'wraith-idle', 'nightmare-wraith-idle', 0, 3, 6);
  sheetAnim(scene, 'wraith-gallop', 'nightmare-wraith-gallop', 0, 3, 12);

  const abyss: HueShift = { rotate: 270, sat: 1.1, light: 0.9 };
  recolorTexture(scene, 'demon-idle', 'demon-abyss-idle', abyss);
  recolorTexture(scene, 'demon-attack', 'demon-abyss-attack', abyss);
  sheetAnim(scene, 'abyss-idle', 'demon-abyss-idle', 0, 5, 8);
  sheetAnim(scene, 'abyss-attack', 'demon-abyss-attack', 0, 10, 12, 0);
}

function framesAnim(scene: Phaser.Scene, key: string, prefix: string, n: number, rate: number, repeat = -1): void {
  const frames = [];
  for (let i = 1; i <= n; i++) frames.push({ key: `${prefix}-${i}` });
  scene.anims.create({ key, frames, frameRate: rate, repeat });
}

export function createAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists('hero-idle')) return;
  sheetAnim(scene, 'hero-idle', 'hero-idle', 0, 3, 6);
  sheetAnim(scene, 'hero-run', 'hero-run', 0, 11, 16);
  sheetAnim(scene, 'hero-jump', 'hero-jump', 0, 4, 10, 0);
  sheetAnim(scene, 'hero-attack', 'hero-attack', 0, 5, 20, 0);
  sheetAnim(scene, 'hero-hurt', 'hero-hurt', 0, 2, 12, 0);
  sheetAnim(scene, 'hero-crouch', 'hero-crouch', 0, 2, 14, 0);
  sheetAnim(scene, 'hero-crouch-slash', 'hero-crouch-slash', 0, 3, 18, 0);
  sheetAnim(scene, 'hero-jump-attack', 'hero-jump-attack', 0, 5, 20, 0);

  framesAnim(scene, 'skeleton-walk', 'skeleton', 8, 10);
  framesAnim(scene, 'skeleton-rise', 'skeleton-rise', 6, 9, 0);
  framesAnim(scene, 'skeleton-clothed-walk', 'skeleton-clothed', 8, 10);
  framesAnim(scene, 'skeleton-clothed-rise', 'skeleton-rise-clothed', 6, 9, 0);
  sheetAnim(scene, 'wizard-idle', 'wizard', 0, 4, 7);
  sheetAnim(scene, 'wizard-cast', 'wizard', 5, 14, 14, 0);
  sheetAnim(scene, 'ghoul-walk', 'ghoul', 0, 7, 10);
  sheetAnim(scene, 'ghost-idle', 'ghost-idle', 0, 6, 9);
  sheetAnim(scene, 'ghost-shriek', 'ghost-shriek', 0, 3, 10, 0);
  sheetAnim(scene, 'beast-idle', 'beast-idle', 0, 5, 8);
  sheetAnim(scene, 'beast-breath', 'beast-breath', 0, 3, 8, 0);
  sheetAnim(scene, 'nightmare-idle', 'nightmare-idle', 0, 3, 6);
  sheetAnim(scene, 'nightmare-gallop', 'nightmare-gallop', 0, 3, 12);
  sheetAnim(scene, 'demon-idle', 'demon-idle', 0, 5, 8);
  sheetAnim(scene, 'demon-attack', 'demon-attack', 0, 10, 12, 0);
  sheetAnim(scene, 'fireball', 'fireball', 0, 2, 14);
  // 시트 첫 칸에 마법사 그림이 섞여 있어 1번 칸부터 쓴다.
  sheetAnim(scene, 'enemy-death', 'enemy-death', 1, 8, 20, 0);
  sheetAnim(scene, 'npc-bearded', 'npc-bearded', 0, 4, 6);
  sheetAnim(scene, 'npc-hatman', 'npc-hatman', 0, 3, 6);
  sheetAnim(scene, 'npc-oldman', 'npc-oldman', 0, 7, 6);
  sheetAnim(scene, 'npc-woman', 'npc-woman', 0, 6, 6);

  // 챕터 2·3 몬스터
  sheetAnim(scene, 'lantern-idle', 'ghost-lantern', 0, 3, 6);
  sheetAnim(scene, 'halo-idle', 'ghost-halo', 0, 3, 6);
  sheetAnim(scene, 'fire-skull', 'fire-skull', 0, 7, 12);
  sheetAnim(scene, 'cat-walk', 'hell-cat', 0, 3, 9);
  sheetAnim(scene, 'angel-idle', 'angel-idle', 0, 7, 10);
  sheetAnim(scene, 'angel-attack', 'angel-attack', 0, 2, 12, 0);
  sheetAnim(scene, 'hound-idle', 'hound-idle', 0, 5, 8);
  sheetAnim(scene, 'hound-run', 'hound-run', 0, 4, 14);
  sheetAnim(scene, 'hound-jump', 'hound-jump', 0, 5, 12, 0);
  sheetAnim(scene, 'wolf-run', 'wolf-run', 0, 3, 12);
  sheetAnim(scene, 'beast-burn', 'beast-burn', 0, 3, 10, 0);
  // 화염 헬비스트의 불기둥 (불타는 그림의 뒤쪽 두 칸)
  sheetAnim(scene, 'fire-pillar', 'beast-burn', 2, 3, 12);
  createVariants(scene);

  // 타일셋에서 쓸 조각을 잘라 프레임으로 등록한다.
  const cem = scene.textures.get('cem-tiles');
  cem.add('ground', 0, 64, 48, 64, 48);
  cem.add('plat-l', 0, 16, 64, 16, 32);
  cem.add('plat-m', 0, 80, 48, 32, 32);
  cem.add('plat-r', 0, 192, 64, 16, 32);
  const town = scene.textures.get('town-tiles');
  town.add('ground', 0, 48, 144, 48, 32);
}

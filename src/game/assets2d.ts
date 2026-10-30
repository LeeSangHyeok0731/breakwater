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
  // 챕터 4·5 몬스터
  { key: 'skull', file: 'mobs/skull.png', w: 54, h: 70 },
  { key: 'shade-appear', file: 'mobs/shade-appear.png', w: 48, h: 48 },
  { key: 'shade-vanish', file: 'mobs/shade-vanish.png', w: 64, h: 64 },
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
  ['horror-clouds', 'horror/clouds.png'],
  ['horror-town', 'horror/town.png'],
  ['horror-tiles', 'horror/tiles.png'],
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

/** 챕터 4·5 색 변종 */
function createVariants45(scene: Phaser.Scene): void {
  const v = (src: string, dst: string, shift: HueShift): void => recolorTexture(scene, src, dst, shift);
  // 역병 늑대: 병든 녹색
  v('wolf-run', 'wolf-plague', { hue: 85, minSat: 0.45, light: 0.8 });
  sheetAnim(scene, 'plague-wolf-run', 'wolf-plague', 0, 3, 12);
  // 강철 헬비스트: 무쇠빛
  const iron: HueShift = { hue: 210, sat: 0.18, light: 1.15 };
  v('beast-idle', 'beast-iron-idle', iron);
  v('beast-breath', 'beast-iron-breath', iron);
  sheetAnim(scene, 'iron-idle', 'beast-iron-idle', 0, 5, 8);
  sheetAnim(scene, 'iron-breath', 'beast-iron-breath', 0, 3, 8, 0);
  // 저주받은 기사: 검붉은 악몽마
  const cursed: HueShift = { hue: 352, minSat: 0.5, light: 0.85 };
  v('nightmare-idle', 'nightmare-cursed-idle', cursed);
  v('nightmare-gallop', 'nightmare-cursed-gallop', cursed);
  sheetAnim(scene, 'cursed-idle', 'nightmare-cursed-idle', 0, 3, 6);
  sheetAnim(scene, 'cursed-gallop', 'nightmare-cursed-gallop', 0, 3, 12);
  // 밤의 여왕: 검은 날개의 천사
  const night: HueShift = { hue: 345, minSat: 0.55, light: 0.32 };
  v('angel-idle', 'angel-night-idle', night);
  v('angel-attack', 'angel-night-attack', night);
  sheetAnim(scene, 'queen-idle', 'angel-night-idle', 0, 7, 10);
  sheetAnim(scene, 'queen-attack', 'angel-night-attack', 0, 2, 12, 0);
  // 공허 지옥견: 검푸른 몸
  const vh: HueShift = { hue: 188, minSat: 0.5, light: 0.85 };
  v('hound-run', 'hound-void-run', vh);
  v('hound-jump', 'hound-void-jump', vh);
  v('hound-idle', 'hound-void-idle', vh);
  sheetAnim(scene, 'vhound-run', 'hound-void-run', 0, 4, 16);
  sheetAnim(scene, 'vhound-jump', 'hound-void-jump', 0, 5, 12, 0);
  sheetAnim(scene, 'vhound-idle', 'hound-void-idle', 0, 5, 8);
  // 공허 마법사: 검보라 로브
  v('wizard', 'wizard-void', { hue: 268, minSat: 0.5, light: 0.7 });
  sheetAnim(scene, 'vmage-idle', 'wizard-void', 0, 4, 7);
  sheetAnim(scene, 'vmage-cast', 'wizard-void', 5, 14, 14, 0);
  // 하급 악마: 주황빛 작은 악마
  const lesser: HueShift = { hue: 24, minSat: 0.6, light: 1 };
  v('demon-idle', 'demon-lesser-idle', lesser);
  v('demon-attack', 'demon-lesser-attack', lesser);
  sheetAnim(scene, 'ldemon-idle', 'demon-lesser-idle', 0, 5, 8);
  sheetAnim(scene, 'ldemon-attack', 'demon-lesser-attack', 0, 10, 14, 0);
  // 공허 천사: 청록 날개
  const va: HueShift = { hue: 186, minSat: 0.45, light: 0.75 };
  v('angel-idle', 'angel-void-idle', va);
  v('angel-attack', 'angel-void-attack', va);
  sheetAnim(scene, 'vangel-idle', 'angel-void-idle', 0, 7, 10);
  sheetAnim(scene, 'vangel-attack', 'angel-void-attack', 0, 2, 12, 0);
  // 공허 기사: 검보라 악몽마
  const vk: HueShift = { hue: 262, minSat: 0.5, light: 0.65 };
  v('nightmare-idle', 'nightmare-void-idle', vk);
  v('nightmare-gallop', 'nightmare-void-gallop', vk);
  sheetAnim(scene, 'vknight-idle', 'nightmare-void-idle', 0, 3, 6);
  sheetAnim(scene, 'vknight-gallop', 'nightmare-void-gallop', 0, 3, 12);
  // 공허의 왕: 검은 몸에 청록 불꽃
  const king: HueShift = { hue: 190, minSat: 0.6, light: 0.6 };
  v('demon-idle', 'demon-void-idle', king);
  v('demon-attack', 'demon-void-attack', king);
  sheetAnim(scene, 'vking-idle', 'demon-void-idle', 0, 5, 8);
  sheetAnim(scene, 'vking-attack', 'demon-void-attack', 0, 10, 12, 0);
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
  sheetAnim(scene, 'cursed-skull', 'skull', 0, 3, 8);
  // 그림자 망령: 나타나기 마지막 두 칸을 서 있는 모습으로 쓴다.
  sheetAnim(scene, 'shade-idle', 'shade-appear', 6, 7, 5);
  sheetAnim(scene, 'shade-appear', 'shade-appear', 0, 7, 16, 0);
  sheetAnim(scene, 'shade-vanish', 'shade-vanish', 0, 6, 16, 0);
  createVariants(scene);
  createVariants45(scene);

  // 타일셋에서 쓸 조각을 잘라 프레임으로 등록한다.
  const cem = scene.textures.get('cem-tiles');
  cem.add('ground', 0, 64, 48, 64, 48);
  cem.add('plat-l', 0, 16, 64, 16, 32);
  cem.add('plat-m', 0, 80, 48, 32, 32);
  cem.add('plat-r', 0, 192, 64, 16, 32);
  const town = scene.textures.get('town-tiles');
  town.add('ground', 0, 48, 144, 48, 32);
  // 대성당: 보라색 석재 블록
  const church = scene.textures.get('church-tiles');
  church.add('ground', 0, 64, 168, 48, 40);
  church.add('plat-l', 0, 64, 168, 16, 32);
  church.add('plat-m', 0, 64, 168, 48, 32);
  church.add('plat-r', 0, 96, 168, 16, 32);
  // 마왕성: 위가 이끼로 덮인 녹색 벽돌
  const castle = scene.textures.get('castle-tiles');
  castle.add('ground', 0, 512, 154, 32, 48);
  castle.add('plat-l', 0, 464, 154, 16, 22);
  castle.add('plat-m', 0, 464, 154, 32, 22);
  castle.add('plat-r', 0, 480, 154, 16, 22);
  // 저주받은 마을: 나무 판자 발판과 담쟁이 덮인 벽돌
  const horror = scene.textures.get('horror-tiles');
  horror.add('ground', 0, 32, 64, 48, 32);
  horror.add('plat-l', 0, 32, 16, 16, 16);
  horror.add('plat-m', 0, 48, 16, 32, 16);
  horror.add('plat-r', 0, 96, 16, 16, 16);
  horror.add('arch', 0, 224, 112, 32, 48);
  horror.add('shrine', 0, 272, 64, 32, 96);
  horror.add('skulls', 0, 128, 96, 32, 48);
  horror.add('ivy', 0, 336, 112, 32, 48);
  horror.add('house', 0, 460, 0, 312, 176);
  horror.add('ruin', 0, 784, 20, 256, 156);
}

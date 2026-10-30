import Phaser from 'phaser';
import type { Theme } from '../data/phases';
import { DEPTH } from './fx';

/** 기본 가로 해상도. 실제 가로는 창 비율에 맞춰 MIN~MAX 사이에서 정해진다. */
export const VIEW_W = 640;
export const VIEW_W_MAX = 960;
export const VIEW_H = 360;

/** 화면(부모 요소) 비율에 맞는 게임 가로 해상도 */
export function fitWidth(el: HTMLElement): number {
  const r = el.clientWidth / Math.max(1, el.clientHeight);
  return Math.max(560, Math.min(VIEW_W_MAX, Math.round(VIEW_H * r)));
}
/** 땅 타일의 윗면 */
export const GROUND_Y = 312;
/** 실제로 밟는 높이 (타일 위 풀 때문에 조금 아래) */
export const FLOOR_Y = GROUND_Y + 8;

interface ParallaxLayer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
}

export interface Level {
  width: number;
  /** 땅 (아래에서 통과 불가) */
  solids: Phaser.Physics.Arcade.StaticGroup;
  /** 발판 (아래에서 뛰어오를 수 있고, ↓+점프로 내려간다) */
  platforms: Phaser.Physics.Arcade.StaticGroup;
  /** 발판 윗면 목록 (몬스터 배치·AI용) */
  surfaces: { x: number; y: number; w: number }[];
  update(): void;
}

const THEME_TINT: Record<Theme, { bg: number; far: number; near: number; ground: number }> = {
  day: { bg: 0xffffff, far: 0xffffff, near: 0xffffff, ground: 0xffffff },
  dusk: { bg: 0xffb08a, far: 0xe0907a, near: 0xd8a080, ground: 0xf0c8a8 },
  night: { bg: 0x8090e0, far: 0x7080c8, near: 0x8090c0, ground: 0xa0a8d0 },
  lava: { bg: 0xff7060, far: 0xc04838, near: 0xb05040, ground: 0xe08070 },
  church: { bg: 0xffffff, far: 0xc8c0e0, near: 0xffffff, ground: 0xffffff },
  castle: { bg: 0xd0e0d8, far: 0xffffff, near: 0xffffff, ground: 0xffffff },
};

/** 테마별 바닥·발판 타일 */
interface TileSet {
  key: string;
  /** 바닥 띠의 높이 */
  groundH: number;
  /** 바닥 그림을 GROUND_Y보다 얼마나 내려 그리는가 (풀이 없는 타일은 밟는 높이에 윗면을 맞춘다) */
  groundDrop: number;
  platH: number;
  /** 발판 그림 윗면에서 실제로 밟는 면까지 */
  platTop: number;
  /** 땅 아래를 채우는 색 */
  under: number;
}

const TILES: Record<'cemetery' | 'church' | 'castle', TileSet> = {
  cemetery: { key: 'cem-tiles', groundH: 48, groundDrop: 0, platH: 32, platTop: 7, under: 0x140c18 },
  church: { key: 'church-tiles', groundH: 40, groundDrop: 7, platH: 32, platTop: 1, under: 0x1a1426 },
  castle: { key: 'castle-tiles', groundH: 48, groundDrop: 7, platH: 22, platTop: 1, under: 0x0c1814 },
};

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 화면에 고정된 채 카메라 이동에 맞춰 무늬만 흐르는 배경 층 */
function layer(scene: Phaser.Scene, key: string, y: number, h: number, factor: number, tint: number, depth: number): ParallaxLayer {
  const tex = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const scale = h / tex.height;
  const sprite = scene.add
    .tileSprite(0, y, VIEW_W_MAX / scale, tex.height, key)
    .setOrigin(0, 0)
    .setScale(scale)
    .setScrollFactor(0)
    .setTint(tint)
    .setDepth(depth);
  return { sprite, factor: factor / scale };
}

/**
 * 대성당 벽: 교회 배경 그림의 패널(창문·기둥·제단·가고일·횃불)이 사이사이 비어 있으므로,
 * 빈 세로줄을 걸러 패널만 이어 붙인 띠 텍스처를 한 번 만든다.
 */
function churchWall(scene: Phaser.Scene): string {
  const key = 'church-wall';
  if (scene.textures.exists(key)) return key;
  const img = scene.textures.get('church-bg').getSourceImage() as HTMLImageElement;
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, img.width, img.height).data;
  const filled: number[] = [];
  for (let x = 0; x < img.width; x++) {
    // 가운데 높이에서 불투명하면 패널의 일부로 본다.
    if (data[((img.height >> 1) * img.width + x) * 4 + 3] > 0) filled.push(x);
  }
  const out = document.createElement('canvas');
  out.width = filled.length;
  out.height = img.height;
  const octx = out.getContext('2d')!;
  filled.forEach((x, i) => octx.drawImage(src, x, 0, 1, img.height, i, 0, 1, img.height));
  scene.textures.addCanvas(key, out);
  return key;
}

/** 전투 맵 (묘지 계열 · 대성당 · 마왕성) */
export function buildLevel(scene: Phaser.Scene, width: number, platforms: [number, number, number][], theme: Theme, seed: number): Level {
  const tint = THEME_TINT[theme];
  const layers: ParallaxLayer[] = [];
  const tiles = theme === 'church' ? TILES.church : theme === 'castle' ? TILES.castle : TILES.cemetery;
  const bgColor: Partial<Record<Theme, string>> = { lava: '#1a0606', church: '#100c1c', castle: '#08100e' };
  scene.cameras.main.setBackgroundColor(bgColor[theme] ?? '#120a1e');

  if (theme === 'church') {
    // 패널 벽이 화면 위부터 바닥까지 채운다.
    layers.push(layer(scene, churchWall(scene), -12, GROUND_Y + 24, 0.4, tint.far, DEPTH.bg));
  } else if (theme === 'castle') {
    layers.push(layer(scene, 'castle-bg', 0, VIEW_H, 0.3, tint.bg, DEPTH.bg));
  } else if (theme === 'lava') {
    const bg = scene.add.image(VIEW_W_MAX / 2, VIEW_H / 2, 'castle-bg').setScrollFactor(0).setDepth(DEPTH.bg).setTint(0xff9080);
    bg.setScale(Math.max(VIEW_W_MAX / bg.width, VIEW_H / bg.height) * 1.05);
    layers.push(layer(scene, 'cem-mountains', 120, 200, 0.15, tint.far, DEPTH.bg + 1));
  } else if (theme === 'night') {
    layers.push(layer(scene, 'night-sky', 0, VIEW_H, 0, 0xffffff, DEPTH.bg));
    layers.push(layer(scene, 'night-clouds', 0, 240, 0.05, 0xffffff, DEPTH.bg + 1));
    layers.push(layer(scene, 'night-mountains', 60, 260, 0.12, 0xffffff, DEPTH.bg + 2));
    layers.push(layer(scene, 'night-town', 170, 150, 0.3, 0xc0c8ff, DEPTH.bg + 3));
  } else {
    // 달이 화면 가운데 오도록 현재 가로 해상도 기준으로 놓는다.
    const bg = scene.add.image(scene.scale.width / 2, VIEW_H / 2 - 20, 'cem-bg').setScrollFactor(0).setDepth(DEPTH.bg).setTint(tint.bg);
    bg.setScale(Math.max(VIEW_W_MAX / bg.width, VIEW_H / bg.height));
    layers.push(layer(scene, 'cem-mountains', 110, 210, 0.15, tint.far, DEPTH.bg + 1));
  }
  if (tiles === TILES.cemetery) layers.push(layer(scene, 'cem-graveyard', 170, 150, 0.45, tint.near, DEPTH.bg + 4));

  // 땅: 타일 띠 + 아래 흙
  const groundTop = GROUND_Y + tiles.groundDrop;
  scene.add
    .tileSprite(-64, groundTop, width + 128, tiles.groundH, tiles.key, 'ground')
    .setOrigin(0, 0)
    .setTint(tint.ground)
    .setDepth(DEPTH.platform);
  scene.add
    .rectangle(-64, groundTop + tiles.groundH - 2, width + 128, VIEW_H, theme === 'lava' ? 0x1a0a08 : tiles.under)
    .setOrigin(0, 0)
    .setDepth(DEPTH.platform);

  const solids = scene.physics.add.staticGroup();
  const ground = scene.add.zone(width / 2, FLOOR_Y + 40, width + 200, 80);
  solids.add(ground);

  const plats = scene.physics.add.staticGroup();
  const surfaces: { x: number; y: number; w: number }[] = [];
  const h = tiles.platH;
  for (const [x, y, w] of platforms) {
    // 풀이 없는 타일은 밟는 면(y + 7)에 윗면을 맞춘다.
    const top = y + 7;
    const gy = top - tiles.platTop;
    scene.add.image(x, gy, tiles.key, 'plat-l').setOrigin(0, 0).setTint(tint.ground).setDepth(DEPTH.platform);
    scene.add
      .tileSprite(x + 16, gy, w - 32, h, tiles.key, 'plat-m')
      .setOrigin(0, 0)
      .setTint(tint.ground)
      .setDepth(DEPTH.platform);
    scene.add.image(x + w - 16, gy, tiles.key, 'plat-r').setOrigin(0, 0).setTint(tint.ground).setDepth(DEPTH.platform);
    const zone = scene.add.zone(x + w / 2, top + 4, w - 4, 8);
    plats.add(zone);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    surfaces.push({ x, y: top, w });
  }

  const rand = seeded(seed);
  if (theme === 'church') {
    // 장식: 해골이 새겨진 돌기둥이 일정하게 늘어선다.
    for (let x = 120 + rand() * 80; x < width - 60; x += 260 + rand() * 120) {
      scene.add.image(x, groundTop + 2, 'church-column').setOrigin(0.5, 1).setDepth(DEPTH.deco - 2).setTint(0xb8b0d0);
    }
  } else if (theme !== 'castle') {
    // 장식: 비석·덤불·나무·석상
    const decoKeys = ['stone-1', 'stone-2', 'stone-3', 'stone-4', 'bush-small', 'bush-large', 'tree-1', 'tree-2', 'tree-3', 'statue'];
    for (let x = 40; x < width - 40; x += 70 + rand() * 120) {
      const key = decoKeys[Math.floor(rand() * decoKeys.length)];
      const big = key.startsWith('tree') || key === 'statue';
      scene.add
        .image(x, GROUND_Y + 6, key)
        .setOrigin(0.5, 1)
        .setTint(tint.near)
        .setDepth(big ? DEPTH.deco - 2 : DEPTH.deco)
        .setAlpha(big ? 0.9 : 1);
    }
  }

  const cam = scene.cameras.main;
  return {
    width,
    solids,
    platforms: plats,
    surfaces,
    update(): void {
      for (const l of layers) l.sprite.tilePositionX = cam.scrollX * l.factor;
    },
  };
}

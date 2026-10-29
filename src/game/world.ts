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

/** 묘지 계열 전투 맵 */
export function buildLevel(scene: Phaser.Scene, width: number, platforms: [number, number, number][], theme: Theme, seed: number): Level {
  const tint = THEME_TINT[theme];
  const layers: ParallaxLayer[] = [];
  scene.cameras.main.setBackgroundColor(theme === 'lava' ? '#1a0606' : '#120a1e');

  if (theme === 'lava') {
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
  layers.push(layer(scene, 'cem-graveyard', 170, 150, 0.45, tint.near, DEPTH.bg + 4));

  // 땅: 타일 띠 + 아래 흙
  scene.add
    .tileSprite(-64, GROUND_Y, width + 128, 48, 'cem-tiles', 'ground')
    .setOrigin(0, 0)
    .setTint(tint.ground)
    .setDepth(DEPTH.platform);
  scene.add
    .rectangle(-64, GROUND_Y + 46, width + 128, VIEW_H, theme === 'lava' ? 0x1a0a08 : 0x140c18)
    .setOrigin(0, 0)
    .setDepth(DEPTH.platform);

  const solids = scene.physics.add.staticGroup();
  const ground = scene.add.zone(width / 2, FLOOR_Y + 40, width + 200, 80);
  solids.add(ground);

  const plats = scene.physics.add.staticGroup();
  const surfaces: { x: number; y: number; w: number }[] = [];
  for (const [x, y, w] of platforms) {
    scene.add.image(x, y, 'cem-tiles', 'plat-l').setOrigin(0, 0).setTint(tint.ground).setDepth(DEPTH.platform);
    scene.add
      .tileSprite(x + 16, y, w - 32, 32, 'cem-tiles', 'plat-m')
      .setOrigin(0, 0)
      .setTint(tint.ground)
      .setDepth(DEPTH.platform);
    scene.add.image(x + w - 16, y, 'cem-tiles', 'plat-r').setOrigin(0, 0).setTint(tint.ground).setDepth(DEPTH.platform);
    const top = y + 7;
    const zone = scene.add.zone(x + w / 2, top + 4, w - 4, 8);
    plats.add(zone);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    surfaces.push({ x, y: top, w });
  }

  // 장식: 비석·덤불·나무·석상
  const rand = seeded(seed);
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

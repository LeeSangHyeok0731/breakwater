import type Phaser from 'phaser';
import { recolorAnims } from '../dragon/chapter6Art';

/**
 * 마왕 레이드 그림 (부팅 때 한 번).
 * - 임시 마왕: 악마 시트를 핏빛 진홍으로 다시 칠한다. PR 2에서 전용 리그로 바뀐다.
 * - 봉인의 결정: 코드로 그린 검붉은 수정.
 */

export const RAID_DEMON_IDLE = 'raid-demon-idle';
export const RAID_DEMON_ATTACK = 'raid-demon-attack';
export const CRYSTAL_ANIM = 'seal-crystal-idle';
const CRYSTAL_TEX = 'seal-crystal';
const CW = 22;
const CH = 40;

export function createRaidArt(scene: Phaser.Scene): void {
  recolorAnims(scene, 'demon-idle', 'raid-demon-idle-sheet', { hue: 352, minSat: 0.7, light: 0.5 }, [[RAID_DEMON_IDLE, 0, 5, 8]]);
  recolorAnims(scene, 'demon-attack', 'raid-demon-attack-sheet', { hue: 352, minSat: 0.7, light: 0.5 }, [[RAID_DEMON_ATTACK, 0, 10, 12, 0]]);
  makeCrystal(scene);
}

/** 위아래로 뾰족한 육각 수정. 가운데에 봉인 문양. 무기 색은 그 위에 따로 띄운다. */
function makeCrystal(scene: Phaser.Scene): void {
  if (!scene.textures.exists(CRYSTAL_TEX)) {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const g = c.getContext('2d')!;
    const cx = CW / 2;
    for (let y = 0; y < CH; y++) {
      // 위 1/3은 뾰족하게 넓어지고, 가운데는 곧고, 아래 1/4은 좁아진다.
      const half = y < 13 ? (y / 13) * 10 : y > 30 ? ((CH - y) / 10) * 10 : 10;
      for (let x = 0; x < CW; x++) {
        const dx = x + 0.5 - cx;
        if (Math.abs(dx) > half) continue;
        const edge = Math.abs(dx) > half - 1.2;
        // 왼쪽 면은 밝게, 오른쪽 면은 어둡게, 가운데 능선은 가장 밝게
        let col = dx < -3 ? '#e04a5a' : dx < 0 ? '#ff8a94' : dx < 3 ? '#b02a3c' : '#6a1426';
        if (Math.abs(dx) < 0.8) col = '#ffd0d4';
        if (edge) col = '#2a0610';
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    // 가운데 봉인 문양 (마름모 고리)
    g.fillStyle = '#ffe28a';
    for (const [x, y] of [[11, 17], [10, 18], [12, 18], [9, 19], [13, 19], [10, 20], [12, 20], [11, 21]]) g.fillRect(x, y, 1, 1);
    scene.textures.addCanvas(CRYSTAL_TEX, c);
  }
  if (!scene.anims.exists(CRYSTAL_ANIM)) scene.anims.create({ key: CRYSTAL_ANIM, frames: [{ key: CRYSTAL_TEX }], frameRate: 1, repeat: -1 });
}

import type Phaser from 'phaser';

/** 허수아비 그림 (애니메이션 키). 처음 세울 때 한 번 그린다. */
export const SCARECROW_ANIM = 'scarecrow-idle';
const TEXTURE = 'scarecrow';
const W = 40;
const H = 52;

const WOOD = '#6b4526';
const WOOD_DARK = '#44291a';
const SACK = '#d9bd86';
const SACK_DARK = '#a98a58';
const HAT = '#7a5a30';
const HAT_DARK = '#4e3820';
const COAT = '#8c3f3a';
const COAT_DARK = '#5e2829';
const PATCH = '#3f6f78';
const STRAW = '#e8c95a';
const STRAW_DARK = '#b8912f';
const INK = '#2a1a12';

export function ensureScarecrow(scene: Phaser.Scene): void {
  if (scene.anims.exists(SCARECROW_ANIM)) return;
  if (!scene.textures.exists(TEXTURE)) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const rect = (x: number, y: number, w: number, h: number, color: string): void => {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
    // 기둥과 가로대
    rect(18, 18, 4, 34, WOOD);
    rect(21, 18, 1, 34, WOOD_DARK);
    rect(4, 23, 32, 3, WOOD);
    rect(4, 25, 32, 1, WOOD_DARK);
    // 땅에 박힌 부분의 지푸라기
    for (const [x, h] of [[13, 3], [15, 5], [17, 3], [22, 4], [24, 5], [26, 3]]) rect(x, H - h, 1, h, x % 3 ? STRAW : STRAW_DARK);
    // 양손 끝의 지푸라기
    for (const [x, y, w] of [[1, 22, 4], [0, 24, 4], [1, 26, 4], [35, 22, 4], [36, 24, 4], [35, 26, 4]]) rect(x, y, w, 1, y === 24 ? STRAW_DARK : STRAW);
    // 해진 외투
    rect(12, 22, 16, 15, COAT);
    rect(24, 22, 4, 15, COAT_DARK);
    rect(19, 22, 2, 15, COAT_DARK);
    rect(6, 22, 6, 4, COAT);
    rect(28, 22, 6, 4, COAT_DARK);
    rect(14, 28, 4, 4, PATCH);
    rect(14, 28, 4, 1, INK);
    // 외투 밑단은 들쭉날쭉하게
    for (const [x, h] of [[12, 3], [15, 1], [18, 2], [22, 3], [25, 1], [27, 2]]) rect(x, 37, 2, h, COAT_DARK);
    // 자루 머리
    rect(13, 9, 14, 12, SACK);
    rect(24, 9, 3, 12, SACK_DARK);
    rect(13, 20, 14, 1, SACK_DARK);
    rect(17, 21, 6, 1, INK);
    // 단추 눈과 꿰맨 입
    rect(16, 13, 2, 2, INK);
    rect(22, 13, 2, 2, INK);
    rect(16, 17, 8, 1, INK);
    for (const x of [17, 20, 23]) rect(x, 16, 1, 3, INK);
    // 밀짚모자
    rect(9, 7, 22, 2, HAT);
    rect(9, 8, 22, 1, HAT_DARK);
    rect(14, 1, 12, 6, HAT);
    rect(23, 1, 3, 6, HAT_DARK);
    rect(14, 5, 12, 1, COAT);
    scene.textures.addCanvas(TEXTURE, c);
  }
  scene.anims.create({ key: SCARECROW_ANIM, frames: [{ key: TEXTURE }], frameRate: 1, repeat: -1 });
}

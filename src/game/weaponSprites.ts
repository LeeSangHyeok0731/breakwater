import Phaser from 'phaser';

// 주인공 도트에는 칼 휘두르기 동작만 있어서, 활·총·스태프는 손에 드는 무기를 픽셀로 직접 그린다.
// 모든 그림은 오른쪽을 보는 방향이고, 손잡이 위치가 기준점이 되도록 그린다.

type Painter = (g: Phaser.GameObjects.Graphics) => void;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: Painter): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function px(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle(color).fillRect(x, y, w, h);
}

/** 활: 시위를 당긴 정도(0, 1, 2)별 3장. 크기 20×32, 손잡이 (8, 16). */
function drawBow(g: Phaser.GameObjects.Graphics, pull: number): void {
  // 어두운 배경에서도 보이도록 밝은 나무색에 굵은 활대
  const wood = 0xd09858;
  const dark = 0x7a4a22;
  const tip = 0xf6d68e;
  const pullX = 8 - pull * 3;
  // 활대: 손잡이(8,16)에서 위아래로 앞쪽으로 휘어진다.
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const x = 8 + Math.round(Math.sin(t * Math.PI * 0.55) * 6) - Math.round(t * t * 3);
    px(g, i % 4 === 0 ? dark : wood, x, 16 - i, 3, 1);
    px(g, i % 4 === 0 ? dark : wood, x, 16 + i, 3, 1);
    px(g, 0xf0c890, x + 2, 16 - i);
    px(g, 0xf0c890, x + 2, 16 + i);
  }
  px(g, tip, 9, 0, 2, 2);
  px(g, tip, 9, 30, 2, 2);
  px(g, dark, 7, 14, 3, 5);
  // 시위: 양끝에서 당긴 점까지
  const top = { x: 10, y: 1 };
  const bot = { x: 10, y: 31 };
  const mid = { x: pullX, y: 16 };
  for (const end of [top, bot]) {
    const steps = Math.abs(end.y - mid.y);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(end.x + ((mid.x - end.x) * s) / steps);
      const y = Math.round(end.y + ((mid.y - end.y) * s) / steps);
      px(g, 0xe8e0d0, x, y);
    }
  }
  // 당기는 중이면 화살을 건다.
  if (pull > 0) {
    px(g, 0xb8a080, pullX, 16, 20 - pullX, 1);
    px(g, 0xdfe6ee, 17, 15, 3, 3);
    px(g, 0xc83a2a, pullX, 15, 2, 3);
  }
}

export function createWeaponSprites(scene: Phaser.Scene): void {
  for (let pull = 0; pull <= 2; pull++) paint(scene, `w-bow-${pull}`, 20, 32, (g) => drawBow(g, pull));

  // 리볼버: 18×10, 손잡이 (4, 7)
  paint(scene, 'w-gun', 18, 10, (g) => {
    px(g, 0x5a616b, 4, 2, 13, 3);
    px(g, 0xb8c0ca, 4, 2, 13, 1);
    px(g, 0x7a828c, 7, 1, 5, 5);
    px(g, 0xd0d6de, 8, 1, 3, 1);
    px(g, 0x8a9098, 15, 1, 2, 1);
    px(g, 0xa86a34, 2, 5, 4, 5);
    px(g, 0x6a4220, 2, 9, 4, 1);
  });

  // 총구 화염: 10×10
  paint(scene, 'w-flash', 10, 10, (g) => {
    px(g, 0xfff2a0, 3, 3, 4, 4);
    px(g, 0xffd060, 0, 4, 10, 2);
    px(g, 0xffd060, 4, 0, 2, 10);
    px(g, 0xffffff, 4, 4, 2, 2);
  });

  // 스태프: 8×36, 손잡이 (4, 22)
  paint(scene, 'w-staff', 8, 36, (g) => {
    px(g, 0xb07840, 3, 8, 2, 28);
    px(g, 0xe0a868, 3, 8, 1, 28);
    px(g, 0x6a4220, 3, 14, 2, 1);
    px(g, 0x6a4220, 3, 26, 2, 1);
    px(g, 0xd8ae5a, 1, 6, 6, 2);
    px(g, 0xd8ae5a, 1, 4, 1, 2);
    px(g, 0xd8ae5a, 6, 4, 1, 2);
    // 수정
    px(g, 0x3fc8ff, 2, 0, 4, 5);
    px(g, 0xbff0ff, 3, 1, 2, 2);
  });
}

/** 각 무기 그림의 손잡이 위치 (0~1) */
export const WEAPON_ORIGIN: Record<string, [number, number]> = {
  'w-bow-0': [8 / 20, 16 / 32],
  'w-bow-1': [8 / 20, 16 / 32],
  'w-bow-2': [8 / 20, 16 / 32],
  'w-gun': [4 / 18, 7 / 10],
  'w-staff': [4 / 8, 22 / 36],
};

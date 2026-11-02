import type Phaser from 'phaser';
import type { MonsterKind } from '../data/monsters';
import { monsterLook } from './monster2d';

/** 몬스터의 서 있는 첫 프레임을 투명한 여백 없이 캔버스로 잘라 온다. */
export function monsterArt(game: Phaser.Game, kind: MonsterKind): HTMLCanvasElement | null {
  const look = monsterLook(kind);
  const anim = game.anims.get(look.idle ?? look.walk);
  const frame = anim?.frames[0]?.frame;
  if (!frame) return null;

  const full = document.createElement('canvas');
  full.width = frame.cutWidth;
  full.height = frame.cutHeight;
  const g = full.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
  if (look.tint !== undefined) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `#${look.tint.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, full.width, full.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
    g.globalCompositeOperation = 'source-over';
  }

  const { data, width, height } = g.getImageData(0, 0, full.width, full.height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1;
  c.height = y1 - y0 + 1;
  c.getContext('2d')!.drawImage(full, -x0, -y0);
  return c;
}

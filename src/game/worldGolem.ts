import Phaser from 'phaser';
import { sfx } from '../core/audio';
import { barProgress, WORLD_BOSS_BARS } from '../data/worldBoss';
import { DEPTH } from './fx';
import { PixelArt, ramp } from './legion/pixelArt';
import { pivotOf } from './legion/pixelArt';
import type { Behavior, Monster } from './monster2d';
import { FLOOR_Y } from './world';

/**
 * 월드 보스 고대 골렘. 맵 한가운데 서서 공격하지 않고 맞기만 한다.
 * 이끼 낀 바위 몸, 룬이 새겨진 가슴판, 가슴의 핵. 줄이 깨질 때마다 돌 파편이 튀고 몸에 금이 가며,
 * 깬 줄이 늘수록 핵의 색이 푸름 → 보라 → 붉음 → 금빛으로 바뀌고 점점 밝아진다.
 */

const STONE = ramp(0x8a8478);
const STONE_HI = ramp(0xa8a090);
const STONE_D = ramp(0x645e56);
const MOSS = ramp(0x5a7a3a);
const RUNE = 0x6ae8ff;
const HOLE = 0x1a161c;

/** 화면 배율 */
const SCALE = 3;

/** 깬 줄에 따른 핵의 색 */
export function coreColor(broken: number): number {
  const stops: [number, number][] = [
    [0, 0x6ae8ff],
    [33, 0x9a6aff],
    [66, 0xff5a5a],
    [90, 0xffd060],
  ];
  let c = stops[0][1];
  for (const [at, col] of stops) if (broken >= at) c = col;
  return c;
}

const KEYS = {
  torso: 'wg-torso',
  head: 'wg-head',
  arm: 'wg-arm',
  leg: 'wg-leg',
  core: 'wg-core',
  crack: ['wg-crack-0', 'wg-crack-1', 'wg-crack-2'],
};

function makeArt(scene: Phaser.Scene): void {
  // 몸통: 어깨가 넓은 바위, 가운데 룬이 새겨진 가슴판과 핵이 박히는 홈
  const t = new PixelArt(46, 34);
  t.poly(STONE, [
    [4, 6],
    [12, 1],
    [34, 1],
    [42, 6],
    [46, 16],
    [43, 30],
    [36, 34],
    [10, 34],
    [3, 30],
    [0, 16],
  ]);
  t.poly(STONE_HI, [
    [13, 7],
    [33, 7],
    [35, 23],
    [11, 23],
  ]);
  t.rect(STONE_D, 8, 26, 30, 6);
  t.ellipse(ramp(0x3a343a), 23, 15, 5.5, 5.5);
  // 어깨의 이끼
  t.poly(MOSS, [
    [3, 7],
    [12, 1],
    [17, 2],
    [9, 8],
  ]);
  t.poly(MOSS, [
    [43, 7],
    [34, 1],
    [29, 2],
    [37, 8],
  ]);
  // 가슴판 둘레의 룬
  for (const [x, y] of [
    [14, 9],
    [16, 9],
    [30, 9],
    [32, 9],
    [13, 13],
    [33, 13],
    [13, 18],
    [33, 18],
    [16, 21],
    [30, 21],
    [20, 28],
    [26, 28],
  ] as [number, number][])
    t.dot(x, y, RUNE);
  t.register(scene, KEYS.torso, [23, 34]);

  // 머리: 어깨 사이에 파묻힌 작은 바위, 빛나는 눈
  const h = new PixelArt(16, 13);
  h.poly(STONE, [
    [2, 2],
    [5, 0],
    [11, 0],
    [14, 2],
    [16, 8],
    [14, 13],
    [2, 13],
    [0, 8],
  ]);
  h.rect(STONE_D, 2, 4, 12, 2);
  h.poly(MOSS, [
    [4, 0],
    [9, 0],
    [7, 2],
  ]);
  for (const x of [4, 5, 10, 11]) h.dot(x, 7, RUNE);
  h.dot(8, 10, HOLE);
  h.register(scene, KEYS.head, [8, 13]);

  // 팔: 어깨 바위 → 굵은 팔 → 땅에 닿는 큰 주먹 (왼쪽 팔, 오른쪽은 뒤집어 쓴다)
  const a = new PixelArt(17, 41);
  a.ellipse(STONE_HI, 8.5, 6, 8, 6);
  a.poly(STONE, [
    [3, 10],
    [14, 10],
    [13, 27],
    [4, 27],
  ]);
  a.rect(STONE_D, 3, 17, 11, 2);
  a.ellipse(STONE, 8.5, 33, 8.5, 7.5);
  a.dots(HOLE, [
    [5, 36],
    [8, 37],
    [11, 36],
  ]);
  a.poly(MOSS, [
    [2, 4],
    [7, 0],
    [9, 2],
    [4, 6],
  ]);
  a.dot(8, 21, RUNE);
  a.register(scene, KEYS.arm, [8.5, 3]);

  // 다리: 굵은 기둥과 넓은 발판
  const l = new PixelArt(14, 17);
  l.rect(STONE_D, 2, 0, 10, 12);
  l.ellipse(STONE, 7, 6, 5, 4);
  l.rect(STONE, 0, 12, 14, 5);
  l.register(scene, KEYS.leg, [7, 0]);

  // 핵: 흰 구슬 (색은 tint로 입힌다)
  const c = new PixelArt(9, 9);
  c.ellipse(ramp(0xe8e8e8), 4.5, 4.5, 4.5, 4.5);
  c.dot(3, 3, 0xffffff);
  c.register(scene, KEYS.core, [4.5, 4.5]);

  // 금: 줄이 깨질수록 하나씩 더 보인다
  const cracks: [number, number][][] = [
    [
      [24, 4],
      [22, 7],
      [24, 9],
      [21, 11],
      [17, 9],
      [14, 11],
    ],
    [
      [40, 10],
      [37, 13],
      [38, 17],
      [35, 20],
      [36, 25],
      [33, 28],
    ],
    [
      [6, 14],
      [9, 17],
      [8, 21],
      [12, 24],
      [10, 28],
      [14, 31],
      [18, 29],
    ],
  ];
  cracks.forEach((pts, i) => {
    const k = new PixelArt(46, 34);
    for (let j = 0; j < pts.length - 1; j++) {
      const [x0, y0] = pts[j];
      const [x1, y1] = pts[j + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s++) k.dot(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), HOLE);
    }
    k.register(scene, KEYS.crack[i], [23, 34]);
  });
}

/** 마을 석상: 이끼 낀 회색 골렘 축소판과 받침대 (텍스처 하나) */
export function makeStatueTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  makeArt(scene);
  const W = 64;
  const H = 72;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const draw = (k: string, x: number, y: number, flip = false): void => {
    const src = scene.textures.get(k).getSourceImage() as HTMLCanvasElement;
    const [px, py] = pivotOf(k);
    g.save();
    if (flip) {
      g.translate(x, 0);
      g.scale(-1, 1);
      g.drawImage(src, -px, y - py);
    } else g.drawImage(src, x - px, y - py);
    g.restore();
  };
  // 받침대
  g.fillStyle = '#3a3640';
  g.fillRect(6, 62, 52, 10);
  g.fillStyle = '#5a5660';
  g.fillRect(8, 62, 48, 3);
  const cx = 32;
  const foot = 62;
  draw(KEYS.leg, cx - 6, foot - 16);
  draw(KEYS.leg, cx + 6, foot - 16, true);
  draw(KEYS.torso, cx, foot - 13);
  draw(KEYS.head, cx, foot - 41);
  draw(KEYS.arm, cx - 21, foot - 42);
  draw(KEYS.arm, cx + 21, foot - 42, true);
  // 돌로 굳은 석상: 색을 빼고 어둡게 한 뒤 핵만 희미하게 빛난다.
  const img = g.getImageData(0, 0, W, 62);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11) * 0.85;
    img.data[i] = v * 0.95;
    img.data[i + 1] = v * 0.95;
    img.data[i + 2] = v * 1.05;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#6ae8ff';
  g.fillRect(cx - 1, foot - 13 - 20, 2, 2);
  scene.textures.addCanvas(key, c);
}

interface GolemState {
  root: Phaser.GameObjects.Container;
  torso: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  armL: Phaser.GameObjects.Image;
  armR: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  coreGlow: Phaser.GameObjects.Image;
  cracks: Phaser.GameObjects.Image[];
  parts: Phaser.GameObjects.Image[];
  time: number;
  hits: number;
  jolt: number;
  broken: number;
  stagger: number;
}

const states = new WeakMap<Monster, GolemState>();

function img(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  const [px, py] = pivotOf(key);
  const o = scene.add.image(0, 0, key);
  return o.setOrigin(px / o.width, py / o.height);
}

/** 줄이 깨졌다: 돌 파편, 흔들림, 핵이 번쩍, 몸이 뒤로 휘청 */
function barBroken(m: Monster, st: GolemState, broken: number): void {
  const b = m.scene;
  const color = coreColor(broken);
  const top = m.body.top;
  b.fx.text(m.x, top - 10, `${broken}줄 돌파!`, broken % 10 === 0 ? 'crit' : 'info');
  b.fx.burst(m.x, m.y - 20, 0x8a8478, 14, 200, 600, 2, 700);
  b.fx.burst(m.x, m.y - 20, color, 10, 160, 420);
  b.fx.ring(m.x, m.y - 30, 60 + Math.min(60, broken), color, 320);
  b.fx.shake(broken % 10 === 0 ? 1.2 : 0.5, 140);
  if (broken % 10 === 0) {
    b.fx.flashScreen(color, 0.2, 200);
    b.fx.stop(0.06);
  }
  sfx.play('boom', broken % 10 === 0 ? 0.9 : 0.5);
  st.stagger = 1;
  st.cracks.forEach((c, i) => c.setVisible(broken >= [20, 50, 80][i]));
  st.core.setTint(color);
  st.coreGlow.setTint(color);
}

export const worldGolem: Behavior = (m, dt) => {
  const b = m.scene;
  let st = states.get(m);
  if (!st) {
    makeArt(b);
    m.sprite.setVisible(false);
    // 움직이지 않는다: 중력을 끄고 바닥에 세워 둔다.
    m.body.setAllowGravity(false);
    m.body.reset(m.x, FLOOR_Y - m.body.height / 2);
    const root = b.add.container(m.x, FLOOR_Y).setDepth(DEPTH.monster).setScale(SCALE);
    const legL = img(b, KEYS.leg).setPosition(-11, -16);
    const legR = img(b, KEYS.leg).setPosition(11, -16).setFlipX(true);
    const torso = img(b, KEYS.torso).setPosition(0, -13);
    const cracks = KEYS.crack.map((k) => img(b, k).setPosition(0, -13).setVisible(false));
    const head = img(b, KEYS.head).setPosition(0, -41);
    const armL = img(b, KEYS.arm).setPosition(-22, -40);
    const armR = img(b, KEYS.arm).setPosition(22, -40).setFlipX(true);
    const core = img(b, KEYS.core).setPosition(0, -32).setTint(coreColor(0));
    const coreGlow = img(b, KEYS.core).setPosition(0, -32).setScale(2.4).setTint(coreColor(0)).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4);
    root.add([legL, legR, torso, ...cracks, core, coreGlow, head, armL, armR]);
    st = { root, torso, head, armL, armR, core, coreGlow, cracks, parts: [legL, legR, torso, head, armL, armR], time: 0, hits: m.hitCount, jolt: 0, broken: 0, stagger: 0 };
    states.set(m, st);
    const s = st;
    // 맞으면 하얗게 번쩍이고, 쓰러지면 무너져 내린다.
    const follow = (): void => {
      const white = m.sprite.isTinted && m.sprite.tintFill;
      for (const p of s.parts) {
        if (white) p.setTintFill(0xffffff);
        else if (p.isTinted) p.clearTint();
      }
      s.root.setAlpha(m.sprite.alpha);
    };
    b.events.on('postupdate', follow);
    b.events.once('shutdown', () => {
      b.events.off('postupdate', follow);
      s.root.destroy();
    });
  }
  m.body.setVelocity(0, 0);
  st.time += dt;

  // 깬 줄 확인
  const { broken } = barProgress(m.maxHp - m.hp);
  if (broken > st.broken) {
    for (let n = st.broken + 1; n <= broken; n++) barBroken(m, st, n);
    st.broken = broken;
  }
  // 맞을 때마다 살짝 덜컹
  if (m.hitCount !== st.hits) {
    st.hits = m.hitCount;
    st.jolt = 0.08;
  }
  st.jolt = Math.max(0, st.jolt - dt);
  st.stagger = Math.max(0, st.stagger - dt * 3);

  // 숨 쉬듯 들썩이고, 팔이 조금 흔들린다. 깬 줄이 많을수록 핵이 밝다.
  const breathe = Math.sin(st.time * 1.3);
  const jx = st.jolt > 0 ? (Math.random() < 0.5 ? -1 : 1) * 1.5 : 0;
  st.root.setPosition(Math.round(m.x + jx), FLOOR_Y);
  st.root.setRotation(-st.stagger * 0.04);
  st.torso.y = -13 + breathe * 0.5;
  for (const c of st.cracks) c.y = st.torso.y;
  st.head.y = -41 + breathe * 0.8;
  st.armL.y = -40 + breathe * 0.5;
  st.armR.y = -40 + breathe * 0.5;
  st.armL.rotation = 0.03 * Math.sin(st.time * 0.9) + st.stagger * 0.08;
  st.armR.rotation = -0.03 * Math.sin(st.time * 0.9) - st.stagger * 0.08;
  st.core.y = st.coreGlow.y = -32 + breathe * 0.5;
  const power = st.broken / WORLD_BOSS_BARS;
  st.coreGlow.setAlpha(0.3 + power * 0.5 + Math.sin(st.time * 4) * 0.1).setScale(2.2 + power * 1.6);
};

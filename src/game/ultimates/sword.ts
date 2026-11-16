// 검사의 상급·궁극 스킬

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { skyShotMana, skyShotStr } from '../../data/skills';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import { FLOOR_Y } from '../world';
import { afterglow, flare, flutter, glow, hues, impactBurst, PAL, rays, shockwave, wash, wisps } from '../vfx';
import { view, onScreen, later, type Cast } from './shared';

/** 천공 일섬: 화면 끝에서 끝까지 가로로 베어 가른다. */
export const heavenCleave: Cast = (b) => {
  const p = b.player;
  p.startAction('slash', 0.55, []);
  b.fx.dim(0x000000, 0.45, 900);
  b.fx.embers(p.x + p.facing * 10, p.y - 6, 0xbfe4ff, 14, 10, 30, 400);
  later(b, 200, () => {
    const v = view(b);
    const y = p.y - 2;
    sfx.play('slash', 0.6);
    b.fx.bigSlash(p.facing === 1 ? v.x : v.right, y, p.facing === 1 ? v.right : v.x, y, 0x9fd8ff, 12, 420);
    b.fx.bigSlash(v.x, y - 18, v.right, y - 14, 0x9fd8ff, 3, 300);
    b.fx.bigSlash(v.x, y + 16, v.right, y + 20, 0x9fd8ff, 3, 300);
    b.fx.flashScreen(0xdff4ff, 0.35, 220);
    b.fx.shake(1.4, 220);
    // 가른 자리를 따라 하늘색 빛살이 터진다.
    b.fx.bigSlash(v.x, y, v.right, y, 0x2a7aff, 30, 520);
    // 갈라진 하늘: 위로는 보라, 아래로는 청록 빛이 번지고, 벤 자리를 따라 별빛과 결이 흩어진다.
    b.fx.bigSlash(v.x, y - 30, v.right, y - 26, 0x8a5aff, 5, 380);
    b.fx.bigSlash(v.x, y + 28, v.right, y + 32, 0x7fffd8, 5, 380);
    wash(b, 0x5a3aff, 0x1ac8d8, 0.2, 480);
    for (let i = 0; i < 6; i++) {
      const x = v.x + (v.width * (i + 0.5)) / 6;
      later(b, i * 40, () => {
        rays(b, x, y, 6, 90, i % 2 ? PAL.aurora : PAL.sky, 360);
        wisps(b, x, y, i % 2 ? PAL.aurora : PAL.sky, 3, 90, 460, { curl: 2.6, width: 6 });
        glow(b, x, y, 90, i % 2 ? 0x5a3aff : 0x1ac8d8, 520, 0.5, 0.5);
      });
    }
    flutter(b, v.centerX, y, 'star', hues(PAL.sky), 30, { spread: v.width / 2, spreadY: 14, speed: 70, life: 1200, within: 260 });
    for (const m of onScreen(b)) {
      if (Math.abs(m.y - y) > 56) continue;
      b.hitMonster(m, b.skillBase({ str: 8 }), { knock: 160 });
      b.fx.spark(m.x, y, 0xdff4ff, 2);
      impactBurst(b, m.x, y, 40, PAL.sky);
    }
  });
};

/** 십자 심판: 화면 전체에 X자 참격 두 번 */
export const crossJudgment: Cast = (b) => {
  const p = b.player;
  p.startAction('upper', 0.6, []);
  b.fx.dim(0x000010, 0.5, 1100);
  const strike = (k: number): void => {
    const v = view(b);
    const top = v.y + 24;
    const bottom = FLOOR_Y - 4;
    if (k === 0) b.fx.bigSlash(v.x + 20, top, v.right - 20, bottom, 0xffe08a, 14, 500);
    else b.fx.bigSlash(v.right - 20, top, v.x + 20, bottom, 0xffe08a, 14, 500);
    sfx.play('slash', 0.5);
    b.fx.shake(1.2, 180);
    // 첫 획은 주황, 둘째 획은 다홍: 두 색이 엇갈려 십자를 이룬다.
    if (k === 0) b.fx.bigSlash(v.x + 20, top, v.right - 20, bottom, 0xff8a1a, 34, 560);
    else b.fx.bigSlash(v.right - 20, top, v.x + 20, bottom, 0xff3a6a, 34, 560);
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.5) / 5;
      const x = k === 0 ? v.x + 20 + (v.width - 40) * u : v.right - 20 - (v.width - 40) * u;
      const y = top + (bottom - top) * u;
      later(b, i * 30, () => {
        wisps(b, x, y, k ? PAL.rose : PAL.sun, 2, 80, 420, { curl: 2.6, width: 6 });
        flutter(b, x, y, 'star', k ? [0xff8ad0, 0xffe0f0, 0xffc08a] : [0xffd040, 0xfffbe0, 0xff9ad0], 4, { spread: 16, speed: 90, life: 800 });
      });
    }
    for (const m of onScreen(b)) {
      b.hitMonster(m, b.skillBase({ str: 5 }), { stun: 2, knock: 40 });
      flare(b, m.x, m.y, 30, PAL.gold, 260);
      b.fx.spark(m.x, m.y, 0xffe08a, 2, k ? Math.PI / 4 : -Math.PI / 4);
    }
  };
  later(b, 220, () => strike(0));
  later(b, 460, () => {
    strike(1);
    const v = view(b);
    b.fx.flashScreen(0xfff0c0, 0.4, 300);
    b.fx.boom(v.centerX, (v.y + FLOOR_Y) / 2, 30, 'gold');
    // X의 교차점에서 거대한 금빛 폭발
    const cy = (v.y + FLOOR_Y) / 2;
    impactBurst(b, v.centerX, cy, 120, PAL.gold);
    rays(b, v.centerX, cy, 20, 320, PAL.gold, 560);
    rays(b, v.centerX, cy, 12, 220, PAL.rose, 480);
    shockwave(b, v.centerX, cy, 260, PAL.sun, 620, 1, 10);
    wisps(b, v.centerX, cy, PAL.sun, 10, 200, 700, { curl: 2.8, width: 9 });
    flutter(b, v.centerX, cy, 'flame', hues(PAL.sun), 30, { spread: 30, speed: 260, cone: Math.PI, gravity: 60, life: 1100 });
    wash(b, 0xff2a6a, 0xffd040, 0.22, 520);
    afterglow(b, v.centerX, FLOOR_Y, v.width * 0.7, PAL.sun, 'flame', 1300);
  });
};

/** 천공 섬광 [초안]: 소환까지 걸리는 시간, 모든 검이 한 번씩 쏘는 최대 시간(ms) */
const SKY_SUMMON_MS = 700;
const SKY_ROUND_MS = 640;
/** 공중에 머무는 몸 높이 (땅 기준 px) */
const SKY_HOVER = 110;

/** 천공 섬광: 날아올라 마나검을 펼치고, 마나가 바닥날 때까지 검들이 번갈아 탄검강을 쏜다. */
export const skyFlash: Cast = (b) => {
  const p = b.player;
  const count = b.takeSkyBlades();
  // 시전 순간의 마나로 발사 수를 정한다. 시전 중에는 마나가 차지 않는다.
  const cost = skyShotMana(p.derived.maxMp);
  const damage = b.skillBase({ str: skyShotStr(p.derived.maxMp) });
  const shots = Math.floor(p.mp / cost);
  const gapMs = Math.min(SKY_ROUND_MS, count * 60) / count;
  const lastShot = SKY_SUMMON_MS + shots * gapMs;
  const hoverY = Math.min(p.y, FLOOR_Y - SKY_HOVER);
  p.startHover(hoverY, (lastShot + 300) / 1000);
  b.fx.dim(0x000818, 0.5, lastShot + 300);
  b.fx.flashScreen(0x9fd8ff, 0.25, 200);
  shockwave(b, p.x, p.feet, 170, PAL.sky, 500, 1, 6);
  sfx.play('magic', 1.2);

  const swords: SkySword[] = [];
  for (let i = 0; i < count; i++) {
    // 몸 위쪽 부채꼴에 세 줄로 펼친다.
    const row = i % 3;
    const ang = -Math.PI * (0.08 + (0.84 * (i + 0.5)) / count);
    const x = p.x + Math.cos(ang) * (46 + row * 20);
    const y = hoverY - 4 + Math.sin(ang) * (40 + row * 18);
    const appear = 120 + (i * 480) / count;
    later(b, appear, () => swords.push(skySword(b, x, y, lastShot + 400 - appear, i)));
  }
  for (let n = 0; n < shots; n++) {
    later(b, SKY_SUMMON_MS + n * gapMs, () => {
      p.mp = Math.max(0, p.mp - cost);
      skyShot(b, swords[n % swords.length], damage, n === shots - 1);
    });
  }
  later(b, lastShot + 120, () => {
    for (const s of swords) s.vanish();
    b.fx.flashScreen(0xdff4ff, 0.3, 260);
    b.fx.shake(1.4, 240);
    const v = view(b);
    shockwave(b, v.centerX, v.centerY, v.width * 0.7, PAL.sky, 600);
    shockwave(b, v.centerX, v.centerY, v.width * 0.45, PAL.aurora, 520, 0.32, 6);
    wash(b, 0x5a3aff, 0x1ac8d8, 0.2, 460);
    wisps(b, p.x, p.y, PAL.sky, 10, 160, 640, { curl: 3, width: 8 });
    flutter(b, p.x, p.y, 'star', SKY_HUES, 30, { spread: 60, spreadY: 40, speed: 200, gravity: 60, life: 1200 });
  });
};

/** 마나검이 돌려 쓰는 빛깔: 하늘 · 보라 · 민트 · 장미 */
const SKY_HUES = [0x9fd8ff, 0xb89aff, 0x7fffd8, 0xff9ad8];
const SKY_GLOWS = [0x4f9dff, 0x7a3aff, 0x1ac8a0, 0xe03a9a];
const SKY_PALS = [PAL.sky, PAL.violet, PAL.aurora, PAL.rose];

interface SkySword {
  /** 빛깔 번호 */
  hue: number;
  sword: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vanish(): void;
}

/** 마나검 한 자루: 나타나 검강을 두르고, 시전이 끝나면 사라진다. */
function skySword(b: BattleScene, x: number, y: number, lifeMs: number, index = 0): SkySword {
  const hue = index % SKY_HUES.length;
  const sword = b.add.image(x, y - 14, 'fx-sword').setDepth(DEPTH.projectile).setTint(SKY_HUES[hue]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  // 검강: 칼날을 감싸는 더 큰 빛
  const glow = b.add.image(x, y, 'fx-sword').setDepth(DEPTH.projectile - 1).setTint(SKY_GLOWS[hue]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(1.5);
  const parts = [sword, glow];
  b.tweens.add({ targets: sword, y, alpha: 1, duration: 200, ease: 'Quad.Out' });
  later(b, 300, () => {
    b.tweens.add({ targets: glow, alpha: 0.75, duration: 160 });
    b.fx.spark(x, y, SKY_HUES[hue], 1);
    flutter(b, x, y, 'star', [SKY_HUES[hue], 0xffffff], 2, { spread: 6, speed: 40, life: 500 });
  });
  const cleanup = (): void => {
    for (const part of parts) if (part.active) part.destroy();
  };
  // later는 쓰러지면 건너뛰므로, 검이 남지 않게 따로 지운다.
  b.time.delayedCall(lifeMs, cleanup);
  return {
    hue,
    sword,
    glow,
    x,
    y,
    vanish: () => {
      if (!sword.active) return;
      b.fx.burst(x, y, SKY_HUES[hue], 6, 70, 260);
      b.tweens.add({ targets: parts, alpha: 0, duration: 140, onComplete: cleanup });
    },
  };
}

/** 탄검강 한 발: 몬스터를 조준해 칼끝에서 쏜다. 몬스터가 없으면 앞쪽 땅을 때린다. */
function skyShot(b: BattleScene, { sword, glow, x, y, hue }: SkySword, damage: number, last: boolean): void {
  const targets = onScreen(b);
  const m = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
  const v = view(b);
  const tx = m ? m.x : v.x + 30 + Math.random() * (v.width - 60);
  const ty = m ? m.y : FLOOR_Y - 4;
  const ang = Math.atan2(ty - y, tx - x);
  // 그림의 칼끝은 아래를 향한다.
  sword.setRotation(ang - Math.PI / 2);
  glow.setRotation(ang - Math.PI / 2);
  b.tweens.add({ targets: [sword, glow], x: x - Math.cos(ang) * 6, y: y - Math.sin(ang) * 6, duration: 50, yoyo: true });
  const far = Math.hypot(tx - x, ty - y) + 90;
  b.fx.tracer(x, y, x + Math.cos(ang) * far, y + Math.sin(ang) * far, last ? 0xdff4ff : SKY_HUES[hue], 3, 130);
  flare(b, tx, ty, 16, SKY_PALS[hue], 140);
  b.fx.spark(tx, ty, SKY_HUES[hue], 1);
  if (Math.random() < 0.35) flutter(b, tx, ty, 'star', [SKY_HUES[hue], 0xffffff], 2, { spread: 8, speed: 80, life: 500 });
  b.hitscan(x, y, ang, far, damage, { pierce: true, color: 0x9fd8ff, width: 0, quiet: true });
  sfx.play('magic', 0.45);
}

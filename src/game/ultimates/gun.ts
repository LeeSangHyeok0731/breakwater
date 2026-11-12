// 총잡이의 상급·궁극 스킬

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import type { Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { afterglow, column, flare, flutter, hues, impactBurst, PAL, rays, shockwave, wash, wisps } from '../vfx';
import { CHAIN_RANGE, view, onScreen, later, drop, ultText, type Cast } from './shared';

const RICO_HUES = [0xffd060, 0xff7ac0, 0x7fe0ff, 0xc8ff7a];
const RICO_PALS = [PAL.gold, PAL.rose, PAL.arcane, PAL.jade];

/** 도탄 난사: 탄환 4발이 적에서 적으로 튕기며 최대 8마리씩 맞힌다. */
export const ricochet: Cast = (b) => {
  const p = b.player;
  p.startAction('rapid', 0.5, []);
  for (let shot = 0; shot < 4; shot++) {
    later(b, shot * 90, () => {
      const m0 = p.muzzle();
      b.fx.muzzle(m0.x, m0.y, p.facing, 1);
      b.fx.casing(p.x + p.facing * 8, p.y - 8, p.facing, p.feet);
      sfx.play('shot', 0.9);
      const visited = new Set<Monster>();
      let from = { x: m0.x, y: m0.y };
      for (let hop = 0; hop < 8; hop++) {
        const pool = onScreen(b).filter((m) => !visited.has(m));
        const next = pool
          .filter((m) => hop > 0 || (m.x - p.x) * p.facing > -10)
          .sort((a, c) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(c.x - from.x, c.y - from.y))[0];
        if (!next || (hop > 0 && Math.hypot(next.x - from.x, next.y - from.y) > CHAIN_RANGE)) break;
        visited.add(next);
        const a = from;
        const to = { x: next.x, y: next.y };
        later(b, hop * 45, () => {
          // 네 발의 탄환은 금·분홍·하늘·연두, 저마다 다른 빛줄기로 튄다.
          b.fx.tracer(a.x, a.y, to.x, to.y, RICO_HUES[shot], 2, 120);
          b.fx.bigSlash(a.x, a.y, to.x, to.y, RICO_HUES[shot], 4, 200);
          b.fx.spark(to.x, to.y, RICO_HUES[shot]);
          b.fx.pop(to.x, to.y, RICO_HUES[(shot + 1) % 4], 1.1);
          flare(b, to.x, to.y, 18, RICO_PALS[shot], 180);
          if (hop % 2 === 0) flutter(b, to.x, to.y, 'star', [RICO_HUES[shot], 0xffffff], 3, { spread: 6, speed: 110, gravity: 120, life: 600 });
          if (next.alive) b.hitMonster(next, b.weaponBase() * 1.5, { knock: 30, quiet: hop > 0 });
        });
        from = to;
      }
    });
  }
};

/** 포격 요청: 신호탄을 쏘아 올리면 화면 안 모든 적 위로 포탄이 떨어진다. */
export const airstrike: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 0.4);
  const m0 = p.muzzle();
  const v0 = view(b);
  sfx.play('shot', 1.2);
  drop(b, 'fx-px', m0.x, m0.y, m0.x + p.facing * 20, v0.y + 20, 420, () => {
    b.fx.boom(m0.x + p.facing * 20, v0.y + 20, 14, 'fire');
    b.fx.flashScreen(0xff3a2a, 0.15, 200);
  }, 0xff3a2a, 0xff5a2a);
  const v = view(b);
  const marks = onScreen(b).map((m) => m.x);
  if (marks.length === 0) for (let i = 0; i < 4; i++) marks.push(v.x + 60 + (i * (v.width - 120)) / 3);
  marks.forEach((x, i) => {
    later(b, 500 + i * 110, () => {
      b.fx.circle(x, FLOOR_Y - 1, 0xff3a2a, 70, 600, false, DEPTH.fx - 2);
      drop(b, 'fx-shell', x + 40, v.y - 20, x, FLOOR_Y - 10, 380, () => {
        sfx.play('boom', 0.8);
        b.fx.boom(x, FLOOR_Y - 22, 40, 'fire');
        b.fx.ring(x, FLOOR_Y, 70, 0xffa040);
        b.fx.burst(x, FLOOR_Y - 10, 0x8a6a50, 8, 160, 500, 1.4, 600);
        impactBurst(b, x, FLOOR_Y - 30, 90, i % 2 ? PAL.sun : PAL.flame, FLOOR_Y);
        column(b, x, FLOOR_Y, 36, 280, PAL.flame, 520);
        // 포탄마다 자홍빛 화염이 말려 오르고 불티가 쏟아진 뒤 잔불이 남는다.
        shockwave(b, x, FLOOR_Y, 110, PAL.crimson, 480, 0.3, 5);
        wisps(b, x, FLOOR_Y - 10, PAL.flame, 6, 120, 560, { angle: -Math.PI / 2, cone: 1.3, curl: 2.6, width: 8 });
        flutter(b, x, FLOOR_Y - 20, 'flame', hues(PAL.flame), 12, { spread: 20, spreadY: 10, speed: 220, cone: 1.0, gravity: 160, life: 900 });
        afterglow(b, x, FLOOR_Y, 140, PAL.flame, 'flame', 1000);
        if (i === 0) wash(b, 0xd0186a, 0xff7a1a, 0.16, 420);
        b.fx.shake(0.9, 140);
        b.hitArea(x - 50, FLOOR_Y - 120, 100, 120, b.weaponBase() * 5, { knock: 120, stun: 0.6 });
      });
    });
  });
};

/**
 * 황금 탄환 [초안]: 세상이 느려지고 황금 탄환 8발을 쏜다. 발마다 적 하나에 조준 원이 줄어들고,
 * 원이 가운데 고리에 닿을 때 공격키를 누르면 PERFECT (기본 사격 3500% + 가까운 적 둘에게 절반 도탄),
 * 조금 이르면 GOOD (2000%), 너무 이르거나 놓치면 1000%.
 * GOOD이면 서브 총이 하나, PERFECT면 둘 생겨 플레이어 위에 떠 있다가, 이후 발마다 같은 적을 함께 쏘고 (기본 사격의 800%),
 * 마지막에 화면 안 적들에게 일제 사격한다.
 */
const GOLD_SHOTS = 8;
/** 판정별 기본 사격 배수 [초안] */
const GOLD_MUL = { perfect: 35, good: 20, miss: 10 } as const;
const SUB_MUL = 8;

/** 서브 총 그림 (황금빛 작은 권총) */
function subGunTexture(b: BattleScene): string {
  const key = 'sub-gun';
  if (b.textures.exists(key)) return key;
  const g = b.make.graphics({}, false);
  g.fillStyle(0x6a4a10).fillRect(0, 1, 16, 5);
  g.fillStyle(0xffd060).fillRect(1, 1, 14, 3);
  g.fillStyle(0xfff0b0).fillRect(2, 1, 10, 1);
  g.fillStyle(0x8a5a18).fillRect(2, 4, 4, 5);
  g.fillStyle(0xffd060).fillRect(3, 4, 2, 4);
  g.generateTexture(key, 16, 9);
  g.destroy();
  return key;
}
const RING_TIME = 0.9;
const RING_MAX = 60;
const RING_MIN = 6;
const PERFECT_R: [number, number] = [8, 20];
const GOOD_R = 34;

export const deadEye: Cast = (b) => {
  const p = b.player;
  p.startAction('snipe', 99, []);
  const cam = b.cameras.main;
  const veil = b.add.rectangle(0, 0, cam.width + 400, cam.height, 0x000000, 0.55).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.monster - 2);
  const ring = b.add.graphics().setDepth(DEPTH.text - 1);
  const cross = b.add.image(0, 0, 'fx-crosshair').setDepth(DEPTH.text - 1).setScale(1.2);
  const counter = ultText(b, 16, '#ffe08a').setScrollFactor(0);
  b.announce('황금 탄환! 원이 가운데 고리에 닿을 때 공격키!', 1.6);
  sfx.play('reload');
  // 세상이 느려진다: 몬스터가 거의 움직이지 못한다.
  for (const m of b.monsters) {
    m.slowTime = 9;
    m.slowMul = 0.2;
  }
  let shot = 0;
  let t = -0.3;
  let target: Monster | null = null;
  const subs: Phaser.GameObjects.Image[] = [];
  const subKey = subGunTexture(b);
  /** 서브 총 자리: 플레이어 등 뒤 위쪽 부채꼴 */
  const subPos = (i: number, n: number): { x: number; y: number } => {
    const a = Math.PI * (1.15 + (0.7 * (i + 0.5)) / Math.max(1, n));
    const r = 34 + (i % 3) * 10;
    return { x: p.x - p.facing * 6 + Math.cos(a) * r * 1.3, y: p.y - 18 + Math.sin(a) * r };
  };
  const subFire = (s: Phaser.GameObjects.Image, tx: number, ty: number, m: Monster | null, delay: number): void => {
    later(b, delay, () => {
      if (!s.active) return;
      const hue = [0xffe08a, 0xffa0c8, 0x7fffd0][subs.indexOf(s) % 3];
      b.fx.tracer(s.x, s.y, tx, ty, hue, 2, 160);
      b.fx.spark(s.x, s.y, hue, 0.8);
      b.fx.pop(tx, ty, hue, 0.9);
      b.tweens.add({ targets: s, scale: 1.25, duration: 50, yoyo: true });
      if (m?.alive) b.hitMonster(m, b.weaponBase() * SUB_MUL, { knock: 20, quiet: true });
    });
  };
  const addSubs = (n: number): void => {
    for (let i = 0; i < n; i++) {
      const s = b.add.image(p.x, p.y, subKey).setDepth(DEPTH.projectile).setScale(0.2).setAlpha(0);
      b.tweens.add({ targets: s, scale: 1, alpha: 1, duration: 240, ease: 'Back.Out' });
      b.fx.burst(p.x, p.y - 10, 0xffe08a, 6, 80, 260);
      flutter(b, p.x, p.y - 10, 'star', [0xffe08a, 0xffa0c8, 0x7fffd0], 5, { spread: 10, speed: 90, life: 700 });
      subs.push(s);
    }
    if (n > 0) b.fx.text(p.x, p.body.top - 22, `서브 총 +${n}`, 'heal');
  };
  const pick = (): Monster | null => {
    const list = onScreen(b).sort((a, c) => Math.abs(a.x - p.x) - Math.abs(c.x - p.x));
    return list.length ? list[shot % list.length] : null;
  };
  const fire = (grade: 'perfect' | 'good' | 'miss'): void => {
    const m0 = p.muzzle();
    const tx = target?.x ?? p.x + p.facing * 200;
    const ty = target?.y ?? FLOOR_Y - 20;
    p.facing = tx >= p.x ? 1 : -1;
    b.fx.muzzle(m0.x, m0.y, p.facing, 2);
    b.fx.tracer(m0.x, m0.y, tx, ty, 0xfff0a0, grade === 'perfect' ? 5 : 3, 220);
    if (grade === 'perfect') b.fx.bigSlash(m0.x, m0.y, tx, ty, 0xffc040, 8, 300);
    sfx.play('shot', grade === 'perfect' ? 1.5 : 1.1);
    const mul = GOLD_MUL[grade];
    b.fx.text(tx, ty - 30, grade === 'perfect' ? 'PERFECT!' : grade === 'good' ? 'GOOD' : '빗나감', grade === 'perfect' ? 'crit' : 'info');
    if (target?.alive) {
      impactBurst(b, tx, ty, grade === 'perfect' ? 60 : 36, grade === 'miss' ? PAL.gold : PAL.sun);
      if (grade !== 'miss') {
        // 명중: 금빛 사이로 분홍·민트 별이 터지고, PERFECT면 빛의 결이 크게 말려 나간다.
        flutter(b, tx, ty, 'star', [0xffe08a, 0xffa0c8, 0x7fffd0, 0xffffff], grade === 'perfect' ? 20 : 8, { spread: 10, speed: grade === 'perfect' ? 260 : 150, gravity: 160, life: 900 });
        if (grade === 'perfect') {
          wisps(b, tx, ty, PAL.sun, 8, 120, 560, { curl: 2.8, width: 7 });
          rays(b, tx, ty, 10, 150, PAL.rose, 420);
          wash(b, 0xff3a5a, 0xffd040, 0.16, 360);
        }
      }
      b.hitMonster(target, b.weaponBase() * mul, { knock: grade === 'perfect' ? 160 : 60 });
    }
    // 이미 떠 있는 서브 총들이 같은 적을 함께 쏘고, 판정에 따라 새 서브 총이 생긴다.
    subs.forEach((s, i) => subFire(s, tx, ty, target, 40 + i * 25));
    addSubs(grade === 'perfect' ? 2 : grade === 'good' ? 1 : 0);
    if (grade === 'perfect') {
      b.fx.flashScreen(0xfff0c0, 0.25, 160);
      b.fx.shake(1, 160);
      // 도탄: 가까운 적 둘에게 튕겨 간다.
      const others = onScreen(b)
        .filter((o) => o !== target)
        .sort((a, c) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(c.x - tx, c.y - ty))
        .slice(0, 2);
      others.forEach((o, i) =>
        later(b, 60 + i * 60, () => {
          b.fx.tracer(tx, ty, o.x, o.y, 0xffe08a, 2, 180);
          b.fx.spark(o.x, o.y, 0xffffff, 1.5);
          if (o.alive) b.hitMonster(o, b.weaponBase() * mul * 0.5, { knock: 60 });
        }),
      );
    }
  };
  const cleanup = (): void => {
    ring.destroy();
    cross.destroy();
    counter.destroy();
    for (const s of subs) b.tweens.add({ targets: s, alpha: 0, y: s.y - 20, duration: 300, onComplete: () => s.destroy() });
    b.tweens.add({ targets: veil, alpha: 0, duration: 300, onComplete: () => veil.destroy() });
    for (const m of b.monsters) {
      m.slowTime = 0;
      m.slowMul = 1;
    }
    p.action = null;
  };
  b.ult = {
    lock: true,
    still: true,
    tick: (dt) => {
      if (p.dead) {
        cleanup();
        return true;
      }
      p.invuln = Math.max(p.invuln, 0.2);
      subs.forEach((s, i) => {
        const at = subPos(i, subs.length);
        s.setPosition(s.x + (at.x - s.x) * Math.min(1, dt * 10), s.y + (at.y - s.y) * Math.min(1, dt * 10));
        const aimX = target?.x ?? p.x + p.facing * 200;
        const aimY = target?.y ?? FLOOR_Y - 20;
        s.setRotation(Math.atan2(aimY - s.y, aimX - s.x)).setFlipY(aimX < s.x);
      });
      if (shot >= GOLD_SHOTS) {
        // 마지막: 서브 총들이 화면 안 적들에게 일제 사격한다.
        if (t === -0.15 && subs.length) {
          const foes = onScreen(b);
          subs.forEach((s, i) => {
            const m = foes.length ? foes[i % foes.length] : null;
            subFire(s, m?.x ?? p.x + p.facing * 200, m?.y ?? FLOOR_Y - 20, m, 80 + i * 30);
          });
          if (foes.length) counter.setText(`일제 사격 ×${subs.length}`);
        }
        t += dt;
        if (t < 0.3 + subs.length * 0.03) return false;
        cleanup();
        return true;
      }
      t += dt;
      if (t < 0) {
        ring.clear();
        cross.setVisible(false);
        return false;
      }
      if (!target || !target.alive) target = pick();
      const x = target?.x ?? p.x + p.facing * 200;
      const y = target?.y ?? FLOOR_Y - 20;
      const r = RING_MIN + (RING_MAX - RING_MIN) * Math.max(0, 1 - t / RING_TIME);
      ring.clear();
      // 가운데 고리(PERFECT 구간)와 줄어드는 원
      ring.lineStyle(2, 0xffe08a, 0.5).strokeCircle(x, y, (PERFECT_R[0] + PERFECT_R[1]) / 2);
      ring.lineStyle(2, r <= PERFECT_R[1] ? 0xffffff : 0xffc040, 1).strokeCircle(x, y, r);
      cross.setVisible(true).setPosition(x, y);
      counter.setPosition(cam.width / 2, 74).setText(`황금 탄환 ${GOLD_SHOTS - shot}발`);
      const pressed = b.keys.pressed('attack');
      if (!pressed && t < RING_TIME) return false;
      const grade = pressed && r >= PERFECT_R[0] && r <= PERFECT_R[1] ? 'perfect' : pressed && r <= GOOD_R ? 'good' : 'miss';
      fire(grade);
      shot++;
      target = null;
      t = -0.15;
      return false;
    },
  };
};

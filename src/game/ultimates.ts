import Phaser from 'phaser';
import { sfx } from '../core/audio';
import type { BattleScene } from './battleScene';
import { DEPTH } from './fx';
import type { Monster } from './monster2d';
import { FLOOR_Y } from './world';
import { aura, column, crescent, flare, impactBurst, PAL, rays, shards, shockwave, tint, type Palette3 } from './vfx';

// 상급·궁극 스킬: 화면 전체를 휩쓰는 광역기. 무기마다 3개씩 (상급 2, 궁극 1).
// "화면 안"은 지금 카메라에 보이는 범위다. 연출은 시간차(delayedCall)로 이어 붙인다.

type Cast = (b: BattleScene) => void;

/** 도탄·연쇄 번개가 다음 적으로 튕겨 가는 최대 거리 (px) */
const CHAIN_RANGE = 380;

/** 카메라에 보이는 범위 */
function view(b: BattleScene): Phaser.Geom.Rectangle {
  return b.cameras.main.worldView;
}

/** 화면 안의 살아 있는 적 */
function onScreen(b: BattleScene, pad = 12): Monster[] {
  const v = view(b);
  return b.monsters.filter((m) => m.alive && m.x > v.x - pad && m.x < v.right + pad);
}

/** ms 뒤에 실행한다 (전투가 끝났거나 쓰러졌으면 건너뛴다). */
function later(b: BattleScene, ms: number, fn: () => void): void {
  b.time.delayedCall(ms, () => {
    if (!b.player.dead) fn();
  });
}

/** 하늘에 마법진 셋을 나란히 연다 (하나를 화면만큼 키우면 도트가 뭉개진다). */
function skyCircles(b: BattleScene, color: number, ms: number): Phaser.GameObjects.Sprite[] {
  const v = view(b);
  return [0.18, 0.5, 0.82].map((k, i) => b.fx.circle(v.x + v.width * k, v.y + 28 + (i === 1 ? -6 : 0), color, i === 1 ? 210 : 170, ms, false, DEPTH.fx));
}

/** 위에서 아래로 떨어지는 그림 (영검·화살·포탄·운석) */
function drop(b: BattleScene, key: string, x0: number, y0: number, x1: number, y1: number, ms: number, onLand: () => void, tint?: number, trail?: number): void {
  // 화살 그림은 오른쪽을, 나머지(영검·포탄)는 아래를 향해 그려져 있다.
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const s = b.add.image(x0, y0, key).setDepth(DEPTH.projectile).setRotation(key === 'fx-arrow' ? ang : ang - Math.PI / 2);
  if (tint !== undefined) s.setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
  const tail = trail !== undefined ? b.fx.streak(x0, y0, Math.atan2(y1 - y0, x1 - x0), 34, trail, 0, 1) : null;
  b.tweens.add({
    targets: tail ? [s, tail] : s,
    x: x1,
    y: y1,
    duration: ms,
    ease: 'Quad.In',
    onComplete: () => {
      s.destroy();
      tail?.destroy();
      onLand();
    },
  });
}

// ───────────────────────── 검사 ─────────────────────────

/** 천공 일섬: 화면 끝에서 끝까지 가로로 베어 가른다. */
const heavenCleave: Cast = (b) => {
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
    tint(b, 0x2a7aff, 0.22, 420);
    for (let i = 0; i < 6; i++) later(b, i * 40, () => rays(b, v.x + (v.width * (i + 0.5)) / 6, y, 6, 90, PAL.sky, 360));
    for (const m of onScreen(b)) {
      if (Math.abs(m.y - y) > 56) continue;
      b.hitMonster(m, b.skillBase({ str: 8 }), { knock: 160 });
      b.fx.spark(m.x, y, 0xdff4ff, 2);
      impactBurst(b, m.x, y, 40, PAL.sky);
    }
  });
};

/** 십자 심판: 화면 전체에 X자 참격 두 번 */
const crossJudgment: Cast = (b) => {
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
    if (k === 0) b.fx.bigSlash(v.x + 20, top, v.right - 20, bottom, 0xff8a1a, 34, 560);
    else b.fx.bigSlash(v.right - 20, top, v.x + 20, bottom, 0xff8a1a, 34, 560);
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
    tint(b, 0xff9a1a, 0.25, 460);
  });
};

/** 만검귀종: 하늘이 갈라지며 영검 30자루가 쏟아진다. */
const thousandBlades: Cast = (b) => {
  const p = b.player;
  p.startAction('upper', 0.7, []);
  b.fx.dim(0x000818, 0.55, 2400);
  b.fx.flashScreen(0x9fd8ff, 0.3, 200);
  const v0 = view(b);
  b.fx.lightning(v0.x, v0.y + 14, v0.right, v0.y + 20, 0x9fd8ff, 2, 600);
  skyCircles(b, 0x9fd8ff, 2200);
  for (let i = 0; i < 30; i++) {
    later(b, 250 + i * 55, () => {
      const v = view(b);
      const targets = onScreen(b);
      // 절반은 적을 노리고, 나머지는 화면 곳곳에 꽂힌다.
      const m = targets.length && i % 2 === 0 ? targets[(i / 2) % targets.length | 0] : null;
      const x = m ? m.x + (Math.random() - 0.5) * 10 : v.x + 20 + Math.random() * (v.width - 40);
      const y = m ? Math.min(FLOOR_Y - 4, m.body.bottom - 4) : FLOOR_Y - 4;
      drop(b, 'fx-sword', x + 30, v.y - 30, x, y, 200, () => {
        b.fx.spark(x, y, 0x9fd8ff, 2);
        b.fx.ring(x, Math.min(y + 6, FLOOR_Y), 26, 0x9fd8ff, 220);
        b.fx.burst(x, y, 0xdff4ff, 5, 80, 260);
        column(b, x, Math.min(y + 6, FLOOR_Y), 8, 160, i % 3 === 0 ? PAL.violet : PAL.sky, 320);
        flare(b, x, y, 20, PAL.sky, 200);
        b.hitArea(x - 26, y - 40, 52, 56, b.skillBase({ str: 3 }), { knock: 30, quiet: i % 3 !== 0 });
        if (i % 4 === 0) sfx.play('hit', 0.5);
      }, 0x9fd8ff, 0x9fd8ff);
    });
  }
  later(b, 250 + 30 * 55 + 250, () => {
    b.fx.flashScreen(0xdff4ff, 0.35, 300);
    b.fx.shake(1.6, 260);
    const v = view(b);
    shockwave(b, v.centerX, FLOOR_Y, v.width * 0.7, PAL.sky, 700);
    tint(b, 0x2a7aff, 0.25, 500);
  });
};

// ───────────────────────── 도객 ─────────────────────────

/** 월하 폭풍참: 거대한 초승달 참격 6개를 앞뒤로 번갈아 날린다. */
const moonStorm: Cast = (b) => {
  const p = b.player;
  p.startAction('crescent', 0.95, []);
  for (let i = 0; i < 6; i++) {
    later(b, 80 + i * 130, () => {
      const dir = (i % 2 === 0 ? p.facing : -p.facing) as 1 | -1;
      b.fx.slash(p.x + dir * 8, p.y - 2, dir, 46, 0xffc08a, true, { up: i % 4 >= 2 });
      crescent(b, p.x, p.y - 4, dir, 130, i % 2 ? PAL.rose : PAL.moon, { from: i % 4 >= 2 ? 1.6 : -1.6, to: i % 4 >= 2 ? -1.5 : 1.5, ms: 360 });
      b.spawnPlayerBolt({ x: p.x + dir * 20, y: p.y - 4, vx: dir * 430, vy: 0, damage: b.skillBase({ str: 3.5 }), kind: 'wave', pierce: true, life: 1.6, size: 2, color: 0xffb070 });
      sfx.play('slash', 0.6);
    });
  }
};

/** 천붕: 하늘 높이 뛰어올라 내려찍고, 화면 전체의 땅이 갈라진다. */
const heavenFall: Cast = (b) => {
  const p = b.player;
  p.startAction('skyfall', 0.95, []);
  p.body.setVelocityY(-560);
  p.invuln = Math.max(p.invuln, 1);
  b.fx.embers(p.x, p.feet, 0xd8c8ff, 12, 12, 40);
  later(b, 420, () => {
    p.body.setVelocityY(900);
    b.fx.streak(p.x, p.y + 30, Math.PI / 2, 60, 0xc8b0ff, 220, 3);
  });
  later(b, 640, () => {
    const v = view(b);
    sfx.play('boom');
    b.fx.flashScreen(0xc8b0ff, 0.35, 260);
    b.fx.shake(2.2, 320);
    b.fx.boom(p.x, FLOOR_Y - 16, 40, 'dark');
    b.fx.ring(p.x, FLOOR_Y, 120, 0xc8b0ff, 420);
    impactBurst(b, p.x, FLOOR_Y - 30, 130, PAL.violet, FLOOR_Y);
    column(b, p.x, FLOOR_Y, 70, 400, PAL.violet, 700);
    shockwave(b, p.x, FLOOR_Y, v.width, PAL.violet, 800, 0.25, 12);
    tint(b, 0x7a2aff, 0.3, 500);
    // 땅이 플레이어에게서 양옆으로 차례로 갈라진다.
    for (let x = v.x + 10; x < v.right; x += 34) {
      const d = Math.abs(x - p.x);
      later(b, d * 0.9, () => {
        b.fx.smoke(x, FLOOR_Y - 6, 2, 0x8a7a9a, -14);
        b.fx.burst(x, FLOOR_Y - 4, 0xc8b0ff, 4, 90, 360, 1, 300);
        column(b, x, FLOOR_Y, 10, 120 + Math.random() * 80, PAL.violet, 420);
      });
    }
    for (const m of onScreen(b)) {
      if (m.body.bottom < FLOOR_Y - 70) continue;
      later(b, Math.abs(m.x - p.x) * 0.9, () => {
        b.hitMonster(m, b.skillBase({ str: 9 }), { stun: 2, knock: 60 });
        b.fx.spark(m.x, m.body.bottom - 8, 0xd8c8ff, 2);
      });
    }
  });
};

/** 혈월 강림: 화면이 핏빛으로 물들고, 모든 적에게 참격이 여덟 번 몰아친다. */
const bloodMoon: Cast = (b) => {
  const p = b.player;
  p.startAction('iai', 0.8, []);
  b.fx.dim(0x3a0008, 0.6, 2600);
  b.fx.flashScreen(0xff2a3a, 0.3, 240);
  const cam = b.cameras.main;
  const moon = b.add
    .image(cam.width / 2, 90, 'fx-moon')
    .setScrollFactor(0)
    .setDepth(DEPTH.monster - 1)
    .setScale(0.4)
    .setAlpha(0);
  b.tweens.add({ targets: moon, alpha: 0.95, scale: 1.8, y: 70, duration: 600, ease: 'Quad.Out' });
  b.tweens.add({ targets: moon, alpha: 0, delay: 2200, duration: 400, onComplete: () => moon.destroy() });
  for (let k = 0; k < 8; k++) {
    later(b, 650 + k * 170, () => {
      sfx.play('slash', 0.5 + k * 0.05);
      for (const m of onScreen(b)) {
        const dir = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
        b.fx.slash(m.x, m.y, dir, 22 + Math.random() * 10, 0xff3a4a, false, { rot: (Math.random() - 0.5) * 2.4, up: Math.random() < 0.5, speed: 1.6 });
        const a = Math.random() * Math.PI;
        crescent(b, m.x, m.y, dir, 40 + Math.random() * 20, PAL.crimson, { from: a - 1.4, to: a + 1.4, ms: 220 });
        b.hitMonster(m, b.skillBase({ str: 2.5 }), { knock: 10, quiet: k < 7 });
      }
    });
  }
  later(b, 650 + 8 * 170 + 120, () => {
    b.fx.flashScreen(0xff3a4a, 0.4, 320);
    b.fx.shake(1.6, 260);
    for (const m of onScreen(b)) impactBurst(b, m.x, m.y, 50, PAL.crimson);
    tint(b, 0xd01a3a, 0.3, 500);
  });
};

// ───────────────────────── 궁수 ─────────────────────────

/** 화살 한 발이 (x0,y0)에서 (x1,y1)로 꽂힌다. */
function arrowRain(b: BattleScene, x0: number, y0: number, x1: number, y1: number, ms: number, color: number, onHit: () => void): void {
  drop(b, 'fx-arrow', x0, y0, x1, y1, ms, () => {
    b.fx.spark(x1, y1, color);
    b.fx.burst(x1, y1, color, 3, 60, 240);
    onHit();
  }, undefined, color);
}

/** 천궁 산개: 하늘로 쏘아 올린 화살이 정점에서 30발로 갈라져 쏟아진다. */
const skyBurst: Cast = (b) => {
  const p = b.player;
  p.startAction('shoot', 0.35);
  const m0 = p.muzzle();
  const v0 = view(b);
  const apex = { x: p.x + p.facing * 60, y: v0.y + 50 };
  sfx.play('arrow', 1.4);
  arrowRain(b, m0.x, m0.y, apex.x, apex.y, 320, 0xffe08a, () => {
    b.fx.boom(apex.x, apex.y, 18, 'gold');
    b.fx.ring(apex.x, apex.y, 50, 0xffe08a, 300);
    flare(b, apex.x, apex.y, 60, PAL.gold, 420);
    rays(b, apex.x, apex.y, 18, 200, PAL.gold, 520);
    shockwave(b, apex.x, apex.y, 160, PAL.gold, 500, 1, 8);
    b.fx.circle(apex.x, apex.y, 0xffe08a, 70, 900, false, DEPTH.fx);
    const targets = onScreen(b);
    for (let i = 0; i < 30; i++) {
      later(b, i * 28, () => {
        const v = view(b);
        const m = targets.length && i < targets.length * 2 ? targets[i % targets.length] : null;
        const x = m && m.alive ? m.x + (Math.random() - 0.5) * 8 : v.x + 10 + Math.random() * (v.width - 20);
        const y = m && m.alive ? m.y : FLOOR_Y - 3;
        arrowRain(b, apex.x, apex.y, x, y, 260 + Math.random() * 120, 0xffe08a, () => {
          if (i % 2 === 0) flare(b, x, y, 18, PAL.gold, 200);
          b.hitArea(x - 12, y - 16, 24, 32, b.skillBase({ dex: 2.2, str: 0.8 }), { knock: 20, quiet: i % 3 !== 0 });
        });
      });
    }
  });
};

/** 유성 화살: 가장 강한 적 셋을 쫓아가 폭발하는 빛나는 화살 */
const meteorArrow: Cast = (b) => {
  const p = b.player;
  p.startAction('shoot', 0.4);
  const targets = onScreen(b)
    .sort((a, c) => c.hp - a.hp)
    .slice(0, 3);
  const m0 = p.muzzle();
  b.fx.circle(m0.x + p.facing * 8, m0.y, 0xffe08a, 50, 500, true, DEPTH.fx);
  for (let i = 0; i < 3; i++) {
    const t = targets.length ? targets[i % targets.length] : null;
    later(b, i * 140, () => {
      sfx.play('arrow', 1.6);
      const tx = t && t.alive ? t.x : p.x + p.facing * (180 + i * 60);
      const ty = t && t.alive ? t.y : FLOOR_Y - 10;
      // 위로 크게 휘었다가 내리꽂힌다 (2차 베지어).
      const cx = (m0.x + tx) / 2;
      const cy = Math.min(m0.y, ty) - 120;
      const arrow = b.add.image(m0.x, m0.y, 'fx-arrow').setScale(2).setDepth(DEPTH.projectile);
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(m0.x, m0.y), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(tx, ty));
      const state = { t: 0 };
      b.tweens.add({
        targets: state,
        t: 1,
        duration: 600,
        ease: 'Sine.In',
        onUpdate: () => {
          const pt = curve.getPoint(state.t);
          const tan = curve.getTangent(state.t);
          arrow.setPosition(pt.x, pt.y).setRotation(Math.atan2(tan.y, tan.x));
          b.fx.burst(pt.x, pt.y, 0xffe08a, 1, 20, 300);
        },
        onComplete: () => {
          arrow.destroy();
          sfx.play('boom', 0.7);
          b.fx.boom(tx, ty, 34, 'gold');
          b.fx.ring(tx, Math.min(ty + 10, FLOOR_Y), 60, 0xffe08a);
          impactBurst(b, tx, ty, 80, PAL.gold, Math.min(ty + 10, FLOOR_Y));
          column(b, tx, Math.min(ty + 10, FLOOR_Y), 30, 300, PAL.gold, 520);
          b.fx.shake(1.1, 160);
          b.hitArea(tx - 50, ty - 50, 100, 100, b.skillBase({ dex: 7, str: 3 }), { knock: 120 });
        },
      });
    });
  }
};

/** 오로라 폭우: 하늘을 덮는 마법진에서 3초 동안 화살 폭우 */
const aurora: Cast = (b) => {
  const p = b.player;
  p.startAction('shoot', 0.4);
  b.fx.dim(0x001820, 0.4, 3600);
  const rings = skyCircles(b, 0x7fffd0, 3500);
  b.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 3400,
    onUpdate: (tw) => {
      // 오로라처럼 초록·하늘·보라로 색이 흐른다.
      const h = (0.42 + Math.sin(tw.getValue() * Math.PI * 4) * 0.12 + 1) % 1;
      for (const r of rings) r.setTint(Phaser.Display.Color.HSVToRGB(h, 0.5, 1).color);
    },
  });
  for (let k = 0; k < 30; k++) {
    later(b, 300 + k * 100, () => {
      const v = view(b);
      const targets = onScreen(b);
      for (let j = 0; j < 2; j++) {
        const m = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
        const x = m ? m.x : v.x + Math.random() * v.width;
        const y = m ? m.y : FLOOR_Y - 3;
        arrowRain(b, x + 20, v.y + 34, x, y, 160, 0x9ff0e0, () => {
          if (m && m.alive) b.hitMonster(m, b.skillBase({ dex: 2, str: 0.8 }), { knock: 10, quiet: k % 3 !== 0 });
        });
      }
      if (k % 3 === 0) {
        const pals: Palette3[] = [PAL.jade, PAL.sky, PAL.violet];
        column(b, v.x + Math.random() * v.width, FLOOR_Y, 16, 300, pals[(k / 3) % 3 | 0], 600);
      }
      // 빈 곳에도 화살이 쏟아진다 (보이기용).
      const xr = v.x + Math.random() * v.width;
      arrowRain(b, xr + 20, v.y + 34, xr, FLOOR_Y - 3, 160, 0x9ff0e0, () => undefined);
    });
  }
};

// ───────────────────────── 총잡이 ─────────────────────────

/** 도탄 난사: 탄환 4발이 적에서 적으로 튕기며 최대 8마리씩 맞힌다. */
const ricochet: Cast = (b) => {
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
          b.fx.tracer(a.x, a.y, to.x, to.y, 0xffd890, 2, 120);
          b.fx.bigSlash(a.x, a.y, to.x, to.y, 0xff8a1a, 4, 200);
          b.fx.spark(to.x, to.y, 0xffd890);
          flare(b, to.x, to.y, 18, PAL.flame, 180);
          if (next.alive) b.hitMonster(next, b.weaponBase() * 1.5, { knock: 30, quiet: hop > 0 });
        });
        from = to;
      }
    });
  }
};

/** 포격 요청: 신호탄을 쏘아 올리면 화면 안 모든 적 위로 포탄이 떨어진다. */
const airstrike: Cast = (b) => {
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
        impactBurst(b, x, FLOOR_Y - 30, 90, PAL.flame, FLOOR_Y);
        column(b, x, FLOOR_Y, 36, 280, PAL.flame, 520);
        b.fx.shake(0.9, 140);
        b.hitArea(x - 50, FLOOR_Y - 120, 100, 120, b.weaponBase() * 5, { knock: 120, stun: 0.6 });
      });
    });
  });
};

/** 데드아이: 세상이 느려지며 화면 안 모든 적에게 조준점이 잡히고 일제히 쏜다. */
const deadEye: Cast = (b) => {
  const p = b.player;
  p.startAction('snipe', 1.6, []);
  b.fx.dim(0x000000, 0.65, 1900);
  const targets = onScreen(b);
  const marks = targets.map((m) => {
    const c = b.add.image(m.x, m.y, 'fx-crosshair').setDepth(DEPTH.text - 2).setScale(3).setAlpha(0);
    b.tweens.add({ targets: c, scale: 1.2, alpha: 1, angle: 90, duration: 500, ease: 'Back.Out' });
    return c;
  });
  // 조준점이 적을 따라다닌다.
  const follow = b.time.addEvent({
    delay: 16,
    loop: true,
    callback: () => targets.forEach((m, i) => marks[i].setPosition(m.x, m.y)),
  });
  sfx.play('reload');
  targets.forEach((m, i) => {
    later(b, 900 + i * 70, () => {
      const m0 = p.muzzle();
      b.fx.muzzle(m0.x, m0.y, p.facing, 2);
      b.fx.tracer(m0.x, m0.y, m.x, m.y, 0xfff0a0, 3, 200);
      b.fx.bigSlash(m0.x, m0.y, m.x, m.y, 0xffc040, 8, 300);
      b.fx.spark(m.x, m.y, 0xffffff, 2);
      impactBurst(b, m.x, m.y, 50, PAL.gold);
      sfx.play('shot', 1.3);
      marks[i].destroy();
      if (m.alive) b.hitMonster(m, b.weaponBase() * 15, { knock: 160 });
    });
  });
  later(b, 900 + targets.length * 70 + 100, () => {
    follow.remove();
    for (const c of marks) if (c.active) c.destroy();
    b.fx.flashScreen(0xfff0c0, 0.35, 260);
    b.fx.shake(1.2, 200);
  });
};

// ───────────────────────── 마법사 ─────────────────────────

/** 연쇄 번개: 번개가 최대 10마리를 잇따라 꿰뚫는다. */
const chainLightning: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 0.5);
  const m0 = p.muzzle();
  b.fx.circle(m0.x, m0.y, 0x9fe8ff, 40, 500, true, DEPTH.fx);
  const visited = new Set<Monster>();
  let from = { x: m0.x, y: m0.y };
  const nearest = (o: { x: number; y: number }): Monster | undefined =>
    onScreen(b)
      .filter((m) => !visited.has(m))
      .sort((a, c) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(c.x - o.x, c.y - o.y))[0];
  for (let hop = 0; hop < 10; hop++) {
    let next = nearest(from);
    // 다음 적이 너무 멀면 지팡이에서 새 갈래가 뻗어 나간다.
    if (next && Math.hypot(next.x - from.x, next.y - from.y) > CHAIN_RANGE) {
      from = { x: m0.x, y: m0.y };
      next = nearest(from);
    }
    if (!next) break;
    visited.add(next);
    const a = from;
    later(b, hop * 70, () => {
      b.fx.lightning(a.x, a.y, next.x, next.y, 0x9fe8ff, 2, 220);
      b.fx.lightning(a.x, a.y - 4, next.x, next.y + 4, 0xc080ff, 1, 200);
      b.fx.spark(next.x, next.y, 0xdff8ff, 2);
      flare(b, next.x, next.y, 30, hop % 2 ? PAL.violet : PAL.arcane, 260);
      rays(b, next.x, next.y, 8, 60, PAL.arcane, 260);
      sfx.play('magic', 1.5);
      if (next.alive) b.hitMonster(next, b.skillBase({ int: 6 }), { knock: 30, stun: 0.3 });
    });
    from = { x: next.x, y: next.y };
  }
};

/** 블리자드: 4초 동안 화면 전체에 눈보라가 몰아친다. */
const blizzard: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 0.5);
  b.fx.dim(0x0a2848, 0.35, 4200);
  skyCircles(b, 0xbff0ff, 4000);
  // 눈송이: 화면 위쪽에서 비스듬히 날린다.
  const snow = b.time.addEvent({
    delay: 30,
    repeat: 130,
    callback: () => {
      const v = view(b);
      for (let i = 0; i < 3; i++) {
        const x = v.x + Math.random() * (v.width + 120);
        const f = b.add
          .image(x, v.y - 4, 'fx-px')
          .setTint(Math.random() < 0.7 ? 0xffffff : 0xbff0ff)
          .setScale(Math.random() < 0.4 ? 2 : 1)
          .setDepth(DEPTH.fx);
        b.tweens.add({ targets: f, x: x - 140, y: FLOOR_Y, duration: 900 + Math.random() * 500, onComplete: () => f.destroy() });
      }
    },
  });
  for (let k = 0; k < 10; k++) {
    later(b, 300 + k * 400, () => {
      for (const m of onScreen(b)) {
        b.hitMonster(m, b.skillBase({ int: 0.8 }), { quiet: true, slow: [0.6, 1] });
        b.fx.burst(m.x, m.y, 0xdff8ff, 3, 50, 300);
      }
      const v = view(b);
      for (let i = 0; i < 4; i++) b.fx.iceSpike(v.x + Math.random() * v.width, FLOOR_Y, 0.6 + Math.random() * 0.4, 350, i * 60);
      shockwave(b, v.x + Math.random() * v.width, FLOOR_Y, 180, PAL.frost, 600);
      if (k % 3 === 0) tint(b, 0x7fd8ff, 0.14, 360);
    });
  }
  later(b, 4300, () => snow.remove());
};

/** 아마겟돈: 하늘이 붉게 갈라지며 운석이 쏟아지고, 마지막에 대폭발 */
const armageddon: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 0.6);
  b.fx.dim(0x400000, 0.55, 4000);
  b.fx.flashScreen(0xff3a1a, 0.3, 300);
  const v0 = view(b);
  for (let i = 0; i < 3; i++) b.fx.lightning(v0.x + Math.random() * v0.width, v0.y, v0.x + Math.random() * v0.width, v0.y + 40, 0xff7a3a, 2, 500);
  skyCircles(b, 0xff5a2a, 3800);
  for (let i = 0; i < 18; i++) {
    later(b, 300 + i * 160, () => {
      const v = view(b);
      const targets = onScreen(b);
      const m = targets.length && i % 2 === 0 ? targets[(i / 2) % targets.length | 0] : null;
      const x = m ? m.x : v.x + 30 + Math.random() * (v.width - 60);
      const rock = b.add.sprite(x - 100, v.y - 30, 'fx-meteor').play('fx-meteor').setDepth(DEPTH.projectile).setOrigin(26 / 40, 26 / 40);
      b.tweens.add({
        targets: rock,
        x,
        y: FLOOR_Y - 14,
        duration: 420,
        ease: 'Quad.In',
        onUpdate: () => b.fx.burst(rock.x - 4, rock.y - 4, 0xffa040, 1, 30, 240),
        onComplete: () => {
          rock.destroy();
          sfx.play('boom', 0.6);
          b.fx.boom(x, FLOOR_Y - 20, 34, 'fire');
          b.fx.ring(x, FLOOR_Y, 60, 0xff6a1a);
          impactBurst(b, x, FLOOR_Y - 26, 70, PAL.flame, FLOOR_Y);
          column(b, x, FLOOR_Y, 26, 260, PAL.flame, 460);
          b.fx.shake(0.9, 140);
          b.hitArea(x - 45, FLOOR_Y - 110, 90, 110, b.skillBase({ int: 4 }), { knock: 80, quiet: i % 3 !== 0 });
        },
      });
    });
  }
  later(b, 300 + 18 * 160 + 500, () => {
    // 대폭발: 화면이 하얗게 타오르고 모든 적이 휩쓸린다.
    const v = view(b);
    sfx.play('boom');
    b.fx.flashScreen(0xfff0c0, 0.75, 600);
    b.fx.shake(2.6, 420);
    for (let i = 0; i < 5; i++) b.fx.boom(v.x + (v.width * (i + 0.5)) / 5, FLOOR_Y - 40 - Math.random() * 60, 60, 'fire');
    for (let i = 0; i < 5; i++) later(b, i * 60, () => impactBurst(b, v.x + (v.width * (i + 0.5)) / 5, FLOOR_Y - 60, 140, i % 2 ? PAL.gold : PAL.flame, FLOOR_Y));
    shockwave(b, v.centerX, FLOOR_Y, v.width, PAL.flame, 900, 0.25, 14);
    tint(b, 0xff3a00, 0.4, 700);
    for (const m of onScreen(b)) b.hitMonster(m, b.skillBase({ int: 12 }), { knock: 200 });
  });
};

const ULTIMATES: Record<string, Cast> = {
  sword_heaven_cleave: heavenCleave,
  sword_cross_judgment: crossJudgment,
  sword_thousand_blades: thousandBlades,
  dao_moon_storm: moonStorm,
  dao_heaven_fall: heavenFall,
  dao_blood_moon: bloodMoon,
  bow_sky_burst: skyBurst,
  bow_meteor_arrow: meteorArrow,
  bow_aurora: aurora,
  gun_ricochet: ricochet,
  gun_airstrike: airstrike,
  gun_dead_eye: deadEye,
  staff_chain_lightning: chainLightning,
  staff_blizzard: blizzard,
  staff_armageddon: armageddon,
};

/** 무기 계열별 궁극기 시전 색 */
const ULT_PAL: Record<string, Palette3> = { sword: PAL.sky, dao: PAL.moon, bow: PAL.gold, gun: PAL.flame, staff: PAL.violet };

/** 상급·궁극 스킬을 시전한다. 없는 스킬이면 false */
export function castUltimate(b: BattleScene, id: string): boolean {
  const cast = ULTIMATES[id];
  if (!cast) return false;
  const pal = ULT_PAL[id.split('_')[0]] ?? PAL.gold;
  const p = b.player;
  aura(b, p.x, p.feet, pal, 80);
  flare(b, p.x, p.y, 50, pal, 360);
  shards(b, p.x, p.y, pal, 30, 260, 600);
  tint(b, pal[0], 0.18, 380);
  cast(b);
  return true;
}

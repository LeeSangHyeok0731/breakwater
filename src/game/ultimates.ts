import Phaser from 'phaser';
import { sfx } from '../core/audio';
import { SLOT_ACTIONS } from '../core/input';
import { koNum } from '../ui/format';
import { skyShotMana, skyShotStr } from '../data/skills';
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

/** 천공 섬광 [초안]: 소환까지 걸리는 시간, 모든 검이 한 번씩 쏘는 최대 시간(ms) */
const SKY_SUMMON_MS = 700;
const SKY_ROUND_MS = 640;
/** 공중에 머무는 몸 높이 (땅 기준 px) */
const SKY_HOVER = 110;

/** 천공 섬광: 날아올라 마나검을 펼치고, 마나가 바닥날 때까지 검들이 번갈아 탄검강을 쏜다. */
const skyFlash: Cast = (b) => {
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
    later(b, appear, () => swords.push(skySword(b, x, y, lastShot + 400 - appear)));
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
    tint(b, 0x2a7aff, 0.2, 420);
  });
};

interface SkySword {
  sword: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vanish(): void;
}

/** 마나검 한 자루: 나타나 검강을 두르고, 시전이 끝나면 사라진다. */
function skySword(b: BattleScene, x: number, y: number, lifeMs: number): SkySword {
  const sword = b.add.image(x, y - 14, 'fx-sword').setDepth(DEPTH.projectile).setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  // 검강: 칼날을 감싸는 더 큰 빛
  const glow = b.add.image(x, y, 'fx-sword').setDepth(DEPTH.projectile - 1).setTint(0x4f9dff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(1.5);
  const parts = [sword, glow];
  b.tweens.add({ targets: sword, y, alpha: 1, duration: 200, ease: 'Quad.Out' });
  later(b, 300, () => {
    b.tweens.add({ targets: glow, alpha: 0.75, duration: 160 });
    b.fx.spark(x, y, 0xbfe8ff, 1);
  });
  const cleanup = (): void => {
    for (const part of parts) if (part.active) part.destroy();
  };
  // later는 쓰러지면 건너뛰므로, 검이 남지 않게 따로 지운다.
  b.time.delayedCall(lifeMs, cleanup);
  return {
    sword,
    glow,
    x,
    y,
    vanish: () => {
      if (!sword.active) return;
      b.fx.burst(x, y, 0xbfe8ff, 6, 70, 260);
      b.tweens.add({ targets: parts, alpha: 0, duration: 140, onComplete: cleanup });
    },
  };
}

/** 탄검강 한 발: 몬스터를 조준해 칼끝에서 쏜다. 몬스터가 없으면 앞쪽 땅을 때린다. */
function skyShot(b: BattleScene, { sword, glow, x, y }: SkySword, damage: number, last: boolean): void {
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
  b.fx.tracer(x, y, x + Math.cos(ang) * far, y + Math.sin(ang) * far, last ? 0xdff4ff : 0x7fc4ff, 3, 130);
  flare(b, tx, ty, 16, PAL.sky, 140);
  b.fx.spark(tx, ty, 0xbfe8ff, 1);
  b.hitscan(x, y, ang, far, damage, { pierce: true, color: 0x9fd8ff, width: 0, quiet: true });
  sfx.play('magic', 0.45);
}

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

/** 궁극기 중에 머리 위·화면에 띄우는 글자 */
function ultText(b: BattleScene, size: number, color: string): Phaser.GameObjects.Text {
  return b.add
    .text(0, 0, '', { fontFamily: '"Black Han Sans", "Malgun Gothic", sans-serif', fontSize: `${size}px`, color, stroke: '#140608', strokeThickness: 4, resolution: 3 })
    .setOrigin(0.5)
    .setDepth(DEPTH.text);
}

/** 혈월 발도 [초안]: 키를 누르고 있는 동안 0.5초마다 3타씩 쌓고(최대 10초), 떼면 화면 안 모든 적에게 쌓은 만큼 몰아친다. */
const IAI_MAX = 10;
const IAI_STEP = 0.5;
const IAI_PER_STEP = 3;
const IAI_STR = 0.7;
const IAI_GAP = 0.035;
/** 칸이 찰수록 강해진다 [초안]: k번째 칸은 3 + (k-1)/2(내림)타를 더하고 (20칸이면 150타), 한 타 피해는 칸마다 15%씩 늘어난다 (20칸이면 4배). */
const IAI_DMG_PER_STEP = 0.15;
/** 몰아치는 시간이 너무 길어지지 않게, 발도는 길어야 이 시간 안에 끝난다. */
const IAI_STRIKE_MAX = 3.2;

function iaiHits(steps: number): number {
  let n = 0;
  for (let k = 1; k <= steps; k++) n += IAI_PER_STEP + Math.floor((k - 1) / 2);
  return n;
}

/** 혈월 게이지: 플레이어 옆에 세로로 선 칸. 0.5초마다 한 칸(3타)씩 아래에서 위로 차오른다. */
const IAI_CELLS = IAI_MAX / IAI_STEP;
const GAUGE_CELL = 3;

function drawIaiGauge(g: Phaser.GameObjects.Graphics, x: number, feet: number, t: number, time: number): void {
  const full = Math.min(IAI_CELLS, t / IAI_STEP);
  const filled = Math.floor(full);
  const h = IAI_CELLS * GAUGE_CELL;
  const top = feet - 6 - h;
  g.clear();
  g.fillStyle(0x140608, 0.85).fillRect(x - 2, top - 2, 9, h + 3);
  for (let i = 0; i < IAI_CELLS; i++) {
    const y = feet - 6 - (i + 1) * GAUGE_CELL;
    if (i < filled) g.fillStyle(i === filled - 1 ? 0xff8a96 : 0xd01a3a, 1).fillRect(x, y + 1, 5, GAUGE_CELL - 1);
    else if (i === filled && filled < IAI_CELLS) {
      // 지금 차오르는 칸
      const k = full - filled;
      g.fillStyle(0x5a0a14, 1).fillRect(x, y + 1, 5, GAUGE_CELL - 1);
      g.fillStyle(0xff3a4a, 0.5 + k * 0.5).fillRect(x, y + 1, Math.max(1, Math.round(5 * k)), GAUGE_CELL - 1);
    } else g.fillStyle(0x2a0a10, 1).fillRect(x, y + 1, 5, GAUGE_CELL - 1);
  }
  // 가득 차면 테두리가 하얗게 맥동한다.
  if (filled >= IAI_CELLS) g.lineStyle(1, 0xffffff, 0.5 + Math.sin(time * 14) * 0.4).strokeRect(x - 2, top - 2, 9, h + 3);
}

const bloodMoon: Cast = (b) => {
  const p = b.player;
  const key = SLOT_ACTIONS[b.lastCastSlot];
  const cam = b.cameras.main;
  const moon = b.add.image(cam.width / 2, 110, 'fx-moon').setScrollFactor(0).setDepth(DEPTH.monster - 1).setScale(0.3).setAlpha(0);
  const veil = b.add.rectangle(0, 0, cam.width + 400, cam.height, 0x3a0008, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.monster - 2);
  const gauge = b.add.graphics().setDepth(DEPTH.text - 1);
  b.announce('키를 누르고 있으면 혈월이 차오른다. 떼면 발도!', 1.4);
  let t = 0;
  let steps = 0;
  let hits = 0;
  let total = 0;
  let gap = 0;
  let strikeGap = IAI_GAP;
  let hitDamage = 0;
  let striking = false;
  const cleanup = (): void => {
    gauge.destroy();
    b.tweens.add({ targets: [moon, veil], alpha: 0, duration: 400, onComplete: () => (moon.destroy(), veil.destroy()) });
    p.action = null;
  };
  const ult = {
    // 모으는 동안은 움직일 수 있지만 공격·스킬·구르기는 못 한다. 발도하는 동안은 제자리에 선다.
    lock: true,
    still: false,
    tick: (dt: number): boolean => {
      if (p.dead) {
        cleanup();
        return true;
      }
      if (!striking) {
        t += dt;
        const k = Math.min(1, t / IAI_MAX);
        moon.setAlpha(0.3 + k * 0.65).setScale(0.3 + k * 1.6);
        veil.setAlpha(k * 0.45);
        drawIaiGauge(gauge, Math.round(p.x + (p.facing === 1 ? -20 : 15)), p.feet, t, b.time.now / 1000);
        if (Math.random() < 0.3 + k * 0.6) b.fx.embers(p.x, p.feet - 4, Math.random() < 0.5 ? 0xff3a4a : 0xffa0a8, 1, 12 + k * 20, 30 + k * 40, 500);
        const now = Math.min(IAI_CELLS, Math.floor(t / IAI_STEP));
        if (now > steps) {
          steps = now;
          b.fx.ring(p.x, p.feet, 24 + k * 50, 0xff3a4a, 260);
          sfx.play('parry', 0.3 + k * 0.4);
          if (steps === IAI_CELLS) b.fx.flashScreen(0xff3a4a, 0.25, 200);
        }
        if (b.keys.isDown(key) && t < IAI_MAX) return false;
        // 떼었다: 발도. 0.5초가 안 되어도 한 칸(3타)은 나간다.
        striking = true;
        ult.still = true;
        total = iaiHits(Math.max(1, steps));
        strikeGap = Math.min(IAI_GAP, IAI_STRIKE_MAX / total);
        hitDamage = b.skillBase({ str: IAI_STR * (1 + IAI_DMG_PER_STEP * Math.max(1, steps)) });
        b.fx.text(p.x, p.body.top - 30, `혈월 ${total}타 · 한 타 ${Math.round(IAI_STR * (1 + IAI_DMG_PER_STEP * Math.max(1, steps)) * 100)}%`, 'crit');
        p.startAction('iai', 99, []);
        b.fx.flashScreen(0xff2a3a, 0.4, 240);
        sfx.play('slash', 1.4);
        return false;
      }
      // 발도: 짧은 간격으로 화면 안 모든 적을 벤다. 이 동안은 맞지 않는다. 게이지가 위에서부터 비워진다.
      p.invuln = Math.max(p.invuln, 0.2);
      drawIaiGauge(gauge, Math.round(p.x + (p.facing === 1 ? -20 : 15)), p.feet, (1 - hits / total) * Math.max(1, steps) * IAI_STEP, b.time.now / 1000);
      gap -= dt;
      while (gap <= 0 && hits < total) {
        gap += strikeGap;
        hits++;
        const targets = onScreen(b);
        if (hits % 3 === 1) sfx.play('slash', 0.4 + Math.random() * 0.3);
        targets.forEach((m, i) => {
          if (i < 6) {
            const dir = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
            b.fx.slash(m.x, m.y, dir, 20 + Math.random() * 12, 0xff3a4a, false, { rot: (Math.random() - 0.5) * 2.4, up: Math.random() < 0.5, speed: 1.8 });
            if (hits % 4 === 0) {
              const a = Math.random() * Math.PI;
              crescent(b, m.x, m.y, dir, 36 + Math.random() * 24, PAL.crimson, { from: a - 1.4, to: a + 1.4, ms: 200 });
            }
          }
          b.hitMonster(m, hitDamage, { knock: 6, quiet: hits !== total });
        });
        if (hits % 6 === 0) b.fx.shake(0.6, 80);
      }
      if (hits < total) return false;
      b.fx.flashScreen(0xff3a4a, 0.45, 360);
      b.fx.shake(1.8, 300);
      for (const m of onScreen(b)) impactBurst(b, m.x, m.y, 50, PAL.crimson);
      tint(b, 0xd01a3a, 0.3, 500);
      cleanup();
      return true;
    },
  };
  b.ult = ult;
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

/**
 * 별사냥 [초안]: 6초 동안 활로 맞힌 적에게 별 표식이 쌓인다. 한 적을 맞힐수록 늘어나는 양이 1씩 커진다
 * (1대 1개, 2대 3개, 3대 6개 …, 상한 없음). 끝나면 별똥별 화살비가 쏟아진 뒤, 표식이 붙은 적마다
 * 별 개수만큼의 피해(별 하나에 민첩 150% + 힘 50%)를 담은 커다란 마법 화살 한 발이 꽂힌다. 별이 많을수록 화살이 크다.
 */
const STAR_TIME = 6;
const STAR_PER = { dex: 1.5, str: 0.5 };
/** 장식용 화살비: 몇 번, 몇 초 간격, 한 번에 몇 발 */
const STAR_VOLLEYS = 6;
const STAR_VOLLEY_GAP = 0.12;
const STAR_VOLLEY_ARROWS = 8;
/** 큰 화살이 차례로 꽂히는 간격 */
const BIG_ARROW_GAP = 0.18;

/** 별 n개를 담은 커다란 마법 화살: 하늘에서 비스듬히 내리꽂힌다. */
function bigStarArrow(b: BattleScene, m: Monster, stars: number, last: boolean): void {
  const v = view(b);
  // 크기는 별 수의 로그에 비례 (별 1개 2배, 100개 약 6배, 1000개 약 8배)
  const size = 2 + Math.min(7, Math.log2(stars + 1) * 0.85);
  const sx = m.x + 70 + size * 8;
  const sy = v.y - 20;
  const ang = Math.atan2(m.y - sy, m.x - sx);
  const arrow = b.add.image(sx, sy, 'fx-arrow').setDepth(DEPTH.projectile + 1).setRotation(ang).setScale(size).setTint(0xffe08a);
  const glow = b.add.image(sx, sy, 'fx-arrow').setDepth(DEPTH.projectile).setRotation(ang).setScale(size * 1.5).setTint(0xfff0b0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
  const tail = b.fx.streak(sx, sy, ang, 40 + size * 14, 0xffe08a, 0, Math.max(1, Math.round(size / 2)));
  sfx.play('arrow', 1.6);
  b.tweens.add({
    targets: [arrow, glow, tail],
    x: m.x,
    y: m.y,
    duration: 260,
    ease: 'Quad.In',
    onComplete: () => {
      arrow.destroy();
      glow.destroy();
      tail.destroy();
      const power = Math.min(1, stars / 300);
      impactBurst(b, m.x, m.y, 40 + size * 10, PAL.gold, FLOOR_Y);
      rays(b, m.x, m.y, 10 + Math.round(size), 60 + size * 16, PAL.gold, 420);
      shockwave(b, m.x, FLOOR_Y, 60 + size * 20, PAL.gold, 500);
      b.fx.flashScreen(0xfff0c0, 0.2 + power * 0.35, 220);
      b.fx.shake(0.8 + power * 2, 260);
      sfx.play('boom', 0.6 + power * 0.4);
      if (!m.alive) return;
      const dmg = b.hitMonster(m, b.skillBase(STAR_PER) * stars, { knock: 120, silent: true });
      b.fx.text(m.x, m.body.top - 10, `★${stars}  ${koNum(dmg)}`, 'crit');
      if (last) tint(b, 0xffe08a, 0.25, 400);
    },
  });
}

const aurora: Cast = (b) => {
  const p = b.player;
  p.startAction('shoot', 0.4);
  const rings = skyCircles(b, 0x7fffd0, STAR_TIME * 1000 + 400);
  b.tweens.addCounter({
    from: 0,
    to: 1,
    duration: STAR_TIME * 1000,
    onUpdate: (tw) => {
      // 오로라처럼 초록·하늘·보라로 색이 흐른다.
      const h = (0.42 + Math.sin(tw.getValue() * Math.PI * 4) * 0.12 + 1) % 1;
      for (const r of rings) r.setTint(Phaser.Display.Color.HSVToRGB(h, 0.5, 1).color);
    },
  });
  b.announce('별사냥! 6초 동안 활로 맞힌 적에게 별 표식이 새겨진다', 1.6);
  const marks = new Map<Monster, { n: number; hits: number; label: Phaser.GameObjects.Text }>();
  const timer = ultText(b, 16, '#ffe08a').setScrollFactor(0);
  b.hitHook = (m) => {
    if (b.player.weapon.def.type !== 'bow') return;
    let e = marks.get(m);
    if (!e) {
      e = { n: 0, hits: 0, label: ultText(b, 12, '#ffe08a') };
      marks.set(m, e);
    }
    e.hits++;
    e.n += e.hits;
    b.fx.spark(m.x, m.body.top - 6, 0xffe08a, 1, Math.PI / 4);
  };
  let t = 0;
  let falling = false;
  /** 장식용 화살비와 큰 화살의 순서: [시각, 할 일] */
  let plan: [number, () => void][] = [];
  let ft = 0;
  let finishAt = 0;
  const clear = (): void => {
    b.hitHook = null;
    timer.destroy();
    for (const e of marks.values()) e.label.destroy();
    marks.clear();
  };
  b.ult = {
    lock: false,
    still: false,
    tick: (dt) => {
      if (p.dead) {
        clear();
        return true;
      }
      t += dt;
      for (const [m, e] of marks) e.label.setPosition(m.x, m.body.top - 14).setText(`★${e.n}`).setVisible(m.alive && e.n > 0);
      if (!falling) {
        const stars = [...marks.values()].reduce((a, e) => a + e.n, 0);
        timer.setPosition(b.cameras.main.width / 2, 74).setText(`별사냥 ${Math.max(0, STAR_TIME - t).toFixed(1)}초 · 별 ${stars}개`);
        if (t < STAR_TIME) return false;
        // 끝: 표식을 별자리로 잇고, 화살비가 쏟아진 뒤 적마다 큰 마법 화살이 꽂힌다.
        falling = true;
        b.hitHook = null;
        const live = [...marks.entries()].filter(([m, e]) => m.alive && e.n > 0).sort((a, c) => a[1].n - c[1].n);
        timer.setText(stars ? `별 ${stars}개` : '');
        const lines = b.add.graphics().setDepth(DEPTH.fx);
        lines.lineStyle(1, 0xffe08a, 0.9);
        for (let i = 1; i < live.length; i++) lines.lineBetween(live[i - 1][0].x, live[i - 1][0].y, live[i][0].x, live[i][0].y);
        b.tweens.add({ targets: lines, alpha: 0, delay: 600, duration: 500, onComplete: () => lines.destroy() });
        if (live.length) {
          b.fx.flashScreen(0xffe08a, 0.25, 260);
          sfx.play('magic', 1.2);
          // 장식용 화살비 (피해 없음): 표식이 붙은 적 근처로 여러 발씩 쏟아진다.
          for (let k = 0; k < STAR_VOLLEYS; k++) {
            plan.push([
              0.3 + k * STAR_VOLLEY_GAP,
              () => {
                const v = view(b);
                sfx.play('arrow', 0.6);
                for (let i = 0; i < STAR_VOLLEY_ARROWS; i++) {
                  const [m] = live[Math.floor(Math.random() * live.length)];
                  const ex = m.x + (Math.random() - 0.5) * 60;
                  arrowRain(b, ex + 20 + Math.random() * 90, v.y + 4 + Math.random() * 30, ex, FLOOR_Y - 3 - Math.random() * 30, 200 + Math.random() * 60, 0xffe08a, () => undefined);
                }
              },
            ]);
          }
          // 큰 마법 화살: 별이 적은 적부터 차례로, 가장 큰 화살이 마지막에 꽂힌다.
          const t0 = 0.3 + STAR_VOLLEYS * STAR_VOLLEY_GAP + 0.15;
          live.forEach(([m, e], i) => {
            const n = e.n;
            plan.push([t0 + i * BIG_ARROW_GAP, () => {
              e.n = 0;
              bigStarArrow(b, m, n, i === live.length - 1);
            }]);
          });
        }
        plan.sort((a, c) => a[0] - c[0]);
        finishAt = (plan.length ? plan[plan.length - 1][0] : 0) + 0.6;
        return false;
      }
      ft += dt;
      while (plan.length && plan[0][0] <= ft) plan.shift()![1]();
      // 마지막 화살이 꽂히고 터지는 것까지 기다린다.
      if (plan.length || ft < finishAt) return false;
      clear();
      return true;
    },
  };
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

const deadEye: Cast = (b) => {
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
      b.fx.tracer(s.x, s.y, tx, ty, 0xffe08a, 2, 160);
      b.fx.spark(s.x, s.y, 0xfff0b0, 0.8);
      b.tweens.add({ targets: s, scale: 1.25, duration: 50, yoyo: true });
      if (m?.alive) b.hitMonster(m, b.weaponBase() * SUB_MUL, { knock: 20, quiet: true });
    });
  };
  const addSubs = (n: number): void => {
    for (let i = 0; i < n; i++) {
      const s = b.add.image(p.x, p.y, subKey).setDepth(DEPTH.projectile).setScale(0.2).setAlpha(0);
      b.tweens.add({ targets: s, scale: 1, alpha: 1, duration: 240, ease: 'Back.Out' });
      b.fx.burst(p.x, p.y - 10, 0xffe08a, 6, 80, 260);
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
      impactBurst(b, tx, ty, grade === 'perfect' ? 60 : 36, PAL.gold);
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

/** 운석 하나가 x에 떨어진다. */
function meteorAt(b: BattleScene, x: number, damage: number, loud: boolean): void {
  const v = view(b);
  const rock = b.add.sprite(x - 100, v.y - 30, 'fx-meteor').play('fx-meteor').setDepth(DEPTH.projectile).setOrigin(26 / 40, 26 / 40);
  b.tweens.add({
    targets: rock,
    x,
    y: FLOOR_Y - 14,
    duration: 380,
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
      b.hitArea(x - 45, FLOOR_Y - 110, 90, 110, damage, { knock: 80, quiet: !loud });
    },
  });
}

/**
 * 룬 아마겟돈 [초안]: 머리 위에 뜨는 방향 룬과 같은 방향키를 누를 때마다 운석이 떨어진다. 시간 제한 대신 룬 수로 강해진다.
 * - 단계: 룬 4개 → 2단계, 5개 더 → 3단계, 6개 더(모두 15개) → 4단계에서 마지막 폭발. 단계마다 마법진이 커지고, 룬 하나에 운석이 단계 수만큼 떨어진다 (최대 3개).
 * - 연속 증폭: n번째 룬의 운석은 하나에 마력의 300% × n.
 * - 원소 조합: 룬은 불·얼음·번개 색으로 3개씩 묶여 나온다. 한 묶음을 다 맞히면 그 원소 마법이 터진다 (단계에 비례).
 * - 틀리거나 한 룬에 2초가 지나면 영창이 끝나고, 마력의 (300% + 룬당 150%) × 단계 배수의 대폭발이 화면 안 모든 적을 덮친다.
 */
const RUNE_LIMIT = 2;
const RUNE_STAGES = [4, 9, 15];
const RUNE_MAX = RUNE_STAGES[RUNE_STAGES.length - 1];
const RUNE_METEOR_INT = 3;
const RUNE_STAGE_MUL = [1, 1.5, 2, 2.5];
const RUNES: { action: 'left' | 'up' | 'right' | 'down'; glyph: string }[] = [
  { action: 'left', glyph: '←' },
  { action: 'up', glyph: '↑' },
  { action: 'right', glyph: '→' },
  { action: 'down', glyph: '↓' },
];
type RuneElement = 'fire' | 'ice' | 'bolt';
const ELEMENT: Record<RuneElement, { color: number; css: string; name: string }> = {
  fire: { color: 0xff6a2a, css: '#ff8a4a', name: '불' },
  ice: { color: 0x8fe0ff, css: '#9fe8ff', name: '얼음' },
  bolt: { color: 0xffe04a, css: '#fff07a', name: '번개' },
};

/** 원소 묶음을 다 맞혔을 때 터지는 마법 (단계에 비례) */
function runeBurst(b: BattleScene, el: RuneElement, stage: number): void {
  const foes = onScreen(b);
  const v = view(b);
  if (el === 'fire') {
    // 불기둥: 화면 안 적마다 솟는다.
    b.announce('원소 조합 · 불기둥!', 0.9);
    sfx.play('boom', 0.8);
    foes.forEach((m, i) =>
      later(b, i * 50, () => {
        column(b, m.x, FLOOR_Y, 34, 300, PAL.flame, 520);
        b.fx.boom(m.x, FLOOR_Y - 30, 30, 'fire');
        if (m.alive) b.hitMonster(m, b.skillBase({ int: 7.5 * stage }), { knock: 60, quiet: i > 0 });
      }),
    );
  } else if (el === 'ice') {
    // 얼음 감옥: 적을 얼음 가시로 가두고 잠깐 멈춘다.
    b.announce('원소 조합 · 얼음 감옥!', 0.9);
    sfx.play('magic', 1.2);
    tint(b, 0x7fd8ff, 0.2, 400);
    foes.forEach((m, i) => {
      for (let k = -1; k <= 1; k++) b.fx.iceSpike(m.x + k * 12, FLOOR_Y, 1 + (k === 0 ? 0.4 : 0), 900, i * 30 + Math.abs(k) * 40);
      if (m.alive) b.hitMonster(m, b.skillBase({ int: 6 * stage }), { stun: 1.5, quiet: i > 0 });
    });
  } else {
    // 연쇄 번개: 하늘에서 내려와 적에서 적으로 튄다.
    b.announce('원소 조합 · 연쇄 번개!', 0.9);
    let from = { x: v.centerX, y: v.y };
    foes.slice(0, 12).forEach((m, i) => {
      const a = from;
      later(b, i * 60, () => {
        b.fx.lightning(a.x, a.y, m.x, m.y, 0xfff07a, 2, 220);
        b.fx.spark(m.x, m.y, 0xffffff, 2);
        sfx.play('magic', 1.4);
        if (m.alive) b.hitMonster(m, b.skillBase({ int: 7 * stage }), { knock: 30, quiet: i > 0 });
      });
      from = { x: m.x, y: m.y };
    });
  }
}

const armageddon: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 99);
  const cam = b.cameras.main;
  const veil = b.add.rectangle(0, 0, cam.width + 400, cam.height, 0x400000, 0.45).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.monster - 2);
  // 마법진: 단계마다 하나씩 겹쳐 커진다.
  let circles = skyCircles(b, 0xff5a2a, 60000);
  const rune = ultText(b, 30, '#ffd08a');
  const timerBar = b.add.graphics().setDepth(DEPTH.text);
  const info = ultText(b, 14, '#ffb080').setScrollFactor(0);
  b.announce('룬 아마겟돈! 머리 위 룬과 같은 방향키를 눌러라', 1.6);
  b.fx.flashScreen(0xff3a1a, 0.3, 300);
  // 원소는 같은 색 셋씩 묶어서 나온다.
  const elements: RuneElement[] = [];
  const order: RuneElement[] = ['fire', 'ice', 'bolt'];
  while (elements.length < RUNE_MAX) {
    const el = order[Math.floor(Math.random() * 3)];
    if (elements.length && elements[elements.length - 1] === el) continue;
    elements.push(el, el, el);
  }
  let t = 0;
  let count = 0;
  let stage = 1;
  let current = RUNES[Math.floor(Math.random() * 4)];
  let casting = true;
  let after = 0;
  const nextRune = (): void => {
    let r = current;
    while (r === current) r = RUNES[Math.floor(Math.random() * 4)];
    current = r;
    t = 0;
  };
  const stageUp = (): void => {
    stage++;
    b.announce(stage >= 4 ? '마법진 완성!' : `마법진 ${stage}단계`, 1);
    b.fx.flashScreen(0xffa040, 0.3, 300);
    b.fx.shake(1 + stage * 0.3, 260);
    sfx.play('boom', 0.7);
    for (const c of circles) if (c.active) c.destroy();
    circles = skyCircles(b, stage >= 3 ? 0xffd060 : 0xff8a3a, 60000);
    circles.forEach((c) => c.setScale(c.scaleX * (1 + stage * 0.2)));
  };
  const cleanup = (): void => {
    rune.destroy();
    info.destroy();
    timerBar.destroy();
    for (const c of circles) if (c.active) c.destroy();
    b.tweens.add({ targets: veil, alpha: 0, duration: 400, onComplete: () => veil.destroy() });
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
      if (casting) {
        t += dt;
        const el = elements[count];
        const rx = p.x;
        const ry = p.body.top - 30 + Math.sin(b.time.now * 0.008) * 2;
        rune.setPosition(rx, ry).setText(current.glyph).setColor(ELEMENT[el].css);
        // 이 룬에 남은 시간 막대
        const left = Math.max(0, 1 - t / RUNE_LIMIT);
        timerBar.clear().fillStyle(0x140608, 0.8).fillRect(rx - 14, ry + 18, 28, 3).fillStyle(ELEMENT[el].color, 1).fillRect(rx - 14, ry + 18, Math.round(28 * left), 3);
        info.setPosition(cam.width / 2, 74).setText(`마법진 ${stage}단계 · 룬 ${count} / ${RUNE_MAX} · 다음 원소 ${ELEMENT[el].name}`);
        const pressed = RUNES.find((r) => b.keys.pressed(r.action));
        let stop = t >= RUNE_LIMIT;
        if (pressed) {
          if (pressed === current) {
            count++;
            // 새긴 룬이 하늘로 날아올라 운석을 부른다. 단계만큼 떨어지고, 뒤의 룬일수록 세다.
            const fly = ultText(b, 30, ELEMENT[el].css).setPosition(rune.x, rune.y).setText(current.glyph);
            b.tweens.add({ targets: fly, y: view(b).y + 30, alpha: 0, scale: 1.6, duration: 380, onComplete: () => fly.destroy() });
            b.fx.burst(rune.x, rune.y, ELEMENT[el].color, 8, 90, 260);
            sfx.play('magic', 0.8 + count * 0.04);
            const meteors = Math.min(3, stage);
            const v = view(b);
            for (let i = 0; i < meteors; i++) {
              const targets = onScreen(b);
              const m = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
              later(b, i * 90, () => meteorAt(b, m ? m.x + (Math.random() - 0.5) * 30 : v.x + 40 + Math.random() * (v.width - 80), b.skillBase({ int: RUNE_METEOR_INT * count }), i === 0));
            }
            // 같은 원소 셋을 다 맞혔다: 원소 마법
            if (count % 3 === 0) runeBurst(b, el, stage);
            if (RUNE_STAGES.includes(count)) stageUp();
            nextRune();
            if (count >= RUNE_MAX) stop = true;
          } else {
            // 틀렸다: 룬이 깨지며 영창이 끝난다.
            b.fx.burst(rune.x, rune.y, 0xff3a3a, 14, 120, 320);
            b.fx.text(p.x, p.body.top - 40, '룬이 깨졌다', 'info');
            sfx.play('block', 0.8);
            stop = true;
          }
        }
        if (!stop) return false;
        if (t >= RUNE_LIMIT && count < RUNE_MAX) b.fx.text(p.x, p.body.top - 40, '영창이 끊겼다', 'info');
        casting = false;
        rune.setText('');
        timerBar.clear();
        info.setText(`룬 ${count}개 · 마법진 ${stage}단계`);
        return false;
      }
      after += dt;
      if (after < 0.8) return false;
      // 대폭발: 새긴 룬과 마법진 단계만큼 커진다.
      const v = view(b);
      const power = (3 + count * 1.5) * RUNE_STAGE_MUL[stage - 1];
      sfx.play('boom');
      b.fx.flashScreen(0xfff0c0, 0.45 + Math.min(0.35, count * 0.03), 600);
      b.fx.shake(1.4 + count * 0.12, 420);
      for (let i = 0; i < 5; i++) b.fx.boom(v.x + (v.width * (i + 0.5)) / 5, FLOOR_Y - 40 - Math.random() * 60, 40 + count * 3, 'fire');
      for (let i = 0; i < 5; i++) later(b, i * 60, () => impactBurst(b, v.x + (v.width * (i + 0.5)) / 5, FLOOR_Y - 60, 80 + count * 6, i % 2 ? PAL.gold : PAL.flame, FLOOR_Y));
      shockwave(b, v.centerX, FLOOR_Y, v.width, PAL.flame, 900, 0.25, 14);
      tint(b, 0xff3a00, 0.4, 700);
      for (const m of onScreen(b)) b.hitMonster(m, b.skillBase({ int: power }), { knock: 200 });
      cleanup();
      return true;
    },
  };
};
const ULTIMATES: Record<string, Cast> = {
  sword_heaven_cleave: heavenCleave,
  sword_cross_judgment: crossJudgment,
  sword_thousand_blades: skyFlash,
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

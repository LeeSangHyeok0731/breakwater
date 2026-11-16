// 도객의 상급·궁극 스킬

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { SLOT_ACTIONS } from '../../core/input';
import { DEPTH } from '../fx';
import { FLOOR_Y } from '../world';
import { afterglow, column, crescent, flutter, glow, hues, impactBurst, PAL, shockwave, wash, wisps } from '../vfx';
import { view, onScreen, later, type Cast } from './shared';

/** 월하 폭풍참: 거대한 초승달 참격 6개를 앞뒤로 번갈아 날린다. */
export const moonStorm: Cast = (b) => {
  const p = b.player;
  p.startAction('crescent', 0.95, []);
  for (let i = 0; i < 6; i++) {
    later(b, 80 + i * 130, () => {
      const dir = (i % 2 === 0 ? p.facing : -p.facing) as 1 | -1;
      b.fx.slash(p.x + dir * 8, p.y - 2, dir, 46, 0xffc08a, true, { up: i % 4 >= 2 });
      crescent(b, p.x, p.y - 4, dir, 130, i % 2 ? PAL.rose : PAL.moon, { from: i % 4 >= 2 ? 1.6 : -1.6, to: i % 4 >= 2 ? -1.5 : 1.5, ms: 360 });
      b.spawnPlayerBolt({ x: p.x + dir * 20, y: p.y - 4, vx: dir * 430, vy: 0, damage: b.skillBase({ str: 3.5 }), kind: 'wave', pierce: true, life: 1.6, size: 2, color: [0xffb070, 0xff7ab0, 0xffe070][i % 3] });
      // 달빛 폭풍: 주황·장미·노랑 달이 번갈아 뜨고, 별 부스러기가 검기를 따라 쓸려 간다.
      wisps(b, p.x + dir * 30, p.y - 4, i % 2 ? PAL.rose : PAL.moon, 4, 120, 460, { angle: dir === 1 ? 0 : Math.PI, cone: 0.8, curl: 2.4, width: 7 });
      flutter(b, p.x + dir * 50, p.y - 4, 'star', [0xffe070, 0xff8ad0, 0xfff0d0, 0xffa040], 8, { spread: 30, spreadY: 40, speed: 240, angle: dir === 1 ? 0 : Math.PI, cone: 0.5, gravity: 30, life: 800 });
      glow(b, p.x + dir * 40, p.y - 4, 130, i % 2 ? 0x9a2aff : 0xe01a6a, 420, 0.5);
      if (i === 5) afterglow(b, p.x, FLOOR_Y, 260, PAL.moon, 'star', 1200);
      sfx.play('slash', 0.6);
    });
  }
};

/** 천붕: 하늘 높이 뛰어올라 내려찍고, 화면 전체의 땅이 갈라진다. */
export const heavenFall: Cast = (b) => {
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
    // 하늘이 남색에서 분홍으로 물들고, 갈라진 틈마다 보라·장미·남색 빛이 번갈아 솟는다.
    wash(b, 0x3a2ae0, 0xff5ac8, 0.26, 560);
    shockwave(b, p.x, FLOOR_Y, v.width * 0.6, PAL.rose, 700, 0.25, 8);
    wisps(b, p.x, FLOOR_Y - 10, PAL.violet, 10, 190, 700, { angle: -Math.PI / 2, cone: 1.4, curl: 2.6, width: 9 });
    flutter(b, p.x, FLOOR_Y - 20, 'star', hues(PAL.violet), 30, { spread: 50, spreadY: 10, speed: 320, cone: 1.2, gravity: 240, life: 1200 });
    afterglow(b, p.x, FLOOR_Y, 300, PAL.violet, 'star', 1400);
    // 땅이 플레이어에게서 양옆으로 차례로 갈라진다.
    let crack = 0;
    for (let x = v.x + 10; x < v.right; x += 34) {
      const d = Math.abs(x - p.x);
      const pal = [PAL.violet, PAL.rose, PAL.storm][crack++ % 3];
      later(b, d * 0.9, () => {
        b.fx.smoke(x, FLOOR_Y - 6, 2, 0x8a7a9a, -14);
        b.fx.burst(x, FLOOR_Y - 4, pal[1], 4, 90, 360, 1, 300);
        column(b, x, FLOOR_Y, 10, 120 + Math.random() * 80, pal, 420);
        flutter(b, x, FLOOR_Y - 8, 'star', hues(pal), 2, { spread: 6, speed: 150, cone: 0.5, gravity: 200, life: 700 });
        glow(b, x, FLOOR_Y, 40, pal[0], 520, 0.5, 0.4);
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

export const bloodMoon: Cast = (b) => {
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
        // 혈월이 차오를수록 붉은 꽃잎과 자줏빛 기운이 짙게 피어오른다.
        if (Math.random() < 0.06 + k * 0.2) flutter(b, p.x, p.feet - 10, 'petal', [0xff3a5a, 0xc03ae0, 0xff8a96, 0xff9a3a], 1, { spread: 20 + k * 30, spreadY: 6, speed: 30, cone: 0.5, gravity: -60 - k * 60, sway: 14, life: 1100 });
        const now = Math.min(IAI_CELLS, Math.floor(t / IAI_STEP));
        if (now > steps) {
          steps = now;
          b.fx.ring(p.x, p.feet, 24 + k * 50, 0xff3a4a, 260);
          glow(b, p.x, p.feet, 40 + k * 70, steps % 2 ? 0x8a1ad0 : 0xd01a3a, 420, 0.5, 0.4);
          if (steps % 4 === 0) wisps(b, p.x, p.feet - 6, steps % 8 ? PAL.crimson : PAL.rose, 4, 60 + k * 60, 480, { angle: -Math.PI / 2, cone: 1.0, curl: 3, width: 6 });
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
        wash(b, 0x8a1ad0, 0xff2a3a, 0.24, 520);
        wisps(b, p.x, p.y, PAL.crimson, 10, 170, 620, { curl: 3, width: 9 });
        flutter(b, p.x, p.y, 'petal', [0xff3a5a, 0xc03ae0, 0xff8a96, 0xffd0d0], 30, { spread: 30, speed: 280, gravity: 60, sway: 18, life: 1400 });
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
              crescent(b, m.x, m.y, dir, 36 + Math.random() * 24, [PAL.crimson, PAL.rose, PAL.hex][(hits / 4) % 3], { from: a - 1.4, to: a + 1.4, ms: 200 });
              if (hits % 8 === 0) flutter(b, m.x, m.y, 'petal', [0xff3a5a, 0xc03ae0, 0xff8a96], 3, { spread: 10, speed: 140, gravity: 160, life: 700 });
            }
          }
          b.hitMonster(m, hitDamage, { knock: 6, quiet: hits !== total });
        });
        if (hits % 6 === 0) b.fx.shake(0.6, 80);
      }
      if (hits < total) return false;
      b.fx.flashScreen(0xff3a4a, 0.45, 360);
      b.fx.shake(1.8, 300);
      onScreen(b).forEach((m, i) => impactBurst(b, m.x, m.y, 50, i % 2 ? PAL.rose : PAL.crimson));
      wash(b, 0x8a1ad0, 0xff2a3a, 0.3, 600);
      flutter(b, view(b).centerX, view(b).y + 20, 'petal', [0xff3a5a, 0xc03ae0, 0xff8a96, 0xffd0d0], 40, { spread: view(b).width / 2, spreadY: 20, speed: 40, cone: 0.5, angle: Math.PI / 2, gravity: 90, sway: 20, life: 2000, within: 500 });
      cleanup();
      return true;
    },
  };
  b.ult = ult;
};

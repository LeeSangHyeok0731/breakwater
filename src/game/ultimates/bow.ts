// 궁수의 상급·궁극 스킬

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { koNum } from '../../ui/format';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import type { Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { afterglow, column, flare, flutter, glow, hues, impactBurst, PAL, rays, shockwave, tint, wash, wisps } from '../vfx';
import { view, onScreen, later, skyCircles, drop, ultText, type Cast } from './shared';

/** 화살 한 발이 (x0,y0)에서 (x1,y1)로 꽂힌다. */
function arrowRain(b: BattleScene, x0: number, y0: number, x1: number, y1: number, ms: number, color: number, onHit: () => void): void {
  drop(b, 'fx-arrow', x0, y0, x1, y1, ms, () => {
    b.fx.spark(x1, y1, color);
    b.fx.burst(x1, y1, color, 3, 60, 240);
    onHit();
  }, undefined, color);
}

/** 천궁 산개의 화살 빛깔 */
const BURST_HUES = [0xffe08a, 0xff9ab8, 0x9affc0, 0xfff6c0, 0x7fd8ff];

/** 천궁 산개: 하늘로 쏘아 올린 화살이 정점에서 30발로 갈라져 쏟아진다. */
export const skyBurst: Cast = (b) => {
  const p = b.player;
  p.startAction('shoot', 0.35);
  const m0 = p.muzzle();
  const v0 = view(b);
  const apex = { x: p.x + p.facing * 60, y: v0.y + 50 };
  sfx.play('arrow', 1.4);
  arrowRain(b, m0.x, m0.y, apex.x, apex.y, 320, 0xffe08a, () => {
    b.fx.boom(apex.x, apex.y, 18, 'gold');
    b.fx.ring(apex.x, apex.y, 50, 0xffe08a, 300);
    flare(b, apex.x, apex.y, 60, PAL.sun, 420);
    rays(b, apex.x, apex.y, 18, 200, PAL.gold, 520);
    shockwave(b, apex.x, apex.y, 160, PAL.gold, 500, 1, 8);
    // 정점에서 터지는 빛: 금빛 사이로 분홍·민트 결이 꽃처럼 펼쳐진다.
    shockwave(b, apex.x, apex.y, 110, PAL.aurora, 440, 1, 5);
    wisps(b, apex.x, apex.y, PAL.sun, 9, 130, 620, { curl: 2.8, width: 7 });
    flutter(b, apex.x, apex.y, 'star', BURST_HUES, 24, { spread: 20, speed: 200, gravity: 110, life: 1200 });
    wash(b, 0xffd040, 0x1ad8a0, 0.14, 420);
    b.fx.circle(apex.x, apex.y, 0xffe08a, 70, 900, false, DEPTH.fx);
    const targets = onScreen(b);
    for (let i = 0; i < 30; i++) {
      later(b, i * 28, () => {
        const v = view(b);
        const m = targets.length && i < targets.length * 2 ? targets[i % targets.length] : null;
        const x = m && m.alive ? m.x + (Math.random() - 0.5) * 8 : v.x + 10 + Math.random() * (v.width - 20);
        const y = m && m.alive ? m.y : FLOOR_Y - 3;
        arrowRain(b, apex.x, apex.y, x, y, 260 + Math.random() * 120, BURST_HUES[i % BURST_HUES.length], () => {
          if (i % 2 === 0) flare(b, x, y, 18, [PAL.gold, PAL.rose, PAL.aurora][(i / 2) % 3], 200);
          if (i % 5 === 0) glow(b, x, FLOOR_Y, 60, [0xff3a5a, 0x1a8ad8, 0xffa020][(i / 5) % 3], 600, 0.5, 0.35);
          b.hitArea(x - 12, y - 16, 24, 32, b.skillBase({ dex: 2.2, str: 0.8 }), { knock: 20, quiet: i % 3 !== 0 });
        });
      });
    }
  });
};

/** 유성 화살: 가장 강한 적 셋을 쫓아가 폭발하는 빛나는 화살 */
export const meteorArrow: Cast = (b) => {
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
      // 세 화살은 금빛·장밋빛·청록빛 유성이다.
      const pal = [PAL.sun, PAL.rose, PAL.aurora][i];
      const arrow = b.add.image(m0.x, m0.y, 'fx-arrow').setScale(2).setDepth(DEPTH.projectile);
      let trail = 0;
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
          b.fx.burst(pt.x, pt.y, pal[1], 1, 20, 300);
          if (trail++ % 2 === 0) flutter(b, pt.x, pt.y, 'star', hues(pal), 1, { spread: 3, speed: 20, gravity: 30, life: 600 });
          if (trail % 5 === 0) glow(b, pt.x, pt.y, 30, pal[0], 240, 0.5);
        },
        onComplete: () => {
          arrow.destroy();
          sfx.play('boom', 0.7);
          b.fx.boom(tx, ty, 34, 'gold');
          b.fx.ring(tx, Math.min(ty + 10, FLOOR_Y), 60, 0xffe08a);
          impactBurst(b, tx, ty, 80, pal, Math.min(ty + 10, FLOOR_Y));
          column(b, tx, Math.min(ty + 10, FLOOR_Y), 30, 300, pal, 520);
          wisps(b, tx, ty, pal, 7, 110, 560, { curl: 2.8, width: 7 });
          flutter(b, tx, ty, 'star', hues(pal), 16, { spread: 16, speed: 240, gravity: 200, life: 1000 });
          afterglow(b, tx, FLOOR_Y, 150, pal, 'star', 1100);
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
      // 별이 많을수록 오로라 빛 물결과 별 부스러기가 크게 번진다.
      shockwave(b, m.x, FLOOR_Y, 40 + size * 14, PAL.aurora, 440, 0.3, 5);
      wisps(b, m.x, m.y, last ? PAL.aurora : PAL.sun, 4 + Math.round(size), 50 + size * 14, 560, { curl: 2.8, width: 4 + size * 0.6 });
      flutter(b, m.x, m.y, 'star', AURORA_HUES, 8 + Math.round(size * 3), { spread: 12, speed: 140 + size * 26, gravity: 160, life: 1000 });
      if (last) wash(b, 0x1ad8a0, 0xffd040, 0.2, 520);
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

/** 별사냥의 별빛: 금 · 민트 · 하늘 · 연보라 · 분홍 */
const AURORA_HUES = [0xffe08a, 0x7fffd0, 0x9fd8ff, 0xc8a0ff, 0xff9ad0];

export const aurora: Cast = (b) => {
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
  // 밤하늘에 오로라가 걸린다: 청록에서 보라로 흐르는 빛과, 천천히 내리는 별.
  wash(b, 0x1ad8a0, 0x8a3aff, 0.2, 900);
  wisps(b, p.x, p.y - 20, PAL.aurora, 8, 150, 800, { angle: -Math.PI / 2, cone: 1.2, curl: 2.4, width: 8 });
  let starfall = 0;
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
    b.fx.spark(m.x, m.body.top - 6, AURORA_HUES[e.hits % AURORA_HUES.length], 1, Math.PI / 4);
    flutter(b, m.x, m.body.top - 6, 'star', AURORA_HUES, 2 + Math.min(4, e.hits), { spread: 8, speed: 90, gravity: 80, life: 700 });
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
        starfall -= dt;
        if (starfall <= 0) {
          starfall = 0.12;
          const v = view(b);
          flutter(b, v.x + Math.random() * v.width, v.y + 10 + Math.random() * 60, 'star', AURORA_HUES, 1, { spread: 2, speed: 8, gravity: 22, sway: 6, life: 1800 });
        }
        const stars = [...marks.values()].reduce((a, e) => a + e.n, 0);
        timer.setPosition(b.cameras.main.width / 2, 74).setText(`별사냥 ${Math.max(0, STAR_TIME - t).toFixed(1)}초 · 별 ${stars}개`);
        if (t < STAR_TIME) return false;
        // 끝: 표식을 별자리로 잇고, 화살비가 쏟아진 뒤 적마다 큰 마법 화살이 꽂힌다.
        falling = true;
        b.hitHook = null;
        const live = [...marks.entries()].filter(([m, e]) => m.alive && e.n > 0).sort((a, c) => a[1].n - c[1].n);
        timer.setText(stars ? `별 ${stars}개` : '');
        const lines = b.add.graphics().setDepth(DEPTH.fx);
        for (let i = 1; i < live.length; i++) lines.lineStyle(1, AURORA_HUES[i % AURORA_HUES.length], 0.9).lineBetween(live[i - 1][0].x, live[i - 1][0].y, live[i][0].x, live[i][0].y);
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
                  arrowRain(b, ex + 20 + Math.random() * 90, v.y + 4 + Math.random() * 30, ex, FLOOR_Y - 3 - Math.random() * 30, 200 + Math.random() * 60, AURORA_HUES[(i + k) % AURORA_HUES.length], () => undefined);
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

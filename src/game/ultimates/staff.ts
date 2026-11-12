// 마법사의 상급·궁극 스킬

import { sfx } from '../../core/audio';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import type { Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { afterglow, column, flare, flutter, glow, hues, impactBurst, PAL, rays, shockwave, wash, wisps, type MoteKind, type Palette3 } from '../vfx';
import { CHAIN_RANGE, view, onScreen, later, skyCircles, ultText, type Cast } from './shared';

const BOLT_HUES = [0x9fe8ff, 0xc080ff, 0xfff07a, 0xff8ae0];
const BOLT_PALS = [PAL.arcane, PAL.violet, PAL.storm, PAL.rose];

/** 연쇄 번개: 번개가 최대 10마리를 잇따라 꿰뚫는다. */
export const chainLightning: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 0.5);
  const m0 = p.muzzle();
  b.fx.circle(m0.x, m0.y, 0x9fe8ff, 40, 500, true, DEPTH.fx);
  wisps(b, m0.x, m0.y, PAL.storm, 6, 80, 480, { curl: 3.2, width: 5 });
  glow(b, m0.x, m0.y, 90, 0x9a3aff, 420, 0.6);
  wash(b, 0x4a5aff, 0x9a3aff, 0.14, 420);
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
      // 번개는 튈 때마다 하늘색 → 보라 → 노랑 → 분홍으로 빛깔이 바뀐다.
      const hue = BOLT_HUES[hop % BOLT_HUES.length];
      b.fx.lightning(a.x, a.y, next.x, next.y, hue, 3, 240);
      b.fx.lightning(a.x, a.y - 4, next.x, next.y + 4, BOLT_HUES[(hop + 1) % BOLT_HUES.length], 1, 200);
      b.fx.lightning(a.x, a.y + 5, next.x, next.y - 3, 0xffffff, 1, 140);
      b.fx.spark(next.x, next.y, 0xdff8ff, 2);
      flare(b, next.x, next.y, 30, BOLT_PALS[hop % BOLT_PALS.length], 260);
      rays(b, next.x, next.y, 8, 70, BOLT_PALS[(hop + 1) % BOLT_PALS.length], 260);
      b.fx.lightning(next.x + (Math.random() - 0.5) * 20, next.y - 120 - Math.random() * 40, next.x, next.y, hue, 2, 200);
      flutter(b, next.x, next.y, 'star', BOLT_HUES, 5, { spread: 8, speed: 150, gravity: 200, life: 600 });
      glow(b, next.x, FLOOR_Y, 70, hue, 520, 0.5, 0.35);
      sfx.play('magic', 1.5);
      if (next.alive) b.hitMonster(next, b.skillBase({ int: 6 }), { knock: 30, stun: 0.3 });
    });
    from = { x: next.x, y: next.y };
  }
};

/** 눈보라의 빛깔: 하양 · 얼음빛 · 연보라 · 민트 */
const SNOW_HUES = [0xffffff, 0x9ff0ff, 0xc8b0ff, 0xb8ffe8];

/** 블리자드: 4초 동안 화면 전체에 눈보라가 몰아친다. */
export const blizzard: Cast = (b) => {
  const p = b.player;
  p.startAction('cast', 0.5);
  b.fx.dim(0x0a2848, 0.35, 4200);
  skyCircles(b, 0xbff0ff, 4000);
  // 눈보라가 시작되면 하늘이 연보라에서 얼음빛으로 물든다.
  wash(b, 0x6a4aff, 0x7fd8ff, 0.24, 700);
  wisps(b, p.x, p.y - 10, PAL.frost, 10, 160, 760, { curl: 3, width: 8 });
  flutter(b, p.x, p.y - 10, 'snow', SNOW_HUES, 24, { spread: 30, speed: 220, gravity: 40, life: 1200 });
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
      // 큰 눈 결정과, 비스듬히 몰아치는 바람결 (얼음빛·연보라·민트)
      flutter(b, v.x + Math.random() * (v.width + 100), v.y + Math.random() * 40, 'snow', SNOW_HUES, 2, { spread: 6, speed: 150, angle: 2.5, cone: 0.25, gravity: 120, sway: 10, life: 1500 });
      const gust = b.fx.streak(v.x + Math.random() * (v.width + 160), v.y + Math.random() * (FLOOR_Y - v.y - 20), 2.52, 50 + Math.random() * 70, SNOW_HUES[Math.floor(Math.random() * SNOW_HUES.length)], 0, Math.random() < 0.3 ? 2 : 1).setAlpha(0.7);
      b.tweens.add({ targets: gust, x: gust.x - 130, y: gust.y + 92, alpha: 0, duration: 420, onComplete: () => gust.destroy() });
    },
  });
  for (let k = 0; k < 10; k++) {
    later(b, 300 + k * 400, () => {
      for (const m of onScreen(b)) {
        b.hitMonster(m, b.skillBase({ int: 0.8 }), { quiet: true, slow: [0.6, 1] });
        b.fx.burst(m.x, m.y, 0xdff8ff, 3, 50, 300);
        // 적마다 서리가 터진다: 얼음빛 섬광과 눈 결정
        flare(b, m.x, m.y, 20, k % 2 ? PAL.violet : PAL.frost, 240);
        flutter(b, m.x, m.y, 'snow', SNOW_HUES, 4, { spread: 10, speed: 110, gravity: 90, life: 800 });
        if (k % 2 === 0) b.fx.iceSpike(m.x + (Math.random() - 0.5) * 16, FLOOR_Y, 1 + Math.random() * 0.5, 420);
      }
      const v = view(b);
      for (let i = 0; i < 6; i++) b.fx.iceSpike(v.x + Math.random() * v.width, FLOOR_Y, 0.7 + Math.random() * 0.8, 350, i * 60);
      // 돌풍: 화면 여기저기서 냉기가 소용돌이치고 땅에 서리빛이 깔린다.
      for (let i = 0; i < 2; i++) {
        const gx = v.x + Math.random() * v.width;
        const pal = (k + i) % 3 === 0 ? PAL.violet : (k + i) % 3 === 1 ? PAL.frost : PAL.aurora;
        shockwave(b, gx, FLOOR_Y, 150 + Math.random() * 60, pal, 600);
        wisps(b, gx, FLOOR_Y - 30 - Math.random() * 80, pal, 4, 120, 620, { angle: Math.PI, cone: 0.7, curl: 3.2, width: 7 });
        glow(b, gx, FLOOR_Y, 150, pal[0], 900, 0.5, 0.3);
        column(b, gx, FLOOR_Y, 16, 150 + Math.random() * 100, pal, 520);
      }
      if (k % 3 === 0) wash(b, 0x6a4aff, 0x7fd8ff, 0.14, 420);
    });
  }
  later(b, 4300, () => {
    snow.remove();
    // 눈보라가 걷히며 얼어붙은 것들이 한꺼번에 부서진다.
    const v = view(b);
    b.fx.flashScreen(0xdff8ff, 0.3, 260);
    b.fx.shake(1.2, 220);
    shockwave(b, v.centerX, FLOOR_Y, v.width * 0.7, PAL.frost, 800, 0.25, 12);
    shockwave(b, v.centerX, FLOOR_Y, v.width * 0.45, PAL.violet, 700, 0.25, 7);
    wash(b, 0x8a6aff, 0xb8ffe8, 0.24, 600);
    for (const m of onScreen(b)) {
      impactBurst(b, m.x, m.y, 40, PAL.frost, FLOOR_Y);
      flutter(b, m.x, m.y, 'snow', SNOW_HUES, 8, { spread: 10, speed: 200, gravity: 140, life: 1000 });
    }
    flutter(b, v.centerX, v.y + 40, 'snow', SNOW_HUES, 40, { spread: v.width / 2, spreadY: 40, speed: 30, gravity: 60, sway: 16, life: 2000, within: 400 });
    afterglow(b, v.centerX, FLOOR_Y, v.width * 0.8, PAL.frost, 'snow', 1500);
  });
};

/** 운석 하나가 x에 떨어진다. */
function meteorAt(b: BattleScene, x: number, damage: number, loud: boolean, el: RuneElement = 'fire'): void {
  const v = view(b);
  const look = METEOR_LOOK[el];
  const rock = b.add.sprite(x - 100, v.y - 30, 'fx-meteor').play('fx-meteor').setDepth(DEPTH.projectile).setOrigin(26 / 40, 26 / 40);
  // 운석은 그 룬의 원소 빛을 띤다 (불은 그대로, 얼음은 푸르게, 번개는 노랗게).
  if (look.tint !== undefined) rock.setTint(look.tint);
  let trail = 0;
  b.tweens.add({
    targets: rock,
    x,
    y: FLOOR_Y - 14,
    duration: 380,
    ease: 'Quad.In',
    onUpdate: () => {
      b.fx.burst(rock.x - 4, rock.y - 4, look.pal[1], 1, 30, 240);
      if (trail++ % 2 === 0) flutter(b, rock.x - 6, rock.y - 6, look.mote, hues(look.pal), 1, { spread: 4, speed: 40, angle: -2.4, cone: 0.5, gravity: -20, life: 460 });
    },
    onComplete: () => {
      rock.destroy();
      sfx.play('boom', 0.6);
      b.fx.boom(x, FLOOR_Y - 20, 34, look.boom);
      b.fx.ring(x, FLOOR_Y, 60, look.pal[0]);
      impactBurst(b, x, FLOOR_Y - 26, 70, look.pal, FLOOR_Y);
      column(b, x, FLOOR_Y, 26, 260, look.pal, 460);
      wisps(b, x, FLOOR_Y - 10, look.pal, 5, 100, 500, { angle: -Math.PI / 2, cone: 1.3, curl: 2.6, width: 7 });
      flutter(b, x, FLOOR_Y - 16, look.mote, hues(look.pal), 8, { spread: 16, spreadY: 8, speed: 200, cone: 1.0, gravity: 160, life: 800 });
      afterglow(b, x, FLOOR_Y, 110, look.pal, look.mote, 900);
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

/** 원소별 운석 생김새 */
const METEOR_LOOK: Record<RuneElement, { pal: Palette3; mote: MoteKind; boom: 'fire' | 'frost' | 'gold'; tint?: number }> = {
  fire: { pal: PAL.flame, mote: 'flame', boom: 'fire' },
  ice: { pal: PAL.frost, mote: 'snow', boom: 'frost', tint: 0x8fd0ff },
  bolt: { pal: PAL.storm, mote: 'star', boom: 'gold', tint: 0xfff07a },
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
        column(b, m.x, FLOOR_Y, 34, 300, i % 2 ? PAL.sun : PAL.flame, 520);
        b.fx.boom(m.x, FLOOR_Y - 30, 30, 'fire');
        wisps(b, m.x, FLOOR_Y - 10, PAL.flame, 5, 130, 560, { angle: -Math.PI / 2, cone: 0.8, curl: 2.4, width: 8 });
        flutter(b, m.x, FLOOR_Y - 30, 'flame', hues(PAL.flame), 10, { spread: 14, spreadY: 30, speed: 130, cone: 0.6, gravity: -130, life: 900 });
        if (i === 0) wash(b, 0xd0186a, 0xff7a1a, 0.18, 420);
        if (m.alive) b.hitMonster(m, b.skillBase({ int: 7.5 * stage }), { knock: 60, quiet: i > 0 });
      }),
    );
  } else if (el === 'ice') {
    // 얼음 감옥: 적을 얼음 가시로 가두고 잠깐 멈춘다.
    b.announce('원소 조합 · 얼음 감옥!', 0.9);
    sfx.play('magic', 1.2);
    wash(b, 0x6a4aff, 0x7fd8ff, 0.22, 460);
    foes.forEach((m, i) => {
      for (let k = -1; k <= 1; k++) b.fx.iceSpike(m.x + k * 12, FLOOR_Y, 1 + (k === 0 ? 0.4 : 0), 900, i * 30 + Math.abs(k) * 40);
      impactBurst(b, m.x, m.y, 44, i % 2 ? PAL.violet : PAL.frost, FLOOR_Y);
      flutter(b, m.x, m.y - 10, 'snow', SNOW_HUES, 10, { spread: 16, speed: 150, gravity: 70, life: 1100 });
      glow(b, m.x, FLOOR_Y, 80, 0x6a4aff, 1100, 0.55, 0.35);
      if (m.alive) b.hitMonster(m, b.skillBase({ int: 6 * stage }), { stun: 1.5, quiet: i > 0 });
    });
  } else {
    // 연쇄 번개: 하늘에서 내려와 적에서 적으로 튄다.
    b.announce('원소 조합 · 연쇄 번개!', 0.9);
    let from = { x: v.centerX, y: v.y };
    foes.slice(0, 12).forEach((m, i) => {
      const a = from;
      later(b, i * 60, () => {
        b.fx.lightning(a.x, a.y, m.x, m.y, 0xfff07a, 3, 240);
        b.fx.lightning(a.x, a.y - 4, m.x, m.y + 4, i % 2 ? 0xc080ff : 0x9fe8ff, 1, 200);
        b.fx.spark(m.x, m.y, 0xffffff, 2);
        flare(b, m.x, m.y, 30, i % 2 ? PAL.violet : PAL.storm, 260);
        rays(b, m.x, m.y, 8, 70, PAL.storm, 280);
        flutter(b, m.x, m.y, 'star', BOLT_HUES, 5, { spread: 8, speed: 150, gravity: 200, life: 600 });
        glow(b, m.x, FLOOR_Y, 70, 0x9a3aff, 520, 0.5, 0.35);
        sfx.play('magic', 1.4);
        if (m.alive) b.hitMonster(m, b.skillBase({ int: 7 * stage }), { knock: 30, quiet: i > 0 });
      });
      from = { x: m.x, y: m.y };
    });
  }
}

export const armageddon: Cast = (b) => {
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
            wisps(b, rune.x, rune.y, METEOR_LOOK[el].pal, 4, 60, 420, { angle: -Math.PI / 2, cone: 1.2, curl: 3, width: 5 });
            flutter(b, rune.x, rune.y, METEOR_LOOK[el].mote, hues(METEOR_LOOK[el].pal), 6, { spread: 8, speed: 110, life: 700 });
            glow(b, rune.x, rune.y, 50, ELEMENT[el].color, 320, 0.6);
            sfx.play('magic', 0.8 + count * 0.04);
            const meteors = Math.min(3, stage);
            const v = view(b);
            for (let i = 0; i < meteors; i++) {
              const targets = onScreen(b);
              const m = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
              later(b, i * 90, () => meteorAt(b, m ? m.x + (Math.random() - 0.5) * 30 : v.x + 40 + Math.random() * (v.width - 80), b.skillBase({ int: RUNE_METEOR_INT * count }), i === 0, el));
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
      // 대폭발: 불·금·다홍·보라·해돋이 빛이 차례로 터지고, 온 하늘이 자홍에서 주황으로 탄다.
      const pals = [PAL.flame, PAL.gold, PAL.crimson, PAL.violet, PAL.sun];
      for (let i = 0; i < 5; i++) {
        const x = v.x + (v.width * (i + 0.5)) / 5;
        later(b, i * 60, () => {
          impactBurst(b, x, FLOOR_Y - 60, 80 + count * 6, pals[i], FLOOR_Y);
          column(b, x, FLOOR_Y, 30 + count * 2, 300, pals[i], 700);
          wisps(b, x, FLOOR_Y - 20, pals[i], 6, 140 + count * 6, 720, { angle: -Math.PI / 2, cone: 1.3, curl: 2.6, width: 9 });
          flutter(b, x, FLOOR_Y - 30, 'flame', hues(pals[i]), 12, { spread: 30, spreadY: 14, speed: 260, cone: 1.1, gravity: 120, life: 1200 });
        });
      }
      shockwave(b, v.centerX, FLOOR_Y, v.width, PAL.flame, 900, 0.25, 14);
      shockwave(b, v.centerX, FLOOR_Y, v.width * 0.7, PAL.violet, 800, 0.25, 9);
      wash(b, 0xd0186a, 0xff8a1a, 0.34, 800);
      afterglow(b, v.centerX, FLOOR_Y, v.width * 0.9, PAL.flame, 'flame', 1800);
      for (const m of onScreen(b)) b.hitMonster(m, b.skillBase({ int: power }), { knock: 200 });
      cleanup();
      return true;
    },
  };
};

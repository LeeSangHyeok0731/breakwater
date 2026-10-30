import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { DEPTH } from '../fx';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';

/**
 * 침묵의 기사단장 (근접 군단장). 몸만 한 대검을 느리게 치켜들었다가 순식간에 내리친다.
 * 대검은 따로 그린 그림을 손에 붙여 각도로 움직인다 (0 = 칼끝이 위, +는 앞쪽으로 숙임).
 *
 * 일반 패턴: 내려찍기, 횡베기, 돌진 찌르기, 도약 내려찍기.
 * 보라색 패턴: 땅을 가르는 검기, 칼을 꽂아 솟게 하는 낙인 기둥. 맞으면 침묵 + 침묵 스택.
 * 체력 50% 아래: 더 빨라지고, 횡베기 뒤에 보라 내려찍기가 이어지며, 검기를 양쪽으로 쏜다.
 */

export const PURPLE = 0xb04aff;
const PURPLE_HI = 0xe0a8ff;
const SWORD_KEY = 'knight-greatsword';

/** 대검을 쥔 손의 위치 (발끝 기준, 오른쪽을 볼 때) */
const HAND = { x: 10, y: -50 };
/** 대검을 머리 위로 치켜들 때 손이 올라가는 높이 */
const LIFT_Y = 40;
/** 칼을 어깨에 걸친 기본 각도 */
const REST = -0.55;

type Pattern = 'slam' | 'sweep' | 'thrust' | 'leap' | 'wave' | 'brand';

interface KnightState {
  pattern: Pattern | null;
  /** 패턴 시작 뒤 흐른 시간 (속도 배율을 반영한 '기준 초') */
  t: number;
  fired: Set<number>;
  dir: 1 | -1;
  from: number;
  to: number;
  last: Pattern | null;
  ghost: number;
  sword: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  /** 지금 대검 각도와 목표로 가는 중인 각도 */
  angle: number;
  /** 대검에 보라 기운이 서려 있다 */
  charged: boolean;
  /** 몸을 숙이거나 젖힌 정도 (스프라이트 회전) */
  lean: number;
  /** 방금 휘둘렀다: 잔상을 남긴다 */
  swinging: number;
  /** 손을 머리 위로 든 정도 0..1 */
  lift: number;
}

const states = new WeakMap<Monster, KnightState>();

/** 대검 그림: 검은 강철 칼날, 가운데 보라 룬, 보석 박힌 가드. 칼끝이 위. */
function makeSword(scene: Phaser.Scene): void {
  if (scene.textures.exists(SWORD_KEY)) return;
  const W = 16;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, color: string): void => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  // 칼날 (위가 칼끝)
  for (let y = 0; y < 46; y++) {
    const half = y < 7 ? Math.ceil((y + 1) / 2) : 4;
    const x0 = 8 - half;
    px(x0 - 1, y, half * 2 + 2, 1, '#120c18');
    px(x0, y, half * 2, 1, '#5e5c6e');
    px(x0, y, 1, 1, '#c8ccd8');
    px(x0 + 1, y, 1, 1, '#9a9cac');
    px(x0 + half * 2 - 1, y, 1, 1, '#32303e');
  }
  // 가운데 홈과 룬
  px(7, 6, 2, 38, '#2a1a40');
  for (let y = 9; y < 42; y += 6) {
    px(7, y, 2, 2, '#b04aff');
    px(7, y, 1, 1, '#f0d0ff');
  }
  // 가드
  px(0, 46, 16, 5, '#120c18');
  px(1, 47, 14, 3, '#3a3846');
  px(1, 47, 14, 1, '#6a6878');
  px(6, 46, 4, 5, '#120c18');
  px(7, 47, 2, 3, '#c060ff');
  px(7, 47, 1, 1, '#ffffff');
  // 손잡이
  px(6, 51, 4, 9, '#120c18');
  px(7, 51, 2, 9, '#4a2a1a');
  for (let y = 52; y < 60; y += 2) px(7, y, 2, 1, '#7a4a2a');
  // 폼멜
  px(5, 60, 6, 4, '#120c18');
  px(6, 60, 4, 3, '#3a3846');
  px(7, 61, 2, 1, '#c060ff');
  scene.textures.addCanvas(SWORD_KEY, c);
}

/** 보라색 공격: 맞으면 피해에 더해 침묵과 침묵 스택 */
export function purpleHit(m: Monster, x: number, y: number, w: number, h: number, damage: number): boolean {
  const b = m.scene;
  const pb = b.player.body;
  if (!Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(x, y, w, h), new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) return false;
  const before = b.player.hp;
  b.damagePlayer(damage, { x: m.x, monster: m, melee: false });
  if (b.player.hp < before) {
    b.silencePlayer();
    return true;
  }
  return false;
}

/** 앞쪽 지면 범위 공격 (바닥에서 h 높이까지). near~far는 몸 중심에서 앞쪽 거리 */
function frontHit(m: Monster, dir: 1 | -1, near: number, far: number, h: number, damage: number, purple = false): void {
  const x = dir === 1 ? m.x + near : m.x - far;
  const w = far - near;
  if (purple) purpleHit(m, x, FLOOR_Y - h, w, h, damage);
  else m.scene.areaHit(x, FLOOR_Y - h, w, h, damage, m, false);
}

function once(st: KnightState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

/** 0..1 구간 위치 */
function span(t: number, a: number, b: number): number {
  return Phaser.Math.Clamp((t - a) / (b - a), 0, 1);
}

const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3);
const easeIn = (k: number): number => k * k * k;

function choose(m: Monster, st: KnightState, dist: number): Pattern {
  const far: Pattern[] = ['thrust', 'wave', 'leap', 'brand', 'wave'];
  const near: Pattern[] = ['slam', 'sweep', 'slam', 'brand', 'leap'];
  const pool = (dist > 230 ? far : near).filter((p) => p !== st.last);
  if (m.phase2) pool.push('wave', 'brand', 'sweep');
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 대검이 내리꽂힌 자리: 균열, 파편, 흙먼지, 화면 흔들림, 히트스톱 */
function impact(m: Monster, x: number, purple: boolean, power = 1): void {
  const b = m.scene;
  b.fx.stop(0.1 * power);
  b.fx.shake(1.4 * power, 260);
  b.fx.boom(x, FLOOR_Y - 8, 30 * power, purple ? 'arcane' : 'dark');
  b.fx.burst(x, FLOOR_Y - 4, 0x8a7a68, 18, 180, 520, 2, 600);
  b.fx.burst(x, FLOOR_Y - 4, purple ? PURPLE_HI : 0xfff0d0, 10, 240, 260);
  b.fx.smoke(x - 20, FLOOR_Y - 6, 1.6, 0x6a6058, -20);
  b.fx.smoke(x + 20, FLOOR_Y - 6, 1.6, 0x6a6058, -20);
  b.fx.ring(x, FLOOR_Y, 70 * power, purple ? PURPLE : 0xffa040, 360);
  // 바닥 균열 (잠시 남는다)
  const crack = b.add.graphics().setDepth(DEPTH.fx - 2);
  crack.lineStyle(2, purple ? 0x8a3ad8 : 0x1a1210, 1);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i / 4) * Math.PI;
    const len = 26 + Math.random() * 30;
    crack.lineBetween(x, FLOOR_Y + 1, x + Math.cos(a) * len, FLOOR_Y + 1 + Math.abs(Math.sin(a)) * 3);
  }
  b.tweens.add({ targets: crack, alpha: 0, delay: 900, duration: 600, onComplete: () => crack.destroy() });
  sfx.play('boom', 0.6 + 0.3 * power);
}

/** 땅을 타고 미끄러지는 보라 검기: 점프로 넘는다. */
function groundWave(m: Monster, dir: 1 | -1, x0: number, delay = 0): void {
  const b = m.scene;
  const W = b.level.width;
  b.time.delayedCall(delay * 1000, () => {
    if (!m.alive) return;
    const h = 34;
    const obj = b.add.rectangle(x0, FLOOR_Y - h / 2, 18, h, PURPLE, 0.8).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    const core = b.add.rectangle(x0, FLOOR_Y - h / 2, 6, h + 8, PURPLE_HI, 0.95).setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
    const end = dir === 1 ? W + 30 : -30;
    let hit = false;
    let trail = 0;
    sfx.play('slash', 0.7);
    b.tweens.add({
      targets: [obj, core],
      x: end,
      duration: (Math.abs(end - x0) / 340) * 1000,
      onUpdate: () => {
        if ((trail = (trail + 1) % 2) === 0) b.fx.burst(obj.x, FLOOR_Y - 6, PURPLE, 2, 50, 320);
        if (!hit) hit = purpleHit(m, obj.x - 9, FLOOR_Y - h, 18, h, m.damage * 0.8);
      },
      onComplete: () => {
        obj.destroy();
        core.destroy();
      },
    });
  });
}

function begin(m: Monster, st: KnightState, pattern: Pattern): void {
  const b = m.scene;
  const p = b.player;
  const W = b.level.width;
  const pace = b.legionPace(m);
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  st.dir = p.x >= m.x ? 1 : -1;
  m.face(st.dir);
  m.body.setVelocityX(0);
  m.play(m.look.idle);
  switch (pattern) {
    case 'thrust': {
      // 칼끝을 앞으로 겨누고 플레이어를 지나 반대쪽까지 돌진한다.
      st.from = m.x;
      st.to = Phaser.Math.Clamp(p.x + st.dir * 150, 60, W - 60);
      const x0 = Math.min(st.from, st.to);
      b.addTelegraph(x0, FLOOR_Y - 90, Math.abs(st.to - st.from), 90, 0.85 * pace, m, null);
      break;
    }
    case 'leap':
      st.from = m.x;
      st.to = Phaser.Math.Clamp(p.x, 60, W - 60);
      break;
    case 'slam':
      // 내려찍을 자리를 미리 붉게 표시한다.
      b.addTelegraph(st.dir === 1 ? m.x + 20 : m.x - 170, FLOOR_Y - 110, 150, 110, 0.95 * pace, m, null);
      break;
    case 'brand': {
      const n = m.phase2 ? 5 : 3;
      const xs = [p.x];
      for (let i = 1; i < n; i++) xs.push(Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (90 + Math.random() * 40), 30, W - 30));
      // 칼을 꽂는 순간(0.7초)부터 기둥이 차례로 솟는다.
      const delay = 0.7 * pace + 1.0 * pace + b.legionWarnBonus();
      xs.forEach((x, i) => {
        b.addTelegraph(
          x - 22,
          FLOOR_Y - 170,
          44,
          170,
          delay + i * 0.14,
          m,
          () => {
            b.fx.pillar(x, FLOOR_Y, PURPLE, 180, 560);
            b.fx.burst(x, FLOOR_Y - 20, PURPLE_HI, 12, 160, 420);
            b.fx.ring(x, FLOOR_Y, 44, PURPLE);
            b.fx.shake(0.5, 100);
            sfx.play('magic', 0.7);
            purpleHit(m, x - 22, FLOOR_Y - 170, 44, 170, m.damage * 0.9);
          },
          PURPLE,
        );
      });
      break;
    }
  }
}

/** 대검 위치·각도·잔상을 매 프레임 맞춘다. */
function syncSword(m: Monster, st: KnightState, dt: number): void {
  const s = m.sprite;
  const f = m.facing;
  st.sword.setVisible(m.alive && s.visible);
  st.glow.setVisible(m.alive && st.charged);
  if (!m.alive) return;
  // 몸을 숙이거나 젖히면 손도 따라 움직인다.
  s.setRotation(st.lean * f);
  const hx = s.x + f * (HAND.x - st.lift * 8 + st.lean * 30);
  const hy = s.y + HAND.y - st.lift * LIFT_Y + Math.abs(st.lean) * 8;
  st.sword.setPosition(hx, hy).setRotation(st.angle * f).setFlipX(f === -1);
  st.glow.setPosition(hx, hy).setRotation(st.angle * f).setFlipX(f === -1);
  if (st.charged) {
    st.glow.setAlpha(0.45 + Math.sin(m.scene.time.now * 0.02) * 0.25);
    if (Math.random() < 0.4) {
      const len = 40 + Math.random() * 60;
      m.scene.fx.burst(hx + Math.sin(st.angle * f) * len, hy - Math.cos(st.angle) * len, PURPLE, 1, 40, 300);
    }
  }
  // 휘두르는 중에는 대검 잔상을 남긴다.
  st.swinging = Math.max(0, st.swinging - dt);
  if (st.swinging > 0) {
    const g = m.scene.add
      .image(hx, hy, SWORD_KEY)
      .setOrigin(0.5, 53 / 64)
      .setScale(2)
      .setRotation(st.angle * f)
      .setFlipX(f === -1)
      .setDepth(DEPTH.monster)
      .setTint(st.charged ? PURPLE : 0xffffff)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    m.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }
}

/** a → b 각도로 가는 휘두르기 (k: 0..1) */
function swingTo(st: KnightState, a: number, b: number, k: number, ease: (k: number) => number = easeIn): void {
  st.angle = a + (b - a) * ease(k);
}

export const silentKnight: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  let st = states.get(m);
  if (!st) {
    makeSword(b);
    const sword = b.add.image(m.x, m.y, SWORD_KEY).setOrigin(0.5, 53 / 64).setScale(2).setDepth(DEPTH.monster + 1);
    const glow = b.add
      .image(m.x, m.y, SWORD_KEY)
      .setOrigin(0.5, 53 / 64)
      .setScale(2.3)
      .setDepth(DEPTH.monster)
      .setTint(PURPLE)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    st = { pattern: null, t: 0, fired: new Set(), dir: -1, from: 0, to: 0, last: null, ghost: 0, sword, glow, angle: REST, charged: false, lean: 0, swinging: 0, lift: 0 };
    states.set(m, st);
    // 쓰러지면 대검도 함께 사라진다.
    const hide = (): void => {
      if (m.alive) return;
      b.tweens.add({ targets: [sword, glow], alpha: 0, duration: 400 });
      b.events.off('postupdate', hide);
    };
    b.events.on('postupdate', hide);
    b.events.once('shutdown', () => {
      b.events.off('postupdate', hide);
      sword.destroy();
      glow.destroy();
    });
    m.attackTimer = 1.8;
  }
  if (!m.phase2 && m.hp / m.maxHp < 0.5) {
    m.phase2 = true;
    b.announce('침묵의 기사단장이 분노한다!');
    b.fx.flashScreen(PURPLE, 0.3, 300);
    b.fx.shake(1, 300);
  }
  const pace = b.legionPace(m);
  const body = m.body;
  const f = st.dir;
  let done = false;

  if (!st.pattern) {
    // 대검을 어깨에 걸친 채 묵직하게 걸어온다.
    const dx = p.x - m.x;
    m.face(dx);
    st.dir = dx >= 0 ? 1 : -1;
    st.charged = false;
    st.lean += (0 - st.lean) * Math.min(1, dt * 8);
    st.lift += (0 - st.lift) * Math.min(1, dt * 8);
    st.angle += (REST + Math.sin(b.time.now * 0.004) * 0.05 - st.angle) * Math.min(1, dt * 6);
    if (Math.abs(dx) > 120) {
      body.setVelocityX(Math.sign(dx) * m.speed * 0.6);
      m.play(m.look.walk);
    } else {
      body.setVelocityX(0);
      m.play(m.look.idle);
    }
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) begin(m, st, choose(m, st, Math.abs(dx)));
    syncSword(m, st, dt);
    return;
  }

  st.t += dt / pace;
  const t = st.t;
  switch (st.pattern) {
    case 'slam': {
      // 예비 동작 0.95초: 대검을 등 뒤로 높이 치켜들고 몸을 젖힌다 → 순식간에 내리찍는다.
      body.setVelocityX(0);
      const purple = m.phase2 && st.fired.has(90);
      if (t < 0.95) {
        const k = span(t, 0, 0.8);
        swingTo(st, REST, -1.75, k, easeOut);
        st.lift = easeOut(k);
        st.lean = -0.12 * k;
        // 치켜든 칼끝이 번쩍인다.
        if (once(st, 1, 0.75)) b.fx.spark(st.sword.x - f * 100, st.sword.y - 6, 0xffffff, 2, Math.PI / 4);
        if (t > 0.8) st.angle = -1.75 + Math.sin(t * 90) * 0.03;
        break;
      }
      if (t < 1.07) {
        const k = span(t, 0.95, 1.07);
        swingTo(st, -1.75, 1.75, k);
        st.lift = 1 - k;
        st.lean = 0.16 * k;
        st.swinging = 0.12;
        break;
      }
      if (once(st, 2, 1.07)) {
        st.angle = 1.75;
        st.lift = 0;
        const x = m.x + f * 90;
        body.setVelocityX(f * 60);
        b.fx.slash(m.x + f * 50, FLOOR_Y - 60, f, 90, purple ? PURPLE : 0xdfe6ff, true, { up: false });
        impact(m, x, purple, 1.2);
        frontHit(m, f, 15, 175, 110, m.damage * 1.3, purple);
        if (purple) {
          groundWave(m, f, x);
          groundWave(m, (-f) as 1 | -1, x);
        }
      }
      // 후딜: 땅에 박힌 칼을 뽑아 올린다 (반격할 틈)
      if (t > 1.75) swingTo(st, 1.75, REST, span(t, 1.75, 2.25), easeOut);
      st.lean = 0.16 * (1 - span(t, 1.75, 2.25));
      if (t > 2.3) done = true;
      break;
    }
    case 'sweep': {
      // 칼을 뒤로 낮게 끌었다가 앞을 크게 가로로 벤다. 구르기로 피해야 한다.
      body.setVelocityX(0);
      if (t < 0.75) {
        swingTo(st, REST, -2.1, span(t, 0, 0.6), easeOut);
        st.lean = -0.08;
        if (once(st, 1, 0.55)) b.fx.spark(m.x - f * 40, FLOOR_Y - 50, 0xffffff, 2, Math.PI / 4);
        if (once(st, 5, 0)) b.addTelegraph(f === 1 ? m.x - 40 : m.x - 170, FLOOR_Y - 90, 210, 90, 0.75 * pace, m, null);
        break;
      }
      if (t < 0.9) {
        swingTo(st, -2.1, 2.4, span(t, 0.75, 0.9));
        st.lean = 0.12;
        st.swinging = 0.12;
        body.setVelocityX(f * 220);
        break;
      }
      if (once(st, 2, 0.9)) {
        body.setVelocityX(0);
        b.fx.slash(m.x + f * 40, FLOOR_Y - 45, f, 100, 0xdfe6ff, true, { squash: 0.5 });
        b.fx.stop(0.08);
        b.fx.shake(0.9, 160);
        sfx.play('slash', 0.8);
        frontHit(m, f, -40, 170, 90, m.damage * 1.1);
      }
      if (t > 1.3) swingTo(st, 2.4, REST, span(t, 1.3, 1.7), easeOut);
      st.lean = 0.12 * (1 - span(t, 1.3, 1.7));
      // 2단계: 그대로 보라 내려찍기로 잇는다.
      if (m.phase2 && t > 1.7 && !st.fired.has(90)) {
        st.fired.clear();
        st.fired.add(90);
        st.pattern = 'slam';
        st.t = 0.3;
        st.charged = true;
        b.addTelegraph(f === 1 ? m.x + 20 : m.x - 170, FLOOR_Y - 110, 150, 110, 0.65 * pace, m, null, PURPLE);
        break;
      }
      if (t > 1.8) done = true;
      break;
    }
    case 'thrust': {
      // 칼끝을 앞으로 겨누고 기를 모았다가 돌진, 끝에서 올려벤다.
      if (t < 0.85) {
        body.setVelocityX(0);
        swingTo(st, REST, 1.45, span(t, 0, 0.5), easeOut);
        st.lean = 0.1;
        if (Math.random() < 0.3) b.fx.burst(m.x - f * 14, FLOOR_Y - 6, 0x9a8a70, 1, 50, 300);
        break;
      }
      if (once(st, 0, 0.85)) sfx.play('slash', 1.2);
      const reached = f === 1 ? m.x >= st.to : m.x <= st.to;
      if (!reached && t < 1.9 && !st.fired.has(1)) {
        st.angle = 1.45;
        st.lean = 0.18;
        body.setVelocityX(f * 600);
        b.areaHit(body.x - 6, FLOOR_Y - 100, body.width + 12, 100, m.damage * 1.2, m, false);
        st.ghost -= dt;
        if (st.ghost <= 0) {
          st.ghost = 0.035;
          const s = m.sprite;
          const g = b.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setScale(s.scaleX).setRotation(s.rotation);
          g.setDepth(DEPTH.monster - 1).setTint(PURPLE).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
          b.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => g.destroy() });
        }
        break;
      }
      if (once(st, 1, 0)) {
        st.t = 1.9;
        body.setVelocityX(f * 80);
      }
      // 올려베기
      if (st.t < 2.05) {
        swingTo(st, 1.45, -1.3, span(st.t, 1.9, 2.05));
        st.swinging = 0.1;
        st.lean = -0.1;
        break;
      }
      if (once(st, 2, 2.05)) {
        body.setVelocityX(0);
        b.fx.slash(m.x + f * 40, FLOOR_Y - 60, f, 80, 0xdfe6ff, true, { up: true });
        b.fx.shake(0.8, 140);
        sfx.play('slash', 0.9);
        frontHit(m, f, -10, 120, 130, m.damage * 1.0);
      }
      if (st.t > 2.45) swingTo(st, -1.3, REST, span(st.t, 2.45, 2.8), easeOut);
      st.lean = -0.1 * (1 - span(st.t, 2.45, 2.8));
      if (st.t > 2.85) done = true;
      break;
    }
    case 'leap': {
      // 웅크림 → 대검을 치켜든 채 높이 뛰어 → 착지하며 내리찍기 + 양옆 충격파
      if (t < 0.45) {
        body.setVelocityX(0);
        st.lean = 0.1 * span(t, 0, 0.45);
        swingTo(st, REST, -1.75, span(t, 0, 0.45), easeOut);
        st.lift = span(t, 0, 0.45);
        if (once(st, 0, 0)) b.fx.circle(st.to, FLOOR_Y - 1, 0xff3a2a, 120, 1300 * pace, false, DEPTH.fx - 2);
        break;
      }
      if (t < 1.25) {
        const k = (t - 0.45) / 0.8;
        const x = st.from + (st.to - st.from) * k;
        const y = FLOOR_Y - body.height / 2 - Math.sin(k * Math.PI) * 170;
        body.reset(x, y);
        body.setVelocity(0, 0);
        st.lean = -0.1;
        const swing = k < 0.75 ? 0 : easeIn((k - 0.75) / 0.25);
        st.angle = -1.75 + (1.8 + 1.75) * swing;
        st.lift = 1 - swing;
        if (k > 0.75) st.swinging = 0.1;
        if (once(st, 5, 0.45)) b.fx.smoke(st.from, FLOOR_Y - 6, 1.6, 0x6a6058, -20);
        break;
      }
      if (once(st, 1, 1.25)) {
        body.reset(st.to, FLOOR_Y - body.height / 2);
        st.angle = 1.8;
        st.lean = 0.16;
        st.lift = 0;
        impact(m, st.to + f * 50, false, 1.3);
        b.areaHit(st.to - 90, FLOOR_Y - 100, 180, 100, m.damage * 1.2, m, false);
        b.addShockwave(st.to, m.damage * 0.7, m);
      }
      if (t > 1.8) swingTo(st, 1.8, REST, span(t, 1.8, 2.25), easeOut);
      st.lean = 0.16 * (1 - span(t, 1.8, 2.25));
      if (t > 2.3) done = true;
      break;
    }
    case 'wave': {
      // 대검에 보라 기운을 모았다가 땅을 긁으며 올려벤다 → 바닥을 타는 검기
      body.setVelocityX(0);
      st.charged = true;
      if (t < 0.85) {
        swingTo(st, REST, 2.5, span(t, 0, 0.6), easeOut);
        st.lean = 0.12;
        if (once(st, 1, 0.6)) b.fx.flashScreen(PURPLE, 0.12, 180);
        break;
      }
      if (t < 0.98) {
        swingTo(st, 2.5, -1.4, span(t, 0.85, 0.98));
        st.lift = 0.6 * span(t, 0.85, 0.98);
        st.swinging = 0.12;
        st.lean = -0.1;
        break;
      }
      if (once(st, 2, 0.98)) {
        b.fx.slash(m.x + f * 40, FLOOR_Y - 40, f, 90, PURPLE, true, { up: true });
        b.fx.shake(0.8, 160);
        groundWave(m, f, m.x + f * 50);
        if (m.phase2) groundWave(m, (-f) as 1 | -1, m.x - f * 50, 0.3);
      }
      if (t > 1.3) swingTo(st, -1.4, REST, span(t, 1.3, 1.7), easeOut);
      st.lean = -0.1 * (1 - span(t, 1.3, 1.7));
      if (t > 0.98) st.lift = 0.6 * (1 - span(t, 1.3, 1.7));
      if (t > 1.75) done = true;
      break;
    }
    case 'brand': {
      // 대검을 높이 들었다가 땅에 꽂는다 → 보라 낙인 기둥이 차례로 솟는다. 그동안 칼은 박혀 있다.
      body.setVelocityX(0);
      st.charged = true;
      if (t < 0.6) {
        swingTo(st, REST, -0.1, span(t, 0, 0.5), easeOut);
        st.lift = easeOut(span(t, 0, 0.5));
        st.lean = -0.05;
        break;
      }
      if (t < 0.7) {
        swingTo(st, -0.1, Math.PI, span(t, 0.6, 0.7));
        st.lift = 1 - span(t, 0.6, 0.7);
        st.swinging = 0.1;
        break;
      }
      if (once(st, 1, 0.7)) {
        st.angle = Math.PI;
        st.lean = 0.1;
        impact(m, m.x + f * 12, true, 0.9);
        b.fx.flashScreen(PURPLE, 0.15, 220);
      }
      if (t > 2.4) swingTo(st, Math.PI, REST, span(t, 2.4, 2.8), easeOut);
      if (t > 2.85) done = true;
      st.lift = t < 0.7 ? st.lift : 0;
      break;
    }
  }

  if (done) {
    st.last = st.pattern;
    st.pattern = null;
    st.charged = false;
    m.attackTimer = (0.45 + Math.random() * 0.45) * pace * (m.phase2 ? 0.75 : 1);
    m.play(m.look.idle);
  }
  syncSword(m, st, dt);
};

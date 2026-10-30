import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { DEPTH } from '../fx';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';

/**
 * 침묵의 기사단장 (근접 군단장).
 * 일반 패턴: 돌진 베기, 3연속 베기, 도약 내려찍기.
 * 보라색 패턴: 땅을 가르는 검기, 바닥에서 솟는 낙인 기둥. 보라색 공격에 맞으면 침묵(스킬 봉인) + 침묵 스택.
 * 체력 50% 아래에서는 더 빨라지고, 3연속 베기 끝에 보라 일격이 붙고 검기·낙인이 늘어난다.
 */

export const PURPLE = 0xb04aff;
const PURPLE_HI = 0xe0a8ff;

type Pattern = 'dash' | 'combo' | 'leap' | 'wave' | 'brand';

interface KnightState {
  pattern: Pattern | null;
  /** 패턴 시작 뒤 흐른 시간 (속도 배율을 반영한 '기준 초') */
  t: number;
  /** 이번 패턴에서 이미 터뜨린 단계 */
  fired: Set<number>;
  dir: 1 | -1;
  from: number;
  to: number;
  last: Pattern | null;
  ghost: number;
}

const states = new WeakMap<Monster, KnightState>();

/** 보라색 공격: 맞으면 피해에 더해 침묵과 침묵 스택 */
export function purpleHit(m: Monster, x: number, y: number, w: number, h: number, damage: number): void {
  const b = m.scene;
  const pb = b.player.body;
  if (!Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(x, y, w, h), new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) return;
  const before = b.player.hp;
  b.damagePlayer(damage, { x: m.x, monster: m, melee: false });
  if (b.player.hp < before) b.silencePlayer();
}

function once(st: KnightState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

function choose(m: Monster, st: KnightState, dist: number): Pattern {
  const far: Pattern[] = ['dash', 'wave', 'brand', 'leap', 'wave'];
  const near: Pattern[] = ['combo', 'combo', 'leap', 'brand', 'wave'];
  const pool = (dist > 200 ? far : near).filter((p) => p !== st.last);
  // 체력이 낮을수록 보라색 패턴을 더 자주 쓴다.
  if (m.phase2) pool.push('wave', 'brand');
  return pool[Math.floor(Math.random() * pool.length)];
}

function begin(m: Monster, st: KnightState, pattern: Pattern): void {
  const b = m.scene;
  const p = b.player;
  const W = b.level.width;
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  st.dir = p.x >= m.x ? 1 : -1;
  m.face(st.dir);
  m.body.setVelocityX(0);
  switch (pattern) {
    case 'dash': {
      // 플레이어를 지나 반대쪽까지 돌진한다. 경고 띠를 먼저 깐다.
      st.from = m.x;
      st.to = Phaser.Math.Clamp(p.x + st.dir * 140, 50, W - 50);
      const x0 = Math.min(st.from, st.to);
      b.addTelegraph(x0, FLOOR_Y - 70, Math.abs(st.to - st.from), 70, 0.7 * b.legionPace(m), m, null);
      m.play(m.look.idle);
      break;
    }
    case 'leap':
      st.from = m.x;
      st.to = Phaser.Math.Clamp(p.x, 60, W - 60);
      m.play(m.look.idle);
      break;
    case 'brand': {
      // 플레이어 발밑과 그 주변에 낙인 기둥 (2단계에서는 더 많이)
      const n = m.phase2 ? 5 : 3;
      const xs = [p.x];
      for (let i = 1; i < n; i++) xs.push(Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (90 + Math.random() * 40), 30, W - 30));
      const delay = 1.0 * b.legionPace(m) + b.legionWarnBonus();
      xs.forEach((x, i) => {
        b.addTelegraph(x - 22, FLOOR_Y - 160, 44, 160, delay + i * 0.12, m, () => {
          b.fx.pillar(x, FLOOR_Y, PURPLE, 170, 520);
          b.fx.burst(x, FLOOR_Y - 20, PURPLE_HI, 10, 140, 400);
          b.fx.ring(x, FLOOR_Y, 40, PURPLE);
          sfx.play('magic', 0.7);
          purpleHit(m, x - 22, FLOOR_Y - 160, 44, 160, m.damage * 0.9);
        }, PURPLE);
      });
      m.play(m.look.attack);
      b.fx.flashScreen(PURPLE, 0.12, 200);
      break;
    }
    default:
      m.play(m.look.idle);
  }
}

/** 땅을 타고 미끄러지는 보라 검기: 점프로 넘는다. */
function groundWave(m: Monster, dir: 1 | -1, delay = 0): void {
  const b = m.scene;
  const W = b.level.width;
  b.time.delayedCall(delay * 1000, () => {
    if (!m.alive) return;
    const x0 = m.x + dir * 30;
    const h = 30;
    const obj = b.add.rectangle(x0, FLOOR_Y - h / 2, 16, h, PURPLE, 0.85).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    const core = b.add.rectangle(x0, FLOOR_Y - h / 2, 6, h + 6, PURPLE_HI, 0.95).setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
    const end = dir === 1 ? W + 20 : -20;
    let hit = false;
    let trail = 0;
    sfx.play('slash', 0.8);
    b.tweens.add({
      targets: [obj, core],
      x: end,
      duration: (Math.abs(end - x0) / 330) * 1000,
      onUpdate: () => {
        if ((trail = (trail + 1) % 3) === 0) b.fx.burst(obj.x, FLOOR_Y - 6, PURPLE, 2, 40, 300);
        if (!hit) {
          const before = b.player.hp;
          purpleHit(m, obj.x - 8, FLOOR_Y - h, 16, h, m.damage * 0.8);
          if (b.player.hp < before) hit = true;
        }
      },
      onComplete: () => {
        obj.destroy();
        core.destroy();
      },
    });
  });
}

export const silentKnight: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  let st = states.get(m);
  if (!st) {
    st = { pattern: null, t: 0, fired: new Set(), dir: -1, from: 0, to: 0, last: null, ghost: 0 };
    states.set(m, st);
    m.attackTimer = 1.6;
  }
  if (!m.phase2 && m.hp / m.maxHp < 0.5) {
    m.phase2 = true;
    b.announce('침묵의 기사단장이 분노한다!');
    b.fx.flashScreen(PURPLE, 0.3, 300);
    b.fx.shake(1, 300);
  }
  const pace = b.legionPace(m);
  const body = m.body;

  if (!st.pattern) {
    const dx = p.x - m.x;
    m.face(dx);
    if (Math.abs(dx) > 100) {
      body.setVelocityX(Math.sign(dx) * m.speed * 0.75);
      m.play(m.look.walk);
    } else {
      body.setVelocityX(0);
      m.play(m.look.idle);
    }
    m.attackTimer -= dt;
    if (m.attackTimer > 0) return;
    begin(m, st, choose(m, st, Math.abs(dx)));
    return;
  }

  st.t += dt / pace;
  const f = st.dir;
  let done = false;

  switch (st.pattern) {
    case 'dash': {
      if (st.t < 0.7) {
        body.setVelocityX(0);
        if (Math.random() < 0.3) b.fx.burst(m.x - f * 10, FLOOR_Y - 6, 0x9a8a70, 1, 40, 300);
        break;
      }
      if (once(st, 0, 0.7)) {
        m.play(m.look.attack);
        sfx.play('slash', 1.1);
      }
      const reached = f === 1 ? m.x >= st.to : m.x <= st.to;
      if (!reached && st.t < 1.8) {
        body.setVelocityX(f * 560);
        b.areaHit(body.x - 6, body.y, body.width + 12, body.height, m.damage * 1.2, m, false);
        st.ghost -= dt;
        if (st.ghost <= 0) {
          st.ghost = 0.04;
          const s = m.sprite;
          const g = b.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setScale(s.scaleX).setDepth(DEPTH.monster - 1);
          g.setTint(PURPLE).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
          b.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
        }
      } else {
        body.setVelocityX(0);
        if (once(st, 1, 0)) st.t = Math.max(st.t, 1.8);
        if (st.t > 2.3) done = true;
      }
      break;
    }
    case 'combo': {
      // 다가간 뒤 세 번 벤다. 2단계에서는 마지막에 보라 일격.
      const swings = m.phase2 ? [0.5, 0.9, 1.3, 1.85] : [0.5, 0.9, 1.3];
      const dx = p.x - m.x;
      if (st.t < 0.45 && Math.abs(dx) > 60) {
        st.dir = dx >= 0 ? 1 : -1;
        m.face(st.dir);
        body.setVelocityX(st.dir * m.speed);
        m.play(m.look.walk);
      } else body.setVelocityX(0);
      swings.forEach((at, i) => {
        if (!once(st, i, at)) return;
        const purple = i === 3;
        m.play(m.look.attack);
        const x = m.x + st.dir * 30;
        b.fx.slash(x, m.y, st.dir, purple ? 56 : 44, purple ? PURPLE : 0xdfe6ff, purple, { up: i % 2 === 1 });
        sfx.play('slash', purple ? 0.7 : 1);
        const hx = st.dir === 1 ? m.x : m.x - 90;
        if (purple) {
          b.fx.burst(x, m.y, PURPLE_HI, 14, 160, 400);
          purpleHit(m, hx, m.y - 60, 90, 90, m.damage * 1.0);
        } else b.areaHit(hx, m.y - 50, 90, 80, m.damage * 0.7, m, false);
      });
      if (st.t > swings[swings.length - 1] + 0.5) done = true;
      break;
    }
    case 'leap': {
      // 웅크림 → 높이 뛰어 플레이어 위치로 → 착지 충격파
      if (st.t < 0.35) {
        body.setVelocityX(0);
        if (once(st, 0, 0)) b.fx.circle(st.to, FLOOR_Y - 1, 0xff3a2a, 110, 1100 * pace, false, DEPTH.fx - 2);
        break;
      }
      if (st.t < 1.1) {
        const k = (st.t - 0.35) / 0.75;
        const x = st.from + (st.to - st.from) * k;
        const y = FLOOR_Y - body.height / 2 - Math.sin(k * Math.PI) * 150;
        body.reset(x, y);
        body.setVelocity(0, 0);
        m.play(m.look.attack);
        break;
      }
      if (once(st, 1, 1.1)) {
        body.reset(st.to, FLOOR_Y - body.height / 2);
        b.fx.shake(1.2, 220);
        b.fx.boom(st.to, FLOOR_Y - 10, 40, 'dark');
        b.areaHit(st.to - 60, FLOOR_Y - 90, 120, 90, m.damage * 1.0, m, false);
        b.addShockwave(st.to, m.damage * 0.6, m);
        sfx.play('boom', 0.9);
      }
      if (st.t > 1.7) done = true;
      break;
    }
    case 'wave': {
      // 칼을 치켜들어 보라 기운을 모았다가 땅을 가른다. 2단계에서는 양쪽으로.
      body.setVelocityX(0);
      if (st.t < 0.7) {
        if (Math.random() < 0.5) b.fx.burst(m.x + f * 14, m.y - 30, PURPLE, 1, 50, 300);
        if (once(st, 9, 0)) m.play(m.look.attack);
        break;
      }
      if (once(st, 0, 0.7)) {
        b.fx.slash(m.x + f * 30, FLOOR_Y - 20, f, 50, PURPLE, true, {});
        groundWave(m, f);
        if (m.phase2) groundWave(m, (-f) as 1 | -1, 0.35);
      }
      if (st.t > 1.3) done = true;
      break;
    }
    case 'brand':
      body.setVelocityX(0);
      if (st.t > 1.6 + 0.12 * 5) done = true;
      break;
  }

  if (done) {
    st.last = st.pattern;
    st.pattern = null;
    m.attackTimer = (0.5 + Math.random() * 0.5) * pace * (m.phase2 ? 0.75 : 1);
    m.play(m.look.idle);
  }
};

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { DEPTH } from '../fx';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { KNIGHT_IDLE, KNIGHT_RIG, makeKnightArt } from './knightArt';
import { EASE, lerpPose, Rig, Track, type Key, type Pose } from './rig';

/**
 * 침묵의 기사단장 (근접 군단장). 파츠 리그로 조립한 몸에 몸만 한 대검을 두 손으로 쥐고 싸운다.
 * 동작은 자세 키프레임으로 만든다: 느리게 치켜들고(예비 동작) → 순식간에 내리치고 → 박힌 칼을 뽑는다(후딜).
 *
 * 일반 패턴: 내려찍기, 횡베기, 돌진 찌르기, 도약 내려찍기.
 * 보라색 패턴: 땅을 가르는 검기, 칼을 꽂아 솟게 하는 낙인 기둥. 맞으면 침묵 + 침묵 스택.
 * 체력 50% 아래: 더 빨라지고, 횡베기 뒤에 보라 내려찍기가 이어지며, 검기를 양쪽으로 쏜다.
 */

export const PURPLE = 0xb04aff;
const PURPLE_HI = 0xe0a8ff;

type Pattern = 'slam' | 'sweep' | 'thrust' | 'leap' | 'wave' | 'brand' | 'roar';

// ───────── 자세 키프레임 (오른쪽을 볼 때, 손은 어깨 기준, 무기 각도는 0이 위·+가 앞) ─────────

const IDLE: Key = [0, {}];
/** 끝에서 기본 자세로 (무기 각도는 한 바퀴 돈 같은 각도로 맞춰 칼이 거꾸로 돌지 않게 한다) */
const back = (t: number, w = KNIGHT_IDLE.w): Key => [t, { ...KNIGHT_IDLE, w }, EASE.out];

const TRACKS: Record<Pattern, Track> = {
  // 분노 (2단계 진입): 대검을 하늘로 곧게 치켜들고 몸을 젖혀 포효한다
  roar: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.45, { hy: 3, lean: -14, head: -22, fFx: 9, fBx: -9, aFx: 2, aFy: -19, w: 4 }, EASE.out],
    [1.3, { hy: 3.5, lean: -16, head: -24, aFy: -19.5, w: 2 }, EASE.linear],
    back(1.7, KNIGHT_IDLE.w - 360),
  ]),
  // 내려찍기: 몸을 젖히며 대검을 등 뒤로 높이 치켜든다 → 앞으로 크게 내디디며 땅에 박는다 → 뽑는다
  slam: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.8, { hy: 4, lean: -12, head: -10, fFx: 9, fBx: -9, aFx: -2, aFy: -17, w: -62 }, EASE.out],
    [0.95, { aFx: -3, aFy: -18, w: -68 }, EASE.linear],
    [1.07, { hy: 8, lean: 26, head: 8, fFx: 12, fBx: -10, aFx: 11, aFy: 9, w: 116 }, EASE.in],
    [1.75, { hy: 7.5, lean: 24, aFy: 9.5, w: 117 }, EASE.linear],
    [2.0, { hy: 4, lean: 8, head: 0, aFx: 7, aFy: 2, w: 70 }, EASE.inOut],
    back(2.3),
  ]),
  // 횡베기: 칼을 뒤로 낮게 끌었다가 → 바닥을 쓸며 앞으로 크게 → 칼끝이 앞으로 뻗은 채 멈춘다
  sweep: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.6, { hy: 5, lean: -6, head: -6, fFx: 10, fBx: -9, aFx: -9, aFy: 6, w: -125 }, EASE.out],
    [0.75, { aFx: -10, aFy: 7, w: -128 }, EASE.linear],
    [0.83, { hy: 6, lean: 10, head: 0, aFx: 5, aFy: 10, w: -200 }, EASE.in],
    [0.9, { lean: 16, head: 4, fFx: 13, aFx: 11, aFy: 4, w: -265 }, EASE.out],
    [1.3, { lean: 14, aFy: 5, w: -268 }, EASE.linear],
    back(1.7, KNIGHT_IDLE.w - 360),
  ]),
  // 돌진 찌르기: 칼을 허리로 당겨 겨누고 → 앞으로 뻗은 채 돌진 → 올려벤다
  thrust: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.5, { hy: 6, lean: 16, head: 4, fFx: 11, fBx: -11, aFx: -6, aFy: 5, w: 90 }, EASE.out],
    [0.85, { aFx: -7, aFy: 5.5, w: 88 }, EASE.linear],
    [0.95, { hy: 5, lean: 28, aFx: 13, aFy: 3, w: 90 }, EASE.out],
    [1.9, { lean: 27 }, EASE.linear],
    [2.05, { hy: 2, lean: -8, head: -8, fFx: 9, fBx: -8, aFx: 5, aFy: -16, w: -30 }, EASE.in],
    [2.45, {}, EASE.linear],
    back(2.8),
  ]),
  // 도약 내려찍기: 웅크려 대검을 치켜들고 → 다리를 모아 날아올라 → 떨어지며 내리박는다
  leap: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.45, { hy: 8, lean: 14, head: 4, fFx: 8, fBx: -8, aFx: -2, aFy: -16, w: -60 }, EASE.out],
    [0.6, { hy: -3, lean: -4, head: -6, fFx: 4, fFy: -8, fBx: -6, fBy: -5, aFx: -3, aFy: -18, w: -70 }, EASE.out],
    [1.05, { hy: -2, lean: -10, fFx: 6, fFy: -9, fBx: -4, fBy: -7, w: -80 }, EASE.linear],
    [1.25, { hy: 8, lean: 26, head: 8, fFx: 11, fFy: 0, fBx: -10, fBy: 0, aFx: 11, aFy: 10, w: 118 }, EASE.in],
    [1.8, { hy: 7.5, lean: 24 }, EASE.linear],
    back(2.25),
  ]),
  // 보라 검기: 칼끝을 앞쪽 바닥에 대고 기운을 모았다가 → 땅을 긁으며 머리 위까지 올려벤다
  wave: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.6, { hy: 6, lean: 18, head: 4, fFx: 10, fBx: -9, aFx: 8, aFy: 10, w: -215 }, EASE.out],
    [0.85, { aFy: 10.5, w: -217 }, EASE.linear],
    [0.98, { hy: 2, lean: -10, head: -8, aFx: 4, aFy: -15, w: -380 }, EASE.in],
    [1.3, {}, EASE.linear],
    back(1.7, KNIGHT_IDLE.w - 360),
  ]),
  // 낙인: 칼끝을 아래로 높이 들었다가 → 무릎을 굽히며 땅에 꽂는다 → 기둥이 다 솟을 때까지 박아 둔다
  brand: new Track(KNIGHT_IDLE, [
    IDLE,
    [0.5, { hy: 2, lean: -4, head: -10, aFx: 5, aFy: -17, w: -180 }, EASE.out],
    [0.6, { aFy: -18, w: -182 }, EASE.linear],
    [0.7, { hy: 10, lean: 22, head: 12, fFx: 9, fBx: -10, aFx: 8, aFy: 8, w: -178 }, EASE.in],
    [2.4, { hy: 9.5, lean: 20, head: 10 }, EASE.linear],
    back(2.8),
  ]),
};

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
  rig: Rig;
  /** 대검에 보라 기운이 서려 있다 */
  charged: boolean;
  /** 방금 휘둘렀다: 대검 잔상을 남긴다 */
  swinging: number;
  /** 걷기 주기 */
  walk: number;
  /** 자세가 갑자기 바뀔 때 잠깐 섞는다 */
  blendFrom: Pose | null;
  blend: number;
  time: number;
}

const BLEND = 0.15;
const states = new WeakMap<Monster, KnightState>();

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

/** 지금 자세에서 새 동작으로 부드럽게 넘어가도록 섞기 시작 */
function startBlend(st: KnightState): void {
  st.blendFrom = { ...st.rig.pose };
  st.blend = BLEND;
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
  startBlend(st);
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

/** 대검을 어깨에 걸친 채 묵직하게 걷거나 숨을 고르는 자세 */
function movePose(st: KnightState, moving: boolean, dt: number): Pose {
  const p = { ...KNIGHT_IDLE };
  const breathe = Math.sin(st.time * 2.2);
  p.hy += breathe * 0.4;
  p.w += breathe * 1.5;
  p.aFy += breathe * 0.3;
  if (moving) {
    st.walk += dt * 7;
    const s = Math.sin(st.walk);
    const c = Math.cos(st.walk);
    // 한 걸음마다 몸이 가라앉고 칼이 흔들린다.
    p.fFx = 1 + s * 7;
    p.fFy = -Math.max(0, c) * 3.5;
    p.fBx = -1 - s * 7;
    p.fBy = -Math.max(0, -c) * 3.5;
    p.hy += 1 - Math.abs(c) * 1.2;
    p.lean += 4;
    p.w += s * 3;
  } else {
    st.walk = 0;
  }
  return p;
}

export const silentKnight: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  let st = states.get(m);
  if (!st) {
    makeKnightArt(b);
    const rig = new Rig(b, KNIGHT_RIG, KNIGHT_IDLE);
    rig.glowColor = PURPLE;
    m.sprite.setVisible(false);
    const s: KnightState = {
      pattern: null,
      t: 0,
      fired: new Set(),
      dir: -1,
      from: 0,
      to: 0,
      last: null,
      ghost: 0,
      rig,
      charged: false,
      swinging: 0,
      walk: 0,
      blendFrom: null,
      blend: 0,
      time: 0,
    };
    st = s;
    states.set(m, s);
    // 리그는 본체(물리 몸) 발밑을 따라가고, 맞으면 번쩍이고, 쓰러지면 함께 사라진다.
    const follow = (): void => {
      const step = b.fx.hitstop > 0 ? 0 : Math.min(0.05, b.game.loop.delta / 1000);
      s.rig.mirror(m.sprite);
      s.rig.update(m.x, m.body.bottom + 1, m.facing, step);
    };
    b.events.on('postupdate', follow);
    b.events.once('shutdown', () => {
      b.events.off('postupdate', follow);
      s.rig.destroy();
    });
    m.attackTimer = 1.8;
    // 개발용: 콘솔에서 패턴을 바로 시켜 본다 (__bw.battle().monsters[0].force('slam'))
    if (import.meta.env.DEV) (m as unknown as { force: (p: Pattern) => void }).force = (pat) => begin(m, s, pat);
  }
  if (!m.phase2 && m.hp / m.maxHp < 0.5) {
    m.phase2 = true;
    b.announce('침묵의 기사단장이 분노한다!');
    begin(m, st, 'roar');
  }
  st.time += dt;
  const pace = b.legionPace(m);
  const body = m.body;
  const f = st.dir;
  const rig = st.rig;
  let done = false;
  let pose: Pose;

  if (!st.pattern) {
    // 대검을 어깨에 걸친 채 묵직하게 걸어온다.
    const dx = p.x - m.x;
    m.face(dx);
    st.dir = dx >= 0 ? 1 : -1;
    st.charged = false;
    const moving = Math.abs(dx) > 120;
    body.setVelocityX(moving ? Math.sign(dx) * m.speed * 0.6 : 0);
    pose = movePose(st, moving, dt);
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) begin(m, st, choose(m, st, Math.abs(dx)));
  } else {
    st.t += dt / pace;
    const t = st.t;
    switch (st.pattern) {
      case 'roar': {
        body.setVelocityX(0);
        st.charged = true;
        if (once(st, 0, 0.45)) {
          const tip = rig.tip();
          b.fx.flashScreen(PURPLE, 0.3, 300);
          b.fx.shake(1.2, 400);
          b.fx.pillar(tip.x, m.body.bottom, PURPLE, 260, 900);
          b.fx.ring(m.x, FLOOR_Y, 120, PURPLE, 500);
          sfx.play('magic', 1);
        }
        // 대검에서 보라 기운이 솟구친다.
        if (t > 0.45 && t < 1.3 && Math.random() < 0.8) {
          const at = rig.tip(0.3 + Math.random() * 0.7);
          b.fx.burst(at.x, at.y, PURPLE, 2, 70, 360);
        }
        if (t > 1.75) done = true;
        break;
      }
      case 'slam': {
        body.setVelocityX(0);
        const purple = m.phase2 && st.fired.has(90);
        // 치켜든 칼끝이 번쩍이고, 내리치기 직전에는 팔이 떨린다.
        if (once(st, 1, 0.75)) {
          const tip = rig.tip();
          b.fx.spark(tip.x, tip.y, 0xffffff, 2, Math.PI / 4);
          sfx.play('slash', 0.4);
        }
        if (t > 0.95 && t < 1.07) st.swinging = 0.1;
        if (once(st, 2, 1.07)) {
          const tip = rig.tip(0.85);
          body.setVelocityX(f * 60);
          b.fx.slash(m.x + f * 50, FLOOR_Y - 60, f, 90, purple ? PURPLE : 0xdfe6ff, true, { up: false });
          impact(m, tip.x, purple, 1.2);
          frontHit(m, f, 15, 175, 110, m.damage * 1.3, purple);
          if (purple) {
            groundWave(m, f, tip.x);
            groundWave(m, (-f) as 1 | -1, tip.x);
          }
        }
        // 박힌 칼을 뽑을 때 흙이 튄다.
        if (once(st, 3, 1.8)) {
          const tip = rig.tip(0.7);
          b.fx.burst(tip.x, FLOOR_Y - 4, 0x8a7a68, 8, 120, 400, 1, 500);
          sfx.play('slash', 0.3);
        }
        if (t > 2.3) done = true;
        break;
      }
      case 'sweep': {
        // 칼을 뒤로 낮게 끌었다가 앞을 크게 가로로 벤다. 구르기로 피해야 한다.
        body.setVelocityX(0);
        if (once(st, 5, 0)) b.addTelegraph(f === 1 ? m.x - 40 : m.x - 170, FLOOR_Y - 90, 210, 90, 0.75 * pace, m, null);
        if (once(st, 1, 0.55)) {
          const tip = rig.tip();
          b.fx.spark(tip.x, tip.y, 0xffffff, 2, Math.PI / 4);
        }
        if (t > 0.75 && t < 0.9) {
          st.swinging = 0.1;
          body.setVelocityX(f * 220);
          // 칼끝이 바닥을 긁는다.
          const tip = rig.tip();
          if (tip.y > FLOOR_Y - 12) b.fx.burst(tip.x, FLOOR_Y - 2, 0xffe0a0, 2, 90, 200);
        }
        if (once(st, 2, 0.9)) {
          body.setVelocityX(0);
          b.fx.slash(m.x + f * 40, FLOOR_Y - 45, f, 100, 0xdfe6ff, true, { squash: 0.5 });
          b.fx.stop(0.08);
          b.fx.shake(0.9, 160);
          sfx.play('slash', 0.8);
          frontHit(m, f, -40, 170, 90, m.damage * 1.1);
        }
        // 2단계: 그대로 보라 내려찍기로 잇는다.
        if (m.phase2 && t > 1.7 && !st.fired.has(90)) {
          st.fired.clear();
          st.fired.add(90);
          st.pattern = 'slam';
          st.t = 0.3;
          st.charged = true;
          startBlend(st);
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
          if (Math.random() < 0.3) b.fx.burst(m.x - f * 14, FLOOR_Y - 6, 0x9a8a70, 1, 50, 300);
          break;
        }
        if (once(st, 0, 0.85)) sfx.play('slash', 1.2);
        const reached = f === 1 ? m.x >= st.to : m.x <= st.to;
        if (!reached && t < 1.9 && !st.fired.has(1)) {
          body.setVelocityX(f * 600);
          b.areaHit(body.x - 6, FLOOR_Y - 100, body.width + 12, 100, m.damage * 1.2, m, false);
          st.ghost -= dt;
          if (st.ghost <= 0) {
            st.ghost = 0.035;
            rig.ghost(PURPLE, 0.45, 240);
          }
          if (Math.random() < 0.5) b.fx.burst(m.x - f * 20, FLOOR_Y - 4, 0x9a8a70, 1, 60, 300);
          break;
        }
        if (once(st, 1, 0)) {
          st.t = Math.max(st.t, 1.9);
          body.setVelocityX(f * 80);
        }
        if (st.t < 2.05) st.swinging = 0.1;
        if (once(st, 2, 2.05)) {
          body.setVelocityX(0);
          b.fx.slash(m.x + f * 40, FLOOR_Y - 60, f, 80, 0xdfe6ff, true, { up: true });
          b.fx.shake(0.8, 140);
          sfx.play('slash', 0.9);
          frontHit(m, f, -10, 120, 130, m.damage * 1.0);
        }
        if (st.t > 2.85) done = true;
        break;
      }
      case 'leap': {
        // 웅크림 → 대검을 치켜든 채 높이 뛰어 → 착지하며 내리찍기 + 양옆 충격파
        if (t < 0.45) {
          body.setVelocityX(0);
          if (once(st, 0, 0)) b.fx.circle(st.to, FLOOR_Y - 1, 0xff3a2a, 120, 1300 * pace, false, DEPTH.fx - 2);
          break;
        }
        if (t < 1.25) {
          const k = (t - 0.45) / 0.8;
          const x = st.from + (st.to - st.from) * k;
          const y = FLOOR_Y - body.height / 2 - Math.sin(k * Math.PI) * 170;
          body.reset(x, y);
          body.setVelocity(0, 0);
          if (k > 0.75) st.swinging = 0.1;
          if (once(st, 5, 0.45)) {
            b.fx.smoke(st.from, FLOOR_Y - 6, 1.6, 0x6a6058, -20);
            sfx.play('slash', 0.5);
          }
          break;
        }
        if (once(st, 1, 1.25)) {
          body.reset(st.to, FLOOR_Y - body.height / 2);
          impact(m, rig.tip(0.85).x, false, 1.3);
          b.areaHit(st.to - 90, FLOOR_Y - 100, 180, 100, m.damage * 1.2, m, false);
          b.addShockwave(st.to, m.damage * 0.7, m);
        }
        if (t > 2.3) done = true;
        break;
      }
      case 'wave': {
        // 대검에 보라 기운을 모았다가 땅을 긁으며 올려벤다 → 바닥을 타는 검기
        body.setVelocityX(0);
        st.charged = true;
        if (t < 0.85) {
          if (once(st, 1, 0.6)) b.fx.flashScreen(PURPLE, 0.12, 180);
          // 바닥에 댄 칼끝에 보라 기운이 모인다.
          if (t > 0.5 && Math.random() < 0.6) {
            const tip = rig.tip(0.95);
            b.fx.burst(tip.x, Math.min(tip.y, FLOOR_Y - 4), PURPLE, 2, 60, 300);
          }
          break;
        }
        if (t < 0.98) st.swinging = 0.1;
        if (once(st, 2, 0.98)) {
          b.fx.slash(m.x + f * 40, FLOOR_Y - 40, f, 90, PURPLE, true, { up: true });
          b.fx.shake(0.8, 160);
          groundWave(m, f, m.x + f * 50);
          if (m.phase2) groundWave(m, (-f) as 1 | -1, m.x - f * 50, 0.3);
        }
        if (t > 1.75) done = true;
        break;
      }
      case 'brand': {
        // 대검을 높이 들었다가 땅에 꽂는다 → 보라 낙인 기둥이 차례로 솟는다. 그동안 칼은 박혀 있다.
        body.setVelocityX(0);
        st.charged = true;
        if (t > 0.6 && t < 0.7) st.swinging = 0.1;
        if (once(st, 1, 0.7)) {
          impact(m, rig.handPos().x + f * 6, true, 0.9);
          b.fx.flashScreen(PURPLE, 0.15, 220);
        }
        // 꽂힌 칼에서 보라 기운이 땅으로 번진다.
        if (t > 0.7 && t < 2.4 && Math.random() < 0.5) b.fx.burst(rig.handPos().x + f * 6, FLOOR_Y - 4, PURPLE, 2, 80, 360);
        if (t > 2.85) done = true;
        break;
      }
    }
    pose = TRACKS[st.pattern ?? 'slam'].at(st.t);
    // 내리치기 직전 팔이 떨린다.
    if (st.pattern === 'slam' && st.t > 0.8 && st.t < 0.95) pose.w += Math.sin(st.t * 90) * 2;
  }

  if (done) {
    st.last = st.pattern;
    st.pattern = null;
    st.charged = false;
    startBlend(st);
    m.attackTimer = (0.45 + Math.random() * 0.45) * pace * (m.phase2 ? 0.75 : 1);
  }

  // 갑자기 바뀐 자세는 잠깐 섞는다 (무기 각도는 가까운 쪽으로 돌린다).
  if (st.blendFrom && st.blend > 0) {
    st.blend = Math.max(0, st.blend - dt);
    const from = { ...st.blendFrom };
    from.w += Math.round((pose.w - from.w) / 360) * 360;
    pose = lerpPose(from, pose, 1 - st.blend / BLEND);
  }
  rig.pose = pose;
  rig.glowing = st.charged;
  // 휘두르는 중에는 대검 잔상을 남긴다.
  st.swinging = Math.max(0, st.swinging - dt);
  if (st.swinging > 0) rig.ghost(st.charged ? PURPLE : 0xdfe6ff, 0.5, 160, ['weapon']);
};

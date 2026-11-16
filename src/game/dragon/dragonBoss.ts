import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import type { MonsterKind } from '../../data/monsters';
import type { FieldSpec } from '../battleScene';
import { DEPTH } from '../fx';
import type { Palette } from '../fxArt';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { standPose } from './dragonArt';
import { DragonRig, lerpDragon, type DragonPose, type DragonRigDef } from './rig';

// 용 계열 보스·미니보스 (홍염룡·와이번과 뒤 챕터의 용들). 속성(불·서리·번개·그림자)만 바꿔 같은 패턴을 쓴다.

/** 용의 속성: 색, 숨결·불비가 남기는 장판, 격노 때 솟는 기둥 */
export interface DragonElement {
  color: number;
  hi: number;
  /** 장판 겉모습 (불길 / 얼음 가시 / 빛 띠) */
  field: 'fire' | 'frost' | 'plain';
  /** 격노 때 땅에서 솟는 것: 불기둥 / 얼음 가시 / 하늘에서 내리꽂는 빛 */
  pillar: 'fire' | 'ice' | 'light';
  boom: Palette;
  breathName: string;
  rainName: string;
}

export const EL_FIRE: DragonElement = { color: 0xff7a1a, hi: 0xffd070, field: 'fire', pillar: 'fire', boom: 'fire', breathName: '화염 숨결', rainName: '불비가 쏟아진다!' };
export const EL_FROST: DragonElement = { color: 0x6ad0ff, hi: 0xdff8ff, field: 'frost', pillar: 'ice', boom: 'frost', breathName: '서리 숨결', rainName: '뼈창이 쏟아진다!' };
export const EL_STORM: DragonElement = { color: 0xffe04a, hi: 0xffffff, field: 'plain', pillar: 'light', boom: 'gold', breathName: '번개 숨결', rainName: '벼락이 떨어진다!' };
export const EL_SHADOW: DragonElement = { color: 0xb050ff, hi: 0xf0c8ff, field: 'plain', pillar: 'light', boom: 'dark', breathName: '암흑 숨결', rainName: '암흑탄이 쏟아진다!' };

export interface DragonCfg {
  def: () => DragonRigDef;
  z: number;
  wyvern: boolean;
  el: DragonElement;
  /** 격노 때 부르는 부하 */
  summon: MonsterKind[];
  line: string;
  /** 이 체력 비율 아래에서 격노 (기본 0.5) */
  enrageAt?: number;
}

/** 속성 장판: 그 위 땅에 서 있으면 틱마다 다친다. */
function elemField(m: Monster, st: DragonState, x: number, w: number, life: number, hurt: number): void {
  const el = st.cfg.el;
  const spec: FieldSpec = { x: x - w / 2, w, life, tickEvery: 0.5, damage: 0, color: el.color, style: el.field, hurt };
  m.scene.addField(spec);
}

/** 땅에서 솟는 속성 기둥 (격노 패턴) */
function elemPillar(m: Monster, st: DragonState, x: number, damage: number, delay: number): void {
  const b = m.scene;
  const el = st.cfg.el;
  if (el.pillar === 'fire') b.firePillar(x, damage, m, delay, 46);
  else if (el.pillar === 'light') b.lightBeam(x, damage, m, delay, 40, el.hi);
  else
    b.addTelegraph(x - 24, FLOOR_Y - 90, 48, 90, delay, m, () => {
      for (let i = 0; i < 3; i++) b.fx.iceSpike(x + (i - 1) * 14, FLOOR_Y, 1.2 + (i === 1 ? 0.5 : 0), 500, i * 40);
      b.fx.burst(x, FLOOR_Y - 20, el.hi, 10, 140, 400);
      b.areaHit(x - 24, FLOOR_Y - 90, 48, 90, damage, m, false);
    }, el.color);
}
// ───────────────────────── 용 리그 공통 ─────────────────────────

type DragonPattern = 'breath' | 'claw' | 'tail' | 'dive' | 'rain' | 'eruption' | 'swoop' | 'spit' | 'stomp' | 'roar';

interface DragonState {
  rig: DragonRig;
  cfg: DragonCfg;
  z: number;
  wyvern: boolean;
  pattern: DragonPattern | null;
  t: number;
  fired: Set<number>;
  dir: 1 | -1;
  /** 패턴이 쓰는 위치들 */
  tx: number;
  ty: number;
  from: number;
  walk: number;
  last: DragonPattern | null;
  /** 날고 있다 (중력 없음) */
  flying: boolean;
  /** 불을 머금은 정도 (몸이 붉게 달아오른다) */
  heat: number;
}

const states = new WeakMap<Monster, DragonState>();

function once(st: DragonState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

/** 리그를 처음 붙인다. 본체 스프라이트는 숨기고, 리그가 본체의 발밑을 따라간다. */
function attach(m: Monster, cfg: DragonCfg): DragonState {
  const b = m.scene;
  const def = cfg.def();
  const z = cfg.z;
  const wyvern = cfg.wyvern;
  const rig = new DragonRig(b, def, standPose(z, wyvern));
  m.sprite.setVisible(false);
  // 몸집이 커서 발판에 올라서지 않고 늘 땅을 딛는다.
  m.zone.setData('noPlatform', true);
  const st: DragonState = { rig, cfg, z, wyvern, pattern: null, t: 0, fired: new Set(), dir: -1, tx: 0, ty: 0, from: 0, walk: 0, last: null, flying: false, heat: 0 };
  states.set(m, st);
  const follow = (): void => {
    const step = b.rigStep();
    rig.mirror(m.sprite);
    rig.update(m.x, m.body.bottom, m.facing, step);
    if (!m.alive) rig.root.setAlpha(m.sprite.alpha);
  };
  b.events.on('postupdate', follow);
  b.events.once('shutdown', () => {
    b.events.off('postupdate', follow);
    rig.destroy();
  });
  m.attackTimer = 1.6;
  if (import.meta.env.DEV) (m as unknown as { force: (p: DragonPattern) => void }).force = (pat) => begin(m, st, pat);
  return st;
}

/** 자세를 목표 쪽으로 부드럽게 옮긴다. */
function ease(st: DragonState, target: DragonPose, dt: number, rate = 10): void {
  st.rig.pose = lerpDragon(st.rig.pose, target, 1 - Math.exp(-dt * rate));
}

/** 걷거나 숨을 고르는 자세 */
function groundPose(st: DragonState, moving: boolean, dt: number): DragonPose {
  const z = st.z;
  const p = standPose(z, st.wyvern);
  const breathe = Math.sin(st.rig.time * 2);
  p.by += breathe * 0.6 * z;
  p.neck += breathe * 2;
  if (moving) {
    st.walk += dt * 5;
    const s = Math.sin(st.walk);
    const c = Math.cos(st.walk);
    p.fFx += s * 8 * z;
    p.fFy = -Math.max(0, c) * 5 * z;
    p.bFx -= s * 8 * z;
    p.bFy = -Math.max(0, -c) * 5 * z;
    p.by += Math.abs(c) * 1.2 * z;
    p.neck += c * 4;
  }
  return p;
}

/** 날아 있는 자세 (원점은 본체 발밑이라 다리를 접어 올린다) */
function flyPose(st: DragonState, extra: Partial<DragonPose> = {}): DragonPose {
  const z = st.z;
  return { ...standPose(z, st.wyvern), by: -40 * z, rot: 4, fold: 0, wing: -100, flap: 1, neck: -16, curl: 6, head: 10, tail: 2, tailCurl: -2, tailAmp: 14, fFx: 18 * z, fFy: -14 * z, bFx: -20 * z, bFy: -12 * z, ...extra };
}

function takeOff(m: Monster, st: DragonState): void {
  st.flying = true;
  m.body.setAllowGravity(false);
}

function land(m: Monster, st: DragonState): void {
  st.flying = false;
  m.body.setAllowGravity(true);
}

/** 큰 날갯짓에 이는 흙먼지 */
function wingDust(m: Monster): void {
  const b = m.scene;
  b.fx.smoke(m.x - 40, FLOOR_Y - 6, 2, 0x6a4a3a, -10);
  b.fx.smoke(m.x + 40, FLOOR_Y - 6, 2, 0x6a4a3a, -10);
}

/** 땅을 내려찍은 자리: 충격파·불티·흔들림 */
function quake(m: Monster, st: DragonState, x: number, power: number): void {
  const b = m.scene;
  b.fx.stop(0.08 * power);
  b.fx.shake(1.6 * power, 300);
  b.fx.boom(x, FLOOR_Y - 10, 34 * power, st.cfg.el.boom);
  b.fx.burst(x, FLOOR_Y - 4, 0x8a6a58, 18, 180, 520, 2, 600);
  b.fx.ring(x, FLOOR_Y, 90 * power, st.cfg.el.color, 380);
  sfx.play('boom', 0.8);
}

function choose(m: Monster, st: DragonState, dist: number, behind: boolean): DragonPattern {
  let pool: DragonPattern[];
  if (st.wyvern) pool = dist > 200 ? ['swoop', 'spit', 'swoop', 'stomp'] : ['stomp', 'spit', 'swoop'];
  else if (behind && dist < 200) pool = ['tail', 'tail', 'dive'];
  else if (dist < 170) pool = ['claw', 'breath', 'tail', 'claw', 'dive'];
  else pool = ['breath', 'dive', 'rain', 'breath'];
  if (!st.wyvern && m.phase2) pool.push('eruption', 'rain');
  const choices = pool.filter((p) => p !== st.last);
  return choices[Math.floor(Math.random() * choices.length)];
}

function begin(m: Monster, st: DragonState, pattern: DragonPattern): void {
  const b = m.scene;
  const p = b.player;
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  st.dir = p.x >= m.x ? 1 : -1;
  if (pattern !== 'tail') m.face(st.dir);
  m.body.setVelocityX(0);
  st.from = m.x;
  st.tx = p.x;
  st.ty = p.y;
}

function finish(m: Monster, st: DragonState): void {
  st.last = st.pattern;
  st.pattern = null;
  st.heat = 0;
  m.attackTimer = m.def.attackCd * (m.phase2 ? 0.7 : 1) * (0.8 + Math.random() * 0.4);
}

// ─── 패턴: 홍염룡 ───

/** 화염 숨결: 고개를 젖혀 불을 머금었다가, 앞쪽 땅을 가까운 곳부터 먼 곳까지 쓸며 불을 뿜는다. */
function breath(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const z = st.z;
  const f = m.facing;
  const pace = m.phase2 ? 0.8 : 1;
  const charge = 1 * pace;
  const len = 1.4;
  const near = 50;
  const far = 360;
  if (once(st, 0, 0)) {
    const x0 = f === 1 ? m.x + near : m.x - far;
    b.addTelegraph(x0, FLOOR_Y - 64, far - near, 64, charge, m, null);
    b.announce(`! 뒤로 돌아가거나 발판 위로!`, 1.2);
  }
  if (st.t < charge) {
    // 고개를 젖히고 숨을 들이쉰다: 입에 불이 모이고 몸이 달아오른다.
    st.heat = st.t / charge;
    ease(st, { ...groundPose(st, false, dt), neck: -82, curl: 3, head: -20, jaw: 24, rot: -14, by: -31 * z, wing: -110, fold: 0.5 }, dt, 8);
    const mo = st.rig.mouth();
    if (Math.random() < 0.6) b.fx.burst(mo.x, mo.y, st.cfg.el.hi, 2, 40, 200);
    return false;
  }
  const k = Math.min(1, (st.t - charge) / len);
  ease(st, { ...groundPose(st, false, dt), neck: -24 + k * 10, curl: 8, head: 26 - k * 10, jaw: 34, rot: 6, by: -24 * z, wing: -115, fold: 0.6 }, dt, 14);
  st.heat = 1 - k * 0.5;
  // 불줄기가 닿는 땅: 가까운 곳에서 먼 곳으로 쓸고 간다.
  const reach = near + (far - near) * Math.min(1, k * 1.25);
  const gx = m.x + f * reach;
  const mo = st.rig.mouth();
  b.fx.tracer(mo.x, mo.y, gx, FLOOR_Y - 6, st.cfg.el.color, 9, 90);
  b.fx.tracer(mo.x, mo.y, gx, FLOOR_Y - 6, st.cfg.el.hi, 4, 70);
  if (Math.random() < 0.7) b.fx.burst(gx, FLOOR_Y - 8, st.cfg.el.hi, 4, 120, 300);
  if (Math.random() < 0.35) {
    const fx = gx + (Math.random() - 0.5) * 30;
    if (st.cfg.el.field === 'fire') b.fx.flame(fx, FLOOR_Y, 0.9 + Math.random() * 0.6, 500);
    else if (st.cfg.el.field === 'frost') b.fx.iceSpike(fx, FLOOR_Y, 0.8 + Math.random() * 0.4, 300);
    else b.fx.lightning(mo.x, mo.y, gx + (Math.random() - 0.5) * 40, FLOOR_Y - 4, st.cfg.el.hi, 2, 90);
  }
  if (Math.random() < 0.3) b.fx.shake(0.4, 60);
  // 쓸고 지나간 자리 전체가 데운다 (무적 시간 때문에 실제로는 몇 번만 맞는다).
  st.from += dt;
  if (st.from > 0.2) {
    st.from = 0;
    const x0 = f === 1 ? m.x + near : gx;
    b.areaHit(x0, FLOOR_Y - 64, Math.abs(gx - (m.x + f * near)), 64, m.damage * 0.55, m, false);
    sfx.play('magic', 0.35);
  }
  if (once(st, 1, charge + len - 0.05)) {
    const x0 = m.x + f * (near + far) / 2;
    elemField(m, st, x0, far - near, 2.2, Math.round(m.damage * 0.2));
  }
  return st.t > charge + len + 0.5;
}

/** 앞발 할퀴기: 앞발을 치켜들었다가 앞쪽을 크게 할퀸다. */
function claw(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const z = st.z;
  const f = m.facing;
  const wind = m.phase2 ? 0.5 : 0.65;
  if (once(st, 0, 0)) b.addTelegraph(f === 1 ? m.x + 30 : m.x - 190, FLOOR_Y - 90, 160, 90, wind, m, null);
  if (st.t < wind) {
    ease(st, { ...groundPose(st, false, dt), rot: -20, by: -32 * z, fFx: 24 * z, fFy: -18 * z, neck: -50, head: 8, jaw: 22 }, dt, 10);
    return false;
  }
  ease(st, { ...groundPose(st, false, dt), rot: 12, by: -22 * z, fFx: 36 * z, fFy: 0, neck: -6, curl: 6, head: 14, jaw: 12 }, dt, 22);
  if (once(st, 1, wind + 0.06)) {
    const x = m.x + f * 110;
    b.fx.slash(x, FLOOR_Y - 40, f, 46, st.cfg.el.hi, true);
    b.fx.slash(x + f * 10, FLOOR_Y - 30, f, 40, 0xffffff);
    b.areaHit(f === 1 ? m.x + 30 : m.x - 190, FLOOR_Y - 90, 160, 90, m.damage * 1.1, m, false);
    if (Math.abs(b.player.x - x) < 90) b.player.knockback(m.x, 240);
    quake(m, st, x, 0.6);
  }
  return st.t > wind + 0.6;
}

/** 꼬리 후려치기: 꼬리를 치켜들었다가 몸 앞뒤 낮은 곳을 쓸어 버린다 (점프로 넘는다). */
function tail(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const wind = m.phase2 ? 0.6 : 0.8;
  if (once(st, 0, 0)) {
    b.addTelegraph(m.x - 230, FLOOR_Y - 34, 460, 34, wind, m, null);
    b.announce('꼬리 후려치기! 점프!', 0.9);
  }
  if (st.t < wind) {
    ease(st, { ...groundPose(st, false, dt), tail: -26, tailCurl: -12, tailAmp: 4, rot: 6, neck: -40, head: 20 }, dt, 9);
    return false;
  }
  const k = Math.min(1, (st.t - wind) / 0.35);
  // 치켜든 꼬리를 땅을 스치듯 낮게 휘두른다.
  ease(st, { ...groundPose(st, false, dt), tail: 10 - k * 6, tailCurl: 1, tailAmp: 26, rot: -4, neck: -50, head: 24 }, dt, 24);
  if (once(st, 1, wind + 0.08)) {
    b.fx.bigSlash(m.x - 230, FLOOR_Y - 16, m.x + 230, FLOOR_Y - 12, st.cfg.el.hi, 10, 300);
    b.fx.burst(m.x, FLOOR_Y - 8, 0x8a6a58, 16, 200, 500, 2, 600);
    sfx.play('slash', 1);
    b.fx.shake(1, 200);
    const pl = b.player;
    if (Math.abs(pl.x - m.x) < 235 && pl.grounded && !pl.onPlatform) {
      b.damagePlayer(m.damage * 0.9, { x: m.x, monster: m, melee: true });
      pl.knockback(m.x, 260);
    }
  }
  return st.t > wind + 0.7;
}

/** 급강하: 날아올라 플레이어 머리 위로 간 뒤, 표시된 자리로 내리꽂힌다. */
function dive(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const p = b.player;
  const z = st.z;
  const rise = 0.8;
  const chase = m.phase2 ? 0.9 : 1.1;
  const mark = 0.75;
  if (once(st, 0, 0)) {
    takeOff(m, st);
    wingDust(m);
    sfx.play('magic', 0.6);
  }
  if (st.t < rise + chase) {
    // 날아올라 플레이어 쪽으로 간다.
    ease(st, flyPose(st), dt, 8);
    const tx = st.t < rise ? m.x : p.x;
    m.body.setVelocity((tx - m.x) * 2.2, (FLOOR_Y - 150 - m.body.bottom) * 3);
    m.face(p.x - m.x || m.facing);
    if (Math.random() < 0.05) wingDust(m);
    st.tx = Phaser.Math.Clamp(p.x, 80, b.level.width - 80);
    return false;
  }
  if (once(st, 1, rise + chase)) {
    b.addTelegraph(st.tx - 70, FLOOR_Y - 120, 140, 120, mark, m, null);
    b.fx.circle(st.tx, FLOOR_Y - 1, st.cfg.el.color, 160, mark * 1000, false, DEPTH.fx - 2);
  }
  if (st.t < rise + chase + mark) {
    // 표시가 차는 동안 그 자리 위에서 몸을 웅크린다.
    m.body.setVelocity((st.tx - m.x) * 4, (FLOOR_Y - 165 - m.body.bottom) * 3);
    ease(st, flyPose(st, { rot: -10, fold: 0.3, flap: 0.6, wing: -130, neck: -30, head: 20 }), dt, 8);
    return false;
  }
  if (st.flying) {
    ease(st, flyPose(st, { rot: 28, fold: 0.7, flap: 0, wing: -150, neck: 6, curl: 2, head: 6, jaw: 26 }), dt, 14);
    m.body.setVelocity((st.tx - m.x) * 6, 900);
    if (Math.random() < 0.5) st.rig.ghost(st.cfg.el.color, 0.35, 160);
    // 발판에 걸리거나 너무 오래 걸려도 그 자리에 내려앉은 것으로 친다.
    if (m.body.bottom >= FLOOR_Y - 4 || m.body.blocked.down || st.t > rise + chase + mark + 1.2) {
      land(m, st);
      m.body.setVelocity(0, 0);
      quake(m, st, m.x, 1.2);
      b.groundSlam(m.x, 90, m.damage * 1.3, m);
      b.addShockwave(m.x, m.damage * 0.7, m);
      elemField(m, st, m.x, 160, 2.5, Math.round(m.damage * 0.2));
      st.from = st.t;
    }
    return false;
  }
  ease(st, { ...groundPose(st, false, dt), by: -20 * z, rot: 8, wing: -140, fold: 0.4 }, dt, 10);
  return st.t > st.from + 0.7;
}

/** 불비: 높이 떠서 플레이어 주변 여러 곳에 불덩이를 뱉는다. */
function rain(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const p = b.player;
  const n = m.phase2 ? 7 : 5;
  const gap = 0.22;
  if (once(st, 0, 0)) {
    takeOff(m, st);
    wingDust(m);
    b.announce(st.cfg.el.rainName, 1);
  }
  const hoverX = Phaser.Math.Clamp(p.x - m.facing * 160, 100, b.level.width - 100);
  if (st.flying) m.body.setVelocity((hoverX - m.x) * 1.5, (FLOOR_Y - 160 - m.body.bottom) * 3);
  m.face(p.x - m.x || m.facing);
  ease(st, flyPose(st, { neck: 10, curl: 8, head: 30, jaw: st.t > 0.6 ? 30 : 6 }), dt, 9);
  for (let i = 0; i < n; i++) {
    if (!once(st, 10 + i, 0.6 + i * gap)) continue;
    const x = Phaser.Math.Clamp(p.x + (i - (n - 1) / 2) * 70 + (Math.random() - 0.5) * 30, 30, b.level.width - 30);
    const mo = st.rig.mouth();
    const ball = b.add.sprite(mo.x, mo.y, 'fireball').play('fireball').setDepth(DEPTH.projectile).setScale(1.4);
    if (st.cfg.el.field !== 'fire') ball.setTint(st.cfg.el.color);
    const delay = 0.8;
    b.addTelegraph(x - 30, FLOOR_Y - 70, 60, 70, delay, m, () => {
      b.fx.boom(x, FLOOR_Y - 16, 28, st.cfg.el.boom);
      b.fx.ring(x, FLOOR_Y, 60, st.cfg.el.color, 300);
      sfx.play('boom', 0.5);
      b.areaHit(x - 30, FLOOR_Y - 70, 60, 70, m.damage * 0.8, m, false);
      elemField(m, st, x, 50, 2, Math.round(m.damage * 0.2));
    });
    b.tweens.add({ targets: ball, x, y: FLOOR_Y - 10, duration: delay * 1000, ease: 'Quad.In', onUpdate: () => Math.random() < 0.5 && b.fx.burst(ball.x, ball.y, st.cfg.el.hi, 1, 20, 200), onComplete: () => ball.destroy() });
    sfx.play('magic', 0.4);
  }
  const end = 0.6 + n * gap + 0.9;
  if (st.t > end && st.flying) {
    // 내려앉는다.
    m.body.setVelocity(0, 300);
    if (m.body.bottom >= FLOOR_Y - 4 || m.body.blocked.down) {
      land(m, st);
      quake(m, st, m.x, 0.5);
      return true;
    }
  }
  return st.t > end + 2;
}

/** 분화 (2단계): 포효하자 둥지 곳곳에서 용암 기둥이 차례로 솟는다. */
function eruption(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const p = b.player;
  ease(st, { ...groundPose(st, false, dt), neck: -72, curl: -2, head: -26, jaw: 36, rot: -12, wing: -95, fold: 0, flap: 0.4 }, dt, 8);
  if (once(st, 0, 0.3)) {
    b.fx.flashScreen(0xff6a1a, 0.3, 300);
    b.fx.shake(1.6, 500);
    sfx.play('boom', 0.9);
    const W = b.level.width;
    const xs: number[] = [p.x];
    for (let i = 1; i < 7; i++) xs.push(Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 110 + (Math.random() - 0.5) * 30, 30, W - 30));
    xs.forEach((x, i) => elemPillar(m, st, x, m.damage * 0.8, 0.9 + i * 0.12));
  }
  return st.t > 2.4;
}

// ─── 패턴: 와이번 ───

/** 저공 활강: 날아올라 반대편 끝까지 낮게 가로지른다 (구르기로 피한다). */
function swoop(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const W = b.level.width;
  const rise = 0.6;
  const aim = m.phase2 ? 0.55 : 0.75;
  const y = FLOOR_Y - 30;
  if (once(st, 0, 0)) {
    takeOff(m, st);
    wingDust(m);
    st.tx = st.dir === 1 ? W - 60 : 60;
    // 벽에 붙어 있어 활강할 거리가 짧으면 반대쪽으로 가로지른다.
    if (Math.abs(st.tx - m.x) < 240) {
      st.dir = st.dir === 1 ? -1 : 1;
      st.tx = st.dir === 1 ? W - 60 : 60;
    }
  }
  if (st.t < rise) {
    m.body.setVelocity(-st.dir * 60, (FLOOR_Y - 160 - m.body.bottom) * 4);
    ease(st, flyPose(st), dt, 9);
    return false;
  }
  if (once(st, 1, rise)) {
    const x0 = Math.min(m.x, st.tx);
    b.addTelegraph(x0, FLOOR_Y - 70, Math.abs(st.tx - m.x), 70, aim, m, null);
    b.announce('활강! 구르기로 피하라!', 0.9);
  }
  if (st.t < rise + aim) {
    m.body.setVelocity(0, (FLOOR_Y - 150 - m.body.bottom) * 4);
    ease(st, flyPose(st, { rot: -8, fold: 0.4, flap: 0.5 }), dt, 9);
    return false;
  }
  if (st.flying) {
    m.face(st.dir);
    ease(st, flyPose(st, { rot: 14, fold: 0.15, flap: 0.2, wing: -165, neck: -2, curl: 2, head: 4, jaw: 24 }), dt, 14);
    m.body.setVelocity(st.dir * 520, (y - m.body.bottom + 30) * 6);
    if (Math.random() < 0.4) st.rig.ghost(st.cfg.el.hi, 0.3, 160);
    const pl = b.player;
    if (!st.fired.has(2) && Math.abs(pl.x - m.x) < 50 && Math.abs(pl.y - (m.body.bottom - 30)) < 50) {
      st.fired.add(2);
      b.damagePlayer(m.damage * 1.1, { x: m.x, monster: m, melee: true });
      pl.knockback(m.x, 260);
    }
    if ((st.dir === 1 && m.x >= st.tx) || (st.dir === -1 && m.x <= st.tx)) {
      land(m, st);
      m.body.setVelocity(0, 200);
      st.from = st.t;
    }
    return false;
  }
  ease(st, groundPose(st, false, dt), dt, 10);
  return st.t > st.from + 0.6;
}

/** 불덩이 세 발: 고개를 젖혔다 터지는 불덩이를 부채꼴로 뱉는다. */
function spit(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const p = b.player;
  const wind = 0.6;
  if (st.t < wind) {
    ease(st, { ...groundPose(st, false, dt), neck: -75, head: -16, jaw: 20, rot: -10 }, dt, 9);
    return false;
  }
  ease(st, { ...groundPose(st, false, dt), neck: -20, head: 18, jaw: 34, rot: 6 }, dt, 18);
  const shots = m.phase2 ? 5 : 3;
  if (once(st, 0, wind)) {
    const mo = st.rig.mouth();
    const base = Math.atan2(p.y - mo.y, p.x - mo.x);
    for (let i = 0; i < shots; i++) {
      const a = base + (i / (shots - 1) - 0.5) * 0.6;
      b.spawnEnemyBolt(mo.x, mo.y, Math.cos(a) * 200, Math.sin(a) * 200, m.damage * 0.7, m, 30);
    }
    b.fx.burst(mo.x, mo.y, st.cfg.el.hi, 10, 120, 300);
    sfx.play('magic', 0.7);
  }
  return st.t > wind + 0.6;
}

/** 내려찍기: 짧게 뛰어올라 플레이어 쪽에 내려앉으며 충격파를 낸다. */
function stomp(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  const z = st.z;
  const wind = 0.45;
  if (st.t < wind) {
    ease(st, { ...groundPose(st, false, dt), by: -22 * z, rot: 6, wing: -95, fold: 0.1 }, dt, 10);
    return false;
  }
  if (once(st, 0, wind)) {
    st.tx = Phaser.Math.Clamp(b.player.x, 80, b.level.width - 80);
    b.addTelegraph(st.tx - 60, FLOOR_Y - 30, 120, 30, 0.55, m, null);
    m.body.setVelocity((st.tx - m.x) / 0.55, -420);
    wingDust(m);
  }
  ease(st, flyPose(st, { flap: 0.7, rot: -4 }), dt, 12);
  if (st.t > wind + 0.25 && m.body.blocked.down && !st.fired.has(1)) {
    st.fired.add(1);
    m.body.setVelocityX(0);
    quake(m, st, m.x, 0.8);
    b.groundSlam(m.x, 70, m.damage * 1.1, m);
    b.addShockwave(m.x, m.damage * 0.6, m);
    st.from = st.t;
  }
  return st.fired.has(1) && st.t > st.from + 0.5;
}

/** 포효 (2단계 진입) */
function roar(m: Monster, st: DragonState, dt: number): boolean {
  const b = m.scene;
  ease(st, { ...groundPose(st, false, dt), neck: -70, curl: -2, head: -26, jaw: 38, rot: -12, wing: -95, fold: 0, flap: 0.5 }, dt, 8);
  if (once(st, 0, 0.35)) {
    b.fx.flashScreen(0xffa040, 0.35, 300);
    b.fx.shake(2, 600);
    b.fx.ring(m.x, m.y, 220, st.cfg.el.color, 600);
    sfx.play('boom', 1);
  }
  return st.t > 1.5;
}

const RUN: Record<DragonPattern, (m: Monster, st: DragonState, dt: number) => boolean> = { breath, claw, tail, dive, rain, eruption, swoop, spit, stomp, roar };

/** 이미 리그가 붙은 용이면 그 상태 (마왕이 용으로 변할 때 쓴다) */
export function hasDragonRig(m: Monster): boolean {
  return states.has(m);
}

/** 용 계열 보스: 패턴을 고르고, 리그 자세를 움직이고, 체력이 줄면 격노해 부하를 부른다. */
export function dragonBoss(cfg: DragonCfg): Behavior {
  const wyvern = cfg.wyvern;
  return (m, dt) => {
    const b = m.scene;
    const p = b.player;
    const st = states.get(m) ?? attach(m, cfg);
    st.t += dt;
    if (!m.phase2 && m.hp / m.maxHp < (cfg.enrageAt ?? 0.5) && !st.flying) {
      m.phase2 = true;
      b.announce(cfg.line, 1.8);
      cfg.summon.forEach((kind, i) => b.spawnMonster(kind, false, Phaser.Math.Clamp(m.x + (i - 1) * 140, 60, b.level.width - 60)));
      begin(m, st, 'roar');
    }
    // 불을 머금으면 몸이 달아오른다. 격노하면 늘 조금 붉다.
    st.rig.glow(st.cfg.el.color, Math.max(st.heat * 0.6, m.phase2 ? 0.15 : 0));

    if (!st.pattern) {
      const { dx, dist } = m.toPlayer();
      m.attackTimer -= dt;
      const moving = dist > (wyvern ? 120 : 150);
      m.walk(moving ? Math.sign(dx) : 0, wyvern ? 0.8 : 0.5);
      if (!moving) m.face(dx);
      ease(st, groundPose(st, moving, dt), dt, 10);
      if (m.attackTimer <= 0 && m.body.blocked.down) {
        const behind = Math.sign(dx) !== m.facing;
        begin(m, st, choose(m, st, dist, behind));
      }
      return;
    }
    if (RUN[st.pattern](m, st, dt)) {
      if (st.flying) land(m, st);
      finish(m, st);
    }
    void p;
  };
}


import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { DEPTH } from '../fx';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { DARKLORD_GROGGY, DARKLORD_IDLE, DARKLORD_RIG, makeDarkLordArt } from './darklordArt';
import { lerpPose, Rig, type Pose } from './rig';

/**
 * 암흑의 군주 (마법 군단장). 초승달 지팡이로 다크문 마법을 쓴다.
 * 일반 패턴: 검은 달 구슬, 바닥을 타는 초승달 참격, 월식 기둥, 순간이동 폭발, (2단계) 달 낙하.
 * 체력 75% · 50% · 25%를 지날 때마다 맵 중앙으로 날아가 20회 보호막을 두른다.
 * - 제한 시간 안에 20번 때려 깨면: 군주가 떨어져 그로기, 받는 피해 200%.
 * - 못 깨면: 왼쪽·오른쪽 절반 중 한쪽을 예고하고 HP 100% 심판을 내린다. 반대편으로 피해야 한다.
 */

const VOID = 0x2a0a4a;
const DARK = 0x6a1aa8;
const PURPLE = 0xb04aff;
const MOON = 0xe0d0ff;
const ORB_KEY = 'darklord-orb';

/** 보호막을 두르는 체력 비율 */
const SHIELD_AT = [0.75, 0.5, 0.25];
const SHIELD_HITS = 20;
/** [초안] 보호막을 깨야 하는 시간 */
const SHIELD_TIME = 9;
/** [초안] 심판 예고 시간 (기믹 완화를 고르면 +1초) */
const JUDGE_WARN = 2.2;
/** 그로기 시간 (기믹 완화를 고르면 1.5배) */
const GROGGY = 6;
/** 보호막을 두르는 동안 떠 있는 높이 */
const FLOAT = 70;

type Pattern = 'orbs' | 'crescent' | 'eclipse' | 'blink' | 'moonfall';
type Mode = 'fight' | 'rise' | 'shield' | 'judge';

interface LordState {
  mode: Mode;
  pattern: Pattern | null;
  t: number;
  fired: Set<number>;
  last: Pattern | null;
  rig: Rig;
  /** 지금 자세 (목표 자세로 부드럽게 다가간다) */
  cur: Pose;
  /** 걷기 주기 */
  walk: number;
  wasStunned: boolean;
  /** 지팡이 머리의 빛 */
  glow: Phaser.GameObjects.Image;
  shield: Phaser.GameObjects.Arc;
  shieldRing: Phaser.GameObjects.Arc;
  /** 다음 보호막 (SHIELD_AT 인덱스) */
  next: number;
  /** 순간이동·중앙 이동의 출발점과 도착점 */
  from: number;
  to: number;
  /** 심판을 내릴 쪽 */
  side: -1 | 1;
}

const states = new WeakMap<Monster, LordState>();

/** 검은 달 구슬 그림 */
function makeArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(ORB_KEY)) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 7.5) continue;
        // 검은 달: 가장자리는 보랏빛 테, 안쪽 위에는 희미한 초승달 빛
        const rim = Math.hypot(x - 5.5, y - 5.5) > 6.5 && x + y > 13;
        g.fillStyle = d > 6.6 ? '#130a1b' : d > 5.4 ? '#b04aff' : rim ? '#d8c8ff' : '#1a0a2a';
        g.fillRect(x, y, 1, 1);
      }
    }
    scene.textures.addCanvas(ORB_KEY, c);
  }
}

function once(st: LordState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

// ───────── 자세 (오른쪽을 볼 때, 손은 어깨 기준, 지팡이 각도는 0이 위·+가 앞) ─────────

/** 떠올라 보호막을 두를 때: 두 팔을 벌리고 발끝이 늘어진다 */
const FLOAT_POSE: Partial<Pose> = { hy: -1, lean: -4, head: -8, fFx: 3, fFy: -1, fBx: -2, fBy: 0, aFx: 7, aFy: -4, aBx: -7, aBy: -3, w: 20 };
/** 심판: 지팡이와 빈손을 하늘로 */
const JUDGE: Partial<Pose> = { hy: -1, lean: -10, head: -18, fFx: 3, fFy: -1, fBx: -2, fBy: 0, aFx: 7, aFy: -14, aBx: 4, aBy: -14, w: 6 };
/** 검은 달: 지팡이를 치켜들고 빈손을 펼친다 */
const ORBS: Partial<Pose> = { lean: -8, head: -10, aFx: 7, aFy: -11, aBx: 5, aBy: -6, w: 4 };
/** 초승달 참격: 지팡이를 뒤로 젖혔다가 → 크게 내디디며 앞으로 휘두른다 */
const CRESCENT_UP: Partial<Pose> = { hy: 3, lean: -12, head: -6, fFx: 7, fBx: -7, aFx: -7, aFy: -2, aBx: 3, aBy: 5, w: -75 };
const CRESCENT_SWING: Partial<Pose> = { hy: 4, lean: 16, head: 4, fFx: 9, fBx: -8, aFx: 9, aFy: 3, aBx: -6, aBy: 4, w: 105 };
/** 월식: 두 팔을 하늘로 */
const ECLIPSE: Partial<Pose> = { lean: -12, head: -20, aFx: 7, aFy: -14, aBx: 4, aBy: -13, w: 6 };
/** 순간이동 뒤: 빈손을 앞으로 뻗어 터뜨린다 */
const BLINK_CAST: Partial<Pose> = { hy: 2, lean: 10, head: 2, fFx: 7, fBx: -6, aFx: 3, aFy: 4, aBx: 11, aBy: -3, w: 25 };
/** 달 낙하: 지팡이로 하늘을 가리킨다 */
const MOONFALL: Partial<Pose> = { lean: -14, head: -22, aFx: 7, aFy: -14, aBx: 3, aBy: -13, w: 2 };

/** 지팡이 머리 (화면 좌표) */
function head(st: LordState): { x: number; y: number } {
  return st.rig.tip();
}

/** 목표 자세로 부드럽게 다가간다. */
function pose(st: LordState, target: Partial<Pose>, dt: number, speed = 10): void {
  st.cur = lerpPose(st.cur, { ...DARKLORD_IDLE, ...target }, Math.min(1, dt * speed));
}

function syncStaff(_m: Monster, st: LordState): void {
  st.rig.pose = st.cur;
}

/** 검은 달 구슬: 머리 위에 떠올랐다가 정한 자리로 날아가 터진다. */
function moonOrb(m: Monster, x: number, y: number, tx: number, ty: number, delay: number): void {
  const b = m.scene;
  const orb = b.add.image(x, y, ORB_KEY).setScale(0).setDepth(DEPTH.projectile);
  const halo = b.add.circle(x, y, 12, PURPLE, 0.35).setDepth(DEPTH.projectile - 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0);
  b.tweens.add({ targets: [orb, halo], scale: { from: 0, to: 2 }, duration: 260 });
  let hit = false;
  const boom = (): void => {
    if (hit) return;
    hit = true;
    b.fx.boom(orb.x, orb.y, 26, 'arcane');
    b.fx.burst(orb.x, orb.y, PURPLE, 10, 120, 360);
    sfx.play('magic', 0.5);
    b.areaHit(orb.x - 28, orb.y - 28, 56, 56, m.damage * 0.7, m, false);
    orb.destroy();
    halo.destroy();
  };
  b.tweens.add({
    targets: [orb, halo],
    x: tx,
    y: ty,
    delay,
    duration: 650,
    ease: 'Quad.easeIn',
    onUpdate: () => {
      if (hit) return;
      if (Math.random() < 0.5) b.fx.burst(orb.x, orb.y, DARK, 1, 20, 280);
      const pb = b.player.body;
      if (orb.x > pb.x - 8 && orb.x < pb.right + 8 && orb.y > pb.y - 8 && orb.y < pb.bottom + 8) boom();
    },
    onComplete: boom,
  });
  b.events.once('shutdown', () => {
    orb.destroy();
    halo.destroy();
  });
}

/** 초승달 참격: 바닥을 타고 미끄러진다. 점프하면 넘을 수 있다. */
function crescent(m: Monster, x: number, dir: 1 | -1): void {
  const b = m.scene;
  const W = b.level.width;
  const img = b.add.image(x, FLOOR_Y - 22, ORB_KEY).setVisible(false);
  // 나아가는 쪽으로 볼록한 초승달 호 세 겹 (검보라 바깥 → 보라 → 밝은 안쪽)
  const arc = b.add.graphics().setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
  const mid = dir === 1 ? 0 : Math.PI;
  const draw = (): void => {
    arc.clear();
    const cx = img.x - dir * 14;
    const cy = FLOOR_Y - 22;
    arc.lineStyle(10, DARK, 0.7).beginPath().arc(cx, cy, 26, mid - 1.15, mid + 1.15, false).strokePath();
    arc.lineStyle(5, PURPLE, 0.95).beginPath().arc(cx, cy, 26, mid - 1.0, mid + 1.0, false).strokePath();
    arc.lineStyle(2, MOON, 1).beginPath().arc(cx, cy, 26, mid - 0.8, mid + 0.8, false).strokePath();
  };
  let hit = false;
  b.tweens.add({
    targets: img,
    x: dir === 1 ? W + 60 : -60,
    duration: (Math.abs((dir === 1 ? W + 60 : -60) - x) / 340) * 1000,
    onUpdate: () => {
      draw();
      if (Math.random() < 0.6) b.fx.burst(img.x, FLOOR_Y - 4, PURPLE, 1, 40, 260);
      if (hit) return;
      const pb = b.player.body;
      if (Math.abs(img.x - b.player.x) < 22 && pb.bottom > FLOOR_Y - 44) {
        hit = true;
        b.damagePlayer(m.damage * 0.9, { x: img.x - dir * 40, monster: m, melee: false });
        b.fx.burst(b.player.x, b.player.y, PURPLE, 10, 120, 300);
      }
    },
    onComplete: () => {
      img.destroy();
      arc.destroy();
    },
  });
  b.events.once('shutdown', () => arc.destroy());
}

/** 월식 기둥: 예고한 자리에 검은 빛 기둥이 솟는다. */
function eclipseColumn(m: Monster, x: number, delay: number): void {
  const b = m.scene;
  b.addTelegraph(x - 30, 0, 60, FLOOR_Y, delay, m, () => {
    b.fx.pillar(x, FLOOR_Y, PURPLE, 260, 650);
    b.fx.pillar(x, FLOOR_Y, MOON, 200, 380);
    b.fx.burst(x, FLOOR_Y - 6, PURPLE, 12, 140, 420);
    b.fx.ring(x, FLOOR_Y, 40, DARK, 300);
    b.fx.shake(0.4, 80);
    b.areaHit(x - 30, FLOOR_Y - 260, 60, 260, m.damage * 0.85, m, false);
  }, PURPLE);
}

function begin(m: Monster, st: LordState, pattern: Pattern): void {
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  m.body.setVelocityX(0);
  m.play(m.look.idle);
  const b = m.scene;
  if (pattern === 'blink') {
    // 플레이어 뒤로 순간이동한다 (벽에 막히면 앞쪽).
    const p = b.player;
    const W = b.level.width;
    const behind = p.x + Math.sign(p.x - m.x || 1) * 90;
    st.from = m.x;
    st.to = behind > 50 && behind < W - 50 ? behind : Phaser.Math.Clamp(p.x - Math.sign(p.x - m.x || 1) * 90, 50, W - 50);
  }
}

function choose(m: Monster, st: LordState): Pattern {
  const pool: Pattern[] = ['orbs', 'crescent', 'eclipse', 'blink', 'orbs'];
  if (m.phase2) pool.push('moonfall', 'eclipse');
  const left = pool.filter((x) => x !== st.last);
  return left[Math.floor(Math.random() * left.length)];
}

/** 체력이 보호막 기준을 지났다: 중앙으로 떠오른다. */
function startShield(m: Monster, st: LordState): void {
  const b = m.scene;
  st.mode = 'rise';
  st.pattern = null;
  st.t = 0;
  st.fired.clear();
  st.from = m.x;
  st.to = b.level.width / 2;
  m.hitShield = -1;
  // 순간이동 도중이었으면 다시 보이게 한다.
  m.sprite.setAlpha(1);
  b.fx.smoke(m.x, m.y, 1.4, 0x2a1a3a);
  b.fx.burst(m.x, m.y, PURPLE, 18, 160, 500);
  b.announce('암흑의 군주가 보호막을 두른다!', 1.4);
  sfx.play('magic', 0.8);
}

/** 보호막이 깨졌다: 땅에 떨어져 그로기, 받는 피해 200% */
function breakShield(m: Monster, st: LordState): void {
  const b = m.scene;
  st.mode = 'fight';
  st.shield.setVisible(false);
  st.shieldRing.setVisible(false);
  b.legionNote = '';
  m.hitShield = 0;
  const time = GROGGY * (b.legion?.mods.includes('gimmick') ? 1.5 : 1);
  m.body.reset(m.x, FLOOR_Y - m.body.height / 2);
  m.body.setVelocity(0, 0);
  m.stun = time;
  m.vuln = Math.max(m.vuln, 1);
  m.vulnTime = time;
  b.legionGroggy = time;
  st.cur = { ...DARKLORD_GROGGY };
  syncStaff(m, st);
  b.announce('보호막 파괴! 군주가 무너졌다', 1.4);
  sfx.play('boom', 0.9);
  b.fx.stop(0.15);
  b.fx.flashScreen(MOON, 0.45, 300);
  b.fx.shake(1.4, 260);
  for (let i = 0; i < 3; i++) b.time.delayedCall(i * 70, () => b.fx.ring(m.x, m.y - 6, 60 + i * 40, i === 1 ? MOON : PURPLE, 380));
  b.fx.burst(m.x, m.y - 6, MOON, 30, 260, 600);
  b.fx.burst(m.x, FLOOR_Y - 4, 0x6a5a7a, 14, 120, 500);
}

/** 시간 안에 못 깼다: 한쪽 절반에 심판을 예고한다. */
function startJudge(m: Monster, st: LordState): void {
  const b = m.scene;
  const W = b.level.width;
  st.mode = 'judge';
  st.t = 0;
  st.fired.clear();
  m.hitShield = -1;
  // 플레이어가 있는 쪽을 조금 더 자주 고른다.
  const pSide: -1 | 1 = b.player.x < W / 2 ? -1 : 1;
  st.side = Math.random() < 0.65 ? pSide : ((-pSide) as -1 | 1);
  const warn = JUDGE_WARN + b.legionWarnBonus();
  const x0 = st.side === -1 ? 0 : W / 2;
  b.announce(st.side === -1 ? '왼쪽에 암흑의 심판이 내린다! 오른쪽으로 피하라' : '오른쪽에 암흑의 심판이 내린다! 왼쪽으로 피하라', warn);
  b.fx.dim(VOID, 0.35, warn * 1000);
  b.addTelegraph(x0, 0, W / 2, FLOOR_Y, warn, m, () => judge(m, st), PURPLE);
  sfx.play('magic', 1);
}

/** 심판: 예고한 절반 전체에 HP 100% 피해 (구르기 무적으로도 못 피한다) */
function judge(m: Monster, st: LordState): void {
  const b = m.scene;
  const W = b.level.width;
  const x0 = st.side === -1 ? 0 : W / 2;
  for (let i = 0; i < 7; i++) {
    const x = x0 + (i + 0.5) * (W / 2 / 7);
    b.time.delayedCall(i * 35, () => {
      b.fx.pillar(x, FLOOR_Y, PURPLE, 360, 800);
      b.fx.burst(x, FLOOR_Y - 8, MOON, 8, 160, 500);
    });
  }
  b.fx.flashScreen(DARK, 0.6, 500);
  b.fx.shake(2, 400);
  sfx.play('boom', 1);
  const p = b.player;
  if (p.x >= x0 && p.x <= x0 + W / 2) b.executePlayer('암흑의 심판', PURPLE);
  // 보호막을 거두고 내려온다.
  st.mode = 'fight';
  st.shield.setVisible(false);
  st.shieldRing.setVisible(false);
  b.legionNote = '';
  m.hitShield = 0;
  m.body.reset(m.x, FLOOR_Y - m.body.height / 2);
  m.body.setVelocity(0, 0);
  m.attackTimer = 1.2;
}

/** 중앙에 떠서 보호막을 두르고 있는 동안 (rise · shield · judge) */
function updateShield(m: Monster, st: LordState, dt: number): void {
  const b = m.scene;
  const body = m.body;
  st.t += dt;
  const groundY = FLOOR_Y - body.height / 2;
  if (st.mode === 'rise') {
    // 0.8초 동안 중앙으로 날아오른다.
    const k = Phaser.Math.Clamp(st.t / 0.8, 0, 1);
    const e = Phaser.Math.Easing.Sine.InOut(k);
    body.reset(st.from + (st.to - st.from) * e, groundY - FLOAT * e);
    m.face(b.player.x - m.x || 1);
    pose(st, FLOAT_POSE, dt, 6);
    if (Math.random() < 0.7) b.fx.burst(m.x, m.y + 20, DARK, 1, 30, 300);
    if (k >= 1) {
      st.mode = 'shield';
      st.t = 0;
      m.hitShield = SHIELD_HITS;
      st.shield.setVisible(true).setScale(0.2).setAlpha(0.3);
      st.shieldRing.setVisible(true).setScale(0.2);
      b.tweens.add({ targets: [st.shield, st.shieldRing], scale: 1, duration: 300, ease: 'Back.easeOut' });
      b.fx.ring(m.x, m.y - 6, 90, PURPLE, 400);
      b.fx.flashScreen(PURPLE, 0.25, 220);
      b.announce(`보호막을 ${SHIELD_HITS}번 때려 깨라!`, 1.6);
      sfx.play('magic', 1);
    }
    return;
  }
  // 떠 있는 채로 천천히 흔들린다.
  body.reset(st.to, groundY - FLOAT + Math.sin(st.t * 3) * 4);
  body.setVelocity(0, 0);
  m.face(b.player.x - m.x || 1);
  pose(st, { ...FLOAT_POSE, aFy: -4 - Math.sin(st.t * 4) * 1.5, aBy: -3 - Math.sin(st.t * 4 + 1) * 1.5 }, dt, 8);
  st.shieldRing.rotation += dt * 1.5;
  if (Math.random() < 0.5) b.fx.burst(m.x + (Math.random() - 0.5) * 120, m.y + (Math.random() - 0.5) * 120, PURPLE, 1, 20, 400);

  if (st.mode === 'shield') {
    const time = SHIELD_TIME - st.t;
    const left = Math.max(0, m.hitShield);
    // 깎인 만큼 보호막이 옅어지고 금이 간다.
    st.shield.setAlpha(0.18 + 0.22 * (left / SHIELD_HITS));
    st.shieldRing.setStrokeStyle(3, left <= 5 ? MOON : PURPLE, 0.9);
    b.legionNote = `보호막 ${left}/${SHIELD_HITS} · ${Math.max(0, time).toFixed(1)}초`;
    if (m.hitShield === 0) {
      breakShield(m, st);
      return;
    }
    if (time <= 0) startJudge(m, st);
    return;
  }
  // judge: 심판을 기다린다 (telegraph가 judge()를 부른다).
  b.legionNote = '암흑의 심판! 반대편으로 피하라';
  pose(st, JUDGE, dt, 8);
  if (Math.random() < 0.8) b.fx.burst(head(st).x, head(st).y, PURPLE, 1, 50, 300);
}

export const darkLord: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  let st = states.get(m);
  if (!st) {
    makeArt(b);
    makeDarkLordArt(b);
    const rig = new Rig(b, DARKLORD_RIG, DARKLORD_IDLE);
    rig.glowColor = PURPLE;
    m.sprite.setVisible(false);
    const glow = b.add.image(m.x, m.y, ORB_KEY).setScale(1.6).setDepth(DEPTH.monster + 2).setTint(PURPLE).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const shield = b.add.circle(m.x, m.y, 62, PURPLE, 0.35).setDepth(DEPTH.monster + 3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const shieldRing = b.add.circle(m.x, m.y, 66).setStrokeStyle(3, PURPLE, 0.9).setDepth(DEPTH.monster + 3).setVisible(false);
    const s: LordState = {
      mode: 'fight',
      pattern: null,
      t: 0,
      fired: new Set(),
      last: null,
      rig,
      cur: { ...DARKLORD_IDLE },
      walk: 0,
      wasStunned: false,
      glow,
      shield,
      shieldRing,
      next: 0,
      from: 0,
      to: 0,
      side: 1,
    };
    st = s;
    states.set(m, s);
    // 리그는 본체 발밑을 따라간다. 그로기 동안에는 무릎을 꿇고 무너진다. 지팡이 빛은 초승달을 따라간다.
    const follow = (): void => {
      const step = b.fx.hitstop > 0 ? 0 : Math.min(0.05, b.game.loop.delta / 1000);
      if (m.alive && m.stun > 0) {
        s.cur = lerpPose(s.cur, DARKLORD_GROGGY, Math.min(1, step * 8));
        s.rig.pose = s.cur;
        s.wasStunned = true;
      }
      s.rig.mirror(m.sprite);
      s.rig.update(m.x, m.body.bottom + 1, m.facing, step);
      const h = s.rig.tip(0.75);
      glow.setPosition(h.x, h.y);
      shield.setPosition(m.x, m.y - 6);
      shieldRing.setPosition(m.x, m.y - 6);
      if (!m.alive) {
        glow.setAlpha(0);
        shield.setVisible(false);
        shieldRing.setVisible(false);
        b.legionNote = '';
      }
    };
    b.events.on('postupdate', follow);
    b.events.once('shutdown', () => {
      b.events.off('postupdate', follow);
      s.rig.destroy();
      glow.destroy();
      shield.destroy();
      shieldRing.destroy();
    });
    m.attackTimer = 1.4;
    // 개발용: 콘솔에서 패턴을 바로 시켜 본다
    if (import.meta.env.DEV) (m as unknown as { force: (p: Pattern) => void }).force = (pat) => begin(m, s, pat);
  }
  if (st.wasStunned) st.wasStunned = false;

  // 보호막 기준을 지났나 (한 번에 여러 기준을 넘어도 한 번만 두른다)
  if (st.mode === 'fight' && st.next < SHIELD_AT.length && m.hp / m.maxHp < SHIELD_AT[st.next]) {
    while (st.next < SHIELD_AT.length && m.hp / m.maxHp < SHIELD_AT[st.next]) st.next++;
    startShield(m, st);
  }
  if (!m.phase2 && m.hp / m.maxHp < 0.5) {
    m.phase2 = true;
    b.fx.flashScreen(VOID, 0.3, 300);
  }
  if (st.mode !== 'fight') {
    updateShield(m, st, dt);
    st.glow.setAlpha(0.6 + 0.3 * Math.sin(st.t * 10));
    syncStaff(m, st);
    return;
  }

  const pace = b.legionPace(m) * (m.phase2 ? 0.85 : 1);
  const body = m.body;
  let done = false;

  if (!st.pattern) {
    // 천천히 거리를 맞추며 플레이어를 노려본다.
    const dx = p.x - m.x;
    const want = Math.abs(dx) < 160 ? -Math.sign(dx) : Math.abs(dx) > 300 ? Math.sign(dx) : 0;
    const W = b.level.width;
    const blocked = (want < 0 && m.x < 70) || (want > 0 && m.x > W - 70);
    body.setVelocityX(blocked ? 0 : want * m.speed * 0.5);
    m.face(dx || 1);
    const moving = want !== 0 && !blocked;
    if (moving) {
      // 로브 자락 아래로 발을 옮긴다 (뒷걸음질이면 거꾸로).
      st.walk += dt * 6 * want * (dx >= 0 ? 1 : -1);
      const sn = Math.sin(st.walk);
      const c = Math.cos(st.walk);
      pose(st, { fFx: 1 + sn * 5, fFy: -Math.max(0, c) * 2.5, fBx: -1 - sn * 5, fBy: -Math.max(0, -c) * 2.5, hy: 1.5 - Math.abs(c) * 0.8 }, dt, 14);
    } else pose(st, { hy: 1 + Math.sin(b.time.now * 0.002) * 0.4 }, dt, 6);
    st.glow.setAlpha(0.25 + 0.1 * Math.sin(b.time.now / 200));
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) begin(m, st, choose(m, st));
    syncStaff(m, st);
    return;
  }

  st.t += dt / pace;
  const t = st.t;
  switch (st.pattern) {
    case 'orbs': {
      // 지팡이를 치켜들어 검은 달을 띄운다 → 플레이어가 있던 자리로 차례로 날린다.
      body.setVelocityX(0);
      m.face(p.x - m.x || 1);
      pose(st, ORBS, dt, 8);
      st.glow.setAlpha(Math.min(1, t * 2));
      const n = m.phase2 ? 5 : 3;
      if (once(st, 0, 0.55)) {
        const h = head(st);
        for (let i = 0; i < n; i++) {
          const ox = h.x + (i - (n - 1) / 2) * 34;
          const oy = h.y - 30 + Math.abs(i - (n - 1) / 2) * 8;
          moonOrb(m, ox, oy, p.x + (i - (n - 1) / 2) * 30, p.y - 6, 350 + i * 180 * pace);
        }
        b.fx.ring(h.x, h.y, 30, PURPLE, 300);
        sfx.play('magic', 0.7);
      }
      if (t > 0.55 + 0.35 + n * 0.18 + 0.4) done = true;
      break;
    }
    case 'crescent': {
      // 지팡이를 뒤로 젖혔다가 크게 휘둘러 초승달 참격을 날린다 (2단계는 양쪽).
      body.setVelocityX(0);
      if (t < 0.6) {
        m.face(p.x - m.x || 1);
        pose(st, CRESCENT_UP, dt, 7);
        if (Math.random() < 0.5) b.fx.burst(head(st).x, head(st).y, PURPLE, 1, 30, 260);
      } else pose(st, CRESCENT_SWING, dt, 30);
      if (once(st, 0, 0.6)) {
        b.fx.bigSlash(m.x - m.facing * 20, m.y - 60, m.x + m.facing * 50, FLOOR_Y - 4, PURPLE, 10, 300);
        crescent(m, m.x + m.facing * 40, m.facing);
        if (m.phase2) crescent(m, m.x - m.facing * 40, (-m.facing) as 1 | -1);
        b.fx.shake(0.6, 120);
        sfx.play('slash', 0.8);
      }
      if (t > 1.15) done = true;
      break;
    }
    case 'eclipse': {
      // 지팡이를 하늘로 → 화면이 어두워지며 월식 기둥이 차례로 솟는다.
      body.setVelocityX(0);
      pose(st, ECLIPSE, dt, 8);
      st.glow.setAlpha(0.7 + 0.3 * Math.sin(t * 20));
      if (once(st, 0, 0.4)) {
        const W = b.level.width;
        const n = m.phase2 ? 6 : 4;
        const delay = 1.0 * pace + b.legionWarnBonus();
        const xs = [p.x];
        for (let i = 1; i < n; i++) xs.push(Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 120, 40, W - 40));
        xs.forEach((x, i) => eclipseColumn(m, x, delay + i * 0.12));
        b.fx.dim(VOID, 0.25, (delay + 0.8) * 1000);
        b.fx.pillar(head(st).x, head(st).y + 10, PURPLE, 160, 500);
        sfx.play('magic', 0.9);
      }
      if (t > 1.4) done = true;
      break;
    }
    case 'blink': {
      // 검은 연기로 사라졌다가 플레이어 뒤에서 나타나 주변을 터뜨린다.
      body.setVelocityX(0);
      if (once(st, 0, 0)) {
        b.fx.smoke(m.x, m.y, 1.4, 0x2a1a3a);
        b.fx.burst(m.x, m.y, PURPLE, 14, 140, 400);
        m.sprite.setAlpha(0);
        sfx.play('magic', 0.5);
      }
      if (once(st, 1, 0.45)) {
        body.reset(st.to, FLOOR_Y - body.height / 2);
        m.face(p.x - st.to || 1);
        m.sprite.setAlpha(1);
        b.fx.smoke(st.to, m.y, 1.4, 0x2a1a3a);
        b.fx.ring(st.to, m.y, 40, PURPLE, 300);
        b.addTelegraph(st.to - 95, FLOOR_Y - 130, 190, 130, 0.65 * pace + b.legionWarnBonus() * 0.5, m, () => {
          b.fx.boom(m.x, m.y, 60, 'arcane');
          b.fx.ring(m.x, m.y, 95, PURPLE, 400);
          b.fx.burst(m.x, m.y, MOON, 20, 220, 500);
          b.fx.shake(0.9, 160);
          sfx.play('boom', 0.7);
          b.areaHit(m.x - 95, FLOOR_Y - 130, 190, 130, m.damage * 1.1, m, false);
        }, PURPLE);
      }
      if (t > 0.45) pose(st, BLINK_CAST, dt, 10);
      if (t > 1.6) done = true;
      break;
    }
    case 'moonfall': {
      // (2단계) 거대한 검은 달이 플레이어 위로 떨어진다.
      body.setVelocityX(0);
      pose(st, MOONFALL, dt, 8);
      if (once(st, 0, 0.3)) {
        const x = p.x;
        const W = b.level.width;
        const delay = 1.4 * pace + b.legionWarnBonus();
        const moon = b.add.image(x, -60, ORB_KEY).setScale(7).setDepth(DEPTH.projectile);
        const halo = b.add.circle(x, -60, 64, PURPLE, 0.3).setDepth(DEPTH.projectile - 1).setBlendMode(Phaser.BlendModes.ADD);
        b.tweens.add({ targets: [moon, halo], y: FLOOR_Y - 50, duration: delay * 1000, ease: 'Quad.easeIn' });
        b.addTelegraph(Phaser.Math.Clamp(x - 110, 0, W - 220), 0, 220, FLOOR_Y, delay, m, () => {
          b.fx.boom(x, FLOOR_Y - 30, 90, 'arcane');
          b.fx.flashScreen(MOON, 0.4, 260);
          b.fx.shake(1.6, 300);
          b.fx.burst(x, FLOOR_Y - 10, 0x6a5a7a, 24, 220, 600);
          for (const d of [-1, 1]) b.fx.ring(x + d * 40, FLOOR_Y, 120, PURPLE, 420);
          sfx.play('boom', 1);
          b.areaHit(Phaser.Math.Clamp(x - 110, 0, W - 220), FLOOR_Y - 200, 220, 200, m.damage * 2, m, false);
        }, PURPLE);
        b.time.delayedCall(delay * 1000 + 30, () => {
          moon.destroy();
          halo.destroy();
        });
        b.announce('검은 달이 떨어진다!', 1);
      }
      if (t > 1.2) done = true;
      break;
    }
  }

  if (done) {
    st.last = st.pattern;
    st.pattern = null;
    m.attackTimer = (0.7 + Math.random() * 0.6) * pace;
  }
  syncStaff(m, st);
};

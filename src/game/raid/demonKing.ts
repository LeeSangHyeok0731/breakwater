import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { crescent, eclipseColumn, makeOrbArt, moonOrb } from '../legion/darklord';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { RAID_FLOAT_Y } from './raidFight';

/**
 * 종언의 마왕 아스타로트 — 임시 행동 (PR 1).
 * 진홍빛으로 다시 칠한 악마 그림에 암흑의 군주의 구슬·초승달·기둥 패턴을 빌려 쓴다. PR 2에서 전용 리그와 패턴으로 바뀐다.
 * 봉인 해제 기믹 동안(RaidFight.mode가 fight가 아닐 때)에는 맵 가운데 높이 떠 있는다.
 */

type Pattern = 'orbs' | 'crescent' | 'eclipse' | 'slam';

interface KingState {
  pattern: Pattern | null;
  t: number;
  fired: Set<number>;
  last: Pattern | null;
  /** 떠오를 때 출발점 */
  fromX: number;
  fromY: number;
  floating: boolean;
}

const states = new WeakMap<Monster, KingState>();

function once(st: KingState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

function choose(m: Monster, st: KingState): Pattern {
  const pool: Pattern[] = ['orbs', 'crescent', 'eclipse', 'slam'];
  if (m.scene.raid?.enraged) pool.push('eclipse', 'crescent');
  const left = pool.filter((x) => x !== st.last);
  return left[Math.floor(Math.random() * left.length)];
}

export const demonKingRaid: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  const raid = b.raid;
  let st = states.get(m);
  if (!st) {
    makeOrbArt(b);
    st = { pattern: null, t: 0, fired: new Set(), last: null, fromX: 0, fromY: 0, floating: false };
    states.set(m, st);
    m.attackTimer = 1.6;
    if (import.meta.env.DEV) (m as unknown as { force: (p: Pattern) => void }).force = (pat) => begin(m, st!, pat);
  }
  const body = m.body;

  // 봉인 해제 기믹 동안: 가운데로 떠올라 머문다.
  if (raid && raid.mode !== 'fight' && raid.mode !== 'intro') {
    if (!st.floating) {
      st.floating = true;
      st.pattern = null;
      st.t = 0;
      st.fromX = m.x;
      st.fromY = m.y;
      body.setAllowGravity(false);
    }
    st.t += dt;
    const k = Phaser.Math.Clamp(st.t / 0.8, 0, 1);
    const e = Phaser.Math.Easing.Sine.InOut(k);
    const tx = b.level.width / 2;
    const ty = RAID_FLOAT_Y + Math.sin(b.time.now / 300) * 4 * k;
    body.reset(st.fromX + (tx - st.fromX) * e, st.fromY + (ty - st.fromY) * e);
    body.setVelocity(0, 0);
    m.face(p.x - m.x || 1);
    m.play(m.look.idle ?? m.look.walk);
    if (Math.random() < 0.6) b.fx.burst(m.x + (Math.random() - 0.5) * 80, m.y + (Math.random() - 0.5) * 100, 0xd8203a, 1, 30, 400);
    return;
  }
  if (st.floating) {
    st.floating = false;
    body.setAllowGravity(true);
    st.t = 0;
  }
  if (m.stun > 0) {
    body.setVelocityX(0);
    return;
  }
  const pace = b.legionPace(m);

  if (!st.pattern) {
    // 천천히 다가와 거리를 맞춘다.
    const dx = p.x - m.x;
    const want = Math.abs(dx) < 120 ? 0 : Math.sign(dx);
    body.setVelocityX(want * m.speed * 0.6);
    m.face(dx || 1);
    m.play(m.look.walk);
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) begin(m, st, choose(m, st));
    return;
  }

  st.t += dt / pace;
  const t = st.t;
  let done = false;
  body.setVelocityX(0);
  switch (st.pattern) {
    case 'orbs': {
      // 붉은 기운을 모았다가 구슬 다섯 개를 차례로 날린다.
      m.face(p.x - m.x || 1);
      if (once(st, 0, 0.6)) {
        for (let i = 0; i < 5; i++) moonOrb(m, m.x + (i - 2) * 30, m.body.top - 20 - Math.abs(i - 2) * 8, p.x + (i - 2) * 34, p.y - 6, 300 + i * 160 * pace);
        sfx.play('magic', 0.8);
      }
      if (t < 0.6 && Math.random() < 0.6) b.fx.burst(m.x, m.body.top, 0xd8203a, 1, 40, 300);
      if (t > 1.9) done = true;
      break;
    }
    case 'crescent': {
      // 양쪽으로 바닥을 타는 참격 (광폭화면 두 번).
      if (once(st, 0, 0.55)) {
        b.fx.bigSlash(m.x - m.facing * 30, m.y - 60, m.x + m.facing * 60, FLOOR_Y - 4, 0xd8203a, 12, 300);
        crescent(m, m.x + 40, 1);
        crescent(m, m.x - 40, -1);
        b.fx.shake(0.8, 140);
        sfx.play('slash', 0.9);
      }
      if (b.raid?.enraged && once(st, 1, 1.25)) {
        crescent(m, m.x + 40, 1);
        crescent(m, m.x - 40, -1);
        sfx.play('slash', 0.9);
      }
      if (t > (b.raid?.enraged ? 1.8 : 1.2)) done = true;
      break;
    }
    case 'eclipse': {
      // 플레이어 주변에 기둥이 차례로 솟는다.
      if (once(st, 0, 0.4)) {
        const W = b.level.width;
        const n = b.raid?.enraged ? 7 : 5;
        const xs = [p.x];
        for (let i = 1; i < n; i++) xs.push(Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 110, 40, W - 40));
        xs.forEach((x, i) => eclipseColumn(m, x, 0.9 * pace + i * 0.1));
        b.fx.dim(0x2a0610, 0.25, 1700);
        sfx.play('magic', 0.9);
      }
      if (t > 1.5) done = true;
      break;
    }
    case 'slam': {
      // 크게 뛰어올라 플레이어 쪽에 내려찍는다.
      if (once(st, 0, 0)) {
        m.play(m.look.attack ?? m.look.walk);
        const x = Phaser.Math.Clamp(p.x, 60, b.level.width - 60);
        b.addTelegraph(x - 120, FLOOR_Y - 60, 240, 60, 0.8 * pace, m, () => {
          body.reset(x, FLOOR_Y - body.height / 2);
          b.groundSlam(x, 120, m.damage * 1.3, m);
          b.fx.shake(1.6, 260);
          b.fx.flashScreen(0xd8203a, 0.25, 200);
        }, 0xd8203a);
      }
      if (t > 1.4) done = true;
      break;
    }
  }
  if (done) {
    st.last = st.pattern;
    st.pattern = null;
    m.attackTimer = (0.6 + Math.random() * 0.5) * pace;
  }
};

function begin(m: Monster, st: KingState, pattern: Pattern): void {
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  m.body.setVelocityX(0);
}

/** 봉인의 결정: 제자리에서 천천히 떠 있다. */
export const sealCrystal: Behavior = (m, dt) => {
  m.aux += dt;
  m.body.setVelocity(0, Math.sin(m.aux * 2.4) * 8);
};

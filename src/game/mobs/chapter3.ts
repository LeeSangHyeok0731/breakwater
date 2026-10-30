import type { MonsterKind } from '../../data/monsters';
import type { Behavior, Monster, Pattern } from '../monster2d';

// 챕터 3(마왕성) 몬스터의 행동

/** 발판 끝에서 멈추지 않고 플레이어 쪽으로 달린다. */
function chase(m: Monster, mul = 1): void {
  const dx = m.scene.player.x - m.x;
  if (Math.abs(dx) < 6) {
    m.body.setVelocityX(0);
    return;
  }
  m.body.setVelocityX(Math.sign(dx) * m.speed * m.slowMul * mul * (m.boostTime > 0 ? 1.3 : 1));
  m.face(dx);
}

/** 근접 물기: 가까우면 피해를 주고 짧은 할퀸 자국을 남긴다. */
function bite(m: Monster, reach: number, color: number): boolean {
  const p = m.scene.player;
  if (Math.abs(p.x - m.x) > reach + m.body.width / 2 || Math.abs(p.y - m.y) > 34) return false;
  m.scene.damagePlayer(m.damage, { x: m.x, monster: m, melee: true });
  m.scene.fx.slash(m.x + m.facing * 10, m.y, m.facing, 14, color);
  return true;
}

function resetTint(m: Monster): void {
  const tint = m.elite ? 0xffb070 : m.look.tint;
  if (tint !== undefined) m.sprite.setTint(tint);
  else m.sprite.clearTint();
}

// ─── 지옥견: 빠르게 달려들다 사거리 안이면 도약해 물어뜯는다 ───
const hellHound: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  const { dx, dy, dist } = m.toPlayer();
  m.stateTime -= dt;
  m.attackTimer -= dt;
  switch (m.state) {
    case 'move':
      if (dist < 34 && Math.abs(dy) < 40) {
        m.play('hound-idle');
        m.body.setVelocityX(0);
        if (m.attackTimer <= 0) {
          m.attackTimer = m.def.attackCd;
          bite(m, 30, 0xff6a3a);
        }
      } else {
        m.play(m.look.walk);
        chase(m);
      }
      if (m.attackTimer <= 0 && dist > 80 && dist < 180 && Math.abs(dy) < 70 && m.body.blocked.down) {
        m.state = 'windup';
        m.stateTime = 0.3;
        m.face(dx);
        m.body.setVelocityX(0);
        m.play('hound-idle');
        m.sprite.setTint(0xff7050);
      }
      break;
    case 'windup':
      m.body.setVelocityX(0);
      if (m.stateTime <= 0) {
        m.state = 'leap';
        m.stateTime = 0.9;
        m.hitDone = false;
        m.play(m.look.attack);
        m.body.setVelocity((p.x - m.x) / 0.45, -260);
        b.fx.smoke(m.x, m.body.bottom - 4, 1, 0x7a5a4a, -6);
      }
      break;
    case 'leap':
      b.fx.embers(m.x, m.y, 0xff7a3a, 1, 6, 10, 300);
      if (!m.hitDone && bite(m, 20, 0xff6a3a)) m.hitDone = true;
      if (m.stateTime < 0.7 && m.body.blocked.down) {
        m.state = 'recover';
        m.stateTime = 0.4;
        m.attackTimer = m.def.attackCd;
        m.body.setVelocityX(0);
        resetTint(m);
      }
      break;
    default:
      m.play('hound-idle');
      m.body.setVelocityX(m.body.velocity.x * 0.8);
      if (m.stateTime <= 0) m.state = 'move';
  }
};

// ─── 은빛 늑대: 아주 빠르게 무리 지어 달려들고, 울부짖으면 무리가 빨라진다 ───
const silverWolf: Behavior = (m, dt) => {
  const b = m.scene;
  const { dy, dist } = m.toPlayer();
  m.attackTimer -= dt;
  m.aux -= dt;
  m.play(m.look.walk);
  if (dist < 28 && Math.abs(dy) < 40) {
    m.body.setVelocityX(0);
    if (m.attackTimer <= 0) {
      m.attackTimer = m.def.attackCd;
      bite(m, 26, 0xdfe6f0);
    }
  } else chase(m);
  if (m.aux > 0) return;
  m.aux = 7 + Math.random() * 3;
  // 울음: 주변 늑대가 함께 빨라진다 (혼자면 울지 않는다).
  const pack = b.monsters.filter((o) => o.alive && o.def.kind === 'silver_wolf' && Math.abs(o.x - m.x) < 200);
  if (pack.length < 2) return;
  for (const o of pack) {
    o.boostTime = 5;
    b.fx.embers(o.x, o.body.bottom - 4, 0xdfe6f0, 4, 10, 30, 500);
  }
  b.fx.ring(m.x, m.body.bottom, 120, 0xdfe6f0, 400);
  b.fx.text(m.x, m.body.top - 4, '아우우!', 'quiet');
};

// ─── 화염 헬비스트: 느리게 다가와 플레이어 발밑에 불기둥을 세운다 ───
const flameBeast: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  const { dx, dy, dist } = m.toPlayer();
  m.stateTime -= dt;
  m.attackTimer -= dt;
  if (Math.random() < 0.15) b.fx.embers(m.x, m.y - 10, 0xffa040, 1, 10, 30, 500);
  switch (m.state) {
    case 'move':
      m.play(m.look.walk);
      m.walk(Math.abs(dy) < 60 ? Math.sign(dx) : 0);
      if (m.attackTimer <= 0 && dist < 320) {
        m.state = 'windup';
        m.stateTime = 1.1;
        m.face(dx);
        m.body.setVelocityX(0);
        m.play(m.look.attack);
        const xs = m.elite ? [p.x - 60, p.x, p.x + 60] : [p.x];
        xs.forEach((x, i) => b.firePillar(x, m.damage, m, 0.9 + i * 0.15, 44));
      }
      break;
    case 'windup':
      m.body.setVelocityX(0);
      if (m.stateTime <= 0) {
        m.state = 'recover';
        m.stateTime = 0.8;
        m.attackTimer = m.def.attackCd;
      }
      break;
    default:
      if (m.stateTime <= 0) m.state = 'move';
  }
};

export const CHAPTER3: Partial<Record<MonsterKind, Behavior>> = {
  hell_hound: hellHound,
  silver_wolf: silverWolf,
  flame_beast: flameBeast,
};

/** 심연의 군주가 악마 군주 행동에 더해 쓰는 패턴. 패턴 상태(stateTime)는 시작 때 0.7초(격노 0.49초)에서 줄어든다. */
export const ABYSS_PATTERNS: Partial<Record<Pattern, Behavior>> = {
  // 불기둥 줄: 군주 앞에서 플레이어 쪽으로 차례로 솟는다.
  pillars: (m) => {
    const b = m.scene;
    m.body.setVelocity(0, 0);
    m.play(m.look.attack);
    const n = m.phase2 ? 7 : 5;
    if (m.step === 0) m.targetX = Math.sign(b.player.x - m.x) || m.facing;
    if (m.step < n && m.stateTime <= -0.16 * m.step) {
      const x = m.x + m.targetX * (50 + m.step * 55);
      if (x > 20 && x < b.level.width - 20) b.firePillar(x, m.damage * 0.7, m, 0.6, 46);
      m.step++;
    }
    if (m.stateTime <= -0.16 * n - 0.9) m.endPattern();
  },
  // 운석 비: 플레이어 주변에 경고 원이 생기고 보랏빛 운석이 떨어진다.
  meteors: (m) => {
    const b = m.scene;
    m.body.setVelocity(0, 0);
    if (m.step === 0 && m.stateTime <= 0) {
      m.step = 1;
      m.play(m.look.attack);
      b.announce('운석이 떨어진다!', 1);
      const n = m.phase2 ? 6 : 4;
      const px = b.player.x;
      for (let i = 0; i < n; i++) {
        const x = Math.max(40, Math.min(b.level.width - 40, px + (i - (n - 1) / 2) * 75 + (Math.random() - 0.5) * 20));
        b.enemyMeteor(x, m.damage * 0.8, m, i * 0.22);
      }
    }
    if (m.step === 1 && m.stateTime <= -1.8) m.endPattern();
  },
};

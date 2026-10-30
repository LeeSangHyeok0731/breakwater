import type { MonsterKind } from '../../data/monsters';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { angelBoss, hover } from './chapter2';
import { CHAPTER3 } from './chapter3';

// 챕터 4(저주받은 마을) 몬스터의 행동

function resetTint(m: Monster): void {
  const tint = m.elite ? 0xffb070 : m.look.tint;
  if (tint !== undefined) m.sprite.setTint(tint);
  else m.sprite.clearTint();
}

// ─── 저주 해골: 떠다니며 저주탄을 세 갈래로 쏜다 ───
const cursedSkull: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  m.attackTimer -= dt;
  m.play(m.look.walk);
  hover(m, 150, FLOOR_Y - 104);
  if (Math.random() < 0.2) b.fx.embers(m.x, m.y + 6, 0xc060ff, 1, 6, 16, 400);
  if (m.attackTimer > 0 || Math.abs(p.x - m.x) > 340) return;
  m.attackTimer = m.def.attackCd * (0.8 + Math.random() * 0.4);
  const n = m.elite ? 5 : 3;
  const base = Math.atan2(p.y - m.y, p.x - m.x);
  for (let i = 0; i < n; i++) {
    const a = base + (i / (n - 1) - 0.5) * 0.5;
    b.spawnEnemyBolt(m.x, m.y, Math.cos(a) * 150, Math.sin(a) * 150, m.damage, m);
  }
  b.fx.burst(m.x, m.y, 0xc060ff, 6, 80, 260);
};

// ─── 그림자 망령: 사라졌다가 플레이어 등 뒤에 나타나 벤다 ───
const shade: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  m.stateTime -= dt;
  m.attackTimer -= dt;
  switch (m.state) {
    case 'move': {
      m.play(m.look.walk);
      const dx = p.x - m.x;
      m.body.setVelocityX(Math.abs(dx) > 30 ? Math.sign(dx) * m.speed * 0.6 * m.slowMul : 0);
      m.face(dx);
      if (m.attackTimer <= 0 && Math.abs(dx) < 300) {
        m.state = 'dive';
        m.stateTime = 0.4;
        m.body.setVelocityX(0);
        m.play('shade-vanish');
      }
      break;
    }
    case 'dive':
      // 사라지는 중 → 다 사라지면 몸을 화면 밖으로 빼서 맞지 않게 한다.
      if (m.stateTime <= 0) {
        m.state = 'rise';
        m.stateTime = 0.35;
        m.sprite.setVisible(false);
        m.body.setAllowGravity(false);
        m.body.setVelocity(0, 0);
        m.body.reset(m.x, -400);
      }
      break;
    case 'rise':
      if (m.stateTime <= 0) {
        // 플레이어 등 뒤에 나타난다.
        const x = Math.max(30, Math.min(b.level.width - 30, p.x - p.facing * 34));
        m.body.reset(x, p.body.bottom - 22);
        m.body.setAllowGravity(true);
        m.sprite.setVisible(true);
        m.play('shade-appear');
        m.face(p.x - x);
        b.fx.smoke(x, p.body.bottom - 10, 2, 0x2a2a3a, -8);
        m.sprite.setTint(0xff8aff);
        m.state = 'windup';
        m.stateTime = 0.38;
      }
      break;
    case 'windup':
      m.body.setVelocityX(0);
      if (m.stateTime <= 0) {
        b.fx.slash(m.x + m.facing * 10, m.y - 2, m.facing, 22, 0xb080ff, true);
        if (Math.abs(p.x - m.x) < 44 && Math.abs(p.y - m.y) < 40) b.damagePlayer(m.damage, { x: m.x, monster: m, melee: true });
        m.state = 'recover';
        m.stateTime = 0.8;
        m.attackTimer = m.def.attackCd * (0.8 + Math.random() * 0.4);
        resetTint(m);
      }
      break;
    default:
      m.play(m.look.walk);
      m.body.setVelocityX(0);
      if (m.stateTime <= 0) m.state = 'move';
  }
};

// ─── 강철 헬비스트: 스스로 보호막을 두르고, 내려찍어 충격파를 낸다 ───
const ironBeast: Behavior = (m, dt) => {
  const b = m.scene;
  const { dx, dy, dist } = m.toPlayer();
  m.stateTime -= dt;
  m.attackTimer -= dt;
  m.aux -= dt;
  if (m.aux <= 0) {
    // 무쇠 비늘을 세운다: 4초 동안 받는 피해 절반
    m.aux = 8;
    m.ward = 4;
    b.fx.ring(m.x, m.body.bottom, 60, 0xc8d0e0, 360);
    b.fx.burst(m.x, m.y, 0xdfe6f0, 10, 90, 360);
  }
  switch (m.state) {
    case 'move':
      m.play(m.look.walk);
      m.walk(Math.abs(dy) < 60 ? Math.sign(dx) : 0);
      if (m.attackTimer <= 0 && dist < 140 && Math.abs(dy) < 60) {
        m.state = 'windup';
        m.stateTime = 0.7;
        m.face(dx);
        m.body.setVelocityX(0);
        m.play(m.look.attack);
        m.sprite.setTint(0xffa0a0);
      }
      break;
    case 'windup':
      m.body.setVelocityX(0);
      if (m.stateTime <= 0) {
        const x = m.x + m.facing * 30;
        b.groundSlam(x, 70, m.damage, m);
        b.addShockwave(x, m.damage * 0.6, m);
        b.fx.boom(x, FLOOR_Y - 14, 24, 'dark');
        b.fx.shake(1, 180);
        m.state = 'recover';
        m.stateTime = 0.9;
        m.attackTimer = m.def.attackCd;
        resetTint(m);
      }
      break;
    default:
      if (m.stateTime <= 0) m.state = 'move';
  }
};

// ─── 밤의 여왕 (보스): 핏빛 깃털, 순간이동 베기, 핏빛 기둥, 그림자 망령 소환 ───
const nightQueen = angelBoss({
  featherTint: 0xff5a6a,
  beam: 0xff3a5a,
  summon: 'shade',
  phase2Line: '밤의 여왕이 핏빛 달을 부른다!',
  summonLine: '밤의 여왕이 그림자를 부른다!',
  blink: true,
});

export const CHAPTER4: Partial<Record<MonsterKind, Behavior>> = {
  cursed_skull: cursedSkull,
  shade,
  plague_wolf: CHAPTER3.silver_wolf,
  iron_beast: ironBeast,
  night_queen: nightQueen,
};
